const User = require('../models/User');
const FriendRequest = require('../models/FriendRequest');

// @desc    Send a friend request
// @route   POST /api/friends/request/:id
// @access  Private
const sendFriendRequest = async (req, res) => {
    try {
        const receiverId = req.params.id;
        const senderId = req.user.id;

        if (receiverId === senderId) {
            return res.status(400).json({ message: 'You cannot friend yourself' });
        }

        const receiver = await User.findById(receiverId);
        if (!receiver) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if already friends
        const sender = await User.findById(senderId);
        if (sender.friends.includes(receiverId)) {
            return res.status(400).json({ message: 'You are already friends' });
        }

        // Check if blocked
        if (receiver.blocked_users.includes(senderId) || sender.blocked_users.includes(receiverId)) {
            return res.status(400).json({ message: 'Cannot send request' });
        }

        // Check for existing request
        const existingRequest = await FriendRequest.findOne({
            $or: [
                { sender: senderId, receiver: receiverId },
                { sender: receiverId, receiver: senderId }
            ]
        });

        if (existingRequest) {
            return res.status(400).json({ message: 'Friend request already pending' });
        }

        const request = await FriendRequest.create({
            sender: senderId,
            receiver: receiverId
        });

        res.status(201).json(request);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Accept a friend request
// @route   POST /api/friends/accept/:id
// @access  Private
const acceptFriendRequest = async (req, res) => {
    try {
        const requestId = req.params.id;
        const userId = req.user.id;

        const request = await FriendRequest.findById(requestId);

        if (!request) {
            return res.status(404).json({ message: 'Request not found' });
        }

        if (request.receiver.toString() !== userId) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        // Add to friends lists
        await User.findByIdAndUpdate(request.sender, { $addToSet: { friends: request.receiver } });
        await User.findByIdAndUpdate(request.receiver, { $addToSet: { friends: request.sender } });

        // Delete request
        await request.deleteOne();

        res.status(200).json({ message: 'Friend request accepted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Reject/Cancel a friend request
// @route   DELETE /api/friends/request/:id
// @access  Private
const cancelFriendRequest = async (req, res) => {
    try {
        const requestId = req.params.id; // Can be request ID or user ID depending on context, let's assume request ID for direct action
        // But for "Cancel Request" from profile, we might only have User ID. 
        // Let's support verifying by ID.

        let request = await FriendRequest.findById(requestId);

        // If not found by ID, maybe it was passed as USER ID to cancel request sent TO that user?
        // Let's stick to Request ID for this endpoint to be clean, or check ownership.

        if (!request) {
            // Try finding by user pair if requestId isn't a valid objectId or not found
            // Actually, let's keep it simple: Route /api/friends/request/:id expects Request ID.
            // Frontend should look up the request ID.
            return res.status(404).json({ message: 'Request not found' });
        }

        if (request.sender.toString() !== req.user.id && request.receiver.toString() !== req.user.id) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        await request.deleteOne();

        res.status(200).json({ message: 'Friend request removed' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Unfriend user
// @route   DELETE /api/friends/:id
// @access  Private
const unfriendUser = async (req, res) => {
    try {
        const friendId = req.params.id;
        const userId = req.user.id;

        await User.findByIdAndUpdate(userId, { $pull: { friends: friendId } });
        await User.findByIdAndUpdate(friendId, { $pull: { friends: userId } });

        res.status(200).json({ message: 'Unfriended successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Block user
// @route   POST /api/friends/block/:id
// @access  Private
const blockUser = async (req, res) => {
    try {
        const blockId = req.params.id;
        const userId = req.user.id;

        // Add to blocked list
        await User.findByIdAndUpdate(userId, { $addToSet: { blocked_users: blockId } });

        // Remove from friends if exists
        await User.findByIdAndUpdate(userId, { $pull: { friends: blockId } });
        await User.findByIdAndUpdate(blockId, { $pull: { friends: userId } });

        // Delete any pending requests
        await FriendRequest.deleteMany({
            $or: [
                { sender: userId, receiver: blockId },
                { sender: blockId, receiver: userId }
            ]
        });

        res.status(200).json({ message: 'User blocked' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Unblock user
// @route   DELETE /api/friends/block/:id
// @access  Private
const unblockUser = async (req, res) => {
    try {
        const blockId = req.params.id;
        const userId = req.user.id;

        await User.findByIdAndUpdate(userId, { $pull: { blocked_users: blockId } });

        res.status(200).json({ message: 'User unblocked' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all friends
// @route   GET /api/friends
// @access  Private
const getFriends = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).populate('friends', 'username display_name avatar_url');
        res.status(200).json(user.friends);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get pending friend requests
// @route   GET /api/friends/requests
// @access  Private
const getFriendRequests = async (req, res) => {
    try {
        const requests = await FriendRequest.find({
            $or: [{ sender: req.user.id }, { receiver: req.user.id }]
        })
            .populate('sender', 'username display_name avatar_url')
            .populate('receiver', 'username display_name avatar_url');

        res.status(200).json(requests);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get blocked users
// @route   GET /api/friends/blocked
// @access  Private
const getBlockedUsers = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).populate('blocked_users', 'username display_name avatar_url');
        res.status(200).json(user.blocked_users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    sendFriendRequest,
    acceptFriendRequest,
    cancelFriendRequest,
    unfriendUser,
    blockUser,
    unblockUser,
    getFriends,
    getFriendRequests,
    getBlockedUsers
};
