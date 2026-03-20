/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║               TAB1 STOCK STATUS ENGINE (Kiểm tra tồn kho)                  ║
 * ║     Tự động check tồn kho từng đơn → badge + auto Processing Tags          ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  [A] STATE & CONFIG                                                         ║
 * ║  [B] DATA LOADING (Firebase)                                                ║
 * ║  [C] STOCK COMPUTATION (Classify + Allocate)                                ║
 * ║  [D] PROCESSING TAGS SYNC                                                   ║
 * ║  [E] UI RENDERING (Badges, Tooltips, Filter)                                ║
 * ║  [F] PUBLIC API                                                             ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

(function () {
    'use strict';

    // =====================================================
    // [A] STATE & CONFIG
    // =====================================================

    const StockStatusEngine = {
        _stockMap: new Map(),        // ProductCode → { qty, name, id }
        _orderProducts: new Map(),   // OrderId → [{ code, name, qty }]
        _orderStatus: new Map(),     // OrderId → { status, blocking[], stockTags[] }
        _checked: false,
        _loading: false,
        _summaryStats: { sufficient: 0, insufficient: 0, noProducts: 0, total: 0 },
        _activeFilter: null,         // null | 'sufficient' | 'insufficient'
    };

    const STOCK_TAG_PREFIX = 'STOCK_CHO_';
    const STOCK_TAG_COLOR = '#f59e0b';
    const STOCK_TAG_CATEGORY = 1; // MỤC OKE (same as CHO_HANG)

    // =====================================================
    // [B] DATA LOADING (Firebase)
    // =====================================================

    /**
     * Extract ProductCode from NameGet pattern: "Tên SP [CODE] - NCC"
     */
    function extractProductCode(nameGet) {
        if (!nameGet) return null;
        const str = typeof nameGet === 'string' ? nameGet : (nameGet.NameGet || nameGet.Name || '');
        const match = str.match(/\[([^\]]+)\]/);
        return match ? match[1].trim() : null;
    }

    const PROXY_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

    /**
     * Load stock data fresh from TPOS via Product/ExportProductV2 Excel export.
     * Same approach as overview-ledger.js fetchFreshStockFromTPOS().
     * Falls back to orderProducts Firebase if Excel export fails.
     * Returns: Map<ProductCode, { qty, name, id }>
     */
    async function loadStockData(tposCampaignId) {
        // Try fetching fresh stock from TPOS Excel first
        try {
            const freshStock = await fetchStockFromTPOSExcel();
            if (freshStock && freshStock.size > 0) {
                return freshStock;
            }
        } catch (e) {
            console.warn('[STOCK] Excel export failed, falling back to orderProducts:', e.message);
        }

        // Fallback: load from orderProducts Firebase
        return loadStockFromFirebase(tposCampaignId);
    }

    /**
     * Fetch fresh stock from TPOS Product/ExportProductV2 Excel export.
     * Builds stockMap directly from Excel — NO dependency on orderProducts Firebase.
     */
    async function fetchStockFromTPOSExcel() {
        console.log('[STOCK] Fetching fresh stock from TPOS Excel export...');

        const headers = window.tokenManager
            ? await window.tokenManager.getAuthHeader()
            : {};

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
        console.log(`[STOCK] Excel downloaded: ${(blob.size / 1024).toFixed(1)} KB`);

        // Parse Excel (requires XLSX library)
        if (typeof XLSX === 'undefined') {
            throw new Error('XLSX library not loaded');
        }

        const arrayBuffer = await blob.arrayBuffer();
        const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);

        if (jsonData.length === 0) {
            throw new Error('Excel is empty');
        }

        const columnNames = Object.keys(jsonData[0]);
        console.log('[STOCK] Excel columns:', columnNames);

        // Find stock column
        const stockColumnCandidates = [
            'SL Tồn kho', 'Tồn kho', 'SL tồn kho',
            'Số lượng tồn', 'Số lượng thực tế', 'SL thực tế',
            'QtyAvailable', 'Qty Available', 'Quantity Available',
            'SL Tồn', 'Tồn', 'Stock',
        ];
        let stockColumn = stockColumnCandidates.find(c => columnNames.includes(c));
        if (!stockColumn) {
            stockColumn = columnNames.find(col => {
                const lower = col.toLowerCase();
                return lower.includes('tồn') || lower.includes('qty') || lower.includes('stock');
            });
        }

        // Find product code column
        const codeColumnCandidates = [
            'Mã sản phẩm', 'Mã SP', 'Mã', 'DefaultCode', 'Code', 'Mã sản phẩm (*)',
        ];
        let codeColumn = codeColumnCandidates.find(c => columnNames.includes(c));
        if (!codeColumn) {
            codeColumn = columnNames.find(col => {
                const lower = col.toLowerCase();
                return lower.includes('mã') && !lower.includes('nhóm');
            });
        }

        // Find product name column (0A.2)
        const nameColumnCandidates = [
            'Tên sản phẩm', 'Tên SP', 'Tên sản phẩm (*)', 'Name', 'ProductName',
        ];
        let nameColumn = nameColumnCandidates.find(c => columnNames.includes(c));
        if (!nameColumn) {
            nameColumn = columnNames.find(col => {
                const lower = col.toLowerCase();
                return (lower.includes('tên') && lower.includes('phẩm')) || lower.includes('name');
            });
        }

        // Find ID column
        const idColumnCandidates = ['Id sản phẩm (*)', 'Id sản phẩm', 'Id', 'ID'];
        const idColumn = idColumnCandidates.find(c => columnNames.includes(c));

        console.log('[STOCK] Detected columns — code:', codeColumn, '| stock:', stockColumn, '| name:', nameColumn, '| id:', idColumn);

        if (!stockColumn) {
            throw new Error('Could not find stock column in Excel');
        }

        // Build stock map directly from Excel (no orderProducts dependency)
        const stockMap = new Map();
        jsonData.forEach(row => {
            const code = codeColumn ? String(row[codeColumn] || '').toUpperCase().trim() : '';
            if (!code) return;

            const id = idColumn ? String(row[idColumn] || '') : '';
            const name = nameColumn ? String(row[nameColumn] || '') : code;
            const stock = parseFloat(row[stockColumn]) || 0;

            stockMap.set(code, {
                qty: stock,
                name: name,
                id: id,
            });
        });

        console.log(`[STOCK] Fresh stock loaded for ${stockMap.size} products from TPOS Excel`);
        return stockMap;
    }

    /**
     * Fallback: Load stock from orderProducts Firebase path
     */
    async function loadStockFromFirebase(tposCampaignId) {
        const db = firebase.database();
        const snapshot = await db.ref(`orderProducts/${tposCampaignId}`).once('value');
        const data = snapshot.val() || {};

        const stockMap = new Map();
        Object.entries(data).forEach(([key, product]) => {
            if (!product || !product.Id) return;
            const code = extractProductCode(product);
            if (!code) return;

            stockMap.set(code.toUpperCase(), {
                qty: product.QtyAvailable != null ? product.QtyAvailable : 0,
                name: product.NameGet || product.Name || code,
                id: String(product.Id),
            });
        });

        console.log(`[STOCK] Loaded stock for ${stockMap.size} products from orderProducts/${tposCampaignId} (fallback)`);
        return stockMap;
    }

    /**
     * Load order product details from Firestore report_order_details collection
     * Supports chunked data (isChunked + order_chunks subcollection)
     * Returns: Map<OrderId, [{ code, name, qty }]>
     */
    async function loadOrderProductDetails(campaignName) {
        const db = firebase.firestore();
        const collectionRef = db.collection('report_order_details');
        const sanitizedName = campaignName.replace(/[.$#\[\]\/]/g, '_');

        // Try direct doc lookup first
        let doc = await collectionRef.doc(sanitizedName).get();

        // If not found, try listing all docs to find a match
        if (!doc.exists) {
            console.log(`[STOCK] Doc "${sanitizedName}" not found, scanning collection...`);
            const allDocs = await collectionRef.get();
            const matchingDoc = allDocs.docs.find(d => {
                const docName = d.id.toLowerCase();
                const searchName = sanitizedName.toLowerCase();
                return docName === searchName || docName.includes(searchName) || searchName.includes(docName);
            });
            if (matchingDoc) {
                doc = matchingDoc;
                console.log(`[STOCK] Found matching doc: "${doc.id}"`);
            }
        }

        const orderProductsMap = new Map();
        if (!doc.exists) {
            console.warn('[STOCK] No order details found in report_order_details for: ' + sanitizedName);
            // List available docs for debugging
            const allDocs = await collectionRef.get();
            console.log('[STOCK] Available docs:', allDocs.docs.map(d => d.id));
            return orderProductsMap;
        }
        const docRef = doc.ref;

        const docData = doc.data();
        let orders;

        // Handle chunked data (large datasets > 100 orders)
        if (docData.isChunked) {
            console.log(`[STOCK] Loading chunked order details (${docData.chunkCount} chunks)...`);
            const chunksSnapshot = await docRef.collection('order_chunks')
                .orderBy('chunkIndex')
                .get();
            orders = [];
            chunksSnapshot.docs.forEach(chunkDoc => {
                const chunkData = chunkDoc.data();
                if (chunkData.orders) {
                    orders.push(...chunkData.orders);
                }
            });
        } else {
            orders = docData.orders || [];
        }

        console.log(`[STOCK] Loaded ${orders.length} orders from Firestore`);

        // Build a map of Firestore orders by SessionIndex (STT) for cross-referencing
        const firestoreBySTT = new Map();
        orders.forEach(item => {
            const order = item.order || item;
            const stt = String(order.SessionIndex || '');
            if (stt && (order.Details || []).length > 0) {
                firestoreBySTT.set(stt, order);
            }
        });

        // Map to tab1 order IDs using SessionIndex cross-reference
        // This fixes ID mismatch: Firestore stores OData response Id which may differ from tab1's order.Id
        const allOrders = window.getAllOrders ? window.getAllOrders() : [];
        let matchCount = 0;

        allOrders.forEach(tableOrder => {
            const stt = String(tableOrder.SessionIndex || '');
            const firestoreOrder = firestoreBySTT.get(stt);
            if (!firestoreOrder) return;

            const products = [];
            (firestoreOrder.Details || []).forEach(detail => {
                const rawCode = detail.ProductCode || detail.DefaultCode || extractProductCode(detail.ProductNameGet || detail.ProductName);
                if (!rawCode) return;
                products.push({
                    code: rawCode.toUpperCase().trim(),
                    name: detail.ProductNameGet || detail.ProductName || rawCode,
                    qty: detail.Quantity || 0,
                });
            });

            if (products.length > 0) {
                orderProductsMap.set(String(tableOrder.Id), products);
                matchCount++;
            }
        });

        console.log(`[STOCK] Matched ${matchCount} orders by STT cross-reference (Firestore STTs: ${firestoreBySTT.size}, Tab1 orders: ${allOrders.length})`);

        // Diagnostic: log sample IDs for debugging
        if (orderProductsMap.size > 0) {
            const sampleKeys = [...orderProductsMap.keys()].slice(0, 3);
            const sampleTableIds = allOrders.slice(0, 3).map(o => String(o.Id));
            console.log(`[STOCK] Sample _orderProducts keys: ${sampleKeys.join(', ')}`);
            console.log(`[STOCK] Sample tab1 order.Id: ${sampleTableIds.join(', ')}`);
        }

        return orderProductsMap;
    }

    // =====================================================
    // [C] STOCK COMPUTATION (Classify + Allocate)
    // =====================================================

    /**
     * Main computation: classify orders → allocate stock → tag waiting
     */
    function computeAll() {
        const stockMap = StockStatusEngine._stockMap;
        const orderProducts = StockStatusEngine._orderProducts;
        const statusMap = StockStatusEngine._orderStatus;
        statusMap.clear();

        // Get all orders sorted by STT for allocation priority
        const allOrders = window.getAllOrders ? window.getAllOrders() : [];
        const orderSttMap = new Map();
        allOrders.forEach(o => orderSttMap.set(String(o.Id), o.SessionIndex || 9999));

        // Phase 1 — Classify: tentatively ready vs waiting
        const tentativeReady = [];
        const initialWaiting = [];

        orderProducts.forEach((products, orderId) => {
            const blocking = [];
            products.forEach(p => {
                const codeUpper = (p.code || '').toUpperCase();
                const stock = stockMap.get(codeUpper);
                const available = stock ? stock.qty : 0;
                if (available < p.qty) {
                    blocking.push({ code: p.code, name: p.name, need: p.qty, have: available });
                }
            });

            if (blocking.length === 0) {
                tentativeReady.push(orderId);
            } else {
                initialWaiting.push({ orderId, blocking });
            }
        });

        // Phase 2 — Allocate stock (ưu tiên đơn đủ toàn bộ SP)
        const remainingStock = new Map();
        stockMap.forEach((v, k) => remainingStock.set(k, v.qty));

        // Sort by STT ASC
        tentativeReady.sort((a, b) => (orderSttMap.get(a) || 9999) - (orderSttMap.get(b) || 9999));

        const confirmedReady = [];
        const overflowWaiting = [];

        tentativeReady.forEach(orderId => {
            const products = orderProducts.get(orderId);
            // Check if we can allocate all products
            let canAllocate = true;
            products.forEach(p => {
                const codeUpper = (p.code || '').toUpperCase();
                const remaining = remainingStock.get(codeUpper) || 0;
                if (remaining < p.qty) canAllocate = false;
            });

            if (canAllocate) {
                // Deduct stock
                products.forEach(p => {
                    const codeUpper = (p.code || '').toUpperCase();
                    remainingStock.set(codeUpper, (remainingStock.get(codeUpper) || 0) - p.qty);
                });
                confirmedReady.push(orderId);
            } else {
                // Moved to waiting due to insufficient remaining stock
                const blocking = [];
                products.forEach(p => {
                    const codeUpper = (p.code || '').toUpperCase();
                    const remaining = remainingStock.get(codeUpper) || 0;
                    if (remaining < p.qty) {
                        blocking.push({ code: p.code, name: p.name, need: p.qty, have: remaining });
                    }
                });
                overflowWaiting.push({ orderId, blocking });
            }
        });

        // Phase 3 — Re-evaluate ALL insufficient orders against remainingStock
        // (initialWaiting was classified against total stock, need to re-check with remaining)
        let sufficientCount = 0, insufficientCount = 0;

        confirmedReady.forEach(orderId => {
            statusMap.set(orderId, { status: 'sufficient', blocking: [], stockTags: [] });
            sufficientCount++;
        });

        [...initialWaiting, ...overflowWaiting].forEach(({ orderId }) => {
            const products = orderProducts.get(orderId);
            // Re-evaluate blocking against REMAINING stock (after allocation)
            const blocking = [];
            products.forEach(p => {
                const codeUpper = (p.code || '').toUpperCase();
                const remaining = remainingStock.get(codeUpper) ?? 0;
                if (remaining < p.qty) {
                    blocking.push({ code: p.code, name: p.name, need: p.qty, have: remaining });
                }
            });
            const stockTags = blocking.map(b => `${STOCK_TAG_PREFIX}${b.code}`);
            statusMap.set(orderId, { status: 'insufficient', blocking, stockTags });
            insufficientCount++;
        });

        StockStatusEngine._summaryStats = {
            sufficient: sufficientCount,
            insufficient: insufficientCount,
            noProducts: (allOrders.length - orderProducts.size),
            total: allOrders.length,
        };

        console.log(`[STOCK] Computed: ${sufficientCount} sufficient, ${insufficientCount} insufficient, ${allOrders.length - orderProducts.size} no products`);
    }

    // =====================================================
    // [D] PROCESSING TAGS SYNC
    // =====================================================

    /**
     * Sync stock tags to Processing Tags system.
     * RESET approach: xóa toàn bộ STOCK_CHO_* cũ → gắn mới từ đầu.
     * Tránh lỗi tag cũ còn sót khi chạy lại kiểm tra tồn kho.
     */
    async function syncProcessingTags() {
        const campaignId = ProcessingTagState._campaignId;
        if (!campaignId) {
            console.warn('[STOCK] No campaignId for processing tags sync');
            return;
        }

        // ── PHASE 1: XÓA TOÀN BỘ STOCK_CHO_* cũ ──────────────────────

        const deletePromises = [];
        const affectedOrderIds = new Set();

        ProcessingTagState._orderTags.forEach((tags, orderId) => {
            const stockTags = tags.filter(t => t.key.startsWith(STOCK_TAG_PREFIX));
            if (stockTags.length === 0) return;

            affectedOrderIds.add(orderId);

            // Remove from local state
            const remaining = tags.filter(t => !t.key.startsWith(STOCK_TAG_PREFIX));
            if (remaining.length > 0) {
                ProcessingTagState._orderTags.set(orderId, remaining);
            } else {
                ProcessingTagState._orderTags.delete(orderId);
            }

            // Queue API delete for each stock tag
            stockTags.forEach(t => {
                deletePromises.push(
                    fetch(_ptagApiUrl(`processing-tags/${campaignId}/${orderId}/${t.key}`), {
                        method: 'DELETE',
                    }).catch(e => console.warn(`[STOCK] Delete ${t.key} from ${orderId}:`, e.message))
                );
            });
        });

        // Fire all deletes in parallel
        if (deletePromises.length > 0) {
            await Promise.all(deletePromises);
            console.log(`[STOCK] Cleared ${deletePromises.length} old stock tags from ${affectedOrderIds.size} orders`);
        }

        // Update DOM for cleared orders
        affectedOrderIds.forEach(orderId => _ptagUpdateCellDOM(orderId));

        // Remove old STOCK_CHO_* definitions
        const oldDefs = ProcessingTagState._tagDefinitions.filter(d => d.key.startsWith(STOCK_TAG_PREFIX));
        if (oldDefs.length > 0) {
            ProcessingTagState._tagDefinitions = ProcessingTagState._tagDefinitions.filter(d => !d.key.startsWith(STOCK_TAG_PREFIX));
        }

        // ── PHASE 2: TẠO MỚI tag definitions + bulk assign ───────────

        // Collect all unique STOCK_CHO_ keys needed from fresh computation
        const neededTagKeys = new Set();
        StockStatusEngine._orderStatus.forEach(({ stockTags }) => {
            stockTags.forEach(key => neededTagKeys.add(key));
        });

        // Add new tag definitions
        neededTagKeys.forEach(tagKey => {
            const code = tagKey.replace(STOCK_TAG_PREFIX, '');
            ProcessingTagState._tagDefinitions.push({
                key: tagKey,
                label: `Chờ ${code}`,
                color: STOCK_TAG_COLOR,
                category: STOCK_TAG_CATEGORY,
            });
        });

        // Save updated definitions
        if (neededTagKeys.size > 0 || oldDefs.length > 0) {
            try {
                await fetch(_ptagApiUrl(`processing-tag-defs/${campaignId}`), {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ definitions: ProcessingTagState._tagDefinitions }),
                });
                console.log(`[STOCK] Updated tag definitions: removed ${oldDefs.length} old, added ${neededTagKeys.size} new`);
            } catch (e) {
                console.error('[STOCK] Error saving tag definitions:', e);
            }
        }

        // Build fresh assignments
        const assignments = [];
        const assignedOrderIds = new Set();

        StockStatusEngine._orderStatus.forEach(({ stockTags }, orderId) => {
            if (!stockTags || stockTags.length === 0) return;

            stockTags.forEach(tagKey => {
                assignments.push({
                    orderId,
                    tagKey,
                    category: STOCK_TAG_CATEGORY,
                    note: 'auto-stock',
                });
            });

            // Optimistic UI: set fresh tags in local state
            const existing = ProcessingTagState._orderTags.get(orderId) || [];
            const nonStockTags = existing.filter(t => !t.key.startsWith(STOCK_TAG_PREFIX));
            const freshStockTags = stockTags.map(key => ({
                key, category: STOCK_TAG_CATEGORY, note: 'auto-stock', assignedAt: Date.now(),
            }));
            ProcessingTagState._orderTags.set(orderId, [...nonStockTags, ...freshStockTags]);
            assignedOrderIds.add(orderId);
        });

        // Bulk assign via API
        if (assignments.length > 0) {
            try {
                await fetch(_ptagApiUrl(`processing-tags/${campaignId}/bulk`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        assignments,
                        assignedBy: 'auto-stock',
                    }),
                });
                console.log(`[STOCK] Bulk assigned ${assignments.length} fresh stock tags to ${assignedOrderIds.size} orders`);
            } catch (e) {
                console.error('[STOCK] Bulk assign error:', e);
            }
        }

        // Update DOM for newly assigned orders
        assignedOrderIds.forEach(orderId => _ptagUpdateCellDOM(orderId));

        // Refresh panel if open
        if (typeof _ptagRenderPanelCards === 'function') {
            _ptagRenderPanelCards();
        }

        console.log(`[STOCK] Tag sync complete — cleared ${deletePromises.length} old, assigned ${assignments.length} new`);
    }

    // =====================================================
    // [E] UI RENDERING (Badges, Tooltips, Filter)
    // =====================================================

    /**
     * Render stock badge inline for STT cell
     */
    function renderStockBadgeInline(orderId) {
        if (!StockStatusEngine._checked) return '';
        const status = StockStatusEngine._orderStatus.get(String(orderId));
        if (!status) return '';

        const color = status.status === 'sufficient' ? '#10b981' : '#ef4444';
        const label = status.status === 'sufficient' ? 'Đủ hàng' : 'Thiếu hàng';
        const pulseClass = status.status === 'insufficient' ? 'stock-insufficient' : '';

        // Build tooltip: "Thiếu hàng:\n• B378V  Tồn: 0 / Cần: 1"
        let tooltipContent = label;
        if (status.blocking && status.blocking.length > 0) {
            tooltipContent += ':\n' + status.blocking.map(b =>
                `• ${b.code}  Tồn: ${b.have} / Cần: ${b.need}`
            ).join('\n');
        }

        return `<div class="stock-badge ${pulseClass}"
            style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;cursor:help;"
            title="${tooltipContent.replace(/"/g, '&quot;')}"></div>`;
    }

    /**
     * Render stock column in product detail expansion
     */
    function renderStockColumnHeader() {
        if (!StockStatusEngine._checked) return '';
        return '<th style="padding: 6px 12px; text-align: center; width: 80px; font-weight: 600;">Tồn kho</th>';
    }

    function renderStockColumnCell(detail) {
        if (!StockStatusEngine._checked) return '';
        const rawCode = detail.ProductCode || detail.DefaultCode || extractProductCode(detail.ProductNameGet || detail.ProductName);
        if (!rawCode) return '<td style="padding: 6px 12px; text-align: center; width: 80px; color: #9ca3af;">-</td>';

        const stock = StockStatusEngine._stockMap.get(rawCode.toUpperCase().trim());
        const qty = stock ? stock.qty : 0;
        const needed = detail.Quantity || 0;

        let color, icon;
        if (qty >= needed) {
            color = '#10b981';
            icon = '<i class="fas fa-check-circle" style="margin-right:3px;"></i>';
        } else if (qty > 0) {
            color = '#f59e0b';
            icon = '<i class="fas fa-exclamation-triangle" style="margin-right:3px;"></i>';
        } else {
            color = '#ef4444';
            icon = '<i class="fas fa-times-circle" style="margin-right:3px;"></i>';
        }

        return `<td style="padding: 6px 12px; text-align: center; width: 80px; color: ${color}; font-weight: 500;">${icon}${qty}</td>`;
    }

    /**
     * Get row class for stock highlighting
     */
    function getStockRowClass(orderId) {
        if (!StockStatusEngine._checked) return '';
        const status = StockStatusEngine._orderStatus.get(String(orderId));
        if (!status) return '';
        if (status.status === 'insufficient') return 'stock-row-insufficient';
        return '';
    }

    /**
     * Update summary bar
     */
    function updateSummaryBar() {
        const bar = document.getElementById('stockSummaryBar');
        if (!bar) return;

        const s = StockStatusEngine._summaryStats;
        bar.style.display = 'flex';
        bar.innerHTML = `
            <span class="stock-summary-item stock-summary-sufficient" onclick="window.StockStatusEngine.filterByStatus('sufficient')" title="Đơn đủ hàng, sẵn sàng ship">
                <i class="fas fa-check-circle"></i> ${s.sufficient} đủ hàng
            </span>
            <span class="stock-summary-item stock-summary-insufficient" onclick="window.StockStatusEngine.filterByStatus('insufficient')" title="Đơn thiếu hàng">
                <i class="fas fa-times-circle"></i> ${s.insufficient} thiếu hàng
            </span>
            ${s.noProducts > 0 ? `<span class="stock-summary-item stock-summary-noproducts" title="Đơn không có chi tiết SP">
                <i class="fas fa-circle"></i> ${s.noProducts} không có SP
            </span>` : ''}
            ${StockStatusEngine._activeFilter ? `<span class="stock-summary-item stock-summary-clear" onclick="window.StockStatusEngine.filterByStatus(null)" title="Xóa bộ lọc">
                <i class="fas fa-times"></i> Xóa lọc
            </span>` : ''}
        `;

        // Also update filter tabs if they exist
        updateFilterTabs();
    }

    /**
     * Filter table by stock status
     */
    function filterByStatus(status) {
        StockStatusEngine._activeFilter = StockStatusEngine._activeFilter === status ? null : status;
        updateSummaryBar();

        // Re-render table with filter
        if (typeof performTableSearch === 'function') {
            performTableSearch();
        }
    }

    /**
     * Check if order passes stock filter (called from table rendering)
     */
    function passesStockFilter(orderId) {
        if (!StockStatusEngine._checked || !StockStatusEngine._activeFilter) return true;
        const status = StockStatusEngine._orderStatus.get(String(orderId));

        if (StockStatusEngine._activeFilter === 'sufficient') {
            return status && status.status === 'sufficient';
        }
        if (StockStatusEngine._activeFilter === 'insufficient') {
            return status && status.status === 'insufficient';
        }
        return true;
    }

    /**
     * Update filter tabs (pill badges in toolbar area)
     */
    function updateFilterTabs() {
        const container = document.getElementById('stockFilterTabs');
        if (!container) return;

        const s = StockStatusEngine._summaryStats;
        const active = StockStatusEngine._activeFilter;
        const totalWithProducts = s.sufficient + s.insufficient;

        container.style.display = StockStatusEngine._checked ? 'flex' : 'none';
        container.innerHTML = `
            <span class="stock-filter-tab ${active === null ? 'active' : ''}" onclick="window.StockStatusEngine.filterByStatus(null)">
                Tất cả ${totalWithProducts}
            </span>
            <span class="stock-filter-tab stock-filter-sufficient ${active === 'sufficient' ? 'active' : ''}" onclick="window.StockStatusEngine.filterByStatus('sufficient')">
                Đủ hàng ${s.sufficient}
            </span>
            <span class="stock-filter-tab stock-filter-insufficient ${active === 'insufficient' ? 'active' : ''}" onclick="window.StockStatusEngine.filterByStatus('insufficient')">
                Thiếu ${s.insufficient}
            </span>
        `;
    }

    // =====================================================
    // [F] PUBLIC API
    // =====================================================

    /**
     * Main entry: Initialize stock check
     */
    StockStatusEngine.init = async function () {
        if (StockStatusEngine._loading) return;
        StockStatusEngine._loading = true;

        const btn = document.getElementById('btnStockCheck');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang kiểm tra...';
        }

        try {
            // Get campaign info
            const campaign = window.campaignManager?.activeCampaign;
            const campaignId = window.campaignManager?.activeCampaignId;
            if (!campaign || !campaignId) {
                throw new Error('Chưa chọn chiến dịch');
            }

            // Resolve campaign name: try multiple sources
            let campaignName = campaign.name;
            if (!campaignName) {
                campaignName = document.getElementById('activeCampaignLabel')?.textContent?.trim();
            }
            // Fallback: use LiveCampaignName from first order (TPOS native name)
            const allOrders = window.getAllOrders ? window.getAllOrders() : [];
            if (!campaignName && allOrders.length > 0) {
                campaignName = allOrders[0].LiveCampaignName;
            }
            const tposCampaignId = campaign.tposCampaignId || campaignId;

            if (!campaignName) {
                throw new Error('Không tìm thấy tên chiến dịch');
            }

            console.log(`[STOCK] Starting stock check - Campaign: ${campaignName}, TPOS ID: ${tposCampaignId}`);

            // 1. Load stock data from orderProducts
            StockStatusEngine._stockMap = await loadStockData(tposCampaignId);

            if (StockStatusEngine._stockMap.size === 0) {
                throw new Error('Không có dữ liệu tồn kho. Hãy đảm bảo đã thêm sản phẩm vào chiến dịch.');
            }

            // 2. Load order product details
            StockStatusEngine._orderProducts = await loadOrderProductDetails(campaignName);

            if (StockStatusEngine._orderProducts.size === 0) {
                throw new Error('Không có chi tiết đơn hàng. Hãy bấm "Lấy chi tiết đơn hàng" trước.');
            }

            // 3. Compute stock status
            computeAll();

            // 4. Mark as checked and refresh table
            StockStatusEngine._checked = true;
            StockStatusEngine._activeFilter = null;
            updateSummaryBar();

            // Re-render table
            if (typeof performTableSearch === 'function') {
                performTableSearch();
            }

            // 5. Sync processing tags
            await syncProcessingTags();

            const s = StockStatusEngine._summaryStats;
            if (window.notificationManager) {
                window.notificationManager.success(
                    `Kiểm tra tồn kho: ${s.sufficient} đủ hàng, ${s.insufficient} thiếu hàng`,
                    5000,
                    'Tồn kho'
                );
            }

        } catch (err) {
            console.error('[STOCK] Error:', err);
            if (window.notificationManager) {
                window.notificationManager.error(err.message || 'Lỗi kiểm tra tồn kho', 5000);
            }
        } finally {
            StockStatusEngine._loading = false;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-boxes-stacked"></i> Kiểm tra tồn kho';
            }
        }
    };

    StockStatusEngine.getOrderStatus = function (orderId) {
        return StockStatusEngine._orderStatus.get(String(orderId)) || null;
    };

    StockStatusEngine.renderBadge = renderStockBadgeInline;
    StockStatusEngine.renderStockColumnHeader = renderStockColumnHeader;
    StockStatusEngine.renderStockColumnCell = renderStockColumnCell;
    StockStatusEngine.getStockRowClass = getStockRowClass;
    StockStatusEngine.passesStockFilter = passesStockFilter;
    StockStatusEngine.filterByStatus = filterByStatus;

    // Expose globally
    window.StockStatusEngine = StockStatusEngine;

})();
