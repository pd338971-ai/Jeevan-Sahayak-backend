const express = require('express');
const router = express.Router();
const axios = require('axios');

router.post('/chat', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ success: false, message: 'Prompt zaroori hai' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ success: false, message: 'GEMINI_API_KEY set nahi hai' });
    }

    // Google Gemini 2.5 Flash Free API Call
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        contents: [
          {
            role: 'user',
            parts: [{ text: `Aap Jeevan Sahayak AI Assistant hain. Students aur users ki padhai aur routine me madad karein. Question: ${prompt}` }]
          }
        ]
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const reply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Jawab generate nahi ho paya.';
    return res.json({ success: true, reply });
  } catch (err) {
    console.error('Gemini Error:', err.response?.data || err.message);
    return res.status(500).json({ success: false, message: 'AI se jawab pane me dikkat aayi' });
  }
});

module.exports = router;
