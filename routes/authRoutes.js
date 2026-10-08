router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || phone.length !== 10) {
      return res.status(400).json({ success: false, message: 'Kripya 10 anko ka valid mobile number dalein' });
    }

    // 6-digit random OTP generate karein
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // OTP ko memory me ya DB me 5 minute ke liye save karein
    otpStore[phone] = {
      otp: otp,
      expiresAt: Date.now() + 5 * 60 * 1000
    };

    // Fast2SMS DLT / Quick SMS API call
    const fast2smsApiKey = process.env.FAST2SMS_API_KEY;

    if (fast2smsApiKey) {
      await axios.get('https://www.fast2sms.com/dev/bulkV2', {
        params: {
          authorization: fast2smsApiKey,
          variables_values: otp,
          route: 'otp',
          numbers: phone
        }
      });
      console.log(`📱 SMS sent successfully to ${phone}`);
    } else {
      console.log(`⚠️ Fast2SMS API Key missing. Console OTP: ${otp}`);
    }

    return res.json({
      success: true,
      message: 'OTP aapke mobile number par bhej diya gaya hai'
    });

  } catch (err) {
    console.error('Fast2SMS Error:', err.response?.data || err.message);
    return res.status(500).json({
      success: false,
      message: 'SMS bhejne me dikkat aayi, kripya thodi der baad koshish karein'
    });
  }
});
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
const webpush = require('web-push');

// Web Push कॉन्फ़िगरेशन
webpush.setVapidDetails(
  'mailto:support@jeevansahayak.com',
  process.env.VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
  process.env.VAPID_PRIVATE_KEY || 'UUxI8gZ-5yY-62hP0jE8Jc9nJ8F3lM6q-W9eK2X3o5A'
);
// -----------------------------------------------------------
// 1. PASSWORD RESET (OTP से पासवर्ड बदलना)
// -----------------------------------------------------------
router.post('/reset-password', async (req, res) => {
  try {
    const { phone, otp, newPassword } = req.body;

    // OTP चेक (जो OTP memory या DB में सेव है)
    if (!otpStore[phone] || otpStore[phone].otp !== otp) {
      return res.status(400).json({ success: false, message: 'अमान्य या एक्सपायर्ड OTP' });
    }

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ success: false, message: 'यह मोबाइल नंबर रजिस्टर नहीं है' });
    }

    // नया पासवर्ड हैश करके सेव करें
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    delete otpStore[phone]; // इस्तेमाल हो चुका OTP हटाएं
    return res.json({ success: true, message: 'पासवर्ड सफलतापूर्वक बदल दिया गया है!' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'सर्वर एरर, कृपया दोबारा प्रयास करें' });
  }
});

// -----------------------------------------------------------
// 2. TWO-WAY DATA SYNC (ऑफलाइन डेटा सिंक)
// -----------------------------------------------------------
router.post('/sync', async (req, res) => {
  try {
    const { phone, clientData } = req.body;
    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ success: false, message: 'यूज़र नहीं मिला' });
    }

    // अगर क्लाइंट ने डेटा भेजा है तो डेटाबेस में अपडेट करें
    if (clientData) {
      user.syncedData = {
        ...(user.syncedData || {}),
        ...clientData,
        lastSyncedAt: new Date()
      };
      await user.save();
    }

    return res.json({
      success: true,
      message: 'डेटा सिंक सफल',
      serverData: user.syncedData
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'डेटा सिंक विफल' });
  }
});

// -----------------------------------------------------------
// 3. PUSH NOTIFICATION SUBSCRIPTION SAVE
// -----------------------------------------------------------
router.post('/push/subscribe', async (req, res) => {
  try {
    const { phone, subscription } = req.body;
    await User.findOneAndUpdate({ phone }, { pushSubscription: subscription });
    return res.json({ success: true, message: 'पुश नोटिफिकेशन रजिस्टर हो गया' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'पुश टोकन सेव नहीं हो सका' });
  }
});
            
