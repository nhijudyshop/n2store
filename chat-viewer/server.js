const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 8080;
const API_BASE = "https://tomato.tpos.vn";

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Lưu trữ giá trị mặc định động
let dynamicDefaults = {
    tposappversion: "5.10.26.1",
    "x-tpos-lang": "vi",
    "sec-ch-ua":
        '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
};

// API Proxy routes
app.all("/api/*", async (req, res) => {
    try {
        const apiPath = req.path.replace("/api", "");
        const targetUrl = `${API_BASE}${apiPath}`;

        // ⚠️ QUAN TRỌNG: Tạo headers mới, KHÔNG forward origin/referer/host từ browser
        const headers = {
            // Chỉ lấy Authorization và Content-Type từ client
            Authorization: req.headers.authorization,
            "Content-Type": req.headers["content-type"] || "application/json",
            Accept: "application/json, text/plain, */*",

            // ✅ GIẢ MẠO - Set thành tomato.tpos.vn
            Referer: "https://tomato.tpos.vn/",
            Origin: "https://tomato.tpos.vn",
            // KHÔNG set Host - axios sẽ tự động set từ URL

            // User-Agent có thể lấy từ browser hoặc fake
            "User-Agent":
                req.headers["user-agent"] ||
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",

            // Dynamic defaults
            tposappversion:
                req.headers["tposappversion"] || dynamicDefaults.tposappversion,
            "x-tpos-lang":
                req.headers["x-tpos-lang"] || dynamicDefaults["x-tpos-lang"],
            "sec-ch-ua":
                req.headers["sec-ch-ua"] || dynamicDefaults["sec-ch-ua"],
            "sec-ch-ua-mobile":
                req.headers["sec-ch-ua-mobile"] ||
                dynamicDefaults["sec-ch-ua-mobile"],
            "sec-ch-ua-platform":
                req.headers["sec-ch-ua-platform"] ||
                dynamicDefaults["sec-ch-ua-platform"],
        };

        // Remove undefined values
        Object.keys(headers).forEach((key) => {
            if (headers[key] === undefined) {
                delete headers[key];
            }
        });

        console.log("🔄 Sending to:", targetUrl);
        console.log("📤 Headers:", JSON.stringify(headers, null, 2));

        // Make request to real API
        const response = await axios({
            method: req.method,
            url: targetUrl,
            data: req.body,
            headers: headers,
            params: req.query,
            validateStatus: () => true,
        });

        // Cập nhật dynamic defaults từ response
        if (response.headers["tposappversion"]) {
            const newVersion = response.headers["tposappversion"];
            if (newVersion !== dynamicDefaults.tposappversion) {
                console.log(
                    `📦 Updated tposappversion: ${dynamicDefaults.tposappversion} → ${newVersion}`,
                );
                dynamicDefaults.tposappversion = newVersion;
            }
        }

        if (response.headers["x-tpos-lang"]) {
            const newLang = response.headers["x-tpos-lang"];
            if (newLang !== dynamicDefaults["x-tpos-lang"]) {
                console.log(
                    `🌐 Updated x-tpos-lang: ${dynamicDefaults["x-tpos-lang"]} → ${newLang}`,
                );
                dynamicDefaults["x-tpos-lang"] = newLang;
            }
        }

        // Forward response
        res.status(response.status).json(response.data);
    } catch (error) {
        console.error("❌ Proxy error:", error.message);
        res.status(500).json({
            error: "Proxy error",
            message: error.message,
        });
    }
});

// API để xem current defaults
app.get("/config/defaults", (req, res) => {
    res.json({
        message: "Current dynamic defaults",
        defaults: dynamicDefaults,
    });
});

// API để reset về giá trị ban đầu
app.post("/config/reset", (req, res) => {
    dynamicDefaults = {
        tposappversion: "5.10.26.1",
        "x-tpos-lang": "vi",
        "sec-ch-ua":
            '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
    };
    res.json({
        message: "Defaults reset to initial values",
        defaults: dynamicDefaults,
    });
});

// Serve HTML
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "chat-viewer.html"));
});

// Start server
app.listen(PORT, () => {
    console.log("\n" + "=".repeat(60));
    console.log("  ✨ ChatOmni Viewer - Server Started");
    console.log("=".repeat(60));
    console.log(`\n  🚀 Server running at: http://localhost:${PORT}`);
    console.log(`  📱 Open: http://localhost:${PORT}/chat-viewer.html`);
    console.log(`  ⚙️  Config: http://localhost:${PORT}/config/defaults\n`);
    console.log("=".repeat(60));
    console.log("\n  📋 Quick Start:");
    console.log("  1. Open browser → http://localhost:" + PORT);
    console.log("  2. Enter your Bearer token");
    console.log("  3. Start chatting!\n");
    console.log("  🔄 Dynamic defaults will be updated automatically\n");
    console.log("  Press Ctrl+C to stop\n");
});
