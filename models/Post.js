const mongoose = require('mongoose');

const postSchema = mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
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
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Post', postSchema);
