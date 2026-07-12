const express = require('express');
const router = express.Router();
const { fbdl } = require('ruhend-scraper');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const cheerio = require('cheerio');

async function scrapeMetadata(pageUrl) {
  try {
    const resp = await fetch(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await resp.text();
    const $ = cheerio.load(html);

    const getMeta = (name, attr = 'content') =>
      $(`meta[property="${name}"]`).attr(attr) ||
      $(`meta[name="${name}"]`).attr(attr) ||
      null;

    return {
      title: getMeta('og:title') || getMeta('twitter:title'),
      description: getMeta('og:description') || getMeta('twitter:description'),
      siteName: "Facebook"
    };
  } catch {
    return { title: null, description: null, siteName: "Facebook" };
  }
}

router.get('/', async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ status: false, error: 'Debes proporcionar una URL de Facebook.' });
  }

  try {
    const result = await fbdl(url);
    if (!result?.data?.length) {
      return res.status(404).json({ status: false, error: 'No se encontraron videos disponibles.' });
    }

    const video = result.data[0];
    const meta = await scrapeMetadata(url);

    return res.json({
      status: true,
      creator: 'KyokoAPI',
      metadata: {
        title: meta.title,
        description: meta.description,
        siteName: meta.siteName
      },
      download: video.url
    });

  } catch (err) {
    console.error('Error en Facebook downloader:', err);
    return res.status(500).json({
      status: false,
      error: 'Error al procesar el video de Facebook.'
    });
  }
});

module.exports = router;
