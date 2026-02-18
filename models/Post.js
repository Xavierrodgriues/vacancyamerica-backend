const mongoose = require('mongoose');

const postSchema = mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'userModel',
        required: true
    },
    userModel: {
        type: String,
        required: true,
        enum: ['User', 'Admin'],
        default: 'User'
    },
    content: {
        type: String,
        default: ''
    },
    image_url: {
        type: String,
        default: null
    },
    video_url: {
        type: String,
        default: null
    },
    isAdminPost: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['published', 'pending', 'pending_trusted', 'rejected'],
        default: 'published'
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SuperAdmin',
        default: null
    },
    approvedAt: {
        type: Date,
        default: null
    },
    rejectionReason: {
        type: String,
        default: null
    },
    likesCount: {
        type: Number,
        default: 0,
        min: 0 // Mongoose validation: never negative
    }
}, {
    timestamps: true
});

// Index for faster queries
postSchema.index({ user: 1 });
postSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Post', postSchema);

