// ============================================
// COMPANY DETAILS ROUTES
// ============================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const { getCompanyDetails, updateCompanyDetails } = require('../controllers/companyDetailsController');

// Multer setup - products wala hi pattern (local disk)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/company/'),
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    },
});
const upload = multer({ storage });

// File upload route (image, PDF, doc - kuch bhi) - Admin only
router.post('/admin/upload', verifyToken, verifyAdmin, upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'File zaroori hai.' });
    }
    const fileUrl = `/uploads/company/${req.file.filename}`;
    return res.status(200).json({ success: true, fileUrl, fileName: req.file.originalname });
});

// User + Admin - dekhne ke liye
router.get('/', verifyToken, getCompanyDetails);

// Admin - text/file update karne ke liye
router.put('/admin', verifyToken, verifyAdmin, updateCompanyDetails);

module.exports = router;
