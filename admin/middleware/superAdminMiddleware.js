const jwt = require('jsonwebtoken');
const SuperAdmin = require('../models/SuperAdmin');

/**
 * Middleware to protect super admin routes
 */
const protectSuperAdmin = async (req, res, next) => {
    try {
        let token;

        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized, no token'
            });
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Verify this is a super admin token
            if (!decoded.isSuperAdmin) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. Super admin privileges required.'
                });
            }

            const superAdmin = await SuperAdmin.findById(decoded.id).select('-password');

            if (!superAdmin) {
                return res.status(401).json({
                    success: false,
                    message: 'Super admin not found'
                });
            }

            if (!superAdmin.isActive) {
                return res.status(403).json({
                    success: false,
                    message: 'Super admin account is deactivated'
                });
            }

            req.superAdmin = superAdmin;
            next();
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    message: 'Token expired'
                });
            }
            return res.status(401).json({
                success: false,
                message: 'Not authorized, token invalid'
            });
        }
    } catch (error) {
        console.error('Super admin auth middleware error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error in authentication'
        });
    }
};

// Rate limiting for super admin routes
const superAdminRateLimits = new Map();

const rateLimitSuperAdmin = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const maxRequests = 100;

    if (!superAdminRateLimits.has(ip)) {
        superAdminRateLimits.set(ip, { count: 1, startTime: now });
        return next();
    }

    const rateLimit = superAdminRateLimits.get(ip);

    if (now - rateLimit.startTime > windowMs) {
        superAdminRateLimits.set(ip, { count: 1, startTime: now });
        return next();
    }

    if (rateLimit.count >= maxRequests) {
        return res.status(429).json({
            success: false,
            message: 'Too many requests. Please try again later.'
        });
    }

    rateLimit.count++;
    next();
};

module.exports = {
    protectSuperAdmin,
    rateLimitSuperAdmin
};
