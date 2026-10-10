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
        message: 'GEMINI_API_KEY backend environment me missing hai' 
      });
    }

    // Google Gemini 3.8 Flash Endpoint with fast token limit
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;

    const response = await axios.post(
      endpoint,
      {
        contents: [
          {
            parts: [{ text: `Aap Jeevan Sahayak app ke smart AI assistant hain. User ke sawal ka simple, helpful aur concise Hindi/Hinglish me jawab dein: ${prompt}` }]
          }
        ],
        generationConfig: {
          maxOutputTokens: 300,
          temperature: 0.7
        }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 20000
      }
    );

    const reply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply) {
      return res.json({ 
        success: true, 
        reply: 'Main abhi aapke sawal ko process nahi kar paya, kripya dubara poochein.' 
      });
    }

    return res.json({ success: true, reply });

  } catch (err) {
    console.error('Gemini API Error:', err.response?.data?.error?.message || err.message);

    // Friendly fallback response taaki screen par error pop-up na aaye
    return res.json({ 
      success: true, 
      reply: 'Abhi AI network busy chal raha hai. Aap apna sawal 10 second baad dobara bhej kar dekhein.' 
    });
  }
});

module.exports = router;
      
