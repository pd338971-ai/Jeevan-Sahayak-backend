const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  gender: { type: String, default: 'Not Specified' },
  dob: { type: String, default: '' },

  // Data Sync
  syncedData: {
    reminders: { type: Array, default: [] },
    notes: { type: Array, default: [] },
    healthLogs: { type: Array, default: [] },
    lastSyncedAt: { type: Date, default: Date.now }
  },

  // Push Notification
  pushSubscription: {
    type: Object,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
