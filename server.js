require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

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
// 🚀 UNIVERSAL USER DATA SYNC & ADMIN FULL INSPECTOR ROUTES
// ============================================================================

const UserAppDataSchema = new mongoose.Schema(
  {
    userId: { type: String, index: true },
    phone: { type: String, index: true },
    email: { type: String, index: true },
    name: { type: String },
    userProfile: { type: mongoose.Schema.Types.Mixed, default: {} },
    appData: { type: mongoose.Schema.Types.Mixed, default: {} },
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
    } catch (innerErr) {}

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

// 2. Fetch Single User's Synced Data
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

// 3. Admin Endpoint: Get ALL Registered Users + Their Complete App Data
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
    console.error('Admin Fetch Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 4. Admin Cascade Deletion Endpoint
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
    console.error('Delete User Error:', error);
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
    console.log('✅ MongoDB Connected Successfully');[span_2](start_span)[span_2](end_span)
    app.listen(PORT, () => {
      console.log(`🚀 Server listening on port ${PORT}`);[span_3](start_span)[span_3](end_span)
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB Connection Error:', err.message);[span_4](start_span)[span_4](end_span)
  });
    
