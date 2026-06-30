// ============================================
// PRODUCTS CONTROLLER
// ============================================

const pool = require('../config/database');

async function createProduct(req, res) {
    try {
        const { productName, productLink, description, iconImageUrl, costPrice, profitPercentage } = req.body;

        if (!productName || !productLink || !costPrice || !profitPercentage) {
            return res.status(400).json({ success: false, message: 'Product name, link, cost price, and profit % are required.' });
        }

        const sellingPrice = parseFloat(costPrice) + (parseFloat(costPrice) * parseFloat(profitPercentage) / 100);

        const result = await pool.query(
            `INSERT INTO products (product_name, product_link, description, icon_image_url, cost_price, profit_percentage, selling_price)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [productName, productLink, description || null, iconImageUrl || null, costPrice, profitPercentage, sellingPrice.toFixed(2)]
        );

        return res.status(201).json({ success: true, product: result.rows[0] });
    } catch (error) {
        console.error('Create product error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
}

async function getAllProductsAdmin(req, res) {
    try {
        const result = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
        return res.status(200).json({ success: true, products: result.rows });
    } catch (error) {
        console.error('Get all products error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
}

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
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
}

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
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
}

// ============================================
// ADMIN: Product delete karna
// ============================================
async function deleteProduct(req, res) {
    try {
        const { productId } = req.params;

        const result = await pool.query(
            'DELETE FROM products WHERE id = $1 RETURNING *',
            [productId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }

        return res.status(200).json({ success: true, message: 'Product deleted successfully.' });
    } catch (error) {
        console.error('Delete product error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
}

module.exports = {
    createProduct,
    getAllProductsAdmin,
    getAllProductsUser,
    updateProduct,
    deleteProduct,
};
