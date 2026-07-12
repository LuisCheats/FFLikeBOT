const express = require('express');
const router = express.Router();
const { igdl } = require('ruhend-scraper');

router.get('/', async (req, res) => {
    const url = req.query.url;

    if (!url) {
        return res.status(400).json({
            status: false,
            error: 'Debes proporcionar una URL de Instagram.'
        });
    }

    try {
        const result = await igdl(url);

        if (!result || !result.data || result.data.length === 0) {
            return res.status(404).json({
                status: false,
                error: 'No se encontraron medios para esta URL. Verifica que el post sea público.'
            });
        }

        res.json({
            status: true,
            creator: 'KyokoAPI',
            data: result.data.map(item => ({
                url: item.url,
                thumbnail: item.thumbnail || null
            }))
        });

    } catch (error) {
        console.error('Error en Instagram downloader:', error.message);
        res.status(500).json({
            status: false,
            error: 'Error interno al procesar Instagram.'
        });
    }
});

module.exports = router;
