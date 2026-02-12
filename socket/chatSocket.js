const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');

function setupChatSocket(io) {
    // Authenticate socket connections via JWT
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) {
                return next(new Error('Authentication required'));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id).select('-password');
            if (!user) {
                return next(new Error('User not found'));
            }

            socket.userId = user._id.toString();
            socket.user = user;
            next();
        } catch (err) {
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', (socket) => {
        const userId = socket.userId;
        console.log(`[Socket] User connected: ${userId}`);

        // Join user to their personal room for receiving messages
        socket.join(userId);

        // ─── Mark messages as read ──────────────────────────────────────
        socket.on('markRead', async ({ conversationId }) => {
            try {
                // Verify participant
                const conversation = await Conversation.findById(conversationId);
                if (!conversation || !conversation.participants.some(p => p.toString() === userId)) {
                    return;
                }

                const result = await Message.updateMany(
                    {
                        conversationId,
                        sender: { $ne: userId },
                        readBy: { $nin: [userId] }
                    },
                    { $addToSet: { readBy: userId } }
                );

                if (result.modifiedCount > 0) {
                    // Notify the other participant that messages were read
                    const otherParticipants = conversation.participants
                        .filter(p => p.toString() !== userId);
                    otherParticipants.forEach(pId => {
                        io.to(pId.toString()).emit('messagesRead', {
                            conversationId,
                            readBy: userId
                        });
                    });
                }
            } catch (err) {
                console.error('[Socket] markRead error:', err);
            }
        });

        // ─── Typing indicators ──────────────────────────────────────────
        socket.on('typing', async ({ conversationId }) => {
            try {
                const conversation = await Conversation.findById(conversationId);
                if (!conversation) return;
                const others = conversation.participants
                    .filter(p => p.toString() !== userId);
                others.forEach(pId => {
                    io.to(pId.toString()).emit('userTyping', {
                        conversationId,
                        userId
                    });
                });
            } catch (err) {
                console.error('[Socket] typing error:', err);
            }
        });

        socket.on('stopTyping', async ({ conversationId }) => {
            try {
                const conversation = await Conversation.findById(conversationId);
                if (!conversation) return;
                const others = conversation.participants
                    .filter(p => p.toString() !== userId);
                others.forEach(pId => {
                    io.to(pId.toString()).emit('userStopTyping', {
                        conversationId,
                        userId
                    });
                });
            } catch (err) {
                console.error('[Socket] stopTyping error:', err);
            }
        });

        // ─── Online status ──────────────────────────────────────────────
        socket.on('disconnect', () => {
            console.log(`[Socket] User disconnected: ${userId}`);
        });
    });
}

module.exports = { setupChatSocket };
