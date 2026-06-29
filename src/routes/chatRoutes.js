const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const {
    startConversation,
    getMyConversations,
    getAllConversations,
    getMessages,
    sendMessage,
    resolveConversation,
    adminSetNewPassword,
    adminVerifyAndReward,
    adminApprovePremiumUnlock,
    adminApproveReferralUnlock,
} = require('../controllers/chatController');

// Chat image upload setup
const chatImageStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/chat/'),
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    },
});
const uploadChatImage = multer({ storage: chatImageStorage });

// Image upload route for chat
router.post('/upload-image', verifyToken, uploadChatImage.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Image file is required.' });
    }
    const imageUrl = `/uploads/chat/${req.file.filename}`;
    return res.status(200).json({ success: true, imageUrl });
});

// --- USER routes ---
router.post('/start', verifyToken, startConversation);            // Nayi conversation shuru karna
router.get('/my-conversations', verifyToken, getMyConversations);  // Apni saari chats dekhna
router.get('/:conversationId/messages', verifyToken, getMessages); // Ek chat ke messages dekhna
router.post('/:conversationId/messages', verifyToken, sendMessage); // Message bhejna (user ya admin dono)

// --- ADMIN-only routes ---
router.get('/admin/all', verifyToken, verifyAdmin, getAllConversations);                       // Saari chats dekhna
router.post('/admin/:conversationId/resolve', verifyToken, verifyAdmin, resolveConversation);   // Chat resolve karna
router.post('/admin/:conversationId/set-password', verifyToken, verifyAdmin, adminSetNewPassword); // Password reset karna
router.post('/admin/:conversationId/verify-reward', verifyToken, verifyAdmin, adminVerifyAndReward); // Balance add karna (task/deposit)
router.post('/admin/:conversationId/approve-premium', verifyToken, verifyAdmin, adminApprovePremiumUnlock); // Premium unlock
router.post('/admin/:conversationId/approve-referral', verifyToken, verifyAdmin, adminApproveReferralUnlock); // Referral unlock

module.exports = router;
