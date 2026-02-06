const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getMe, getUserByUsername, updateProfile } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/signup', registerUser);
router.post('/login', loginUser);
router.get('/me', protect, getMe);
router.get('/user/:username', getUserByUsername);
router.put('/profile', protect, updateProfile);

module.exports = router;
