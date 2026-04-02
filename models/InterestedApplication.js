const mongoose = require('mongoose');

const interestedDocumentSchema = new mongoose.Schema({
    originalName: {
        type: String,
        required: true,
        trim: true,
    },
    mimeType: {
        type: String,
        required: true,
        trim: true,
    },
    r2Key: {
        type: String,
        required: true,
        trim: true,
    },
    originalSize: {
        type: Number,
        required: true,
        min: 0,
    },
    compressedSize: {
        type: Number,
        required: true,
        min: 0,
    },
}, { _id: false });

const interestedApplicationSchema = new mongoose.Schema({
    post: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post',
        required: true,
        index: true,
    },
    applicant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    fullName: {
        type: String,
        required: true,
        trim: true,
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
    },
    phone: {
        type: String,
        required: true,
        trim: true,
    },
    location: {
        type: String,
        default: '',
        trim: true,
    },
    coverLetter: {
        type: String,
        default: '',
        trim: true,
    },
    documents: {
        type: [interestedDocumentSchema],
        default: [],
    },
    status: {
        type: String,
        enum: ['submitted', 'reviewed', 'contacted', 'rejected'],
        default: 'submitted',
    },
}, {
    timestamps: true,
});

interestedApplicationSchema.index({ post: 1, applicant: 1 }, { unique: true });
interestedApplicationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('InterestedApplication', interestedApplicationSchema);
