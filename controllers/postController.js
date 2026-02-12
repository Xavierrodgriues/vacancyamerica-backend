const Post = require('../models/Post');
const Like = require('../models/Like');
const User = require('../models/User');
const Admin = require('../admin/models/Admin');

// ─── Helper: batch lookup which posts the current user has liked ────────────
async function getLikedPostIds(userId, postIds) {
    if (!userId || postIds.length === 0) return new Set();
    const likes = await Like.find({
        user: userId,
        post: { $in: postIds }
    }).select('post').lean();
    return new Set(likes.map(l => l.post.toString()));
}

// ─── Helper: attach like info to posts array ────────────────────────────────
function attachLikeInfo(posts, likedSet) {
    return posts.map(p => {
        const postId = (p._id || p.id).toString();
        return {
            ...p,
            likedByMe: likedSet.has(postId),
            likesCount: p.likesCount || 0
        };
    });
}

// @desc    Get all posts
// @route   GET /api/posts
// @access  Public
const getPosts = async (req, res) => {
    try {
        const posts = await Post.find({ status: 'published' })
            .populate('user', 'username display_name avatar_url')
            .sort({ createdAt: -1 })
            .lean();

        // Fix posts where populate failed (user is null) - likely wrong userModel
        const fixedPosts = await Promise.all(posts.map(async (post) => {
            if (!post.user) {
                const rawPost = await Post.findById(post._id).select('user userModel').lean();
                if (rawPost && rawPost.user) {
                    const otherModel = rawPost.userModel === 'Admin' ? 'User' : 'Admin';
                    const Model = otherModel === 'User' ? User : Admin;
                    const foundUser = await Model.findById(rawPost.user).select('username display_name avatar_url').lean();
                    if (foundUser) {
                        post.user = foundUser;
                        await Post.updateOne({ _id: post._id }, { userModel: otherModel });
                    }
                }
            }
            return post;
        }));

        // Batch lookup: which posts has the current user liked? (avoids N+1)
        const userId = req.user?._id;
        const postIds = fixedPosts.map(p => p._id);
        const likedSet = await getLikedPostIds(userId, postIds);

        res.status(200).json(attachLikeInfo(fixedPosts, likedSet));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get user posts
// @route   GET /api/posts/user/:id
// @access  Public
const getUserPosts = async (req, res) => {
    try {
        const posts = await Post.find({ user: req.params.id, status: 'published' })
            .populate('user', 'username display_name avatar_url')
            .sort({ createdAt: -1 })
            .lean();

        const userId = req.user?._id;
        const postIds = posts.map(p => p._id);
        const likedSet = await getLikedPostIds(userId, postIds);

        res.status(200).json(attachLikeInfo(posts, likedSet));
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

        if (!req.user) {
            return res.status(401).json({ message: 'User not found' });
        }

        if (post.user.toString() !== req.user.id) {
            return res.status(401).json({ message: 'User not authorized' });
        }

        // Clean up: remove all likes for this post
        await Like.deleteMany({ post: post._id });
        await post.deleteOne();

        res.status(200).json({ id: req.params.id });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Toggle like on a post (like/unlike)
// @route   POST /api/posts/:id/like
// @access  Private
const toggleLike = async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.user._id;

        // Edge case #3: validate post exists — prevent orphan likes
        const post = await Post.findById(postId).select('_id likesCount');
        if (!post) {
            return res.status(404).json({ message: 'Post not found' });
        }

        // Try to remove existing like (atomic: returns deleted doc or null)
        const existingLike = await Like.findOneAndDelete({
            post: postId,
            user: userId
        });

        if (existingLike) {
            // Was liked → now unliked → decrement counter
            // Edge case #1: clamp at 0 — never go negative
            await Post.updateOne(
                { _id: postId, likesCount: { $gt: 0 } },
                { $inc: { likesCount: -1 } }
            );
            const updated = await Post.findById(postId).select('likesCount').lean();
            return res.status(200).json({
                liked: false,
                likesCount: updated?.likesCount || 0
            });
        }

        // Not liked yet → create like
        try {
            await Like.create({ post: postId, user: userId });
        } catch (err) {
            // Edge case #4: handle E11000 duplicate key (concurrent double-like)
            if (err.code === 11000) {
                const current = await Post.findById(postId).select('likesCount').lean();
                return res.status(200).json({
                    liked: true,
                    likesCount: current?.likesCount || 0
                });
            }
            throw err;
        }

        // Increment counter (atomic)
        await Post.updateOne(
            { _id: postId },
            { $inc: { likesCount: 1 } }
        );

        const updated = await Post.findById(postId).select('likesCount').lean();
        return res.status(200).json({
            liked: true,
            likesCount: updated?.likesCount || 0
        });
    } catch (error) {
        console.error('toggleLike error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    getPosts,
    getUserPosts,
    createPost,
    deletePost,
    toggleLike,
};
