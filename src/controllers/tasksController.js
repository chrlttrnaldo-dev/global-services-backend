// ============================================
// TASKS CONTROLLER (Normal Tasks - sab ke liye same)
// ============================================

const pool = require('../config/database');

async function getAllTasks(req, res) {
    try {
        const result = await pool.query('SELECT * FROM tasks WHERE is_active = TRUE ORDER BY created_at DESC');
        return res.status(200).json({ success: true, tasks: result.rows });
    } catch (error) {
        console.error('Get tasks error:', error);
        return res.status(500).json({ success: false, message: 'Kuch ghalat ho gaya.' });
    }
}

async function getAllTasksAdmin(req, res) {
    try {
        const result = await pool.query('SELECT * FROM tasks ORDER BY created_at DESC');
        return res.status(200).json({ success: true, tasks: result.rows });
    } catch (error) {
        console.error('Get tasks (admin) error:', error);
        return res.status(500).json({ success: false, message: 'Kuch ghalat ho gaya.' });
    }
}

async function createTask(req, res) {
    try {
        const { title, description, rewardAmount, iconImageUrl } = req.body;

        if (!title) {
            return res.status(400).json({ success: false, message: 'Task ka title zaroori hai.' });
        }

        const result = await pool.query(
            `INSERT INTO tasks (title, description, reward_amount, icon_image_url)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [title, description || null, rewardAmount || 0, iconImageUrl || null]
        );

        return res.status(201).json({ success: true, task: result.rows[0] });
    } catch (error) {
        console.error('Create task error:', error);
        return res.status(500).json({ success: false, message: 'Kuch ghalat ho gaya.' });
    }
}

async function updateTask(req, res) {
    try {
        const { taskId } = req.params;
        const { title, description, rewardAmount, iconImageUrl, isActive } = req.body;

        const result = await pool.query(
            `UPDATE tasks SET title = $1, description = $2, reward_amount = $3, icon_image_url = $4, is_active = $5
             WHERE id = $6 RETURNING *`,
            [title, description, rewardAmount, iconImageUrl, isActive, taskId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Task nahi mila.' });
        }

        return res.status(200).json({ success: true, task: result.rows[0] });
    } catch (error) {
        console.error('Update task error:', error);
        return res.status(500).json({ success: false, message: 'Kuch ghalat ho gaya.' });
    }
}

module.exports = {
    getAllTasks,
    getAllTasksAdmin,
    createTask,
    updateTask,
};
