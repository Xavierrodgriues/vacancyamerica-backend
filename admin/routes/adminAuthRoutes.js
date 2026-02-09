const express = require('express');
const router = express.Router();
const {
    registerAdmin,
    loginAdmin,
    getAdminProfile,
    checkStatus,
    logoutAdmin
} = require('../controllers/adminAuthController');
const { protectAdmin, adminRateLimit } = require('../middleware/adminAuthMiddleware');

// Apply rate limiting to all auth routes
router.use(adminRateLimit);

// Public routes
router.post('/register', registerAdmin);
router.post('/login', loginAdmin);
router.get('/status/:email', checkStatus);

// Protected routes
router.get('/me', protectAdmin, getAdminProfile);
router.post('/logout', protectAdmin, logoutAdmin);

module.exports = router;

