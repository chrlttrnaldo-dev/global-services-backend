// ============================================
// NOTIFICATIONS ROUTES
// ============================================

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const { getMyNotifications, markAsRead, markAllAsRead } = require('../controllers/notificationController');

router.get('/', verifyToken, getMyNotifications);
router.post('/mark-all-read', verifyToken, markAllAsRead);
router.post('/:notificationId/read', verifyToken, markAsRead);

module.exports = router;
