const express = require('express');
const router = express.Router();
const {
    sendFriendRequest,
    acceptFriendRequest,
    cancelFriendRequest,
    unfriendUser,
    blockUser,
    unblockUser,
    getFriends,
    getFriendRequests,
    getBlockedUsers
} = require('../controllers/friendController');
const { protect } = require('../middleware/authMiddleware');
const rateLimit = require('express-rate-limit');

const followLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 20, // 20 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many friend requests, please slow down' }
});

router.post('/request/:id', protect, followLimiter, sendFriendRequest);
router.post('/accept/:id', protect, followLimiter, acceptFriendRequest); // :id is requestId
router.delete('/request/:id', protect, cancelFriendRequest); // :id is requestId

router.delete('/:id', protect, unfriendUser); // :id is friend's userId
router.get('/', protect, getFriends);
router.get('/requests', protect, getFriendRequests);

router.post('/block/:id', protect, blockUser); // :id is userId to block
router.delete('/block/:id', protect, unblockUser); // :id is userId to unblock
router.get('/blocked', protect, getBlockedUsers);

module.exports = router;
