const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
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

// ─── Redis clients ────────────────────────────────────────────────────────────
// Three separate ioredis connections:
//   redisClient  → rate-limit store (shared, general-purpose)
//   redisPub     → Socket.IO adapter publisher  (dedicated — Redis pub/sub requires it)
//   redisSub     → Socket.IO adapter subscriber (dedicated — Redis pub/sub requires it)
//
// Why dedicated pub/sub connections?
//   Once a connection enters subscribe mode it can ONLY issue subscribe commands.
//   Sharing it with the rate-limit store would break both.
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const REDIS_OPTS = {
    enableOfflineQueue: false, // Prevents hanging if Redis is down
    maxRetriesPerRequest: 3,
    connectTimeout: 5000
};

const redisClient = new Redis(REDIS_URL, REDIS_OPTS);   // rate-limit store
const redisPub = new Redis(REDIS_URL, REDIS_OPTS);   // socket.io pub
const redisSub = new Redis(REDIS_URL, REDIS_OPTS);   // socket.io sub

// Track Redis health
let isRedisConnected = false;
redisClient.on('connect', () => {
    isRedisConnected = true;
    console.log('[Redis] Connected to server');
});
redisClient.on('error', () => {
    isRedisConnected = false;
});

function logRedis(label, client) {
    client.on('ready', () => console.log(`[Redis] ${label} ready`));
    client.on('error', (err) => {
        if (err.code !== 'ECONNREFUSED') {
            console.error(`[Redis] ${label} error:`, err.message);
        }
    });
}
logRedis('rate-limit', redisClient);
logRedis('socket-pub', redisPub);
logRedis('socket-sub', redisSub);

// ─── CORS origins ─────────────────────────────────────────────────────────────
// Set CORS_ORIGINS in your .env as a comma-separated list of allowed origins.
// Defaults cover local dev (Vite ports) and Docker (port 3000).
const CORS_ORIGINS = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
    : [
        'http://localhost:5173',
        'http://localhost:8080',
        'http://localhost:3000',
        'https://vacancyamerica-frontend.vercel.app'
    ];

// ─── Socket.io setup ──────────────────────────────────────────────────────────
const io = new Server(server, {
    cors: {
        origin: CORS_ORIGINS,
        methods: ['GET', 'POST']
    }
});

// Attach Redis adapter BEFORE setupChatSocket so ALL namespaces (default + /admin)
// inherit it — every Node.js instance will publish/receive events via Redis,
// ensuring real-time sync across horizontally scaled deployments.
redisPub.on('ready', () => {
    redisSub.on('ready', () => {
        io.adapter(createAdapter(redisPub, redisSub));
        console.log('[Socket.IO] Redis adapter attached — multi-instance sync enabled');
    });
});

// Make io accessible in route handlers via req.app.get('io')
app.set('io', io);

// Setup socket event handlers (must come after adapter is configured)
setupChatSocket(io);

app.use(cors({
    origin: CORS_ORIGINS,
}));

// Trust proxy if we are behind a reverse proxy (e.g. Render, Heroku, Nginx)
app.set('trust proxy', 1);

// Apply global optional auth middleware first to decode JWT (if present) without blocking guests
app.use(decodeToken);

// Apply global rate limiting with Redis fallback
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: (req) => {
        if (req.user) {
            if (req.user.isSuperAdmin) return 1000;
            if (req.user.isAdmin) return 500;
            return 200;
        }
        return 500;
    },
    standardHeaders: true,
    legacyHeaders: false,
    // FALLBACK: Use in-memory store if Redis is down
    store: isRedisConnected
        ? new RedisStore({ sendCommand: (...args) => redisClient.call(...args) })
        : undefined, // Default is in-memory
    keyGenerator: (req, res) => {
        if (req.user && req.user.id) return `user_${req.user.id}`;
        return `ip_${ipKeyGenerator(req, res)}`;
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
app.use('/api/activity', require('./routes/activityRoutes'));

app.get("/api/health", (req, res) => {
    res.json({ message: "OK" });
})

// Admin routes
app.use('/api/admin/auth', require('./admin/routes/adminAuthRoutes'));
app.use('/api/admin/posts', require('./admin/routes/adminPostRoutes'));
app.use('/api/admin/chat', require('./admin/routes/adminChatRoutes'));

// Super Admin routes
app.use('/api/superadmin/auth', require('./admin/routes/superAdminAuthRoutes'));
app.use('/api/superadmin/notifications', require('./admin/routes/notificationRoutes'));

const PORT = process.env.PORT || 5000;

async function startServer() {
    try{
        await Promise.all([
            redisClient.ping(),
            redisPub.ping(),
            redisSub.ping()
        ]);

        console.log("✅ Redis fully ready");

        server.listen(PORT, () =>
            console.log(`Server started on port ${PORT}`)
        );
    }catch(err){
        console.error("❌ Redis not ready, retrying...");
        setTimeout(startServer, 5000);  
    }
}

startServer();