// ============================================
// REFERRAL CODE GENERATOR
// Random, unique-looking referral codes banane
// ke liye chhota helper function.
// ============================================

function generateReferralCode() {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // confusing letters (O, I, 0, 1) hata diye
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code; // jaise "K7P2XJ9Q"
}

module.exports = { generateReferralCode };
