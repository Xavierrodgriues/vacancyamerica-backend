const mongoose = require('mongoose');

const connectionSchema = mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    friendId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'accepted'],
        default: 'pending'
    }
}, {
    timestamps: true
});

// Ensure a user can only have one connection document per friend
connectionSchema.index({ userId: 1, friendId: 1 }, { unique: true });

// Optimize lookups
connectionSchema.index({ userId: 1, status: 1 });
connectionSchema.index({ friendId: 1, status: 1 });

module.exports = mongoose.model('Connection', connectionSchema);
