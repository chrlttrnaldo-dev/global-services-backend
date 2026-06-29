// ============================================
// APP OPTIMIZATION TASKS ROUTES
// ============================================

const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const {
    getAllTasks,
    getAllTasksAdmin,
    createTask,
    updateTask,
} = require('../controllers/appOptimizationController');

router.get('/', verifyToken, getAllTasks); // User ke liye

router.get('/admin/all', verifyToken, verifyAdmin, getAllTasksAdmin);
router.post('/admin/create', verifyToken, verifyAdmin, createTask);
router.put('/admin/:taskId', verifyToken, verifyAdmin, updateTask);

module.exports = router;
