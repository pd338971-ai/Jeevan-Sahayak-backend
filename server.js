require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Razorpay = require('razorpay');
const crypto = require('crypto');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

// Razorpay Initialization
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

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
// 🚀 USER APP DATA SYNC & SUBSCRIPTION SCHEMA
// ============================================================================

const UserAppDataSchema = new mongoose.Schema(
  {
    userId: { type: String, index: true },
    phone: { type: String, index: true },
    email: { type: String, index: true },
    name: { type: String },
    subscription: {
      plan: { type: String, enum: ['free', 'basic', 'standard', 'pro'], default: 'free' },
      status: { type: String, enum: ['active', 'expired', 'pending', 'inactive'], default: 'inactive' },
      expiryDate: { type: Date },
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
// 🛡️ PLAN PROTECTION MIDDLEWARE
// ============================================================================
const checkPlan = (requiredPlan) => {
  const planLevels = { 'free': 0, 'basic': 1, 'standard': 2, 'pro': 3 };

  return async (req, res, next) => {
    try {
      // Frontend se user identifier headers, query ya body mein pass hoga
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

      // Check if subscription is active and not expired
      if (status !== 'active' || isExpired) {
        return res.status(403).json({ 
          success: false, 
          message: "Subscription has expired or is inactive. Please upgrade.", 
          upgradeRequired: true 
        });
      }

      // Check tier hierarchy (Pro can access Basic/Standard, Standard can access Basic, etc.)
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

// 1. Create Razorpay Order Route
app.post('/api/payment/create-order', async (req, res) => {
  try {
    const { plan, amount } = req.body; 
    
    // Exact pricing security validation (Basic: 99, Standard: 199, Pro: 299)
    const validPlans = { 'basic': 99, 'standard': 199, 'pro': 299 };
    if (!validPlans[plan] || validPlans[plan] !== Number(amount)) {
      return res.status(400).json({ success: false, message: "Invalid plan or amount mismatch" });
    }

    const options = {
      amount: Number(amount) * 100, // Razorpay takes paise (₹99 = 9900 paise)
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

// 2. Verify Payment & Activate Plan Route
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
// 🔒 EXAMPLE PROTECTED ROUTES USING checkPlan MIDDLEWARE
// ============================================================================

// Example 1: Basic or higher required
app.get('/api/premium/basic-feature', checkPlan('basic'), (req, res) => {
  res.json({ success: true, message: "Welcome to Basic/Standard/Pro Feature!" });
});

// Example 2: Standard or higher required
app.get('/api/premium/standard-feature', checkPlan('standard'), (req, res) => {
  res.json({ success: true, message: "Welcome to Standard/Pro Feature!" });
});

// Example 3: Pro only required
app.get('/api/premium/pro-feature', checkPlan('pro'), (req, res) => {
  res.json({ success: true, message: "Welcome to Exclusive Pro Feature!" });
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

    const updatedRecord = await UserAppData.findOneAndUpdate(
      query,
      {
        $set: {
          ...(userId && { userId: String(userId) }),
          ...(phone && { phone: String(phone) }),
          ...(email && { email: String(email).toLowerCase() }),
          ...(name && { name }),
          ...(userProfile && { userProfile }),
          appData: appData || {},
          lastSyncedAt: new Date()
        }
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      success: true,
      message: 'All user app data synced to cloud & admin successfully!',
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
      message: 'User profile and all synced app data deleted permanently from server.' 
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
