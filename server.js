require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

// Razorpay & Gemini AI Initialization
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Routes Import
const authRoutes = require('./routes/authRoutes');
let materialRoutes;
try {
  materialRoutes = require('./routes/materialRoutes');
} catch (e) {
  console.log('materialRoutes not loaded yet');
}

let aiRoutes;
try {
  aiRoutes = require('./routes/aiRoutes');
} catch (e) {
  console.log('aiRoutes not loaded yet');
}

// Routes Use
app.use('/api/auth', authRoutes);
if (materialRoutes) {
  app.use('/api/materials', materialRoutes);
}
if (aiRoutes) {
  app.use('/api/ai', aiRoutes);
}

// ============================================================================
// 🚀 USER APP DATA SYNC & 14-DAY TRIAL SUBSCRIPTION SCHEMA
// ============================================================================

const UserAppDataSchema = new mongoose.Schema(
  {
    userId: { type: String, index: true },
    phone: { type: String, index: true },
    email: { type: String, index: true },
    name: { type: String },
    subscription: {
      plan: { type: String, enum: ['free', 'basic', 'standard', 'pro'], default: 'pro' },
      status: { type: String, enum: ['active', 'expired', 'pending', 'inactive'], default: 'active' },
      expiryDate: { 
        type: Date, 
        default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // Default 14-day Pro Trial
      },
      isTrial: { type: Boolean, default: true },
      razorpayOrderId: { type: String },
      razorpayPaymentId: { type: String }
    },
    userProfile: { type: mongoose.Schema.Types.Mixed, default: {} },
    appData: { type: mongoose.Schema.Types.Mixed, default: {} },
    lastSyncedAt: { type: Date, default: Date.now }
  },
  { timestamps: true, strict: false }
);

const UserAppData =
  mongoose.models.UserAppData || mongoose.model('UserAppData', UserAppDataSchema);

// ============================================================================
// 📚 STUDY MATERIAL SCHEMA & AI AUTO-CATEGORIZATION ROUTE
// ============================================================================

const StudyMaterialSchema = new mongoose.Schema({
  studentClass: { type: String, index: true }, // Class 1 to 12
  stream: { type: String },                    // Science, Commerce, Arts, General
  subject: { type: String, index: true },      // Physics, Chemistry, Math, etc.
  chapterName: { type: String },
  documentType: { type: String },              // Notes, Question Paper, Formula Sheet
  title: { type: String },
  fileUrl: { type: String },
  uploadedAt: { type: Date, default: Date.now }
});

const StudyMaterial = mongoose.models.StudyMaterial || mongoose.model('StudyMaterial', StudyMaterialSchema);

// AI Smart Upload Route
app.post('/api/study/upload-smart', async (req, res) => {
  try {
    const { title, content, fileUrl } = req.body;

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Analyze the following study material title and content snippet. Extract details in strict JSON format with keys: "studentClass" (string value between "1" to "12"), "stream" (e.g., Science PCM, Commerce, Arts, or General), "subject" (e.g., Physics, Chemistry, Mathematics, Biology, English), "chapterName", and "documentType" (Notes, Question Paper, Formula Sheet, or Assignment).
    
    Title: ${title}
    Content: ${content ? content.substring(0, 1000) : "N/A"}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    const jsonStartIndex = responseText.indexOf('{');
    const jsonEndIndex = responseText.lastIndexOf('}');
    const parsedData = JSON.parse(responseText.substring(jsonStartIndex, jsonEndIndex + 1));

    const newMaterial = new StudyMaterial({
      studentClass: parsedData.studentClass || "12",
      stream: parsedData.stream || "Science PCM",
      subject: parsedData.subject || "General",
      chapterName: parsedData.chapterName || "Unclassified",
      documentType: parsedData.documentType || "Notes",
      title: title,
      fileUrl: fileUrl
    });

    await newMaterial.save();

    res.status(200).json({
      success: true,
      message: "AI successfully detected and categorized the study material! 🚀",
      extractedDetails: parsedData,
      savedRecord: newMaterial
    });
  } catch (error) {
    console.error('AI Auto-Classification Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Fetch Study Materials by Class and Subject
app.get('/api/study/materials/:class/:subject', async (req, res) => {
  try {
    const { studentClass, subject } = req.params;
    const query = {};
    if (studentClass && studentClass !== 'all') query.studentClass = studentClass;
    if (subject && subject !== 'all') query.subject = new RegExp(subject, 'i');

    const materials = await StudyMaterial.find(query).sort({ uploadedAt: -1 }).lean();
    res.json({ success: true, count: materials.length, data: materials });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================================
// 🛡️ PLAN PROTECTION MIDDLEWARE
// ============================================================================
const checkPlan = (requiredPlan) => {
  const planLevels = { 'free': 0, 'basic': 1, 'standard': 2, 'pro': 3 };

  return async (req, res, next) => {
    try {
      const identifier = req.headers['user-id'] || req.query.userId || req.body.userId;
      if (!identifier) {
        return res.status(401).json({ success: false, message: "Authentication identifier missing" });
      }

      const userRecord = await UserAppData.findOne({
        $or: [{ userId: String(identifier) }, { phone: String(identifier) }, { email: String(identifier).toLowerCase() }]
      });

      const userPlan = userRecord?.subscription?.plan || 'free';
      const status = userRecord?.subscription?.status || 'inactive';
      const expiryDate = userRecord?.subscription?.expiryDate;
      const isExpired = expiryDate && new Date() > new Date(expiryDate);

      if (status !== 'active' || isExpired) {
        return res.status(403).json({ 
          success: false, 
          message: "Subscription or trial has expired. Please upgrade.", 
          upgradeRequired: true 
        });
      }

      if (planLevels[userPlan] >= planLevels[requiredPlan]) {
        req.currentUserPlan = userPlan;
        next();
      } else {
        return res.status(403).json({ 
          success: false, 
          message: `This feature requires a ${requiredPlan.toUpperCase()} plan or higher.`,
          upgradeRequired: true,
          currentPlan: userPlan,
          requiredPlan: requiredPlan
        });
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  };
};

// ============================================================================
// 💳 PAYMENT & SUBSCRIPTION ROUTES (₹99, ₹199, ₹299)
// ============================================================================

app.post('/api/payment/create-order', async (req, res) => {
  try {
    const { plan, amount } = req.body; 
    
    const validPlans = { 'basic': 99, 'standard': 199, 'pro': 299 };
    if (!validPlans[plan] || validPlans[plan] !== Number(amount)) {
      return res.status(400).json({ success: false, message: "Invalid plan or amount mismatch" });
    }

    const options = {
      amount: Number(amount) * 100, // Razorpay paise conversion
      currency: "INR",
      receipt: `receipt_${plan}_${Date.now()}`
    };

    const order = await razorpay.orders.create(options);
    res.json({ success: true, order, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (error) {
    console.error('Create Order Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/payment/verify', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan, userId, phone, email } = req.body;
    
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generated_signature = hmac.digest('hex');

    if (generated_signature === razorpay_signature) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 30); // 30 Days Validity

      const query = {};
      if (userId) query.userId = String(userId);
      else if (phone) query.phone = String(phone);
      else if (email) query.email = String(email).toLowerCase();
      else {
        return res.status(400).json({ success: false, message: "User identifier required for activation" });
      }

      const updatedRecord = await UserAppData.findOneAndUpdate(
        query,
        {
          $set: {
            "subscription.plan": plan,
            "subscription.status": "active",
            "subscription.expiryDate": expiry,
            "subscription.isTrial": false,
            "subscription.razorpayOrderId": razorpay_order_id,
            "subscription.razorpayPaymentId": razorpay_payment_id,
            lastSyncedAt: new Date()
          }
        },
        { upsert: true, new: true }
      );

      res.json({ success: true, message: "Subscription activated successfully!", subscription: updatedRecord.subscription });
    } else {
      res.status(400).json({ success: false, message: "Invalid payment signature" });
    }
  } catch (error) {
    console.error('Payment Verification Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 🚀 UNIVERSAL USER DATA SYNC & ADMIN FULL INSPECTOR ROUTES
// ============================================================================

app.post('/api/user/sync', async (req, res) => {
  try {
    const { userId, phone, email, name, userProfile, appData } = req.body;

    const query = {};
    if (userId) query.userId = String(userId);
    else if (phone) query.phone = String(phone);
    else if (email) query.email = String(email).toLowerCase();
    else {
      return res.status(400).json({
        success: false,
        message: 'userId, phone, or email is required to sync data'
      });
    }

    // Check if user already exists to preserve active trial/subscription
    const existingUser = await UserAppData.findOne(query);

    const updateData = {
      ...(userId && { userId: String(userId) }),
      ...(phone && { phone: String(phone) }),
      ...(email && { email: String(email).toLowerCase() }),
      ...(name && { name }),
      ...(userProfile && { userProfile }),
      appData: appData || {},
      lastSyncedAt: new Date()
    };

    // If brand new user, initialize 14-day Pro trial automatically
    if (!existingUser) {
      updateData.subscription = {
        plan: 'pro',
        status: 'active',
        expiryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        isTrial: true
      };
    }

    const updatedRecord = await UserAppData.findOneAndUpdate(
      query,
      { $set: updateData },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      success: true,
      message: 'All user app data synced successfully!',
      lastSyncedAt: updatedRecord.lastSyncedAt,
      subscription: updatedRecord.subscription
    });
  } catch (error) {
    console.log('Sync Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/user/sync/:identifier', async (req, res) => {
  try {
    const id = req.params.identifier;
    const record = await UserAppData.findOne({
      $or: [{ userId: id }, { phone: id }, { email: id.toLowerCase() }]
    }).lean();

    return res.status(200).json({
      success: true,
      data: record || null
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/admin/all-user-data', async (req, res) => {
  try {
    const syncedDataList = await UserAppData.find({}).sort({ lastSyncedAt: -1 }).lean();

    let registeredUsers = [];
    try {
      registeredUsers = await mongoose.connection.collection('users').find({}).toArray();
    } catch (e) {
      registeredUsers = [];
    }

    return res.status(200).json({
      success: true,
      syncedRecords: syncedDataList,
      registeredUsers: registeredUsers
    });
  } catch (error) {
    console.log('Admin Fetch Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/auth/admin/user/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    let deletedUser = null;

    const usersCollection = mongoose.connection.collection('users');

    if (mongoose.Types.ObjectId.isValid(userId)) {
      const userDoc = await usersCollection.findOne({ _id: new mongoose.Types.ObjectId(userId) });
      if (userDoc) {
        deletedUser = userDoc;
        await usersCollection.deleteOne({ _id: new mongoose.Types.ObjectId(userId) });
      }
    }

    if (deletedUser) {
      await UserAppData.deleteMany({
        $or: [
          { userId: String(deletedUser._id) },
          { phone: String(deletedUser.phone || deletedUser.mobile || "") },
          { email: String(deletedUser.email || "").toLowerCase() }
        ]
      });
    } else {
      await UserAppData.deleteMany({
        $or: [
          { userId: String(userId) },
          { phone: String(userId) },
          { email: String(userId).toLowerCase() }
        ]
      });
      
      await usersCollection.deleteOne({
        $or: [
          { phone: String(userId) },
          { email: String(userId).toLowerCase() }
        ]
      });
    }

    return res.status(200).json({ 
      success: true, 
      message: 'User profile and all synced app data deleted permanently.' 
    });
  } catch (error) {
    console.log('Delete User Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Health Check Route
app.get('/', (req, res) => {
  res.send('Jeevan Sahayak Backend is Running Successfully 🚀');
});

// Database Connection
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB Connected Successfully');
    app.listen(PORT, () => {
      console.log(`🚀 Server listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.log('❌ MongoDB Connection Error:', err.message);
  });
    
