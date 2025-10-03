// =====================================================
// EXPORT FUNCTIONALITY WITH AUTO UPLOAD TO TPOS
// =====================================================

const TPOS_CONFIG = {
    API_BASE: "https://tomato.tpos.vn/odata/ProductTemplate",
    AUTH_TOKEN:
        "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJDbGllbnRJZCI6InRtdFdlYkFwcCIsImh0dHA6Ly9zY2hlbWFzLnhtbHNvYXAub3JnL3dzLzIwMDUvMDUvaWRlbnRpdHkvY2xhaW1zL25hbWVpZGVudGlmaWVyIjoiZmMwZjQ0MzktOWNmNi00ZDg4LWE4YzctNzU5Y2E4Mjk1MTQyIiwiaHR0cDovL3NjaGVtYXMueG1sc29hcC5vcmcvd3MvMjAwNS8wNS9pZGVudGl0eS9jbGFpbXMvbmFtZSI6Im52MjAiLCJEaXNwbGF5TmFtZSI6IlTDuiIsIkF2YXRhclVybCI6IiIsIlNlY3VyaXR5U3RhbXAiOiI2ODgxNTgxYi1jZTc1LTRjMWQtYmM4ZC0yNjEwMzAzYzAzN2EiLCJDb21wYW55SWQiOiIxIiwiVGVuYW50SWQiOiJ0b21hdG8udHBvcy52biIsIlJvbGVJZHMiOiI0MmZmYzk5Yi1lNGY2LTQwMDAtYjcyOS1hZTNmMDAyOGEyODksNmExZDAwMDAtNWQxYS0wMDE1LTBlNmMtMDhkYzM3OTUzMmU5LDc2MzlhMDQ4LTdjZmUtNDBiNS1hNDFkLWFlM2YwMDNiODlkZiw4YmM4ZjQ1YS05MWY4LTQ5NzMtYjE4Mi1hZTNmMDAzYWI4NTUsYTljMjAwMDAtNWRiNi0wMDE1LTQ1YWItMDhkYWIxYmZlMjIyIiwiaHR0cDovL3NjaGVtYXMubWljcm9zb2Z0LmNvbS93cy8yMDA4LzA2L2lkZW50aXR5L2NsYWltcy9yb2xlIjpbIlF14bqjbiBMw70gTWFpIiwiQ8OSSSIsIkNTS0ggLSBMw6BpIiwiS2hvIFBoxrDhu5tjLSBLaeG7h3QiLCJRdeG6o24gTMO9IEtobyAtIEJvIl0sImp0aSI6IjY2MzA3MjlkLWJlM2MtNDcwOS1iOWJjLWM2YjNmNzc2ZGYyZSIsImlhdCI6IjE3NTkzODc4NjciLCJuYmYiOjE3NTkzODc4NjcsImV4cCI6MTc2MDY4Mzg2NywiaXNzIjoiaHR0cHM6Ly90b21hdG8udHBvcy52biIsImF1ZCI6Imh0dHBzOi8vdG9tYXRvLnRwb3Mudm4saHR0cHM6Ly90cG9zLnZuIn0.38Srsqs7uhUknlXr08NgtH34ZCBg9TuZ-geO2IrdYcU",
    HEADERS: {
        accept: "application/json, text/plain, */*",
        authorization: null,
        "content-type": "application/json;charset=UTF-8",
        tposappversion: "5.9.10.1",
        origin: "https://tomato.tpos.vn",
        referer: "https://tomato.tpos.vn/",
    },
    CONCURRENT_UPLOADS: 3,
};

TPOS_CONFIG.HEADERS.authorization = TPOS_CONFIG.AUTH_TOKEN;

// Convert image URL to base64
async function imageUrlToBase64(imageUrl) {
    try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error("Error converting image to base64:", error);
        return null;
    }
}

// Convert Blob to base64
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Upload Excel to TPOS
async function uploadExcelToTPOS(excelBase64) {
    const response = await fetch(
        `${TPOS_CONFIG.API_BASE}/ODataService.ActionImportSimple`,
        {
            method: "POST",
            headers: TPOS_CONFIG.HEADERS,
            body: JSON.stringify({
                do_inventory: false,
                file: excelBase64,
                version: "2701",
            }),
        },
    );

    if (!response.ok) {
        throw new Error(`Upload Excel thất bại: ${response.status}`);
    }

    return await response.json();
}

// Get latest N products created by "Tú"
async function getLatestProducts(count) {
    const response = await fetch(
        `${TPOS_CONFIG.API_BASE}/ODataService.GetViewV2`,
        {
            headers: TPOS_CONFIG.HEADERS,
        },
    );

    if (!response.ok) {
        throw new Error(`Lấy danh sách thất bại: ${response.status}`);
    }

    const data = await response.json();
    const items = (data.value || data).filter(
        (item) => item.CreatedByName === "Tú",
    );

    if (items.length === 0) {
        throw new Error('Không tìm thấy sản phẩm của "Tú"');
    }

    return items.sort((a, b) => b.Id - a.Id).slice(0, count);
}

// Get product detail
async function getProductDetail(productId) {
    const expand =
        "UOM,UOMCateg,Categ,UOMPO,POSCateg,Taxes,SupplierTaxes,Product_Teams,Images,UOMView,Distributor,Importer,Producer,OriginCountry,ProductVariants($expand=UOM,Categ,UOMPO,POSCateg,AttributeValues),AttributeLines,UOMLines($expand=UOM),ComboProducts,ProductSupplierInfos";

    const response = await fetch(
        `${TPOS_CONFIG.API_BASE}(${productId})?$expand=${expand}`,
        {
            headers: TPOS_CONFIG.HEADERS,
        },
    );

    if (!response.ok) {
        throw new Error(`Lấy chi tiết thất bại: ${response.status}`);
    }

    return await response.json();
}

// Update product with image
async function updateProductWithImage(productDetail, imageBase64) {
    const payload = { ...productDetail };
    delete payload["@odata.context"];
    payload.Image = imageBase64;

    const response = await fetch(
        `${TPOS_CONFIG.API_BASE}/ODataService.UpdateV2`,
        {
            method: "POST",
            headers: TPOS_CONFIG.HEADERS,
            body: JSON.stringify(payload),
        },
    );

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
            errorData.error || `Cập nhật thất bại: ${response.status}`,
        );
    }

    return await response.json();
}

// Show confirmation modal
function showExportConfirmModal(filteredData, excelDataWithImages) {
    return new Promise((resolve) => {
        const modal = document.createElement("div");
        modal.className = "export-modal-overlay";

        const productsWithImages = excelDataWithImages.filter(
            (item) => item.imageUrl,
        ).length;
        const productsWithoutImages =
            excelDataWithImages.length - productsWithImages;

        modal.innerHTML = `
            <style>
                .export-modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.6);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 9999;
                    backdrop-filter: blur(4px);
                    animation: fadeIn 0.2s ease-out;
                }

                .export-modal {
                    background: white;
                    border-radius: 16px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    width: 90%;
                    max-width: 900px;
                    max-height: 90vh;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    animation: slideUp 0.3s ease-out;
                }

                .export-modal-header {
                    padding: 24px;
                    border-bottom: 1px solid #e5e7eb;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }

                .export-modal-header h3 {
                    font-size: 20px;
                    font-weight: 600;
                    margin: 0;
                }

                .export-modal-close {
                    width: 36px;
                    height: 36px;
                    border: none;
                    background: rgba(255, 255, 255, 0.2);
                    color: white;
                    font-size: 24px;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .export-modal-close:hover {
                    background: rgba(255, 255, 255, 0.3);
                    transform: scale(1.1);
                }

                .export-modal-body {
                    padding: 24px;
                    overflow-y: auto;
                    flex: 1;
                }

                .export-summary {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 16px;
                    margin-bottom: 24px;
                }

                .export-stat {
                    background: #f9fafb;
                    border-radius: 12px;
                    padding: 20px;
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    border: 2px solid #e5e7eb;
                    transition: all 0.2s;
                }

                .export-stat:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                }

                .export-stat.success {
                    background: #ecfdf5;
                    border-color: #10b981;
                }

                .export-stat.warning {
                    background: #fffbeb;
                    border-color: #f59e0b;
                }

                .export-stat-icon {
                    font-size: 32px;
                }

                .export-stat-value {
                    font-size: 28px;
                    font-weight: 700;
                    color: #111827;
                }

                .export-stat-label {
                    font-size: 13px;
                    color: #6b7280;
                    margin-top: 4px;
                }

                .export-preview h4 {
                    font-size: 16px;
                    font-weight: 600;
                    margin-bottom: 12px;
                    color: #111827;
                }

                .export-table-container {
                    border-radius: 8px;
                    border: 1px solid #e5e7eb;
                    overflow: auto;
                    max-height: 400px;
                }

                .export-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 14px;
                }

                .export-table thead {
                    background: #f9fafb;
                    position: sticky;
                    top: 0;
                    z-index: 1;
                }

                .export-table th {
                    padding: 12px 16px;
                    text-align: left;
                    font-weight: 600;
                    color: #374151;
                    border-bottom: 2px solid #e5e7eb;
                }

                .export-table td {
                    padding: 12px 16px;
                    border-bottom: 1px solid #f3f4f6;
                }

                .export-table tr:hover {
                    background: #f9fafb;
                }

                .badge-success {
                    background: #d1fae5;
                    color: #065f46;
                    padding: 4px 12px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: 600;
                }

                .badge-warning {
                    background: #fef3c7;
                    color: #92400e;
                    padding: 4px 12px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: 600;
                }

                .export-modal-footer {
                    padding: 20px 24px;
                    border-top: 1px solid #e5e7eb;
                    display: flex;
                    gap: 12px;
                    justify-content: flex-end;
                    background: #f9fafb;
                }

                .export-btn {
                    padding: 12px 24px;
                    border: none;
                    border-radius: 8px;
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                }

                .export-btn-secondary {
                    background: white;
                    color: #374151;
                    border: 1px solid #d1d5db;
                }

                .export-btn-secondary:hover {
                    background: #f3f4f6;
                }

                .export-btn-download {
                    background: #3b82f6;
                    color: white;
                }

                .export-btn-download:hover {
                    background: #2563eb;
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
                }

                .export-btn-primary {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }

                .export-btn-primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                @media (max-width: 768px) {
                    .export-modal {
                        width: 95%;
                        max-height: 95vh;
                    }
                    
                    .export-summary {
                        grid-template-columns: 1fr;
                    }
                    
                    .export-modal-footer {
                        flex-direction: column;
                    }
                    
                    .export-btn {
                        width: 100%;
                        justify-content: center;
                    }
                }
            </style>
            
            <div class="export-modal">
                <div class="export-modal-header">
                    <h3>Xác nhận xuất dữ liệu</h3>
                    <button class="export-modal-close" onclick="this.closest('.export-modal-overlay').remove()">×</button>
                </div>
                
                <div class="export-modal-body">
                    <div class="export-summary">
                        <div class="export-stat">
                            <div class="export-stat-icon">📦</div>
                            <div class="export-stat-info">
                                <div class="export-stat-value">${filteredData.length}</div>
                                <div class="export-stat-label">Tổng sản phẩm</div>
                            </div>
                        </div>
                        
                        <div class="export-stat success">
                            <div class="export-stat-icon">🖼️</div>
                            <div class="export-stat-info">
                                <div class="export-stat-value">${productsWithImages}</div>
                                <div class="export-stat-label">Có hình ảnh</div>
                            </div>
                        </div>
                        
                        <div class="export-stat warning">
                            <div class="export-stat-icon">⚠️</div>
                            <div class="export-stat-info">
                                <div class="export-stat-value">${productsWithoutImages}</div>
                                <div class="export-stat-label">Không có ảnh</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="export-preview">
                        <h4>Danh sách sản phẩm</h4>
                        <div class="export-table-container">
                            <table class="export-table">
                                <thead>
                                    <tr>
                                        <th>STT</th>
                                        <th>Tên sản phẩm</th>
                                        <th>Mã SP</th>
                                        <th>Giá bán</th>
                                        <th>Hình ảnh</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${excelDataWithImages
                                        .slice(0, 10)
                                        .map(
                                            (item, index) => `
                                        <tr>
                                            <td>${index + 1}</td>
                                            <td>${item.excelRow["Tên sản phẩm"] || "-"}</td>
                                            <td>${item.excelRow["Mã sản phẩm"] || "-"}</td>
                                            <td>${new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(item.excelRow["Giá bán"] || 0)}</td>
                                            <td>
                                                ${
                                                    item.imageUrl
                                                        ? '<span class="badge-success">✓ Có ảnh</span>'
                                                        : '<span class="badge-warning">✗ Không có</span>'
                                                }
                                            </td>
                                        </tr>
                                    `,
                                        )
                                        .join("")}
                                    ${
                                        excelDataWithImages.length > 10
                                            ? `
                                        <tr>
                                            <td colspan="5" style="text-align: center; color: #6b7280; padding: 12px;">
                                                ... và ${excelDataWithImages.length - 10} sản phẩm khác
                                            </td>
                                        </tr>
                                    `
                                            : ""
                                    }
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                
                <div class="export-modal-footer">
                    <button class="export-btn export-btn-secondary" onclick="this.closest('.export-modal-overlay').remove()">
                        Hủy
                    </button>
                    <button class="export-btn export-btn-download" id="exportDownloadBtn">
                        📥 Chỉ tải Excel
                    </button>
                    <button class="export-btn export-btn-primary" id="exportUploadBtn">
                        🚀 Upload lên TPOS
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById("exportDownloadBtn").onclick = () => {
            modal.remove();
            resolve("download");
        };

        document.getElementById("exportUploadBtn").onclick = () => {
            modal.remove();
            resolve("upload");
        };

        const handleEsc = (e) => {
            if (e.key === "Escape") {
                modal.remove();
                document.removeEventListener("keydown", handleEsc);
                resolve("cancel");
            }
        };
        document.addEventListener("keydown", handleEsc);
    });
}

// Main export and upload function
async function exportToExcel() {
    const cachedData = getCachedData();
    if (!cachedData || cachedData.length === 0) {
        notifyManager.warning("Không có dữ liệu để xuất");
        return;
    }

    const notifId = notifyManager.processing("Đang chuẩn bị dữ liệu...");

    try {
        const filteredData = applyFiltersToInventory(cachedData);

        const excelDataWithImages = filteredData.map((order) => ({
            excelRow: {
                "Loại sản phẩm": "Có thể lưu trữ",
                "Mã sản phẩm": order.maSanPham?.toString() || undefined,
                "Mã chốt đơn": undefined,
                "Tên sản phẩm": order.tenSanPham?.toString() || undefined,
                "Giá bán": (order.giaBan || 0) * 1000,
                "Giá mua": (order.giaMua || order.giaNhap || 0) * 1000,
                "Đơn vị": "CÁI",
                "Nhóm sản phẩm": "QUẦN ÁO",
                "Mã vạch": order.maSanPham?.toString() || undefined,
                "Khối lượng": undefined,
                "Chiết khấu bán": undefined,
                "Chiết khấu mua": undefined,
                "Tồn kho": undefined,
                "Giá vốn": undefined,
                "Ghi chú": order.ghiChu || undefined,
                "Cho phép bán ở công ty khác": "FALSE",
                "Thuộc tính": undefined,
            },
            imageUrl: order.anhSanPham || null,
            imageBase64: null,
        }));

        notifyManager.remove(notifId);

        const action = await showExportConfirmModal(
            filteredData,
            excelDataWithImages,
        );

        if (action === "cancel") return;

        const excelData = excelDataWithImages.map((item) => item.excelRow);
        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Đặt Hàng");

        if (action === "download") {
            const fileName = `DatHang_${new Date().toLocaleDateString("vi-VN").replace(/\//g, "-")}.xlsx`;
            XLSX.writeFile(wb, fileName);
            notifyManager.success(`Đã tải ${filteredData.length} sản phẩm!`);
            return;
        }

        const productsWithImages = excelDataWithImages.filter(
            (item) => item.imageUrl,
        );

        if (productsWithImages.length === 0) {
            notifyManager.warning(
                "Không có sản phẩm nào có hình ảnh để upload!",
            );
            return;
        }

        const convertId = notifyManager.processing(
            `Đang chuyển đổi ${productsWithImages.length} hình ảnh...`,
        );

        const batchSize = 5;
        for (let i = 0; i < productsWithImages.length; i += batchSize) {
            const batch = productsWithImages.slice(i, i + batchSize);
            await Promise.all(
                batch.map(async (item) => {
                    try {
                        item.imageBase64 = await imageUrlToBase64(
                            item.imageUrl,
                        );
                    } catch (error) {
                        console.warn("Failed to convert image:", error);
                    }
                }),
            );

            notifyManager.remove(convertId);
            notifyManager.processing(
                `Đã chuyển đổi ${Math.min(i + batchSize, productsWithImages.length)}/${productsWithImages.length} ảnh`,
            );
        }

        notifyManager.success("Chuyển đổi ảnh hoàn tất!");
        await new Promise((r) => setTimeout(r, 500));

        const excelBlob = new Blob(
            [XLSX.write(wb, { bookType: "xlsx", type: "array" })],
            {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
        );

        const step1Id = notifyManager.processing(
            "Bước 1/3: Đang upload Excel...",
        );
        const excelBase64 = await blobToBase64(excelBlob);
        await uploadExcelToTPOS(excelBase64);
        notifyManager.remove(step1Id);
        notifyManager.success("Bước 1/3: Upload Excel thành công!");
        await new Promise((r) => setTimeout(r, 1000));

        const step2Id = notifyManager.processing(
            "Bước 2/3: Đang lấy danh sách sản phẩm...",
        );
        const latestProducts = await getLatestProducts(
            excelDataWithImages.length,
        );
        notifyManager.remove(step2Id);
        notifyManager.success(
            `Bước 2/3: Tìm thấy ${latestProducts.length} sản phẩm!`,
        );
        await new Promise((r) => setTimeout(r, 500));

        const step3Id = notifyManager.processing(
            "Bước 3/3: Đang upload ảnh...",
        );
        notifyManager.remove(step3Id);

        let successCount = 0;
        let failCount = 0;

        for (
            let i = 0;
            i < latestProducts.length;
            i += TPOS_CONFIG.CONCURRENT_UPLOADS
        ) {
            const batch = latestProducts.slice(
                i,
                i + TPOS_CONFIG.CONCURRENT_UPLOADS,
            );

            await Promise.all(
                batch.map(async (product, batchIndex) => {
                    const globalIndex = i + batchIndex;
                    const item = excelDataWithImages[globalIndex];

                    if (!item || !item.imageBase64) return;

                    try {
                        const detail = await getProductDetail(product.Id);
                        await updateProductWithImage(detail, item.imageBase64);
                        successCount++;

                        notifyManager.success(
                            `Upload ${successCount}/${productsWithImages.length}: ${item.excelRow["Tên sản phẩm"]}`,
                            1500,
                        );
                    } catch (error) {
                        failCount++;
                        console.error(
                            `Upload failed for product ${globalIndex}:`,
                            error,
                        );
                    }
                }),
            );
        }

        if (successCount > 0) {
            notifyManager.success(
                `Hoàn thành! Upload ${successCount}/${productsWithImages.length} sản phẩm lên TPOS!`,
                4000,
            );
        }

        if (failCount > 0) {
            notifyManager.warning(`${failCount} sản phẩm thất bại.`, 3000);
        }
    } catch (error) {
        console.error("Export error:", error);
        notifyManager.error(`Lỗi: ${error.message}`);
    }
}

console.log("✅ Export with Auto Upload to TPOS loaded");
