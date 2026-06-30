// ============================================
// CHAT CONTROLLER
// Yeh poora "Conversations + Messages" system
// handle karta hai - password reset, support,
// task proof, app optimization proof, premium
// unlock, referral unlock - sab isi se jaate hain.
// ============================================

const pool = require('../config/database');
const { createNotification } = require('./notificationController');
const { hashPassword } = require('../utils/passwordHelper');
const cloudinary = require('../config/cloudinary');

// ============================================
// Helper: Cloudinary image URL se uska "public_id"
// nikalna (taake cloudinary.uploader.destroy() ko
// sahi value di ja sake aur Cloudinary se bhi
// image hamesha ke liye delete ho)
// ============================================
function extractCloudinaryPublicId(url) {
    try {
        const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+(?:\?.*)?$/);
        return match ? match[1] : null;
    } catch (err) {
        return null;
    }
}

// ============================================
// USER: Nayi conversation shuru karna
// (e.g. "Forgot Password", "Mujhe support chahiye", "Task complete kiya")
// ============================================
async function startConversation(req, res) {
    try {
        const userId = req.user.userId;
        const { conversationType, firstMessageText, firstMessageImageUrl, relatedTaskId, relatedAppTaskId } = req.body;

        const validTypes = [
            'password_reset',
            'general_support',
            'task_proof',
            'app_optimization_proof',
            'getyourguide_proof',
            'premium_unlock',
            'referral_unlock',
            'deposit_request',
        ];

        if (!validTypes.includes(conversationType)) {
            return res.status(400).json({ success: false, message: 'Invalid conversation type.' });
        }

        // Naya conversation banana
        const convResult = await pool.query(
            `INSERT INTO conversations (user_id, conversation_type, related_task_id, related_app_task_id)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [userId, conversationType, relatedTaskId || null, relatedAppTaskId || null]
        );

        const conversation = convResult.rows[0];

        // Pehla message bhi add karna (agar diya gaya ho)
        if (firstMessageText || firstMessageImageUrl) {
            await pool.query(
                `INSERT INTO messages (conversation_id, sender_type, message_text, image_url)
                 VALUES ($1, 'user', $2, $3)`,
                [conversation.id, firstMessageText || null, firstMessageImageUrl || null]
            );
        }

        // Real-time: admin ko notify karna (yeh function server.js mein socket setup se aata hai)
        if (req.io) {
            req.io.to('admin_room').emit('new_conversation', conversation);
        }

        return res.status(201).json({ success: true, conversation });

    } catch (error) {
        console.error('Start conversation error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
}

// ============================================
// USER: Apni saari conversations dekhna
// ============================================
async function getMyConversations(req, res) {
    try {
        const userId = req.user.userId;
        const result = await pool.query(
            `SELECT * FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC`,
            [userId]
        );
        return res.status(200).json({ success: true, conversations: result.rows });
    } catch (error) {
        console.error('Get my conversations error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
}

// ============================================
// ADMIN: Saari conversations dekhna (sab users ki)
// Filter ho sakti hai type/status se
// ============================================
async function getAllConversations(req, res) {
    try {
        const { type, status } = req.query;

        let query = `
            SELECT c.*, u.full_name, u.email
            FROM conversations c
            JOIN users u ON c.user_id = u.id
            WHERE 1=1
        `;
        const params = [];

        if (type) {
            params.push(type);
            query += ` AND c.conversation_type = $${params.length}`;
        }
        if (status) {
            params.push(status);
            query += ` AND c.status = $${params.length}`;
        }

        query += ' ORDER BY c.updated_at DESC';

        const result = await pool.query(query, params);
        return res.status(200).json({ success: true, conversations: result.rows });
    } catch (error) {
        console.error('Get all conversations error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
}

// ============================================
// Conversation ke saare messages dekhna
// (User aur Admin dono yeh use karenge)
// ============================================
async function getMessages(req, res) {
    try {
        const { conversationId } = req.params;

        // Security: agar user hai (admin nahi), to check karo yeh uski hi conversation hai
        if (!req.user.isAdmin) {
            const check = await pool.query(
                'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
                [conversationId, req.user.userId]
            );
            if (check.rows.length === 0) {
                return res.status(403).json({ success: false, message: 'This conversation does not belong to you.' });
            }
        }

        const result = await pool.query(
            'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
            [conversationId]
        );
        return res.status(200).json({ success: true, messages: result.rows });
    } catch (error) {
        console.error('Get messages error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
}

// ============================================
// Naya message bhejna (User ya Admin dono use karenge)
// ============================================
async function sendMessage(req, res) {
    try {
        const { conversationId } = req.params;
        const { messageText, imageUrl } = req.body;
        const senderType = req.user.isAdmin ? 'admin' : 'user';

        if (!messageText && !imageUrl) {
            return res.status(400).json({ success: false, message: 'A message or image is required.' });
        }

        // Security: agar user hai, check karo yeh uski conversation hai
        if (senderType === 'user') {
            const check = await pool.query(
                'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
                [conversationId, req.user.userId]
            );
            if (check.rows.length === 0) {
                return res.status(403).json({ success: false, message: 'This conversation does not belong to you.' });
            }
        }

        const result = await pool.query(
            `INSERT INTO messages (conversation_id, sender_type, message_text, image_url)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [conversationId, senderType, messageText || null, imageUrl || null]
        );

        // Conversation ka "updated_at" time refresh karna (taake list mein sab se upar aaye)
        await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conversationId]);

        const newMessage = result.rows[0];

        // Conversation ka user_id nikalna (notification banane ke liye)
        const convInfo = await pool.query('SELECT user_id FROM conversations WHERE id = $1', [conversationId]);
        const conversationUserId = convInfo.rows[0]?.user_id;

        // Agar ADMIN ne reply kiya hai, to USER ke liye notification banani hai
        // (taake bell icon mein dikhe, chahe user abhi chat na dekh raha ho)
        let notification = null;
        if (senderType === 'admin' && conversationUserId) {
            const notifResult = await createNotification(
                conversationUserId,
                'New message from Support',
                messageText || 'Sent an attachment',
                conversationId
            );
            notification = notifResult.rows[0];
        }

        // Real-time: doosri taraf ko turant message bhej dena
        if (req.io) {
            req.io.to(`conversation_${conversationId}`).emit('new_message', newMessage);
            if (senderType === 'user') {
                req.io.to('admin_room').emit('conversation_updated', { conversationId });
            }
            if (senderType === 'admin' && notification) {
                // User ko real-time pop-up + bell update dono
                req.io.to(`user_${conversationUserId}`).emit('new_notification', notification);
            }
        }

        return res.status(201).json({ success: true, message: newMessage });

    } catch (error) {
        console.error('Send message error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
}

// ============================================
// ADMIN: Conversation ko "resolved" mark karna
// ============================================
async function resolveConversation(req, res) {
    try {
        const { conversationId } = req.params;
        await pool.query("UPDATE conversations SET status = 'resolved' WHERE id = $1", [conversationId]);
        return res.status(200).json({ success: true, message: 'Conversation resolved.' });
    } catch (error) {
        console.error('Resolve conversation error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
}

// ============================================
// ADMIN: Special Action - Password Reset karna
// Yeh password reset karta hai AUR khud chat mein
// message bhi bhej deta hai naye password ke saath.
// ============================================
async function adminSetNewPassword(req, res) {
    try {
        const { conversationId } = req.params;
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
        }

        const convResult = await pool.query(
            "SELECT * FROM conversations WHERE id = $1 AND conversation_type = 'password_reset'",
            [conversationId]
        );
        if (convResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Conversation not found.' });
        }

        const userId = convResult.rows[0].user_id;
        const newPasswordHash = await hashPassword(newPassword);

        // Password update karna
        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newPasswordHash, userId]);

        // Khud automatic message bhejna chat mein naye password ke saath
        const msgResult = await pool.query(
            `INSERT INTO messages (conversation_id, sender_type, message_text)
             VALUES ($1, 'admin', $2) RETURNING *`,
            [conversationId, `Your new password has been set: ${newPassword}\nPlease log in with this password. You may change it later if needed.`]
        );

        await pool.query("UPDATE conversations SET status = 'resolved', updated_at = NOW() WHERE id = $1", [conversationId]);

        const notifPwd = await createNotification(userId, 'Password Reset', 'Your new password has been set by Support. Check the chat for details.', conversationId);

        if (req.io) {
            req.io.to(`conversation_${conversationId}`).emit('new_message', msgResult.rows[0]);
            req.io.to(`user_${userId}`).emit('new_notification', notifPwd.rows[0]);
        }

        return res.status(200).json({ success: true, message: 'New password set and user notified in chat.' });

    } catch (error) {
        console.error('Admin set new password error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
}

// ============================================
// ADMIN: Special Action - Task/App-Optimization proof Verify karna
// Yeh balance add karta hai AUR chat mein bata deta hai
// ============================================
async function adminVerifyAndReward(req, res) {
    try {
        const { conversationId } = req.params;
        const { rewardAmount } = req.body;

        if (!rewardAmount || rewardAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Please enter a valid reward amount.' });
        }

        const convResult = await pool.query('SELECT * FROM conversations WHERE id = $1', [conversationId]);
        if (convResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Conversation not found.' });
        }

        const userId = convResult.rows[0].user_id;

        // Balance add karna
        const userResult = await pool.query('SELECT balance FROM users WHERE id = $1', [userId]);
        const newBalance = parseFloat(userResult.rows[0].balance) + parseFloat(rewardAmount);
        await pool.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance.toFixed(2), userId]);

        // History mein record karna (green/positive entry)
        await pool.query(
            `INSERT INTO balance_history (user_id, amount, reason, balance_after)
             VALUES ($1, $2, $3, $4)`,
            [userId, rewardAmount, 'Task verified and rewarded', newBalance.toFixed(2)]
        );

        // Chat mein confirmation message
        const msgResult = await pool.query(
            `INSERT INTO messages (conversation_id, sender_type, message_text)
             VALUES ($1, 'admin', $2) RETURNING *`,
            [conversationId, `Verified! $${rewardAmount} has been added to your balance.`]
        );

        await pool.query("UPDATE conversations SET status = 'resolved', updated_at = NOW() WHERE id = $1", [conversationId]);

        const notif1 = await createNotification(userId, 'Task Verified', `$${rewardAmount} has been added to your balance.`, conversationId);

        if (req.io) {
            req.io.to(`conversation_${conversationId}`).emit('new_message', msgResult.rows[0]);
            req.io.to(`user_${userId}`).emit('new_notification', notif1.rows[0]);
            // Dedicated notification - dashboard par turant balance update aur notification dikhane ke liye
            req.io.to(`user_${userId}`).emit('balance_updated', {
                amount: parseFloat(rewardAmount),
                newBalance: newBalance.toFixed(2),
                reason: 'Task verified and rewarded',
                isDeduction: false,
            });
        }

        return res.status(200).json({ success: true, message: 'Verify ho gaya aur balance add ho gaya.' });

    } catch (error) {
        console.error('Admin verify and reward error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
}

// ============================================
// ADMIN: Special Action - Premium Unlock approve karna
// ============================================
async function adminApprovePremiumUnlock(req, res) {
    try {
        const { conversationId } = req.params;

        const convResult = await pool.query('SELECT * FROM conversations WHERE id = $1', [conversationId]);
        if (convResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Conversation not found.' });
        }
        const userId = convResult.rows[0].user_id;

        await pool.query('UPDATE users SET premium_unlocked = TRUE WHERE id = $1', [userId]);

        const msgResult = await pool.query(
            `INSERT INTO messages (conversation_id, sender_type, message_text)
             VALUES ($1, 'admin', 'Your Premium Tasks have been unlocked! You can now open your own shop and start listing products.') RETURNING *`,
            [conversationId]
        );

        await pool.query("UPDATE conversations SET status = 'resolved', updated_at = NOW() WHERE id = $1", [conversationId]);

        const notifShop = await createNotification(userId, 'Shop Unlocked!', 'Your shop access has been approved. You can now open your own shop and list products.', conversationId);

        if (req.io) {
            req.io.to(`conversation_${conversationId}`).emit('new_message', msgResult.rows[0]);
            req.io.to(`user_${userId}`).emit('new_notification', notifShop.rows[0]);
            req.io.to(`user_${userId}`).emit('premium_status_changed', { unlocked: true });
        }

        return res.status(200).json({ success: true, message: 'Premium Tasks unlock kar diye gaye.' });
    } catch (error) {
        console.error('Admin approve premium unlock error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
}

// ============================================
// ADMIN: Special Action - Referral Unlock approve karna
// ============================================
async function adminApproveReferralUnlock(req, res) {
    try {
        const { conversationId } = req.params;

        const convResult = await pool.query('SELECT * FROM conversations WHERE id = $1', [conversationId]);
        if (convResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Conversation not found.' });
        }
        const userId = convResult.rows[0].user_id;

        await pool.query('UPDATE users SET referral_unlocked = TRUE WHERE id = $1', [userId]);

        const msgResult = await pool.query(
            `INSERT INTO messages (conversation_id, sender_type, message_text)
             VALUES ($1, 'admin', 'Your referral feature has been unlocked! You can now refer others and earn commissions.') RETURNING *`,
            [conversationId]
        );

        await pool.query("UPDATE conversations SET status = 'resolved', updated_at = NOW() WHERE id = $1", [conversationId]);

        const notifRef = await createNotification(userId, 'Referral Unlocked', 'Your referral feature has been unlocked by Support.', conversationId);

        if (req.io) {
            req.io.to(`conversation_${conversationId}`).emit('new_message', msgResult.rows[0]);
            req.io.to(`user_${userId}`).emit('new_notification', notifRef.rows[0]);
            req.io.to(`user_${userId}`).emit('referral_status_changed', { unlocked: true });
        }

        return res.status(200).json({ success: true, message: 'Referral feature unlock kar diya gaya.' });
    } catch (error) {
        console.error('Admin approve referral unlock error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
}

// ============================================
// ADMIN: Ek message ki image delete karna
// (Cloudinary se bhi aur database se bhi)
// RULE: Deposit chat ('deposit_request') ki images
// kabhi delete nahi hongi — yeh payment proof hai,
// safe rehni chahiye. Baqi har chat type mein
// CS image delete kar sakta hai.
// ============================================
async function deleteMessageImage(req, res) {
    try {
        const { messageId } = req.params;

        const result = await pool.query(
            `SELECT m.*, c.conversation_type
             FROM messages m
             JOIN conversations c ON m.conversation_id = c.id
             WHERE m.id = $1`,
            [messageId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Message not found.' });
        }

        const message = result.rows[0];

        if (!message.image_url) {
            return res.status(400).json({ success: false, message: 'This message has no image.' });
        }

        // Deposit chat ki images kabhi delete nahi karni — payment proof safe rakhna zaroori hai
        if (message.conversation_type === 'deposit_request') {
            return res.status(403).json({ success: false, message: 'Deposit chat images cannot be deleted.' });
        }

        // Cloudinary se bhi delete karna (sirf DB se hatana kaafi nahi, warna storage bharta rahega)
        const publicId = extractCloudinaryPublicId(message.image_url);
        if (publicId) {
            try {
                await cloudinary.uploader.destroy(publicId);
            } catch (cloudErr) {
                console.error('Cloudinary delete error (DB se hata rahe hain phir bhi):', cloudErr);
            }
        }

        await pool.query('UPDATE messages SET image_url = NULL WHERE id = $1', [messageId]);

        // Real-time: doosri taraf (user ka chat ya doosra admin tab) ko bhi turant batana
        if (req.io) {
            req.io.to(`conversation_${message.conversation_id}`).emit('message_image_deleted', {
                messageId: message.id,
                conversationId: message.conversation_id,
            });
            req.io.to('admin_room').emit('message_image_deleted', {
                messageId: message.id,
                conversationId: message.conversation_id,
            });
        }

        return res.status(200).json({ success: true, message: 'Image deleted.' });
    } catch (error) {
        console.error('Delete message image error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
}

module.exports = {
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
    deleteMessageImage,
};
