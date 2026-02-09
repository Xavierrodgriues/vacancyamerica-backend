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
        required: true
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
    }
}, {
    timestamps: true
});

// Index for faster queries
postSchema.index({ user: 1 });
postSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Post', postSchema);

