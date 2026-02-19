const multer = require('multer');
const path = require('path');

// Size limits per media type
const IMAGE_MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const VIDEO_MAX_SIZE = 25 * 1024 * 1024; // 25 MB

// Use memory storage — file stays in buffer, uploaded to R2 in the controller
const storage = multer.memoryStorage();

// Init upload — use the larger limit; per-type enforcement is in the wrapper below
const upload = multer({
    storage: storage,
    limits: { fileSize: VIDEO_MAX_SIZE },
    fileFilter: function (req, file, cb) {
        checkFileType(file, cb);
    }
});

// Check file type
function checkFileType(file, cb) {
    // Allowed ext
    const filetypes = /jpeg|jpg|png|gif|webp|mp4|webm/;
    // Check ext
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    // Check mime
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb('Error: Images and Videos Only!');
    }
}

/**
 * Wrapper middleware that enforces per-type size limits:
 *   - Images (jpeg/jpg/png/gif/webp): 10 MB
 *   - Videos (mp4/webm):              25 MB
 */
const uploadWithSizeCheck = (fieldName) => {
    return (req, res, next) => {
        upload.single(fieldName)(req, res, (err) => {
            if (err) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(413).json({ message: 'File too large. Max 10 MB for images, 25 MB for videos.' });
                }
                return res.status(400).json({ message: err.message || err });
            }

            // Enforce stricter image limit
            if (req.file && !req.file.mimetype.startsWith('video/')) {
                if (req.file.size > IMAGE_MAX_SIZE) {
                    return res.status(413).json({ message: `Image too large. Max size is ${IMAGE_MAX_SIZE / (1024 * 1024)} MB.` });
                }
            }

            next();
        });
    };
};

module.exports = uploadWithSizeCheck;
