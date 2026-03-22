/**
 * DOI SOAT - Product Reconciliation App
 * Quét mã đối soát sản phẩm
 */
(function () {
    'use strict';

    // =====================================================
    // STATE
    // =====================================================
    let currentOrder = null;       // Current order data from API
    let checkedQuantities = {};    // { productBarcode: checkedQty }

    // =====================================================
    // DOM REFERENCES
    // =====================================================
    const $ = (sel) => document.querySelector(sel);
    const scannerPage = $('#scannerPage');
    const reconcilePage = $('#reconcilePage');
    const invoiceCodeInput = $('#invoiceCodeInput');
    const searchBtn = $('#searchBtn');
    const backBtn = $('#backBtn');
    const saveBtn = $('#saveBtn');
    const productBarcodeInput = $('#productBarcodeInput');
    const productScanBtn = $('#productScanBtn');
    const productTableBody = $('#productTableBody');

    // =====================================================
    // API
    // =====================================================
    async function getToken() {
        // Try tokenManager first (managed by token-manager.js)
        if (window.tokenManager && typeof window.tokenManager.getToken === 'function') {
            try {
                return await window.tokenManager.getToken();
            } catch (e) {
                console.warn('[DOI-SOAT] tokenManager.getToken failed:', e);
            }
        }

        // Fallback: try localStorage
        try {
            const companyId = window.ShopConfig?.getConfig?.()?.CompanyId || 1;
            const key = 'bearer_token_data_' + companyId;
            const stored = localStorage.getItem(key);
            if (stored) {
                const data = JSON.parse(stored);
                if (data.access_token) return data.access_token;
            }
        } catch (e) { /* ignore */ }

        return null;
    }

    async function fetchOrderByNumber(number) {
        const token = await getToken();
        if (!token) {
            throw new Error('Không có token xác thực. Vui lòng đăng nhập lại.');
        }

        const companyId = window.ShopConfig?.getConfig?.()?.CompanyId || 1;
        const baseUrl = (window.TPOS_CONFIG && window.TPOS_CONFIG.tposBaseUrl) || 'https://tomato.tpos.vn';

        const url = `${baseUrl}/odata/FastSaleOrder/ODataService.GetDataCrossCheck` +
            `?$expand=Partner,User,Warehouse,Company,PriceList,RefundOrder,Account,Journal,PaymentJournal,Carrier,Tax,SaleOrder,OrderLines($expand=Product,ProductUOM,Account,SaleLine,User),Ship_ServiceExtras,Team` +
            `&number=${encodeURIComponent(number)}&companyId=${companyId}`;

        const resp = await fetch(url, {
            method: 'GET',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'content-type': 'application/json;charset=utf-8',
                'authorization': `Bearer ${token}`,
                'cache-control': 'no-cache'
            }
        });

        if (!resp.ok) {
            throw new Error(`Lỗi ${resp.status}: ${resp.statusText}`);
        }

        return await resp.json();
    }

    // =====================================================
    // PAGE NAVIGATION
    // =====================================================
    function showPage(page) {
        scannerPage.classList.remove('active');
        reconcilePage.classList.remove('active');
        page.classList.add('active');
    }

    function goBack() {
        currentOrder = null;
        checkedQuantities = {};
        showPage(scannerPage);
        invoiceCodeInput.value = '';
        invoiceCodeInput.focus();
    }

    // =====================================================
    // RENDER ORDER DATA
    // =====================================================
    function renderOrder(data) {
        currentOrder = data;
        checkedQuantities = {};

        // Header info
        $('#orderNumber').textContent = data.Number || data.MoveName || '';
        $('#orderStatus').textContent = data.ShowState || '';
        $('#scannedCode').textContent = data.Number || data.MoveName || '';
        $('#customerName').textContent = data.PartnerDisplayName || '';
        $('#companyName').textContent = data.CompanyName || '';

        // Init checked quantities to 0
        if (data.OrderLines) {
            data.OrderLines.forEach(line => {
                const barcode = extractBarcode(line);
                if (barcode) {
                    checkedQuantities[barcode] = 0;
                }
            });
        }

        renderProductTable();
        updateSaveButton();
        renderOrderDetail(data);
        showPage(reconcilePage);

        // Focus on product barcode input
        setTimeout(() => productBarcodeInput.focus(), 100);
    }

    function extractBarcode(line) {
        // Extract barcode from ProductBarcode field or from [] in Name
        if (line.ProductBarcode) return line.ProductBarcode.toUpperCase();

        const match = (line.Name || line.ProductNameGet || '').match(/\[([^\]]+)\]/);
        return match ? match[1].toUpperCase() : null;
    }

    function renderProductTable() {
        if (!currentOrder || !currentOrder.OrderLines) {
            productTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">Không có sản phẩm</td></tr>';
            return;
        }

        let totalChecked = 0;
        let totalRequired = 0;
        let totalAmount = 0;

        const rows = currentOrder.OrderLines.map((line, idx) => {
            const barcode = extractBarcode(line);
            const totalQty = line.ProductUOMQty || 1;
            const checkedQty = barcode ? (checkedQuantities[barcode] || 0) : 0;
            const isDone = checkedQty >= totalQty;
            const price = line.PriceUnit || 0;
            const lineTotal = line.PriceTotal || (price * totalQty);

            totalChecked += checkedQty;
            totalRequired += Math.floor(totalQty);
            totalAmount += lineTotal;

            return `<tr class="${isDone ? 'checked' : ''}">
                <td>${idx + 1}</td>
                <td>${line.Name || line.ProductNameGet || ''}</td>
                <td>
                    <span class="qty-display">
                        <span class="${checkedQty > 0 ? 'qty-checked' : 'qty-unchecked'}">${checkedQty}</span>/${Math.floor(totalQty)}
                    </span>
                </td>
                <td>${formatNumber(price)}</td>
                <td>${formatNumber(lineTotal)}</td>
                <td>
                    <span class="status-cell">
                        <span class="status-dot ${isDone ? 'green' : 'red'}"></span>
                        <span class="${isDone ? 'status-text-green' : 'status-text-red'}">${isDone ? 'Đủ' : 'Chưa đủ'}</span>
                    </span>
                </td>
            </tr>`;
        });

        const allDone = totalChecked >= totalRequired;
        rows.push(`<tr class="summary-row">
            <td colspan="2"><strong>Tổng cộng</strong></td>
            <td>
                <span class="qty-display">
                    <strong><span class="${allDone ? 'qty-checked' : 'qty-unchecked'}">${totalChecked}</span>/${totalRequired}</strong>
                </span>
            </td>
            <td></td>
            <td><strong>${formatNumber(totalAmount)}</strong></td>
            <td>
                <span class="status-cell">
                    <span class="status-dot ${allDone ? 'green' : 'red'}"></span>
                    <span class="${allDone ? 'status-text-green' : 'status-text-red'}">${allDone ? 'Đủ tất cả' : 'Chưa đủ'}</span>
                </span>
            </td>
        </tr>`);

        productTableBody.innerHTML = rows.join('');
    }

    function isAllChecked() {
        if (!currentOrder || !currentOrder.OrderLines) return false;
        return currentOrder.OrderLines.every(line => {
            const barcode = extractBarcode(line);
            if (!barcode) return true;
            const totalQty = line.ProductUOMQty || 1;
            return (checkedQuantities[barcode] || 0) >= totalQty;
        });
    }

    function updateSaveButton() {
        if (isAllChecked()) {
            saveBtn.style.display = '';
        } else {
            saveBtn.style.display = 'none';
        }
    }

    function renderOrderDetail(data) {
        const detailContent = $('#orderDetailContent');
        const rows = [
            ['Mã phiếu', data.Number || data.MoveName],
            ['Trạng thái', data.ShowState],
            ['Khách hàng', data.PartnerDisplayName],
            ['SĐT', data.PartnerPhone],
            ['Địa chỉ', data.ReceiverAddress],
            ['Công ty', data.CompanyName],
            ['Nhân viên', data.UserName],
            ['Ngày tạo', formatDate(data.DateCreated)],
            ['Tổng tiền', formatNumber(data.AmountTotal)],
            ['Phí vận chuyển', formatNumber(data.DeliveryPrice)],
            ['Thu hộ (COD)', formatNumber(data.CashOnDelivery)],
            ['Đã thanh toán', formatNumber(data.PaymentAmount)],
            ['Còn lại', formatNumber(data.Residual)],
            ['Vận chuyển', data.CarrierName],
            ['Ghi chú', data.Comment],
        ];

        detailContent.innerHTML = rows
            .filter(([, val]) => val !== null && val !== undefined && val !== '')
            .map(([label, val]) => `
                <div class="detail-row">
                    <div class="detail-label">${label}</div>
                    <div class="detail-value">${val}</div>
                </div>
            `).join('');
    }

    // =====================================================
    // PRODUCT BARCODE SCANNING
    // =====================================================
    function handleProductBarcodeScan(barcode) {
        if (!barcode || !currentOrder || !currentOrder.OrderLines) return;

        const barcodeUpper = barcode.toUpperCase().trim();
        productBarcodeInput.value = '';

        // Find matching order line by barcode
        const matchedLine = currentOrder.OrderLines.find(line => {
            const lineBarcode = extractBarcode(line);
            return lineBarcode === barcodeUpper;
        });

        if (!matchedLine) {
            showToast(`Không tìm thấy sản phẩm với mã: ${barcode}`, 'error');
            return;
        }

        const lineBarcode = extractBarcode(matchedLine);
        const totalQty = matchedLine.ProductUOMQty || 1;
        const currentQty = checkedQuantities[lineBarcode] || 0;

        if (currentQty >= totalQty) {
            showToast(`${matchedLine.ProductNameGet || matchedLine.Name} - Đã đủ số lượng!`, 'warning');
            return;
        }

        // Increment quantity
        checkedQuantities[lineBarcode] = currentQty + 1;
        const newQty = checkedQuantities[lineBarcode];

        if (newQty >= totalQty) {
            showToast(`${matchedLine.ProductNameGet || matchedLine.Name} - Đủ! (${newQty}/${Math.floor(totalQty)})`, 'success');
        } else {
            showToast(`${matchedLine.ProductNameGet || matchedLine.Name} - ${newQty}/${Math.floor(totalQty)}`, 'info');
        }

        renderProductTable();
        updateSaveButton();
        productBarcodeInput.focus();
    }

    // =====================================================
    // SAVE (CrossCheck)
    // =====================================================
    async function handleSave() {
        if (!currentOrder || !isAllChecked()) return;

        const overlay = showLoading();

        try {
            const token = await getToken();
            if (!token) {
                showToast('Không có token xác thực. Vui lòng đăng nhập lại.', 'error');
                return;
            }

            // Build contents array: "[CODE] PRODUCT_NAME: checked/total"
            const contents = currentOrder.OrderLines.map(line => {
                const barcode = extractBarcode(line);
                const totalQty = Math.floor(line.ProductUOMQty || 1);
                const checkedQty = barcode ? (checkedQuantities[barcode] || 0) : 0;
                const name = line.Name || line.ProductNameGet || '';
                return `${name}: ${checkedQty}/${totalQty}`;
            });

            const baseUrl = (window.TPOS_CONFIG && window.TPOS_CONFIG.tposBaseUrl) || 'https://tomato.tpos.vn';
            const url = `${baseUrl}/odata/FastSaleOrder/ODataService.CrossCheckAndOpenOrder?fastSaleOrderId=${currentOrder.Id}`;

            const resp = await fetch(url, {
                method: 'POST',
                headers: {
                    'accept': 'application/json, text/plain, */*',
                    'content-type': 'application/json;charset=UTF-8',
                    'authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    model: {
                        IsOk: true,
                        Contents: contents
                    }
                })
            });

            if (!resp.ok) {
                throw new Error(`Lỗi ${resp.status}: ${resp.statusText}`);
            }

            const result = await resp.json();

            if (result.Success) {
                showToast('Đối soát thành công!', 'success');
                // Go back to scanner page after short delay
                setTimeout(() => {
                    goBack();
                }, 1000);
            } else {
                showToast(`Lỗi: ${result.Error || 'Không xác định'}`, 'error');
            }
        } catch (err) {
            console.error('Save error:', err);
            showToast(`Lỗi lưu: ${err.message}`, 'error');
        } finally {
            hideLoading(overlay);
        }
    }

    // =====================================================
    // INVOICE SEARCH
    // =====================================================
    async function handleInvoiceSearch() {
        const code = invoiceCodeInput.value.trim();
        if (!code) {
            showToast('Vui lòng nhập mã phiếu bán hàng', 'error');
            invoiceCodeInput.focus();
            return;
        }

        // Show loading
        const overlay = showLoading();

        try {
            const data = await fetchOrderByNumber(code);

            if (data.Error) {
                showToast(`Lỗi: ${data.Error}`, 'error');
                return;
            }

            if (!data.OrderLines || data.OrderLines.length === 0) {
                showToast('Không tìm thấy sản phẩm trong phiếu', 'warning');
                return;
            }

            renderOrder(data);
        } catch (err) {
            console.error('Fetch error:', err);
            showToast(`Lỗi kết nối: ${err.message}`, 'error');
        } finally {
            hideLoading(overlay);
        }
    }

    // =====================================================
    // TABS
    // =====================================================
    function initTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                // Remove active from all tabs
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

                btn.classList.add('active');
                const targetId = btn.getAttribute('data-tab');
                const target = document.getElementById(targetId);
                if (target) target.classList.add('active');
            });
        });
    }

    // =====================================================
    // UTILITIES
    // =====================================================
    function formatNumber(num) {
        if (num === null || num === undefined) return '';
        return Number(num).toLocaleString('vi-VN');
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr);
            return d.toLocaleString('vi-VN');
        } catch {
            return dateStr;
        }
    }

    function showToast(message, type = 'info') {
        const toast = $('#toast');
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    function showLoading() {
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = '<div class="spinner"></div>';
        document.body.appendChild(overlay);
        return overlay;
    }

    function hideLoading(overlay) {
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
    }

    // =====================================================
    // EVENT LISTENERS
    // =====================================================
    function init() {
        // Search invoice
        searchBtn.addEventListener('click', handleInvoiceSearch);
        invoiceCodeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleInvoiceSearch();
            }
        });

        // Back button
        backBtn.addEventListener('click', goBack);

        // Save button
        saveBtn.addEventListener('click', handleSave);

        // Product barcode scan
        productScanBtn.addEventListener('click', () => {
            handleProductBarcodeScan(productBarcodeInput.value);
        });
        productBarcodeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleProductBarcodeScan(productBarcodeInput.value);
            }
        });

        // Tabs
        initTabs();

        // Init Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                if (typeof lucide !== 'undefined') lucide.createIcons();
            });
        }

        // Global keyboard capture: auto-focus the active input when typing anywhere
        document.addEventListener('keydown', (e) => {
            // Ignore if already in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            // Ignore modifier keys and special keys
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            if (e.key.length !== 1 && e.key !== 'Enter') return;

            const activeInput = scannerPage.classList.contains('active')
                ? invoiceCodeInput
                : productBarcodeInput;

            activeInput.focus();
        });

        // Focus input
        invoiceCodeInput.focus();
    }

    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
