const mongoose = require('mongoose');

const likeSchema = mongoose.Schema({
    post: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post',
        required: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

// ── Indexes ──────────────────────────────────────────────────────────────────
// Prevents double-likes at DB level — even under 100K concurrent requests
likeSchema.index({ post: 1, user: 1 }, { unique: true });

// Fast "which posts did this user like?" queries (for likedByMe batch lookup)
likeSchema.index({ user: 1 });

// Fast "who liked this post?" + chronological sorting
likeSchema.index({ post: 1, createdAt: -1 });

module.exports = mongoose.model('Like', likeSchema);
