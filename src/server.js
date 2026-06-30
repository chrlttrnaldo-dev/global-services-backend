// ============================================
// MAIN SERVER FILE
// Yeh file sab routes ko jodti hai, Socket.io
// (real-time chat) set up karti hai, aur server
// ko "on" karti hai. Isi file ko hum
// "npm start" se chalayenge.
// ============================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const withdrawRoutes = require('./routes/withdrawRoutes');
const productsRoutes = require('./routes/productsRoutes');
const myShopRoutes = require('./routes/myShopRoutes');
const adminUserRoutes = require('./routes/adminUserRoutes');
const tasksRoutes = require('./routes/tasksRoutes');
const appOptimizationRoutes = require('./routes/appOptimizationRoutes');
const getYourGuideRoutes = require('./routes/getYourGuideRoutes');
const referralCodeRoutes = require('./routes/referralCodeRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const companyDetailsRoutes = require('./routes/companyDetailsRoutes');

const app = express();
const server = http.createServer(app); // Express ko ek "raw" server mein wrap karna, taake Socket.io bhi isi par chal sake

// Socket.io setup - yeh real-time connection ka "dimagh" hai
const io = new Server(server, {
    cors: {
        origin: '*', // Development mein sab jagah se allow, baad mein hum isay apni website ke domain tak limit kar denge
        methods: ['GET', 'POST'],
    },
});

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads')); // Upload ki hui images ko serve karne ke liye

// uploads/chat folder ensure karna (agar nahi hai to bana dena)
const fs = require('fs');
if (!fs.existsSync('uploads/chat')) fs.mkdirSync('uploads/chat', { recursive: true });
if (!fs.existsSync('uploads/products')) fs.mkdirSync('uploads/products', { recursive: true });
if (!fs.existsSync('uploads/company')) fs.mkdirSync('uploads/company', { recursive: true });

// Har request ke saath "io" (socket) ko attach karna,
// taake controllers (jaise chatController) usay use kar sakein
// real-time messages bhejne ke liye.
app.use((req, res, next) => {
    req.io = io;
    next();
});

// ============================================
// ROUTES
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/withdraw', withdrawRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/my-shop', myShopRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/app-optimization-tasks', appOptimizationRoutes);
app.use('/api/getyourguide-task', getYourGuideRoutes);
app.use('/api/referral-codes', referralCodeRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/company-details', companyDetailsRoutes);

app.get('/', (req, res) => {
    res.json({ message: 'Server is running. 🚀' });
});

// ============================================
// SOCKET.IO - REAL-TIME CONNECTION LOGIC
// ============================================
io.on('connection', (socket) => {
    console.log('🔌 Naya connection bana:', socket.id);

    // Jab koi (user ya admin) connect ho, woh apna identity batayega
    // taake hum usay sahi "room" mein daal sakein.
    socket.on('identify', (data) => {
        try {
            const decoded = jwt.verify(data.token, process.env.JWT_SECRET);

            if (decoded.isAdmin) {
                // Admin ko ek special "admin_room" mein daalna,
                // taake usay HAR naye conversation/order ki khabar mil sake.
                socket.join('admin_room');
                console.log(`👮 Admin connected: ${decoded.userId}`);
            } else {
                // Har user ko apna "personal room" milta hai,
                // taake usay sirf uske apne notifications milein
                // (jaise "product sold", "order approved", etc.)
                socket.join(`user_${decoded.userId}`);
                console.log(`👤 User connected: ${decoded.userId}`);
            }
        } catch (error) {
            console.log('Identify failed - invalid token');
        }
    });

    // Jab koi user ya admin kisi specific chat ko khole,
    // woh us chat ke "room" mein join ho jata hai,
    // taake sirf usi chat ke messages usay milein.
    socket.on('join_conversation', (conversationId) => {
        socket.join(`conversation_${conversationId}`);
        console.log(`📨 Socket ${socket.id} joined conversation_${conversationId}`);
    });

    socket.on('leave_conversation', (conversationId) => {
        socket.leave(`conversation_${conversationId}`);
    });

    socket.on('disconnect', () => {
        console.log('❌ Connection band hui:', socket.id);
    });
});

// ============================================
// SERVER START KARNA
// ============================================
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`✅ Server start ho gaya: http://localhost:${PORT}`);
});
