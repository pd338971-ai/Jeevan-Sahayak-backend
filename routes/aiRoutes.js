const express = require('express');
const router = express.Router();
const axios = require('axios');

router.post('/chat', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ success: false, reply: 'Prompt zaroori hai' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.json({ 
        success: true, 
        reply: 'Backend error: GEMINI_API_KEY Render par configured nahi hai.' 
      });
    }

    // Google Gemini 3.8 Flash - Header auth se fast request
    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';

    const response = await axios({
      method: 'POST',
      url: endpoint,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey.trim()
      },
      data: {
        contents: [
          {
            role: 'user',
            parts: [{ text: `Aap Jeevan Sahayak AI hain. 2-3 short sentences me helpful jawab dein: ${prompt}` }]
          }
        ],
        generationConfig: {
          maxOutputTokens: 200,
          temperature: 0.7
        }
      },
      timeout: 35000 // Extended timeout
    });

    const reply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply) {
      return res.json({ success: true, reply: 'AI response empty aaya. Dobara poochein.' });
    }

    return res.json({ success: true, reply });

  } catch (err) {
    const status = err.response?.status;
    const errorMsg = err.response?.data?.error?.message || err.message;
    console.error('Gemini API Error:', status, errorMsg);

    return res.json({ 
      success: true, 
      reply: `Gemini Error (${status || 'Network'}): ${errorMsg}` 
    });
  }
});

module.exports = router;
