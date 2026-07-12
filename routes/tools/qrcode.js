const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');

router.get('/', async (req, res) => {
  const text = req.query.text;

  if (!text) {
    return res.status(400).send('Debes proporcionar el parámetro ?text= para generar el QR.');
  }

  try {
    res.setHeader('Content-Type', 'image/png');

    QRCode.toFileStream(res, text, {
      type: 'png',
      errorCorrectionLevel: 'H',
      margin: 2,
      scale: 10
    });

  } catch (err) {
    console.error('Error generando QR:', err);
    res.status(500).send('Error interno al generar el código QR.');
  }
});

module.exports = router;
