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
    }
}, {
    timestamps: true
});

// Index for fast inbox lookup — find all conversations for a user
conversationSchema.index({ participants: 1 });

// Index for sorting inbox by most recent activity
conversationSchema.index({ updatedAt: -1 });

// Ensure unique participant pair (sorted to prevent duplicates)
conversationSchema.index(
    { participants: 1 },
    {
        unique: true,
        partialFilterExpression: { 'participants.1': { $exists: true } }
    }
);

module.exports = mongoose.model('Conversation', conversationSchema);
