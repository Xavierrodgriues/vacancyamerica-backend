const express = require('express');
const router  = express.Router();
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { protectAdmin, adminRateLimit } = require('../middleware/adminAuthMiddleware');
const {
    getAdminConversations,
    getAdminMessages,
    sendAdminMessage
} = require('../controllers/adminChatController');

// ─── Rate limiter specific to admin chat ─────────────────────────────────────
// 30 requests per minute per admin token — prevents spam while allowing normal use
const chatLimiter = rateLimit({
    windowMs: 60 * 1000,       // 1 minute
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req, res) => {
        // Primary key: last 32 chars of the bearer token (unique per admin session)
        // Fallback: IPv6-safe IP via the official ipKeyGenerator helper
        const auth = req.headers.authorization || '';
        const token = auth.split(' ')[1];
        return token
            ? `admin_chat_${token.slice(-32)}`
            : `admin_chat_ip_${ipKeyGenerator(req, res)}`;
    },
    message: { success: false, message: 'Too many chat requests. Please slow down.' }
});

// Apply global admin rate limiter + chat-specific limiter to all routes
router.use(adminRateLimit);
router.use(chatLimiter);

// ─── Routes ──────────────────────────────────────────────────────────────────
// GET  /api/admin/chat/conversations           → paginated inbox (all conversations)
// GET  /api/admin/chat/conversations/:id/messages  → cursor-based thread
// POST /api/admin/chat/conversations/:id/messages  → send admin reply
router.get('/conversations',                  protectAdmin, getAdminConversations);
router.get('/conversations/:id/messages',     protectAdmin, getAdminMessages);
router.post('/conversations/:id/messages',    protectAdmin, sendAdminMessage);

module.exports = router;
