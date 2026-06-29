// ============================================
// NOTIFICATIONS CONTROLLER
// Har user ke notifications (bell icon list,
// unread count, mark as read).
// ============================================

const pool = require('../config/database');

// Helper function - kisi bhi controller se notification banane ke liye use hoga
async function createNotification(userId, title, message, conversationId = null) {
    return await pool.query(
        `INSERT INTO notifications (user_id, title, message, related_conversation_id)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [userId, title, message, conversationId]
    );
}

// ============================================
// USER: Apni saari notifications dekhna
// ============================================
async function getMyNotifications(req, res) {
    try {
        const userId = req.user.userId;
        const result = await pool.query(
            'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
            [userId]
        );
        const unreadCount = result.rows.filter(n => !n.is_read).length;
        return res.status(200).json({ success: true, notifications: result.rows, unreadCount });
    } catch (error) {
        console.error('Get notifications error:', error);
        return res.status(500).json({ success: false, message: 'Kuch ghalat ho gaya.' });
    }
}

// ============================================
// USER: Notification ko "read" mark karna
// ============================================
async function markAsRead(req, res) {
    try {
        const { notificationId } = req.params;
        const userId = req.user.userId;
        await pool.query(
            'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
            [notificationId, userId]
        );
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Mark as read error:', error);
        return res.status(500).json({ success: false, message: 'Kuch ghalat ho gaya.' });
    }
}

// ============================================
// USER: Saari notifications "read" mark karna
// ============================================
async function markAllAsRead(req, res) {
    try {
        const userId = req.user.userId;
        await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [userId]);
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Mark all as read error:', error);
        return res.status(500).json({ success: false, message: 'Kuch ghalat ho gaya.' });
    }
}

module.exports = {
    createNotification,
    getMyNotifications,
    markAsRead,
    markAllAsRead,
};
