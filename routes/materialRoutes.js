const express = require('express');
const router = express.Router();
const Material = require('../models/Material');

// 1. Upload Material (Student submission)
router.post('/upload', async (req, res) => {
  try {
    const { title, subject, classGrade, uploaderName, uploaderPhone, fileData } = req.body;
    if (!title || !subject || !fileData) {
      return res.status(400).json({ success: false, message: 'Title, Subject aur File zaroori hain' });
    }

    const material = new Material({
      title,
      subject,
      classGrade,
      uploaderName,
      uploaderPhone,
      fileData,
      status: 'pending'
    });

    await material.save();
    return res.status(201).json({ success: true, message: 'Study Material review ke liye submit ho gaya' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Upload fail ho gaya', error: err.message });
  }
});

// 2. Get All Approved Materials (Har student/device par dikhne ke liye)
router.get('/published', async (req, res) => {
  try {
    const materials = await Material.find({ status: 'approved' }).sort({ createdAt: -1 });
    return res.json({ success: true, materials });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Data load nahi hua' });
  }
});

// 3. Admin: Get All Materials (Pending + Approved)
router.get('/admin/all', async (req, res) => {
  try {
    const materials = await Material.find().sort({ createdAt: -1 });
    return res.json({ success: true, materials });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Admin data fetch fail' });
  }
});

// 4. Admin: Approve ya Reject karein
router.patch('/admin/status/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'approved' ya 'rejected'
    const updated = await Material.findByIdAndUpdate(id, { status }, { new: true });
    if (!updated) return res.status(404).json({ success: false, message: 'Material nahi mila' });

    return res.json({ success: true, message: `Status update ho gaya: ${status}` });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Status update fail' });
  }
});

// 5. Admin: Delete Material
router.delete('/admin/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await Material.findByIdAndDelete(id);
    return res.json({ success: true, message: 'Material delete ho gaya' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Delete fail ho gaya' });
  }
});

module.exports = router;
// GET: Fetch all pending student submissions for review queue
router.get('/admin/pending', async (req, res) => {
  try {
    const pendingMaterials = await Material.find({ status: 'pending' })
      .select('-fileData') // Initial list load fast rakhne ke liye fileData exclude kar sakte hain
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      count: pendingMaterials.length,
      materials: pendingMaterials
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Pending materials fetch karne mein dikkat aayi',
      error: err.message
    });
  }
});

// GET: Single Material Details with full fileData (PDF view karne ke liye)
router.get('/details/:id', async (req, res) => {
  try {
    const item = await Material.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Material nahi mila' });
    return res.json({ success: true, material: item });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Error fetching details' });
  }
});

