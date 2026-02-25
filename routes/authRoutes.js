const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getMe, getUserByUsername, updateProfile, searchUsers, googleLogin } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 5, // 5 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many attempts, please try again after 10 minutes' }
});

router.post('/signup', authLimiter, registerUser);
router.post('/login', authLimiter, loginUser);
router.post('/google', googleLogin);
router.get('/me', protect, getMe);
router.get('/user/:username', getUserByUsername);
router.put('/profile', protect, updateProfile);
router.get('/search', searchUsers);

module.exports = router;

