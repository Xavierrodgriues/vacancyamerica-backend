const Activity = require('../models/Activity');

// @desc    Get recent activities
// @route   GET /api/activity
// @access  Private
const getActivities = async (req, res) => {
    try {
        const activities = await Activity.find({ recipient: req.user.id })
            .populate('actor', 'username display_name avatar_url')
            .populate('post', 'content image_url')
            .sort({ createdAt: -1 })
            .limit(50); // Scale: Cap to 50 latest items to avoid massive DB lookups
            
        res.status(200).json(activities);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Mark all activities as read
// @route   PUT /api/activity/read
// @access  Private
const markAsRead = async (req, res) => {
    try {
        await Activity.updateMany(
            { recipient: req.user.id, isRead: false },
            { $set: { isRead: true } }
        );
        res.status(200).json({ message: 'Activities marked as read' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getActivities,
    markAsRead
};
