// ============================================
// CLOUDINARY CONFIG
// Yeh file Cloudinary credentials ko Railway
// environment variables se uthati hai aur
// cloudinary SDK ko configure karti hai.
//
// IMPORTANT: API Secret kabhi yahan hardcode
// mat karna — hamesha .env / Railway Variables
// se aana chahiye.
// ============================================

const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true, // hamesha https URLs return karega
});

module.exports = cloudinary;
