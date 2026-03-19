/**
 * Tab Live Ledger — Sổ Sách Live Order Tracking
 *
 * Bảng tổng hợp so sánh: SL Khách đặt vs SL Duyên order NCC vs SL NCC giao vs Tồn kho
 * Hỗ trợ giao hàng từng phần (delivery batches) + delivery status badges
 *
 * Firebase paths:
 * - live_ledger/{campaignId}/metadata — campaign info
 * - live_ledger/{campaignId}/products/{productId} — per-product ledger data
 * - report_order_details/{campaignName}/orders — TPOS orders data (read-only)
 * - orderProducts/{tposCampaignId}/product_{id} — order-management data (Duyên, 2-way sync)
 */
(function () {
    'use strict';

    let db = null;
    let currentCampaignId = '';
    let currentCampaignName = '';
    let _tposCampaignId = null;
    let ledgerProducts = {};
    let orderManagementListener = null;
    let ledgerListener = null;
    let _syncingFromSave = false; // Prevent echo loop in 2-way sync

    // =====================================================
    // INITIALIZATION
    // =====================================================

    async function init() {
        try {
            if (!firebase.apps.length) {
                if (typeof FIREBASE_CONFIG !== 'undefined') {
                    firebase.initializeApp(FIREBASE_CONFIG);
                } else if (typeof firebaseConfig !== 'undefined') {
                    firebase.initializeApp(firebaseConfig);
                }
            }
            db = firebase.database();
            console.log('[LEDGER] Firebase initialized');

            await loadCampaigns();
        } catch (error) {
            console.error('[LEDGER] Init error:', error);
        }
    }

    // =====================================================
    // DELIVERY STATUS HELPERS
    // =====================================================

    /**
     * Calculate derived fields: nccPendingQty and deliveryStatus
     * @param {number} duyenOrderQty - Duyên's order quantity
     * @param {number} nccDeliveredQty - Total NCC delivered quantity
     * @param {number} nccCancelledQty - NCC cancelled quantity
     * @returns {{ nccPendingQty: number, deliveryStatus: string }}
     */
    function calcDerivedFields(duyenOrderQty, nccDeliveredQty, nccCancelledQty) {
        const duyen = duyenOrderQty || 0;
        const delivered = nccDeliveredQty || 0;
        const cancelled = nccCancelledQty || 0;
        const pending = Math.max(0, duyen - delivered - cancelled);

        let status = 'pending';
        if (duyen === 0) {
            status = 'pending';
        } else if (cancelled >= duyen) {
            status = 'cancelled';
        } else if (delivered >= duyen - cancelled) {
            status = 'complete';
        } else if (delivered > 0) {
            status = 'partial';
        }

        return { nccPendingQty: pending, deliveryStatus: status };
    }

    /**
     * Get delivery status badge HTML
     */
    function getStatusBadge(status) {
        const map = {
            complete: {
                label: 'Đủ',
                css: 'delivery-badge badge-complete',
                icon: 'fa-check-circle',
            },
            partial: { label: 'Từng phần', css: 'delivery-badge badge-partial', icon: 'fa-clock' },
            pending: {
                label: 'Chưa giao',
                css: 'delivery-badge badge-pending',
                icon: 'fa-hourglass-half',
            },
            cancelled: {
                label: 'Hủy',
                css: 'delivery-badge badge-cancelled',
                icon: 'fa-times-circle',
            },
        };
        const info = map[status] || map.pending;
        return `<span class="${info.css}"><i class="fas ${info.icon}"></i> ${info.label}</span>`;
    }

    // =====================================================
    // PRODUCT INFO EXTRACTION FROM NameGet
    // =====================================================

    function extractProductCode(product) {
        if (product.DefaultCode) return product.DefaultCode;
        const name = product.NameGet || product.Name || '';
        const match = name.match(/^\[([^\]]+)\]/);
        return match ? match[1].trim() : '';
    }

    function extractNccName(product) {
        if (product.supplierName) return product.supplierName;
        if (product.nccName) return product.nccName;
        const name = product.NameGet || product.Name || '';
        const match = name.match(/^\[[^\]]+\]\s*(\S+)/);
        return match ? match[1].trim() : '';
    }

    function extractProductName(product) {
        return product.NameGet || product.ProductNameGet || product.Name || '';
    }

    // =====================================================
    // CAMPAIGNS
    // =====================================================

    async function loadCampaigns() {
        try {
            const snapshot = await db.ref('report_order_details').once('value');
            const data = snapshot.val() || {};
            const campaignNames = Object.keys(data).sort().reverse();

            const select = document.getElementById('campaignFilter');
            select.innerHTML = '<option value="">-- Chọn đợt live --</option>';

            campaignNames.forEach((name) => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                select.appendChild(opt);
            });

            console.log('[LEDGER] Loaded', campaignNames.length, 'campaigns');
        } catch (error) {
            console.error('[LEDGER] Error loading campaigns:', error);
        }
    }

    /**
     * Find the TPOS campaign ID from ledger metadata or orderProducts structure.
     */
    async function findTposCampaignId(campaignId) {
        // First try: check ledger metadata (saved by overview-ledger)
        try {
            const metaSnap = await db
                .ref(`live_ledger/${campaignId}/metadata/tposCampaignId`)
                .once('value');
            const id = metaSnap.val();
            if (id) {
                console.log('[LEDGER] Found TPOS campaign ID from metadata:', id);
                return String(id);
            }
        } catch (e) {
            // ignore
        }

        // Second try: scan orderProducts top-level keys and match by campaignName in products
        try {
            const omKeysSnap = await db.ref('orderProducts').once('value');
            const omData = omKeysSnap.val() || {};

            for (const [key, products] of Object.entries(omData)) {
                if (!products || typeof products !== 'object') continue;
                const firstProduct = Object.values(products)[0];
                if (firstProduct && firstProduct.campaignName) {
                    if (
                        currentCampaignName &&
                        firstProduct.campaignName.includes(currentCampaignName.split(' ')[0])
                    ) {
                        console.log('[LEDGER] Found TPOS campaign ID by name match:', key);
                        return String(key);
                    }
                }
            }
        } catch (e) {
            console.warn('[LEDGER] Error scanning orderProducts:', e);
        }

        return null;
    }

    window.onCampaignChange = async function () {
        const name = document.getElementById('campaignFilter').value;
        if (!name) {
            showEmpty();
            detachListeners();
            return;
        }
        currentCampaignName = name;
        currentCampaignId = name.replace(/[.$#\[\]\/]/g, '_');

        // Find TPOS campaign ID for orderProducts sync
        _tposCampaignId = await findTposCampaignId(currentCampaignId);

        loadLedgerData();
        if (_tposCampaignId) {
            setupOrderManagementSync();
        }
    };

    window.onDateChange = async function () {
        const dateFilter = document.getElementById('dateFilter').value;
        if (!dateFilter) {
            await loadCampaigns();
            return;
        }

        try {
            const snapshot = await db.ref('report_order_details').once('value');
            const data = snapshot.val() || {};
            const campaignNames = Object.keys(data).sort().reverse();

            const ledgerSnapshot = await db.ref('live_ledger').once('value');
            const ledgerData = ledgerSnapshot.val() || {};

            const select = document.getElementById('campaignFilter');
            select.innerHTML = '<option value="">-- Chọn đợt live --</option>';

            campaignNames.forEach((name) => {
                const campaignId = name.replace(/[.$#\[\]\/]/g, '_');
                const meta = ledgerData[campaignId]?.metadata;
                const campaignDate = meta?.date || '';

                if (!campaignDate || campaignDate === dateFilter) {
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = name;
                    select.appendChild(opt);
                }
            });
        } catch (error) {
            console.error('[LEDGER] Error filtering by date:', error);
        }
    };

    window.onNccChange = function () {
        renderFilteredTable();
    };

    window.onStatusFilterChange = function () {
        renderFilteredTable();
    };

    // =====================================================
    // LOAD LEDGER DATA
    // =====================================================

    async function loadLedgerData() {
        showLoading();
        detachListeners();

        try {
            const ledgerRef = db.ref(`live_ledger/${currentCampaignId}/products`);
            const snapshot = await ledgerRef.once('value');
            ledgerProducts = snapshot.val() || {};

            // Setup realtime listener
            ledgerListener = ledgerRef;
            ledgerRef.on('value', (snap) => {
                ledgerProducts = snap.val() || {};
                renderFilteredTable();
                populateNccFilter();
            });

            renderFilteredTable();
            populateNccFilter();
            console.log('[LEDGER] Loaded', Object.keys(ledgerProducts).length, 'products');
        } catch (error) {
            console.error('[LEDGER] Error loading ledger:', error);
            showEmpty('Lỗi tải dữ liệu');
        }
    }

    // =====================================================
    // SYNC FROM ORDER-MANAGEMENT (Duyên's soldQty)
    // =====================================================

    function setupOrderManagementSync() {
        if (orderManagementListener) {
            db.ref(`orderProducts/${orderManagementListener._tposCampaignId}`).off(
                'value',
                orderManagementListener._handler
            );
        }

        if (!_tposCampaignId) {
            console.warn('[LEDGER] No TPOS campaign ID - skipping order-management sync');
            return;
        }

        const omRef = db.ref(`orderProducts/${_tposCampaignId}`);
        const handler = (snapshot) => {
            if (_syncingFromSave) return;

            const orderProducts = snapshot.val() || {};
            let updated = false;

            Object.entries(orderProducts).forEach(([, product]) => {
                if (!product || !product.Id) return;
                const pid = String(product.Id);
                const soldQty = product.soldQty || 0;

                if (ledgerProducts[pid]) {
                    if (ledgerProducts[pid].duyenOrderQty !== soldQty) {
                        const syncDerived = calcDerivedFields(
                            soldQty,
                            ledgerProducts[pid].nccDeliveredQty || 0,
                            ledgerProducts[pid].nccCancelledQty || 0
                        );
                        db.ref(`live_ledger/${currentCampaignId}/products/${pid}`).update({
                            duyenOrderQty: soldQty,
                            nccPendingQty: syncDerived.nccPendingQty,
                            deliveryStatus: syncDerived.deliveryStatus,
                        });
                        updated = true;
                    }
                    // Update product info if missing
                    if (!ledgerProducts[pid].productCode) {
                        const code = extractProductCode(product);
                        if (code)
                            db.ref(
                                `live_ledger/${currentCampaignId}/products/${pid}/productCode`
                            ).set(code);
                    }
                    if (
                        !ledgerProducts[pid].productName ||
                        ledgerProducts[pid].productName === '—'
                    ) {
                        const name = extractProductName(product);
                        if (name)
                            db.ref(
                                `live_ledger/${currentCampaignId}/products/${pid}/productName`
                            ).set(name);
                    }
                    if (!ledgerProducts[pid].nccName) {
                        const ncc = extractNccName(product);
                        if (ncc)
                            db.ref(`live_ledger/${currentCampaignId}/products/${pid}/nccName`).set(
                                ncc
                            );
                    }
                    // Always update stock from QtyAvailable
                    if (product.QtyAvailable != null) {
                        const currentStock = ledgerProducts[pid].stockQty || 0;
                        if (currentStock !== product.QtyAvailable) {
                            db.ref(`live_ledger/${currentCampaignId}/products/${pid}/stockQty`).set(
                                product.QtyAvailable
                            );
                        }
                    }
                } else if (soldQty > 0) {
                    const newDerived = calcDerivedFields(soldQty, 0, 0);
                    db.ref(`live_ledger/${currentCampaignId}/products/${pid}`).set({
                        productCode: extractProductCode(product),
                        productName: extractProductName(product),
                        nccName: extractNccName(product),
                        customerOrderQty: 0,
                        duyenOrderQty: soldQty,
                        nccDeliveredQty: 0,
                        nccCancelledQty: 0,
                        nccPendingQty: newDerived.nccPendingQty,
                        deliveryStatus: newDerived.deliveryStatus,
                        deliveryBatches: [],
                        stockQty: product.QtyAvailable || 0,
                        notes: '',
                        lastUpdated: Date.now(),
                    });
                    updated = true;
                }
            });

            if (updated) console.log('[LEDGER] Synced soldQty from order-management');
        };

        omRef.on('value', handler);
        orderManagementListener = { _tposCampaignId: _tposCampaignId, _handler: handler };
    }

    // =====================================================
    // PULL CUSTOMER ORDER QTY FROM TPOS ORDERS
    // =====================================================

    window.refreshOrderData = async function () {
        if (!currentCampaignName) return;

        const btn = document.getElementById('btnRefresh');
        btn.disabled = true;
        btn.classList.add('loading');

        try {
            // Pull orders from report_order_details
            const snapshot = await db
                .ref(`report_order_details/${currentCampaignName}/orders`)
                .once('value');
            const orders = snapshot.val() || [];

            // Aggregate qty per productId
            const qtyMap = {};
            const productInfoMap = {};

            (Array.isArray(orders) ? orders : Object.values(orders)).forEach((order) => {
                (order.Details || []).forEach((detail) => {
                    if (!detail.ProductId && detail.ProductId !== 0) return;
                    const pid = String(detail.ProductId);
                    if (pid === 'null' || pid === 'undefined' || pid === '') return;

                    qtyMap[pid] = (qtyMap[pid] || 0) + (detail.Quantity || 0);

                    if (!productInfoMap[pid]) {
                        productInfoMap[pid] = {
                            productCode: detail.ProductCode || detail.Code || '',
                            productName: detail.ProductName || detail.Name || '',
                        };
                    }
                });
            });

            // Also pull order-management data for Duyên's soldQty
            const duyenQtyMap = {};
            const nccMap = {};
            const omProductInfoMap = {};
            const omStockMap = {};

            if (_tposCampaignId) {
                const omSnapshot = await db.ref(`orderProducts/${_tposCampaignId}`).once('value');
                const orderProducts = omSnapshot.val() || {};

                Object.entries(orderProducts).forEach(([, product]) => {
                    if (!product || !product.Id) return;
                    const pid = String(product.Id);
                    duyenQtyMap[pid] = product.soldQty || 0;

                    const ncc = extractNccName(product);
                    if (ncc) nccMap[pid] = ncc;

                    const code = extractProductCode(product);
                    const name = extractProductName(product);
                    if (code || name) {
                        omProductInfoMap[pid] = { productCode: code, productName: name };
                    }

                    if (product.QtyAvailable != null) {
                        omStockMap[pid] = product.QtyAvailable;
                    }
                });
            }

            // Merge product IDs from current data only
            const currentPids = new Set([...Object.keys(qtyMap), ...Object.keys(duyenQtyMap)]);

            // Keep existing products with manual edits
            Object.entries(ledgerProducts).forEach(([pid, data]) => {
                if (
                    data &&
                    (data.nccDeliveredQty > 0 ||
                        data.nccCancelledQty > 0 ||
                        (data.deliveryBatches && data.deliveryBatches.length > 0) ||
                        (data.notes && data.notes.trim()))
                ) {
                    currentPids.add(pid);
                }
            });

            // Update ledger in Firebase
            const updates = {};
            currentPids.forEach((pid) => {
                const existing = ledgerProducts[pid] || {};
                const omInfo = omProductInfoMap[pid] || {};
                const custInfo = productInfoMap[pid] || {};

                const customerOrderQty = pid in qtyMap ? qtyMap[pid] : 0;
                const duyenOrderQty =
                    pid in duyenQtyMap ? duyenQtyMap[pid] : existing.duyenOrderQty || 0;
                const stockQty = pid in omStockMap ? omStockMap[pid] : existing.stockQty || 0;

                const nccDeliveredQty = existing.nccDeliveredQty || 0;
                const nccCancelledQty = existing.nccCancelledQty || 0;
                const derived = calcDerivedFields(duyenOrderQty, nccDeliveredQty, nccCancelledQty);

                updates[pid] = {
                    productCode:
                        omInfo.productCode || custInfo.productCode || existing.productCode || '',
                    productName:
                        omInfo.productName || custInfo.productName || existing.productName || '',
                    nccName: nccMap[pid] || existing.nccName || '',
                    customerOrderQty: customerOrderQty,
                    duyenOrderQty: duyenOrderQty,
                    nccDeliveredQty: nccDeliveredQty,
                    nccCancelledQty: nccCancelledQty,
                    nccPendingQty: derived.nccPendingQty,
                    deliveryStatus: derived.deliveryStatus,
                    deliveryBatches: existing.deliveryBatches || [],
                    stockQty: stockQty,
                    notes: existing.notes || '',
                    lastUpdated: Date.now(),
                };
            });

            await db
                .ref(`live_ledger/${currentCampaignId}/products`)
                .set(Object.keys(updates).length > 0 ? updates : null);

            await db.ref(`live_ledger/${currentCampaignId}/metadata`).set({
                campaignName: currentCampaignName,
                tposCampaignId: _tposCampaignId || null,
                date: new Date().toISOString().split('T')[0],
                lastUpdated: Date.now(),
            });

            console.log(
                '[LEDGER] Refreshed',
                Object.keys(updates).length,
                'products from',
                (Array.isArray(orders) ? orders : Object.values(orders)).length,
                'orders'
            );
        } catch (error) {
            console.error('[LEDGER] Error refreshing:', error);
        } finally {
            btn.disabled = false;
            btn.classList.remove('loading');
        }
    };

    // =====================================================
    // SAVE CELL (auto-save on blur)
    // =====================================================

    window.saveCell = async function (productId, field, value) {
        if (!currentCampaignId || !productId) return;

        try {
            const numValue = field === 'notes' ? value : parseInt(value) || 0;
            await db
                .ref(`live_ledger/${currentCampaignId}/products/${productId}/${field}`)
                .set(numValue);
            await db
                .ref(`live_ledger/${currentCampaignId}/products/${productId}/lastUpdated`)
                .set(Date.now());

            // 2-way sync with correct campaign-scoped path
            if (field === 'duyenOrderQty' && _tposCampaignId) {
                _syncingFromSave = true;
                const productKey = `product_${productId}`;
                await db
                    .ref(`orderProducts/${_tposCampaignId}/${productKey}/soldQty`)
                    .set(numValue);
                setTimeout(() => {
                    _syncingFromSave = false;
                }, 500);
            }

            // Auto-recalculate derived fields when quantity fields change
            if (['duyenOrderQty', 'nccDeliveredQty', 'nccCancelledQty'].includes(field)) {
                const product = ledgerProducts[productId] || {};
                const duyen = field === 'duyenOrderQty' ? numValue : product.duyenOrderQty || 0;
                const delivered =
                    field === 'nccDeliveredQty' ? numValue : product.nccDeliveredQty || 0;
                const cancelled =
                    field === 'nccCancelledQty' ? numValue : product.nccCancelledQty || 0;
                const derived = calcDerivedFields(duyen, delivered, cancelled);
                await db.ref(`live_ledger/${currentCampaignId}/products/${productId}`).update({
                    nccPendingQty: derived.nccPendingQty,
                    deliveryStatus: derived.deliveryStatus,
                });
            }

            console.log('[LEDGER] Saved', field, '=', numValue, 'for product', productId);
        } catch (error) {
            console.error('[LEDGER] Error saving cell:', error);
            _syncingFromSave = false;
        }
    };

    // =====================================================
    // DELIVERY BATCH FORM
    // =====================================================

    window.showBatchForm = function (productId, anchorBtn) {
        closeBatchForm();

        const product = ledgerProducts[productId];
        if (!product) return;

        const rect = anchorBtn.getBoundingClientRect();
        const batchHistory = (product.deliveryBatches || [])
            .map(
                (b, i) =>
                    `<div class="batch-history-item">
                <span>#${i + 1}: ${b.qty || 0} sp</span>
                <span class="batch-date">${b.date || ''}</span>
                ${b.note ? `<span class="batch-note">${b.note}</span>` : ''}
            </div>`
            )
            .join('');

        const form = document.createElement('div');
        form.id = 'ledgerBatchForm';
        form.className = 'ledger-batch-popup';
        form.innerHTML = `
            <div class="batch-popup-header">
                <strong>Nhập lô giao hàng</strong>
                <button onclick="closeBatchForm()" class="batch-close-btn">&times;</button>
            </div>
            ${batchHistory ? `<div class="batch-history">${batchHistory}</div>` : ''}
            <div class="batch-form-body">
                <div class="batch-field">
                    <label>Số lượng</label>
                    <input type="number" id="batchQty" min="1" placeholder="VD: 60" autofocus>
                </div>
                <div class="batch-field">
                    <label>Ngày giao</label>
                    <input type="date" id="batchDate" value="${new Date().toISOString().split('T')[0]}">
                </div>
                <div class="batch-field">
                    <label>Ghi chú</label>
                    <input type="text" id="batchNote" placeholder="VD: Lô 1...">
                </div>
                <div class="batch-actions">
                    <button onclick="saveDeliveryBatch('${productId}')" class="batch-save-btn">
                        <i class="fas fa-save"></i> Lưu lô
                    </button>
                    <button onclick="closeBatchForm()" class="batch-cancel-btn">Hủy</button>
                </div>
            </div>`;

        document.body.appendChild(form);

        // Position near the button
        let top = rect.bottom + window.scrollY + 4;
        let left = rect.left + window.scrollX - 100;
        if (left + 260 > window.innerWidth) left = window.innerWidth - 270;
        if (left < 10) left = 10;
        form.style.top = top + 'px';
        form.style.left = left + 'px';

        // Focus qty input
        setTimeout(() => {
            const qtyInput = document.getElementById('batchQty');
            if (qtyInput) qtyInput.focus();
        }, 50);
    };

    window.closeBatchForm = function () {
        const existing = document.getElementById('ledgerBatchForm');
        if (existing) existing.remove();
    };

    window.saveDeliveryBatch = async function (productId) {
        const qtyInput = document.getElementById('batchQty');
        const dateInput = document.getElementById('batchDate');
        const noteInput = document.getElementById('batchNote');

        const qty = parseInt(qtyInput?.value) || 0;
        if (qty <= 0) {
            qtyInput?.focus();
            return;
        }

        const date = dateInput?.value || new Date().toISOString().split('T')[0];
        const note = noteInput?.value || '';

        if (!db || !currentCampaignId) return;

        const productRef = db.ref(`live_ledger/${currentCampaignId}/products/${productId}`);

        try {
            // Use transaction for safe concurrent batch appending
            await productRef.child('deliveryBatches').transaction((currentBatches) => {
                const batches = currentBatches || [];
                batches.push({
                    qty: qty,
                    date: date,
                    note: note,
                    recordedBy: window.currentUser || 'unknown',
                    timestamp: Date.now(),
                });
                return batches;
            });

            // Read back batches and recalculate nccDeliveredQty from sum
            const snap = await productRef.once('value');
            const data = snap.val() || {};
            const batches = data.deliveryBatches || [];
            const totalDelivered = batches.reduce((sum, b) => sum + (b.qty || 0), 0);
            const derived = calcDerivedFields(
                data.duyenOrderQty || 0,
                totalDelivered,
                data.nccCancelledQty || 0
            );

            await productRef.update({
                nccDeliveredQty: totalDelivered,
                nccPendingQty: derived.nccPendingQty,
                deliveryStatus: derived.deliveryStatus,
                lastUpdated: Date.now(),
            });

            closeBatchForm();
            console.log('[LEDGER] Saved delivery batch:', qty, 'for product', productId);
        } catch (err) {
            console.error('[LEDGER] Error saving batch:', err);
        }
    };

    // =====================================================
    // RENDER
    // =====================================================

    function renderFilteredTable() {
        const nccFilter = document.getElementById('nccFilter')?.value || '';
        const statusFilter = document.getElementById('statusFilter')?.value || '';

        let products = Object.entries(ledgerProducts).map(([pid, data]) => ({
            id: pid,
            ...data,
        }));

        // Filter by NCC
        if (nccFilter) {
            products = products.filter((p) => p.nccName === nccFilter);
        }

        // Filter by delivery status
        if (statusFilter) {
            products = products.filter((p) => (p.deliveryStatus || 'pending') === statusFilter);
        }

        renderLedgerTable(products);
    }

    function renderLedgerTable(products) {
        const container = document.getElementById('ledgerContent');

        if (!products || products.length === 0) {
            if (currentCampaignName) {
                container.innerHTML = `
                    <div class="ledger-empty">
                        <i class="fas fa-inbox"></i>
                        <p>Chưa có dữ liệu cho đợt live này</p>
                        <p style="font-size: 12px;">Nhấn "Refresh đơn hàng" để pull dữ liệu từ TPOS</p>
                    </div>`;
            } else {
                showEmpty();
            }
            return;
        }

        // Sort by productCode
        products.sort((a, b) => (a.productCode || '').localeCompare(b.productCode || ''));

        // Calculate totals
        let totalCustomer = 0,
            totalDuyen = 0,
            totalNcc = 0,
            totalPending = 0,
            totalCancelled = 0,
            totalStock = 0;

        const rows = products
            .map((p, i) => {
                // Chênh lệch 1: Khách đặt vs Duyên order
                const diff1 = (p.customerOrderQty || 0) - (p.duyenOrderQty || 0);
                const diff1Class =
                    diff1 > 0 ? 'diff-positive' : diff1 < 0 ? 'diff-negative' : 'diff-zero';
                const diff1Text = diff1 > 0 ? `+${diff1}` : diff1 === 0 ? '0' : String(diff1);

                // Chênh lệch 2: Duyên order vs NCC giao (trừ cả NCC hủy)
                const diff2 =
                    (p.duyenOrderQty || 0) - (p.nccDeliveredQty || 0) - (p.nccCancelledQty || 0);
                const diff2Class =
                    diff2 > 0 ? 'diff-positive' : diff2 < 0 ? 'diff-negative' : 'diff-zero';
                const diff2Text = diff2 > 0 ? `+${diff2}` : diff2 === 0 ? '0' : String(diff2);

                // Delivery status badge
                const status = p.deliveryStatus || 'pending';
                const badge = getStatusBadge(status);

                totalCustomer += p.customerOrderQty || 0;
                totalDuyen += p.duyenOrderQty || 0;
                totalNcc += p.nccDeliveredQty || 0;
                totalPending += p.nccPendingQty || 0;
                totalCancelled += p.nccCancelledQty || 0;
                totalStock += p.stockQty || 0;

                return `<tr>
                <td>${i + 1}</td>
                <td style="font-weight: 600; color: #3b82f6;">${p.productCode || '—'}</td>
                <td>${p.productName || '—'}</td>
                <td>${p.nccName || '—'}</td>
                <td style="text-align: right;">${p.customerOrderQty || 0}</td>
                <td class="editable-cell">
                    <input type="number" value="${p.duyenOrderQty || 0}" min="0"
                        onblur="saveCell('${p.id}', 'duyenOrderQty', this.value)"
                        onkeydown="if(event.key==='Enter') this.blur()">
                </td>
                <td style="text-align: center;"><span class="${diff1Class}">${diff1Text}</span></td>
                <td class="editable-cell ledger-ncc-cell">
                    <input type="number" value="${p.nccDeliveredQty || 0}" min="0"
                        onblur="saveCell('${p.id}', 'nccDeliveredQty', this.value)"
                        onkeydown="if(event.key==='Enter') this.blur()">
                    <button class="ledger-batch-btn" onclick="showBatchForm('${p.id}', this)" title="Nhập lô giao hàng">+</button>
                </td>
                <td style="text-align: right;">${p.nccPendingQty || 0}</td>
                <td class="editable-cell">
                    <input type="number" value="${p.nccCancelledQty || 0}" min="0"
                        onblur="saveCell('${p.id}', 'nccCancelledQty', this.value)"
                        onkeydown="if(event.key==='Enter') this.blur()">
                </td>
                <td style="text-align: center;"><span class="${diff2Class}">${diff2Text}</span></td>
                <td style="text-align: center;">${badge}</td>
                <td class="editable-cell">
                    <input type="number" value="${p.stockQty || 0}" min="0"
                        onblur="saveCell('${p.id}', 'stockQty', this.value)"
                        onkeydown="if(event.key==='Enter') this.blur()">
                </td>
                <td class="editable-cell">
                    <input type="text" class="notes-input" value="${p.notes || ''}" placeholder="Ghi chú..."
                        onblur="saveCell('${p.id}', 'notes', this.value)"
                        onkeydown="if(event.key==='Enter') this.blur()">
                </td>
            </tr>`;
            })
            .join('');

        const totalDiff1 = totalCustomer - totalDuyen;
        const totalDiff1Class =
            totalDiff1 > 0 ? 'diff-positive' : totalDiff1 < 0 ? 'diff-negative' : 'diff-zero';
        const totalDiff2 = totalDuyen - totalNcc - totalCancelled;
        const totalDiff2Class =
            totalDiff2 > 0 ? 'diff-positive' : totalDiff2 < 0 ? 'diff-negative' : 'diff-zero';

        container.innerHTML = `
            <table class="ledger-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Mã SP</th>
                        <th>Tên SP</th>
                        <th>NCC</th>
                        <th style="text-align: right;">SL Khách đặt</th>
                        <th style="text-align: right;">SL Duyên order</th>
                        <th style="text-align: center;">CL K-D</th>
                        <th style="text-align: right;">SL NCC giao</th>
                        <th style="text-align: right;">SL Chờ giao</th>
                        <th style="text-align: right;">SL NCC hủy</th>
                        <th style="text-align: center;">CL D-N</th>
                        <th style="text-align: center;">TT Giao</th>
                        <th style="text-align: right;">Tồn kho</th>
                        <th>Ghi chú</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
                <tfoot>
                    <tr>
                        <td colspan="4" style="text-align: right;"><strong>Tổng (${products.length} SP):</strong></td>
                        <td style="text-align: right;"><strong>${totalCustomer}</strong></td>
                        <td style="text-align: right;"><strong>${totalDuyen}</strong></td>
                        <td style="text-align: center;"><strong class="${totalDiff1Class}">${totalDiff1 > 0 ? '+' + totalDiff1 : totalDiff1}</strong></td>
                        <td style="text-align: right;"><strong>${totalNcc}</strong></td>
                        <td style="text-align: right;"><strong>${totalPending}</strong></td>
                        <td style="text-align: right;"><strong>${totalCancelled}</strong></td>
                        <td style="text-align: center;"><strong class="${totalDiff2Class}">${totalDiff2 > 0 ? '+' + totalDiff2 : totalDiff2}</strong></td>
                        <td></td>
                        <td style="text-align: right;"><strong>${totalStock}</strong></td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>`;
    }

    function populateNccFilter() {
        const nccSet = new Set();
        Object.values(ledgerProducts).forEach((p) => {
            if (p.nccName) nccSet.add(p.nccName);
        });

        const select = document.getElementById('nccFilter');
        if (!select) return;
        const currentVal = select.value;
        select.innerHTML = '<option value="">Tất cả NCC</option>';
        Array.from(nccSet)
            .sort()
            .forEach((ncc) => {
                const opt = document.createElement('option');
                opt.value = ncc;
                opt.textContent = ncc;
                if (ncc === currentVal) opt.selected = true;
                select.appendChild(opt);
            });
    }

    // =====================================================
    // HELPERS
    // =====================================================

    function showEmpty(msg) {
        document.getElementById('ledgerContent').innerHTML = `
            <div class="ledger-empty">
                <i class="fas fa-book-open"></i>
                <p>${msg || 'Chọn đợt live để xem sổ sách'}</p>
                <p style="font-size: 12px;">Dữ liệu sẽ đồng bộ từ Quản lý Order và đơn hàng TPOS</p>
            </div>`;
    }

    function showLoading() {
        document.getElementById('ledgerContent').innerHTML = `
            <div class="ledger-loading">
                <i class="fas fa-spinner"></i> Đang tải dữ liệu...
            </div>`;
    }

    function detachListeners() {
        if (ledgerListener) {
            ledgerListener.off();
            ledgerListener = null;
        }
        if (orderManagementListener) {
            db.ref(`orderProducts/${orderManagementListener._tposCampaignId}`).off(
                'value',
                orderManagementListener._handler
            );
            orderManagementListener = null;
        }
    }

    // =====================================================
    // INIT
    // =====================================================

    document.addEventListener('DOMContentLoaded', init);
})();
