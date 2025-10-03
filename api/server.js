// =====================================================
// TPOS UPLOAD API - Express.js Complete Server (WITH CORS)
// =====================================================

const express = require("express");
const fetch = require("node-fetch");
const XLSX = require("xlsx");
const cors = require("cors");
const app = express();

// ============ CORS MIDDLEWARE (ĐẶT TRƯỚC CÁC MIDDLEWARE KHÁC) ============
app.use(
    cors({
        origin: "*", // Cho phép tất cả domain
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    }),
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// TPOS Configuration
const TPOS_CONFIG = {
    API_BASE: "https://tomato.tpos.vn/odata/ProductTemplate",
    AUTH_TOKEN:
        "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJDbGllbnRJZCI6InRtdFdlYkFwcCIsImh0dHA6Ly9zY2hlbWFzLnhtbHNvYXAub3JnL3dzLzIwMDUvMDUvaWRlbnRpdHkvY2xhaW1zL25hbWVpZGVudGlmaWVyIjoiZmMwZjQ0MzktOWNmNi00ZDg4LWE4YzctNzU5Y2E4Mjk1MTQyIiwiaHR0cDovL3NjaGVtYXMueG1sc29hcC5vcmcvd3MvMjAwNS8wNS9pZGVudGl0eS9jbGFpbXMvbmFtZSI6Im52MjAiLCJEaXNwbGF5TmFtZSI6IlTDuiIsIkF2YXRhclVybCI6IiIsIlNlY3VyaXR5U3RhbXAiOiI2ODgxNTgxYi1jZTc1LTRjMWQtYmM4ZC0yNjEwMzAzYzAzN2EiLCJDb21wYW55SWQiOiIxIiwiVGVuYW50SWQiOiJ0b21hdG8udHBvcy52biIsIlJvbGVJZHMiOiI0MmZmYzk5Yi1lNGY2LTQwMDAtYjcyOS1hZTNmMDAyOGEyODksNmExZDAwMDAtNWQxYS0wMDE1LTBlNmMtMDhkYzM3OTUzMmU5LDc2MzlhMDQ4LTdjZmUtNDBiNS1hNDFkLWFlM2YwMDNiODlkZiw4YmM4ZjQ1YS05MWY4LTQ5NzMtYjE4Mi1hZTNmMDAzYWI4NTUsYTljMjAwMDAtNWRiNi0wMDE1LTQ1YWItMDhkYWIxYmZlMjIyIiwiaHR0cDovL3NjaGVtYXMubWljcm9zb2Z0LmNvbS93cy8yMDA4LzA2L2lkZW50aXR5L2NsYWltcy9yb2xlIjpbIlF14bqjbiBMw70gTWFpIiwiQ8OSSSIsIkNTS0ggLSBMw6BpIiwiS2hvIFBoxrDhu5tjLSBLaeG7h3QiLCJRdeG6o24gTMO9IEtobyAtIEJvIl0sImp0aSI6IjY2MzA3MjlkLWJlM2MtNDcwOS1iOWJjLWM2YjNmNzc2ZGYyZSIsImlhdCI6IjE3NTkzODc4NjciLCJuYmYiOjE3NTkzODc4NjcsImV4cCI6MTc2MDY4Mzg2NywiaXNzIjoiaHR0cHM6Ly90b21hdG8udHBvcy52biIsImF1ZCI6Imh0dHBzOi8vdG9tYXRvLnRwb3Mudm4saHR0cHM6Ly90cG9zLnZuIn0.38Srsqs7uhUknlXr08NgtH34ZCBg9TuZ-geO2IrdYcU",

    // Headers giả lập browser thật để tránh bị phát hiện
    getHeaders: () => ({
        accept: "application/json, text/plain, */*",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        "content-type": "application/json;charset=UTF-8",
        tposappversion: "5.9.10.1",
        origin: "https://tomato.tpos.vn",
        referer: "https://tomato.tpos.vn/",
        "sec-ch-ua":
            '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        "x-request-id": generateRandomId(),
    }),
};

// Helper: Generate random ID
function generateRandomId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Helper: Random delay
function randomDelay(min = 500, max = 2000) {
    const delay = Math.floor(Math.random() * (max - min + 1) + min);
    return new Promise((resolve) => setTimeout(resolve, delay));
}

// Helper: Convert image URL to base64
async function processImage(imageInput) {
    if (!imageInput) return null;

    if (!imageInput.startsWith("http")) {
        return cleanBase64(imageInput);
    }

    try {
        await randomDelay(300, 800);
        const response = await fetch(imageInput, {
            headers: {
                "user-agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
            },
        });
        const buffer = await response.buffer();
        return buffer.toString("base64");
    } catch (error) {
        console.error("Error converting image from URL:", error);
        return null;
    }
}

// Helper: Validate and clean base64 string
function cleanBase64(base64String) {
    if (!base64String) return null;

    if (base64String.includes(",")) {
        base64String = base64String.split(",")[1];
    }

    base64String = base64String.replace(/\s/g, "");

    return base64String;
}

// Helper: Upload Excel to TPOS
async function uploadExcelToTPOS(excelBase64) {
    await randomDelay();

    const response = await fetch(
        `${TPOS_CONFIG.API_BASE}/ODataService.ActionImportSimple`,
        {
            method: "POST",
            headers: {
                ...TPOS_CONFIG.getHeaders(),
                authorization: TPOS_CONFIG.AUTH_TOKEN,
            },
            body: JSON.stringify({
                do_inventory: false,
                file: excelBase64,
                version: "2701",
            }),
        },
    );

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Upload Excel failed: ${response.status} - ${error}`);
    }

    return await response.json();
}

// Helper: Get latest products
async function getLatestProducts(count) {
    await randomDelay();

    // ✅ THÊM QUERY PARAMETERS
    const queryParams = new URLSearchParams({
        Active: "true",
        priceId: "0",
        $top: "1000",
        $orderby: "DateCreated desc",
        $filter: "Active eq true",
        $count: "true",
    });

    const response = await fetch(
        `${TPOS_CONFIG.API_BASE}/ODataService.GetViewV2?${queryParams.toString()}`,
        {
            headers: {
                ...TPOS_CONFIG.getHeaders(),
                authorization: TPOS_CONFIG.AUTH_TOKEN,
            },
        },
    );

    if (!response.ok) {
        throw new Error(`Get products failed: ${response.status}`);
    }

    const data = await response.json();
    const items = (data.value || data).filter(
        (item) => item.CreatedByName === "Tú",
    );

    return items.sort((a, b) => b.Id - a.Id).slice(0, count);
}

// Helper: Get product detail
async function getProductDetail(productId) {
    await randomDelay();

    const expand =
        "UOM,UOMCateg,Categ,UOMPO,POSCateg,Taxes,SupplierTaxes,Product_Teams,Images,UOMView,Distributor,Importer,Producer,OriginCountry,ProductVariants($expand=UOM,Categ,UOMPO,POSCateg,AttributeValues),AttributeLines,UOMLines($expand=UOM),ComboProducts,ProductSupplierInfos";

    const response = await fetch(
        `${TPOS_CONFIG.API_BASE}(${productId})?$expand=${expand}`,
        {
            headers: {
                ...TPOS_CONFIG.getHeaders(),
                authorization: TPOS_CONFIG.AUTH_TOKEN,
            },
        },
    );

    if (!response.ok) {
        throw new Error(`Get product detail failed: ${response.status}`);
    }

    return await response.json();
}

// Helper: Update product with image
async function updateProductWithImage(productDetail, imageBase64) {
    await randomDelay();

    const payload = { ...productDetail };
    delete payload["@odata.context"];
    payload.Image = imageBase64;

    const response = await fetch(
        `${TPOS_CONFIG.API_BASE}/ODataService.UpdateV2`,
        {
            method: "POST",
            headers: {
                ...TPOS_CONFIG.getHeaders(),
                authorization: TPOS_CONFIG.AUTH_TOKEN,
            },
            body: JSON.stringify(payload),
        },
    );

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Update failed: ${response.status}`);
    }

    return await response.json();
}

// Helper: Create Excel from data
function createExcelBase64(products) {
    const excelData = products.map((p) => ({
        "Loại sản phẩm": "Có thể lưu trữ",
        "Mã sản phẩm": p.maSanPham || undefined,
        "Mã chốt đơn": undefined,
        "Tên sản phẩm": p.tenSanPham || undefined,
        "Giá bán": (p.giaBan || 0) * 1000,
        "Giá mua": (p.giaMua || 0) * 1000,
        "Đơn vị": "CÁI",
        "Nhóm sản phẩm": "QUẦN ÁO",
        "Mã vạch": p.maSanPham || undefined,
        "Khối lượng": undefined,
        "Chiết khấu bán": undefined,
        "Chiết khấu mua": undefined,
        "Tồn kho": undefined,
        "Giá vốn": undefined,
        "Ghi chú": p.ghiChu || undefined,
        "Cho phép bán ở công ty khác": "FALSE",
        "Thuộc tính": undefined,
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Đặt Hàng");

    const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
    return buffer.toString("base64");
}

// =====================================================
// API ENDPOINT: Lấy danh sách sản phẩm từ TPOS
// =====================================================

app.get("/products", async (req, res) => {
    try {
        const { limit, createdBy, search, top, active } = req.query;

        console.log("Fetching products from TPOS...");

        // ✅ THÊM QUERY PARAMETERS VỚI KHẢ NĂNG CUSTOMIZE
        const queryParams = new URLSearchParams({
            Active: active || "true",
            priceId: "0",
            $top: top || "1000",
            $orderby: "DateCreated desc",
            $filter: "Active eq true",
            $count: "true",
        });

        const url = `${TPOS_CONFIG.API_BASE}/ODataService.GetViewV2?${queryParams.toString()}`;
        console.log("Request URL:", url);

        const response = await fetch(url, {
            headers: {
                ...TPOS_CONFIG.getHeaders(),
                authorization: TPOS_CONFIG.AUTH_TOKEN,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Error response:", errorText);
            throw new Error(
                `Get products failed: ${response.status} - ${errorText}`,
            );
        }

        const data = await response.json();
        let items = data.value || data;

        console.log(`Fetched ${items.length} products from TPOS`);

        // Filter by creator name if provided
        if (createdBy) {
            items = items.filter((item) => item.CreatedByName === createdBy);
            console.log(
                `Filtered to ${items.length} products by creator: ${createdBy}`,
            );
        }

        // Search by product name or code if provided
        if (search) {
            const searchLower = search.toLowerCase();
            items = items.filter(
                (item) =>
                    (item.Name &&
                        item.Name.toLowerCase().includes(searchLower)) ||
                    (item.Code &&
                        item.Code.toLowerCase().includes(searchLower)),
            );
            console.log(
                `Filtered to ${items.length} products by search: ${search}`,
            );
        }

        // Sort by ID descending (newest first) - API đã sort rồi nhưng giữ lại để chắc chắn
        items = items.sort((a, b) => b.Id - a.Id);

        // Limit results if specified
        if (limit) {
            items = items.slice(0, parseInt(limit));
            console.log(`Limited to ${items.length} products`);
        }

        console.log(`Returning ${items.length} products`);

        res.json({
            success: true,
            count: items.length,
            total: data["@odata.count"] || items.length,
            data: items,
        });
    } catch (error) {
        console.error("Get products error:", error);
        res.status(500).json({
            success: false,
            error: error.message,
            stack:
                process.env.NODE_ENV === "development"
                    ? error.stack
                    : undefined,
        });
    }
});

// =====================================================
// API ENDPOINT: Lấy chi tiết 1 sản phẩm
// =====================================================

app.get("/products/:id", async (req, res) => {
    try {
        const { id } = req.params;

        console.log(`Fetching product detail for ID: ${id}`);

        const productDetail = await getProductDetail(id);

        console.log(`Product found: ${productDetail.Name}`);

        res.json({
            success: true,
            data: productDetail,
        });
    } catch (error) {
        console.error("Get product detail error:", error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

// =====================================================
// API ENDPOINT: Upload sản phẩm qua URL (GET)
// =====================================================

app.get("/upload", async (req, res) => {
    try {
        const { maSanPham, tenSanPham, giaBan, giaMua, ghiChu, anhSanPham } =
            req.query;

        if (!tenSanPham) {
            return res.status(400).json({
                success: false,
                error: "Thiếu tham số: tenSanPham là bắt buộc",
            });
        }

        const product = {
            maSanPham: maSanPham || tenSanPham.replace(/\s/g, "_"),
            tenSanPham,
            giaBan: parseFloat(giaBan) || 0,
            giaMua: parseFloat(giaMua) || 0,
            ghiChu: ghiChu || "",
            anhSanPham: anhSanPham || null,
        };

        console.log("Uploading product:", product.tenSanPham);

        // Bước 1: Tạo Excel và upload
        const excelBase64 = createExcelBase64([product]);
        await uploadExcelToTPOS(excelBase64);
        console.log("Excel uploaded");

        // Bước 2: Lấy sản phẩm vừa tạo
        await randomDelay(2000, 3500);
        const latestProducts = await getLatestProducts(1);

        if (latestProducts.length === 0) {
            throw new Error("Không tìm thấy sản phẩm vừa tạo");
        }

        const createdProduct = latestProducts[0];
        console.log("Product created, ID:", createdProduct.Id);

        // Bước 3: Upload ảnh nếu có
        let imageUploaded = false;
        if (product.anhSanPham) {
            try {
                await randomDelay(1000, 2000);
                const imageBase64 = await processImage(product.anhSanPham);
                if (imageBase64) {
                    const productDetail = await getProductDetail(
                        createdProduct.Id,
                    );
                    await updateProductWithImage(productDetail, imageBase64);
                    imageUploaded = true;
                    console.log("Image uploaded");
                }
            } catch (imgError) {
                console.error("Image upload error:", imgError);
            }
        }

        res.json({
            success: true,
            message: "Upload thành công!",
            data: {
                productId: createdProduct.Id,
                productName: tenSanPham,
                imageUploaded: imageUploaded,
                tposUrl: `https://tomato.tpos.vn/product/${createdProduct.Id}`,
            },
        });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

// =====================================================
// API ENDPOINT: Upload nhiều sản phẩm (POST)
// =====================================================

app.post("/upload-batch", async (req, res) => {
    try {
        const { products } = req.body;

        if (!products || !Array.isArray(products) || products.length === 0) {
            return res.status(400).json({
                success: false,
                error: "Cần cung cấp mảng products",
            });
        }

        console.log(`Uploading ${products.length} products`);

        // Bước 1: Upload Excel
        const excelBase64 = createExcelBase64(products);
        await uploadExcelToTPOS(excelBase64);
        console.log("Excel uploaded");

        // Bước 2: Lấy các sản phẩm vừa tạo
        await randomDelay(2000, 3500);
        const latestProducts = await getLatestProducts(products.length);

        // Bước 3: Upload ảnh cho từng sản phẩm
        const results = [];
        for (let i = 0; i < latestProducts.length && i < products.length; i++) {
            const product = products[i];
            const tposProduct = latestProducts[i];

            let imageUploaded = false;
            if (product.anhSanPham) {
                try {
                    await randomDelay(1000, 2500);
                    const imageBase64 = await processImage(product.anhSanPham);
                    if (imageBase64) {
                        const productDetail = await getProductDetail(
                            tposProduct.Id,
                        );
                        await updateProductWithImage(
                            productDetail,
                            imageBase64,
                        );
                        imageUploaded = true;
                        console.log(`Image uploaded for ${product.tenSanPham}`);
                    }
                } catch (error) {
                    console.error(`Image failed for ${tposProduct.Id}:`, error);
                }
            }

            results.push({
                productId: tposProduct.Id,
                productName: product.tenSanPham,
                imageUploaded,
            });
        }

        res.json({
            success: true,
            message: `Upload ${results.length} sản phẩm thành công!`,
            data: results,
        });
    } catch (error) {
        console.error("Batch upload error:", error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

// Health check endpoint
app.get("/health", (req, res) => {
    res.json({
        status: "OK",
        timestamp: new Date().toISOString(),
    });
});

// Root endpoint
app.get("/", (req, res) => {
    res.json({
        name: "TPOS Upload API",
        version: "1.0.0",
        endpoints: {
            health: "GET /health",
            products: "GET /products?limit=10&createdBy=Tú&search=áo&top=2000",
            productDetail: "GET /products/:id",
            upload: "GET /upload?tenSanPham=ABC&giaBan=100&giaMua=50&anhSanPham=https://...",
            uploadBatch: "POST /upload-batch",
        },
    });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("\n" + "=".repeat(60));
    console.log("🚀 TPOS Upload API is running!");
    console.log("=".repeat(60));
    console.log(`📍 Server: http://localhost:${PORT}`);
    console.log(`🏥 Health: http://localhost:${PORT}/health`);
    console.log(`📦 Products: http://localhost:${PORT}/products`);
    console.log(`📤 Upload: http://localhost:${PORT}/upload?tenSanPham=Test`);
    console.log("=".repeat(60) + "\n");
});
