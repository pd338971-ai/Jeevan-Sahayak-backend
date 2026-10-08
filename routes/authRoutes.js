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
      return res.status(400).json({ success: false, message: 'कृपया 10 अंकों का मान्य मोबाइल नंबर दर्ज करें' });
    }

    // 6-अंकों का OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[phone] = {
      otp: otp,
      expiresAt: Date.now() + 5 * 60 * 1000 // 5 मिनट एक्सपायरी
    };

    console.log(`🔑 OTP for ${phone}: ${otp}`);

    const apiKey = process.env.FAST2SMS_API_KEY;
    if (apiKey) {
      try {
        // route: 'q' se direct phone par Quick SMS jayega bina domain verification ke
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
      message: 'OTP आपके मोबाइल नंबर पर भेज दिया गया है',
      devOtp: otp
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'OTP भेजने में त्रुटि' });
  }
});

// -----------------------------------------------------------
// 2. USER REGISTRATION
// -----------------------------------------------------------
router.post('/register', async (req, res) => {
  try {
    const { name, phone, password, otp, gender, dob } = req.body;

    if (!name || !phone || !password || !otp) {
      return res.status(400).json({ success: false, message: 'सभी जानकारी भरना अनिवार्य है' });
    }

    if (!otpStore[phone] || otpStore[phone].otp !== otp) {
      return res.status(400).json({ success: false, message: 'गलत या एक्सपायर्ड OTP' });
    }

    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'यह मोबाइल नंबर पहले से रजिस्टर है' });
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

    return res.status(201).json({ success: true, message: 'प्रोफ़ाइल सफलतापूर्वक बन गई!' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'रजिस्ट्रेशन विफल', error: err.message });
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
      return res.status(400).json({ success: false, message: 'यह नंबर रजिस्टर नहीं है' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'गलत पासवर्ड' });
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
    return res.status(500).json({ success: false, message: 'लॉगिन विफल' });
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
  return res.status(401).json({ success: false, message: 'गलत एडमिन क्रेडेंशियल्स' });
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
    return res.status(500).json({ success: false, message: 'डेटा लोड करने में त्रुटि' });
  }
});

// -----------------------------------------------------------
// 6. PASSWORD RESET VIA OTP
// -----------------------------------------------------------
router.post('/reset-password', async (req, res) => {
  try {
    const { phone, otp, newPassword } = req.body;

    if (!otpStore[phone] || otpStore[phone].otp !== otp) {
      return res.status(400).json({ success: false, message: 'गलत या एक्सपायर्ड OTP' });
    }

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ success: false, message: 'यूज़र नहीं मिला' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    delete otpStore[phone];
    return res.json({ success: true, message: 'पासवर्ड सफलतापूर्वक बदल दिया गया!' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'पासवर्ड रीसेट विफल' });
  }
});

// -----------------------------------------------------------
// 7. TWO-WAY DATA SYNC
// -----------------------------------------------------------
router.post('/sync', async (req, res) => {
  try {
    const { phone, clientData } = req.body;
    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ success: false, message: 'यूज़र नहीं मिला' });

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
    return res.status(500).json({ success: false, message: 'सिंक विफल' });
  }
});

// -----------------------------------------------------------
// 8. PUSH NOTIFICATION SUBSCRIBE
// -----------------------------------------------------------
router.post('/push/subscribe', async (req, res) => {
  try {
    const { phone, subscription } = req.body;
    await User.findOneAndUpdate({ phone }, { pushSubscription: subscription });
    return res.json({ success: true, message: 'पुश टोकन सुरक्षित हो गया' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'टोकन सेव करने में विफल' });
  }
});

module.exports = router;
      
