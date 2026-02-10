const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

/**
 * Middleware to protect admin routes
 * Validates JWT token and attaches admin to request
 */
const protectAdmin = async (req, res, next) => {
    let token;

    // Check for Bearer token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Extract token
            token = req.headers.authorization.split(' ')[1];

            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Check if token is for admin (has isAdmin flag)
            if (!decoded.isAdmin) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. Admin privileges required.'
                });
            }

            // Get admin from token (excluding password)
            const admin = await Admin.findById(decoded.id);

            if (!admin) {
                return res.status(401).json({
                    success: false,
                    message: 'Admin not found'
                });
            }

            // Check if admin account is active
            if (!admin.isActive) {
                return res.status(403).json({
                    success: false,
                    message: 'Admin account is deactivated'
                });
            }

            // Attach admin to request
            req.admin = admin;
            next();
        } catch (error) {
            console.error('Admin auth error:', error.message);

            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    message: 'Token expired. Please login again.'
                });
            }

            if (error.name === 'JsonWebTokenError') {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid token'
                });
            }

            res.status(401).json({
                success: false,
                message: 'Not authorized'
            });
        }
    } else {
        res.status(401).json({
            success: false,
            message: 'Not authorized, no token provided'
        });
    }
};

/**
 * Middleware to restrict access to super admins only
 */
const superAdminOnly = (req, res, next) => {
    if (req.admin && req.admin.role === 'super_admin') {
        next();
    } else {
        res.status(403).json({
            success: false,
            message: 'Access denied. Super admin privileges required.'
        });
    }
};

/**
 * Rate limiting for admin routes (basic implementation)
 * For production, use express-rate-limit or similar
 */
const adminRateLimit = (() => {
    const requests = new Map();
    const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
    const MAX_REQUESTS = 1000; // Max requests per window

    return (req, res, next) => {
        const ip = req.ip || req.connection.remoteAddress;
        const now = Date.now();

        if (!requests.has(ip)) {
            requests.set(ip, { count: 1, resetTime: now + WINDOW_MS });
            return next();
        }

        const record = requests.get(ip);

        if (now > record.resetTime) {
            record.count = 1;
            record.resetTime = now + WINDOW_MS;
            return next();
        }

        if (record.count >= MAX_REQUESTS) {
            return res.status(429).json({
                success: false,
                message: 'Too many requests. Please try again later.'
            });
        }

        record.count++;
        next();
    };
})();

module.exports = { protectAdmin, superAdminOnly, adminRateLimit };
