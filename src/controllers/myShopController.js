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
            `SELECT ms.*, p.product_name, p.product_link, p.icon_image_url,
                    p.cost_price, p.profit_percentage, p.selling_price,
                    (p.selling_price - p.cost_price) AS profit_amount
             FROM my_shop ms
             JOIN products p ON ms.product_id = p.id
             WHERE ms.user_id = $1
             ORDER BY ms.listed_at DESC`,
            [userId]
        );

        const allItems = result.rows;
        const listedProducts = allItems.filter((item) => item.status === 'listed');
        const orders = allItems.filter((item) => item.status !== 'listed');

        return res.status(200).json({ success: true, listedProducts, orders });

    } catch (error) {
        console.error('Get my shop error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
}

// ============================================
// USER: "Processing" button dabana
// ============================================
async function markAsProcessing(req, res) {
    try {
        const userId = req.user.userId;
        const { shopItemId } = req.params;

        const itemResult = await pool.query(
            'SELECT * FROM my_shop WHERE id = $1 AND user_id = $2',
            [shopItemId, userId]
        );
        if (itemResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }
        if (itemResult.rows[0].status !== 'sold') {
            return res.status(400).json({ success: false, message: 'This order is not ready for processing yet.' });
        }

        await pool.query(
            "UPDATE my_shop SET status = 'processing', processing_at = NOW() WHERE id = $1",
            [shopItemId]
        );

        if (req.io) {
            req.io.to('admin_room').emit('order_processing', { shopItemId, userId });
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
// ============================================
async function approveOrder(req, res) {
    try {
        const { shopItemId } = req.params;
        const { expectedDeliveryDate } = req.body;

        const itemResult = await pool.query('SELECT * FROM my_shop WHERE id = $1', [shopItemId]);
        if (itemResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        const result = await pool.query(
            `UPDATE my_shop SET status = 'ready_to_ship', ready_to_ship_at = NOW(), expected_delivery_date = $1
             WHERE id = $2 RETURNING *`,
            [expectedDeliveryDate || null, shopItemId]
        );

        const userId = itemResult.rows[0].user_id;

        // Notification banana
        const notif = await createNotification(userId, 'Order Ready to Ship!', 'Your order has been approved and is ready to ship.');

        if (req.io) {
            req.io.to(`user_${userId}`).emit('order_approved', result.rows[0]);
            req.io.to(`user_${userId}`).emit('new_notification', notif.rows[0]);
        }

        return res.status(200).json({ success: true, message: 'Order approved - Ready to Ship.' });

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
// ============================================
async function markAsDelivered(req, res) {
    try {
        const { shopItemId } = req.params;

        const itemResult = await pool.query('SELECT * FROM my_shop WHERE id = $1', [shopItemId]);
        if (itemResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        const result = await pool.query(
            "UPDATE my_shop SET status = 'delivered', delivered_at = NOW() WHERE id = $1 RETURNING *",
            [shopItemId]
        );

        const userId = itemResult.rows[0].user_id;

        // Notification banana
        const notif = await createNotification(userId, 'Order Delivered!', 'Your order has been marked as delivered. Thank you!');

        if (req.io) {
            req.io.to(`user_${userId}`).emit('order_delivered', result.rows[0]);
            req.io.to(`user_${userId}`).emit('new_notification', notif.rows[0]);
        }

        return res.status(200).json({ success: true, message: 'Order marked as Delivered.' });

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
