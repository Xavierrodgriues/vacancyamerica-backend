const express = require('express');
const router = express.Router();
const { getPosts, getUserPosts } = require('../controllers/postController');

// Users can only view posts (create/delete moved to admin)
router.get('/', getPosts);
router.get('/user/:id', getUserPosts);

module.exports = router;
