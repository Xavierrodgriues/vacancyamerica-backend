const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

const R2_BUCKET = process.env.R2_BUCKET_NAME;

/**
 * Generate a presigned URL for an R2 object (expires in 1 hour)
 * @param {string} key - The object key in R2
 * @returns {Promise<string>} Presigned URL
 */
const getPresignedUrl = async (key) => {
    const command = new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
    });
    return getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour
};

/**
 * Check if a value looks like an R2 object key (not already a URL)
 */
const isR2Key = (value) => value && !value.startsWith('http');

/**
 * Sign media URLs on an array of post objects.
 * Only signs values that look like R2 keys (not already URLs).
 * @param {Array} posts - Array of post objects (plain objects or lean docs)
 * @returns {Promise<Array>} Posts with signed URLs
 */
const signPostMediaUrls = async (posts) => {
    return Promise.all(posts.map(async (post) => {
        const signed = { ...post };
        if (isR2Key(signed.image_url)) {
            signed.image_url = await getPresignedUrl(signed.image_url);
        }
        if (isR2Key(signed.video_url)) {
            signed.video_url = await getPresignedUrl(signed.video_url);
        }
        return signed;
    }));
};

/**
 * Sign media URLs on a single post object.
 * @param {object} post - Post object (plain object or lean doc)
 * @returns {Promise<object>} Post with signed URLs
 */
const signSinglePostMedia = async (post) => {
    if (!post) return post;
    const obj = post.toObject ? post.toObject() : { ...post };
    if (isR2Key(obj.image_url)) {
        obj.image_url = await getPresignedUrl(obj.image_url);
    }
    if (isR2Key(obj.video_url)) {
        obj.video_url = await getPresignedUrl(obj.video_url);
    }
    return obj;
};

module.exports = { s3Client, R2_BUCKET, getPresignedUrl, signPostMediaUrls, signSinglePostMedia };
