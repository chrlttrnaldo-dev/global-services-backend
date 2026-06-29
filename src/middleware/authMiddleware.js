// ============================================
// AUTH MIDDLEWARE (Security Guard)
// Yeh check karta hai ke request bhejne wala
// banda logged in hai ya nahi, aur admin hai ya nahi.
// ============================================

const jwt = require('jsonwebtoken');

// Yeh check karta hai: "Kya yeh banda login hai?"
function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required. Please log in.',
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // userId aur isAdmin yahan se aage available hoga
        next(); // sab theek hai, aage badho
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Session expired. Please log in again.',
        });
    }
}

// Yeh check karta hai: "Kya yeh banda Admin hai?"
// Pehle verifyToken chalna chahiye, phir yeh.
function verifyAdmin(req, res, next) {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({
            success: false,
            message: 'Admin access required.',
        });
    }
    next();
}

module.exports = { verifyToken, verifyAdmin };
