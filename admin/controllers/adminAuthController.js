const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

// Generate JWT with admin flag
const generateToken = (id) => {
    return jwt.sign({ id, isAdmin: true }, process.env.JWT_SECRET, {
        expiresIn: '8h' // Shorter expiry for admin tokens (security)
    });
};

// Input sanitization helper
const sanitizeInput = (input) => {
    if (typeof input !== 'string') return input;
    return input.trim().replace(/[<>]/g, '');
};

/**
 * @desc    Register new admin
 * @route   POST /api/admin/auth/register
 * @access  Public (should be restricted in production)
 */
const registerAdmin = async (req, res) => {
    try {
        const { username, email, password, display_name } = req.body;

        // Validate required fields
        if (!username || !email || !password || !display_name) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields'
            });
        }

        // Sanitize inputs
        const sanitizedData = {
            username: sanitizeInput(username),
            email: sanitizeInput(email).toLowerCase(),
            display_name: sanitizeInput(display_name),
            password: password // Don't sanitize password
        };

        // Password strength validation
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(password)) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character'
            });
        }

        // Check if admin already exists
        const existingAdmin = await Admin.findOne({
            $or: [
                { email: sanitizedData.email },
                { username: sanitizedData.username }
            ]
        });

        if (existingAdmin) {
            return res.status(400).json({
                success: false,
                message: 'Admin with this email or username already exists'
            });
        }

        // Create admin
        const admin = await Admin.create(sanitizedData);

        res.status(201).json({
            success: true,
            data: {
                _id: admin._id,
                username: admin.username,
                email: admin.email,
                display_name: admin.display_name,
                role: admin.role,
                token: generateToken(admin._id)
            }
        });
    } catch (error) {
        console.error('Admin registration error:', error);

        // Handle mongoose validation errors
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: messages.join('. ')
            });
        }

        // Handle duplicate key error
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Admin with this email or username already exists'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error during registration'
        });
    }
};

/**
 * @desc    Authenticate admin
 * @route   POST /api/admin/auth/login
 * @access  Public
 */
const loginAdmin = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email and password'
            });
        }

        // Find admin and include password for comparison
        const admin = await Admin.findOne({ email: email.toLowerCase().trim() }).select('+password');

        if (!admin) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Check if account is locked
        if (admin.isLocked) {
            const lockTime = Math.ceil((admin.lockUntil - Date.now()) / 60000);
            return res.status(423).json({
                success: false,
                message: `Account is locked. Try again in ${lockTime} minutes.`
            });
        }

        // Check if account is active
        if (!admin.isActive) {
            return res.status(403).json({
                success: false,
                message: 'Account is deactivated. Contact super admin.'
            });
        }

        // Verify password
        const isMatch = await admin.matchPassword(password);

        if (!isMatch) {
            // Increment failed login attempts
            await admin.incLoginAttempts();
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Reset login attempts on successful login
        await Admin.findByIdAndUpdate(admin._id, {
            $set: { loginAttempts: 0, lastLogin: new Date() },
            $unset: { lockUntil: 1 }
        });

        res.json({
            success: true,
            data: {
                _id: admin._id,
                username: admin.username,
                email: admin.email,
                display_name: admin.display_name,
                avatar_url: admin.avatar_url,
                role: admin.role,
                token: generateToken(admin._id)
            }
        });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during login'
        });
    }
};

/**
 * @desc    Get current admin profile
 * @route   GET /api/admin/auth/me
 * @access  Private (admin)
 */
const getAdminProfile = async (req, res) => {
    try {
        const admin = await Admin.findById(req.admin._id);

        res.json({
            success: true,
            data: {
                _id: admin._id,
                username: admin.username,
                email: admin.email,
                display_name: admin.display_name,
                avatar_url: admin.avatar_url,
                role: admin.role,
                createdAt: admin.createdAt
            }
        });
    } catch (error) {
        console.error('Get admin profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

/**
 * @desc    Logout admin (client-side token removal, server-side logging)
 * @route   POST /api/admin/auth/logout
 * @access  Private (admin)
 */
const logoutAdmin = async (req, res) => {
    // In a production app, you might want to:
    // 1. Add token to a blacklist
    // 2. Log the logout event
    // For now, just return success (client removes token)
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
};

module.exports = {
    registerAdmin,
    loginAdmin,
    getAdminProfile,
    logoutAdmin
};
