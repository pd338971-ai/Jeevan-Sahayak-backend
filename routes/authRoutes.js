const express = require('express');
const router = express.Router();
const {
  sendOtp,
  registerUserWithOtp,
  loginUser,
  adminLogin,
  getAdminDashboard,
  deleteUser
} = require('../controllers/authController');

// User Auth
router.post('/send-otp', sendOtp);
router.post('/register', registerUserWithOtp);
router.post('/login', loginUser);

// Admin Routes
router.post('/admin/login', adminLogin);
router.get('/admin/dashboard', getAdminDashboard);
router.delete('/admin/user/:id', deleteUser);

module.exports = router;
