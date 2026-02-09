const express = require('express');
const router = express.Router();
const {
    registerAdmin,
    loginAdmin,
    getAdminProfile,
    logoutAdmin
} = require('../controllers/adminAuthController');
const { protectAdmin, adminRateLimit } = require('../middleware/adminAuthMiddleware');

// Apply rate limiting to all auth routes
router.use(adminRateLimit);

// Public routes
router.post('/register', registerAdmin);
router.post('/login', loginAdmin);

// Protected routes
router.get('/me', protectAdmin, getAdminProfile);
router.post('/logout', protectAdmin, logoutAdmin);

module.exports = router;
