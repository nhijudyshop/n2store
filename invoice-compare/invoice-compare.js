/* =====================================================
   INVOICE COMPARE - MAIN SCRIPT
   So sánh đơn hàng từ TPOS với hóa đơn
   ===================================================== */

// Configuration
const CONFIG = {
    CLOUDFLARE_PROXY: 'https://chatomni-proxy.nhijudyshop.workers.dev',
    TPOS_AUTH_TOKEN: null, // Will be fetched dynamically
};

// Global state
let currentInvoiceData = null;
let currentInvoiceId = null;

// =====================================================
// DOM ELEMENTS
// =====================================================
const elements = {
    invoiceUrl: document.getElementById('invoiceUrl'),
    btnFetchInvoice: document.getElementById('btnFetchInvoice'),
    btnClear: document.getElementById('btnClear'),
    btnRefresh: document.getElementById('btnRefresh'),
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
// AUTHENTICATION - GET TPOS TOKEN
// =====================================================
async function getTPOSToken() {
    try {
        // Retrieve saved credentials
        const savedCreds = localStorage.getItem('tpos_credentials');
        if (!savedCreds) {
            throw new Error('Vui lòng đăng nhập TPOS trước');
        }

        const creds = JSON.parse(savedCreds);

        const response = await fetch(`${CONFIG.CLOUDFLARE_PROXY}/api/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'password',
                username: creds.username,
                password: creds.password,
                client_id: 'tmtWebApp',
            }),
        });

        if (!response.ok) {
            throw new Error('Không thể lấy token TPOS');
        }

        const data = await response.json();
        CONFIG.TPOS_AUTH_TOKEN = data.access_token;
        return data.access_token;
    } catch (error) {
        console.error('Error getting TPOS token:', error);
        showNotification('Lỗi xác thực TPOS: ' + error.message, 'error');
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

        // Get token if not available
        if (!CONFIG.TPOS_AUTH_TOKEN) {
            await getTPOSToken();
        }

        // Build API URL
        const apiUrl = `${CONFIG.CLOUDFLARE_PROXY}/api/odata/FastPurchaseOrder(${invoiceId})?$expand=Partner,PickingType,Company,Journal,Account,User,RefundOrder,PaymentJournal,Tax,OrderLines($expand=Product,ProductUOM,Account),DestConvertCurrencyUnit`;

        console.log('[FETCH] Fetching invoice data:', apiUrl);

        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Authorization': `Bearer ${CONFIG.TPOS_AUTH_TOKEN}`,
                'tposappversion': '5.11.16.1',
                'x-tpos-lang': 'vi',
            },
        });

        if (!response.ok) {
            if (response.status === 401) {
                // Token expired, retry once
                await getTPOSToken();
                return fetchInvoiceData(invoiceId);
            }
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
    // Show sections
    elements.dataSection.style.display = 'block';
    elements.imagesSection.style.display = 'none'; // Will implement later

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
    elements.imagesSection.style.display = 'none';
    elements.dataSection.style.display = 'none';
    elements.resultSection.style.display = 'none';
    currentInvoiceData = null;
    currentInvoiceId = null;
}

// =====================================================
// EVENT HANDLERS
// =====================================================
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
        displayComparisonResult(internalErrors, []);

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
