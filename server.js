require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
// Body limit badhai hai taaki PDF / notes upload ho sakein
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

// Routes Use
app.use('/api/auth', authRoutes);
if (materialRoutes) {
  app.use('/api/materials', materialRoutes);
}

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
  
