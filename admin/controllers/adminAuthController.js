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
const User = require('../../models/User');

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
        const normalizedEmail = sanitizeInput(email).toLowerCase();
        const normalizedUsername = sanitizeInput(username);
        const sanitizedDisplayName = sanitizeInput(display_name);

        // Check if admin already exists in Legacy Admin collection
        const existingLegacyAdmin = await Admin.findOne({
            $or: [
                { email: normalizedEmail },
                { username: normalizedUsername }
            ]
        });

        if (existingLegacyAdmin) {
            return res.status(400).json({
                success: false,
                message: 'Admin account already exists'
            });
        }

        // Check if user exists in User collection
        let user = await User.findOne({
            $or: [
                { email: normalizedEmail },
                { username: normalizedUsername }
            ]
        });

        let isNewUser = false;

        if (user) {
            // User exists, upgrade to admin
            if (user.isAdmin) {
                return res.status(400).json({
                    success: false,
                    message: 'Account is already registered as an admin'
                });
            }

            // Upgrade existing user
            user.isAdmin = true;
            user.admin_status = 'pending';
            user.admin_level = 0;
            // Password remains unchanged for existing users
        } else {
            // Create new user
            isNewUser = true;

            // Password strength validation for new users
            const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
            if (!passwordRegex.test(password)) {
                return res.status(400).json({
                    success: false,
                    message: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character'
                });
            }

            // Hash password
            const salt = await require('bcryptjs').genSalt(10);
            const hashedPassword = await require('bcryptjs').hash(password, salt);

            user = new User({
                username: normalizedUsername,
                email: normalizedEmail,
                display_name: sanitizedDisplayName,
                password: hashedPassword,
                isAdmin: true,
                admin_status: 'pending',
                admin_level: 0
            });
        }

        await user.save();

        // Get all super admins to notify
        const superAdmins = await SuperAdmin.find({ isActive: true }).select('_id');

        if (superAdmins.length > 0) {
            // Create notifications for all super admins
            await Notification.createAdminApprovalNotification(
                user._id,
                {
                    username: user.username,
                    email: user.email,
                    display_name: user.display_name
                },
                superAdmins.map(sa => sa._id)
            );
        }

        res.status(201).json({
            success: true,
            message: isNewUser
                ? 'Registration successful. Awaiting super admin approval.'
                : 'Account upgraded to Admin. Awaiting super admin approval.',
            data: {
                _id: user._id,
                username: user.username,
                email: user.email,
                display_name: user.display_name,
                avatar_url: user.avatar_url,
                role: 'admin', // Virtual role for frontend compatibility
                admin_level: user.admin_level,
                status: user.admin_status
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
                message: 'User with this email or username already exists'
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

        const normalizedEmail = email.toLowerCase().trim();

        // 1. Try Legacy Admin Login
        const admin = await Admin.findOne({ email: normalizedEmail }).select('+password');
        let user = null;
        let isLegacyAdmin = false;

        if (admin) {
            // Verify password for legacy admin
            const isMatch = await admin.matchPassword(password);
            if (isMatch) {
                user = admin;
                isLegacyAdmin = true;
            }
        }

        // 2. If not legacy admin, try User Login
        if (!user) {
            const userAccount = await User.findOne({ email: normalizedEmail });
            if (userAccount && userAccount.isAdmin) {
                const isMatch = await require('bcryptjs').compare(password, userAccount.password);
                if (isMatch) {
                    user = userAccount;
                }
            }
        }

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials or not an admin'
            });
        }

        // 3. Status Checks
        const status = isLegacyAdmin ? user.status : user.admin_status;
        const rejectionReason = isLegacyAdmin ? user.rejectionReason : user.admin_rejection_reason;

        // For legacy admins, check lock/active
        if (isLegacyAdmin) {
            if (user.isLocked) {
                const lockTime = Math.ceil((user.lockUntil - Date.now()) / 60000);
                return res.status(423).json({
                    success: false,
                    message: `Account is locked. Try again in ${lockTime} minutes.`
                });
            }
            if (!user.isActive) {
                return res.status(403).json({
                    success: false,
                    message: 'Account is deactivated. Contact super admin.'
                });
            }
        }

        // Check approval status
        if (status === 'pending') {
            return res.status(403).json({
                success: false,
                message: 'Your account is pending approval. Please wait for super admin confirmation.',
                status: 'pending'
            });
        }

        if (status === 'rejected') {
            return res.status(403).json({
                success: false,
                message: rejectionReason
                    ? `Your account was rejected: ${rejectionReason}`
                    : 'Your account registration was rejected.',
                status: 'rejected'
            });
        }

        // 4. Successful Login

        // Update login stats if legacy
        if (isLegacyAdmin) {
            await Admin.findByIdAndUpdate(user._id, {
                $set: { loginAttempts: 0, lastLogin: new Date() },
                $unset: { lockUntil: 1 }
            });
        }

        res.json({
            success: true,
            data: {
                _id: user._id,
                username: user.username,
                email: user.email,
                display_name: user.display_name,
                avatar_url: user.avatar_url,
                role: isLegacyAdmin ? user.role : 'admin',
                admin_level: user.admin_level || 0,
                status: status,
                token: generateToken(user._id)
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
        const admin = req.admin; // Already attached by middleware

        // Determine is legacy admin or user
        // Using a flag we attached in middleware or checking fields
        const isLegacyAdmin = !admin.isUserAdmin;

        res.json({
            success: true,
            data: {
                _id: admin._id,
                username: admin.username,
                email: admin.email,
                display_name: admin.display_name,
                avatar_url: admin.avatar_url,
                role: isLegacyAdmin ? admin.role : 'admin',
                admin_level: admin.admin_level || 0,
                status: isLegacyAdmin ? admin.status : admin.admin_status,
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
