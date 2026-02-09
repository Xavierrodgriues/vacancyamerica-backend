const mongoose = require('mongoose');

const notificationSchema = mongoose.Schema({
    // Type of notification - extensible for future notification types
    type: {
        type: String,
        required: true,
        enum: ['admin_approval', 'post_report', 'user_report', 'system', 'announcement'],
        index: true
    },

    // Notification content
    title: {
        type: String,
        required: true,
        maxlength: 200
    },
    message: {
        type: String,
        required: true,
        maxlength: 1000
    },

    // Flexible data payload for different notification types
    data: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },

    // Who should receive this notification
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SuperAdmin',
        required: true,
        index: true
    },

    // Notification status
    status: {
        type: String,
        enum: ['unread', 'read', 'actioned'],
        default: 'unread',
        index: true
    },

    // For actionable notifications (like admin approval)
    actionTaken: {
        type: String,
        enum: ['approved', 'rejected', null],
        default: null
    },

    // When action was taken
    actionedAt: {
        type: Date,
        default: null
    },

    // Priority for sorting
    priority: {
        type: String,
        enum: ['low', 'normal', 'high', 'urgent'],
        default: 'normal'
    },

    // Optional expiry for time-sensitive notifications
    expiresAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Compound indexes for common queries
notificationSchema.index({ recipient: 1, status: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, type: 1, status: 1 });
notificationSchema.index({ createdAt: -1 });

// Virtual to check if notification is expired
notificationSchema.virtual('isExpired').get(function () {
    return this.expiresAt && this.expiresAt < Date.now();
});

// Static method to create admin approval notification
notificationSchema.statics.createAdminApprovalNotification = async function (adminId, adminData, superAdminIds) {
    const notifications = superAdminIds.map(superAdminId => ({
        type: 'admin_approval',
        title: 'New Admin Registration',
        message: `${adminData.display_name} (${adminData.email}) has requested admin access.`,
        data: {
            adminId: adminId,
            username: adminData.username,
            email: adminData.email,
            display_name: adminData.display_name,
            registeredAt: new Date()
        },
        recipient: superAdminId,
        priority: 'high'
    }));

    return this.insertMany(notifications);
};

// Static method to get unread count for a super admin
notificationSchema.statics.getUnreadCount = async function (superAdminId) {
    return this.countDocuments({
        recipient: superAdminId,
        status: 'unread',
        $or: [
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } }
        ]
    });
};

module.exports = mongoose.model('Notification', notificationSchema);
