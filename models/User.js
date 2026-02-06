const mongoose = require('mongoose');

const userSchema = mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    display_name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    avatar_url: {
        type: String,
        default: null
    },
    bio: {
        type: String,
        default: null
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('User', userSchema);
