// ============================================
// AUTH ROUTES
// Yeh file batati hai ke kis URL par request
// aane se register ya login wala function chalega.
// ============================================

const express = require('express');
const router = express.Router();
const { register, login, forgotPasswordRequest } = require('../controllers/authController');

// Jab frontend "/api/auth/register" par POST request bheje, register chalega
router.post('/register', register);

// Jab frontend "/api/auth/login" par POST request bheje, login chalega
router.post('/login', login);

// Forgot password - login se pehle, email se
router.post('/forgot-password-request', forgotPasswordRequest);

module.exports = router;
