const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Generate JWT
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

// @desc    Register new user
// @route   POST /api/auth/signup
// @access  Public
const registerUser = async (req, res) => {
    const { username, email, password, display_name } = req.body;

    if (!username || !email || !password || !display_name) {
        return res.status(400).json({ message: 'Please add all fields' });
    }

    // Check if user exists
    const userExists = await User.findOne({ email });
    const usernameExists = await User.findOne({ username });

    if (userExists || usernameExists) {
        return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await User.create({
        username,
        display_name,
        email,
        password: hashedPassword,
    });

    if (user) {
        res.status(201).json({
            _id: user.id,
            username: user.username,
            email: user.email,
            token: generateToken(user._id),
            display_name: user.display_name,
        });
    } else {
        res.status(400).json({ message: 'Invalid user data' });
    }
};

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
    const { email, password } = req.body;

    // Check for user email
    const user = await User.findOne({ email });

    if (user && (await bcrypt.compare(password, user.password))) {
        res.json({
            _id: user.id,
            username: user.username,
            email: user.email,
            token: generateToken(user._id),
            display_name: user.display_name,
            avatar_url: user.avatar_url
        });
    } else {
        res.status(400).json({ message: 'Invalid credentials' });
    }
};

// @desc    Get user data
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
    res.status(200).json(req.user);
};

// @desc    Get user by username
// @route   GET /api/auth/user/:username
// @access  Public
const getUserByUsername = async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username }).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.status(200).json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.display_name = req.body.display_name || user.display_name;
        user.bio = req.body.bio || user.bio;

        // Handle other fields if necessary

        const updatedUser = await user.save();

        res.status(200).json({
            _id: updatedUser.id,
            username: updatedUser.username,
            email: updatedUser.email,
            token: generateToken(updatedUser._id),
            display_name: updatedUser.display_name,
            bio: updatedUser.bio,
            avatar_url: updatedUser.avatar_url
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Search users by username or display name
// @route   GET /api/auth/search?q=query
// @access  Public
const searchUsers = async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) {
            return res.status(400).json({ message: 'Query parameter q is required' });
        }

        const users = await User.find({
            $or: [
                { username: { $regex: query, $options: 'i' } },
                { display_name: { $regex: query, $options: 'i' } }
            ]
        })
            .select('_id username display_name avatar_url')
            .limit(10);

        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Login/Register with Google
// @route   POST /api/auth/google
// @access  Public
const googleLogin = async (req, res) => {
    try {
        const { access_token } = req.body;

        if (!access_token) {
            return res.status(400).json({ message: 'Google access token is required' });
        }

        // Fetch user info from Google
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch user info from Google');
        }

        const payload = await response.json();
        const { sub: googleId, email, name, picture } = payload;

        // Check if user already exists by googleId
        let user = await User.findOne({ googleId });

        if (!user) {
            // Check if a user with this email already exists (registered via email/password)
            user = await User.findOne({ email });

            if (user) {
                // Link the Google account to the existing user
                user.googleId = googleId;
                if (!user.avatar_url && picture) {
                    user.avatar_url = picture;
                }
                await user.save();
            } else {
                // Create a brand new user
                // Generate a unique username from the email prefix
                let baseUsername = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
                let username = baseUsername;
                let counter = 1;
                while (await User.findOne({ username })) {
                    username = `${baseUsername}${counter}`;
                    counter++;
                }

                user = await User.create({
                    username,
                    display_name: name || username,
                    email,
                    googleId,
                    avatar_url: picture || null,
                });
            }
        }

        res.json({
            _id: user.id,
            username: user.username,
            email: user.email,
            token: generateToken(user._id),
            display_name: user.display_name,
            avatar_url: user.avatar_url,
        });
    } catch (error) {
        console.error('Google login error:', error);
        res.status(401).json({ message: 'Invalid Google access token' });
    }
};

module.exports = {
    registerUser,
    loginUser,
    getMe,
    getUserByUsername,
    updateProfile,
    searchUsers,
    googleLogin,
};
