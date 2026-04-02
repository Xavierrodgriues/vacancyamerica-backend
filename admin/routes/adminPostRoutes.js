const express = require('express');
const router = express.Router();
const {
    getAllPosts,
    createPost,
    updatePost,
    deletePost,
    getPostStats,
    getPostAnalytics,
    getPendingPosts,
    getTrustedPendingPosts,
    getRejectedPosts,
    approvePost,
    rejectPost,
    getInterestedApplications,
    updateInterestedApplicationStatus
} = require('../controllers/adminPostController');
const { protectAdmin, adminRateLimit } = require('../middleware/adminAuthMiddleware');
const { protectSuperAdmin } = require('../middleware/superAdminMiddleware');
const uploadWithSizeCheck = require('../../middleware/uploadMiddleware');
const rateLimit = require('express-rate-limit');

const postLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 5, // 5 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many posts created, please try again in a minute' }
});

// Apply rate limiting to all routes
router.use(adminRateLimit);

// Post management routes (For regular Admins)
router.get('/', protectAdmin, getAllPosts);
router.get('/stats', protectAdmin, getPostStats);
router.get('/analytics', protectAdmin, getPostAnalytics);
router.get('/interested-applications', protectAdmin, getInterestedApplications);
router.put('/interested-applications/:id/status', protectAdmin, updateInterestedApplicationStatus);

// Super Admin Approval Routes
router.get('/pending', protectSuperAdmin, getPendingPosts);
router.get('/trusted', protectSuperAdmin, getTrustedPendingPosts);
router.get('/rejected', protectSuperAdmin, getRejectedPosts);
router.put('/:id/approve', protectSuperAdmin, approvePost);
router.put('/:id/reject', protectSuperAdmin, rejectPost);

router.post('/', protectAdmin, postLimiter, uploadWithSizeCheck('media'), createPost);
router.put('/:id', protectAdmin, uploadWithSizeCheck('media'), updatePost);
router.delete('/:id', protectAdmin, deletePost);

module.exports = router;
