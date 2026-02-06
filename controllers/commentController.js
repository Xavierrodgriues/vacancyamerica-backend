const Comment = require('../models/Comment');

// @desc    Get comments for a post
// @route   GET /api/comments/:postId
// @access  Public
const getComments = async (req, res) => {
    try {
        const comments = await Comment.find({ post_id: req.params.postId })
            .populate('user', 'username display_name avatar_url')
            .sort({ createdAt: 1 });
        res.status(200).json(comments);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Create a comment
// @route   POST /api/comments
// @access  Private
const createComment = async (req, res) => {
    const { content, postId } = req.body;

    if (!content || !postId) {
        return res.status(400).json({ message: 'Content and Post ID are required' });
    }

    try {
        const comment = await Comment.create({
            user: req.user.id,
            post_id: postId,
            content,
        });

        const populatedComment = await Comment.findById(comment._id).populate('user', 'username display_name avatar_url');

        res.status(201).json(populatedComment);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getComments,
    createComment,
};
