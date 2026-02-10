const Post = require('../../models/Post');
const User = require('../../models/User');

// Input sanitization helper
const sanitizeInput = (input) => {
    if (typeof input !== 'string') return input;
    return input.trim().replace(/[<>]/g, '');
};

/**
 * @desc    Get all posts with pagination
 * @route   GET /api/admin/posts
 * @access  Private (admin)
 */
const getAllPosts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const [posts, total] = await Promise.all([
            Post.find()
                .populate('user', 'username display_name avatar_url')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Post.countDocuments()
        ]);

        res.json({
            success: true,
            data: posts,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalItems: total,
                itemsPerPage: limit
            }
        });
    } catch (error) {
        console.error('Admin get posts error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch posts'
        });
    }
};

/**
 * @desc    Create a post as admin
 * @route   POST /api/admin/posts
 * @access  Private (admin)
 */
const createPost = async (req, res) => {
    try {
        const { content } = req.body;
        let image_url = null;
        let video_url = null;

        // Handle file upload
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
            if (req.body.image_url) image_url = sanitizeInput(req.body.image_url);
            if (req.body.video_url) video_url = sanitizeInput(req.body.video_url);
        }

        // Validate content
        const sanitizedContent = content ? sanitizeInput(content) : '';

        if (!sanitizedContent && !image_url && !video_url) {
            return res.status(400).json({
                success: false,
                message: 'Content or media is required'
            });
        }

        // Create post - use admin's ID as the user
        // First, we need to find or create a system user for admin posts
        // OR we can reference admin directly

        // For now, let's use admin's info but mark it as admin post
        // Check admin level for status
        let status = 'published';
        const adminLevel = req.admin.admin_level || 0;

        if (adminLevel === 0) {
            status = 'pending';
        } else if (adminLevel === 1) {
            status = 'pending_trusted';
        } else if (adminLevel === 2) {
            status = 'published';
        }

        const post = await Post.create({
            user: req.admin._id,
            userModel: 'Admin',
            content: sanitizedContent,
            image_url,
            video_url,
            isAdminPost: true,
            status: status
        });

        // Populate the created post with admin info
        const populatedPost = await Post.findById(post._id).populate('user', 'username display_name avatar_url');

        res.status(201).json({
            success: true,
            data: populatedPost
        });
    } catch (error) {
        console.error('Admin create post error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create post'
        });
    }
};

/**
 * @desc    Update a post
 * @route   PUT /api/admin/posts/:id
 * @access  Private (admin)
 */
const updatePost = async (req, res) => {
    try {
        const { id } = req.params;
        const { content } = req.body;

        const post = await Post.findById(id);

        if (!post) {
            return res.status(404).json({
                success: false,
                message: 'Post not found'
            });
        }

        // Update fields
        if (content !== undefined) {
            post.content = sanitizeInput(content);
        }

        // Handle media updates
        if (req.file) {
            const protocol = req.protocol;
            const host = req.get('host');
            const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

            if (req.file.mimetype.startsWith('video/')) {
                post.video_url = fileUrl;
                post.image_url = null;
            } else {
                post.image_url = fileUrl;
                post.video_url = null;
            }
        }

        await post.save();

        const updatedPost = await Post.findById(post._id).populate('user', 'username display_name avatar_url');

        res.json({
            success: true,
            data: updatedPost
        });
    } catch (error) {
        console.error('Admin update post error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update post'
        });
    }
};

/**
 * @desc    Delete a post
 * @route   DELETE /api/admin/posts/:id
 * @access  Private (admin)
 */
const deletePost = async (req, res) => {
    try {
        const { id } = req.params;

        const post = await Post.findById(id);

        if (!post) {
            return res.status(404).json({
                success: false,
                message: 'Post not found'
            });
        }

        await post.deleteOne();

        res.json({
            success: true,
            message: 'Post deleted successfully',
            data: { id }
        });
    } catch (error) {
        console.error('Admin delete post error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete post'
        });
    }
};

/**
 * @desc    Get post statistics
 * @route   GET /api/admin/posts/stats
 * @access  Private (admin)
 */
const getPostStats = async (req, res) => {
    try {
        const [totalPosts, todayPosts, weeklyPosts] = await Promise.all([
            Post.countDocuments(),
            Post.countDocuments({
                createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
            }),
            Post.countDocuments({
                createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
            })
        ]);

        res.json({
            success: true,
            data: {
                totalPosts,
                todayPosts,
                weeklyPosts
            }
        });
    } catch (error) {
        console.error('Admin post stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch post statistics'
        });
    }
};



/**
 * @desc    Get pending posts (Level 0 requests)
 * @route   GET /api/admin/posts/pending
 * @access  Private (super_admin)
 */
const getPendingPosts = async (req, res) => {
    try {
        const posts = await Post.find({ status: 'pending' })
            .populate('user', 'username display_name avatar_url')
            .sort({ createdAt: -1 });
        res.json({ success: true, data: posts });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @desc    Get trusted pending posts (Level 1 requests)
 * @route   GET /api/admin/posts/trusted
 * @access  Private (super_admin)
 */
const getTrustedPendingPosts = async (req, res) => {
    try {
        const posts = await Post.find({ status: 'pending_trusted' })
            .populate('user', 'username display_name avatar_url')
            .sort({ createdAt: -1 });
        res.json({ success: true, data: posts });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @desc    Get rejected posts
 * @route   GET /api/admin/posts/rejected
 * @access  Private (super_admin)
 */
const getRejectedPosts = async (req, res) => {
    try {
        const posts = await Post.find({ status: 'rejected' })
            .populate('user', 'username display_name avatar_url')
            .populate('approvedBy', 'display_name')
            .sort({ updatedAt: -1 });
        res.json({ success: true, data: posts });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @desc    Approve a post
 * @route   PUT /api/admin/posts/:id/approve
 * @access  Private (super_admin)
 */
const approvePost = async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

        post.status = 'published';
        // Use superAdmin or admin based on which middleware was used
        const approver = req.superAdmin || req.admin;
        post.approvedBy = approver ? approver._id : null;
        post.approvedAt = Date.now();
        post.rejectionReason = undefined; // Clear previous rejection reason if any

        await post.save();
        res.json({ success: true, message: 'Post approved', data: post });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @desc    Reject a post
 * @route   PUT /api/admin/posts/:id/reject
 * @access  Private (super_admin)
 */
const rejectPost = async (req, res) => {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ success: false, message: 'Rejection reason is required' });

    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

        post.status = 'rejected';
        // Use superAdmin or admin based on which middleware was used
        const rejector = req.superAdmin || req.admin;
        post.approvedBy = rejector ? rejector._id : null; // Track who rejected it
        post.rejectionReason = reason;

        await post.save();
        res.json({ success: true, message: 'Post rejected', data: post });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
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
};
