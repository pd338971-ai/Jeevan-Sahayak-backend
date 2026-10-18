require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
// Body limit badhai hai taaki PDF / notes aur full appData upload ho sakein[span_3](start_span)[span_3](end_span)
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

// Routes Import (Sirf ek baar)[span_4](start_span)[span_4](end_span)
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

// Routes Use[span_5](start_span)[span_5](end_span)
app.use('/api/auth', authRoutes);
if (materialRoutes) {
  app.use('/api/materials', materialRoutes);
}
if (aiRoutes) {
  app.use('/api/ai', aiRoutes);
}

// ============================================================================
// 🚀 UNIVERSAL USER DATA SYNC & ADMIN FULL INSPECTOR ROUTES (NO EXTRA FILE NEEDED)[span_6](start_span)[span_6](end_span)
// ============================================================================

const UserAppDataSchema = new mongoose.Schema(
  {
    userId: { type: String, index: true },
    phone: { type: String, index: true },
    email: { type: String, index: true },
    name: { type: String },
    userProfile: { type: mongoose.Schema.Types.Mixed, default: {} },
    appData: { type: mongoose.Schema.Types.Mixed, default: {} }, // Tasks, Expenses, Health, Notes, Vault, Udhari, etc.[span_7](start_span)[span_7](end_span)
    lastSyncedAt: { type: Date, default: Date.now }
  },
  { timestamps: true, strict: false }
);

const UserAppData =
  mongoose.models.UserAppData || mongoose.model('UserAppData', UserAppDataSchema);

// 1. Save / Sync User's Complete Browser Data to MongoDB[span_8](start_span)[span_8](end_span)
app.post('/api/user/sync', async (req, res) => {
  try {
    const { userId, phone, email, name, userProfile, appData } = req.body;

    // Identify user uniquely by userId, phone, or email[span_9](start_span)[span_9](end_span)
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

    // Also try updating main 'users' collection directly so existing /api/auth admin routes also get appData[span_10](start_span)[span_10](end_span)
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
      // Ignore if collection name differs[span_11](start_span)[span_11](end_span)
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

// 2. Fetch Single User's Synced Data (When user logs in on any device)[span_12](start_span)[span_12](end_span)
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

// 3. Admin Endpoint: Get ALL Registered Users + Their Complete App Data (Tasks, Expenses, Health, Notes, etc.)[span_13](start_span)[span_13](end_span)
app.get('/api/admin/all-user-data', async (req, res) => {
  try {
    const syncedDataList = await UserAppData.find({}).sort({ lastSyncedAt: -1 }).lean();

    // Also fetch all registered users from the 'users' collection to merge profile + synced data[span_14](start_span)[span_14](end_span)
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

// 4. Admin Cascade Deletion Endpoint: Delete User Profile & All Synced AppData Permanently
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

    // If user found in collection, delete matching records from UserAppData[span_15](start_span)[span_15](end_span)
    if (deletedUser) {
      await UserAppData.deleteMany({
        $or: [
          { userId: String(deletedUser._id) },
          { phone: String(deletedUser.phone || deletedUser.mobile || "") },
          { email: String(deletedUser.email || "").toLowerCase() }
        ]
      });
    } else {
      // Fallback matching by ID, phone, or email string directly
      await UserAppData.deleteMany({
        $or: [
          { userId: String(userId) },
          { phone: String(userId) },
          { email: String(userId).toLowerCase() }
        ]
      });
      
      // Also clean up users collection if id was passed as phone/email
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

// Health Check Route[span_16](start_span)[span_16](end_span)
app.get('/', (req, res) => {
  res.send('Jeevan Sahayak Backend is Running Successfully 🚀');
});

// Database Connection[span_17](start_span)[span_17](end_span)
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB Connected Successfully');[span_18](start_span)[span_18](end_span)
    app.listen(PORT, () => {
      console.log(`🚀 Server listening on port ${PORT}`);[span_19](start_span)[span_19](end_span)
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB Connection Error:', err.message);[span_20](start_span)[span_20](end_span)
  });
                                                    
