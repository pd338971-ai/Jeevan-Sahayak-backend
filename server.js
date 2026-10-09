require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');

const app = express();

// Database Connect
connectDB();

// Middlewares
app.use(cors());
app.use(express.json());

// Main Routes
app.use('/api/auth', authRoutes);

app.get('/', (req, res) => {
  res.send('Jeevan Sahayak API Server is Live & Running!');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
// Body size limit badhayein taaki PDF upload fail na ho
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

// Routes import
const authRoutes = require('./routes/authRoutes');
const materialRoutes = require('./routes/materialRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/materials', materialRoutes);
