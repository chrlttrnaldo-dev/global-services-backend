// ============================================
// PRODUCTS CONTROLLER
// Admin yahan se Premium Tasks ke products add
// karta hai, cost price aur profit % ke saath.
// Selling price khud calculate hoti hai.
// Yeh one-by-one add hote hain (bulk upload nahi).
// ============================================

const pool = require('../config/database');

// ============================================
// ADMIN: Naya product add karna
// ============================================
async function createProduct(req, res) {
    try {
        const { productName, productLink, description, iconImageUrl, costPrice, profitPercentage } = req.body;

        if (!productName || !productLink || !costPrice || !profitPercentage) {
            return res.status(400).json({
                success: false,
                message: 'Product name, link, cost price, and profit % are required.',
            });
        }

        // Selling price calculate karna: cost + profit%
        const sellingPrice = parseFloat(costPrice) + (parseFloat(costPrice) * parseFloat(profitPercentage) / 100);

        const result = await pool.query(
            `INSERT INTO products (product_name, product_link, description, icon_image_url, cost_price, profit_percentage, selling_price)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [productName, productLink, description || null, iconImageUrl || null, costPrice, profitPercentage, sellingPrice.toFixed(2)]
        );

        return res.status(201).json({ success: true, product: result.rows[0] });

    } catch (error) {
        console.error('Create product error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
}

// ============================================
// ADMIN: Saare products dekhna (cost/profit ke saath - sirf admin ke liye)
// ============================================
async function getAllProductsAdmin(req, res) {
    try {
        const result = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
        return res.status(200).json({ success: true, products: result.rows });
    } catch (error) {
        console.error('Get all products (admin) error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
}

// ============================================
// USER: Saare active products dekhna
// (Cost price aur profit % CHHIPA DIYE JAAYENGE - sirf naam, link, selling price, image)
// ============================================
async function getAllProductsUser(req, res) {
    try {
        const result = await pool.query(
            `SELECT id, product_name, product_link, description, icon_image_url,
                    cost_price, profit_percentage, selling_price,
                    (selling_price - cost_price) AS profit_amount
             FROM products WHERE is_active = TRUE ORDER BY created_at DESC`
        );
        return res.status(200).json({ success: true, products: result.rows });
    } catch (error) {
        console.error('Get all products (user) error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
}

// ============================================
// ADMIN: Product update karna (price/profit badalna)
// ============================================
async function updateProduct(req, res) {
    try {
        const { productId } = req.params;
        const { productName, productLink, description, iconImageUrl, costPrice, profitPercentage, isActive } = req.body;

        const sellingPrice = parseFloat(costPrice) + (parseFloat(costPrice) * parseFloat(profitPercentage) / 100);

        const result = await pool.query(
            `UPDATE products
             SET product_name = $1, product_link = $2, description = $3, icon_image_url = $4,
                 cost_price = $5, profit_percentage = $6, selling_price = $7, is_active = $8
             WHERE id = $9 RETURNING *`,
            [productName, productLink, description, iconImageUrl, costPrice, profitPercentage, sellingPrice.toFixed(2), isActive, productId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }

        return res.status(200).json({ success: true, product: result.rows[0] });
    } catch (error) {
        console.error('Update product error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
}

module.exports = {
    createProduct,
    getAllProductsAdmin,
    getAllProductsUser,
    updateProduct,
};
