// ============================================
// REFERRAL CODE ROUTES (Admin generates, searches)
// ============================================

const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const { generateCodes, searchCodes } = require('../controllers/referralCodeController');

router.post('/admin/generate', verifyToken, verifyAdmin, generateCodes);
router.get('/admin/search', verifyToken, verifyAdmin, searchCodes);

module.exports = router;
