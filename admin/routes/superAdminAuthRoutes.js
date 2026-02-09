const express = require('express');
const router = express.Router();
const {
    registerSuperAdmin,
    loginSuperAdmin,
    getSuperAdminProfile,
    logoutSuperAdmin
} = require('../controllers/superAdminAuthController');
const { protectSuperAdmin } = require('../middleware/superAdminMiddleware');

// Public routes
router.post('/register', registerSuperAdmin);
router.post('/login', loginSuperAdmin);

// Protected routes
router.get('/me', protectSuperAdmin, getSuperAdminProfile);
router.post('/logout', protectSuperAdmin, logoutSuperAdmin);

module.exports = router;
