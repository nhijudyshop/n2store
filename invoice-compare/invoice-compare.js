/* =====================================================
   INVOICE COMPARE - MAIN SCRIPT
   So sánh đơn hàng từ TPOS với hóa đơn
   ===================================================== */

// Use global CONFIG from config.js (with fallback support)
// Fallback to default if config.js not loaded
const INVOICE_CONFIG = window.CONFIG || {
    CLOUDFLARE_PROXY: 'https://chatomni-proxy.nhijudyshop.workers.dev',
    get API_BASE_URL() { return this.CLOUDFLARE_PROXY; },
    smartFetch: (url, options) => fetch(url, options)
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
    aiAnalyzeSection: document.getElementById('aiAnalyzeSection'),
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
        const apiUrl = `${INVOICE_CONFIG.API_BASE_URL}/api/odata/FastPurchaseOrder(${invoiceId})?$expand=Partner,PickingType,Company,Journal,Account,User,RefundOrder,PaymentJournal,Tax,OrderLines($expand=Product,ProductUOM,Account),DestConvertCurrencyUnit`;

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
                        ${error.ai ? `
                            <div class="error-detail">
                                <span class="detail-label">Hóa đơn (OCR) SL</span>
                                <span class="detail-value">${error.ai.qty}</span>
                            </div>
                            <div class="error-detail">
                                <span class="detail-label">Hóa đơn (OCR) Tiền</span>
                                <span class="detail-value">${formatCurrency(error.ai.amount)}</span>
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

// =====================================================
// ENHANCED LOADING UI
// =====================================================

let loadingStartTime = null;
let loadingTimerInterval = null;

function showLoading(show, message = 'Đang tải dữ liệu...') {
    elements.loadingOverlay.style.display = show ? 'flex' : 'none';

    if (show) {
        // Reset UI
        document.getElementById('loadingTitle').textContent = message;
        document.getElementById('loadingSubtitle').textContent = 'Vui lòng chờ trong giây lát';
        document.getElementById('progressFill').style.width = '0%';
        document.getElementById('ocrPreview').style.display = 'none';
        document.getElementById('aiPreview').style.display = 'none';
        document.getElementById('loadingStats').style.display = 'none';
        document.getElementById('ocrPreviewContent').textContent = '';
        document.getElementById('aiPreviewContent').textContent = '';

        // Reset steps
        ['step1', 'step2', 'step3'].forEach(id => {
            document.getElementById(id).className = 'loading-step';
        });

        // Start timer
        loadingStartTime = Date.now();
        loadingTimerInterval = setInterval(updateLoadingTimer, 100);

        // Re-init lucide icons
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } else {
        // Stop timer
        if (loadingTimerInterval) {
            clearInterval(loadingTimerInterval);
            loadingTimerInterval = null;
        }
    }
}

function updateLoadingTimer() {
    if (loadingStartTime) {
        const elapsed = ((Date.now() - loadingStartTime) / 1000).toFixed(1);
        document.getElementById('statTime').textContent = elapsed + 's';
    }
}

function setLoadingStep(step, status = 'active') {
    const stepEl = document.getElementById(`step${step}`);
    if (!stepEl) return;

    // Reset all steps first for 'active' status
    if (status === 'active') {
        ['step1', 'step2', 'step3'].forEach((id, index) => {
            const el = document.getElementById(id);
            if (index + 1 < step) {
                el.className = 'loading-step completed';
            } else if (index + 1 === step) {
                el.className = 'loading-step active';
            } else {
                el.className = 'loading-step';
            }
        });
    } else if (status === 'completed') {
        stepEl.className = 'loading-step completed';
    }
}

function setLoadingProgress(percent) {
    document.getElementById('progressFill').style.width = `${percent}%`;
}

function setLoadingStatus(title, subtitle = '') {
    document.getElementById('loadingTitle').textContent = title;
    if (subtitle) {
        document.getElementById('loadingSubtitle').textContent = subtitle;
    }
}

function showOCRPreview(text, engine = 'Google Vision') {
    const preview = document.getElementById('ocrPreview');
    const content = document.getElementById('ocrPreviewContent');
    const label = document.getElementById('ocrEngineLabel');

    preview.style.display = 'block';
    label.textContent = engine;

    // Truncate for preview
    const previewText = text.length > 1000 ? text.substring(0, 1000) + '...' : text;
    content.textContent = previewText;
    content.classList.add('streaming');

    // Update stats
    document.getElementById('loadingStats').style.display = 'flex';
    document.getElementById('statChars').textContent = text.length.toLocaleString();

    // Remove streaming cursor after a moment
    setTimeout(() => content.classList.remove('streaming'), 500);
}

function showAIPreview(text) {
    const preview = document.getElementById('aiPreview');
    const content = document.getElementById('aiPreviewContent');

    preview.style.display = 'block';

    // Truncate for preview
    const previewText = text.length > 500 ? text.substring(0, 500) + '...' : text;
    content.textContent = previewText;
}

function showNotification(message, type = 'info') {
    // Only show alert for errors - use console for success/info
    if (type === 'error') {
        alert('❌ ' + message);
    } else if (type === 'success') {
        // Show toast notification instead of alert
        showToast('✅ ' + message, 'success');
        console.log('[SUCCESS]', message);
    } else {
        showToast('ℹ️ ' + message, 'info');
        console.log('[INFO]', message);
    }
}

// Toast notification (non-blocking)
function showToast(message, type = 'info') {
    // Remove existing toast
    const existingToast = document.getElementById('toast-notification');
    if (existingToast) {
        existingToast.remove();
    }

    // Create toast element
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

    // Add animation style if not exists
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

    // Auto remove after 3 seconds
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
            if (!file.type.startsWith('image/')) {
                continue;
            }

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

        // Show AI analysis button
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

    // Update drop zone state
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
                if (elements.aiAnalyzeSection) elements.aiAnalyzeSection.style.display = 'none';
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
        if (uploadedImages.length === 0) {
            throw new Error('Chưa có ảnh nào được tải lên');
        }

        if (!window.DeepSeekAI || !window.DeepSeekAI.isConfigured()) {
            throw new Error('DeepSeek API chưa được cấu hình. Vui lòng kiểm tra API key.');
        }

        const ocrEngine = window.DeepSeekAI.getCurrentOCREngine
            ? window.DeepSeekAI.getCurrentOCREngine()
            : (window.DeepSeekAI.isGoogleVisionConfigured() ? 'Google Cloud Vision' : 'DeepSeek-OCR');

        console.log('[AI-ANALYSIS] Starting analysis with', uploadedImages.length, 'images');
        console.log('[AI-ANALYSIS] OCR Engine:', ocrEngine);

        // Initialize loading UI
        showLoading(true, 'Bắt đầu phân tích...');
        setLoadingStep(1, 'active');
        setLoadingProgress(10);
        setLoadingStatus('Đang trích xuất text từ ảnh', `Sử dụng ${ocrEngine}`);

        const image = uploadedImages[0];

        // Step 1: OCR - Extract text
        setLoadingProgress(20);

        // Custom OCR with preview
        const imageData = `data:${image.mimeType};base64,${image.base64}`;
        let extractedText;

        try {
            extractedText = await window.DeepSeekAI.extractTextFromImage(imageData, image.mimeType);
            setLoadingProgress(50);
            setLoadingStep(1, 'completed');

            // Show OCR result preview
            showOCRPreview(extractedText, ocrEngine);

        } catch (ocrError) {
            throw new Error('OCR thất bại: ' + ocrError.message);
        }

        if (!extractedText || extractedText.trim().length < 10) {
            throw new Error('OCR không thể trích xuất đủ text từ ảnh.');
        }

        // Step 2: AI Analysis
        setLoadingStep(2, 'active');
        setLoadingProgress(60);
        setLoadingStatus('Đang phân tích với AI', 'DeepSeek đang xử lý dữ liệu...');

        // Create analysis prompt
        const analysisPrompt = `Dưới đây là text được trích xuất từ hình ảnh hóa đơn bằng OCR:

--- BẮT ĐẦU TEXT TỪ ẢNH ---
${extractedText}
--- KẾT THÚC TEXT TỪ ẢNH ---

${AI_ANALYSIS_PROMPT}`;

        setLoadingProgress(70);

        const result = await window.DeepSeekAI.callDeepSeekAPI([
            { role: 'user', content: analysisPrompt }
        ]);

        setLoadingProgress(90);

        // Show AI result preview
        showAIPreview(result);

        // Step 3: Complete
        setLoadingStep(3, 'active');
        setLoadingProgress(100);
        setLoadingStatus('Hoàn tất!', 'Đang hiển thị kết quả...');

        // Small delay to show completion
        await new Promise(r => setTimeout(r, 500));

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
        // Check if rawText is valid
        if (!rawText || typeof rawText !== 'string') {
            throw new Error('AI không trả về kết quả. Vui lòng thử lại.');
        }

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

// Drop Zone - Drag & Drop support
const dropZone = document.getElementById('dropZone');
if (dropZone) {
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    // Highlight drop zone when dragging over
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

    // Handle dropped files
    dropZone.addEventListener('drop', (e) => {
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        if (files.length > 0) {
            console.log('[DROP] Received', files.length, 'image(s)');
            handleImageUpload(files);
        }
    });

    // Click on drop zone to open file picker
    dropZone.addEventListener('click', (e) => {
        if (e.target.tagName !== 'LABEL' && !e.target.closest('label')) {
            elements.imageUpload.click();
        }
    });
}

// Paste Image (Ctrl+V)
document.addEventListener('paste', async (e) => {
    // Check if clipboard has image data
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItems = [];
    for (const item of items) {
        if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
                imageItems.push(file);
            }
        }
    }

    if (imageItems.length > 0) {
        e.preventDefault();
        console.log('[PASTE] Received', imageItems.length, 'image(s) from clipboard');
        await handleImageUpload(imageItems);
    }
});

// AI Analysis Button - with debounce to prevent spam clicking
let isAnalyzing = false;
elements.btnAnalyzeWithAI.addEventListener('click', async () => {
    if (isAnalyzing) {
        console.log('[AI] Analysis already in progress, ignoring click');
        return;
    }
    isAnalyzing = true;
    elements.btnAnalyzeWithAI.disabled = true;
    elements.btnAnalyzeWithAI.style.opacity = '0.6';

    try {
        await analyzeImagesWithAI();
    } finally {
        isAnalyzing = false;
        elements.btnAnalyzeWithAI.disabled = false;
        elements.btnAnalyzeWithAI.style.opacity = '1';
    }
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
// API KEY MANAGEMENT (Helper Functions)
// =====================================================

/**
 * Set Gemini API keys in localStorage
 * Usage in browser console:
 *   setGeminiKeys('key1,key2,key3')
 * or
 *   setGeminiKeys(['key1', 'key2', 'key3'])
 */
window.setGeminiKeys = function (keys) {
    const keyString = Array.isArray(keys) ? keys.join(',') : keys;
    localStorage.setItem('gemini_api_keys', keyString);
    window.GEMINI_KEYS = keyString;
    console.log('[API-KEYS] ✅ Gemini API keys saved successfully');
    console.log('[API-KEYS] Keys count:', keyString.split(',').filter(k => k.trim()).length);
    return true;
};

/**
 * Add free keys with Pro key as fallback
 * Usage in browser console:
 *   addFreeKeys('free_key_1,free_key_2')
 * or
 *   addFreeKeys(['free_key_1', 'free_key_2'])
 */
window.addFreeKeys = function (freeKeys) {
    const freeKeyArray = Array.isArray(freeKeys)
        ? freeKeys
        : freeKeys.split(',').map(k => k.trim()).filter(k => k);

    // Pro key is always last (fallback)
    const proKey = window.GEMINI_PRO_KEY || 'AIzaSyAQtOsL4Iir7MpLBwaNjIll1I_bQDfHobs';

    // Combine: free keys first, pro key last
    const allKeys = [...freeKeyArray, proKey];
    const keyString = allKeys.join(',');

    localStorage.setItem('gemini_api_keys', keyString);
    window.GEMINI_KEYS = keyString;

    console.log('[API-KEYS] ✅ Keys configured:');
    console.log('[API-KEYS]   - Free keys:', freeKeyArray.length);
    console.log('[API-KEYS]   - Pro key: 1 (fallback)');
    console.log('[API-KEYS]   - Total:', allKeys.length);
    return true;
};

/**
 * Get current Gemini API keys
 */
window.getGeminiKeys = function () {
    const keys = localStorage.getItem('gemini_api_keys') || '';
    const keyList = keys.split(',').filter(k => k.trim());
    console.log('[API-KEYS] Current keys count:', keyList.length);
    return keyList;
};

/**
 * Clear Gemini API keys
 */
window.clearGeminiKeys = function () {
    localStorage.removeItem('gemini_api_keys');
    window.GEMINI_KEYS = '';
    console.log('[API-KEYS] ✅ API keys cleared');
    return true;
};

// =====================================================
// INITIALIZATION
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('[INVOICE-COMPARE] Initialized');

    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Display API key status
    const keysCount = (window.GEMINI_KEYS || '').split(',').filter(k => k.trim()).length;
    if (keysCount === 0) {
        console.warn('[API-KEYS] ⚠️ No Gemini API keys configured');
        console.log('[API-KEYS] 💡 To set keys, run in console: setGeminiKeys("YOUR_API_KEY")');
        console.log('[API-KEYS] 📖 Get API key from: https://aistudio.google.com/apikey');
    } else {
        console.log('[API-KEYS] ✅ Gemini API keys loaded:', keysCount, 'keys');
    }
});
