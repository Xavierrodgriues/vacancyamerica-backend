const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const Redis = require('ioredis');
const jwt = require('jsonwebtoken');
const connectDB = require('./config/db');
const { setupChatSocket } = require('./socket/chatSocket');
const { decodeToken } = require('./middleware/authMiddleware');

dotenv.config();

connectDB();

const app = express();
const server = http.createServer(app);

// Setup Socket.io with CORS
const io = new Server(server, {
    cors: {
        origin: ["http://localhost:5173", "http://localhost:8080", "https://vacancyamerica-frontend.vercel.app"],
        methods: ['GET', 'POST']
    }
});

// Make io accessible in route handlers via req.app.get('io')
app.set('io', io);

// Setup socket event handlers
setupChatSocket(io);

app.use(cors({
    origin: ["http://localhost:5173", "http://localhost:8080", "https://vacancyamerica-frontend.vercel.app"],
}));

// Trust proxy if we are behind a reverse proxy (e.g. Render, Heroku, Nginx)
app.set('trust proxy', 1);

// Redis client configuration
const redisClient = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    enableOfflineQueue: true,
    maxRetriesPerRequest: null,
});
redisClient.on('ready', () => {
    console.log('Redis ready');
});
redisClient.on('error', (err) => {
    // Suppress verbose Redis connection errors if Redis isn't configured locally
    if (err.code !== 'ECONNREFUSED') {
        console.error('Redis Client Error:', err);
    }
});

// Apply global optional auth middleware first to decode JWT (if present) without blocking guests
app.use(decodeToken);

// Apply global rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: (req) => {
        // Dynamic limit logic based on role
        if (req.user) {
            if (req.user.isSuperAdmin) return 1000;
            if (req.user.isAdmin) return 500;
            return 200; // Normal authenticated user
        }
        return 500; // Unauthenticated guest fallback (increased for SPA interactions)
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    store: new RedisStore({
        sendCommand: (...args) => redisClient.call(...args),
    }),
    keyGenerator: (req, res) => {
        if (req.user && req.user.id) {
            return `user_${req.user.id}`; // user-based limiting
        }
        return `ip_${ipKeyGenerator(req, res)}`; // Fallback to provided IP generator to satisfy IPv6 validation
    },
    message: { message: 'Too many requests, please try again after 15 minutes' },
});
app.use('/api', limiter);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/posts', require('./routes/postRoutes'));
app.use('/api/comments', require('./routes/commentRoutes'));
app.use('/api/friends', require('./routes/friendRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));

// Admin routes
app.use('/api/admin/auth', require('./admin/routes/adminAuthRoutes'));
app.use('/api/admin/posts', require('./admin/routes/adminPostRoutes'));

// Super Admin routes
app.use('/api/superadmin/auth', require('./admin/routes/superAdminAuthRoutes'));
app.use('/api/superadmin/notifications', require('./admin/routes/notificationRoutes'));

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => console.log(`Server started on port ${PORT}`));
