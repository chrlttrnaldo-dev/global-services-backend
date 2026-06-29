// ============================================
// GETYOURGUIDE TASK ROUTES
// ============================================

const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const { getTask, updateTask } = require('../controllers/getYourGuideController');

router.get('/', verifyToken, getTask); // User aur Admin dono dekh sakte hain
router.put('/admin/update', verifyToken, verifyAdmin, updateTask);

module.exports = router;
