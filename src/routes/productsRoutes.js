// ============================================
// PRODUCTS ROUTES
// Ab Cloudinary use ho raha hai image upload ke liye
// (pehle local disk tha — Railway restart par delete ho jata tha)
// ============================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const {
    createProduct,
    getAllProductsAdmin,
    getAllProductsUser,
    updateProduct,
    deleteProduct,
} = require('../controllers/productsController');

// Cloudinary storage setup
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'global-services/products',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        resource_type: 'image',
    },
});
const upload = multer({ storage });

// Image upload route
router.post('/admin/upload-image', verifyToken, verifyAdmin, upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Image file zaroori hai.' });
    }
    // req.file.path Cloudinary ka full secure URL hota hai
    const imageUrl = req.file.path;
    return res.status(200).json({ success: true, imageUrl });
});

// --- USER routes ---
router.get('/', verifyToken, getAllProductsUser);

// --- ADMIN routes ---
router.post('/admin/create', verifyToken, verifyAdmin, createProduct);
router.get('/admin/all', verifyToken, verifyAdmin, getAllProductsAdmin);
router.put('/admin/:productId', verifyToken, verifyAdmin, updateProduct);
router.delete('/admin/:productId', verifyToken, verifyAdmin, deleteProduct);

module.exports = router;
