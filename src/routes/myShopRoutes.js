// ============================================
// MY SHOP ROUTES
// ============================================

const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const {
    listProduct,
    getMyShop,
    markAsProcessing,
    getAllShopEntriesAdmin,
    markAsSold,
    approveOrder,
    markAsLost,
    markAsDelivered,
} = require('../controllers/myShopController');

// --- USER routes ---
router.post('/list', verifyToken, listProduct);                              // Product ko shop mein add karna
router.get('/my-shop', verifyToken, getMyShop);                               // Apni shop dekhna
router.post('/:shopItemId/processing', verifyToken, markAsProcessing);       // "Processing" button

// --- ADMIN routes ---
router.get('/admin/all', verifyToken, verifyAdmin, getAllShopEntriesAdmin);
router.post('/admin/:shopItemId/mark-sold', verifyToken, verifyAdmin, markAsSold);
router.post('/admin/:shopItemId/approve', verifyToken, verifyAdmin, approveOrder);
router.post('/admin/:shopItemId/mark-lost', verifyToken, verifyAdmin, markAsLost);
router.post('/admin/:shopItemId/mark-delivered', verifyToken, verifyAdmin, markAsDelivered);

module.exports = router;
