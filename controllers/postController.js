const Post = require('../models/Post');
const User = require('../models/User');

// @desc    Get all posts
// @route   GET /api/posts
// @access  Public
const getPosts = async (req, res) => {
    try {
        const posts = await Post.find()
            .populate('user', 'username display_name avatar_url')
            .sort({ createdAt: -1 });

        // Transform data to match frontend expectations partially or handle in frontend
        res.status(200).json(posts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get user posts
// @route   GET /api/posts/user/:id
// @access  Public
const getUserPosts = async (req, res) => {
    try {
        const posts = await Post.find({ user: req.params.id })
            .populate('user', 'username display_name avatar_url')
            .sort({ createdAt: -1 });
        res.status(200).json(posts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Create a post
// @route   POST /api/posts
// @access  Private
const createPost = async (req, res) => {
    const { content } = req.body;
    let image_url = null;
    let video_url = null;

    if (req.file) {
        // Construct URL for the uploaded file
        const protocol = req.protocol;
        const host = req.get('host');
        const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

        if (req.file.mimetype.startsWith('video/')) {
            video_url = fileUrl;
        } else {
            image_url = fileUrl;
        }
    } else {
        if (req.body.image_url) image_url = req.body.image_url;
        if (req.body.video_url) video_url = req.body.video_url;
    }

    if (!content && !image_url && !video_url) {
        return res.status(400).json({ message: 'Content or Media is required' });
    }

    try {
        const post = await Post.create({
            user: req.user.id,
            content: content || "",
            image_url,
            video_url,
        });

        const populatedPost = await Post.findById(post._id).populate('user', 'username display_name avatar_url');

        res.status(201).json(populatedPost);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete a post
// @route   DELETE /api/posts/:id
// @access  Private
const deletePost = async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);

        if (!post) {
            return res.status(404).json({ message: 'Post not found' });
        }

        // Check for user
        if (!req.user) {
            return res.status(401).json({ message: 'User not found' });
        }

        // Make sure the logged in user matches the post user
        if (post.user.toString() !== req.user.id) {
            return res.status(401).json({ message: 'User not authorized' });
        }

        await post.deleteOne();

        res.status(200).json({ id: req.params.id });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getPosts,
    getUserPosts,
    createPost,
    deletePost,
};
