const express = require('express');
const router = express.Router();
const axios = require('axios');

async function twitterDl(url) {
  try {
    const id = url.split('/status/')[1]?.split('?')[0];
    if (!id) throw new Error('ID de tweet no encontrado');
    const response = await axios.get(`https://api.vreden.my.id/api/twitter?url=${url}`);
    return response.data;
  } catch (error) {
    throw error;
  }
}

router.get('/', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ status: false, error: 'URL requerida' });

  try {
    const data = await twitterDl(url);
    res.json({
      status: true,
      creator: 'KyokoAPI',
      data: data.result
    });
  } catch (error) {
    res.status(500).json({ status: false, error: 'Error al procesar Twitter' });
  }
});

module.exports = router;
