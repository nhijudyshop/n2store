// =====================================================
// TPOS REAL-TIME ORDER UPDATES
// Connect to Render server WebSocket to receive new/updated orders
// Auto-add new rows to table without F5
// =====================================================

(function () {
    // Module guard — chống IIFE chạy 2 lần (vd recursive iframe load)
    if (window.__tab1TposRealtimeLoaded) {
        console.warn('[TPOS-RT] Module already loaded, skipping duplicate IIFE');
        return;
    }
    window.__tab1TposRealtimeLoaded = true;

    const RENDER_WS_URL = 'wss://n2store-fallback.onrender.com';
    const RENDER_API_URL = 'https://n2store-fallback.onrender.com';
    const ODATA_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order/ODataService.GetView';

    let ws = null;
    let reconnectTimer = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT = 15;
    const recentlyProcessed = new Map(); // Code -> timestamp, deduplicate
    let lastReceivedSTT = 0; // Highest STT received via real-time

    // ===== WebSocket Connection =====
    function connect() {
        if (ws && ws.readyState <= 1) return; // CONNECTING or OPEN

        try {
            ws = new WebSocket(RENDER_WS_URL);
        } catch (e) {
            console.warn('[TPOS-RT] WebSocket creation failed:', e.message);
            scheduleReconnect();
            return;
        }

        ws.onopen = () => {
            console.log('[TPOS-RT] Connected to Render server');
            reconnectAttempts = 0;
            updateStatusIndicator(true);
        };

        ws.onclose = () => {
            console.log('[TPOS-RT] Disconnected');
            updateStatusIndicator(false);
            scheduleReconnect();
        };

        ws.onerror = () => {
            // onclose will fire after this
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleMessage(data);
            } catch (e) {
                // ignore non-JSON (heartbeat)
            }
        };
    }

    function scheduleReconnect() {
        if (reconnectAttempts >= MAX_RECONNECT) return;
        const delay = Math.min(3000 * Math.pow(1.5, reconnectAttempts), 60000);
        reconnectAttempts++;
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, delay);
    }

    // ===== Message Handler =====
    function handleMessage(data) {
        if (data.type === 'tpos:new-order') {
            handleNewOrder(data.data);
        } else if (data.type === 'tpos:order-update') {
            handleOrderUpdate(data.data);
        } else if (data.type === 'tpos:tag-assigned') {
            handleTagAssigned(data);
        } else if (data.type === 'tpos:invoice-list-updated') {
            handleInvoiceListUpdate(data);
        }
    }

    function handleInvoiceListUpdate(data) {
        const invoices = data && Array.isArray(data.invoices) ? data.invoices : null;
        if (!invoices || invoices.length === 0) return;
        const store = window.TPOSInvoiceSnapshotStore;
        if (!store) {
            console.warn('[TPOS-RT] TPOSInvoiceSnapshotStore not ready');
            return;
        }
        const affected = store.upsertBatch(invoices);
        if (affected.length === 0) return;
        store.refreshCellsFor(affected);
        console.log('[TPOS-RT] Invoice snapshot batch:', invoices.length, '→ affected rows:', affected.length);
    }

    async function handleNewOrder(eventData) {
        const code = eventData?.Data?.Code || eventData?.Code;
        if (!code) return;
        if (!tableUpdateEnabled) return;

        // Deduplicate (TPOS sends multiple events for same order)
        if (isRecentlyProcessed(code)) return;
        markProcessed(code);

        console.log('[TPOS-RT] New order:', code);

        // Check if order already exists in table
        if (typeof allData !== 'undefined' && allData.find(o => o.Code === code)) {
            console.log('[TPOS-RT] Order already in table, skipping:', code);
            return;
        }

        // Fetch full order data from OData API
        const order = await fetchOrderByCode(code);
        if (!order) return;

        // Add to table
        addOrderToTable(order);

        // Show notification
        const customerName = eventData?.Data?.Facebook_UserName || order.Name || '';
        const nv = extractEmployeeName(eventData?.Message);
        showNewOrderToast(code, customerName, nv, order.SessionIndex);

        // STT gap detection: if newSTT > lastSTT + 1, fetch missing orders
        const newSTT = order.SessionIndex || eventData?.Data?.SessionIndex;
        if (newSTT && lastReceivedSTT > 0 && newSTT > lastReceivedSTT + 1) {
            const gap = newSTT - lastReceivedSTT - 1;
            console.log(`[TPOS-RT] STT gap: ${lastReceivedSTT} → ${newSTT} (${gap} missing)`);
            fetchMissingFromBuffer(lastReceivedSTT + 1, newSTT - 1);
        }
        if (newSTT) lastReceivedSTT = Math.max(lastReceivedSTT, newSTT);
    }

    async function handleOrderUpdate(eventData) {
        const code = eventData?.Data?.Code || eventData?.Code;
        const orderId = eventData?.Data?.Id || eventData?.Id;
        if (!code && !orderId) return;
        if (!tableUpdateEnabled) return;

        // Deduplicate
        const dedupeKey = `upd_${code || orderId}`;
        if (isRecentlyProcessed(dedupeKey)) return;
        markProcessed(dedupeKey);

        console.log('[TPOS-RT] Order updated:', code);

        // Find existing order in table
        let existingOrder = null;
        if (typeof allData !== 'undefined') {
            existingOrder = allData.find(o => o.Code === code || o.Id === orderId);
        }
        if (!existingOrder) return; // Order not in current view

        // Fetch updated data
        const updatedOrder = await fetchOrderByCode(code);
        if (!updatedOrder) return;

        // Update in table
        if (typeof updateOrderInTable === 'function') {
            updateOrderInTable(existingOrder.Id, updatedOrder);
            console.log('[TPOS-RT] Updated order in table:', code);
        }
    }

    async function handleTagAssigned(data) {
        const orderId = data.orderId;
        const tags = data.tags;
        if (!orderId || !tags) return;

        // Strong dedupe: orderId + tag content hash (defends against duplicate
        // broadcasts from multiple WS connections, multiple extension instances,
        // or server replays — see investigation 2026-04-07).
        const tagsHash = (tags || [])
            .map(t => `${t.Id || ''}:${String(t.Name || '').toUpperCase()}`)
            .sort()
            .join('|');
        const dedupeKey = `tag_${orderId}_${tagsHash}`;
        if (isRecentlyProcessed(dedupeKey)) {
            // Silent skip — duplicate event with identical content
            return;
        }
        markProcessed(dedupeKey);

        // Find order in table by TPOS UUID
        let existingOrder = null;
        if (typeof allData !== 'undefined') {
            existingOrder = allData.find(o => o.Id === orderId);
        }
        if (!existingOrder) return; // Order not in current view

        // Defensive: normalize tag fields to strings (TPOS API sometimes sends Name as object)
        const normalizedTags = tags.map(t => ({
            Id: String(t.Id || ''),
            Name: String(t.Name || ''),
            Color: String(t.Color || '#999')
        }));

        console.log('[TPOS-RT] Tag assigned on TPOS:', existingOrder.Code, normalizedTags.map(t => t.Name));

        // Enrich availableTags with any new tags from TPOS event
        enrichAvailableTags(normalizedTags);

        // Convert tags to the format used by our table (JSON string)
        const tagsJson = JSON.stringify(normalizedTags);

        // Update tags in table (inline update, no full re-render)
        if (typeof updateOrderInTable === 'function') {
            updateOrderInTable(orderId, { Tags: tagsJson });
            console.log('[TPOS-RT] Tags updated in table:', existingOrder.Code);
        }

        // Reverse sync TPOS → XL
        if (typeof window.handleTPOSTagsChanged === 'function') {
            window.handleTPOSTagsChanged(orderId, normalizedTags);
        }
    }

    /**
     * Enrich availableTags with new tags from TPOS events.
     * If a tag from TPOS is not in the local cache, add it so
     * filters/modals work correctly. If availableTags is empty
     * (not loaded yet), trigger a full refresh from API.
     */
    function enrichAvailableTags(tposTags) {
        if (!Array.isArray(tposTags) || tposTags.length === 0) return;

        const available = window.availableTags;

        // Case 1: availableTags not loaded yet → trigger full load
        if (!available || available.length === 0) {
            console.log('[TPOS-RT] availableTags empty, triggering full tag load');
            if (typeof loadAvailableTags === 'function') {
                loadAvailableTags();
            }
            return;
        }

        // Case 2: Check each TPOS tag against local cache
        let addedCount = 0;
        const existingIds = new Set(available.map(t => String(t.Id)));

        for (const tag of tposTags) {
            if (!tag.Id) continue;
            if (!existingIds.has(String(tag.Id))) {
                // New tag — add to local cache
                const newTag = {
                    Id: tag.Id,
                    Name: tag.Name || '',
                    Color: tag.Color || '#999'
                };
                available.push(newTag);
                existingIds.add(String(tag.Id));
                addedCount++;
                console.log('[TPOS-RT] Added new tag to availableTags:', newTag.Name, newTag.Id);
            }
        }

        if (addedCount > 0) {
            // Update cache and refresh filter dropdown
            window.availableTags = available;
            if (window.cacheManager) {
                window.cacheManager.set('tags', available, 'tags');
            }
            if (typeof populateTagFilter === 'function') {
                populateTagFilter();
            }
        }
    }

    // ===== Fetch Order from OData API =====
    async function fetchOrderByCode(code) {
        try {
            if (!window.tokenManager) {
                console.warn('[TPOS-RT] tokenManager not ready');
                return null;
            }

            const headers = await window.tokenManager.getAuthHeader();
            const filter = encodeURIComponent(`Code eq '${code}'`);
            const url = `${ODATA_BASE}?$top=1&$filter=${filter}`;

            const response = await fetch(url, {
                headers: { ...headers, accept: 'application/json' }
            });

            if (!response.ok) {
                console.warn('[TPOS-RT] Fetch failed for', code, ':', response.status);
                return null;
            }

            const data = await response.json();
            const orders = data.value || [];
            return orders[0] || null;
        } catch (e) {
            console.warn('[TPOS-RT] Fetch error for', code, ':', e.message);
            return null;
        }
    }

    // ===== Add Order to Table =====
    function addOrderToTable(order) {
        if (typeof allData === 'undefined') return;

        // Check if already exists (race condition guard)
        if (allData.find(o => o.Id === order.Id)) return;

        // Add to beginning of allData (newest first)
        allData.unshift(order);

        // Add to OrderStore
        if (window.OrderStore && window.OrderStore.isInitialized) {
            window.OrderStore._orders.set(order.Id, order);
            if (order.SessionIndex) {
                window.OrderStore._ordersBySTT.set(String(order.SessionIndex), order);
            }
        }

        // Re-apply search/filters and re-render
        if (typeof performTableSearch === 'function') {
            performTableSearch();
        }

        // Update stats
        if (typeof updateStats === 'function') {
            updateStats();
        }

        console.log('[TPOS-RT] Added order to table:', order.Code, 'STT:', order.SessionIndex, 'Total:', allData.length);
    }

    // ===== Toast Notification =====
    function showNewOrderToast(code, customerName, employeeName, stt) {
        // Use existing notification system if available
        if (window.notificationManager) {
            window.notificationManager.show(
                `Don moi #${stt || code}${customerName ? ' - ' + customerName : ''}${employeeName ? ' (NV: ' + employeeName + ')' : ''}`,
                'success',
                3000
            );
            return;
        }

        // Fallback: simple toast
        const toast = document.createElement('div');
        toast.className = 'tpos-rt-toast';
        toast.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:18px">&#x1f4e6;</span>
                <div>
                    <div style="font-weight:600">Don moi #${stt || code}</div>
                    ${customerName ? `<div style="font-size:12px;opacity:0.8">${customerName}${employeeName ? ' - NV: ' + employeeName : ''}</div>` : ''}
                </div>
            </div>
        `;
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    let tableUpdateEnabled = true; // Toggle: render new/updated orders into table

    // ===== Status Indicator (inline toggle button) =====
    function updateStatusIndicator(connected) {
        const dot = document.getElementById('tposRtDot');
        const label = document.getElementById('tposRtLabel');
        const btn = document.getElementById('tposRtToggle');
        if (!dot || !label || !btn) return;

        if (!tableUpdateEnabled) {
            dot.style.background = '#d1d5db';
            label.textContent = 'RT tắt';
            btn.style.borderColor = '#d1d5db';
            btn.style.background = '#f9fafb';
            btn.title = 'Cập nhật bảng real-time đang tắt — click để bật';
        } else if (connected) {
            dot.style.background = '#22c55e';
            label.textContent = 'RT';
            btn.style.borderColor = '#86efac';
            btn.style.background = '#f0fdf4';
            btn.title = 'Đơn mới tự thêm vào bảng — click để tắt';
        } else {
            dot.style.background = '#ef4444';
            label.textContent = 'RT...';
            btn.style.borderColor = '#fca5a5';
            btn.style.background = '#fef2f2';
            btn.title = 'Đang kết nối lại server — click để tắt cập nhật bảng';
        }
    }

    function toggle() {
        tableUpdateEnabled = !tableUpdateEnabled;
        updateStatusIndicator(ws?.readyState === 1);
        console.log('[TPOS-RT] Table updates:', tableUpdateEnabled ? 'ON' : 'OFF');
    }

    // ===== Utilities =====
    function extractEmployeeName(message) {
        if (!message) return '';
        // "Hạnh: label.create_order_with_code 260401050." → "Hạnh"
        const match = message.match(/^([^:]+):/);
        return match ? match[1].trim() : '';
    }

    function isRecentlyProcessed(key) {
        const ts = recentlyProcessed.get(key);
        if (ts && Date.now() - ts < 5000) return true; // 5s dedup window
        return false;
    }

    function markProcessed(key) {
        recentlyProcessed.set(key, Date.now());
        // Cleanup old entries
        if (recentlyProcessed.size > 100) {
            const now = Date.now();
            for (const [k, v] of recentlyProcessed) {
                if (now - v > 10000) recentlyProcessed.delete(k);
            }
        }
    }

    // ===== CSS for Toast =====
    const style = document.createElement('style');
    style.textContent = `
        .tpos-rt-toast {
            position: fixed;
            top: 16px;
            right: 16px;
            background: #065f46;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            transform: translateX(120%);
            transition: transform 0.3s ease;
            max-width: 350px;
            font-size: 14px;
        }
        .tpos-rt-toast.show {
            transform: translateX(0);
        }
    `;
    document.head.appendChild(style);

    // ===== STT Gap Detection: Fetch Missing Orders =====
    // When STT jumps (e.g. 425 → 428), fetch 426, 427 from buffer
    async function fetchMissingFromBuffer(fromSTT, toSTT) {
        try {
            const since = Date.now() - 3 * 60 * 60 * 1000;
            const url = `${RENDER_API_URL}/api/tpos/order-buffer?since=${since}`;
            const response = await fetch(url);
            if (!response.ok) return;

            const result = await response.json();
            if (!result.success || !result.data || result.data.length === 0) return;

            // Filter buffer entries in the missing STT range
            const missingCodes = [];
            for (const entry of result.data) {
                const code = entry.order_code;
                if (!code) continue;
                const stt = entry.session_index;
                if (stt && (stt < fromSTT || stt > toSTT)) continue;
                if (allData.find(o => o.Code === code)) continue;
                if (!missingCodes.includes(code)) missingCodes.push(code);
            }

            if (missingCodes.length === 0) return;

            console.log(`[TPOS-RT] Fetching ${missingCodes.length} missing orders (STT ${fromSTT}-${toSTT}):`, missingCodes);

            for (const code of missingCodes) {
                if (allData.find(o => o.Code === code)) continue;
                const order = await fetchOrderByCode(code);
                if (order) {
                    addOrderToTable(order);
                    markProcessed(code);
                    console.log('[TPOS-RT] Gap fill: added order', code, 'STT:', order.SessionIndex);
                }
                if (missingCodes.length > 3) {
                    await new Promise(r => setTimeout(r, 300));
                }
            }
        } catch (e) {
            console.warn('[TPOS-RT] Gap fill error:', e.message);
        }
    }

    // ===== Initialize =====
    // Wait for page to be ready (allData, tokenManager, etc.)
    function init() {
        if (typeof allData === 'undefined' || !window.tokenManager) {
            setTimeout(init, 2000);
            return;
        }
        console.log('[TPOS-RT] Initializing real-time order updates...');
        connect();

        // Set initial lastReceivedSTT from current data
        if (allData.length > 0) {
            lastReceivedSTT = Math.max(...allData.map(o => o.SessionIndex || 0));
            console.log('[TPOS-RT] Initial max STT:', lastReceivedSTT);
        }
    }

    // Start after DOM loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 3000));
    } else {
        setTimeout(init, 3000);
    }

    // beforeunload cleanup — close WS sạch để server thấy disconnect ngay
    window.addEventListener('beforeunload', () => {
        try {
            if (ws && ws.readyState === 1) ws.close();
        } catch (e) {}
    });

    // Expose for UI toggle + debugging
    window.tposRealtime = {
        getStatus: () => ({
            tableUpdateEnabled,
            connected: ws?.readyState === 1,
            reconnectAttempts,
            recentlyProcessed: recentlyProcessed.size,
            lastReceivedSTT
        }),
        toggle,
        reconnect: () => { reconnectAttempts = 0; connect(); },
        checkGap: (fromSTT, toSTT) => fetchMissingFromBuffer(fromSTT, toSTT)
    };
})();
