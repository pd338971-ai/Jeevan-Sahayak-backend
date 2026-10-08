const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other'],
      required: true
    },
    dob: {
      type: String,
      required: true
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      match: [/^[0-9]{10}$/, 'कृपया 10 अंकों का मान्य मोबाइल नंबर दर्ज करें']
    },
    password: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user'
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    otp: {
      type: String
    },
    otpExpire: {
      type: Date
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  gender: { type: String, default: 'Not Specified' },
  dob: { type: String, default: '' },

  // Data Sync स्टोर करने के लिए:
  syncedData: {
    reminders: { type: Array, default: [] },
    notes: { type: Array, default: [] },
    healthLogs: { type: Array, default: [] },
    lastSyncedAt: { type: Date, default: Date.now }
  },

  // App बंद होने पर Push Notification भेजने के लिए:
  pushSubscription: {
    type: Object,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
