const User = require('../models/User');
const Connection = require('../models/Connection');
const Activity = require('../models/Activity');

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

        const sender = await User.findById(senderId);

        // Check if blocked
        if (receiver.blocked_users.includes(senderId) || sender.blocked_users.includes(receiverId)) {
            return res.status(400).json({ message: 'Cannot send request' });
        }

        // Check for existing connection/request
        const existingConnection = await Connection.findOne({
            $or: [
                { userId: senderId, friendId: receiverId },
                { userId: receiverId, friendId: senderId }
            ]
        });

        if (existingConnection) {
            if (existingConnection.status === 'accepted') {
                return res.status(400).json({ message: 'You are already friends' });
            } else {
                return res.status(400).json({ message: 'Friend request already pending' });
            }
        }

        const request = await Connection.create({
            userId: senderId,
            friendId: receiverId,
            status: 'pending'
        });

        // Scalable Activity Logging & Socket.IO Real-Time Update
        const activity = await Activity.create({
            recipient: receiverId,
            actor: senderId,
            type: 'FOLLOW'
        });
        const populatedActivity = await Activity.findById(activity._id)
            .populate('actor', 'username display_name avatar_url');
            
        // Map fields so the frontend gets what it expects for friend requests
        const mappedRequest = {
            _id: request._id,
            status: request.status,
            createdAt: request.createdAt,
            sender: {
                _id: sender._id,
                username: sender.username,
                display_name: sender.display_name,
                avatar_url: sender.avatar_url
            },
            receiver: {
                _id: receiver._id,
                username: receiver.username,
                display_name: receiver.display_name,
                avatar_url: receiver.avatar_url
            }
        };

        // Emit new_activity - frontend will listen to this to invalidate
        req.app.get('io').to(receiverId.toString()).emit('new_activity', populatedActivity);

        res.status(201).json(mappedRequest);
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
        const myId = req.user.id;

        const request = await Connection.findById(requestId);

        if (!request || request.status !== 'pending') {
            return res.status(404).json({ message: 'Pending request not found' });
        }

        if (request.friendId.toString() !== myId) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        request.status = 'accepted';
        await request.save();

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
        const requestId = req.params.id; 

        let request = await Connection.findById(requestId);

        if (!request || request.status !== 'pending') {
            return res.status(404).json({ message: 'Pending request not found' });
        }

        if (request.userId.toString() !== req.user.id && request.friendId.toString() !== req.user.id) {
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

        await Connection.deleteOne({
            status: 'accepted',
            $or: [
                { userId: userId, friendId: friendId },
                { userId: friendId, friendId: userId }
            ]
        });

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

        // Delete any connections (pending or accepted)
        await Connection.deleteMany({
            $or: [
                { userId: userId, friendId: blockId },
                { userId: blockId, friendId: userId }
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

// @desc    Get all friends (Cursor Paginated)
// @route   GET /api/friends
// @access  Private
const getFriends = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const cursor = req.query.cursor; // The _id of the last connection

        const query = {
            $or: [{ userId: req.user.id }, { friendId: req.user.id }],
            status: 'accepted'
        };

        if (cursor) {
            query._id = { $lt: cursor };
        }

        const connections = await Connection.find(query)
            .sort({ _id: -1 })
            .limit(limit)
            .populate('userId', 'username display_name avatar_url')
            .populate('friendId', 'username display_name avatar_url')
            .lean();

        // Format so it returns array of user objects
        const friends = connections.map(conn => {
            const isSender = conn.userId._id.toString() === req.user.id;
            return isSender ? conn.friendId : conn.userId;
        });

        const nextCursor = connections.length === limit ? connections[connections.length - 1]._id : null;

        // Note: For backwards compatibility, if no pagination params are sent, the frontend might expect a straight array.
        // However, useInfiniteFriends will expect an object with { friends, nextCursor }.
        // If it's a paginated request:
        if (req.query.limit !== undefined) {
             return res.status(200).json({ friends, nextCursor });
        } else {
             // Fallback for parts of the app that haven't been migrated yet
             return res.status(200).json(friends);
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get pending friend requests
// @route   GET /api/friends/requests
// @access  Private
const getFriendRequests = async (req, res) => {
    try {
        const requests = await Connection.find({
            $or: [{ userId: req.user.id }, { friendId: req.user.id }],
            status: 'pending'
        })
            .populate('userId', 'username display_name avatar_url')
            .populate('friendId', 'username display_name avatar_url')
            .lean();

        // The frontend expects { _id, sender: {...}, receiver: {...}, status, createdAt }
        const formattedRequests = requests.map(reqData => ({
            _id: reqData._id,
            status: reqData.status,
            createdAt: reqData.createdAt,
            sender: reqData.userId,
            receiver: reqData.friendId
        }));

        res.status(200).json(formattedRequests);
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

// @desc    Get connection status
// @route   GET /api/friends/status/:id
// @access  Private
const getConnectionStatus = async (req, res) => {
    try {
        const friendId = req.params.id;
        const userId = req.user.id;
        
        if (friendId === userId) return res.status(200).json({ status: 'self' });

        const connection = await Connection.findOne({
            $or: [
                { userId, friendId },
                { userId: friendId, friendId: userId }
            ]
        });

        if (!connection) return res.status(200).json({ status: 'none' });

        res.status(200).json({ 
            status: connection.status, 
            senderId: connection.userId,
            requestId: connection._id
        });
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
    getBlockedUsers,
    getConnectionStatus
};
