const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const { gzip } = require('zlib');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const Post = require('../models/Post');
const InterestedApplication = require('../models/InterestedApplication');
const { s3Client, R2_BUCKET } = require('../config/r2');

const gzipAsync = promisify(gzip);

function sanitizeFileName(filename = 'document') {
    const parsed = path.parse(filename);
    const safeBase = (parsed.name || 'document')
        .replace(/[^a-zA-Z0-9-_]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60) || 'document';
    const safeExt = (parsed.ext || '').replace(/[^a-zA-Z0-9.]/g, '').slice(0, 10);
    return `${safeBase}${safeExt}`;
}

// @desc    Submit an interested application for a published post
// @route   POST /api/posts/:id/interested
// @access  Private
const createInterestedApplication = async (req, res) => {
    try {
        const postId = req.params.id;
        const { fullName, email, phone, location, coverLetter } = req.body;

        const post = await Post.findOne({ _id: postId, status: 'published' }).select('_id');
        if (!post) {
            return res.status(404).json({ message: 'Published post not found' });
        }

        if (!fullName || !email || !phone) {
            return res.status(400).json({ message: 'Full name, email, and phone are required' });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'At least one document is required' });
        }

        const existingApplication = await InterestedApplication.findOne({
            post: postId,
            applicant: req.user.id,
        }).select('_id');

        if (existingApplication) {
            return res.status(409).json({ message: 'You have already submitted interest for this post' });
        }

        const application = await InterestedApplication.create({
            post: postId,
            applicant: req.user.id,
            fullName: fullName.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            location: location?.trim() || '',
            coverLetter: coverLetter?.trim() || '',
            documents: [],
        });

        const documents = await Promise.all(req.files.map(async (file, index) => {
            const safeName = sanitizeFileName(file.originalname);
            const compressedBuffer = await gzipAsync(file.buffer, { level: 9 });
            const key = `interested-user-docs/${postId}/${application._id}/${Date.now()}-${index}-${crypto.randomBytes(4).toString('hex')}-${safeName}.gz`;

            await s3Client.send(new PutObjectCommand({
                Bucket: R2_BUCKET,
                Key: key,
                Body: compressedBuffer,
                ContentType: file.mimetype || 'application/octet-stream',
                ContentEncoding: 'gzip',
                Metadata: {
                    originalname: safeName,
                },
            }));

            return {
                originalName: file.originalname,
                mimeType: file.mimetype || 'application/octet-stream',
                r2Key: key,
                originalSize: file.size,
                compressedSize: compressedBuffer.length,
            };
        }));

        application.documents = documents;
        await application.save();

        return res.status(201).json({
            message: 'Interest submitted successfully',
            applicationId: application._id,
        });
    } catch (error) {
        console.error('createInterestedApplication error:', error);

        if (error?.code === 11000) {
            return res.status(409).json({ message: 'You have already submitted interest for this post' });
        }

        return res.status(500).json({ message: 'Failed to submit interest application' });
    }
};

module.exports = { createInterestedApplication };
