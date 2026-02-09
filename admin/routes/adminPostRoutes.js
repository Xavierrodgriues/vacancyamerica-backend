const express = require('express');
const router = express.Router();
const {
    getAllPosts,
    createPost,
    updatePost,
    deletePost,
    getPostStats
} = require('../controllers/adminPostController');
const { protectAdmin, adminRateLimit } = require('../middleware/adminAuthMiddleware');
const upload = require('../../middleware/uploadMiddleware');

// Apply rate limiting and admin protection to all routes
router.use(adminRateLimit);
router.use(protectAdmin);

// Post management routes
router.get('/', getAllPosts);
router.get('/stats', getPostStats);
router.post('/', upload.single('image'), createPost);
router.put('/:id', upload.single('image'), updatePost);
router.delete('/:id', deletePost);

module.exports = router;
