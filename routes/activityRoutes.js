const express = require('express');
const router = express.Router();
const { getActivities, markAsRead } = require('../controllers/activityController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getActivities);
router.put('/read', protect, markAsRead);

module.exports = router;
