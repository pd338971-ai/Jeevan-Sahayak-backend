const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// 1. Send OTP for Registration
exports.sendOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone || phone.length !== 10) {
      return res.status(400).json({ success: false, message: 'कृपया 10 अंकों का फोन नंबर दर्ज करें' });
    }

    const existingUser = await User.findOne({ phone, isVerified: true });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'यह फोन नंबर पहले से रजिस्टर्ड है' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpire = new Date(Date.now() + 10 * 60 * 1000); // 10 मिनट वैधता

    let user = await User.findOne({ phone });
    if (!user) {
      user = new User({ phone, otp, otpExpire });
    } else {
      user.otp = otp;
      user.otpExpire = otpExpire;
    }
    await user.save({ validateBeforeSave: false });

    console.log(`\n================================`);
    console.log(`📩 OTP for ${phone}: [ ${otp} ]`);
    console.log(`================================\n`);

    res.status(200).json({
      success: true,
      message: 'OTP सफलतापूर्वक भेजा गया',
      devOtp: otp // डेवलपमेंट टेस्टिंग के लिए
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Verify OTP & Register User
exports.registerUserWithOtp = async (req, res) => {
  try {
    const { name, gender, dob, phone, password, otp } = req.body;

    if (!name || !gender || !dob || !phone || !password || !otp) {
      return res.status(400).json({ success: false, message: 'कृपया सभी आवश्यक फ़ील्ड्स और OTP भरें' });
    }

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(400).json({ success: false, message: 'कृपया पहले OTP के लिए अनुरोध करें' });
    }

    if (user.otp !== otp || user.otpExpire < new Date()) {
      return res.status(400).json({ success: false, message: 'अमान्य या समाप्त हो चुका OTP!' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user.name = name;
    user.gender = gender;
    user.dob = dob;
    user.password = hashedPassword;
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpire = undefined;
    await user.save();

    res.status(201).json({
      success: true,
      message: 'रजिस्ट्रेशन सफलतापूर्वक पूरा हुआ!',
      user: {
        id: user._id,
        name: user.name,
        gender: user.gender,
        dob: user.dob,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3. User Login
exports.loginUser = async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ success: false, message: 'फोन नंबर और पासवर्ड अनिवार्य हैं' });
    }

    const user = await User.findOne({ phone, isVerified: true });
    if (!user) {
      return res.status(400).json({ success: false, message: 'खाता मौजूद नहीं है या वेरिफाइड नहीं है' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'गलत पासवर्ड!' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        gender: user.gender,
        dob: user.dob,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 4. Admin Login
exports.adminLogin = async (req, res) => {
  try {
    const { username, password } = req.body;

    const ADMIN_USER = process.env.ADMIN_USER || 'Deb_Singhania';
    const ADMIN_PASS = process.env.ADMIN_PASS || 'Deb@2009@#';

    if (username === ADMIN_USER && password === ADMIN_PASS) {
      const token = jwt.sign(
        { role: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
      );
      return res.status(200).json({ success: true, token, role: 'admin' });
    }

    return res.status(401).json({ success: false, message: 'अमान्य Admin क्रेडेंशियल्स!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 5. Admin Dashboard Metrics & User List
exports.getAdminDashboard = async (req, res) => {
  try {
    const users = await User.find({ isVerified: true })
      .select('-password -otp -otpExpire')
      .sort({ createdAt: -1 });

    const totalUsers = users.length;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const registeredToday = users.filter((u) => new Date(u.createdAt) >= today).length;

    const maleProfiles = users.filter((u) => u.gender === 'Male').length;
    const femaleProfiles = users.filter((u) => u.gender === 'Female').length;

    res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        registeredToday,
        maleProfiles,
        femaleProfiles
      },
      users
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 6. Delete User (Admin Action)
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    await User.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: 'यूज़र सफलतापूर्वक हटा दिया गया' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
