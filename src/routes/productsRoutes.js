// ============================================
// PRODUCTS ROUTES
// ============================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const {
    createProduct,
    getAllProductsAdmin,
    getAllProductsUser,
    updateProduct,
} = require('../controllers/productsController');

// Multer setup - product images "uploads/products" folder mein save hongi
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/products/'),
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    },
});
const upload = multer({ storage });

// Image upload route - yeh sirf image upload karta hai, link wapas deta hai
router.post('/admin/upload-image', verifyToken, verifyAdmin, upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Image file zaroori hai.' });
    }
    const imageUrl = `/uploads/products/${req.file.filename}`;
    return res.status(200).json({ success: true, imageUrl });
});

// --- USER routes ---
router.get('/', verifyToken, getAllProductsUser); // User ke liye - price, profit% , profit amount sab dikhega

// --- ADMIN routes ---
router.post('/admin/create', verifyToken, verifyAdmin, createProduct);
router.get('/admin/all', verifyToken, verifyAdmin, getAllProductsAdmin);
router.put('/admin/:productId', verifyToken, verifyAdmin, updateProduct);

module.exports = router;
