// ============================================
// AUTH CONTROLLER
// Register aur Login ka poora logic yahan hai.
// ============================================

const pool = require('../config/database');
const jwt = require('jsonwebtoken');
const { hashPassword, comparePassword } = require('../utils/passwordHelper');
const { generateReferralCode } = require('../utils/referralHelper');

// ============================================
// REGISTER (Sign Up)
// ============================================
async function register(req, res) {
    try {
        const { fullName, email, password, withdrawPassword, referralCode } = req.body;

        // Step 1: Zaroori fields check karna
        if (!fullName || !email || !password || !withdrawPassword || !referralCode) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required (name, email, password, withdraw password, referral code).',
            });
        }

        // Step 2: Check karna ke email pehle se to register nahi
        const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'This email is already registered.',
            });
        }

        // Step 3: Referral code check karna - valid hai aur use nahi hua
        const referralResult = await pool.query(
            'SELECT * FROM referral_codes WHERE code = $1',
            [referralCode]
        );

        if (referralResult.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid referral code.',
            });
        }

        if (referralResult.rows[0].is_used) {
            return res.status(400).json({
                success: false,
                message: 'This referral code has already been used.',
            });
        }

        // Step 4: Password aur withdraw password ko encrypt karna
        const passwordHash = await hashPassword(password.trim());
        const withdrawPasswordHash = await hashPassword(withdrawPassword.trim());

        // Step 5: Naye user ke liye uska apna referral code generate karna
        // (loop taake agar wo code already exist kare to dobara try ho)
        let ownReferralCode;
        let isUnique = false;
        while (!isUnique) {
            ownReferralCode = generateReferralCode();
            const check = await pool.query('SELECT id FROM users WHERE own_referral_code = $1', [ownReferralCode]);
            if (check.rows.length === 0) isUnique = true;
        }

        // Step 6: User ko database mein create karna
        const newUser = await pool.query(
            `INSERT INTO users (full_name, email, password_hash, withdraw_password_hash, own_referral_code, used_referral_code)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, full_name, email, balance, own_referral_code, created_at`,
            [fullName, email, passwordHash, withdrawPasswordHash, ownReferralCode, referralCode]
        );

        // Step 7: Referral code ko "used" mark karna
        await pool.query(
            'UPDATE referral_codes SET is_used = TRUE, used_by_user_id = $1 WHERE code = $2',
            [newUser.rows[0].id, referralCode]
        );

        return res.status(201).json({
            success: true,
            message: 'Account created successfully!',
            user: newUser.rows[0],
        });

    } catch (error) {
        console.error('Register error:', error);
        return res.status(500).json({
            success: false,
            message: 'Something went wrong. Please try again.',
        });
    }
}

// ============================================
// LOGIN
// ============================================
async function login(req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required.',
            });
        }

        // User ko email se dhoondhna
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password.',
            });
        }

        const user = result.rows[0];

        // Password check karna
        const isPasswordCorrect = await comparePassword(password.trim(), user.password_hash);
        if (!isPasswordCorrect) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password.',
            });
        }

        // Login token (JWT) banana - yeh "entry pass" hai jo aage har request ke saath jayega
        const token = jwt.sign(
            { userId: user.id, isAdmin: user.is_admin },
            process.env.JWT_SECRET,
            { expiresIn: '7d' } // 7 din baad token expire ho jayega, dobara login karna hoga
        );

        return res.status(200).json({
            success: true,
            message: 'Login successful!',
            token,
            user: {
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                balance: user.balance,
                isAdmin: user.is_admin,
                premiumUnlocked: user.premium_unlocked,
                referralUnlocked: user.referral_unlocked,
                balanceDisplayMode: user.balance_display_mode,
                vipLevel: user.vip_level,
                ownReferralCode: user.own_referral_code,
            },
        });

    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({
            success: false,
            message: 'Something went wrong. Please try again.',
        });
    }
}

// ============================================
// FORGOT PASSWORD REQUEST (login se pehle, email se)
// Yeh ek 'password_reset' conversation banata hai
// bina login token ke - sirf email se user dhoondh kar.
// ============================================
async function forgotPasswordRequest(req, res) {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required.' });
        }

        const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) {
            // Security: hum yeh nahi batate ke email exist nahi karta (taake koi email list na bana sake)
            return res.status(200).json({ success: true, message: 'If this email is registered, a request has been sent.' });
        }

        const userId = userResult.rows[0].id;

        const result = await pool.query(
            `INSERT INTO conversations (user_id, conversation_type) VALUES ($1, 'password_reset') RETURNING *`,
            [userId]
        );

        await pool.query(
            `INSERT INTO messages (conversation_id, sender_type, message_text)
             VALUES ($1, 'user', 'I forgot my password and need help resetting it.')`,
            [result.rows[0].id]
        );

        if (req.io) {
            req.io.to('admin_room').emit('new_conversation', result.rows[0]);
        }

        return res.status(200).json({ success: true, message: 'Request has been sent.' });

    } catch (error) {
        console.error('Forgot password request error:', error);
        return res.status(500).json({ success: false, message: 'Something went wrong.' });
    }
}

module.exports = { register, login, forgotPasswordRequest };
