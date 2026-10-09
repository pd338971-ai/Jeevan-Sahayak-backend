const mongoose = require('mongoose');

const materialSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subject: { type: String, required: true },
  classGrade: { type: String, default: '' },
  uploaderName: { type: String, default: 'Student' },
  uploaderPhone: { type: String, default: '' },
  fileData: { type: String, required: true }, // Base64 Data URL (PDF ya Document)
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Material', materialSchema);
  
