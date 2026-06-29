// ============================================
// ADMIN - USER LOOKUP CONTROLLER
// Yeh sabse zaroori Admin Panel feature hai.
// Admin jab kisi User ID ko search kare, yahan se
// us user ki POORI detail ek sath mil jati hai:
// balance, tasks, my shop, withdraws, chats - sab kuch.
// Yahan se admin har cheez control kar sakta hai:
// balance, shop unlock/lock, premium/referral, products.
// ============================================

const pool = require('../config/database');
const { createNotification } = require('./notificationController');
const { hashPassword } = require('../utils/passwordHelper');

// ============================================
// ADMIN: Saare users ki basic list dekhna (search/browse karne ke liye)
// ============================================
async function getAllUsers(req, res) {
    try {
        const { search } = req.query; // search by name, email, ya ID

        let query = `
            SELECT id, full_name, email, balance, is_admin, premium_unlocked,
                   referral_unlocked, own_referral_code, created_at
            FROM users
        `;
        const params = [];

        if (search) {
            params.push(`%${search}%`);
            // Agar search number hai, ID se bhi match karne ki koshish
            if (!isNaN(search)) {
                query += ` WHERE id = $${params.length + 1} OR full_name ILIKE $1 OR email ILIKE $1`;
                params.push(search);
            } else {
                query += ` WHERE full_name ILIKE $1 OR email ILIKE $1`;
            }
        }

        query += ' ORDER BY created_at DESC';

        const result = await pool.query(query, params);
        return res.status(200).json({ success: true, users: result.rows });

    } catch (error) {
        console.error('Get all users error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
}

// ============================================
// ADMIN: Ek user ki POORI detail dekhna
// (Yeh "User ID search karke khol dena" wala feature hai)
// ============================================
async function getUserFullProfile(req, res) {
    try {
        const { userId } = req.params;

        // 1. Basic user info
        const userResult = await pool.query(
            `SELECT id, full_name, email, balance, balance_display_mode, vip_level, is_admin, premium_unlocked,
                    referral_unlocked, own_referral_code, used_referral_code, created_at
             FROM users WHERE id = $1`,
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        const user = userResult.rows[0];

        // 2. My Shop history (listed, sold, processing, delivered, lost - sab)
        const shopResult = await pool.query(
            `SELECT ms.*, p.product_name, p.selling_price
             FROM my_shop ms
             JOIN products p ON ms.product_id = p.id
             WHERE ms.user_id = $1
             ORDER BY ms.listed_at DESC`,
            [userId]
        );

        // 3. Withdraw history
        const withdrawResult = await pool.query(
            'SELECT * FROM withdraw_requests WHERE user_id = $1 ORDER BY requested_at DESC',
            [userId]
        );

        // 4. Saari conversations (chats) jo is user ne ki hain
        const conversationsResult = await pool.query(
            'SELECT * FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC',
            [userId]
        );

        // 5. Quick stats - har task type ki alag situation
        const taskProofStats = await pool.query(
            `SELECT status, COUNT(*) as count FROM conversations
             WHERE user_id = $1 AND conversation_type = 'task_proof' GROUP BY status`,
            [userId]
        );
        const appOptStats = await pool.query(
            `SELECT status, COUNT(*) as count FROM conversations
             WHERE user_id = $1 AND conversation_type = 'app_optimization_proof' GROUP BY status`,
            [userId]
        );
        const getYourGuideStats = await pool.query(
            `SELECT status, COUNT(*) as count FROM conversations
             WHERE user_id = $1 AND conversation_type = 'getyourguide_proof' GROUP BY status`,
            [userId]
        );
        const premiumUnlockStats = await pool.query(
            `SELECT status FROM conversations
             WHERE user_id = $1 AND conversation_type = 'premium_unlock' ORDER BY created_at DESC LIMIT 1`,
            [userId]
        );
        const referralUnlockStats = await pool.query(
            `SELECT status FROM conversations
             WHERE user_id = $1 AND conversation_type = 'referral_unlock' ORDER BY created_at DESC LIMIT 1`,
            [userId]
        );

        return res.status(200).json({
            success: true,
            profile: {
                user,
                myShop: shopResult.rows,
                withdrawHistory: withdrawResult.rows,
                conversations: conversationsResult.rows,
                taskBreakdown: {
                    normalTasks: taskProofStats.rows,                 // [{status: 'resolved', count: 5}, {status: 'open', count: 1}]
                    appOptimizationTasks: appOptStats.rows,
                    getYourGuideTask: getYourGuideStats.rows,
                    premiumUnlockLatestStatus: premiumUnlockStats.rows[0]?.status || 'never_requested',
                    referralUnlockLatestStatus: referralUnlockStats.rows[0]?.status || 'never_requested',
                },
                stats: {
                    totalProductsListed: shopResult.rows.length,
                    totalProductsSold: shopResult.rows.filter(s => s.status !== 'listed').length,
                },
            },
        });

    } catch (error) {
        console.error('Get user full profile error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
}

// ============================================
// ADMIN: User ka balance manually adjust karna
// (amount POSITIVE ho to addition, NEGATIVE ho to deduction)
// Har change ka record balance_history mein save hota hai,
// aur user ko real-time notification jati hai.
// ============================================
async function adjustUserBalance(req, res) {
    try {
        const { userId } = req.params;
        const { amount, reason } = req.body; // amount: +50 ya -20, dono valid

        if (amount === undefined || amount === 0) {
            return res.status(400).json({ success: false, message: 'Please enter a valid amount (positive or negative).' });
        }

        const userResult = await pool.query('SELECT balance FROM users WHERE id = $1', [userId]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        const currentBalance = parseFloat(userResult.rows[0].balance);
        const newBalance = currentBalance + parseFloat(amount);

        // NOTE: Negative balance ab allow hai (Due/red mode ke liye zaroori hai)

        // Balance update karna
        const updateResult = await pool.query(
            'UPDATE users SET balance = $1 WHERE id = $2 RETURNING id, full_name, balance',
            [newBalance.toFixed(2), userId]
        );

        // History mein record karna (taake frontend par green/red dikha sakein)
        await pool.query(
            `INSERT INTO balance_history (user_id, amount, reason, balance_after)
             VALUES ($1, $2, $3, $4)`,
            [userId, amount, reason || null, newBalance.toFixed(2)]
        );

        // Real-time notification - user ko turant pata chal jaye
        const notifTitle = amount > 0 ? 'Balance Added' : 'Balance Deducted';
        const notifMsg = amount > 0
            ? `$${amount} has been added to your balance.${reason ? ' Reason: ' + reason : ''}`
            : `$${Math.abs(amount)} has been deducted from your balance.${reason ? ' Reason: ' + reason : ''}`;
        const notifBalance = await createNotification(userId, notifTitle, notifMsg);

        if (req.io) {
            req.io.to(`user_${userId}`).emit('balance_updated', {
                amount: parseFloat(amount),
                newBalance: newBalance.toFixed(2),
                reason: reason || null,
                isDeduction: amount < 0,
            });
            req.io.to(`user_${userId}`).emit('new_notification', notifBalance.rows[0]);
        }

        return res.status(200).json({
            success: true,
            message: amount > 0
                ? `$${amount} balance mein add kar diye gaye.`
                : `$${Math.abs(amount)} balance se kaat diye gaye.`,
            user: updateResult.rows[0],
        });

    } catch (error) {
        console.error('Adjust user balance error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
}

// ============================================
// ADMIN/USER: Balance history dekhna (green/red entries)
// ============================================
async function getBalanceHistory(req, res) {
    try {
        const { userId } = req.params;

        // Security: agar request user ki taraf se hai (admin nahi), check karo yeh uski hi history hai
        if (!req.user.isAdmin && parseInt(userId) !== req.user.userId) {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }

        const result = await pool.query(
            'SELECT * FROM balance_history WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );

        return res.status(200).json({ success: true, history: result.rows });

    } catch (error) {
        console.error('Get balance history error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
}

// ============================================
// ADMIN: Balance Display Mode badalna (normal/green ya due/red)
// Yeh ASAL balance number change NAHI karta - sirf
// dashboard par kaise dikhega yeh control karta hai.
// ============================================
async function setBalanceDisplayMode(req, res) {
    try {
        const { userId } = req.params;
        const { mode } = req.body; // 'normal' ya 'due'

        if (!['normal', 'due'].includes(mode)) {
            return res.status(400).json({ success: false, message: "Mode must be 'normal' or 'due'." });
        }

        const result = await pool.query(
            'UPDATE users SET balance_display_mode = $1 WHERE id = $2 RETURNING id, full_name, balance, balance_display_mode',
            [mode, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        // Real-time: user ke dashboard ko turant refresh karne ke liye
        if (req.io) {
            req.io.to(`user_${userId}`).emit('balance_display_mode_changed', {
                mode,
                balance: result.rows[0].balance,
            });
        }

        return res.status(200).json({
            success: true,
            message: `Balance display mode "${mode}" set kar diya gaya.`,
            user: result.rows[0],
        });

    } catch (error) {
        console.error('Set balance display mode error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
}

// ============================================
// ADMIN: Premium (Shop) unlock/lock toggle karna - DIRECT, chat ke bina
// ============================================
async function togglePremiumUnlock(req, res) {
    try {
        const { userId } = req.params;
        const { unlocked } = req.body; // true ya false

        const result = await pool.query(
            'UPDATE users SET premium_unlocked = $1 WHERE id = $2 RETURNING id, full_name, premium_unlocked',
            [unlocked, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        if (req.io) {
            req.io.to(`user_${userId}`).emit('premium_status_changed', { unlocked });
        }

        return res.status(200).json({
            success: true,
            message: unlocked ? 'Shop unlock kar diya gaya.' : 'Shop lock kar diya gaya.',
            user: result.rows[0],
        });
    } catch (error) {
        console.error('Toggle premium unlock error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
}

// ============================================
// ADMIN: Referral unlock/lock toggle karna - DIRECT, chat ke bina
// ============================================
async function toggleReferralUnlock(req, res) {
    try {
        const { userId } = req.params;
        const { unlocked } = req.body;

        const result = await pool.query(
            'UPDATE users SET referral_unlocked = $1 WHERE id = $2 RETURNING id, full_name, referral_unlocked',
            [unlocked, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        if (req.io) {
            req.io.to(`user_${userId}`).emit('referral_status_changed', { unlocked });
        }

        return res.status(200).json({
            success: true,
            message: unlocked ? 'Referral unlock kar diya gaya.' : 'Referral lock kar diya gaya.',
            user: result.rows[0],
        });
    } catch (error) {
        console.error('Toggle referral unlock error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
}

// ============================================
// USER: Apna khud ka current status fetch karna
// (balance, display mode, premium/referral lock status)
// Yeh login ke baad refresh/reload par use hota hai
// taake hamesha latest status mile.
// ============================================
async function getMyStatus(req, res) {
    try {
        const userId = req.user.userId;
        const result = await pool.query(
            `SELECT id, full_name, email, balance, balance_display_mode,
                    premium_unlocked, referral_unlocked, own_referral_code, vip_level
             FROM users WHERE id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        return res.status(200).json({ success: true, user: result.rows[0] });
    } catch (error) {
        console.error('Get my status error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
}

// ============================================
// ADMIN: VIP Level set karna (1-4)
// ============================================
async function setVipLevel(req, res) {
    try {
        const { userId } = req.params;
        const { level } = req.body;

        if (![1, 2, 3, 4].includes(parseInt(level))) {
            return res.status(400).json({ success: false, message: 'VIP level must be between 1 and 4.' });
        }

        const result = await pool.query(
            'UPDATE users SET vip_level = $1 WHERE id = $2 RETURNING id, full_name, vip_level',
            [level, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        if (req.io) {
            req.io.to(`user_${userId}`).emit('vip_level_changed', { level: parseInt(level) });
        }

        return res.status(200).json({ success: true, message: `VIP Level ${level} set kar diya gaya.`, user: result.rows[0] });
    } catch (error) {
        console.error('Set VIP level error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
}

// ============================================
// ADMIN: Direct password reset (login ya withdraw) - seedha User Profile se, chat ke bina
// ============================================
async function adminResetUserPassword(req, res) {
    try {
        const { userId } = req.params;
        const { passwordType, newPassword } = req.body; // passwordType: 'login' ya 'withdraw'

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
        }
        if (!['login', 'withdraw'].includes(passwordType)) {
            return res.status(400).json({ success: false, message: "Password type must be 'login' or 'withdraw'." });
        }

        const newPasswordHash = await hashPassword(newPassword);
        const column = passwordType === 'login' ? 'password_hash' : 'withdraw_password_hash';

        const result = await pool.query(
            `UPDATE users SET ${column} = $1 WHERE id = $2 RETURNING id, full_name`,
            [newPasswordHash, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        const notifLabel = passwordType === 'login' ? 'Login Password' : 'Withdraw Password';
        const notif = await createNotification(userId, `${notifLabel} Reset`, `Your ${notifLabel.toLowerCase()} has been reset by Support. Please contact Support if you did not request this.`);

        if (req.io) {
            req.io.to(`user_${userId}`).emit('new_notification', notif.rows[0]);
        }

        return res.status(200).json({ success: true, message: `${notifLabel} reset kar diya gaya.` });
    } catch (error) {
        console.error('Admin reset user password error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
}

module.exports = {
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
};
