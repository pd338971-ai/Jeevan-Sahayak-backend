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
      return res.status(500).json({ 
        success: false, 
        message: 'GEMINI_API_KEY backend environment me set nahi hai' 
      });
    }

    // Google Gemini 1.5 Flash official stable endpoint
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        contents: [
          {
            role: 'user',
            parts: [{ text: `Aap Jeevan Sahayak AI Assistant hain. User ke sawal ka saral, helpful aur concise jawab dein: ${prompt}` }]
          }
        ]
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 25000 // 25 seconds timeout
      }
    );

    const reply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply) {
      return res.status(500).json({ success: false, message: 'AI model ne koi text generate nahi kiya' });
    }

    return res.json({ success: true, reply });
  } catch (err) {
    console.error('Gemini API Error Detail:', err.response?.data || err.message);
    const errorMsg = err.response?.data?.error?.message || err.message;
    return res.status(500).json({ 
      success: false, 
      message: 'AI se jawab pane me dikkat aayi',
      error: errorMsg
    });
  }
});

module.exports = router;
      
