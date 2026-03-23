const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    actor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    type: {
        type: String,
        enum: ['LIKE', 'COMMENT', 'FOLLOW'],
        required: true,
    },
    post: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post',
    },
    comment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment',
    },
    isRead: {
        type: Boolean,
        default: false,
    }
}, { timestamps: true });

// Compound index for O(1) feed retrieval ordered by newest first
activitySchema.index({ recipient: 1, createdAt: -1 });

module.exports = mongoose.model('Activity', activitySchema);
