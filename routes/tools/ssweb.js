const express = require('express');
const axios = require('axios');
const router = express.Router();

router.get('/', async (req, res) => {
  const { url, theme = "light", device = "desktop" } = req.query;
  
  if (!url) {
    return res.status(400).json({ status: false, error: "URL requerida" });
  }

  try {
    const formattedUrl = url.startsWith("http") ? url : `https://${url}`;
    
    const sizes = {
      desktop: { width: 1920, height: 1080 },
      mobile: { width: 375, height: 812 },
      tablet: { width: 768, height: 1024 }
    };
    
    const size = sizes[device] || sizes.desktop;
    
    // Servicio gratuito de screenshots
    const screenshotUrl = `https://image.thum.io/get/width/${size.width}/crop/${size.height}/${formattedUrl}`;
    
    const response = await axios.get(screenshotUrl, {
      responseType: 'arraybuffer',
      timeout: 15000
    });
    
    res.set("Content-Type", "image/png");
    return res.send(response.data);
    
  } catch (error) {
    console.error('Error:', error.message);
    return res.status(500).json({ 
      status: false, 
      error: "Error generando screenshot. Verifica la URL."
    });
  }
});

module.exports = router;