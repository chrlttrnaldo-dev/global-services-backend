// ============================================
// REFERRAL CODE CONTROLLER
// Admin yahan se naam (Manager ka naam/batch) aur
// quantity de kar multiple referral codes generate
// karta hai. Search karne se Manager ka pata chal jata hai.
// ============================================

const pool = require('../config/database');
const { generateReferralCode } = require('../utils/referralHelper');

// ============================================
// ADMIN: Naye referral codes generate karna (batch mein)
// ============================================
async function generateCodes(req, res) {
    try {
        const { batchName, quantity } = req.body;

        if (!batchName || !quantity || quantity <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Batch ka naam aur quantity (kitne codes chahiye) zaroori hain.',
            });
        }

        if (quantity > 500) {
            return res.status(400).json({ success: false, message: 'Ek baar mein 500 se zyada codes nahi bana sakte.' });
        }

        const generatedCodes = [];

        for (let i = 0; i < quantity; i++) {
            let code;
            let isUnique = false;
            while (!isUnique) {
                code = generateReferralCode();
                const check = await pool.query('SELECT id FROM referral_codes WHERE code = $1', [code]);
                if (check.rows.length === 0) isUnique = true;
            }

            const result = await pool.query(
                'INSERT INTO referral_codes (code, batch_name) VALUES ($1, $2) RETURNING *',
                [code, batchName]
            );
            generatedCodes.push(result.rows[0]);
        }

        return res.status(201).json({
            success: true,
            message: `${quantity} referral codes "${batchName}" ke naam se ban gaye.`,
            codes: generatedCodes,
        });

    } catch (error) {
        console.error('Generate codes error:', error);
        return res.status(500).json({ success: false, message: 'Kuch ghalat ho gaya.' });
    }
}

// ============================================
// ADMIN: Saare codes dekhna / search karna
// (by code, ya batch_name se - "Nawaz ka batch" search kar sakta hai)
// ============================================
async function searchCodes(req, res) {
    try {
        const { search } = req.query;

        let query = `
            SELECT rc.*, u.full_name AS used_by_name, u.email AS used_by_email, u.balance AS used_by_balance
            FROM referral_codes rc
            LEFT JOIN users u ON rc.used_by_user_id = u.id
        `;
        const params = [];

        if (search) {
            params.push(`%${search}%`);
            query += ` WHERE rc.code ILIKE $1 OR rc.batch_name ILIKE $1`;
        }

        query += ' ORDER BY rc.created_at DESC';

        const result = await pool.query(query, params);
        return res.status(200).json({ success: true, codes: result.rows });

    } catch (error) {
        console.error('Search codes error:', error);
        return res.status(500).json({ success: false, message: 'Kuch ghalat ho gaya.' });
    }
}

module.exports = {
    generateCodes,
    searchCodes,
};
