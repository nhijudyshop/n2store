// =====================================================
// TPOS REAL-TIME ORDER UPDATES
// Connect to Render server WebSocket to receive new/updated orders
// Auto-add new rows to table without F5
// =====================================================

(function () {
    const RENDER_WS_URL = 'wss://n2store-fallback.onrender.com';
    const ODATA_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order/ODataService.GetView';

    let ws = null;
    let reconnectTimer = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT = 15;
    const recentlyProcessed = new Map(); // Code -> timestamp, deduplicate

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
        }
    }

    async function handleNewOrder(eventData) {
        const code = eventData?.Data?.Code || eventData?.Code;
        if (!code) return;

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
    }

    async function handleOrderUpdate(eventData) {
        const code = eventData?.Data?.Code || eventData?.Code;
        const orderId = eventData?.Data?.Id || eventData?.Id;
        if (!code && !orderId) return;

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

    // ===== Status Indicator =====
    function updateStatusIndicator(connected) {
        let indicator = document.getElementById('tpos-rt-status');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'tpos-rt-status';
            indicator.title = 'TPOS Real-time';
            indicator.style.cssText = 'position:fixed;bottom:12px;left:12px;width:10px;height:10px;border-radius:50%;z-index:9999;transition:background .3s;cursor:pointer';
            indicator.addEventListener('click', () => {
                const status = ws?.readyState === 1 ? 'Connected' : 'Disconnected';
                const count = typeof allData !== 'undefined' ? allData.length : 0;
                alert(`TPOS Real-time: ${status}\nOrders in table: ${count}\nReconnect attempts: ${reconnectAttempts}`);
            });
            document.body.appendChild(indicator);
        }
        indicator.style.background = connected ? '#22c55e' : '#ef4444';
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

    // ===== Initialize =====
    // Wait for page to be ready (allData, tokenManager, etc.)
    function init() {
        if (typeof allData === 'undefined' || !window.tokenManager) {
            setTimeout(init, 2000);
            return;
        }
        console.log('[TPOS-RT] Initializing real-time order updates...');
        connect();
    }

    // Start after DOM loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 3000));
    } else {
        setTimeout(init, 3000);
    }

    // Expose for debugging
    window.tposRealtime = {
        getStatus: () => ({
            connected: ws?.readyState === 1,
            reconnectAttempts,
            recentlyProcessed: recentlyProcessed.size
        }),
        reconnect: () => { reconnectAttempts = 0; connect(); }
    };
})();
