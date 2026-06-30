const express = require('express');
const router = express.Router();
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');
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

// ============================================
// Chat image upload setup — ab Cloudinary par
// (pehle local disk 'uploads/chat/' tha)
// ============================================
const chatImageStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'global-services/chat',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        resource_type: 'image',
    },
});
const uploadChatImage = multer({ storage: chatImageStorage });

// Image upload route for chat
router.post('/upload-image', verifyToken, uploadChatImage.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Image file is required.' });
    }
    // req.file.path Cloudinary ka full secure URL hota hai (multer-storage-cloudinary deta hai)
    const imageUrl = req.file.path;
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
