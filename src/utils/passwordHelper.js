// ============================================
// PASSWORD HELPER
// Yeh file password ko "encrypt" (hash) karti hai,
// aur login ke waqt check karti hai ke daala hua
// password sahi hai ya nahi.
//
// Hum kabhi bhi asli password database mein save
// nahi karte - sirf iska "hash" (encrypted version) save hota hai.
// ============================================

const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10; // Encryption ki "strength" - 10 ek standard, secure value hai

// Password ko hash (encrypt) karna - registration ke waqt use hoga
async function hashPassword(plainPassword) {
    return await bcrypt.hash(plainPassword, SALT_ROUNDS);
}

// User ne daala hua password, database mein save hue hash se match karta hai ya nahi
// Login ke waqt aur withdraw password check karne ke waqt use hoga
async function comparePassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
}

module.exports = {
    hashPassword,
    comparePassword,
};
