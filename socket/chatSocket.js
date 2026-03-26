const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Admin = require('../admin/models/Admin');
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

        // ─── WebRTC Signaling ───────────────────────────────────────────
        socket.on("callUser", ({ userToCall, signalData, from, name }) => {
            io.to(userToCall).emit("callUser", { signal: signalData, from, name });
        });

        socket.on("answerCall", (data) => {
            io.to(data.to).emit("callAccepted", data.signal);
        });

        socket.on("iceCandidate", ({ target, candidate }) => {
            io.to(target).emit("iceCandidate", candidate);
        });

        socket.on("endCall", ({ to }) => {
            io.to(to).emit("endCall");
        });

        // ─── Online status ──────────────────────────────────────────────
        socket.on('disconnect', () => {
            console.log(`[Socket] User disconnected: ${userId}`);
        });
    });

    // ─── Admin namespace (/admin) ─────────────────────────────────────────────
    // Separate namespace so admin JWTs (isAdmin: true) are cleanly isolated from
    // regular user sockets — no user socket can ever join an admin room.
    const adminNs = io.of('/admin');

    adminNs.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) return next(new Error('Admin authentication required'));

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (!decoded.isAdmin) return next(new Error('Admin access required'));

            // Look up admin account in Legacy Admin
            let admin = await Admin.findById(decoded.id);
            let isUnified = false;

            // If not found, check Unified User collection
            if (!admin) {
                admin = await User.findById(decoded.id);
                isUnified = true;
                
                // Unified users must have isAdmin flag
                if (admin && !admin.isAdmin) {
                    return next(new Error('User does not have admin privileges'));
                }
            }

            // Check lock/active status rules depending on model type
            if (!admin || (isUnified ? admin.isLocked : !admin.isActive)) {
                return next(new Error('Admin not found, locked, or inactive'));
            }

            socket.adminId = admin._id.toString();
            socket.admin   = admin;
            next();
        } catch (err) {
            next(new Error('Invalid admin token'));
        }
    });

    adminNs.on('connection', (socket) => {
        const adminId = socket.adminId;
        console.log(`[AdminSocket] Admin connected: ${adminId}`);

        // Each admin joins their own personal room
        socket.join(`admin:${adminId}`);

        // ─── Admin marks a conversation as read ─────────────────────────
        // Clears unreadCounts for ALL participants atomically using $set
        socket.on('adminMarkRead', async ({ conversationId }) => {
            try {
                const conversation = await Conversation.findById(conversationId);
                if (!conversation) return;

                // Build unset map — zero out every participant's unread count
                const unsetMap = {};
                conversation.participants.forEach(pId => {
                    unsetMap[`unreadCounts.${pId.toString()}`] = 0;
                });

                await Conversation.findByIdAndUpdate(conversationId, { $set: unsetMap });

                socket.emit('adminMarkReadAck', { conversationId });
            } catch (err) {
                console.error('[AdminSocket] adminMarkRead error:', err);
            }
        });

        socket.on('disconnect', () => {
            console.log(`[AdminSocket] Admin disconnected: ${adminId}`);
        });
    });
}

module.exports = { setupChatSocket };

