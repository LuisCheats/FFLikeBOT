const express = require('express');
const router = express.Router();
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

router.get('/', async (req, res) => {
    const videoURL = req.query.url;

    if (!videoURL) {
        return res.status(400).json({ status: false, error: 'Debes proporcionar una URL de TikTok.' });
    }

    try {
        const apiRes = await fetch('https://www.tikwm.com/api/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: videoURL })
        });

        const data = await apiRes.json();

        if (data.code !== 0 || !data.data) {
            return res.status(500).json({
                status: false,
                error: data.msg || 'No se pudo procesar el video de TikTok.'
            });
        }

        const v = data.data;

        return res.status(200).json({
            status: true,
            creator: "DvWilkerOFC",
            process: Math.random().toFixed(4),
            data: {
                id: v.id,
                region: v.region,
                title: v.title,
                duration: v.duration,
                stats: {
                    plays: v.play_count,
                    likes: v.digg_count,
                    shares: v.share_count,
                    comments: v.comment_count,
                    downloads: v.download_count
                },
                published: v.create_time,
                author: {
                    id: v.author.id,
                    username: `@${v.author.unique_id}`,
                    nickname: v.author.nickname,
                    avatar: v.author.avatar
                },
                music: {
                    title: v.music_info?.title,
                    author: v.music_info?.author,
                    url: v.music
                },
                media: {
                    size: `${(v.size / (1024 * 1024)).toFixed(2)} MB`,
                    no_watermark: v.play,
                    watermark: v.wmplay,
                    hd: v.hdplay
                }
            }
        });

    } catch (error) {
        console.error("Error al procesar el video de TikTok:", error);
        return res.status(500).json({
            status: false,
            error: 'Error interno al procesar TikTok.'
        });
    }
});

module.exports = router;
