const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const SuperAdmin = require('../models/SuperAdmin');
const Notification = require('../models/Notification');

// Generate JWT with admin flag
const generateToken = (id) => {
    return jwt.sign({ id, isAdmin: true }, process.env.JWT_SECRET, {
        expiresIn: '8h'
    });
};

// Input sanitization helper
const sanitizeInput = (input) => {
    if (typeof input !== 'string') return input;
    return input.trim().replace(/[<>]/g, '');
};

/**
 * @desc    Register new admin (requires super admin approval)
 * @route   POST /api/admin/auth/register
 * @access  Public
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
            password: password,
            status: 'pending' // New admins start as pending
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

        // Create admin with pending status
        const admin = await Admin.create(sanitizedData);

        // Get all super admins to notify
        const superAdmins = await SuperAdmin.find({ isActive: true }).select('_id');

        if (superAdmins.length > 0) {
            // Create notifications for all super admins
            await Notification.createAdminApprovalNotification(
                admin._id,
                {
                    username: admin.username,
                    email: admin.email,
                    display_name: admin.display_name
                },
                superAdmins.map(sa => sa._id)
            );
        }

        res.status(201).json({
            success: true,
            message: 'Registration successful. Awaiting super admin approval.',
            data: {
                _id: admin._id,
                username: admin.username,
                email: admin.email,
                display_name: admin.display_name,
                status: admin.status
            }
        });
    } catch (error) {
        console.error('Admin registration error:', error);

        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: messages.join('. ')
            });
        }

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
 * @desc    Authenticate admin (only if approved)
 * @route   POST /api/admin/auth/login
 * @access  Public
 */
const loginAdmin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email and password'
            });
        }

        const admin = await Admin.findOne({ email: email.toLowerCase().trim() }).select('+password');

        if (!admin) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Check approval status FIRST
        if (admin.status === 'pending') {
            return res.status(403).json({
                success: false,
                message: 'Your account is pending approval. Please wait for super admin confirmation.',
                status: 'pending'
            });
        }

        if (admin.status === 'rejected') {
            return res.status(403).json({
                success: false,
                message: admin.rejectionReason
                    ? `Your account was rejected: ${admin.rejectionReason}`
                    : 'Your account registration was rejected.',
                status: 'rejected'
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
                status: admin.status,
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
                status: admin.status,
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
 * @desc    Check admin registration status
 * @route   GET /api/admin/auth/status/:email
 * @access  Public
 */
const checkStatus = async (req, res) => {
    try {
        const admin = await Admin.findOne({
            email: req.params.email.toLowerCase().trim()
        }).select('status rejectionReason');

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
        }

        res.json({
            success: true,
            data: {
                status: admin.status,
                rejectionReason: admin.rejectionReason
            }
        });
    } catch (error) {
        console.error('Check status error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

/**
 * @desc    Logout admin
 * @route   POST /api/admin/auth/logout
 * @access  Private (admin)
 */
const logoutAdmin = async (req, res) => {
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
};

module.exports = {
    registerAdmin,
    loginAdmin,
    getAdminProfile,
    checkStatus,
    logoutAdmin
};
