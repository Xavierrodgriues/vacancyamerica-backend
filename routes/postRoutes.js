const express = require('express');
const router = express.Router();
const { getPosts, createPost, getUserPosts, deletePost } = require('../controllers/postController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.get('/', getPosts);
router.post('/', protect, upload.single('image'), createPost);
router.get('/user/:id', getUserPosts);
router.delete('/:id', protect, deletePost);

module.exports = router;
