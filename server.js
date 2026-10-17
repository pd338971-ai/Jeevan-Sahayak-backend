require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
// Body limit badhai hai taaki PDF / notes aur full appData upload ho sakein
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

// Routes Import (Sirf ek baar)
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
// 🚀 UNIVERSAL USER DATA SYNC & ADMIN FULL INSPECTOR ROUTES (NO EXTRA FILE NEEDED)
// ============================================================================

const UserAppDataSchema = new mongoose.Schema(
  {
    userId: { type: String, index: true },
    phone: { type: String, index: true },
    email: { type: String, index: true },
    name: { type: String },
    userProfile: { type: mongoose.Schema.Types.Mixed, default: {} },
    appData: { type: mongoose.Schema.Types.Mixed, default: {} }, // Tasks, Expenses, Health, Notes, Vault, Udhari, etc.
    lastSyncedAt: { type: Date, default: Date.now }
  },
  { timestamps: true, strict: false }
);

const UserAppData =
  mongoose.models.UserAppData || mongoose.model('UserAppData', UserAppDataSchema);

// 1. Save / Sync User's Complete Browser Data to MongoDB
app.post('/api/user/sync', async (req, res) => {
  try {
    const { userId, phone, email, name, userProfile, appData } = req.body;

    // Identify user uniquely by userId, phone, or email
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

    // Also try updating main 'users' collection directly so existing /api/auth admin routes also get appData
    try {
      const usersCollection = mongoose.connection.collection('users');
      const userFilter = [];
      if (userId && mongoose.Types.ObjectId.isValid(userId)) {
        userFilter.push({ _id: new mongoose.Types.ObjectId(userId) });
      }
      if (phone) userFilter.push({ phone: String(phone) }, { mobile: String(phone) });
      if (email) userFilter.push({ email: String(email).toLowerCase() });

      if (userFilter.length > 0) {
        await usersCollection.updateOne(
          { $or: userFilter },
          { $set: { appData: appData || {}, lastSyncedAt: new Date() } }
        );
      }
    } catch (innerErr) {
      // Ignore if collection name differs
    }

    return res.status(200).json({
      success: true,
      message: 'All user app data synced to cloud & admin successfully!',
      lastSyncedAt: updatedRecord.lastSyncedAt
    });
  } catch (error) {
    console.error('Sync Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Fetch Single User's Synced Data (When user logs in on any device)
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

// 3. Admin Endpoint: Get ALL Registered Users + Their Complete App Data (Tasks, Expenses, Health, Notes, etc.)
app.get('/api/admin/all-user-data', async (req, res) => {
  try {
    const syncedDataList = await UserAppData.find({}).sort({ lastSyncedAt: -1 }).lean();

    // Also fetch all registered users from the 'users' collection to merge profile + synced data
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
    console.error('Admin Fetch Error:', error);
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
    console.error('❌ MongoDB Connection Error:', err.message);
  });
         
