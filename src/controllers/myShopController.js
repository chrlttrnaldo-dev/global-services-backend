// ============================================
// MY SHOP CONTROLLER
// Poora lifecycle yahan handle hota hai:
// listed -> sold -> processing -> ready_to_ship -> delivered
//                                              \-> lost
// ============================================

const pool = require('../config/database');
const { createNotification } = require('./notificationController');

// ============================================
// USER: Product ko apni shop mein "list" karna
// ============================================
async function listProduct(req, res) {
    try {
        const userId = req.user.userId;
        const { productId } = req.body;

        if (!productId) {
            return res.status(400).json({ success: false, message: 'Product ID is required.' });
        }

        // Check karna ke premium unlocked hai ya nahi
        const userResult = await pool.query('SELECT premium_unlocked FROM users WHERE id = $1', [userId]);
        if (!userResult.rows[0].premium_unlocked) {
            return res.status(403).json({ success: false, message: 'Premium Tasks are not unlocked yet.' });
        }

        // Check karna ke yeh product already list to nahi kiya
        const existing = await pool.query(
            'SELECT id FROM my_shop WHERE user_id = $1 AND product_id = $2',
            [userId, productId]
        );
        if (existing.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'This product is already listed.' });
        }

        const result = await pool.query(
            `INSERT INTO my_shop (user_id, product_id) VALUES ($1, $2) RETURNING *`,
            [userId, productId]
        );

        return res.status(201).json({ success: true, shopItem: result.rows[0] });

    } catch (error) {
        console.error('List product error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
}

// ============================================
// USER: Apni My Shop dekhna
// ============================================
async function getMyShop(req, res) {
    try {
        const userId = req.user.userId;

        const result = await pool.query(
            `SELECT ms.*, p.product_name, p.product_link, p.description, p.icon_image_url,
                    p.cost_price, p.profit_percentage, p.selling_price,
                    (p.selling_price - p.cost_price) AS profit_amount
             FROM my_shop ms
             JOIN products p ON ms.product_id = p.id
             WHERE ms.user_id = $1
             ORDER BY p.cost_price ASC`,
            [userId]
        );

        const allItems = result.rows;
        // Listed products: kam price se zyada price (low to high) - already sorted by query
        const listedProducts = allItems.filter((item) => item.status === 'listed');
        // Orders: sabse naya order upar (listed_at se) - alag sort taake purane order neeche na chale jayein
        const orders = allItems
            .filter((item) => item.status !== 'listed')
            .sort((a, b) => new Date(b.listed_at) - new Date(a.listed_at));

        return res.status(200).json({ success: true, listedProducts, orders });

    } catch (error) {
        console.error('Get my shop error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
}

// ============================================
// USER: "Processing" button dabana
// NAYA: Confirm karne se pehle check hota hai ke user ke
// balance mein product ka pura amount (cost_price) hai ya nahi.
// Agar kam hai to process nahi hone dete, error dikhate hain.
// ============================================
async function markAsProcessing(req, res) {
    try {
        const userId = req.user.userId;
        const { shopItemId } = req.params;

        const itemResult = await pool.query(
            `SELECT ms.*, p.cost_price, p.product_name, u.full_name
             FROM my_shop ms
             JOIN products p ON ms.product_id = p.id
             JOIN users u ON ms.user_id = u.id
             WHERE ms.id = $1 AND ms.user_id = $2`,
            [shopItemId, userId]
        );
        if (itemResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }
        const item = itemResult.rows[0];
        if (item.status !== 'sold') {
            return res.status(400).json({ success: false, message: 'This order is not ready for processing yet.' });
        }

        // Balance check - user ke paas product ke cost jitna balance hona zaroori hai
        const costPrice = parseFloat(item.cost_price);
        const userResult = await pool.query('SELECT balance FROM users WHERE id = $1', [userId]);
        const currentBalance = parseFloat(userResult.rows[0].balance);

        if (currentBalance < costPrice) {
            return res.status(400).json({
                success: false,
                message: `Your account does not have enough balance for this product's amount. Required: $${costPrice.toFixed(2)}, Available: $${currentBalance.toFixed(2)}.`,
            });
        }

        await pool.query(
            "UPDATE my_shop SET status = 'processing', processing_at = NOW() WHERE id = $1",
            [shopItemId]
        );

        if (req.io) {
            req.io.to('admin_room').emit('order_processing', {
                shopItemId,
                userId,
                userName: item.full_name,
                productName: item.product_name,
            });
        }

        return res.status(200).json({ success: true, message: 'Processing confirmed. Admin will verify shortly.' });

    } catch (error) {
        console.error('Mark as processing error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
}

// ============================================
// ADMIN: Saari My Shop entries dekhna
// ============================================
async function getAllShopEntriesAdmin(req, res) {
    try {
        const { status } = req.query;

        let query = `
            SELECT ms.*, p.product_name, p.product_link, p.selling_price, u.full_name, u.email
            FROM my_shop ms
            JOIN products p ON ms.product_id = p.id
            JOIN users u ON ms.user_id = u.id
        `;
        const params = [];
        if (status) {
            params.push(status);
            query += ` WHERE ms.status = $1`;
        }
        query += ' ORDER BY ms.listed_at DESC';

        const result = await pool.query(query, params);
        return res.status(200).json({ success: true, entries: result.rows });

    } catch (error) {
        console.error('Get all shop entries (admin) error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
}

// ============================================
// ADMIN: Product ko "Sold" mark karna
// CS ke paas HAMESHA yeh button available hai - koi status check nahi
// ============================================
async function markAsSold(req, res) {
    try {
        const { shopItemId } = req.params;

        const itemResult = await pool.query('SELECT * FROM my_shop WHERE id = $1', [shopItemId]);
        if (itemResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Entry not found.' });
        }

        const result = await pool.query(
            "UPDATE my_shop SET status = 'sold', sold_at = NOW() WHERE id = $1 RETURNING *",
            [shopItemId]
        );

        const userId = itemResult.rows[0].user_id;

        // Notification banana
        const notif = await createNotification(userId, 'Product Sold!', 'One of your products has been sold. Please confirm processing.');

        if (req.io) {
            req.io.to(`user_${userId}`).emit('product_sold', result.rows[0]);
            req.io.to(`user_${userId}`).emit('new_notification', notif.rows[0]);
        }

        return res.status(200).json({ success: true, message: 'Product marked as Sold. User has been notified.' });

    } catch (error) {
        console.error('Mark as sold error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
}

// ============================================
// ADMIN: Order Approve karna ("Ready to Ship")
// CS ke paas HAMESHA yeh button available hai - koi status check nahi
// NAYA: Approve hote hi product ka cost_price user ke balance se
// MINUS ho jata hai (sirf EK dafa - cost_deducted flag se protect hai,
// taake CS dobara button dabaye ya status wapas/aage-peeche ho to
// paisa dobara na katay). Yeh amount delivered hone par cost+profit
// ke sath wapas milega.
// ============================================
async function approveOrder(req, res) {
    try {
        const { shopItemId } = req.params;
        const { expectedDeliveryDate } = req.body;

        const itemResult = await pool.query(
            `SELECT ms.*, p.cost_price, p.product_name
             FROM my_shop ms JOIN products p ON ms.product_id = p.id
             WHERE ms.id = $1`,
            [shopItemId]
        );
        if (itemResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        const item = itemResult.rows[0];
        const userId = item.user_id;
        const costPrice = parseFloat(item.cost_price);
        const alreadyDeducted = item.cost_deducted === true;

        const result = await pool.query(
            `UPDATE my_shop SET status = 'ready_to_ship', ready_to_ship_at = NOW(), expected_delivery_date = $1,
                    cost_deducted = TRUE
             WHERE id = $2 RETURNING *`,
            [expectedDeliveryDate || null, shopItemId]
        );

        let newBalance = null;
        if (!alreadyDeducted) {
            // Balance se product ka cost minus karna
            const userResult = await pool.query('SELECT balance FROM users WHERE id = $1', [userId]);
            newBalance = (parseFloat(userResult.rows[0].balance) - costPrice).toFixed(2);
            await pool.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);

            // History mein record karna (red/negative entry)
            await pool.query(
                `INSERT INTO balance_history (user_id, amount, reason, balance_after)
                 VALUES ($1, $2, $3, $4)`,
                [userId, -costPrice, `Order ready to ship - product cost deducted (${item.product_name})`, newBalance]
            );
        }

        // Notification banana - user-facing hai isliye ENGLISH mein
        const notifMsg = alreadyDeducted
            ? `Your order for "${item.product_name}" has been approved and is ready to ship.`
            : `Your order for "${item.product_name}" is ready to ship. $${costPrice.toFixed(2)} has been deducted from your balance. This amount will be returned to you along with the profit once the order is delivered.`;
        const notif = await createNotification(userId, 'Order Ready to Ship!', notifMsg);

        if (req.io) {
            req.io.to(`user_${userId}`).emit('order_approved', result.rows[0]);
            req.io.to(`user_${userId}`).emit('new_notification', notif.rows[0]);
            if (!alreadyDeducted) {
                req.io.to(`user_${userId}`).emit('balance_updated', {
                    amount: -costPrice,
                    newBalance,
                    reason: 'Order ready to ship - product cost deducted',
                    isDeduction: true,
                });
            }
        }

        return res.status(200).json({
            success: true,
            message: alreadyDeducted
                ? 'Order updated - Ready to Ship (cost was already deducted earlier).'
                : `Order approved - Ready to Ship. $${costPrice.toFixed(2)} deducted from user balance.`,
        });

    } catch (error) {
        console.error('Approve order error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
}

// ============================================
// ADMIN: Order "Lost" mark karna
// CS ke paas HAMESHA yeh button available hai - koi status check nahi
// ============================================
async function markAsLost(req, res) {
    try {
        const { shopItemId } = req.params;
        const { reason } = req.body; // optional

        const itemResult = await pool.query('SELECT * FROM my_shop WHERE id = $1', [shopItemId]);
        if (itemResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        const result = await pool.query(
            "UPDATE my_shop SET status = 'lost', lost_reason = $1, lost_at = NOW() WHERE id = $2 RETURNING *",
            [reason || null, shopItemId]
        );

        const userId = itemResult.rows[0].user_id;

        // Notification banana
        const lostMsg = reason ? `Your order has been marked as lost. Reason: ${reason}` : 'Your order has been marked as lost.';
        const notif = await createNotification(userId, 'Order Lost', lostMsg);

        if (req.io) {
            req.io.to(`user_${userId}`).emit('order_lost', result.rows[0]);
            req.io.to(`user_${userId}`).emit('new_notification', notif.rows[0]);
        }

        return res.status(200).json({ success: true, message: 'Order marked as Lost.' });

    } catch (error) {
        console.error('Mark as lost error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
}

// ============================================
// ADMIN: Order "Delivered" mark karna
// CS ke paas HAMESHA yeh button available hai - koi status check nahi
// NAYA: Delivered mark hote hi cost_price + profit_amount dono
// user ke balance mein WAPAS ADD ho jate hain (sirf EK dafa -
// payout_added flag se protect hai, taake CS dobara button dabaye
// to paisa dobara add na ho).
// ============================================
async function markAsDelivered(req, res) {
    try {
        const { shopItemId } = req.params;

        const itemResult = await pool.query(
            `SELECT ms.*, p.cost_price, p.selling_price, p.product_name,
                    (p.selling_price - p.cost_price) AS profit_amount
             FROM my_shop ms JOIN products p ON ms.product_id = p.id
             WHERE ms.id = $1`,
            [shopItemId]
        );
        if (itemResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        const item = itemResult.rows[0];
        const userId = item.user_id;
        const costPrice = parseFloat(item.cost_price);
        const profitAmount = parseFloat(item.profit_amount);
        const totalReturn = costPrice + profitAmount;
        const alreadyPaidOut = item.payout_added === true;

        const result = await pool.query(
            `UPDATE my_shop SET status = 'delivered', delivered_at = NOW(), payout_added = TRUE
             WHERE id = $1 RETURNING *`,
            [shopItemId]
        );

        let newBalance = null;
        if (!alreadyPaidOut) {
            // Balance mein cost + profit wapas add karna
            const userResult = await pool.query('SELECT balance FROM users WHERE id = $1', [userId]);
            newBalance = (parseFloat(userResult.rows[0].balance) + totalReturn).toFixed(2);
            await pool.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);

            // History mein record karna (green/positive entry)
            await pool.query(
                `INSERT INTO balance_history (user_id, amount, reason, balance_after)
                 VALUES ($1, $2, $3, $4)`,
                [userId, totalReturn, `Order delivered - cost + profit added (${item.product_name})`, newBalance]
            );
        }

        // Notification banana - user-facing hai isliye ENGLISH mein
        const notifMsg = alreadyPaidOut
            ? `Your order for "${item.product_name}" has been marked as delivered. Thank you!`
            : `Your order for "${item.product_name}" has been delivered. $${totalReturn.toFixed(2)} (cost $${costPrice.toFixed(2)} + profit $${profitAmount.toFixed(2)}) has been added to your balance. Thank you!`;
        const notif = await createNotification(userId, 'Order Delivered!', notifMsg);

        if (req.io) {
            req.io.to(`user_${userId}`).emit('order_delivered', result.rows[0]);
            req.io.to(`user_${userId}`).emit('new_notification', notif.rows[0]);
            if (!alreadyPaidOut) {
                req.io.to(`user_${userId}`).emit('balance_updated', {
                    amount: totalReturn,
                    newBalance,
                    reason: 'Order delivered - cost + profit added',
                    isDeduction: false,
                });
            }
        }

        return res.status(200).json({
            success: true,
            message: alreadyPaidOut
                ? 'Order already marked as Delivered earlier (no duplicate payout).'
                : `Order marked as Delivered. $${totalReturn.toFixed(2)} (cost + profit) added to user balance.`,
        });

    } catch (error) {
        console.error('Mark as delivered error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
}

// ============================================
// USER: Ek click mein SAARE available products
// (jo abhi tak list nahi kiye) My Shop mein daalna
// ============================================
async function listAllProducts(req, res) {
    try {
        const userId = req.user.userId;

        // Check karna ke premium unlocked hai ya nahi
        const userResult = await pool.query('SELECT premium_unlocked FROM users WHERE id = $1', [userId]);
        if (!userResult.rows[0].premium_unlocked) {
            return res.status(403).json({ success: false, message: 'Premium Tasks are not unlocked yet.' });
        }

        // Ek hi query mein saare active-aur-abhi-tak-list-nahi-kiye products insert karna
        // (atomic hai - koi partial/duplicate issue nahi aayega)
        const result = await pool.query(
            `INSERT INTO my_shop (user_id, product_id)
             SELECT $1, p.id FROM products p
             WHERE p.is_active = TRUE
             AND NOT EXISTS (
                 SELECT 1 FROM my_shop ms WHERE ms.product_id = p.id AND ms.user_id = $1
             )
             RETURNING *`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'No new products available to list.' });
        }

        return res.status(201).json({ success: true, listedCount: result.rows.length, items: result.rows });

    } catch (error) {
        console.error('List all products error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
}

module.exports = {
    listProduct,
    listAllProducts,
    getMyShop,
    markAsProcessing,
    getAllShopEntriesAdmin,
    markAsSold,
    approveOrder,
    markAsLost,
    markAsDelivered,
};
