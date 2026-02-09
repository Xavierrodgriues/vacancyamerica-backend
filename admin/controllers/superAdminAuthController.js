const jwt = require('jsonwebtoken');
const SuperAdmin = require('../models/SuperAdmin');

// Generate JWT with super admin flag
const generateToken = (id) => {
    return jwt.sign({ id, isSuperAdmin: true }, process.env.JWT_SECRET, {
        expiresIn: '8h'
    });
};

// Input sanitization helper
const sanitizeInput = (input) => {
    if (typeof input !== 'string') return input;
    return input.trim().replace(/[<>]/g, '');
};

/**
 * @desc    Register new super admin
 * @route   POST /api/superadmin/auth/register
 * @access  Public (first super admin only, others need approval)
 */
const registerSuperAdmin = async (req, res) => {
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
            password: password
        };

        // Password strength validation
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(password)) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character'
            });
        }

        // Check if super admin already exists
        const existingSuperAdmin = await SuperAdmin.findOne({
            $or: [
                { email: sanitizedData.email },
                { username: sanitizedData.username }
            ]
        });

        if (existingSuperAdmin) {
            return res.status(400).json({
                success: false,
                message: 'Super admin with this email or username already exists'
            });
        }

        // Create super admin
        const superAdmin = await SuperAdmin.create(sanitizedData);

        res.status(201).json({
            success: true,
            data: {
                _id: superAdmin._id,
                username: superAdmin.username,
                email: superAdmin.email,
                display_name: superAdmin.display_name,
                token: generateToken(superAdmin._id)
            }
        });
    } catch (error) {
        console.error('Super admin registration error:', error);

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
                message: 'Super admin with this email or username already exists'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error during registration'
        });
    }
};

/**
 * @desc    Authenticate super admin
 * @route   POST /api/superadmin/auth/login
 * @access  Public
 */
const loginSuperAdmin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email and password'
            });
        }

        const superAdmin = await SuperAdmin.findOne({ email: email.toLowerCase().trim() }).select('+password');

        if (!superAdmin) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Check if account is locked
        if (superAdmin.isLocked) {
            const lockTime = Math.ceil((superAdmin.lockUntil - Date.now()) / 60000);
            return res.status(423).json({
                success: false,
                message: `Account is locked. Try again in ${lockTime} minutes.`
            });
        }

        // Check if account is active
        if (!superAdmin.isActive) {
            return res.status(403).json({
                success: false,
                message: 'Account is deactivated.'
            });
        }

        // Verify password
        const isMatch = await superAdmin.matchPassword(password);

        if (!isMatch) {
            await superAdmin.incLoginAttempts();
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Reset login attempts on successful login
        await SuperAdmin.findByIdAndUpdate(superAdmin._id, {
            $set: { loginAttempts: 0, lastLogin: new Date() },
            $unset: { lockUntil: 1 }
        });

        res.json({
            success: true,
            data: {
                _id: superAdmin._id,
                username: superAdmin.username,
                email: superAdmin.email,
                display_name: superAdmin.display_name,
                avatar_url: superAdmin.avatar_url,
                token: generateToken(superAdmin._id)
            }
        });
    } catch (error) {
        console.error('Super admin login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during login'
        });
    }
};

/**
 * @desc    Get current super admin profile
 * @route   GET /api/superadmin/auth/me
 * @access  Private (super admin)
 */
const getSuperAdminProfile = async (req, res) => {
    try {
        const superAdmin = await SuperAdmin.findById(req.superAdmin._id);

        res.json({
            success: true,
            data: {
                _id: superAdmin._id,
                username: superAdmin.username,
                email: superAdmin.email,
                display_name: superAdmin.display_name,
                avatar_url: superAdmin.avatar_url,
                createdAt: superAdmin.createdAt
            }
        });
    } catch (error) {
        console.error('Get super admin profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

/**
 * @desc    Logout super admin
 * @route   POST /api/superadmin/auth/logout
 * @access  Private (super admin)
 */
const logoutSuperAdmin = async (req, res) => {
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
};

module.exports = {
    registerSuperAdmin,
    loginSuperAdmin,
    getSuperAdminProfile,
    logoutSuperAdmin
};
