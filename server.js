const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const { setupChatSocket } = require('./socket/chatSocket');

dotenv.config();

connectDB();

const app = express();
const server = http.createServer(app);

// Setup Socket.io with CORS
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Make io accessible in route handlers via req.app.get('io')
app.set('io', io);

// Setup socket event handlers
setupChatSocket(io);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/uploads', express.static('uploads'));

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
