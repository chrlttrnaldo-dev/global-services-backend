// ============================================
// PRODUCTS ROUTES
// Cloudinary se image upload hoti hai
// ============================================

const express = require('express');
const router = express.Router();
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const {
    createProduct,
    getAllProductsAdmin,
    getAllProductsUser,
    updateProduct,
    deleteProduct,
} = require('../controllers/productsController');

// Cloudinary config
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer - memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Image upload route - Cloudinary par save hogi
router.post('/admin/upload-image', verifyToken, verifyAdmin, upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Image file zaroori hai.' });
    }
    try {
        const result = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream(
                { folder: 'product_images' },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            ).end(req.file.buffer);
        });
        return res.status(200).json({ success: true, imageUrl: result.secure_url });
    } catch (err) {
        console.error('Cloudinary upload error:', err);
        return res.status(500).json({ success: false, message: 'Image upload failed.' });
    }
});

// --- USER routes ---
router.get('/', verifyToken, getAllProductsUser);

// --- ADMIN routes ---
router.post('/admin/create', verifyToken, verifyAdmin, createProduct);
router.get('/admin/all', verifyToken, verifyAdmin, getAllProductsAdmin);
router.put('/admin/:productId', verifyToken, verifyAdmin, updateProduct);
router.delete('/admin/:productId', verifyToken, verifyAdmin, deleteProduct);

module.exports = router;
