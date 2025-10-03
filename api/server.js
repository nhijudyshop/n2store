// =====================================================
// TPOS UPLOAD API - Express.js Complete Server
// =====================================================

const express = require("express");
const fetch = require("node-fetch");
const XLSX = require("xlsx");
const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// TPOS Configuration
const TPOS_CONFIG = {
    API_BASE: "https://tomato.tpos.vn/odata/ProductTemplate",
    AUTH_TOKEN:
        "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJDbGllbnRJZCI6InRtdFdlYkFwcCIsImh0dHA6Ly9zY2hlbWFzLnhtbHNvYXAub3JnL3dzLzIwMDUvMDUvaWRlbnRpdHkvY2xhaW1zL25hbWVpZGVudGlmaWVyIjoiZmMwZjQ0MzktOWNmNi00ZDg4LWE4YzctNzU5Y2E4Mjk1MTQyIiwiaHR0cDovL3NjaGVtYXMueG1sc29hcC5vcmcvd3MvMjAwNS8wNS9pZGVudGl0eS9jbGFpbXMvbmFtZSI6Im52MjAiLCJEaXNwbGF5TmFtZSI6IlTDuiIsIkF2YXRhclVybCI6IiIsIlNlY3VyaXR5U3RhbXAiOiI2ODgxNTgxYi1jZTc1LTRjMWQtYmM4ZC0yNjEwMzAzYzAzN2EiLCJDb21wYW55SWQiOiIxIiwiVGVuYW50SWQiOiJ0b21hdG8udHBvcy52biIsIlJvbGVJZHMiOiI0MmZmYzk5Yi1lNGY2LTQwMDAtYjcyOS1hZTNmMDAyOGEyODksNmExZDAwMDAtNWQxYS0wMDE1LTBlNmMtMDhkYzM3OTUzMmU5LDc2MzlhMDQ4LTdjZmUtNDBiNS1hNDFkLWFlM2YwMDNiODlkZiw4YmM4ZjQ1YS05MWY4LTQ5NzMtYjE4Mi1hZTNmMDAzYWI4NTUsYTljMjAwMDAtNWRiNi0wMDE1LTQ1YWItMDhkYWIxYmZlMjIyIiwiaHR0cDovL3NjaGVtYXMubWljcm9zb2Z0LmNvbS93cy8yMDA4LzA2L2lkZW50aXR5L2NsYWltcy9yb2xlIjpbIlF14bqjbiBMw70gTWFpIiwiQ8OSSSIsIkNTS0ggLSBMw6BpIiwiS2hvIFBoxrDhu5tjLSBLaeG7h3QiLCJRdeG6o24gTMO9IEtobyAtIEJvIl0sImp0aSI6IjY2MzA3MjlkLWJlM2MtNDcwOS1iOWJjLWM2YjNmNzc2ZGYyZSIsImlhdCI6IjE3NTkzODc4NjciLCJuYmYiOjE3NTkzODc4NjcsImV4cCI6MTc2MDY4Mzg2NywiaXNzIjoiaHR0cHM6Ly90b21hdG8udHBvcy52biIsImF1ZCI6Imh0dHBzOi8vdG9tYXRvLnRwb3Mudm4saHR0cHM6Ly90cG9zLnZuIn0.38Srsqs7uhUknlXr08NgtH34ZCBg9TuZ-geO2IrdYcU",
    HEADERS: {
        accept: "application/json, text/plain, */*",
        "content-type": "application/json;charset=UTF-8",
        tposappversion: "5.9.10.1",
        origin: "https://tomato.tpos.vn",
        referer: "https://tomato.tpos.vn/",
    },
};

// Helper: Convert image URL to base64 hoặc sử dụng base64 trực tiếp
async function processImage(imageInput) {
    if (!imageInput) return null;

    // Nếu là base64 string (bắt đầu với data: hoặc không có http)
    if (!imageInput.startsWith("http")) {
        return cleanBase64(imageInput);
    }

    // Nếu là URL, convert sang base64
    try {
        const response = await fetch(imageInput);
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

    // Remove data URI prefix if exists (data:image/jpeg;base64,...)
    if (base64String.includes(",")) {
        base64String = base64String.split(",")[1];
    }

    // Remove whitespace
    base64String = base64String.replace(/\s/g, "");

    return base64String;
}

// Helper: Upload Excel to TPOS
async function uploadExcelToTPOS(excelBase64) {
    const response = await fetch(
        `${TPOS_CONFIG.API_BASE}/ODataService.ActionImportSimple`,
        {
            method: "POST",
            headers: {
                ...TPOS_CONFIG.HEADERS,
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
    const response = await fetch(
        `${TPOS_CONFIG.API_BASE}/ODataService.GetViewV2`,
        {
            headers: {
                ...TPOS_CONFIG.HEADERS,
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
    const expand =
        "UOM,UOMCateg,Categ,UOMPO,POSCateg,Taxes,SupplierTaxes,Product_Teams,Images,UOMView,Distributor,Importer,Producer,OriginCountry,ProductVariants($expand=UOM,Categ,UOMPO,POSCateg,AttributeValues),AttributeLines,UOMLines($expand=UOM),ComboProducts,ProductSupplierInfos";

    const response = await fetch(
        `${TPOS_CONFIG.API_BASE}(${productId})?$expand=${expand}`,
        {
            headers: {
                ...TPOS_CONFIG.HEADERS,
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
    const payload = { ...productDetail };
    delete payload["@odata.context"];
    payload.Image = imageBase64;

    const response = await fetch(
        `${TPOS_CONFIG.API_BASE}/ODataService.UpdateV2`,
        {
            method: "POST",
            headers: {
                ...TPOS_CONFIG.HEADERS,
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

        console.log("📦 Uploading product:", product.tenSanPham);

        // Bước 1: Tạo Excel và upload
        const excelBase64 = createExcelBase64([product]);
        await uploadExcelToTPOS(excelBase64);
        console.log("✅ Excel uploaded");

        // Bước 2: Lấy sản phẩm vừa tạo
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const latestProducts = await getLatestProducts(1);

        if (latestProducts.length === 0) {
            throw new Error("Không tìm thấy sản phẩm vừa tạo");
        }

        const createdProduct = latestProducts[0];
        console.log("✅ Product created, ID:", createdProduct.Id);

        // Bước 3: Upload ảnh nếu có
        let imageUploaded = false;
        if (product.anhSanPham) {
            try {
                const imageBase64 = await processImage(product.anhSanPham);
                if (imageBase64) {
                    const productDetail = await getProductDetail(
                        createdProduct.Id,
                    );
                    await updateProductWithImage(productDetail, imageBase64);
                    imageUploaded = true;
                    console.log("✅ Image uploaded");
                }
            } catch (imgError) {
                console.error("❌ Image upload error:", imgError);
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
        console.error("❌ Upload error:", error);
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

        console.log(`📦 Uploading ${products.length} products`);

        // Bước 1: Upload Excel
        const excelBase64 = createExcelBase64(products);
        await uploadExcelToTPOS(excelBase64);
        console.log("✅ Excel uploaded");

        // Bước 2: Lấy các sản phẩm vừa tạo
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const latestProducts = await getLatestProducts(products.length);

        // Bước 3: Upload ảnh cho từng sản phẩm
        const results = [];
        for (let i = 0; i < latestProducts.length && i < products.length; i++) {
            const product = products[i];
            const tposProduct = latestProducts[i];

            let imageUploaded = false;
            if (product.anhSanPham) {
                try {
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
                        console.log(
                            `✅ Image uploaded for ${product.tenSanPham}`,
                        );
                    }
                } catch (error) {
                    console.error(
                        `❌ Image failed for ${tposProduct.Id}:`,
                        error,
                    );
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
        console.error("❌ Batch upload error:", error);
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

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 TPOS Upload API running on port ${PORT}`);
    console.log(
        `📝 Upload URL: http://localhost:${PORT}/upload?tenSanPham=ABC&giaBan=100`,
    );
    console.log(`📦 Batch URL: POST http://localhost:${PORT}/upload-batch`);
});
