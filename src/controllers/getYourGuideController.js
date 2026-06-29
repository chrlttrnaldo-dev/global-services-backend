// ============================================
// GETYOURGUIDE TASK CONTROLLER
// Yeh ek fixed, special task hai - sirf settings
// jaisa hai (ek hi row hoti hai is table mein).
// Proof submission CHAT system se hi hoti hai
// (conversation_type: 'getyourguide_proof').
// ============================================

const pool = require('../config/database');

// ============================================
// Saare (user aur admin dono) - task ki detail dekhna
// ============================================
async function getTask(req, res) {
    try {
        const result = await pool.query('SELECT * FROM getyourguide_task LIMIT 1');
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Task abhi set nahi hua.' });
        }
        return res.status(200).json({ success: true, task: result.rows[0] });
    } catch (error) {
        console.error('Get GetYourGuide task error:', error);
        return res.status(500).json({ success: false, message: 'Kuch ghalat ho gaya.' });
    }
}

// ============================================
// ADMIN: Task update karna (reward amount, instructions, on/off)
// ============================================
async function updateTask(req, res) {
    try {
        const { title, instructions, rewardAmount, isActive } = req.body;

        const existing = await pool.query('SELECT id FROM getyourguide_task LIMIT 1');

        if (existing.rows.length === 0) {
            // Agar abhi tak row nahi bani, to nayi banayen
            const result = await pool.query(
                `INSERT INTO getyourguide_task (title, instructions, reward_amount, is_active)
                 VALUES ($1, $2, $3, $4) RETURNING *`,
                [title, instructions, rewardAmount, isActive]
            );
            return res.status(201).json({ success: true, task: result.rows[0] });
        }

        const result = await pool.query(
            `UPDATE getyourguide_task SET title = $1, instructions = $2, reward_amount = $3, is_active = $4
             WHERE id = $5 RETURNING *`,
            [title, instructions, rewardAmount, isActive, existing.rows[0].id]
        );

        return res.status(200).json({ success: true, task: result.rows[0] });

    } catch (error) {
        console.error('Update GetYourGuide task error:', error);
        return res.status(500).json({ success: false, message: 'Kuch ghalat ho gaya.' });
    }
}

module.exports = { getTask, updateTask };
