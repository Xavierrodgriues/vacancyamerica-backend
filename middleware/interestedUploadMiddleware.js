const multer = require('multer');
const path = require('path');

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per document
const MAX_FILE_COUNT = 5;

const allowedExtensions = /\.(pdf|doc|docx|png|jpg|jpeg|webp)$/i;
const allowedMimeTypes = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
    'image/webp',
]);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: MAX_FILE_COUNT,
    },
    fileFilter: (_req, file, cb) => {
        const hasValidExt = allowedExtensions.test(path.extname(file.originalname).toLowerCase());
        const hasValidMime = allowedMimeTypes.has(file.mimetype);

        if (!hasValidExt || !hasValidMime) {
            return cb(new Error('Only PDF, DOC, DOCX, JPG, PNG, and WEBP documents are allowed'));
        }

        return cb(null, true);
    },
});

const uploadInterestedDocuments = (req, res, next) => {
    upload.array('documents', MAX_FILE_COUNT)(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ message: 'Each document must be 10 MB or smaller' });
            }

            if (err.code === 'LIMIT_FILE_COUNT') {
                return res.status(413).json({ message: 'You can upload up to 5 documents' });
            }

            return res.status(400).json({ message: err.message || 'Invalid documents upload' });
        }

        return next();
    });
};

module.exports = uploadInterestedDocuments;
