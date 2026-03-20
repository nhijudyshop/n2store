// =====================================================
// OVERVIEW - LEDGER: Sổ Sách Live Order Tracking
// Tích hợp trong tab Báo Cáo Tổng Hợp
// Tận dụng campaign selector + cachedOrderDetails từ overview
//
// Firebase paths:
// - live_ledger/{campaignId}/products/{productId}
// - live_ledger/{campaignId}/metadata
// - orderProducts/{tposCampaignId}/product_{id} — order-management (Duyên, 2-way sync)
// =====================================================

(function () {
    'use strict';

    let ledgerProducts = {};
    let orderManagementListener = null;
    let ledgerListener = null;
    let _syncingFromSave = false;
    let _tposCampaignId = null; // TPOS campaign ID for orderProducts path

    function getDb() {
        return window.firebase ? window.firebase.database() : null;
    }

    function getCampaignId() {
        // Reuse currentTableName from overview-core.js (let in global scope, not on window)
        const name = (typeof currentTableName !== 'undefined' ? currentTableName : '') || '';
        if (!name) return '';
        return name.replace(/[.$#\[\]\/]/g, '_');
    }

    function getCampaignName() {
        return (typeof currentTableName !== 'undefined' ? currentTableName : '') || '';
    }

    /**
     * Get TPOS campaign ID for orderProducts path.
     * This is the actual TPOS campaign ID (number), different from the sanitized table name.
     * orderProducts are stored at: orderProducts/{tposCampaignId}/product_{productId}
     */
    async function getTposCampaignId() {
        // Return cached value if available
        if (_tposCampaignId) return _tposCampaignId;

        // Try to get from campaignInfoFromTab1 (set by overview-fetch.js)
        if (typeof campaignInfoFromTab1 !== 'undefined' && campaignInfoFromTab1) {
            const id = campaignInfoFromTab1.activeCampaignId;
            if (id) {
                _tposCampaignId = String(id);
                console.log('[LEDGER] Got TPOS campaign ID from Tab1:', _tposCampaignId);
                return _tposCampaignId;
            }
        }

        // Fallback: request from Tab1 via postMessage
        try {
            const info = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    window.removeEventListener('message', handler);
                    reject(new Error('Timeout'));
                }, 3000);

                const handler = (event) => {
                    if (event.data.type === 'CAMPAIGN_INFO_RESPONSE') {
                        clearTimeout(timeout);
                        window.removeEventListener('message', handler);
                        resolve(event.data.campaignInfo);
                    }
                };
                window.addEventListener('message', handler);
                window.parent.postMessage({ type: 'REQUEST_CAMPAIGN_INFO' }, '*');
            });

            if (info && info.activeCampaignId) {
                _tposCampaignId = String(info.activeCampaignId);
                console.log('[LEDGER] Got TPOS campaign ID via postMessage:', _tposCampaignId);
                return _tposCampaignId;
            }
        } catch (e) {
            console.warn('[LEDGER] Could not get TPOS campaign ID:', e.message);
        }

        return null;
    }

    // =====================================================
    // PRODUCT INFO EXTRACTION FROM NameGet
    // =====================================================

    /**
     * Extract product code from NameGet.
     * Pattern: "[B34C] B4 0603 ÁO THUN..." → code = "B34C"
     * Also checks DefaultCode field from TPOS data.
     */
    function extractProductCode(product) {
        if (product.DefaultCode) return product.DefaultCode;
        const name = product.NameGet || product.Name || '';
        const match = name.match(/^\[([^\]]+)\]/);
        return match ? match[1].trim() : '';
    }

    /**
     * Extract supplier/NCC name from NameGet.
     * Pattern: "[B34C] B4 0603 ÁO THUN..." → ncc = "B4"
     * Takes the first word after the "]" bracket.
     */
    function extractNccName(product) {
        if (product.supplierName) return product.supplierName;
        if (product.nccName) return product.nccName;
        const name = product.NameGet || product.Name || '';
        const match = name.match(/^\[[^\]]+\]\s*(\S+)/);
        return match ? match[1].trim() : '';
    }

    /**
     * Get clean product name from NameGet (full name).
     */
    function extractProductName(product) {
        return product.NameGet || product.ProductNameGet || product.Name || '';
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

    // =====================================================
    // REFRESH FROM CACHED DATA
    // =====================================================

    /**
     * Main entry: aggregate product qty from cachedOrderDetails
     * and merge with live_ledger Firebase data + orderProducts sync
     */
    async function refreshFromCachedData() {
        const campaignId = getCampaignId();
        const campaignName = getCampaignName();

        if (!campaignName) {
            showEmpty('Chọn chiến dịch live ở dropdown phía trên');
            return;
        }

        const db = getDb();
        if (!db) {
            showEmpty('Firebase chưa sẵn sàng');
            return;
        }

        showLoading();
        detachListeners();

        try {
            // Step 1: Pull order-management data FIRST (need code→id map for Excel orders)
            // Moved before customer order aggregation so we can resolve ProductCode → ProductId
            // FIX BUG 1 & 3: Read from correct campaign-scoped path
            const tposCampaignId = await getTposCampaignId();
            const duyenQtyMap = {};
            const nccMap = {};
            const omProductInfoMap = {};
            const omStockMap = {};

            // Build ProductCode → ProductId reverse map for resolving Excel orders
            const codeToIdMap = {};

            if (tposCampaignId) {
                const omSnapshot = await db.ref(`orderProducts/${tposCampaignId}`).once('value');
                const orderProducts = omSnapshot.val() || {};

                Object.entries(orderProducts).forEach(([key, product]) => {
                    if (!product || !product.Id) return;
                    const pid = String(product.Id);

                    duyenQtyMap[pid] = product.soldQty || 0;

                    // Extract NCC from NameGet pattern
                    const ncc = extractNccName(product);
                    if (ncc) nccMap[pid] = ncc;

                    // Extract product code and name from NameGet
                    const code = extractProductCode(product);
                    const name = extractProductName(product);
                    if (code || name) {
                        omProductInfoMap[pid] = {
                            productCode: code,
                            productName: name,
                        };
                    }
                    // Build reverse map: ProductCode → ProductId
                    if (code) {
                        codeToIdMap[code] = pid;
                    }

                    // FIX BUG 6: Stock from QtyAvailable - always update (including 0)
                    if (product.QtyAvailable != null) {
                        omStockMap[pid] = product.QtyAvailable;
                    }
                });

                console.log(
                    '[LEDGER] Loaded orderProducts from TPOS campaign:',
                    tposCampaignId,
                    'products:',
                    Object.keys(duyenQtyMap).length,
                    'codeToIdMap:',
                    Object.keys(codeToIdMap).length
                );
            } else {
                console.warn(
                    '[LEDGER] No TPOS campaign ID available - Duyên order data will not be synced'
                );
            }

            // Step 2: Aggregate customerOrderQty from cachedOrderDetails
            const qtyMap = {};
            const productInfoMap = {};
            const cached =
                typeof cachedOrderDetails !== 'undefined' && cachedOrderDetails
                    ? cachedOrderDetails[campaignName]
                    : null;

            if (cached && cached.orders) {
                const orders = cached.orders;
                (Array.isArray(orders) ? orders : Object.values(orders)).forEach((item) => {
                    const order = item.order || item;
                    (order.Details || []).forEach((detail) => {
                        // Resolve ProductId: use ProductId if available, else lookup by ProductCode
                        let pid = null;
                        if (detail.ProductId && detail.ProductId !== 0) {
                            const pidStr = String(detail.ProductId);
                            if (pidStr !== 'null' && pidStr !== 'undefined' && pidStr !== '') {
                                pid = pidStr;
                            }
                        }
                        // Fallback: resolve via ProductCode → ProductId map
                        if (!pid && detail.ProductCode && codeToIdMap[detail.ProductCode]) {
                            pid = codeToIdMap[detail.ProductCode];
                        }
                        if (!pid) return;

                        qtyMap[pid] = (qtyMap[pid] || 0) + (detail.Quantity || 0);
                        if (!productInfoMap[pid]) {
                            productInfoMap[pid] = {
                                productCode:
                                    detail.ProductCode || detail.Code || detail.DefaultCode || '',
                                productName: detail.ProductName || detail.Name || '',
                            };
                        }
                    });
                });
            }

            // Step 3: Load existing ledger data from Firebase
            const ledgerSnapshot = await db.ref(`live_ledger/${campaignId}/products`).once('value');
            const existingLedger = ledgerSnapshot.val() || {};

            // Step 4: Build product set from CURRENT data sources only
            // FIX BUG 7: Only include products from current data sources, not stale existingLedger
            const currentPids = new Set([...Object.keys(qtyMap), ...Object.keys(duyenQtyMap)]);

            // Also keep existing ledger products that have manual edits
            Object.entries(existingLedger).forEach(([pid, data]) => {
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

            // Step 5: Build updates — use current data, preserve manual edits only
            const updates = {};
            currentPids.forEach((pid) => {
                const existing = existingLedger[pid] || {};
                const omInfo = omProductInfoMap[pid] || {};
                const custInfo = productInfoMap[pid] || {};

                // FIX BUG 4: Use explicit checks instead of || for numeric values
                // customerOrderQty: always use current data (0 if not in current orders)
                const customerOrderQty = pid in qtyMap ? qtyMap[pid] : 0;
                // duyenOrderQty: use order-management data if available, else keep existing manual value
                const duyenOrderQty =
                    pid in duyenQtyMap ? duyenQtyMap[pid] : existing.duyenOrderQty || 0;
                // stockQty: use order-management data if available, else keep existing
                const stockQty = pid in omStockMap ? omStockMap[pid] : existing.stockQty || 0;

                // Priority for product info: order-management > customer orders > existing
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

            // Step 6: Save to Firebase — use .set() to replace stale data completely
            await db
                .ref(`live_ledger/${campaignId}/products`)
                .set(Object.keys(updates).length > 0 ? updates : null);
            await db.ref(`live_ledger/${campaignId}/metadata`).set({
                campaignName: campaignName,
                tposCampaignId: tposCampaignId || null,
                date: new Date().toISOString().split('T')[0],
                lastUpdated: Date.now(),
            });

            // Step 7: Setup realtime listeners
            setupLedgerListener(campaignId);
            if (tposCampaignId) {
                setupOrderManagementSync(campaignId, tposCampaignId);
            }

            console.log(
                '[LEDGER] ✓ Refreshed',
                Object.keys(updates).length,
                'products from cached data'
            );

            // Fetch fresh stock from TPOS API (async, non-blocking)
            fetchFreshStockFromTPOS().catch(err =>
                console.warn('[LEDGER] Background stock update failed:', err)
            );
        } catch (error) {
            console.error('[LEDGER] Error refreshing:', error);
            showEmpty('Lỗi tải dữ liệu: ' + error.message);
        }
    }

    // =====================================================
    // REALTIME LISTENERS
    // =====================================================

    function setupLedgerListener(campaignId) {
        const db = getDb();
        if (!db) return;

        const ledgerRef = db.ref(`live_ledger/${campaignId}/products`);
        ledgerListener = ledgerRef;
        ledgerRef.on('value', (snap) => {
            ledgerProducts = snap.val() || {};
            renderFilteredTable();
            populateNccFilter();
        });
    }

    function setupOrderManagementSync(campaignId, tposCampaignId) {
        const db = getDb();
        if (!db || !tposCampaignId) return;

        if (orderManagementListener) {
            // Detach previous listener using correct path
            db.ref(`orderProducts/${orderManagementListener._tposCampaignId}`).off(
                'value',
                orderManagementListener._handler
            );
        }

        // FIX BUG 1: Listen to correct campaign-scoped path
        const omRef = db.ref(`orderProducts/${tposCampaignId}`);
        const handler = (snapshot) => {
            if (_syncingFromSave) return;

            const orderProducts = snapshot.val() || {};
            let updated = false;

            Object.entries(orderProducts).forEach(([key, product]) => {
                if (!product || !product.Id) return;

                const pid = String(product.Id);
                const soldQty = product.soldQty || 0;

                if (ledgerProducts[pid]) {
                    // Update soldQty + recalc derived fields
                    if (ledgerProducts[pid].duyenOrderQty !== soldQty) {
                        const syncDerived = calcDerivedFields(
                            soldQty,
                            ledgerProducts[pid].nccDeliveredQty || 0,
                            ledgerProducts[pid].nccCancelledQty || 0
                        );
                        db.ref(`live_ledger/${campaignId}/products/${pid}`).update({
                            duyenOrderQty: soldQty,
                            nccPendingQty: syncDerived.nccPendingQty,
                            deliveryStatus: syncDerived.deliveryStatus,
                        });
                        updated = true;
                    }
                    // Update product info if missing in ledger
                    if (!ledgerProducts[pid].productCode) {
                        const code = extractProductCode(product);
                        if (code)
                            db.ref(`live_ledger/${campaignId}/products/${pid}/productCode`).set(
                                code
                            );
                    }
                    if (
                        !ledgerProducts[pid].productName ||
                        ledgerProducts[pid].productName === '—'
                    ) {
                        const name = extractProductName(product);
                        if (name)
                            db.ref(`live_ledger/${campaignId}/products/${pid}/productName`).set(
                                name
                            );
                    }
                    if (!ledgerProducts[pid].nccName) {
                        const ncc = extractNccName(product);
                        if (ncc)
                            db.ref(`live_ledger/${campaignId}/products/${pid}/nccName`).set(ncc);
                    }
                    // FIX BUG 6: Always update stock from QtyAvailable
                    if (product.QtyAvailable != null) {
                        const currentStock = ledgerProducts[pid].stockQty || 0;
                        if (currentStock !== product.QtyAvailable) {
                            db.ref(`live_ledger/${campaignId}/products/${pid}/stockQty`).set(
                                product.QtyAvailable
                            );
                        }
                    }
                } else if (soldQty > 0) {
                    const newDerived = calcDerivedFields(soldQty, 0, 0);
                    db.ref(`live_ledger/${campaignId}/products/${pid}`).set({
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
        // Store reference for cleanup
        orderManagementListener = { _tposCampaignId: tposCampaignId, _handler: handler };
    }

    // =====================================================
    // FETCH FRESH STOCK FROM TPOS VIA EXCEL EXPORT
    // =====================================================

    const PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

    /**
     * Fetch fresh stock from TPOS by downloading Product Excel export.
     * Uses same approach as product-warehouse: download Excel → parse → extract QtyAvailable.
     * Endpoint: Product/ExportProductV2 returns Excel with all products including stock data.
     */
    async function fetchFreshStockFromTPOS() {
        const campaignId = getCampaignId();
        const db = getDb();
        if (!db || !campaignId) return;

        const productEntries = Object.entries(ledgerProducts);
        if (productEntries.length === 0) return;

        // Build code→pid map for matching Excel rows to ledger products
        const codeToPidMap = {};
        const idToPidMap = {};
        productEntries.forEach(([pid, data]) => {
            if (data.productCode) {
                codeToPidMap[data.productCode.toUpperCase()] = pid;
            }
            idToPidMap[pid] = pid;
        });

        console.log('[LEDGER] Fetching fresh stock via Excel export...');

        try {
            const headers = window.tokenManager
                ? await window.tokenManager.getAuthHeader()
                : {};

            // Download Excel from TPOS Product/ExportProductV2
            const response = await fetch(`${PROXY_URL}/api/Product/ExportProductV2?Active=true`, {
                method: 'POST',
                headers: {
                    ...headers,
                    'Content-Type': 'application/json',
                    'feature-version': '2',
                },
                body: JSON.stringify({
                    data: JSON.stringify({
                        Filter: {
                            logic: 'and',
                            filters: [{ field: 'Active', operator: 'eq', value: true }],
                        },
                    }),
                    ids: [],
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const blob = await response.blob();
            console.log(`[LEDGER] Excel downloaded: ${(blob.size / 1024).toFixed(1)} KB`);

            // Parse Excel
            const arrayBuffer = await blob.arrayBuffer();
            const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);

            if (jsonData.length === 0) {
                console.warn('[LEDGER] Excel is empty');
                return null;
            }

            // Log headers to help debug column names
            const sampleRow = jsonData[0];
            const columnNames = Object.keys(sampleRow);
            console.log('[LEDGER] Excel columns:', columnNames);

            // Find the stock column dynamically
            // Common Vietnamese column names for stock in TPOS exports
            const stockColumnCandidates = [
                'SL Tồn kho', 'Tồn kho', 'SL tồn kho',
                'Số lượng tồn', 'Số lượng thực tế', 'SL thực tế',
                'QtyAvailable', 'Qty Available', 'Quantity Available',
                'SL Tồn', 'Tồn', 'Stock',
            ];
            let stockColumn = null;
            for (const candidate of stockColumnCandidates) {
                if (columnNames.includes(candidate)) {
                    stockColumn = candidate;
                    break;
                }
            }
            // Fallback: find any column containing "tồn" or "qty" or "stock"
            if (!stockColumn) {
                stockColumn = columnNames.find(col => {
                    const lower = col.toLowerCase();
                    return lower.includes('tồn') || lower.includes('qty') || lower.includes('stock');
                });
            }

            // Find the product code column
            const codeColumnCandidates = [
                'Mã sản phẩm', 'Mã SP', 'Mã', 'DefaultCode', 'Code',
                'Mã sản phẩm (*)',
            ];
            let codeColumn = null;
            for (const candidate of codeColumnCandidates) {
                if (columnNames.includes(candidate)) {
                    codeColumn = candidate;
                    break;
                }
            }
            if (!codeColumn) {
                codeColumn = columnNames.find(col => {
                    const lower = col.toLowerCase();
                    return lower.includes('mã') && !lower.includes('nhóm');
                });
            }

            // Find the ID column
            const idColumnCandidates = [
                'Id sản phẩm (*)', 'Id sản phẩm', 'Id', 'ID',
            ];
            let idColumn = null;
            for (const candidate of idColumnCandidates) {
                if (columnNames.includes(candidate)) {
                    idColumn = candidate;
                    break;
                }
            }

            console.log('[LEDGER] Detected columns — code:', codeColumn, '| stock:', stockColumn, '| id:', idColumn);

            if (!stockColumn) {
                console.warn('[LEDGER] Could not find stock column in Excel. Available:', columnNames);
                return null;
            }

            // Build stock map: match by product code or product ID
            const stockMap = {};
            let matchedCount = 0;

            jsonData.forEach(row => {
                const code = codeColumn ? String(row[codeColumn] || '').toUpperCase().trim() : '';
                const id = idColumn ? String(row[idColumn] || '') : '';
                const stock = parseFloat(row[stockColumn]) || 0;

                // Match by code first, then by ID
                let pid = null;
                if (code && codeToPidMap[code]) {
                    pid = codeToPidMap[code];
                } else if (id && idToPidMap[id]) {
                    pid = id;
                }

                if (pid) {
                    stockMap[pid] = stock;
                    matchedCount++;
                }
            });

            console.log(`[LEDGER] Matched ${matchedCount}/${productEntries.length} products from Excel (${jsonData.length} total rows)`);

            // Update Firebase with fresh stock values
            const updates = {};
            let updatedCount = 0;
            Object.entries(stockMap).forEach(([pid, freshQty]) => {
                const currentQty = ledgerProducts[pid]?.stockQty;
                if (currentQty !== freshQty) {
                    updates[`${pid}/stockQty`] = freshQty;
                    updatedCount++;
                }
            });

            if (Object.keys(updates).length > 0) {
                await db.ref(`live_ledger/${campaignId}/products`).update(updates);
                console.log('[LEDGER] Updated stock for', updatedCount, 'products from TPOS Excel');
            } else {
                console.log('[LEDGER] Stock already up to date');
            }

            return stockMap;
        } catch (error) {
            console.error('[LEDGER] Error fetching stock from TPOS Excel:', error);
            return null;
        }
    }

    /**
     * Button handler: fetch fresh stock and show feedback
     */
    async function updateStockFromTPOS() {
        const btn = document.getElementById('btnLedgerUpdateStock');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tải Excel...';
        }

        try {
            const stockMap = await fetchFreshStockFromTPOS();
            if (stockMap) {
                const count = Object.keys(stockMap).length;
                if (btn) btn.innerHTML = `<i class="fas fa-check"></i> Đã cập nhật ${count} SP`;
                setTimeout(() => {
                    if (btn) btn.innerHTML = '<i class="fas fa-warehouse"></i> Cập nhật tồn kho';
                }, 2000);
            } else {
                if (btn) btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Lỗi!';
                setTimeout(() => {
                    if (btn) btn.innerHTML = '<i class="fas fa-warehouse"></i> Cập nhật tồn kho';
                }, 2000);
            }
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    // =====================================================
    // SAVE CELL
    // =====================================================

    function saveCell(productId, field, value) {
        const campaignId = getCampaignId();
        if (!campaignId || !productId) return;

        const db = getDb();
        if (!db) return;

        const numValue = field === 'notes' ? value : parseInt(value) || 0;
        db.ref(`live_ledger/${campaignId}/products/${productId}/${field}`).set(numValue);
        db.ref(`live_ledger/${campaignId}/products/${productId}/lastUpdated`).set(Date.now());

        // FIX BUG 2: Write to correct campaign-scoped path in orderProducts
        if (field === 'duyenOrderQty' && _tposCampaignId) {
            _syncingFromSave = true;
            db.ref(`orderProducts/${_tposCampaignId}/product_${productId}/soldQty`).set(numValue);
            setTimeout(() => {
                _syncingFromSave = false;
            }, 500);
        }

        // Auto-recalculate derived fields when quantity fields change
        if (['duyenOrderQty', 'nccDeliveredQty', 'nccCancelledQty'].includes(field)) {
            const product = ledgerProducts[productId] || {};
            const duyen = field === 'duyenOrderQty' ? numValue : product.duyenOrderQty || 0;
            const delivered = field === 'nccDeliveredQty' ? numValue : product.nccDeliveredQty || 0;
            const cancelled = field === 'nccCancelledQty' ? numValue : product.nccCancelledQty || 0;
            const derived = calcDerivedFields(duyen, delivered, cancelled);
            db.ref(`live_ledger/${campaignId}/products/${productId}`).update({
                nccPendingQty: derived.nccPendingQty,
                deliveryStatus: derived.deliveryStatus,
            });
        }
    }

    // =====================================================
    // RENDER
    // =====================================================

    function renderFilteredTable() {
        const nccFilter = document.getElementById('ledgerNccFilter');
        const nccValue = nccFilter ? nccFilter.value : '';
        const statusFilter = document.getElementById('ledgerStatusFilter');
        const statusValue = statusFilter ? statusFilter.value : '';

        let products = Object.entries(ledgerProducts).map(([pid, data]) => ({
            id: pid,
            ...data,
        }));

        if (nccValue) {
            products = products.filter((p) => p.nccName === nccValue);
        }

        if (statusValue) {
            products = products.filter((p) => (p.deliveryStatus || 'pending') === statusValue);
        }

        renderLedgerTable(products);
    }

    function renderLedgerTable(products) {
        const container = document.getElementById('ledgerContent');
        if (!container) return;

        if (!products || products.length === 0) {
            if (getCampaignName()) {
                container.innerHTML = `
                    <div class="ledger-empty-inline">
                        <i class="fas fa-inbox"></i>
                        <p>Chưa có dữ liệu sổ sách cho chiến dịch này</p>
                        <p style="font-size: 12px;">Nhấn "Cập nhật sổ sách" để tổng hợp từ dữ liệu đã tải</p>
                    </div>`;
            } else {
                showEmpty();
            }
            return;
        }

        products.sort((a, b) => (a.productCode || '').localeCompare(b.productCode || ''));

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
                <td class="ledger-code">${p.productCode || '—'}</td>
                <td>${p.productName || '—'}</td>
                <td>${p.nccName || '—'}</td>
                <td class="text-right">${p.customerOrderQty || 0}</td>
                <td class="ledger-editable"><input type="number" value="${p.duyenOrderQty || 0}" min="0"
                    onblur="window.ledgerModule.saveCell('${p.id}', 'duyenOrderQty', this.value)"
                    onkeydown="if(event.key==='Enter') this.blur()"></td>
                <td class="text-center"><span class="${diff1Class}">${diff1Text}</span></td>
                <td class="ledger-editable ledger-ncc-cell"><input type="number" value="${p.nccDeliveredQty || 0}" min="0"
                    onblur="window.ledgerModule.saveCell('${p.id}', 'nccDeliveredQty', this.value)"
                    onkeydown="if(event.key==='Enter') this.blur()"><button class="ledger-batch-btn" onclick="window.ledgerModule.showBatchForm('${p.id}', this)" title="Nhập lô giao hàng">+</button></td>
                <td class="text-right">${p.nccPendingQty || 0}</td>
                <td class="ledger-editable"><input type="number" value="${p.nccCancelledQty || 0}" min="0"
                    onblur="window.ledgerModule.saveCell('${p.id}', 'nccCancelledQty', this.value)"
                    onkeydown="if(event.key==='Enter') this.blur()"></td>
                <td class="text-center"><span class="${diff2Class}">${diff2Text}</span></td>
                <td class="text-center">${badge}</td>
                <td class="ledger-editable"><input type="number" value="${p.stockQty || 0}" min="0"
                    onblur="window.ledgerModule.saveCell('${p.id}', 'stockQty', this.value)"
                    onkeydown="if(event.key==='Enter') this.blur()"></td>
                <td class="ledger-editable"><input type="text" value="${p.notes || ''}" placeholder="Ghi chú..."
                    onblur="window.ledgerModule.saveCell('${p.id}', 'notes', this.value)"
                    onkeydown="if(event.key==='Enter') this.blur()"></td>
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
            <table class="ledger-table-inline">
                <thead><tr>
                    <th>#</th><th>Mã SP</th><th>Tên SP</th><th>NCC</th>
                    <th class="text-right">SL Khách đặt</th>
                    <th class="text-right">SL Duyên order</th>
                    <th class="text-center">CL K-D</th>
                    <th class="text-right">SL NCC giao</th>
                    <th class="text-right">SL Chờ giao</th>
                    <th class="text-right">SL NCC hủy</th>
                    <th class="text-center">CL D-N</th>
                    <th class="text-center">TT Giao</th>
                    <th class="text-right">Tồn kho</th>
                    <th>Ghi chú</th>
                </tr></thead>
                <tbody>${rows}</tbody>
                <tfoot><tr>
                    <td colspan="4" class="text-right"><strong>Tổng (${products.length} SP):</strong></td>
                    <td class="text-right"><strong>${totalCustomer}</strong></td>
                    <td class="text-right"><strong>${totalDuyen}</strong></td>
                    <td class="text-center"><strong class="${totalDiff1Class}">${totalDiff1 > 0 ? '+' + totalDiff1 : totalDiff1}</strong></td>
                    <td class="text-right"><strong>${totalNcc}</strong></td>
                    <td class="text-right"><strong>${totalPending}</strong></td>
                    <td class="text-right"><strong>${totalCancelled}</strong></td>
                    <td class="text-center"><strong class="${totalDiff2Class}">${totalDiff2 > 0 ? '+' + totalDiff2 : totalDiff2}</strong></td>
                    <td></td>
                    <td class="text-right"><strong>${totalStock}</strong></td>
                    <td></td>
                </tr></tfoot>
            </table>`;
    }

    function populateNccFilter() {
        const nccSet = new Set();
        Object.values(ledgerProducts).forEach((p) => {
            if (p.nccName) nccSet.add(p.nccName);
        });

        const select = document.getElementById('ledgerNccFilter');
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
    // DELIVERY STATUS BADGE
    // =====================================================

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
    // DELIVERY BATCH FORM
    // =====================================================

    function showBatchForm(productId, anchorBtn) {
        // Close any existing batch form
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
                <button onclick="window.ledgerModule.closeBatchForm()" class="batch-close-btn">&times;</button>
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
                    <button onclick="window.ledgerModule.saveDeliveryBatch('${productId}')" class="batch-save-btn">
                        <i class="fas fa-save"></i> Lưu lô
                    </button>
                    <button onclick="window.ledgerModule.closeBatchForm()" class="batch-cancel-btn">Hủy</button>
                </div>
            </div>`;

        document.body.appendChild(form);

        // Position near the button
        const formRect = form.getBoundingClientRect();
        let top = rect.bottom + window.scrollY + 4;
        let left = rect.left + window.scrollX - 100;
        // Keep within viewport
        if (left + 260 > window.innerWidth) left = window.innerWidth - 270;
        if (left < 10) left = 10;
        form.style.top = top + 'px';
        form.style.left = left + 'px';

        // Focus qty input
        setTimeout(() => {
            const qtyInput = document.getElementById('batchQty');
            if (qtyInput) qtyInput.focus();
        }, 50);
    }

    function closeBatchForm() {
        const existing = document.getElementById('ledgerBatchForm');
        if (existing) existing.remove();
    }

    async function saveDeliveryBatch(productId) {
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

        const campaignId = getCampaignId();
        const db = getDb();
        if (!db || !campaignId) return;

        const productRef = db.ref(`live_ledger/${campaignId}/products/${productId}`);

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
    }

    // =====================================================
    // HELPERS
    // =====================================================

    function showEmpty(msg) {
        const el = document.getElementById('ledgerContent');
        if (!el) return;
        el.innerHTML = `
            <div class="ledger-empty-inline">
                <i class="fas fa-book-open"></i>
                <p>${msg || 'Chọn chiến dịch live để xem sổ sách'}</p>
                <p style="font-size: 12px;">Dữ liệu sẽ tổng hợp từ đơn hàng đã tải và Quản lý Order</p>
            </div>`;
    }

    function showLoading() {
        const el = document.getElementById('ledgerContent');
        if (!el) return;
        el.innerHTML = `<div class="ledger-loading-inline"><i class="fas fa-spinner spinning"></i> Đang tổng hợp sổ sách...</div>`;
    }

    function detachListeners() {
        const db = getDb();
        if (ledgerListener) {
            ledgerListener.off();
            ledgerListener = null;
        }
        if (orderManagementListener && db) {
            db.ref(`orderProducts/${orderManagementListener._tposCampaignId}`).off(
                'value',
                orderManagementListener._handler
            );
            orderManagementListener = null;
        }
    }

    // =====================================================
    // PUBLIC API
    // =====================================================

    window.ledgerModule = {
        refreshFromCachedData: refreshFromCachedData,
        saveCell: saveCell,
        onNccChange: renderFilteredTable,
        onStatusFilterChange: renderFilteredTable,
        showBatchForm: showBatchForm,
        closeBatchForm: closeBatchForm,
        saveDeliveryBatch: saveDeliveryBatch,
        updateStockFromTPOS: updateStockFromTPOS,
    };
})();
