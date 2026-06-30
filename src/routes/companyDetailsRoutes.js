// ============================================
// COMPANY DETAILS ROUTES
// Ab Cloudinary use ho raha hai file upload ke liye
// (pehle local disk tha — Railway restart par delete ho jata tha)
// ============================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const { getCompanyDetails, updateCompanyDetails } = require('../controllers/companyDetailsController');

// Cloudinary storage setup — resource_type 'auto' rakha hai
// kyunki yahan image (jpg/png) aur document (pdf/doc) dono aa sakte hain.
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'global-services/company',
        resource_type: 'auto',
    },
});
const upload = multer({ storage });

// File upload route (image, PDF, doc - kuch bhi) - Admin only
router.post('/admin/upload', verifyToken, verifyAdmin, upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'File zaroori hai.' });
    }
    // req.file.path Cloudinary ka full secure URL hota hai
    const fileUrl = req.file.path;
    return res.status(200).json({ success: true, fileUrl, fileName: req.file.originalname });
});

// User + Admin - dekhne ke liye
router.get('/', verifyToken, getCompanyDetails);

// Admin - text/file update karne ke liye
router.put('/admin', verifyToken, verifyAdmin, updateCompanyDetails);

module.exports = router;
