const express = require('express');
const router = express.Router();
const {
    getAllPosts,
    createPost,
    updatePost,
    deletePost,
    getPostStats,
    getPendingPosts,
    getTrustedPendingPosts,
    getRejectedPosts,
    approvePost,
    rejectPost
} = require('../controllers/adminPostController');
const { protectAdmin, adminRateLimit } = require('../middleware/adminAuthMiddleware');
const { protectSuperAdmin } = require('../middleware/superAdminMiddleware');
const upload = require('../../middleware/uploadMiddleware');

// Apply rate limiting to all routes
router.use(adminRateLimit);

// Post management routes (For regular Admins)
router.get('/', protectAdmin, getAllPosts);
router.get('/stats', protectAdmin, getPostStats);

// Super Admin Approval Routes
router.get('/pending', protectSuperAdmin, getPendingPosts);
router.get('/trusted', protectSuperAdmin, getTrustedPendingPosts);
router.get('/rejected', protectSuperAdmin, getRejectedPosts);
router.put('/:id/approve', protectSuperAdmin, approvePost);
router.put('/:id/reject', protectSuperAdmin, rejectPost);

router.post('/', protectAdmin, upload.single('media'), createPost);
router.put('/:id', protectAdmin, upload.single('media'), updatePost);
router.delete('/:id', protectAdmin, deletePost);

module.exports = router;
