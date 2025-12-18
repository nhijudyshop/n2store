/* =====================================================
   INVOICE COMPARE - MAIN SCRIPT
   So sánh đơn hàng từ TPOS với hóa đơn
   ===================================================== */

// Configuration
const CONFIG = {
    CLOUDFLARE_PROXY: 'https://chatomni-proxy.nhijudyshop.workers.dev',
};

// Global state
let currentInvoiceData = null;
let currentInvoiceId = null;
let uploadedImages = []; // Store uploaded images with base64 data
let aiAnalysisResult = null; // Store AI analysis result
// tokenManager is available globally from token-manager.js as window.tokenManager

// =====================================================
// DOM ELEMENTS
// =====================================================
const elements = {
    invoiceUrl: document.getElementById('invoiceUrl'),
    btnFetchInvoice: document.getElementById('btnFetchInvoice'),
    btnClear: document.getElementById('btnClear'),
    btnRefresh: document.getElementById('btnRefresh'),
    imageUpload: document.getElementById('imageUpload'),
    btnAnalyzeWithAI: document.getElementById('btnAnalyzeWithAI'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    imagesSection: document.getElementById('imagesSection'),
    dataSection: document.getElementById('dataSection'),
    resultSection: document.getElementById('resultSection'),
    invoiceImages: document.getElementById('invoiceImages'),
    invoiceNumber: document.getElementById('invoiceNumber'),
    supplierName: document.getElementById('supplierName'),
    totalAmount: document.getElementById('totalAmount'),
    totalQuantity: document.getElementById('totalQuantity'),
    productList: document.getElementById('productList'),
    comparisonResult: document.getElementById('comparisonResult'),
};

// =====================================================
// WAIT FOR TOKEN MANAGER TO BE READY
// =====================================================
async function ensureTokenManagerReady() {
    try {
        // Wait for window.tokenManager to be available
        let retries = 0;
        const maxRetries = 50; // 5 seconds max

        while (!window.tokenManager && retries < maxRetries) {
            console.log('[INVOICE] Waiting for tokenManager to be available...');
            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
        }

        if (!window.tokenManager) {
            throw new Error('TokenManager not available. Please make sure token-manager.js is loaded.');
        }

        console.log('[INVOICE] TokenManager is available');

        // Wait for full initialization (Firebase etc)
        if (window.tokenManager.waitForFirebaseAndInit) {
            await window.tokenManager.waitForFirebaseAndInit();
            console.log('[INVOICE] TokenManager fully initialized');
        }

        return window.tokenManager;
    } catch (error) {
        console.error('[INVOICE] Error ensuring TokenManager ready:', error);
        showNotification('Lỗi khởi tạo token manager: ' + error.message, 'error');
        throw error;
    }
}

// =====================================================
// EXTRACT INVOICE ID FROM URL
// =====================================================
function extractInvoiceId(url) {
    try {
        // Extract ID from URL like: https://tomato.tpos.vn/#/app/fastpurchaseorder/invoiceform1?id=53589
        const match = url.match(/[?&]id=(\d+)/);
        if (match && match[1]) {
            return match[1];
        }
        throw new Error('Không tìm thấy ID trong URL');
    } catch (error) {
        console.error('Error extracting invoice ID:', error);
        showNotification('URL không hợp lệ', 'error');
        throw error;
    }
}

// =====================================================
// FETCH INVOICE DATA FROM TPOS
// =====================================================
async function fetchInvoiceData(invoiceId) {
    try {
        showLoading(true);

        // Ensure tokenManager is ready
        await ensureTokenManagerReady();

        // Build API URL
        const apiUrl = `${CONFIG.CLOUDFLARE_PROXY}/api/odata/FastPurchaseOrder(${invoiceId})?$expand=Partner,PickingType,Company,Journal,Account,User,RefundOrder,PaymentJournal,Tax,OrderLines($expand=Product,ProductUOM,Account),DestConvertCurrencyUnit`;

        console.log('[FETCH] Fetching invoice data:', apiUrl);

        // Use window.tokenManager.authenticatedFetch() - auto handles token refresh and 401 retry
        const response = await window.tokenManager.authenticatedFetch(apiUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'tposappversion': '5.11.16.1',
                'x-tpos-lang': 'vi',
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('[FETCH] Invoice data received:', data);

        currentInvoiceData = data;
        currentInvoiceId = invoiceId;

        displayInvoiceData(data);
        showNotification('Tải dữ liệu thành công!', 'success');

        return data;
    } catch (error) {
        console.error('[FETCH] Error fetching invoice:', error);
        showNotification('Lỗi tải dữ liệu: ' + error.message, 'error');
        throw error;
    } finally {
        showLoading(false);
    }
}

// =====================================================
// DISPLAY INVOICE DATA
// =====================================================
function displayInvoiceData(data) {
    // Show data section (keep images section visible if user uploaded images)
    elements.dataSection.style.display = 'block';
    // Don't hide imagesSection - user may have uploaded images already
    elements.imagesSection.style.display = 'block';

    // Display summary
    elements.invoiceNumber.textContent = data.Number || '-';
    elements.supplierName.textContent = data.PartnerDisplayName || '-';
    elements.totalAmount.textContent = formatCurrency(data.AmountTotal || 0);
    elements.totalQuantity.textContent = data.TotalQuantity || 0;

    // Display products
    displayProductList(data.OrderLines || []);
}

// =====================================================
// DISPLAY PRODUCT LIST
// =====================================================
function displayProductList(orderLines) {
    elements.productList.innerHTML = '';

    if (!orderLines || orderLines.length === 0) {
        elements.productList.innerHTML = '<p style="text-align: center; color: #9ca3af;">Không có sản phẩm</p>';
        return;
    }

    orderLines.forEach((line) => {
        const div = document.createElement('div');
        div.className = 'product-item';
        div.innerHTML = `
            <div class="product-code">${line.ProductBarcode || '-'}</div>
            <div class="product-name">${line.ProductName || '-'}</div>
            <div class="product-qty">${line.ProductQty || 0} ${line.ProductUOMName || ''}</div>
            <div class="product-price">${formatCurrency(line.PriceUnit || 0)}</div>
            <div class="product-total">${formatCurrency(line.PriceSubTotal || 0)}</div>
        `;
        elements.productList.appendChild(div);
    });
}

// =====================================================
// EXTRACT MÃ HÀNG (5-6 digits) FROM PRODUCT NAME
// =====================================================
function extractProductCode(productName) {
    if (!productName) return null;

    // Extract 5-6 digit code from product name
    const match = productName.match(/\b(\d{5,6})\b/);
    return match ? match[1] : null;
}

// =====================================================
// GROUP ORDER LINES BY MÃ HÀNG
// =====================================================
function groupOrderLinesByCode(orderLines) {
    const grouped = {};

    orderLines.forEach((line) => {
        const code = extractProductCode(line.ProductName);

        if (!code) {
            console.warn('[GROUP] No code found in product:', line.ProductName);
            return;
        }

        if (!grouped[code]) {
            grouped[code] = {
                qty: 0,
                amount: 0,
                items: [],
            };
        }

        grouped[code].qty += line.ProductQty || 0;
        grouped[code].amount += line.PriceSubTotal || 0;
        grouped[code].items.push({
            barcode: line.ProductBarcode,
            name: line.ProductName,
            qty: line.ProductQty,
            price: line.PriceUnit,
            total: line.PriceSubTotal,
        });
    });

    return grouped;
}

// =====================================================
// VALIDATE INTERNAL CONSISTENCY
// =====================================================
function validateInternalConsistency(data) {
    const errors = [];

    // Check if TotalQuantity matches sum of ProductQty
    const sumQty = (data.OrderLines || []).reduce((sum, line) => sum + (line.ProductQty || 0), 0);
    if (Math.abs(sumQty - (data.TotalQuantity || 0)) > 0.01) {
        errors.push({
            type: 'INTERNAL_QTY_MISMATCH',
            message: `Tổng số lượng không khớp: ${data.TotalQuantity} vs ${sumQty}`,
            expected: data.TotalQuantity,
            actual: sumQty,
        });
    }

    // Check if AmountTotal matches sum of PriceSubTotal
    const sumAmount = (data.OrderLines || []).reduce((sum, line) => sum + (line.PriceSubTotal || 0), 0);
    if (Math.abs(sumAmount - (data.AmountTotal || 0)) > 0.01) {
        errors.push({
            type: 'INTERNAL_AMOUNT_MISMATCH',
            message: `Tổng tiền không khớp: ${formatCurrency(data.AmountTotal)} vs ${formatCurrency(sumAmount)}`,
            expected: data.AmountTotal,
            actual: sumAmount,
        });
    }

    return errors;
}

// =====================================================
// COMPARE WITH EXTERNAL INVOICE (PLACEHOLDER)
// =====================================================
function compareWithExternalInvoice(jsonData, externalInvoice) {
    const errors = [];

    // Group JSON data by product code
    const jsonGrouped = groupOrderLinesByCode(jsonData.OrderLines || []);

    // Compare each item in external invoice
    Object.keys(externalInvoice).forEach((code) => {
        const external = externalInvoice[code];
        const json = jsonGrouped[code];

        if (!json) {
            // Missing in JSON
            errors.push({
                code: code,
                type: 'MISSING',
                message: `Thiếu mã hàng ${code} trong JSON`,
                external: external,
                json: null,
            });
            return;
        }

        // Check quantity
        if (Math.abs(json.qty - external.qty) > 0.01) {
            errors.push({
                code: code,
                type: 'QTY_MISMATCH',
                message: `Số lượng không khớp cho mã ${code}`,
                external: external,
                json: json,
                difference: json.qty - external.qty,
            });
        }

        // Check amount
        if (Math.abs(json.amount - external.amount) > 0.01) {
            // Check if it's a price error (x10 mistake)
            const jsonPrice = json.amount / json.qty;
            const externalPrice = external.amount / external.qty;

            if (Math.abs(jsonPrice / externalPrice - 10) < 0.01) {
                errors.push({
                    code: code,
                    type: 'PRICE_ERROR_X10',
                    message: `Giá nhập thừa số 0 cho mã ${code}`,
                    external: external,
                    json: json,
                    externalPrice: externalPrice,
                    jsonPrice: jsonPrice,
                    difference: json.amount - external.amount,
                });
            } else {
                errors.push({
                    code: code,
                    type: 'AMOUNT_MISMATCH',
                    message: `Thành tiền không khớp cho mã ${code}`,
                    external: external,
                    json: json,
                    difference: json.amount - external.amount,
                });
            }
        }

        // Remove from grouped to find extras
        delete jsonGrouped[code];
    });

    // Check for extra items in JSON
    Object.keys(jsonGrouped).forEach((code) => {
        errors.push({
            code: code,
            type: 'EXTRA',
            message: `Thừa mã hàng ${code} trong JSON`,
            external: null,
            json: jsonGrouped[code],
        });
    });

    return errors;
}

// =====================================================
// DISPLAY COMPARISON RESULT
// =====================================================
function displayComparisonResult(internalErrors, comparisonErrors) {
    elements.resultSection.style.display = 'block';

    let html = '';

    // Display internal validation errors
    if (internalErrors.length > 0) {
        html += '<h3>❌ Lỗi Nội Bộ JSON:</h3>';
        html += '<div class="error-list">';
        internalErrors.forEach((error) => {
            html += `
                <div class="error-item error-price">
                    <div class="error-header">
                        <i data-lucide="alert-circle"></i>
                        <span>${error.message}</span>
                    </div>
                    <div class="error-details">
                        <div class="error-detail">
                            <span class="detail-label">Mong đợi</span>
                            <span class="detail-value">${typeof error.expected === 'number' ? formatCurrency(error.expected) : error.expected}</span>
                        </div>
                        <div class="error-detail">
                            <span class="detail-label">Thực tế</span>
                            <span class="detail-value">${typeof error.actual === 'number' ? formatCurrency(error.actual) : error.actual}</span>
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
    }

    // Display comparison summary
    if (comparisonErrors && comparisonErrors.length > 0) {
        const priceErrors = comparisonErrors.filter(e => e.type.includes('PRICE') || e.type.includes('AMOUNT'));
        const qtyErrors = comparisonErrors.filter(e => e.type.includes('QTY'));
        const missingErrors = comparisonErrors.filter(e => e.type === 'MISSING');
        const extraErrors = comparisonErrors.filter(e => e.type === 'EXTRA');

        html += '<h3>📊 Tổng Quan So Sánh:</h3>';
        html += '<div class="comparison-summary">';
        html += `
            <div class="comparison-stat ${priceErrors.length > 0 ? 'error' : 'success'}">
                <div class="stat-value">${priceErrors.length}</div>
                <div class="stat-label">Lỗi Giá</div>
            </div>
            <div class="comparison-stat ${qtyErrors.length > 0 ? 'warning' : 'success'}">
                <div class="stat-value">${qtyErrors.length}</div>
                <div class="stat-label">Lỗi Số Lượng</div>
            </div>
            <div class="comparison-stat ${missingErrors.length > 0 ? 'error' : 'success'}">
                <div class="stat-value">${missingErrors.length}</div>
                <div class="stat-label">Thiếu</div>
            </div>
            <div class="comparison-stat ${extraErrors.length > 0 ? 'warning' : 'success'}">
                <div class="stat-value">${extraErrors.length}</div>
                <div class="stat-label">Thừa</div>
            </div>
        `;
        html += '</div>';

        // Display detailed errors
        html += '<h3>Chi Tiết Lỗi:</h3>';
        html += '<div class="error-list">';
        comparisonErrors.forEach((error) => {
            const errorClass = error.type.includes('PRICE') || error.type.includes('AMOUNT') ? 'error-price' :
                               error.type.includes('QTY') ? 'error-qty' :
                               error.type === 'MISSING' ? 'error-missing' : 'error-extra';

            html += `
                <div class="error-item ${errorClass}">
                    <div class="error-header">
                        <i data-lucide="alert-circle"></i>
                        <span>Mã ${error.code}: ${error.message}</span>
                    </div>
                    <div class="error-details">
                        ${error.json ? `
                            <div class="error-detail">
                                <span class="detail-label">JSON SL</span>
                                <span class="detail-value">${error.json.qty}</span>
                            </div>
                            <div class="error-detail">
                                <span class="detail-label">JSON Tiền</span>
                                <span class="detail-value">${formatCurrency(error.json.amount)}</span>
                            </div>
                        ` : ''}
                        ${error.external ? `
                            <div class="error-detail">
                                <span class="detail-label">Hóa đơn SL</span>
                                <span class="detail-value">${error.external.qty}</span>
                            </div>
                            <div class="error-detail">
                                <span class="detail-label">Hóa đơn Tiền</span>
                                <span class="detail-value">${formatCurrency(error.external.amount)}</span>
                            </div>
                        ` : ''}
                        ${error.difference !== undefined ? `
                            <div class="error-detail">
                                <span class="detail-label">Chênh lệch</span>
                                <span class="detail-value">${formatCurrency(error.difference)}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        });
        html += '</div>';
    } else {
        html += '<div style="text-align: center; padding: 40px;">';
        html += '<i data-lucide="check-circle" style="width: 64px; height: 64px; color: #10b981; margin-bottom: 16px;"></i>';
        html += '<h3 style="color: #059669;">✅ Không có lỗi!</h3>';
        html += '<p style="color: #6b7280;">Dữ liệu JSON hợp lệ</p>';
        html += '</div>';
    }

    elements.comparisonResult.innerHTML = html;

    // Re-initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================
function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
    }).format(amount);
}

function showLoading(show) {
    elements.loadingOverlay.style.display = show ? 'flex' : 'none';
}

function showNotification(message, type = 'info') {
    // Simple alert for now - can be enhanced with better UI
    if (type === 'error') {
        alert('❌ ' + message);
    } else if (type === 'success') {
        alert('✅ ' + message);
    } else {
        alert('ℹ️ ' + message);
    }
}

function clearAll() {
    elements.invoiceUrl.value = '';
    elements.imagesSection.style.display = 'block';
    elements.dataSection.style.display = 'none';
    elements.resultSection.style.display = 'none';
    elements.invoiceImages.innerHTML = '';
    elements.btnAnalyzeWithAI.style.display = 'none';
    currentInvoiceData = null;
    currentInvoiceId = null;
    uploadedImages = [];
    aiAnalysisResult = null;
}

// =====================================================
// IMAGE UPLOAD & DISPLAY
// =====================================================

async function handleImageUpload(files) {
    try {
        showLoading(true);
        uploadedImages = [];

        for (const file of files) {
            if (!file.type.startsWith('image/')) {
                continue;
            }

            const base64 = await window.GeminiAI.fileToBase64(file);
            const imageUrl = URL.createObjectURL(file);

            uploadedImages.push({
                file: file,
                base64: base64,
                url: imageUrl,
                mimeType: file.type,
            });
        }

        displayUploadedImages();
        showNotification(`Đã tải ${uploadedImages.length} ảnh`, 'success');

        // Show AI analysis button
        if (uploadedImages.length > 0) {
            elements.btnAnalyzeWithAI.style.display = 'block';
        }

    } catch (error) {
        console.error('Error uploading images:', error);
        showNotification('Lỗi tải ảnh: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

function displayUploadedImages() {
    elements.invoiceImages.innerHTML = '';

    uploadedImages.forEach((img, index) => {
        const div = document.createElement('div');
        div.className = 'invoice-image';
        div.innerHTML = `
            <img src="${img.url}" alt="Hóa đơn ${index + 1}" />
            <button class="btn-remove-image" data-index="${index}">
                <i data-lucide="x"></i>
            </button>
        `;
        elements.invoiceImages.appendChild(div);
    });

    // Re-initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Add remove handlers
    document.querySelectorAll('.btn-remove-image').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.currentTarget.dataset.index);
            uploadedImages.splice(index, 1);
            displayUploadedImages();
            if (uploadedImages.length === 0) {
                elements.btnAnalyzeWithAI.style.display = 'none';
            }
        });
    });
}

// =====================================================
// AI ANALYSIS
// =====================================================

const AI_ANALYSIS_PROMPT = `Bạn là chuyên gia phân tích hóa đơn. Hãy phân tích hình ảnh hóa đơn này và trích xuất thông tin theo format JSON sau:

{
  "invoice_info": {
    "number": "Số hóa đơn",
    "supplier": "Tên nhà cung cấp",
    "date": "Ngày lập",
    "total_amount": số tiền tổng (number),
    "total_quantity": tổng số lượng (number)
  },
  "products": [
    {
      "code": "Mã hàng 5-6 số (VD: 1812, 53589)",
      "name": "Tên sản phẩm đầy đủ",
      "quantity": số lượng (number),
      "unit_price": đơn giá (number),
      "total": thành tiền (number)
    }
  ]
}

**QUAN TRỌNG:**
- Mã hàng (code) là chuỗi 5-6 chữ số, thường xuất hiện ở đầu tên sản phẩm hoặc trong cột mã
- Số lượng (quantity) phải là số, không có chữ
- Đơn giá và thành tiền phải là số, không có dấu phẩy hay ký tự đặc biệt
- Nếu có nhiều sản phẩm cùng mã hàng, hãy gộp chúng lại
- KHÔNG thêm bất kỳ text nào ngoài JSON

Chỉ trả về JSON, không thêm giải thích hay text khác.`;

async function analyzeImagesWithAI() {
    try {
        showLoading(true);

        if (!window.GeminiAI) {
            throw new Error('Gemini AI chưa được tải. Vui lòng load lại trang.');
        }

        if (uploadedImages.length === 0) {
            throw new Error('Chưa có ảnh nào được tải lên');
        }

        console.log('[AI-ANALYSIS] Starting analysis with', uploadedImages.length, 'images');

        // Analyze first image (you can loop through all if needed)
        const image = uploadedImages[0];

        const result = await window.GeminiAI.analyzeImageWithGemini(
            image.base64,
            AI_ANALYSIS_PROMPT,
            {
                model: 'gemini-2.0-flash-exp',
                mimeType: image.mimeType,
            }
        );

        console.log('[AI-ANALYSIS] Raw result:', result);

        // Parse JSON from result
        aiAnalysisResult = parseAIResult(result);
        console.log('[AI-ANALYSIS] Parsed result:', aiAnalysisResult);

        // Display AI analysis result
        displayAIAnalysisResult(aiAnalysisResult);

        // Compare with JSON if available
        if (currentInvoiceData) {
            const comparisonErrors = compareAIWithJSON(aiAnalysisResult, currentInvoiceData);
            const internalErrors = validateInternalConsistency(currentInvoiceData);
            displayComparisonResult(internalErrors, comparisonErrors);
        }

        showNotification('Phân tích AI hoàn tất!', 'success');

    } catch (error) {
        console.error('[AI-ANALYSIS] Error:', error);
        showNotification('Lỗi phân tích AI: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

function parseAIResult(rawText) {
    try {
        // Remove markdown code blocks if present
        let jsonText = rawText.trim();
        jsonText = jsonText.replace(/```json\n?/g, '');
        jsonText = jsonText.replace(/```\n?/g, '');
        jsonText = jsonText.trim();

        const parsed = JSON.parse(jsonText);
        return parsed;
    } catch (error) {
        console.error('[PARSE] Failed to parse AI result:', error);
        throw new Error('Không thể parse kết quả từ AI. Vui lòng thử lại.');
    }
}

function displayAIAnalysisResult(aiResult) {
    if (!aiResult || !aiResult.products) {
        return;
    }

    // Create a section to display AI result
    let html = '<h3>📊 Kết Quả Phân Tích AI:</h3>';
    html += '<div class="data-summary">';
    html += `<div class="summary-item"><span class="label">Số HĐ:</span><span class="value">${aiResult.invoice_info?.number || '-'}</span></div>`;
    html += `<div class="summary-item"><span class="label">NCC:</span><span class="value">${aiResult.invoice_info?.supplier || '-'}</span></div>`;
    html += `<div class="summary-item"><span class="label">Tổng Tiền:</span><span class="value">${formatCurrency(aiResult.invoice_info?.total_amount || 0)}</span></div>`;
    html += `<div class="summary-item"><span class="label">Tổng SL:</span><span class="value">${aiResult.invoice_info?.total_quantity || 0}</span></div>`;
    html += '</div>';

    html += '<h4>Chi Tiết Sản Phẩm (AI):</h4>';
    html += '<div class="product-list">';
    aiResult.products.forEach(product => {
        html += `
            <div class="product-item">
                <div class="product-code">${product.code || '-'}</div>
                <div class="product-name">${product.name || '-'}</div>
                <div class="product-qty">${product.quantity || 0}</div>
                <div class="product-price">${formatCurrency(product.unit_price || 0)}</div>
                <div class="product-total">${formatCurrency(product.total || 0)}</div>
            </div>
        `;
    });
    html += '</div>';

    // Show in result section
    elements.resultSection.style.display = 'block';
    elements.comparisonResult.innerHTML = html + '<hr style="margin: 24px 0;">' + elements.comparisonResult.innerHTML;
}

// =====================================================
// COMPARE AI RESULT WITH JSON
// =====================================================

function compareAIWithJSON(aiResult, jsonData) {
    const errors = [];

    if (!aiResult || !aiResult.products || !jsonData || !jsonData.OrderLines) {
        return errors;
    }

    // Group JSON data by product code (5-6 digits)
    const jsonGrouped = groupOrderLinesByCode(jsonData.OrderLines || []);

    // Group AI data by product code
    const aiGrouped = {};
    aiResult.products.forEach(product => {
        const code = product.code || extractProductCode(product.name);
        if (!code) return;

        if (!aiGrouped[code]) {
            aiGrouped[code] = {
                qty: 0,
                amount: 0,
                items: [],
            };
        }

        aiGrouped[code].qty += product.quantity || 0;
        aiGrouped[code].amount += product.total || 0;
        aiGrouped[code].items.push(product);
    });

    console.log('[COMPARE] JSON grouped:', jsonGrouped);
    console.log('[COMPARE] AI grouped:', aiGrouped);

    // Compare each item in AI result with JSON
    Object.keys(aiGrouped).forEach((code) => {
        const ai = aiGrouped[code];
        const json = jsonGrouped[code];

        if (!json) {
            // Missing in JSON (or extra in AI)
            errors.push({
                code: code,
                type: 'EXTRA_IN_AI',
                message: `Mã ${code} có trong hóa đơn nhưng KHÔNG có trong JSON TPOS`,
                ai: ai,
                json: null,
            });
            return;
        }

        // Check quantity
        if (Math.abs(json.qty - ai.qty) > 0.01) {
            errors.push({
                code: code,
                type: 'QTY_MISMATCH',
                message: `Số lượng không khớp cho mã ${code}`,
                ai: ai,
                json: json,
                difference: json.qty - ai.qty,
            });
        }

        // Check amount
        if (Math.abs(json.amount - ai.amount) > 0.01) {
            // Check if it's a price error (x10 mistake)
            const jsonPrice = json.amount / json.qty;
            const aiPrice = ai.amount / ai.qty;

            if (Math.abs(jsonPrice / aiPrice - 10) < 0.1 || Math.abs(aiPrice / jsonPrice - 10) < 0.1) {
                errors.push({
                    code: code,
                    type: 'PRICE_ERROR_X10',
                    message: `❌ LỖI NHẬP GIÁ X10 cho mã ${code}`,
                    ai: ai,
                    json: json,
                    aiPrice: aiPrice,
                    jsonPrice: jsonPrice,
                    difference: json.amount - ai.amount,
                });
            } else {
                errors.push({
                    code: code,
                    type: 'AMOUNT_MISMATCH',
                    message: `Thành tiền không khớp cho mã ${code}`,
                    ai: ai,
                    json: json,
                    difference: json.amount - ai.amount,
                });
            }
        }

        // Remove from grouped to find missing items
        delete jsonGrouped[code];
    });

    // Check for items in JSON but not in AI (missing in invoice)
    Object.keys(jsonGrouped).forEach((code) => {
        errors.push({
            code: code,
            type: 'MISSING_IN_AI',
            message: `Mã ${code} có trong JSON TPOS nhưng KHÔNG có trong hóa đơn`,
            ai: null,
            json: jsonGrouped[code],
        });
    });

    return errors;
}

// =====================================================
// EVENT HANDLERS
// =====================================================

// Image Upload
elements.imageUpload.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
        handleImageUpload(files);
    }
});

// AI Analysis Button
elements.btnAnalyzeWithAI.addEventListener('click', async () => {
    await analyzeImagesWithAI();
});

// Fetch Invoice Data
elements.btnFetchInvoice.addEventListener('click', async () => {
    try {
        const url = elements.invoiceUrl.value.trim();
        if (!url) {
            showNotification('Vui lòng nhập URL hóa đơn', 'error');
            return;
        }

        const invoiceId = extractInvoiceId(url);
        await fetchInvoiceData(invoiceId);

        // Validate internal consistency
        const internalErrors = validateInternalConsistency(currentInvoiceData);

        // If AI result exists, compare with AI
        if (aiAnalysisResult) {
            const comparisonErrors = compareAIWithJSON(aiAnalysisResult, currentInvoiceData);
            displayComparisonResult(internalErrors, comparisonErrors);
        } else {
            displayComparisonResult(internalErrors, []);
        }

    } catch (error) {
        console.error('Error:', error);
    }
});

elements.btnClear.addEventListener('click', () => {
    clearAll();
});

elements.btnRefresh.addEventListener('click', () => {
    if (currentInvoiceId) {
        fetchInvoiceData(currentInvoiceId);
    }
});

// =====================================================
// INITIALIZATION
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('[INVOICE-COMPARE] Initialized');

    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});
