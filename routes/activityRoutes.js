const express = require('express');
const router = express.Router();
const { getActivities, markAsRead, deleteActivity, clearAllActivities } = require('../controllers/activityController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getActivities);
router.put('/read', protect, markAsRead);
router.delete('/', protect, clearAllActivities);
router.delete('/:id', protect, deleteActivity);

module.exports = router;

