const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const xss = require('xss');

// ─── GET /api/admin/chat/conversations ──────────────────────────────────────
// Returns only conversations where THIS admin has sent at least one message.
// Uses Message.distinct to pre-filter conversation IDs — no full-table scan.
const getAdminConversations = async (req, res) => {
    try {
        const adminId = req.admin._id;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, parseInt(req.query.limit) || 20);
        const skip = (page - 1) * limit;

        // Find conversation IDs where this admin has sent at least one message
        const adminConvIds = await Message.distinct('conversationId', { sender: adminId });

        if (adminConvIds.length === 0) {
            return res.status(200).json({
                success: true,
                conversations: [],
                pagination: { page, limit, total: 0, pages: 0 }
            });
        }

        const conversations = await Conversation.find({ _id: { $in: adminConvIds } })
            .populate('participants', 'username display_name avatar_url')
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        // Decrypt only the lastMessage preview — one decrypt per conversation, not per message
        const results = conversations.map(conv => {
            if (conv.lastMessage && conv.lastMessage.text) {
                conv.lastMessage.text = Message.decrypt(conv.lastMessage.text);
            }
            return conv;
        });

        const total = adminConvIds.length;

        res.status(200).json({
            success: true,
            conversations: results,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (err) {
        console.error('[Admin] getAdminConversations error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ─── GET /api/admin/chat/conversations/:id/messages ──────────────────────────
// Cursor-based pagination. Decrypts only the ~30 messages on the returned page.
const getAdminMessages = async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const limit = Math.min(60, parseInt(req.query.limit) || 30);
        const before = req.query.before; // cursor: message _id
        const adminId = req.admin._id;

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ success: false, message: 'Conversation not found' });
        }

        // Build query with optional cursor
        const query = { conversationId };
        if (before) {
            const cursorMsg = await Message.findById(before).select('createdAt').lean();
            if (cursorMsg) {
                query.createdAt = { $lt: cursorMsg.createdAt };
            }
        }

        const messages = await Message.find(query)
            .sort({ createdAt: -1 })
            .limit(limit + 1)
            .populate('sender', 'username display_name avatar_url')
            .lean();

        const hasMore = messages.length > limit;
        if (hasMore) messages.pop();

        // Lazy decryption — only the page returned, not the full thread
        const decrypted = messages.map(msg => {
            msg.text = Message.decrypt(msg.text);
            return msg;
        });

        // Zero out admin's unread count in DB every time messages are fetched
        // (i.e. every time the conversation is opened). More reliable than socket-based
        // adminMarkRead because it persists across page refreshes.
        await Conversation.findByIdAndUpdate(conversationId, {
            $set: { [`unreadCounts.${adminId.toString()}`]: 0 }
        });

        res.status(200).json({
            success: true,
            messages: decrypted.reverse(), // chronological
            hasMore,
            cursor: decrypted.length > 0 ? decrypted[0]._id : null
        });
    } catch (err) {
        console.error('[Admin] getAdminMessages error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ─── POST /api/admin/chat/conversations/:id/messages ─────────────────────────
// Send a reply as admin into any conversation.
// Updates denormalized lastMessage + unreadCounts atomically, then emits via Socket.IO.
const sendAdminMessage = async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const { text } = req.body;
        const adminId = req.admin._id;
        const adminName = req.admin.display_name || req.admin.username || 'Admin';

        if (!text || !text.trim()) {
            return res.status(400).json({ success: false, message: 'Message text is required' });
        }

        const sanitizedText = xss(text.trim());
        const encryptedText = Message.encrypt(sanitizedText);

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ success: false, message: 'Conversation not found' });
        }

        // Build the $inc for unreadCounts for each participant
        const unreadInc = {};
        conversation.participants.forEach(pId => {
            unreadInc[`unreadCounts.${pId.toString()}`] = 1;
        });

        // Create message — sender is admin's ObjectId (compatible with ObjectId ref)
        const message = await Message.create({
            conversationId,
            sender: adminId,
            text: encryptedText,
            type: 'text',
            readBy: [adminId]
        });

        // Update Conversation: denormalized lastMessage + increment unread for participants
        // Also add admin to participants (addToSet = idempotent) so inbox queries work on first send
        await Conversation.findByIdAndUpdate(conversationId, {
            $set: {
                'lastMessage.text': encryptedText,
                'lastMessage.sender': adminId,
                'lastMessage.createdAt': message.createdAt,
                updatedAt: new Date()
            },
            $inc: unreadInc,
            $addToSet: { participants: adminId }
        });

        // Build response payload (return decrypted text to caller)
        const responseMsg = {
            _id: message._id,
            conversationId,
            sender: {
                _id: adminId,
                display_name: adminName,
                username: req.admin.username || 'admin',
                avatar_url: req.admin.avatar_url || null,
                isAdmin: true
            },
            text: sanitizedText,
            type: 'text',
            readBy: [adminId],
            createdAt: message.createdAt,
            updatedAt: message.updatedAt
        };

        // Emit real-time newMessage to every conversation participant via Socket.IO
        const io = req.app.get('io');
        if (io) {
            conversation.participants.forEach(pId => {
                io.to(pId.toString()).emit('newMessage', {
                    message: responseMsg,
                    conversationId
                });
            });

            // Also echo to the admin's own socket room so admin UI updates instantly
            io.of('/admin').to(`admin:${adminId.toString()}`).emit('newMessage', {
                message: responseMsg,
                conversationId
            });
        }

        res.status(201).json({ success: true, message: responseMsg });
    } catch (err) {
        console.error('[Admin] sendAdminMessage error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

module.exports = { getAdminConversations, getAdminMessages, sendAdminMessage };
