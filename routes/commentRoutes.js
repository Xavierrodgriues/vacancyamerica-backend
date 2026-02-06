const express = require('express');
const router = express.Router();
const { getComments, createComment } = require('../controllers/commentController');
const { protect } = require('../middleware/authMiddleware');

router.get('/:postId', getComments);
router.post('/', protect, createComment);

module.exports = router;
