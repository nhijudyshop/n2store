const express = require("express");
const cors = require("cors");
const path = require("path");
const app = express();

// Middleware
app.use(
    cors({
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    }),
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Serve static files (HTML)
app.use(express.static(path.join(__dirname, "public")));

// Routes - QUAN TRỌNG: Đảm bảo tất cả routes được import
const healthRoutes = require("./routes/health.routes");
const uploadRoutes = require("./routes/upload.routes");
const attributeRoutes = require("./routes/attribute.routes");
const productsRoutes = require("./routes/products.routes");
const facebookRoutes = require("./routes/facebook.routes"); // ⭐ NEW

// Mount routes - QUAN TRỌNG: Phải mount tất cả
app.use(healthRoutes);
app.use(uploadRoutes);
app.use(attributeRoutes);
app.use(productsRoutes);
app.use(facebookRoutes); // ⭐ NEW

// Root endpoint
app.get("/", (req, res) => {
    res.json({
        name: "TPOS Upload API with Auto-Detect",
        version: "3.0.0",
        documentation: {
            guide: "/huongdan.html",
            test: "/test.html",
            facebook: "/facebook.html", // ⭐ NEW
        },
        endpoints: {
            health: "GET /health",
            attributes: "GET /attributes",
            detectAttributes: "GET /detect-attributes?text=Áo Thun Đen Size M",
            upload: "GET /upload?tenSanPham=Áo&giaBan=150&giaMua=100",
            uploadBatch: "POST /upload-batch",
            products: "GET /products?limit=10&createdBy=Tú&search=",
            productDetail: "GET /products/:id",
            facebookLiveVideo:
                "GET /facebook/livevideo?pageid=117267091364524&limit=10", // ⭐ NEW
            facebookComments:
                "GET /facebook/comments?pageid=117267091364524&postId=xxx&limit=50", // ⭐ NEW
            facebookHealth: "GET /facebook/health", // ⭐ NEW
        },
    });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("\n" + "=".repeat(60));
    console.log("TPOS Upload API with Auto-Detect is running!");
    console.log("=".repeat(60));
    console.log(`Server: http://localhost:${PORT}`);
    console.log(`Guide: http://localhost:${PORT}/huongdan.html`);
    console.log(`Test: http://localhost:${PORT}/test.html`);
    console.log(`Facebook: http://localhost:${PORT}/facebook.html`); // ⭐ NEW
    console.log(`Health: http://localhost:${PORT}/health`);
    console.log(`Detect: http://localhost:${PORT}/detect-attributes?text=Test`);
    console.log(`Attributes: http://localhost:${PORT}/attributes`);
    console.log(`Products: http://localhost:${PORT}/products`);
    console.log(`Facebook Live: http://localhost:${PORT}/facebook/livevideo`); // ⭐ NEW
    console.log("=".repeat(60) + "\n");
});
