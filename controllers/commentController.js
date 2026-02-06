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
    const { content, postId, parentId } = req.body;

    if (!content || !postId) {
        return res.status(400).json({ message: 'Content and Post ID are required' });
    }

    try {
        const comment = await Comment.create({
            user: req.user.id,
            post_id: postId,
            content,
            parent_id: parentId || null
        });

        const populatedComment = await Comment.findById(comment._id).populate('user', 'username display_name avatar_url');

        res.status(201).json(populatedComment);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete a comment
// @route   DELETE /api/comments/:id
// @access  Private
const deleteComment = async (req, res) => {
    try {
        const comment = await Comment.findById(req.params.id);

        if (!comment) {
            return res.status(404).json({ message: 'Comment not found' });
        }

        // Check user
        if (comment.user.toString() !== req.user.id) {
            return res.status(401).json({ message: 'User not authorized' });
        }

        // Check if comment has replies
        const replies = await Comment.findOne({ parent_id: comment._id });

        if (replies) {
            // Soft delete
            comment.deleted = true;
            comment.content = "[deleted]"; // Optional: You can also keep the content but mark as deleted, frontend handles display
            comment.deletedAt = Date.now();
            await comment.save();
        } else {
            // Hard delete
            await comment.deleteOne();
        }

        res.status(200).json({ id: req.params.id });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getComments,
    createComment,
    deleteComment,
};
