const express = require('express');
const router = express.Router();
const {
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    takeAction,
    getPendingAdmins,
    getAllAdmins,
    updateAdminStatus,
    updateAdminLevel
} = require('../controllers/notificationController');
const { protectSuperAdmin } = require('../middleware/superAdminMiddleware');

// All routes require super admin authentication
router.use(protectSuperAdmin);

// Notification routes
router.get('/', getNotifications);
router.get('/count', getUnreadCount);
router.put('/:id/read', markAsRead);
router.put('/read-all', markAllAsRead);
router.post('/:id/action', takeAction);

// Admin management routes
router.get('/admins', getAllAdmins);
router.get('/admins/pending', getPendingAdmins);
router.put('/admins/:id/status', updateAdminStatus);
router.put('/admins/:id/level', updateAdminLevel);

module.exports = router;
