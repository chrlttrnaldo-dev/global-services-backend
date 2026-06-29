// ============================================
// ADMIN USER ROUTES
// ============================================

const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const {
    getAllUsers,
    getUserFullProfile,
    adjustUserBalance,
    getBalanceHistory,
    setBalanceDisplayMode,
    togglePremiumUnlock,
    toggleReferralUnlock,
    getMyStatus,
    setVipLevel,
    adminResetUserPassword,
} = require('../controllers/adminUserController');

// User: apna khud ka status (balance, lock status, display mode) fetch karna
router.get('/my-status', verifyToken, getMyStatus);

// Saare users dekhna / search karna
router.get('/all', verifyToken, verifyAdmin, getAllUsers);

// VIP level set karna
router.post('/:userId/vip-level', verifyToken, verifyAdmin, setVipLevel);

// Direct password reset (login ya withdraw) - chat ke bina
router.post('/:userId/reset-password', verifyToken, verifyAdmin, adminResetUserPassword);

// Ek user ki poori profile dekhna (search se "open" karne wala feature)
router.get('/:userId/profile', verifyToken, verifyAdmin, getUserFullProfile);

// Balance adjust karna (add ya minus, amount ke sign se decide hota hai)
router.post('/:userId/adjust-balance', verifyToken, verifyAdmin, adjustUserBalance);

// Balance history dekhna (user khud bhi dekh sakta hai apni, admin sab ki)
router.get('/:userId/balance-history', verifyToken, getBalanceHistory);

// Balance display mode badalna (normal/green ya due/red) - asal balance change nahi hota
router.post('/:userId/display-mode', verifyToken, verifyAdmin, setBalanceDisplayMode);

// Shop (Premium) direct unlock/lock - bina chat ke
router.post('/:userId/toggle-premium', verifyToken, verifyAdmin, togglePremiumUnlock);

// Referral direct unlock/lock - bina chat ke
router.post('/:userId/toggle-referral', verifyToken, verifyAdmin, toggleReferralUnlock);

module.exports = router;
