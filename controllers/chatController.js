const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const xss = require('xss');

// ─── Helper: check if two users are mutual friends ──────────────────────────
async function areFriends(userId1, userId2) {
    const user = await User.findById(userId1).select('friends blocked_users');
    if (!user) return false;
    const isFriend = user.friends.some(f => f.toString() === userId2.toString());
    const isBlocked = user.blocked_users.some(b => b.toString() === userId2.toString());
    return isFriend && !isBlocked;
}

// ─── POST /api/chat/conversations ───────────────────────────────────────────
// Start or get existing conversation with a friend
const startConversation = async (req, res) => {
    try {
        const { participantId } = req.body;
        const userId = req.user._id;

        if (!participantId) {
            return res.status(400).json({ message: 'participantId is required' });
        }

        if (participantId === userId.toString()) {
            return res.status(400).json({ message: 'Cannot start conversation with yourself' });
        }

        // Verify mutual friendship
        const friends = await areFriends(userId, participantId);
        if (!friends) {
            return res.status(403).json({
                message: 'You must be friends to start a conversation'
            });
        }

        // Sort participant IDs to ensure consistent ordering (prevents duplicates)
        const participants = [userId.toString(), participantId].sort();

        // Find existing or create new
        let conversation = await Conversation.findOne({
            participants: { $all: participants, $size: 2 }
        }).populate('participants', 'username display_name avatar_url');

        if (!conversation) {
            conversation = await Conversation.create({ participants });
            conversation = await Conversation.findById(conversation._id)
                .populate('participants', 'username display_name avatar_url');
        }

        res.status(200).json(conversation);
    } catch (error) {
        console.error('startConversation error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── GET /api/chat/conversations ────────────────────────────────────────────
// List user's inbox sorted by most recent
const getConversations = async (req, res) => {
    try {
        const userId = req.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const conversations = await Conversation.find({
            participants: userId
        })
            .populate('participants', 'username display_name avatar_url')
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        // Decrypt lastMessage text for each conversation
        const decrypted = conversations.map(conv => {
            if (conv.lastMessage && conv.lastMessage.text) {
                conv.lastMessage.text = Message.decrypt(conv.lastMessage.text);
            }
            return conv;
        });

        // Get unread counts for each conversation
        const conversationsWithUnread = await Promise.all(
            decrypted.map(async (conv) => {
                const unreadCount = await Message.countDocuments({
                    conversationId: conv._id,
                    sender: { $ne: userId },
                    readBy: { $nin: [userId] }
                });
                return { ...conv, unreadCount };
            })
        );

        const total = await Conversation.countDocuments({ participants: userId });

        res.status(200).json({
            conversations: conversationsWithUnread,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('getConversations error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── GET /api/chat/conversations/:id/messages ───────────────────────────────
// Get messages with cursor-based pagination
const getMessages = async (req, res) => {
    try {
        const userId = req.user._id;
        const { id: conversationId } = req.params;
        const limit = parseInt(req.query.limit) || 30;
        const before = req.query.before; // cursor: message ID to load before

        // Verify user is participant
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ message: 'Conversation not found' });
        }
        if (!conversation.participants.some(p => p.toString() === userId.toString())) {
            return res.status(403).json({ message: 'Not a participant' });
        }

        // Build query with cursor
        const query = { conversationId };
        if (before) {
            const cursorMsg = await Message.findById(before).select('createdAt');
            if (cursorMsg) {
                query.createdAt = { $lt: cursorMsg.createdAt };
            }
        }

        const messages = await Message.find(query)
            .sort({ createdAt: -1 })
            .limit(limit + 1) // Fetch one extra to check for more
            .populate('sender', 'username display_name avatar_url')
            .lean();

        const hasMore = messages.length > limit;
        if (hasMore) messages.pop();

        // Decrypt messages
        const decryptedMessages = messages.map(msg => {
            msg.text = Message.decrypt(msg.text);
            return msg;
        });

        // Mark unread messages as read
        await Message.updateMany(
            {
                conversationId,
                sender: { $ne: userId },
                readBy: { $nin: [userId] }
            },
            { $addToSet: { readBy: userId } }
        );

        res.status(200).json({
            messages: decryptedMessages.reverse(), // Return in chronological order
            hasMore,
            cursor: decryptedMessages.length > 0 ? decryptedMessages[0]._id : null
        });
    } catch (error) {
        console.error('getMessages error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── POST /api/chat/conversations/:id/messages ──────────────────────────────
// Send a message
const sendMessage = async (req, res) => {
    try {
        const userId = req.user._id;
        const { id: conversationId } = req.params;
        const { text } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({ message: 'Message text is required' });
        }

        // Sanitize input
        const sanitizedText = xss(text.trim());

        // Verify user is participant
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ message: 'Conversation not found' });
        }
        if (!conversation.participants.some(p => p.toString() === userId.toString())) {
            return res.status(403).json({ message: 'Not a participant' });
        }

        // Encrypt the message text explicitly (no pre-save hook)
        const encryptedText = Message.encrypt(sanitizedText);

        // Create message with encrypted text
        const message = await Message.create({
            conversationId,
            sender: userId,
            text: encryptedText,
            readBy: [userId] // Sender has already "read" it
        });

        // Update conversation's lastMessage (also encrypted)
        await Conversation.findByIdAndUpdate(conversationId, {
            lastMessage: {
                text: encryptedText,
                sender: userId,
                createdAt: message.createdAt
            },
            updatedAt: new Date()
        });

        // Populate sender info for the response
        const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'username display_name avatar_url')
            .lean();

        populatedMessage.text = sanitizedText; // Return decrypted to sender

        // Emit via socket to recipient(s)
        const io = req.app.get('io');
        if (io) {
            const recipientIds = conversation.participants
                .filter(p => p.toString() !== userId.toString());

            recipientIds.forEach(recipientId => {
                io.to(recipientId.toString()).emit('newMessage', {
                    message: populatedMessage,
                    conversationId
                });
            });
        }

        res.status(201).json(populatedMessage);
    } catch (error) {
        console.error('sendMessage error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    startConversation,
    getConversations,
    getMessages,
    sendMessage
};
