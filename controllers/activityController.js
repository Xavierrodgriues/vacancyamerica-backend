const Activity = require('../models/Activity');

const { signSinglePostMedia } = require('../config/r2');

// @desc    Get recent activities
// @route   GET /api/activity
// @access  Private
const getActivities = async (req, res) => {
    try {
        const activities = await Activity.find({ recipient: req.user.id })
            .populate('actor', 'username display_name avatar_url')
            .populate('post', 'content image_url')
            .sort({ createdAt: -1 })
            .limit(50)
            .lean(); // Use lean for modifying the result directly

        // Sign media URLs for the nested post object if it exists
        const signedActivities = await Promise.all(activities.map(async (act) => {
            if (act.post) {
                act.post = await signSinglePostMedia(act.post);
            }
            return act;
        }));

        res.status(200).json(signedActivities);
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

// @desc    Delete a specific activity
// @route   DELETE /api/activity/:id
// @access  Private
const deleteActivity = async (req, res) => {
    try {
        const activity = await Activity.findOne({ _id: req.params.id, recipient: req.user.id });
        if (!activity) {
            return res.status(404).json({ message: 'Activity not found' });
        }
        await activity.deleteOne();
        res.status(200).json({ message: 'Activity deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Clear all activities
// @route   DELETE /api/activity
// @access  Private
const clearAllActivities = async (req, res) => {
    try {
        await Activity.deleteMany({ recipient: req.user.id });
        res.status(200).json({ message: 'All activities cleared successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getActivities,
    markAsRead,
    deleteActivity,
    clearAllActivities
};
