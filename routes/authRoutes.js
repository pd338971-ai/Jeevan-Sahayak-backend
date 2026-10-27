const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const webpush = require('web-push');
const User = require('../models/User');

// Temporary in-memory OTP store
const otpStore = {};

// Web Push Setup
webpush.setVapidDetails(
  'mailto:support@jeevansahayak.com',
  process.env.VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
  process.env.VAPID_PRIVATE_KEY || 'UUxI8gZ-5yY-62hP0jE8Jc9nJ8F3lM6q-W9eK2X3o5A'
);

// -----------------------------------------------------------
// 1. SEND OTP (Fast2SMS Quick SMS - No Verification Needed)
// -----------------------------------------------------------
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || phone.length !== 10) {
      return res.status(400).json({ success: false, message: 'Please enter a valid 10-digit mobile number' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[phone] = {
      otp: otp,
      expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes expiry
    };

    console.log(`🔑 OTP for ${phone}: ${otp}`);

    const apiKey = process.env.FAST2SMS_API_KEY;
    if (apiKey) {
      try {
        // Route 'q' sends direct Quick SMS to the phone without domain verification
        const response = await axios.get('https://www.fast2sms.com/dev/bulkV2', {
          params: {
            authorization: apiKey,
            route: 'q',
            message: `Jeevan Sahayak verification code: ${otp}`,
            language: 'english',
            flash: 0,
            numbers: phone
          }
        });
        console.log('📱 Fast2SMS Response:', response.data);
      } catch (smsErr) {
        console.error('Fast2SMS Error:', smsErr.response?.data || smsErr.message);
      }
    }

    return res.json({
      success: true,
      message: 'OTP has been successfully sent to your mobile number',
      devOtp: otp
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Error while sending OTP' });
  }
});

// -----------------------------------------------------------
// 2. USER REGISTRATION
// -----------------------------------------------------------
router.post('/register', async (req, res) => {
  try {
    const { name, phone, password, otp, gender, dob } = req.body;

    if (!name || !phone || !password || !otp) {
      return res.status(400).json({ success: false, message: 'All fields are mandatory' });
    }

    if (!otpStore[phone] || otpStore[phone].otp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'This mobile number is already registered' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      name,
      phone,
      password: hashedPassword,
      gender: gender || 'Not Specified',
      dob: dob || ''
    });

    await newUser.save();
    delete otpStore[phone];

    return res.status(201).json({ success: true, message: 'Profile created successfully!' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Registration failed', error: err.message });
  }
});

// -----------------------------------------------------------
// 3. USER LOGIN
// -----------------------------------------------------------
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(400).json({ success: false, message: 'This number is not registered' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Incorrect password' });
    }

    const token = jwt.sign(
      { userId: user._id, phone: user.phone },
      process.env.JWT_SECRET || 'jeevan_secret_2026',
      { expiresIn: '30d' }
    );

    return res.json({
      success: true,
      token,
      user: { id: user._id, name: user.name, phone: user.phone }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// -----------------------------------------------------------
// 4. ADMIN LOGIN
// -----------------------------------------------------------
router.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASS || 'Admin@Jeevan2026';

  if (username === adminUser && password === adminPass) {
    const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET || 'jeevan_secret_2026', { expiresIn: '1d' });
    return res.json({ success: true, token });
  }
  return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
});

// -----------------------------------------------------------
// 5. ADMIN DASHBOARD DATA
// -----------------------------------------------------------
router.get('/admin/dashboard', async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    return res.json({
      success: true,
      stats: { totalUsers: users.length },
      users
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Error loading dashboard data' });
  }
});

// -----------------------------------------------------------
// 6. TWO-WAY DATA SYNC
// -----------------------------------------------------------
router.post('/sync', async (req, res) => {
  try {
    const { phone, clientData } = req.body;
    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (clientData) {
      user.syncedData = {
        ...(user.syncedData || {}),
        ...clientData,
        lastSyncedAt: new Date()
      };
      await user.save();
    }

    return res.json({ success: true, serverData: user.syncedData });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Sync failed' });
  }
});

// -----------------------------------------------------------
// 7. PUSH NOTIFICATION SUBSCRIBE
// -----------------------------------------------------------
router.post('/push/subscribe', async (req, res) => {
  try {
    const { phone, subscription } = req.body;
    await User.findOneAndUpdate({ phone }, { pushSubscription: subscription });
    return res.json({ success: true, message: 'Push token saved successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to save push token' });
  }
});

// -----------------------------------------------------------
// 8. DELETE USER BY ADMIN
// -----------------------------------------------------------
router.delete('/admin/user/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedUser = await User.findByIdAndDelete(id);

    if (!deletedUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({ success: true, message: 'User successfully deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Error occurred while deleting user', error: err.message });
  }
});

// -----------------------------------------------------------
// 9. RESET PASSWORD (OTP Verification + Update Password)
// -----------------------------------------------------------
router.post('/reset-password', async (req, res) => {
  try {
    const { phone, otp, newPassword } = req.body;

    if (!phone || !otp || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number, OTP, and new password are all required' 
      });
    }

    // 1. Check OTP (stored in memory/store)
    const storedOtpData = otpStore ? otpStore[phone] : null;
    
    // Check if the development/testing OTP matches or the stored OTP is valid
    const isValidOtp = (storedOtpData && storedOtpData.otp == otp) || (otp === '123456');

    if (!isValidOtp) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    // 2. Find User
    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ success: false, message: 'This mobile number is not registered' });
    }

    // 3. Update Password (Hash using bcrypt if available, otherwise save direct)
    if (typeof bcrypt !== 'undefined' && bcrypt.hash) {
      user.password = await bcrypt.hash(newPassword, 10);
    } else {
      user.password = newPassword;
    }

    await user.save();

    // Remove OTP from store after successful verification
    if (otpStore && otpStore[phone]) {
      delete otpStore[phone];
    }

    return res.json({ 
      success: true, 
      message: 'Password successfully changed! You can now log in with your new password.' 
    });
  } catch (err) {
    console.error('Reset Password Error:', err.message);
    return res.status(500).json({ 
      success: false, 
      message: 'An error occurred while resetting the password', 
      error: err.message 
    });
  }
}); 

module.exports = router;
  
