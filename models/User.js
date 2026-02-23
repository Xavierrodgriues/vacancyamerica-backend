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
        required: false
    },
    googleId: {
        type: String,
        default: null,
        sparse: true,
        unique: true
    },
    avatar_url: {
        type: String,
        default: null
    },
    bio: {
        type: String,
        default: null
    },
    phone_number: {
        type: String,
        default: null,
        trim: true,
        maxlength: 15,
        validate: {
            validator: function (v) {
                if (!v) return true; // optional field
                return /^\d{10,15}$/.test(v);
            },
            message: 'Phone number must be 10-15 digits only'
        }
    },
    friends: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    blocked_users: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    // Admin fields
    isAdmin: {
        type: Boolean,
        default: false
    },
    admin_level: {
        type: Number,
        enum: [0, 1, 2],
        default: 0
    },
    admin_status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    admin_approved_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SuperAdmin',
        default: null
    },
    admin_approved_at: {
        type: Date,
        default: null
    },
    admin_rejection_reason: {
        type: String,
        default: null
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('User', userSchema);
