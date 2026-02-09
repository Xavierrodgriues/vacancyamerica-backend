const Notification = require('../models/Notification');
const Admin = require('../models/Admin');

/**
 * @desc    Get all notifications for super admin
 * @route   GET /api/superadmin/notifications
 * @access  Private (super admin)
 */
const getNotifications = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const status = req.query.status; // 'unread', 'read', 'actioned'
        const type = req.query.type;

        const query = { recipient: req.superAdmin._id };

        if (status) {
            query.status = status;
        }

        if (type) {
            query.type = type;
        }

        // Exclude expired notifications
        query.$or = [
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } }
        ];

        const skip = (page - 1) * limit;

        const [notifications, total] = await Promise.all([
            Notification.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Notification.countDocuments(query)
        ]);

        res.json({
            success: true,
            data: {
                notifications,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching notifications'
        });
    }
};

/**
 * @desc    Get unread notification count
 * @route   GET /api/superadmin/notifications/count
 * @access  Private (super admin)
 */
const getUnreadCount = async (req, res) => {
    try {
        const count = await Notification.getUnreadCount(req.superAdmin._id);

        res.json({
            success: true,
            data: { count }
        });
    } catch (error) {
        console.error('Get unread count error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

/**
 * @desc    Mark notification as read
 * @route   PUT /api/superadmin/notifications/:id/read
 * @access  Private (super admin)
 */
const markAsRead = async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            {
                _id: req.params.id,
                recipient: req.superAdmin._id
            },
            { status: 'read' },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        res.json({
            success: true,
            data: notification
        });
    } catch (error) {
        console.error('Mark as read error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

/**
 * @desc    Mark all notifications as read
 * @route   PUT /api/superadmin/notifications/read-all
 * @access  Private (super admin)
 */
const markAllAsRead = async (req, res) => {
    try {
        await Notification.updateMany(
            {
                recipient: req.superAdmin._id,
                status: 'unread'
            },
            { status: 'read' }
        );

        res.json({
            success: true,
            message: 'All notifications marked as read'
        });
    } catch (error) {
        console.error('Mark all as read error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

/**
 * @desc    Take action on a notification (approve/reject admin)
 * @route   POST /api/superadmin/notifications/:id/action
 * @access  Private (super admin)
 */
const takeAction = async (req, res) => {
    try {
        const { action, reason } = req.body;

        if (!action || !['approved', 'rejected'].includes(action)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid action. Must be "approved" or "rejected"'
            });
        }

        const notification = await Notification.findOne({
            _id: req.params.id,
            recipient: req.superAdmin._id,
            type: 'admin_approval',
            status: { $ne: 'actioned' }
        });

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found or already actioned'
            });
        }

        const adminId = notification.data?.adminId;

        if (!adminId) {
            return res.status(400).json({
                success: false,
                message: 'Invalid notification data'
            });
        }

        // Update admin status
        const adminUpdate = {
            status: action,
            approvedBy: req.superAdmin._id,
            approvedAt: new Date()
        };

        if (action === 'rejected' && reason) {
            adminUpdate.rejectionReason = reason;
        }

        const admin = await Admin.findByIdAndUpdate(
            adminId,
            adminUpdate,
            { new: true }
        );

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
        }

        // Update notification
        notification.status = 'actioned';
        notification.actionTaken = action;
        notification.actionedAt = new Date();
        await notification.save();

        // Mark same notifications for other super admins as actioned
        await Notification.updateMany(
            {
                type: 'admin_approval',
                'data.adminId': adminId,
                _id: { $ne: notification._id }
            },
            {
                status: 'actioned',
                actionTaken: action,
                actionedAt: new Date()
            }
        );

        res.json({
            success: true,
            message: `Admin ${action} successfully`,
            data: {
                admin: {
                    _id: admin._id,
                    username: admin.username,
                    email: admin.email,
                    status: admin.status
                },
                notification
            }
        });
    } catch (error) {
        console.error('Take action error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

/**
 * @desc    Get pending admin approvals
 * @route   GET /api/superadmin/admins/pending
 * @access  Private (super admin)
 */
const getPendingAdmins = async (req, res) => {
    try {
        const admins = await Admin.find({ status: 'pending' })
            .select('-password')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: admins
        });
    } catch (error) {
        console.error('Get pending admins error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

/**
 * @desc    Get all admins
 * @route   GET /api/superadmin/admins
 * @access  Private (super admin)
 */
const getAllAdmins = async (req, res) => {
    try {
        const status = req.query.status;
        const query = {};

        if (status) {
            query.status = status;
        }

        const admins = await Admin.find(query)
            .select('-password')
            .populate('approvedBy', 'username display_name')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: admins
        });
    } catch (error) {
        console.error('Get all admins error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

/**
 * @desc    Directly approve/reject an admin
 * @route   PUT /api/superadmin/admins/:id/status
 * @access  Private (super admin)
 */
const updateAdminStatus = async (req, res) => {
    try {
        const { status, reason } = req.body;

        if (!status || !['approved', 'rejected'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }

        const updateData = {
            status,
            approvedBy: req.superAdmin._id,
            approvedAt: new Date()
        };

        if (status === 'rejected' && reason) {
            updateData.rejectionReason = reason;
        }

        const admin = await Admin.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        ).select('-password');

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
        }

        // Update related notifications
        await Notification.updateMany(
            {
                type: 'admin_approval',
                'data.adminId': admin._id,
                status: { $ne: 'actioned' }
            },
            {
                status: 'actioned',
                actionTaken: status,
                actionedAt: new Date()
            }
        );

        res.json({
            success: true,
            message: `Admin ${status} successfully`,
            data: admin
        });
    } catch (error) {
        console.error('Update admin status error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

module.exports = {
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    takeAction,
    getPendingAdmins,
    getAllAdmins,
    updateAdminStatus
};
