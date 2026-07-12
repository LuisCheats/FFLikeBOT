const express = require('express');
const router = express.Router();
const axios = require('axios');

class GeminiAPI {
    constructor(config) {
        if (!config.cookie) throw new Error("Cookie required");
        this.config = {
            cookie: "__Secure-1PSID=" + config.cookie,
            systemPrompt: config.systemPrompt || "",
        };
        this.initialUrl = "https://gemini.google.com";
        this.streamUrl = "https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate";
        this.headers = {
            "accept": "*/*",
            "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
            "sec-ch-ua-mobile": "?1",
            "sec-ch-ua-platform": '"Android"',
            "x-same-domain": "1",
            "cookie": this.config.cookie,
            "Referer": "https://gemini.google.com/",
            "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36"
        };
        this.wizData = null;
    }

    async fetchWizData() {
        try {
            const response = await axios.get(this.initialUrl, { headers: this.headers });
            const wizRegex = /window\.WIZ_global_data\s*=\s*({[\s\S]*?});/;
            const match = response.data.match(wizRegex);
            this.wizData = match ? JSON.parse(match[1]) : null;
        } catch (error) {
            this.wizData = null;
        }
        return this.wizData;
    }

    async query(query, options = {}) {
        if (!this.wizData) await this.fetchWizData();
        const { conversationID, responseID, choiceID } = options;
        const params = {
            bl: this.wizData.cfb2h,
            "f.sid": this.wizData.FdrFJe,
            hl: "es",
            _reqid: Math.floor(Math.random() * 9000000 + 1000000).toString(),
            rt: "c",
        };
        const messageStruct = [
            [query, 0, null, null, null, null, 0],
            ["es"],
            [conversationID || "", responseID || "", choiceID || "", null, null, null, null, null, null, ""],
            null, null, null, [1], 1, null, null, 1, 0, null, null, null, null, null, [[0]], 1, null, null, null, null, null,
            ["", "", this.config.systemPrompt || "", null, null, null, null, null, 0, null, 1, null, null, null, []],
            null, null, 1, null, null, null, null, null, null, null, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], 1, null, null, null, null, [1],
        ];
        const data = {
            "f.req": JSON.stringify([null, JSON.stringify(messageStruct)]),
            at: this.wizData.SNlM0e,
        };
        const response = await axios.post(this.streamUrl, new URLSearchParams(data).toString(), { headers: this.headers, params });
        const lines = response.data.split("\n");
        let messageText = "", cID = null, rID = null, chID = null;
        for (const line of lines) {
            if (!line.startsWith("[[\"wrb.fr\"")) continue;
            try {
                const parsedLine = JSON.parse(line.match(/\[\["wrb\.fr".*\]\]/)[0]);
                const parsedChat = JSON.parse(parsedLine[0][2]);
                if (parsedChat[4]?.[0]?.[1]?.[0]) messageText = parsedChat[4][0][1][0];
                if (parsedChat[1]?.length >= 2) {
                    cID = parsedChat[1][0];
                    rID = parsedChat[1][1];
                }
                if (parsedChat[4]?.[0]?.[0]) chID = parsedChat[4][0][0];
            } catch (e) {}
        }
        return {
            status: true,
            creator: "KyokoAPI",
            data: {
                response: messageText.replace(/http:\/\/googleusercontent\.com\/[^ ]+/g, "").trim(),
                conversationID: cID,
                responseID: rID,
                choiceID: chID
            }
        };
    }
}

router.get('/', async (req, res) => {
    const { text, cookie, promptSystem } = req.query;
    if (!text || !cookie) return res.status(400).json({ status: false, error: "Text and Cookie are required" });
    try {
        const gemini = new GeminiAPI({ cookie, systemPrompt: promptSystem });
        const result = await gemini.query(text);
        res.json(result);
    } catch (error) {
        res.status(500).json({ status: false, error: error.message });
    }
});

module.exports = router;
