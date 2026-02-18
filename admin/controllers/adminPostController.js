const Post = require('../../models/Post');
const User = require('../../models/User');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client, R2_BUCKET, signPostMediaUrls, signSinglePostMedia } = require('../../config/r2');
const path = require('path');
const crypto = require('crypto');

// Input sanitization helper
const sanitizeInput = (input) => {
    if (typeof input !== 'string') return input;
    return input.trim().replace(/[<>]/g, '');
};

/**
 * Convert a readable stream to a Buffer (multer v2 compat)
 */
const streamToBuffer = (stream) => {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });
};

/**
 * Upload a file to Cloudflare R2
 * Returns the R2 object key (NOT a public URL)
 * @param {object} file - multer file object (req.file)
 * @returns {Promise<string>} R2 object key
 */
const uploadToR2 = async (file) => {
    const ext = path.extname(file.originalname);
    const key = `posts/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;

    // Get file body — multer v2 may use stream instead of buffer
    let body = file.buffer;
    if (!body && file.stream) {
        body = await streamToBuffer(file.stream);
    }
    if (!body) {
        throw new Error('No file buffer or stream available');
    }

    await s3Client.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: body,
        ContentType: file.mimetype,
    }));

    console.log(`[R2] Uploaded: ${key}`);
    return key;
};

/**
 * Delete a file from Cloudflare R2 by its key
 * @param {string} key - The R2 object key
 */
const deleteFromR2 = async (key) => {
    if (!key) return;
    try {
        await s3Client.send(new DeleteObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
        }));
        console.log(`[R2] Deleted: ${key}`);
    } catch (err) {
        console.error('[R2] Delete error:', err.message);
    }
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

        // Sign R2 media URLs
        const signedPosts = await signPostMediaUrls(posts);

        res.json({
            success: true,
            data: signedPosts,
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

        // Handle file upload to R2 — store the key, not a URL
        if (req.file) {
            const key = await uploadToR2(req.file);

            if (req.file.mimetype.startsWith('video/')) {
                video_url = key;
            } else {
                image_url = key;
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

        const userModel = req.admin.isUserAdmin ? 'User' : 'Admin';

        const post = await Post.create({
            user: req.admin._id,
            userModel: userModel,
            content: sanitizedContent,
            image_url,
            video_url,
            isAdminPost: true,
            status: status
        });

        const populatedPost = await Post.findById(post._id).populate('user', 'username display_name avatar_url');

        // Sign the media URLs before returning
        const signedPost = await signSinglePostMedia(populatedPost);

        res.status(201).json({
            success: true,
            data: signedPost
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

        if (content !== undefined) {
            post.content = sanitizeInput(content);
        }

        // Handle media updates — upload new file to R2
        if (req.file) {
            // Delete old media from R2
            await deleteFromR2(post.image_url);
            await deleteFromR2(post.video_url);

            const key = await uploadToR2(req.file);

            if (req.file.mimetype.startsWith('video/')) {
                post.video_url = key;
                post.image_url = null;
            } else {
                post.image_url = key;
                post.video_url = null;
            }
        }

        await post.save();

        const updatedPost = await Post.findById(post._id).populate('user', 'username display_name avatar_url');
        const signedPost = await signSinglePostMedia(updatedPost);

        res.json({
            success: true,
            data: signedPost
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

        // Delete media from R2
        await deleteFromR2(post.image_url);
        await deleteFromR2(post.video_url);

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
            data: { totalPosts, todayPosts, weeklyPosts }
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
 */
const getPendingPosts = async (req, res) => {
    try {
        const posts = await Post.find({ status: 'pending' })
            .populate('user', 'username display_name avatar_url')
            .sort({ createdAt: -1 })
            .lean();
        const signedPosts = await signPostMediaUrls(posts);
        res.json({ success: true, data: signedPosts });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @desc    Get trusted pending posts (Level 1 requests)
 */
const getTrustedPendingPosts = async (req, res) => {
    try {
        const posts = await Post.find({ status: 'pending_trusted' })
            .populate('user', 'username display_name avatar_url')
            .sort({ createdAt: -1 })
            .lean();
        const signedPosts = await signPostMediaUrls(posts);
        res.json({ success: true, data: signedPosts });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @desc    Get rejected posts
 */
const getRejectedPosts = async (req, res) => {
    try {
        const posts = await Post.find({ status: 'rejected' })
            .populate('user', 'username display_name avatar_url')
            .populate('approvedBy', 'display_name')
            .sort({ updatedAt: -1 })
            .lean();
        const signedPosts = await signPostMediaUrls(posts);
        res.json({ success: true, data: signedPosts });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @desc    Approve a post
 */
const approvePost = async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

        post.status = 'published';
        const approver = req.superAdmin || req.admin;
        post.approvedBy = approver ? approver._id : null;
        post.approvedAt = Date.now();
        post.rejectionReason = undefined;

        await post.save();
        const signedPost = await signSinglePostMedia(post);
        res.json({ success: true, message: 'Post approved', data: signedPost });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @desc    Reject a post
 */
const rejectPost = async (req, res) => {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ success: false, message: 'Rejection reason is required' });

    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

        post.status = 'rejected';
        const rejector = req.superAdmin || req.admin;
        post.approvedBy = rejector ? rejector._id : null;
        post.rejectionReason = reason;

        await post.save();
        const signedPost = await signSinglePostMedia(post);
        res.json({ success: true, message: 'Post rejected', data: signedPost });
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
