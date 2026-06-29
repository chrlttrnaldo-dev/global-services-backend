// ============================================
// WITHDRAW CONTROLLER
// Yeh simple form-based system hai (chat nahi).
// User form fill karta hai -> Admin Approve/Reject karta hai.
// ============================================

const pool = require('../config/database');
const { comparePassword } = require('../utils/passwordHelper');
const { createNotification } = require('./notificationController');

// ============================================
// USER: Withdraw request bhejna
// ============================================
async function createWithdrawRequest(req, res) {
    try {
        const userId = req.user.userId;
        const { amount, receiverName, walletAddress, withdrawPassword } = req.body;

        if (!amount || !receiverName || !walletAddress || !withdrawPassword) {
            return res.status(400).json({ success: false, message: 'All fields are required.' });
        }

        if (amount <= 0) {
            return res.status(400).json({ success: false, message: 'Please enter a valid amount.' });
        }

        // User ka data lena (balance aur withdraw password check karne ke liye)
        const userResult = await pool.query('SELECT balance, withdraw_password_hash FROM users WHERE id = $1', [userId]);
        const user = userResult.rows[0];

        // Withdraw password check karna
        const isPasswordCorrect = await comparePassword(withdrawPassword, user.withdraw_password_hash);
        if (!isPasswordCorrect) {
            return res.status(401).json({ success: false, message: 'Withdraw password is incorrect.' });
        }

        // Balance check karna - amount se zyada na ho
        if (amount > parseFloat(user.balance)) {
            return res.status(400).json({
                success: false,
                message: `Your balance is only $${user.balance}. You cannot withdraw more than this.`,
            });
        }

        // Request create karna
        const result = await pool.query(
            `INSERT INTO withdraw_requests (user_id, amount, receiver_name, wallet_address)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [userId, amount, receiverName, walletAddress]
        );

        // NOTE: Balance abhi nahi kategi - jab admin "Approve" karega tab kategi.
        // Yeh isliye taake reject hone ki soorat mein balance theek rahe.

        return res.status(201).json({
            success: true,
            message: 'Withdraw request submitted. Waiting for admin approval.',
            request: result.rows[0],
        });

    } catch (error) {
        console.error('Create withdraw request error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
}

// ============================================
// USER: Apni saari withdraw requests dekhna (status ke saath)
// ============================================
async function getMyWithdrawRequests(req, res) {
    try {
        const userId = req.user.userId;
        const result = await pool.query(
            'SELECT * FROM withdraw_requests WHERE user_id = $1 ORDER BY requested_at DESC',
            [userId]
        );
        return res.status(200).json({ success: true, requests: result.rows });
    } catch (error) {
        console.error('Get my withdraw requests error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
}

// ============================================
// ADMIN: Saari withdraw requests dekhna
// ============================================
async function getAllWithdrawRequests(req, res) {
    try {
        const { status } = req.query;
        let query = `
            SELECT wr.*, u.full_name, u.email
            FROM withdraw_requests wr
            JOIN users u ON wr.user_id = u.id
        `;
        const params = [];
        if (status) {
            params.push(status);
            query += ` WHERE wr.status = $1`;
        }
        query += ' ORDER BY wr.requested_at DESC';

        const result = await pool.query(query, params);
        return res.status(200).json({ success: true, requests: result.rows });
    } catch (error) {
        console.error('Get all withdraw requests error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
}

// ============================================
// ADMIN: Withdraw Approve karna
// ============================================
async function approveWithdraw(req, res) {
    try {
        const { requestId } = req.params;

        const reqResult = await pool.query('SELECT * FROM withdraw_requests WHERE id = $1', [requestId]);
        if (reqResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Request not found.' });
        }
        const request = reqResult.rows[0];

        if (request.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'This request has already been processed.' });
        }

        // Balance check karna (dobara, taake sure ho ke ab bhi paisa available hai)
        const userResult = await pool.query('SELECT balance FROM users WHERE id = $1', [request.user_id]);
        if (parseFloat(userResult.rows[0].balance) < parseFloat(request.amount)) {
            return res.status(400).json({ success: false, message: 'User does not have sufficient balance for this withdrawal.' });
        }

        // Balance se amount kaatna
        const newBalance = parseFloat(userResult.rows[0].balance) - parseFloat(request.amount);
        await pool.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance.toFixed(2), request.user_id]);

        // History mein deduction record karna (red/negative entry)
        await pool.query(
            `INSERT INTO balance_history (user_id, amount, reason, balance_after)
             VALUES ($1, $2, $3, $4)`,
            [request.user_id, -Math.abs(request.amount), 'Withdraw approved', newBalance.toFixed(2)]
        );

        // Request ko approved mark karna
        await pool.query(
            "UPDATE withdraw_requests SET status = 'approved', reviewed_at = NOW() WHERE id = $1",
            [requestId]
        );

        // Real-time notification - user ko turant pata chal jaye withdraw approve hua
        const notifApprove = await createNotification(request.user_id, 'Withdraw Approved', `Your withdrawal of $${request.amount} has been approved.`);

        if (req.io) {
            req.io.to(`user_${request.user_id}`).emit('withdraw_approved', {
                requestId,
                amount: request.amount,
                newBalance: newBalance.toFixed(2),
            });
            req.io.to(`user_${request.user_id}`).emit('new_notification', notifApprove.rows[0]);
        }

        return res.status(200).json({ success: true, message: 'Withdraw approve kar diya gaya aur balance update ho gaya.' });

    } catch (error) {
        console.error('Approve withdraw error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
}

// ============================================
// ADMIN: Withdraw Reject karna (reason ke saath)
// ============================================
async function rejectWithdraw(req, res) {
    try {
        const { requestId } = req.params;
        const { reason } = req.body;

        if (!reason || reason.trim() === '') {
            return res.status(400).json({ success: false, message: 'A reason is required when rejecting a request.' });
        }

        const reqResult = await pool.query('SELECT * FROM withdraw_requests WHERE id = $1', [requestId]);
        if (reqResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Request not found.' });
        }

        if (reqResult.rows[0].status !== 'pending') {
            return res.status(400).json({ success: false, message: 'This request has already been processed.' });
        }

        await pool.query(
            "UPDATE withdraw_requests SET status = 'rejected', rejection_reason = $1, reviewed_at = NOW() WHERE id = $2",
            [reason, requestId]
        );

        // Real-time notification - user ko turant pata chal jaye withdraw reject hua
        const notifReject = await createNotification(reqResult.rows[0].user_id, 'Withdraw Rejected', `Your withdrawal request was rejected. Reason: ${reason}`);

        if (req.io) {
            req.io.to(`user_${reqResult.rows[0].user_id}`).emit('withdraw_rejected', {
                requestId,
                reason,
            });
            req.io.to(`user_${reqResult.rows[0].user_id}`).emit('new_notification', notifReject.rows[0]);
        }

        return res.status(200).json({ success: true, message: 'Withdraw reject kar diya gaya.' });

    } catch (error) {
        console.error('Reject withdraw error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
}

module.exports = {
    createWithdrawRequest,
    getMyWithdrawRequests,
    getAllWithdrawRequests,
    approveWithdraw,
    rejectWithdraw,
};
