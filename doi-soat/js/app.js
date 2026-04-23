// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * DOI SOAT - Product Reconciliation App
 * Quét mã đối soát sản phẩm
 */
(function () {
    'use strict';

    // =====================================================
    // STATE
    // =====================================================
    let currentOrder = null; // Current order data from API
    let checkedQuantities = {}; // { productBarcode: checkedQty }

    // =====================================================
    // SOUND
    // =====================================================
    const sounds = {
        error: new Audio('sound/loi.mp3'),
        excess: new Audio('sound/duThua.mp3'),
        allDone: new Audio('sound/daDu.mp3'),
    };

    function playSound(name) {
        const s = sounds[name];
        if (!s) return;
        s.currentTime = 0;
        s.play().catch(() => {});
    }

    // =====================================================
    // SCANNER MODE (toggle: Máy quét ON/OFF)
    // ON  = auto-clear 1s, barcode scanner mode
    // OFF = manual entry, show name input, log to Firestore
    // =====================================================
    let scannerMode = true; // true = máy quét, false = nhập tay
    let autoClearTimer = null;

    function startAutoClearTimer(input) {
        clearAutoClearTimer();
        if (!scannerMode) return;
        autoClearTimer = setTimeout(() => {
            if (input && input.value) {
                input.value = '';
            }
        }, 1000);
    }

    function clearAutoClearTimer() {
        if (autoClearTimer) {
            clearTimeout(autoClearTimer);
            autoClearTimer = null;
        }
    }

    function setScannerMode(enabled) {
        scannerMode = enabled;
        const manualRow = document.getElementById('manualEntryRow');
        if (manualRow) {
            manualRow.style.display = enabled ? 'none' : '';
        }
        if (enabled) {
            // Scanner mode: no need for manual name
        } else {
            clearAutoClearTimer();
        }
    }

    // =====================================================
    // FIRESTORE: Manual entry log (auto-delete after 30 days)
    // =====================================================
    function getManualLogCollection() {
        if (typeof firebase === 'undefined' || !firebase.firestore) return null;
        return firebase.firestore().collection('manual_crosscheck_log');
    }

    async function saveManualEntryLog(orderNumber, orderId, barcode, productName, userName, note) {
        const col = getManualLogCollection();
        if (!col) {
            console.warn('[DOI-SOAT] Firestore not available, skip manual log');
            return;
        }
        try {
            await col.add({
                orderNumber,
                orderId,
                barcode,
                productName,
                userName: userName || 'Không rõ',
                note: note || '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                expireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            });
        } catch (e) {
            console.error('[DOI-SOAT] Failed to save manual log:', e);
        }
    }

    async function cleanupManualLogs() {
        const col = getManualLogCollection();
        if (!col) return;
        try {
            const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const snap = await col.where('expireAt', '<=', cutoff).limit(50).get();
            if (snap.empty) return;
            const batch = firebase.firestore().batch();
            snap.docs.forEach((doc) => batch.delete(doc.ref));
            await batch.commit();
            console.log(`[DOI-SOAT] Cleaned up ${snap.size} expired manual logs`);
        } catch (e) {
            console.error('[DOI-SOAT] Cleanup error:', e);
        }
    }

    // =====================================================
    // REMOVE VIETNAMESE DIACRITICS
    // =====================================================
    function removeDiacritics(str) {
        return str
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D');
    }

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

        // Fallback: try localStorage (doi-soat uses dedicated key)
        try {
            const key = 'bearer_token_data_doisoat';
            const stored = localStorage.getItem(key);
            if (stored) {
                const data = JSON.parse(stored);
                if (data.access_token) return data.access_token;
            }
        } catch (e) {
            /* ignore */
        }

        return null;
    }

    async function fetchOrderByNumber(number) {
        const token = await getToken();
        if (!token) {
            throw new Error('Không có token xác thực. Vui lòng đăng nhập lại.');
        }

        const companyId = window.ShopConfig?.getConfig?.()?.CompanyId || 1;
        const baseUrl =
            (window.TPOS_CONFIG && window.TPOS_CONFIG.tposBaseUrl) ||
            'https://chatomni-proxy.nhijudyshop.workers.dev/api';

        const url =
            `${baseUrl}/odata/FastSaleOrder/ODataService.GetDataCrossCheck` +
            `?$expand=Partner,User,Warehouse,Company,PriceList,RefundOrder,Account,Journal,PaymentJournal,Carrier,Tax,SaleOrder,OrderLines($expand=Product,ProductUOM,Account,SaleLine,User),Ship_ServiceExtras,Team` +
            `&number=${encodeURIComponent(number)}&companyId=${companyId}`;

        const resp = await fetch(url, {
            method: 'GET',
            headers: {
                accept: 'application/json, text/plain, */*',
                'content-type': 'application/json;charset=utf-8',
                authorization: `Bearer ${token}`,
                'cache-control': 'no-cache',
            },
        });

        if (!resp.ok) {
            let errMsg = `Lỗi ${resp.status}: ${resp.statusText}`;
            try {
                const errBody = await resp.json();
                if (errBody.error_description) errMsg = errBody.error_description;
                else if (errBody.error?.message) errMsg = errBody.error.message;
                else if (errBody.Error) errMsg = errBody.Error;
                else if (errBody.message) errMsg = errBody.message;
            } catch (e) {
                /* ignore parse error */
            }
            throw new Error(errMsg);
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
        // Hide success banner when viewing a new order
        $('#successBanner').style.display = 'none';

        // Header info
        $('#orderNumber').textContent = data.Number || data.MoveName || '';
        $('#orderStatus').textContent = data.ShowState || '';
        $('#customerName').textContent = data.PartnerDisplayName || '';
        $('#staffName').textContent = data.UserName || '';
        $('#companyName').textContent = data.CompanyName || '';

        // Pancake customer validation (fire-and-forget)
        const custPhone = data.Partner?.Phone || data.ReceiverPhone || '';
        if (window.PancakeValidator && custPhone) {
            const pancakeBadgeEl = document.getElementById('pancakeCustomerBadge');
            window.PancakeValidator.quickLookup(custPhone).then((pData) => {
                if (!pData || !pancakeBadgeEl) return;
                const badge = window.PancakeValidator.renderCustomerBadge(pData);
                pancakeBadgeEl.innerHTML = badge;
                pancakeBadgeEl.style.display = badge ? 'block' : 'none';
            });
        }

        // Init checked quantities to 0
        if (data.OrderLines) {
            data.OrderLines.forEach((line) => {
                const barcode = extractBarcode(line);
                if (barcode) {
                    checkedQuantities[barcode] = 0;
                }
            });
        }

        renderProductTable();
        loadProductImages(data.OrderLines);
        updateSaveButton();
        renderOrderDetail(data);
        showPage(reconcilePage);

        // Focus on product barcode input
        setTimeout(() => productBarcodeInput.focus(), 100);
    }

    // Product image cache: productId → proxied image URL
    const productImageCache = {};

    // Create overlay element once
    const imageOverlay = document.createElement('div');
    imageOverlay.id = 'productImageOverlay';
    imageOverlay.innerHTML = '<img src="" alt="">';
    document.body.appendChild(imageOverlay);
    const overlayImg = imageOverlay.querySelector('img');

    // Hover events on product name cells — use cached blob URL, no repeated network requests
    productTableBody.addEventListener(
        'mouseenter',
        (e) => {
            const cell = e.target.closest('.product-name-cell');
            if (!cell) return;
            const pid = cell.dataset.productId;
            const blobUrl = productImageCache[pid];
            if (!blobUrl) return;
            overlayImg.src = blobUrl;
            imageOverlay.classList.add('visible');
        },
        true
    );

    productTableBody.addEventListener(
        'mouseleave',
        (e) => {
            const cell = e.target.closest('.product-name-cell');
            if (!cell) return;
            imageOverlay.classList.remove('visible');
        },
        true
    );

    async function loadProductImages(orderLines) {
        if (!orderLines) return;
        const token = await getToken();
        if (!token) return;
        const proxyUrl = 'https://chatomni-proxy.nhijudyshop.workers.dev';
        const headers = { authorization: `Bearer ${token}`, accept: 'application/json' };

        orderLines.forEach(async (line) => {
            if (!line.ProductId || productImageCache[line.ProductId]) return;
            try {
                const resp = await fetch(`${proxyUrl}/api/odata/Product(${line.ProductId})`, {
                    headers,
                });
                if (!resp.ok) return;
                const product = await resp.json();

                let imageUrl = product.ImageUrl;

                // Variant has no image — fetch parent template
                if (!imageUrl && product.ProductTmplId) {
                    const tmplResp = await fetch(
                        `${proxyUrl}/api/odata/ProductTemplate(${product.ProductTmplId})`,
                        { headers }
                    );
                    if (tmplResp.ok) {
                        const tmpl = await tmplResp.json();
                        imageUrl = tmpl.ImageUrl;
                    }
                }

                if (!imageUrl) return;

                // Download image once and store as blob URL (no repeated network requests on hover)
                const imgProxyUrl = `${proxyUrl}/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;
                const imgResp = await fetch(imgProxyUrl);
                if (!imgResp.ok) return;
                const blob = await imgResp.blob();
                productImageCache[line.ProductId] = URL.createObjectURL(blob);
            } catch (e) {
                /* skip */
            }
        });
    }

    function extractBarcode(line) {
        // Extract barcode from ProductBarcode field or from [] in Name
        if (line.ProductBarcode) return removeDiacritics(line.ProductBarcode.toUpperCase());

        const match = (line.Name || line.ProductNameGet || '').match(/\[([^\]]+)\]/);
        return match ? removeDiacritics(match[1].toUpperCase()) : null;
    }

    function renderProductTable() {
        if (!currentOrder || !currentOrder.OrderLines) {
            productTableBody.innerHTML =
                '<tr><td colspan="6" style="text-align:center;padding:20px;">Không có sản phẩm</td></tr>';
            return;
        }

        let totalChecked = 0;
        let totalRequired = 0;
        let totalAmount = 0;

        const rows = currentOrder.OrderLines.map((line, idx) => {
            const barcode = extractBarcode(line);
            const totalQty = line.ProductUOMQty || 1;
            const checkedQty = barcode ? checkedQuantities[barcode] || 0 : 0;
            const isDone = checkedQty >= totalQty;
            const price = line.PriceUnit || 0;
            const lineTotal = line.PriceTotal || price * totalQty;

            totalChecked += checkedQty;
            totalRequired += Math.floor(totalQty);
            totalAmount += lineTotal;

            return `<tr class="${isDone ? 'checked' : ''}">
                <td>${idx + 1}</td>
                <td class="product-name-cell" data-product-id="${line.ProductId || ''}">${line.Name || line.ProductNameGet || ''}</td>
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
        return currentOrder.OrderLines.every((line) => {
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
            .map(
                ([label, val]) => `
                <div class="detail-row">
                    <div class="detail-label">${label}</div>
                    <div class="detail-value">${val}</div>
                </div>
            `
            )
            .join('');
    }

    // =====================================================
    // PRODUCT BARCODE SCANNING
    // =====================================================
    function handleProductBarcodeScan(barcode) {
        if (!barcode || !currentOrder || !currentOrder.OrderLines) return;

        const barcodeUpper = removeDiacritics(barcode.toUpperCase().trim());
        productBarcodeInput.value = '';

        // Find matching order line by barcode
        const matchedLine = currentOrder.OrderLines.find((line) => {
            const lineBarcode = extractBarcode(line);
            return lineBarcode === barcodeUpper;
        });

        if (!matchedLine) {
            playSound('error');
            showMismatchDialog(barcode);
            return;
        }

        const lineBarcode = extractBarcode(matchedLine);
        const totalQty = matchedLine.ProductUOMQty || 1;
        const currentQty = checkedQuantities[lineBarcode] || 0;

        if (currentQty >= totalQty) {
            playSound('excess');
            showInlineMsg(
                `${matchedLine.ProductNameGet || matchedLine.Name} - Đã đủ số lượng!`,
                'warning'
            );
            return;
        }

        // Increment quantity
        checkedQuantities[lineBarcode] = currentQty + 1;
        const newQty = checkedQuantities[lineBarcode];

        // Log manual entry to Firestore
        if (!scannerMode) {
            const userName = (document.getElementById('manualUserName') || {}).value || '';
            const note = (document.getElementById('manualNote') || {}).value || '';
            saveManualEntryLog(
                currentOrder.Number || currentOrder.MoveName || '',
                currentOrder.Id,
                lineBarcode,
                matchedLine.ProductNameGet || matchedLine.Name || '',
                userName,
                note
            );
        }

        if (newQty >= totalQty) {
            showInlineMsg(
                `${matchedLine.ProductNameGet || matchedLine.Name} - Đủ! (${newQty}/${Math.floor(totalQty)})`,
                'success'
            );
        } else {
            showInlineMsg(
                `${matchedLine.ProductNameGet || matchedLine.Name} - ${newQty}/${Math.floor(totalQty)}`,
                'info'
            );
        }

        renderProductTable();
        updateSaveButton();

        // Auto-save when all products are checked
        if (isAllChecked()) {
            playSound('allDone');
            handleSave();
            return;
        }

        productBarcodeInput.focus();
    }

    // =====================================================
    // MISMATCH DIALOG
    // =====================================================
    function showMismatchDialog(barcode) {
        // Remove existing dialog if any
        const existing = document.getElementById('mismatchDialog');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'mismatchDialog';
        overlay.className = 'mismatch-overlay';
        overlay.innerHTML = `
            <div class="mismatch-box">
                <div class="mismatch-icon">&#9888;</div>
                <div class="mismatch-title">Sản phẩm sai mã</div>
                <div class="mismatch-code">${barcode}</div>
                <div class="mismatch-msg">Vui lòng xử lý sản phẩm bị sai để tiếp tục</div>
                <div class="mismatch-actions">
                    <button class="btn btn-mismatch-done" id="mismatchDoneBtn">Đã xử lý</button>
                    <button class="btn btn-mismatch-skip" id="mismatchSkipBtn">Chưa xử lý</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('mismatchDoneBtn').addEventListener('click', () => {
            // Save mismatch log to Firestore
            saveMismatchLog(barcode);
            overlay.remove();
            productBarcodeInput.focus();
        });

        document.getElementById('mismatchSkipBtn').addEventListener('click', () => {
            overlay.remove();
            // Ask if user wants to scan another order
            showConfirmScanOther();
        });
    }

    function showConfirmScanOther() {
        const existing = document.getElementById('mismatchDialog');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'mismatchDialog';
        overlay.className = 'mismatch-overlay';
        overlay.innerHTML = `
            <div class="mismatch-box">
                <div class="mismatch-msg">Bạn muốn quét đơn khác?</div>
                <div class="mismatch-actions">
                    <button class="btn btn-mismatch-done" id="confirmYesBtn">Quét đơn khác</button>
                    <button class="btn btn-mismatch-skip" id="confirmNoBtn">Tiếp tục đơn này</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('confirmYesBtn').addEventListener('click', () => {
            overlay.remove();
            goBack();
        });

        document.getElementById('confirmNoBtn').addEventListener('click', () => {
            overlay.remove();
            productBarcodeInput.focus();
        });
    }

    async function saveMismatchLog(barcode) {
        const col = getManualLogCollection();
        if (!col) return;
        try {
            await col.add({
                orderNumber: currentOrder?.Number || currentOrder?.MoveName || '',
                orderId: currentOrder?.Id,
                barcode,
                type: 'mismatch',
                note: 'Sản phẩm sai mã - đã xử lý',
                userName: (document.getElementById('manualUserName') || {}).value || '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                expireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            });
        } catch (e) {
            console.error('[DOI-SOAT] Failed to save mismatch log:', e);
        }
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
                showInlineMsg('Không có token xác thực. Vui lòng đăng nhập lại.', 'error');
                return;
            }

            // Build contents array: "[CODE] PRODUCT_NAME: checked/total"
            const contents = currentOrder.OrderLines.map((line) => {
                const barcode = extractBarcode(line);
                const totalQty = Math.floor(line.ProductUOMQty || 1);
                const checkedQty = barcode ? checkedQuantities[barcode] || 0 : 0;
                const name = line.Name || line.ProductNameGet || '';
                return `${name}: ${checkedQty}/${totalQty}`;
            });

            const baseUrl =
                (window.TPOS_CONFIG && window.TPOS_CONFIG.tposBaseUrl) ||
                'https://chatomni-proxy.nhijudyshop.workers.dev/api';
            const url = `${baseUrl}/odata/FastSaleOrder/ODataService.CrossCheckAndOpenOrder?fastSaleOrderId=${currentOrder.Id}`;

            const resp = await fetch(url, {
                method: 'POST',
                headers: {
                    accept: 'application/json, text/plain, */*',
                    'content-type': 'application/json;charset=UTF-8',
                    authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    model: {
                        IsOk: true,
                        Contents: contents,
                    },
                }),
            });

            if (!resp.ok) {
                let errMsg = `Lỗi ${resp.status}: ${resp.statusText}`;
                try {
                    const errBody = await resp.json();
                    if (errBody.error_description) errMsg = errBody.error_description;
                    else if (errBody.error?.message) errMsg = errBody.error.message;
                    else if (errBody.Error) errMsg = errBody.Error;
                    else if (errBody.message) errMsg = errBody.message;
                } catch (e) {
                    /* ignore */
                }
                throw new Error(errMsg);
            }

            const result = await resp.json();

            if (result.Success) {
                const orderNum = currentOrder.Number || currentOrder.MoveName || '';
                const productList = contents;

                // Trừ số lượng sản phẩm trong Web Warehouse (non-blocking)
                try {
                    const subtractItems = currentOrder.OrderLines.map((line) => ({
                        product_code: extractBarcode(line) || '',
                        quantity: Math.floor(line.ProductUOMQty || 1),
                    })).filter((i) => i.product_code);

                    if (subtractItems.length > 0) {
                        fetch(
                            'https://chatomni-proxy.nhijudyshop.workers.dev/api/v2/web-warehouse/subtract',
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ items: subtractItems }),
                            }
                        )
                            .then((r) => r.json())
                            .then((res) => {
                                if (res.success)
                                    console.log('[WebWarehouse] Trừ kho:', res.message);
                            })
                            .catch((err) => console.warn('[WebWarehouse] Trừ kho lỗi:', err));
                    }
                } catch (err) {
                    console.warn('[WebWarehouse] Subtract error:', err);
                }

                goBack();
                showSuccessBanner(orderNum, productList);
            } else {
                showInlineMsg(`Lỗi: ${result.Error || 'Không xác định'}`, 'error');
            }
        } catch (err) {
            console.error('Save error:', err);
            showInlineMsg(`Lỗi lưu: ${err.message}`, 'error');
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
            showInlineMsg('Vui lòng nhập mã phiếu bán hàng', 'error');
            invoiceCodeInput.focus();
            return;
        }

        // Show loading
        const overlay = showLoading();

        try {
            const data = await fetchOrderByNumber(code);

            if (data.Error) {
                showInlineMsg(`Lỗi: ${data.Error}`, 'error');
                return;
            }

            if (!data.OrderLines || data.OrderLines.length === 0) {
                showInlineMsg('Không tìm thấy sản phẩm trong phiếu', 'warning');
                return;
            }

            renderOrder(data);
        } catch (err) {
            console.error('Fetch error:', err);
            showInlineMsg(`Lỗi kết nối: ${err.message}`, 'error');
        } finally {
            hideLoading(overlay);
        }
    }

    // =====================================================
    // TABS
    // =====================================================
    function initTabs() {
        document.querySelectorAll('.tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                // Remove active from all tabs
                document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
                document
                    .querySelectorAll('.tab-content')
                    .forEach((c) => c.classList.remove('active'));

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

    let inlineMsgTimer = null;
    function showInlineMsg(message, type = 'info') {
        // Pick the right container based on active page
        const container = scannerPage.classList.contains('active')
            ? document.getElementById('inlineMsgScanner')
            : document.getElementById('inlineMsg');
        if (!container) return;

        container.textContent = message;
        container.className = `inline-msg inline-msg-${type}`;
        container.style.display = '';

        if (inlineMsgTimer) clearTimeout(inlineMsgTimer);
        inlineMsgTimer = setTimeout(() => {
            container.style.display = 'none';
        }, 30000);
    }

    let bannerTimer = null;
    function showSuccessBanner(orderNum, productList) {
        const banner = $('#successBanner');
        const items = productList.map((p) => `<li>${p}</li>`).join('');
        banner.innerHTML = `<div class="banner-title">Đối soát thành công đơn ${orderNum}</div>
            <ul class="banner-products">${items}</ul>`;
        banner.style.display = '';
        if (bannerTimer) clearTimeout(bannerTimer);
        bannerTimer = setTimeout(() => {
            banner.style.display = 'none';
        }, 30000);
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

        // Auto-clear: start 3s timer after input changes
        invoiceCodeInput.addEventListener('input', () => startAutoClearTimer(invoiceCodeInput));
        productBarcodeInput.addEventListener('input', () =>
            startAutoClearTimer(productBarcodeInput)
        );

        // Scanner mode toggle
        const autoClearToggle = $('#autoClearToggle');
        if (autoClearToggle) {
            autoClearToggle.checked = scannerMode;
            autoClearToggle.addEventListener('change', () => {
                setScannerMode(autoClearToggle.checked);
            });
        }

        // Cleanup expired manual logs on init
        cleanupManualLogs();

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
