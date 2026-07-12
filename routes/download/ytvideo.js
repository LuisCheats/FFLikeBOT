const axios = require('axios');

module.exports = function(app) {
    
    async function downloadYouTubeVideo(url, format = "360") {
        try {
            const downloadResp = await axios.get(
                "https://p.savenow.to/ajax/download.php",
                {
                    params: {
                        copyright: 0,
                        format,
                        url,
                        api: "dfcb6d76f2f6a9894gjkege8a4ab232222"
                    },
                    headers: {
                        Accept: "application/json",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
                    }
                }
            );

            const data = downloadResp.data;
            if (!data.success || !data.id) {
                return { success: false, error: "No se pudo iniciar la descarga" };
            }

            const downloadId = data.id;
            let downloadUrl = null;
            let progressData = null;

            while (!downloadUrl) {
                const progressResp = await axios.get(
                    "https://p.savenow.to/api/progress",
                    {
                        params: { id: downloadId },
                        headers: { Accept: "application/json" }
                    }
                );

                progressData = progressResp.data;
                if (progressData.success === 1 && progressData.download_url) {
                    downloadUrl = progressData.download_url;
                } else {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
            }

            return {
                success: true,
                title: data.info?.title,
                thumbnail: data.info?.image,
                download_url: downloadUrl,
                alternative_downloads: progressData.alternative_download_urls || []
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    // Endpoint para descargar video
    app.get('/download/ytvideo', async (req, res) => {
        const { url, quality = '360' } = req.query;
        const endpointPrefix = req.baseUrl || '';

        if (!url) {
            return res.status(400).json({
                status: false,
                creator: "DVWILKER",
                error: "URL parameter is required",
                message: "Please provide a YouTube URL: ?url=YOUTUBE_URL"
            });
        }

        try {
            const result = await downloadYouTubeVideo(url, quality);

            if (!result.success) {
                return res.status(500).json({
                    status: false,
                    creator: "DVWILKER",
                    error: result.error
                });
            }

            // Si se solicita descarga directa
            if (req.query.download === 'true') {
                return res.redirect(result.download_url);
            }

            return res.json({
                status: true,
                creator: "DVWILKER",
                result: {
                    title: result.title,
                    thumbnail: result.thumbnail,
                    quality: quality + 'p',
                    format: "MP4",
                    download_url: result.download_url,
                    alternative_downloads: result.alternative_downloads,
                    api_download: `${endpointPrefix}/download/ytvideo?url=${encodeURIComponent(url)}&quality=${quality}&download=true`
                }
            });
        } catch (e) {
            return res.status(500).json({
                status: false,
                creator: "DVWILKER",
                error: e.message || "Unknown error"
            });
        }
    });
};
