const sharp = require('sharp');

// Max dimensions (same approach as LinkedIn/X)
const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1920;
const JPEG_QUALITY = 82;
const WEBP_QUALITY = 80;

/**
 * Process an image buffer before uploading to R2.
 * - Strips EXIF/metadata (auto-rotates first)
 * - Resizes if larger than MAX_WIDTH × MAX_HEIGHT (preserving aspect ratio)
 * - Converts to WebP for smaller file size (falls back to JPEG for GIFs to preserve animation check)
 *
 * @param {Buffer} buffer  - Raw image buffer from multer
 * @param {string} mimetype - Original mimetype (e.g. 'image/png')
 * @returns {Promise<{ buffer: Buffer, mimetype: string, ext: string }>}
 */
const processImage = async (buffer, mimetype) => {
    // Skip processing for GIFs (to preserve animation)
    if (mimetype === 'image/gif') {
        return { buffer, mimetype, ext: '.gif' };
    }

    let pipeline = sharp(buffer)
        .rotate()           // Auto-rotate based on EXIF orientation, then strip EXIF
        .resize(MAX_WIDTH, MAX_HEIGHT, {
            fit: 'inside',       // Maintain aspect ratio, fit within bounds
            withoutEnlargement: true,  // Don't upscale small images
        });

    // Convert to WebP (modern, ~30% smaller than JPEG at same quality)
    pipeline = pipeline.webp({ quality: WEBP_QUALITY });

    const processedBuffer = await pipeline.toBuffer();

    return {
        buffer: processedBuffer,
        mimetype: 'image/webp',
        ext: '.webp',
    };
};

module.exports = { processImage };
