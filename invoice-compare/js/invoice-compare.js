// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/* =====================================================
   INVOICE COMPARE - MAIN SCRIPT (UPDATED)
   So sánh đơn hàng từ TPOS với hóa đơn viết tay
   Logic cải tiến theo quy trình đối soát chi tiết
   ===================================================== */

// Use global CONFIG from config.js (with fallback support)
const INVOICE_CONFIG = window.CONFIG || {
    CLOUDFLARE_PROXY: 'https://chatomni-proxy.nhijudyshop.workers.dev',
    get API_BASE_URL() { return this.CLOUDFLARE_PROXY; },
    smartFetch: (url, options) => fetch(url, options)
};

// Global state
let currentInvoiceData = null;
let currentInvoiceId = null;
let uploadedImages = [];
let aiAnalysisResult = null;

// =====================================================
// PRODUCT CODE MAPPING TABLE
// Bảng mapping mã sản phẩm giữa hóa đơn viết tay và JSON
// =====================================================
const PRODUCT_CODE_MAPPING = {
    // Mã 4 số trên hóa đơn → Mã 3 số trong JSON
    '2800': '800',   // Áo LV
    '2709': '709',   // Áo GC
    '2608': '608',   // Áo DG
    '2015': 'DSQ',   // Quần đùi DSQ
    // Mã giống nhau
    '2400': '2400',  // Quần bò xanh
    '6603': '6603',  // Quần bò đen LV
    '6604': '6604',  // Quần bò đen BBR
};

// Đơn giá chuẩn để kiểm tra
const STANDARD_PRICES = {
    '2400': 270000,  // Quần bò xanh
    '6603': 265000,  // Quần bò đen LV
    '6604': 265000,  // Quần bò đen BBR
    '800': 195000,   // Áo LV
    '709': 185000,   // Áo GC
    '608': 175000,   // Áo DG
    'DSQ': 170000,   // Quần đùi DSQ
    'SOMI': 210000,  // Áo sơmi (các loại)
};

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
    aiAnalyzeSection: document.getElementById('aiAnalyzeSection'),
    loadingInline: document.getElementById('loadingInline'),
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
        let retries = 0;
        const maxRetries = 50;

        while (!window.tokenManager && retries < maxRetries) {
            console.log('[INVOICE] Waiting for tokenManager...');
            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
        }

        if (!window.tokenManager) {
            throw new Error('TokenManager not available.');
        }

        console.log('[INVOICE] TokenManager is available');

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
        await ensureTokenManagerReady();

        const apiUrl = `${INVOICE_CONFIG.API_BASE_URL}/api/odata/FastPurchaseOrder(${invoiceId})?$expand=Partner,PickingType,Company,Journal,Account,User,RefundOrder,PaymentJournal,Tax,OrderLines($expand=Product,ProductUOM,Account),DestConvertCurrencyUnit`;

        console.log('[FETCH] Fetching invoice data:', apiUrl);

        const response = await window.tokenManager.authenticatedFetch(apiUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'tposappversion': window.TPOS_CONFIG?.tposAppVersion || '5.11.16.1',
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
    elements.dataSection.style.display = 'block';
    elements.imagesSection.style.display = 'block';

    elements.invoiceNumber.textContent = data.Number || '-';
    elements.supplierName.textContent = data.PartnerDisplayName || '-';
    elements.totalAmount.textContent = formatCurrency(data.AmountTotal || 0);
    elements.totalQuantity.textContent = data.TotalQuantity || 0;

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
// EXTRACT PRODUCT CODE FROM JSON ProductName
// Pattern: [Ngày] [Mã KH] [Tên SP] [Mã SP] (Size)
// VD: "1812 A86 ÁO THUN LV XÁM 800 (4)" → "800"
// VD: "1812 A86 QUẦN JEAN TÚI LV 7829-2400 XANH (29)" → "2400"
// VD: "2012 A86 ÁO SMI TD THÊU DG CỔ TRẮNG 170 (1)" → "SOMI"
// =====================================================
function extractProductCodeFromJSON(productName) {
    if (!productName) return null;

    const upperName = productName.toUpperCase();

    // Nhận diện áo sơmi (SMI trong tên)
    if (upperName.includes('SMI') || upperName.includes('SƠ MI') || upperName.includes('SOMI')) {
        return 'SOMI';
    }

    // Nhận diện quần DSQ
    if (upperName.includes('DSQU') || upperName.includes('DSQ')) {
        return 'DSQ';
    }

    // Tìm mã sản phẩm 3-4 số ở cuối tên (trước size)
    // Pattern: ... 800 (4) hoặc ... 2400 XANH (29)
    const patterns = [
        /\b(\d{3,4})\s*\([^)]+\)\s*$/,           // 800 (4)
        /\b(\d{3,4})\s+[A-ZÀ-Ỹ]+\s*\([^)]+\)/,  // 2400 XANH (29)
        /[-](\d{3,4})\s/,                        // 7829-2400
        /\b(\d{3,4})\b(?!.*\d{3,4})/,            // Mã cuối cùng
    ];

    for (const pattern of patterns) {
        const match = productName.match(pattern);
        if (match && match[1]) {
            const code = match[1];
            // Bỏ qua các số có vẻ là ngày (0112, 1812, 2012)
            if (code.length === 4 && parseInt(code.substring(0, 2)) <= 31) {
                continue;
            }
            return code;
        }
    }

    return null;
}

// =====================================================
// NORMALIZE PRODUCT CODE
// Map mã hóa đơn viết tay sang mã JSON
// =====================================================
function normalizeProductCode(code) {
    if (!code) return null;

    const codeStr = String(code).toUpperCase().trim();

    // Direct mapping
    if (PRODUCT_CODE_MAPPING[codeStr]) {
        return PRODUCT_CODE_MAPPING[codeStr];
    }

    // Mã 4 số → 3 số cuối (2800 → 800)
    if (codeStr.length === 4 && codeStr.startsWith('2')) {
        const shortCode = codeStr.substring(1);
        if (['800', '709', '608'].includes(shortCode)) {
            return shortCode;
        }
    }

    // DSQ variations
    if (codeStr.includes('DSQ') || codeStr === '2015') {
        return 'DSQ';
    }

    // Sơmi variations
    if (codeStr.includes('SMI') || codeStr.includes('SOMI')) {
        return 'SOMI';
    }

    return codeStr;
}

// =====================================================
// GROUP ORDER LINES BY NORMALIZED CODE
// Gộp sản phẩm theo mã chuẩn hóa
// =====================================================
function groupOrderLinesByCode(orderLines) {
    const grouped = {};

    orderLines.forEach((line) => {
        const rawCode = extractProductCodeFromJSON(line.ProductName);
        const code = normalizeProductCode(rawCode);

        if (!code) {
            console.warn('[GROUP] No code found in product:', line.ProductName);
            return;
        }

        if (!grouped[code]) {
            grouped[code] = {
                code: code,
                rawCodes: new Set(),
                qty: 0,
                amount: 0,
                unitPrice: line.PriceUnit || 0,
                items: [],
            };
        }

        if (rawCode) grouped[code].rawCodes.add(rawCode);
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

    // Convert Set to Array for display
    Object.values(grouped).forEach(g => {
        g.rawCodes = Array.from(g.rawCodes);
    });

    return grouped;
}

// =====================================================
// VALIDATE INTERNAL CONSISTENCY
// =====================================================
function validateInternalConsistency(data) {
    const errors = [];

    const sumQty = (data.OrderLines || []).reduce((sum, line) => sum + (line.ProductQty || 0), 0);
    if (Math.abs(sumQty - (data.TotalQuantity || 0)) > 0.01) {
        errors.push({
            type: 'INTERNAL_QTY_MISMATCH',
            message: `Tổng số lượng không khớp: ${data.TotalQuantity} vs ${sumQty}`,
            expected: data.TotalQuantity,
            actual: sumQty,
        });
    }

    const sumAmount = (data.OrderLines || []).reduce((sum, line) => sum + (line.PriceSubTotal || 0), 0);
    if (Math.abs(sumAmount - (data.AmountTotal || 0)) > 0.01) {
        errors.push({
            type: 'INTERNAL_AMOUNT_MISMATCH',
            message: `Tổng tiền không khớp: ${formatCurrency(data.AmountTotal)} vs ${formatCurrency(sumAmount)}`,
            expected: data.AmountTotal,
            actual: sumAmount,
        });
    }

    // Kiểm tra phép tính từng dòng
    (data.OrderLines || []).forEach((line, index) => {
        const calculated = (line.ProductQty || 0) * (line.PriceUnit || 0);
        if (Math.abs(calculated - (line.PriceSubTotal || 0)) > 1) {
            errors.push({
                type: 'LINE_CALC_ERROR',
                message: `Dòng ${index + 1}: SL × Giá ≠ Thành tiền`,
                product: line.ProductName,
                expected: calculated,
                actual: line.PriceSubTotal,
            });
        }
    });

    return errors;
}

// =====================================================
// AI ANALYSIS PROMPT - Chi tiết hơn
// =====================================================
const AI_ANALYSIS_PROMPT = `Bạn là chuyên gia phân tích hóa đơn viết tay tiếng Việt. Phân tích text OCR và trích xuất thông tin theo format JSON.

**BẢNG MAPPING MÃ SẢN PHẨM:**
| Mã trên hóa đơn | Tên sản phẩm | Đơn giá chuẩn |
|-----------------|--------------|---------------|
| 2400 | Quần Bò xanh LV | 270,000 |
| 6603/6604 | Quần Bò đen LV/BBR | 265,000 |
| 2800 hoặc 800 | Áo thun LV | 195,000 |
| 2709 hoặc 709 | Áo cổ bẻ GC | 185,000 |
| 2608 hoặc 608 | Áo thun DG/Dolce | 175,000 |
| 2015 hoặc DSQ | Quần đùi DSQ | 170,000 |
| A.sơmi (nhiều loại) | Áo sơmi | 210,000 |

**NHẬN DIỆN ÁO SƠMI:**
Các loại áo sơmi thường có tên như:
- A.sơmi DG, A.sơmi BBr, A.BBr tang sọt, A.BBr cổ ngựa
- A.sơmi cổ DG, A.sơmi cổ Dior, A.sơmi Dior ong
- Tất cả áo sơmi có giá 210,000

**NHẬN DIỆN QUẦN DSQ:**
- Quần DSQ trắng, Quần DSQ đen
- Mã: 2015
- Giá: 170,000

**OUTPUT FORMAT:**
{
  "invoice_info": {
    "number": "Số hóa đơn (nếu có)",
    "supplier": "Tên nhà cung cấp/khách hàng",
    "date": "Ngày lập (nếu có)",
    "total_amount": số tiền tổng (number, không có dấu phẩy),
    "total_quantity": tổng số lượng (number)
  },
  "products": [
    {
      "code": "Mã sản phẩm (2400, 6603, 800, 709, 608, DSQ, SOMI)",
      "name": "Tên sản phẩm gốc trên hóa đơn",
      "quantity": số lượng (number),
      "unit_price": đơn giá (number),
      "total": thành tiền (number)
    }
  ],
  "notes": "Ghi chú nếu có thông tin bổ sung hoặc điều chỉnh"
}

**QUY TẮC QUAN TRỌNG:**
1. Mã 4 số bắt đầu bằng 2 (2800, 2709, 2608) → dùng 3 số cuối (800, 709, 608)
2. Tất cả áo sơmi (bất kể loại) → code = "SOMI"
3. Tất cả quần DSQ (trắng/đen) → code = "DSQ"
4. Số lượng và giá phải là số nguyên, không có dấu phẩy
5. Kiểm tra phép tính: SL × Giá = Thành tiền. Nếu sai, ghi chú.
6. Nếu có nhiều trang, gộp tất cả sản phẩm lại
7. CHỈ trả về JSON, không thêm text khác`;

// =====================================================
// ANALYZE IMAGES WITH AI
// =====================================================
async function analyzeImagesWithAI() {
    try {
        if (uploadedImages.length === 0) {
            throw new Error('Chưa có ảnh nào được tải lên');
        }

        if (!window.DeepSeekAI || !window.DeepSeekAI.isConfigured()) {
            throw new Error('DeepSeek API chưa được cấu hình. Vui lòng kiểm tra API key.');
        }

        const ocrEngine = window.DeepSeekAI.getCurrentOCREngine
            ? window.DeepSeekAI.getCurrentOCREngine()
            : 'Google Cloud Vision';

        console.log('[AI-ANALYSIS] Starting with', uploadedImages.length, 'images, OCR:', ocrEngine);

        showLoading(true, 'Bắt đầu phân tích...');
        setLoadingStep(1, 'active');
        setLoadingProgress(10);

        // Collect text from all images
        let allTexts = [];
        for (let i = 0; i < uploadedImages.length; i++) {
            const image = uploadedImages[i];
            setLoadingStatus(`Đang OCR ảnh ${i + 1}/${uploadedImages.length}`, ocrEngine);
            setLoadingProgress(10 + (i / uploadedImages.length) * 40);

            try {
                const imageData = `data:${image.mimeType};base64,${image.base64}`;
                const text = await window.DeepSeekAI.extractTextFromImage(imageData, image.mimeType);
                if (text && text.trim().length > 10) {
                    allTexts.push(`--- TRANG ${i + 1} ---\n${text}`);
                    showOCRPreview(text, ocrEngine);
                }
            } catch (ocrError) {
                console.warn(`[OCR] Image ${i + 1} failed:`, ocrError.message);
            }
        }

        if (allTexts.length === 0) {
            throw new Error('Không thể trích xuất text từ ảnh');
        }

        setLoadingStep(1, 'completed');
        setLoadingStep(2, 'active');
        setLoadingProgress(60);
        setLoadingStatus('Đang phân tích với DeepSeek AI', 'Xử lý dữ liệu...');

        const combinedText = allTexts.join('\n\n');
        const analysisPrompt = `Dưới đây là text từ ${uploadedImages.length} trang hóa đơn viết tay:

--- BẮT ĐẦU TEXT ---
${combinedText}
--- KẾT THÚC TEXT ---

${AI_ANALYSIS_PROMPT}`;

        setLoadingProgress(70);

        const result = await window.DeepSeekAI.callDeepSeekAPI([
            { role: 'user', content: analysisPrompt }
        ]);

        setLoadingProgress(90);
        setLoadingStep(2, 'completed');
        setLoadingStep(3, 'active');
        setLoadingProgress(100);
        setLoadingStatus('Hoàn tất!', 'Đang hiển thị kết quả...');

        await new Promise(r => setTimeout(r, 500));

        console.log('[AI-ANALYSIS] Raw result:', result);

        aiAnalysisResult = parseAIResult(result);
        console.log('[AI-ANALYSIS] Parsed result:', aiAnalysisResult);

        displayAIAnalysisResult(aiAnalysisResult);

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

// =====================================================
// PARSE AI RESULT
// =====================================================
function parseAIResult(rawText) {
    try {
        if (!rawText || typeof rawText !== 'string') {
            throw new Error('AI không trả về kết quả');
        }

        let jsonText = rawText.trim();
        jsonText = jsonText.replace(/```json\n?/g, '');
        jsonText = jsonText.replace(/```\n?/g, '');
        jsonText = jsonText.trim();

        const parsed = JSON.parse(jsonText);

        // Normalize product codes in AI result
        if (parsed.products) {
            parsed.products = parsed.products.map(p => ({
                ...p,
                code: normalizeProductCode(p.code) || p.code,
                originalCode: p.code,
            }));
        }

        return parsed;
    } catch (error) {
        console.error('[PARSE] Failed to parse AI result:', error);
        console.log('[PARSE] Raw text:', rawText);
        throw new Error('Không thể parse kết quả từ AI');
    }
}

// =====================================================
// DISPLAY AI ANALYSIS RESULT
// =====================================================
function displayAIAnalysisResult(aiResult) {
    if (!aiResult || !aiResult.products) return;

    let html = '<h3>📊 Kết Quả Phân Tích AI (Hóa Đơn Viết Tay):</h3>';
    html += '<div class="data-summary">';
    html += `<div class="summary-item"><span class="label">Số HĐ:</span><span class="value">${aiResult.invoice_info?.number || '-'}</span></div>`;
    html += `<div class="summary-item"><span class="label">NCC/KH:</span><span class="value">${aiResult.invoice_info?.supplier || '-'}</span></div>`;
    html += `<div class="summary-item"><span class="label">Tổng Tiền:</span><span class="value">${formatCurrency(aiResult.invoice_info?.total_amount || 0)}</span></div>`;
    html += `<div class="summary-item"><span class="label">Tổng SL:</span><span class="value">${aiResult.invoice_info?.total_quantity || 0}</span></div>`;
    html += '</div>';

    if (aiResult.notes) {
        html += `<div class="ai-notes" style="background:#fef3c7;padding:12px;border-radius:8px;margin:12px 0;">
            <strong>📝 Ghi chú AI:</strong> ${aiResult.notes}
        </div>`;
    }

    html += '<h4>Chi Tiết Sản Phẩm (AI):</h4>';
    html += '<div class="product-list">';
    aiResult.products.forEach(product => {
        const calcTotal = (product.quantity || 0) * (product.unit_price || 0);
        const hasCalcError = Math.abs(calcTotal - (product.total || 0)) > 1;

        html += `
            <div class="product-item ${hasCalcError ? 'calc-error' : ''}">
                <div class="product-code">${product.code || '-'}</div>
                <div class="product-name">${product.name || '-'}</div>
                <div class="product-qty">${product.quantity || 0}</div>
                <div class="product-price">${formatCurrency(product.unit_price || 0)}</div>
                <div class="product-total">${formatCurrency(product.total || 0)}
                    ${hasCalcError ? `<br><small style="color:red;">⚠ Đúng: ${formatCurrency(calcTotal)}</small>` : ''}
                </div>
            </div>
        `;
    });
    html += '</div>';

    elements.resultSection.style.display = 'block';
    elements.comparisonResult.innerHTML = html + '<hr style="margin: 24px 0;">';
}

// =====================================================
// COMPARE AI RESULT WITH JSON - Logic cải tiến
// =====================================================
function compareAIWithJSON(aiResult, jsonData) {
    const errors = [];

    if (!aiResult || !aiResult.products || !jsonData || !jsonData.OrderLines) {
        return errors;
    }

    // Group JSON data by normalized code
    const jsonGrouped = groupOrderLinesByCode(jsonData.OrderLines || []);

    // Group AI data by normalized code
    const aiGrouped = {};
    aiResult.products.forEach(product => {
        const code = normalizeProductCode(product.code);
        if (!code) return;

        if (!aiGrouped[code]) {
            aiGrouped[code] = {
                code: code,
                qty: 0,
                amount: 0,
                unitPrice: product.unit_price || 0,
                items: [],
            };
        }

        aiGrouped[code].qty += product.quantity || 0;
        aiGrouped[code].amount += product.total || 0;
        aiGrouped[code].items.push(product);
    });

    console.log('[COMPARE] JSON grouped:', jsonGrouped);
    console.log('[COMPARE] AI grouped:', aiGrouped);

    // So sánh từng mã sản phẩm
    const allCodes = new Set([...Object.keys(aiGrouped), ...Object.keys(jsonGrouped)]);

    allCodes.forEach(code => {
        const ai = aiGrouped[code];
        const json = jsonGrouped[code];

        // Case 1: Có trong hóa đơn nhưng không có trong JSON
        if (ai && !json) {
            errors.push({
                code: code,
                type: 'MISSING_IN_JSON',
                severity: 'error',
                message: `❌ Mã ${code} có trong HÓA ĐƠN nhưng KHÔNG có trong JSON`,
                ai: ai,
                json: null,
            });
            return;
        }

        // Case 2: Có trong JSON nhưng không có trong hóa đơn
        if (json && !ai) {
            errors.push({
                code: code,
                type: 'MISSING_IN_INVOICE',
                severity: 'warning',
                message: `⚠️ Mã ${code} có trong JSON nhưng KHÔNG có trong HÓA ĐƠN`,
                ai: null,
                json: json,
            });
            return;
        }

        // Case 3: Có cả hai → So sánh chi tiết
        if (ai && json) {
            // So sánh số lượng
            const qtyDiff = json.qty - ai.qty;
            if (Math.abs(qtyDiff) > 0.01) {
                errors.push({
                    code: code,
                    type: 'QTY_MISMATCH',
                    severity: 'warning',
                    message: `⚠️ Mã ${code}: Số lượng lệch ${qtyDiff > 0 ? '+' : ''}${qtyDiff}`,
                    ai: ai,
                    json: json,
                    difference: qtyDiff,
                });
            }

            // So sánh thành tiền
            const amountDiff = json.amount - ai.amount;
            if (Math.abs(amountDiff) > 1) {
                // Kiểm tra lỗi x10
                const jsonPrice = json.qty > 0 ? json.amount / json.qty : 0;
                const aiPrice = ai.qty > 0 ? ai.amount / ai.qty : 0;

                if (aiPrice > 0 && Math.abs(jsonPrice / aiPrice - 10) < 0.1) {
                    errors.push({
                        code: code,
                        type: 'PRICE_ERROR_X10',
                        severity: 'error',
                        message: `❌ Mã ${code}: LỖI NHẬP GIÁ x10 (JSON: ${formatCurrency(jsonPrice)} vs HĐ: ${formatCurrency(aiPrice)})`,
                        ai: ai,
                        json: json,
                        aiPrice: aiPrice,
                        jsonPrice: jsonPrice,
                        difference: amountDiff,
                    });
                } else if (jsonPrice > 0 && Math.abs(aiPrice / jsonPrice - 10) < 0.1) {
                    errors.push({
                        code: code,
                        type: 'PRICE_ERROR_X10_REVERSE',
                        severity: 'error',
                        message: `❌ Mã ${code}: LỖI GIÁ HÓA ĐƠN x10 (HĐ: ${formatCurrency(aiPrice)} vs JSON: ${formatCurrency(jsonPrice)})`,
                        ai: ai,
                        json: json,
                        aiPrice: aiPrice,
                        jsonPrice: jsonPrice,
                        difference: amountDiff,
                    });
                } else {
                    // Phân tích nguồn gốc chênh lệch
                    let reason = '';
                    if (Math.abs(qtyDiff) > 0.01) {
                        const expectedDiff = qtyDiff * (ai.unitPrice || aiPrice);
                        if (Math.abs(amountDiff - expectedDiff) < 1000) {
                            reason = ` (do chênh ${qtyDiff} cái × ${formatCurrency(ai.unitPrice || aiPrice)})`;
                        }
                    }

                    errors.push({
                        code: code,
                        type: 'AMOUNT_MISMATCH',
                        severity: 'warning',
                        message: `⚠️ Mã ${code}: Thành tiền lệch ${formatCurrency(amountDiff)}${reason}`,
                        ai: ai,
                        json: json,
                        difference: amountDiff,
                    });
                }
            }

            // Kiểm tra đơn giá có đúng chuẩn không
            const standardPrice = STANDARD_PRICES[code];
            if (standardPrice) {
                const jsonUnitPrice = json.qty > 0 ? json.amount / json.qty : 0;
                if (Math.abs(jsonUnitPrice - standardPrice) > 1000) {
                    errors.push({
                        code: code,
                        type: 'PRICE_NOT_STANDARD',
                        severity: 'info',
                        message: `ℹ️ Mã ${code}: Đơn giá ${formatCurrency(jsonUnitPrice)} ≠ chuẩn ${formatCurrency(standardPrice)}`,
                        ai: ai,
                        json: json,
                        standardPrice: standardPrice,
                        actualPrice: jsonUnitPrice,
                    });
                }
            }
        }
    });

    // So sánh tổng
    const aiTotal = aiResult.invoice_info?.total_amount || 0;
    const jsonTotal = jsonData.AmountTotal || 0;
    const totalDiff = jsonTotal - aiTotal;

    if (Math.abs(totalDiff) > 1) {
        errors.push({
            code: 'TOTAL',
            type: 'TOTAL_MISMATCH',
            severity: totalDiff > 0 ? 'info' : 'warning',
            message: `📊 Tổng tiền: JSON ${formatCurrency(jsonTotal)} vs HĐ ${formatCurrency(aiTotal)} = Lệch ${formatCurrency(totalDiff)}`,
            jsonTotal: jsonTotal,
            aiTotal: aiTotal,
            difference: totalDiff,
        });
    }

    // Sắp xếp theo severity
    const severityOrder = { error: 0, warning: 1, info: 2 };
    errors.sort((a, b) => (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2));

    return errors;
}

// =====================================================
// DISPLAY COMPARISON RESULT - Giao diện cải tiến
// =====================================================
function displayComparisonResult(internalErrors, comparisonErrors) {
    elements.resultSection.style.display = 'block';

    let html = elements.comparisonResult.innerHTML; // Keep AI result

    // Internal errors
    if (internalErrors.length > 0) {
        html += '<h3>❌ Lỗi Nội Bộ JSON:</h3>';
        html += '<div class="error-list">';
        internalErrors.forEach(error => {
            html += `
                <div class="error-item error-price">
                    <div class="error-header">
                        <i data-lucide="alert-circle"></i>
                        <span>${error.message}</span>
                    </div>
                </div>
            `;
        });
        html += '</div>';
    }

    // Comparison errors
    if (comparisonErrors && comparisonErrors.length > 0) {
        const errorsByType = {
            error: comparisonErrors.filter(e => e.severity === 'error'),
            warning: comparisonErrors.filter(e => e.severity === 'warning'),
            info: comparisonErrors.filter(e => e.severity === 'info'),
        };

        html += '<h3>📊 Kết Quả So Sánh HÓA ĐƠN vs JSON:</h3>';
        html += '<div class="comparison-summary">';
        html += `
            <div class="comparison-stat ${errorsByType.error.length > 0 ? 'error' : 'success'}">
                <div class="stat-value">${errorsByType.error.length}</div>
                <div class="stat-label">❌ Lỗi Nghiêm Trọng</div>
            </div>
            <div class="comparison-stat ${errorsByType.warning.length > 0 ? 'warning' : 'success'}">
                <div class="stat-value">${errorsByType.warning.length}</div>
                <div class="stat-label">⚠️ Cảnh Báo</div>
            </div>
            <div class="comparison-stat info">
                <div class="stat-value">${errorsByType.info.length}</div>
                <div class="stat-label">ℹ️ Thông Tin</div>
            </div>
        `;
        html += '</div>';

        // Chi tiết từng lỗi
        html += '<h4>Chi Tiết:</h4>';
        html += '<div class="error-list">';

        comparisonErrors.forEach(error => {
            const errorClass = error.severity === 'error' ? 'error-price' :
                error.severity === 'warning' ? 'error-qty' : 'error-info';

            html += `
                <div class="error-item ${errorClass}">
                    <div class="error-header">
                        <span>${error.message}</span>
                    </div>
                    <div class="error-details">
                        ${error.json ? `
                            <div class="error-detail">
                                <span class="detail-label">JSON</span>
                                <span class="detail-value">SL: ${error.json.qty} | Tiền: ${formatCurrency(error.json.amount)}</span>
                            </div>
                        ` : ''}
                        ${error.ai ? `
                            <div class="error-detail">
                                <span class="detail-label">Hóa đơn</span>
                                <span class="detail-value">SL: ${error.ai.qty} | Tiền: ${formatCurrency(error.ai.amount)}</span>
                            </div>
                        ` : ''}
                        ${error.difference !== undefined && error.code !== 'TOTAL' ? `
                            <div class="error-detail">
                                <span class="detail-label">Chênh lệch</span>
                                <span class="detail-value">${typeof error.difference === 'number' && error.difference > 1000 ? formatCurrency(error.difference) : error.difference}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        });
        html += '</div>';

        // Bảng so sánh tổng hợp
        html += generateComparisonTable(aiAnalysisResult, currentInvoiceData);

    } else if (internalErrors.length === 0) {
        html += '<div style="text-align: center; padding: 40px;">';
        html += '<h3 style="color: #059669;">✅ KHỚP HOÀN TOÀN!</h3>';
        html += '<p style="color: #6b7280;">Hóa đơn viết tay khớp với JSON</p>';
        html += '</div>';
    }

    elements.comparisonResult.innerHTML = html;

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// =====================================================
// GENERATE COMPARISON TABLE
// =====================================================
function generateComparisonTable(aiResult, jsonData) {
    if (!aiResult || !jsonData) return '';

    const jsonGrouped = groupOrderLinesByCode(jsonData.OrderLines || []);
    const aiGrouped = {};
    (aiResult.products || []).forEach(p => {
        const code = normalizeProductCode(p.code);
        if (!code) return;
        if (!aiGrouped[code]) {
            aiGrouped[code] = { qty: 0, amount: 0 };
        }
        aiGrouped[code].qty += p.quantity || 0;
        aiGrouped[code].amount += p.total || 0;
    });

    const allCodes = new Set([...Object.keys(aiGrouped), ...Object.keys(jsonGrouped)]);

    let html = '<h4>📋 Bảng So Sánh Chi Tiết:</h4>';
    html += '<table class="comparison-table" style="width:100%;border-collapse:collapse;font-size:14px;">';
    html += '<thead><tr style="background:#f3f4f6;">';
    html += '<th style="padding:8px;border:1px solid #e5e7eb;">Mã SP</th>';
    html += '<th style="padding:8px;border:1px solid #e5e7eb;">HĐ SL</th>';
    html += '<th style="padding:8px;border:1px solid #e5e7eb;">HĐ Tiền</th>';
    html += '<th style="padding:8px;border:1px solid #e5e7eb;">JSON SL</th>';
    html += '<th style="padding:8px;border:1px solid #e5e7eb;">JSON Tiền</th>';
    html += '<th style="padding:8px;border:1px solid #e5e7eb;">Trạng thái</th>';
    html += '</tr></thead><tbody>';

    allCodes.forEach(code => {
        const ai = aiGrouped[code] || { qty: 0, amount: 0 };
        const json = jsonGrouped[code] || { qty: 0, amount: 0 };

        const qtyMatch = Math.abs(ai.qty - json.qty) < 0.01;
        const amountMatch = Math.abs(ai.amount - json.amount) < 1;
        const status = qtyMatch && amountMatch ? '✅' :
            (!aiGrouped[code] ? '⚠️ Thiếu HĐ' :
                (!jsonGrouped[code] ? '❌ Thiếu JSON' : '⚠️ Lệch'));

        const rowStyle = qtyMatch && amountMatch ? '' :
            (!jsonGrouped[code] ? 'background:#fee2e2;' : 'background:#fef3c7;');

        html += `<tr style="${rowStyle}">`;
        html += `<td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">${code}</td>`;
        html += `<td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">${ai.qty || '-'}</td>`;
        html += `<td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">${ai.amount ? formatCurrency(ai.amount) : '-'}</td>`;
        html += `<td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">${json.qty || '-'}</td>`;
        html += `<td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">${json.amount ? formatCurrency(json.amount) : '-'}</td>`;
        html += `<td style="padding:8px;border:1px solid #e5e7eb;text-align:center;">${status}</td>`;
        html += '</tr>';
    });

    // Tổng
    const aiTotal = aiResult.invoice_info?.total_amount || 0;
    const jsonTotal = jsonData.AmountTotal || 0;
    html += `<tr style="background:#e5e7eb;font-weight:bold;">`;
    html += `<td style="padding:8px;border:1px solid #d1d5db;">TỔNG</td>`;
    html += `<td style="padding:8px;border:1px solid #d1d5db;text-align:right;">${aiResult.invoice_info?.total_quantity || '-'}</td>`;
    html += `<td style="padding:8px;border:1px solid #d1d5db;text-align:right;">${formatCurrency(aiTotal)}</td>`;
    html += `<td style="padding:8px;border:1px solid #d1d5db;text-align:right;">${jsonData.TotalQuantity || '-'}</td>`;
    html += `<td style="padding:8px;border:1px solid #d1d5db;text-align:right;">${formatCurrency(jsonTotal)}</td>`;
    html += `<td style="padding:8px;border:1px solid #d1d5db;text-align:center;">${Math.abs(aiTotal - jsonTotal) < 1 ? '✅' : `Lệch ${formatCurrency(jsonTotal - aiTotal)}`}</td>`;
    html += '</tr>';

    html += '</tbody></table>';

    return html;
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

// =====================================================
// LOADING UI FUNCTIONS
// =====================================================
let loadingStartTime = null;
let loadingTimerInterval = null;

function showLoading(show, message = 'Đang tải dữ liệu...') {
    if (elements.loadingInline) {
        elements.loadingInline.style.display = show ? 'block' : 'none';
    }

    if (elements.aiAnalyzeSection && show) {
        elements.aiAnalyzeSection.style.display = 'none';
    }

    if (show) {
        const loadingTitle = document.getElementById('loadingTitle');
        const loadingSubtitle = document.getElementById('loadingSubtitle');
        const progressFill = document.getElementById('progressFill');
        const ocrPreview = document.getElementById('ocrPreview');
        const loadingStats = document.getElementById('loadingStats');
        const ocrPreviewContent = document.getElementById('ocrPreviewContent');

        if (loadingTitle) loadingTitle.textContent = message;
        if (loadingSubtitle) loadingSubtitle.textContent = '0%';
        if (progressFill) progressFill.style.width = '0%';
        if (ocrPreview) ocrPreview.style.display = 'none';
        if (loadingStats) loadingStats.style.display = 'flex';
        if (ocrPreviewContent) ocrPreviewContent.textContent = '';

        ['step1', 'step2', 'step3'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.className = 'loading-step-inline';
        });

        loadingStartTime = Date.now();
        loadingTimerInterval = setInterval(updateLoadingTimer, 100);
    } else {
        if (loadingTimerInterval) {
            clearInterval(loadingTimerInterval);
            loadingTimerInterval = null;
        }
    }
}

function updateLoadingTimer() {
    if (loadingStartTime) {
        const elapsed = ((Date.now() - loadingStartTime) / 1000).toFixed(1);
        const el = document.getElementById('statTime');
        if (el) el.textContent = elapsed + 's';
    }
}

function setLoadingStep(step, status = 'active') {
    const stepEl = document.getElementById(`step${step}`);
    if (!stepEl) return;

    if (status === 'active') {
        ['step1', 'step2', 'step3'].forEach((id, index) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (index + 1 < step) {
                el.className = 'loading-step-inline completed';
            } else if (index + 1 === step) {
                el.className = 'loading-step-inline active';
            } else {
                el.className = 'loading-step-inline';
            }
        });
    } else if (status === 'completed') {
        stepEl.className = 'loading-step-inline completed';
    }
}

function setLoadingProgress(percent) {
    const progressFill = document.getElementById('progressFill');
    const loadingSubtitle = document.getElementById('loadingSubtitle');
    if (progressFill) progressFill.style.width = `${percent}%`;
    if (loadingSubtitle) loadingSubtitle.textContent = `${Math.round(percent)}%`;
}

function setLoadingStatus(title, subtitle = '') {
    const t = document.getElementById('loadingTitle');
    const s = document.getElementById('loadingSubtitle');
    if (t) t.textContent = title;
    if (s && subtitle) s.textContent = subtitle;
}

function showOCRPreview(text, engine = 'Google Vision') {
    const preview = document.getElementById('ocrPreview');
    const content = document.getElementById('ocrPreviewContent');
    const label = document.getElementById('ocrEngineLabel');

    if (preview) preview.style.display = 'block';
    if (label) label.textContent = engine;

    const previewText = text.length > 1000 ? text.substring(0, 1000) + '...' : text;
    if (content) {
        content.textContent = previewText;
        content.classList.add('streaming');
        setTimeout(() => content.classList.remove('streaming'), 500);
    }

    const stats = document.getElementById('loadingStats');
    const chars = document.getElementById('statChars');
    if (stats) stats.style.display = 'flex';
    if (chars) chars.textContent = text.length.toLocaleString();
}

function showNotification(message, type = 'info') {
    if (type === 'error') {
        alert('❌ ' + message);
    } else if (type === 'success') {
        showToast('✅ ' + message, 'success');
        console.log('[SUCCESS]', message);
    } else {
        showToast('ℹ️ ' + message, 'info');
        console.log('[INFO]', message);
    }
}

function showToast(message, type = 'info') {
    const existingToast = document.getElementById('toast-notification');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.id = 'toast-notification';
    toast.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        z-index: 10000;
        animation: toastSlideUp 0.3s ease;
        max-width: 90%;
        text-align: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        ${type === 'success' ? 'background: #10b981; color: white;' :
            type === 'error' ? 'background: #ef4444; color: white;' :
                'background: #3b82f6; color: white;'}
    `;
    toast.textContent = message;

    if (!document.getElementById('toast-style')) {
        const style = document.createElement('style');
        style.id = 'toast-style';
        style.textContent = `
            @keyframes toastSlideUp {
                from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                to { opacity: 1; transform: translateX(-50%) translateY(0); }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function clearAll() {
    elements.invoiceUrl.value = '';
    elements.imagesSection.style.display = 'block';
    elements.dataSection.style.display = 'none';
    elements.resultSection.style.display = 'none';
    elements.invoiceImages.innerHTML = '';
    if (elements.aiAnalyzeSection) elements.aiAnalyzeSection.style.display = 'none';
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
            if (!file.type.startsWith('image/')) continue;

            const base64 = await window.DeepSeekAI.fileToBase64(file);
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

        if (uploadedImages.length > 0) {
            if (elements.aiAnalyzeSection) elements.aiAnalyzeSection.style.display = 'flex';
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

    const dropZone = document.getElementById('dropZone');
    if (dropZone) {
        if (uploadedImages.length > 0) {
            dropZone.classList.add('has-images');
        } else {
            dropZone.classList.remove('has-images');
        }
    }

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

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    document.querySelectorAll('.btn-remove-image').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.currentTarget.dataset.index);
            uploadedImages.splice(index, 1);
            displayUploadedImages();
            if (uploadedImages.length === 0) {
                if (elements.aiAnalyzeSection) elements.aiAnalyzeSection.style.display = 'none';
            }
        });
    });
}

// =====================================================
// EVENT HANDLERS
// =====================================================
elements.imageUpload.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
        handleImageUpload(files);
    }
});

const dropZone = document.getElementById('dropZone');
if (dropZone) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('drag-over');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('drag-over');
        });
    });

    dropZone.addEventListener('drop', (e) => {
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        if (files.length > 0) {
            handleImageUpload(files);
        }
    });

    dropZone.addEventListener('click', (e) => {
        if (e.target.tagName !== 'LABEL' && !e.target.closest('label')) {
            elements.imageUpload.click();
        }
    });
}

// Paste Image
document.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItems = [];
    for (const item of items) {
        if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) imageItems.push(file);
        }
    }

    if (imageItems.length > 0) {
        e.preventDefault();
        await handleImageUpload(imageItems);
    }
});

// AI Analysis Button
let isAnalyzing = false;
elements.btnAnalyzeWithAI.addEventListener('click', async () => {
    if (isAnalyzing) return;
    isAnalyzing = true;
    elements.btnAnalyzeWithAI.disabled = true;
    elements.btnAnalyzeWithAI.style.opacity = '0.6';

    try {
        await analyzeImagesWithAI();

        const url = elements.invoiceUrl.value.trim();
        if (url && aiAnalysisResult) {
            try {
                const invoiceId = extractInvoiceId(url);
                await fetchInvoiceData(invoiceId);

                const internalErrors = validateInternalConsistency(currentInvoiceData);
                const comparisonErrors = compareAIWithJSON(aiAnalysisResult, currentInvoiceData);
                displayComparisonResult(internalErrors, comparisonErrors);
            } catch (fetchError) {
                console.error('[AI] Error fetching TPOS data:', fetchError);
                showNotification('Lỗi tải dữ liệu TPOS: ' + fetchError.message, 'error');
            }
        }
    } finally {
        isAnalyzing = false;
        elements.btnAnalyzeWithAI.disabled = false;
        elements.btnAnalyzeWithAI.style.opacity = '1';
    }
});

if (elements.btnFetchInvoice) {
    elements.btnFetchInvoice.addEventListener('click', async () => {
        try {
            const url = elements.invoiceUrl.value.trim();
            if (!url) {
                showNotification('Vui lòng nhập URL hóa đơn', 'error');
                return;
            }

            const invoiceId = extractInvoiceId(url);
            await fetchInvoiceData(invoiceId);

            const internalErrors = validateInternalConsistency(currentInvoiceData);

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
}

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
    console.log('[INVOICE-COMPARE] Initialized with enhanced comparison logic');

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Log API status
    if (window.DeepSeekAI) {
        console.log('[INVOICE-COMPARE] DeepSeek AI:', window.DeepSeekAI.getStats());
    }
});
