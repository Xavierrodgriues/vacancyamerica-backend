const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { getPosts, getUserPosts, toggleLike } = require('../controllers/postController');
const { protect } = require('../middleware/authMiddleware');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ── Optional auth: attach req.user if token present, but don't block ────────
const optionalAuth = async (req, res, next) => {
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            const token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = await User.findById(decoded.id).select('-password');
        } catch (_) {
            // Invalid token — proceed as unauthenticated
        }
    }
    next();
};

// ── Rate limiter for like endpoint (edge case #7) ───────────────────────────
const likeLimiter = rateLimit({
    windowMs: 1000,       // 1 second window
    max: 10,              // 10 toggles per second per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests, slow down' }
});

// Feed routes (public, but optionalAuth for likedByMe)
router.get('/', optionalAuth, getPosts);
router.get('/user/:id', optionalAuth, getUserPosts);

// Like toggle (authenticated + rate-limited)
router.post('/:id/like', protect, likeLimiter, toggleLike);

module.exports = router;
