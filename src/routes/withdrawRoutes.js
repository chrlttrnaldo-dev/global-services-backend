// ============================================
// WITHDRAW ROUTES
// ============================================

const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const {
    createWithdrawRequest,
    getMyWithdrawRequests,
    getAllWithdrawRequests,
    approveWithdraw,
    rejectWithdraw,
} = require('../controllers/withdrawController');

// --- USER routes ---
router.post('/create', verifyToken, createWithdrawRequest);
router.get('/my-requests', verifyToken, getMyWithdrawRequests);

// --- ADMIN routes ---
router.get('/admin/all', verifyToken, verifyAdmin, getAllWithdrawRequests);
router.post('/admin/:requestId/approve', verifyToken, verifyAdmin, approveWithdraw);
router.post('/admin/:requestId/reject', verifyToken, verifyAdmin, rejectWithdraw);

module.exports = router;
