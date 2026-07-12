const express = require('express');
const router = express.Router();
const axios = require('axios');

async function tiktoks(query) {
    try {
        const response = await axios({
            method: "POST",
            url: "https://www.tikwm.com/api/feed/search",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "Cookie": "current_language=en",
                "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
            },
            data: new URLSearchParams({
                keywords: query,
                count: 10,
                cursor: 0,
                HD: 1,
            }),
            timeout: 30000,
        });

        const videos = response.data.data.videos;
        if (!videos || videos.length === 0) {
            throw new Error("No se encontraron videos.");
        }
        return videos;
    } catch (error) {
        throw new Error(error.message);
    }
}

router.get('/', async (req, res) => {
    const query = req.query.query;

    if (!query || query.trim().length === 0) {
        return res.status(400).json({
            status: false,
            error: "El parámetro query es requerido"
        });
    }

    if (query.length > 100) {
        return res.status(400).json({
            status: false,
            error: "La búsqueda es demasiado larga"
        });
    }

    try {
        const result = await tiktoks(query.trim());
        res.json({
            status: true,
            creator: "KyokoAPI",
            data: result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: false,
            error: error.message || "Internal Server Error"
        });
    }
});

module.exports = router;
