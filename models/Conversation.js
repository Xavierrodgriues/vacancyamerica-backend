const mongoose = require('mongoose');

const conversationSchema = mongoose.Schema({
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }],
    lastMessage: {
        text: { type: String, default: '' },
        sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        createdAt: { type: Date, default: null }
    },
    // Denormalized unread count per participant — avoids countDocuments on every inbox load
    // Key = userId (string), Value = unread count (number)
    unreadCounts: {
        type: Map,
        of: Number,
        default: {}
    }
}, {
    timestamps: true
});

// Index for sorting inbox by most recent activity
conversationSchema.index({ updatedAt: -1 });

// Unique participant pair index — also handles fast inbox lookups (participants: 1)
// partialFilterExpression ensures only pairs (not single-participant docs) are constrained
conversationSchema.index(
    { participants: 1 },
    {
        unique: true,
        partialFilterExpression: { 'participants.1': { $exists: true } }
    }
);

module.exports = mongoose.model('Conversation', conversationSchema);
