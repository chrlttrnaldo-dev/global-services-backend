// ============================================
// APP OPTIMIZATION TASKS CONTROLLER
// Yeh "Manager Assigned Task" hai - Manager decide
// karta hai kya karna hai (app rating, location visit,
// YouTube rating, product boost, video like).
// Admin yahan task add/manage karta hai.
// ============================================

const pool = require('../config/database');

// ============================================
// User aur Admin - saare active tasks dekhna
// ============================================
async function getAllTasks(req, res) {
    try {
        const result = await pool.query(
            'SELECT * FROM app_optimization_tasks WHERE is_active = TRUE ORDER BY created_at DESC'
        );
        return res.status(200).json({ success: true, tasks: result.rows });
    } catch (error) {
        console.error('Get app optimization tasks error:', error);
        return res.status(500).json({ success: false, message: 'Kuch ghalat ho gaya.' });
    }
}

// ============================================
// ADMIN: Saare tasks dekhna (active + inactive)
// ============================================
async function getAllTasksAdmin(req, res) {
    try {
        const result = await pool.query('SELECT * FROM app_optimization_tasks ORDER BY created_at DESC');
        return res.status(200).json({ success: true, tasks: result.rows });
    } catch (error) {
        console.error('Get app optimization tasks (admin) error:', error);
        return res.status(500).json({ success: false, message: 'Kuch ghalat ho gaya.' });
    }
}

// ============================================
// ADMIN: Naya task add karna
// ============================================
async function createTask(req, res) {
    try {
        const { taskName, taskLink, instructions, rewardAmount, iconImageUrl } = req.body;

        if (!taskName) {
            return res.status(400).json({ success: false, message: 'Task ka naam zaroori hai.' });
        }

        const result = await pool.query(
            `INSERT INTO app_optimization_tasks (task_name, task_link, instructions, reward_amount, icon_image_url)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [taskName, taskLink || null, instructions || null, rewardAmount || 0, iconImageUrl || null]
        );

        return res.status(201).json({ success: true, task: result.rows[0] });
    } catch (error) {
        console.error('Create app optimization task error:', error);
        return res.status(500).json({ success: false, message: 'Kuch ghalat ho gaya.' });
    }
}

// ============================================
// ADMIN: Task update karna
// ============================================
async function updateTask(req, res) {
    try {
        const { taskId } = req.params;
        const { taskName, taskLink, instructions, rewardAmount, iconImageUrl, isActive } = req.body;

        const result = await pool.query(
            `UPDATE app_optimization_tasks
             SET task_name = $1, task_link = $2, instructions = $3, reward_amount = $4, icon_image_url = $5, is_active = $6
             WHERE id = $7 RETURNING *`,
            [taskName, taskLink, instructions, rewardAmount, iconImageUrl, isActive, taskId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Task nahi mila.' });
        }

        return res.status(200).json({ success: true, task: result.rows[0] });
    } catch (error) {
        console.error('Update app optimization task error:', error);
        return res.status(500).json({ success: false, message: 'Kuch ghalat ho gaya.' });
    }
}

module.exports = {
    getAllTasks,
    getAllTasksAdmin,
    createTask,
    updateTask,
};
