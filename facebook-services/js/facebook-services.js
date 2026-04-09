// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
(function () {
    'use strict';

    // =====================================================
    // CONFIG
    // =====================================================

    const CF_WORKER = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const RENDER_SERVER = 'https://n2store-fallback.onrender.com';
    const HISTORY_KEY = 'autofb_order_history';
    const USD_TO_VND = 25000;

    // =====================================================
    // STATE
    // =====================================================

    let allServices = [];
    let selectedService = null;
    let orderHistory = [];

    // =====================================================
    // API HELPERS
    // =====================================================

    async function apiFetch(path, options = {}) {
        const url = `${CF_WORKER}${path}`;
        const res = await fetch(url, {
            method: options.method || 'GET',
            headers: { 'Content-Type': 'application/json' },
            ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        });
        return res.json();
    }

    async function fetchServices() {
        try {
            const data = await apiFetch('/api/autofb-services');
            if (data.success && Array.isArray(data.data)) {
                return data.data;
            }
            // Try Render direct
            const res = await fetch(`${RENDER_SERVER}/api/autofb/services`);
            const fallback = await res.json();
            if (fallback.success) return fallback.data;
        } catch (e) {
            console.error('[FB-SVC] fetchServices error:', e);
        }
        return [];
    }

    async function fetchBalance() {
        try {
            const data = await apiFetch('/api/autofb-api-balance');
            if (data.success) return data.data;
        } catch (e) {
            console.error('[FB-SVC] fetchBalance error:', e);
        }
        return null;
    }

    async function createOrder(service, link, quantity, comments) {
        const body = { service, link, quantity };
        if (comments) body.comments = comments;
        return apiFetch('/api/autofb-order', { method: 'POST', body });
    }

    async function checkOrderStatus(orderIds) {
        if (Array.isArray(orderIds)) {
            return apiFetch('/api/autofb-order-status', { method: 'POST', body: { order_ids: orderIds } });
        }
        return apiFetch('/api/autofb-order-status', { method: 'POST', body: { order_id: orderIds } });
    }

    async function cancelOrder(orderId) {
        return apiFetch('/api/autofb-cancel', { method: 'POST', body: { order_id: orderId } });
    }

    async function createPayment(amount) {
        return apiFetch('/api/autofb-payment', {
            method: 'POST',
            body: { payment_amount: amount },
        });
    }

    // =====================================================
    // RENDER SERVICES LIST
    // =====================================================

    function getCategories(services) {
        const cats = new Map();
        for (const s of services) {
            const cat = s.category || 'Other';
            cats.set(cat, (cats.get(cat) || 0) + 1);
        }
        return Array.from(cats.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }

    function renderCategorySelect(categories) {
        const sel = document.getElementById('categorySelect');
        sel.innerHTML = '<option value="">T\u1ea5t c\u1ea3 danh m\u1ee5c</option>';
        for (const [cat, count] of categories) {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = `${cat.trim()} (${count})`;
            sel.appendChild(opt);
        }
    }

    function renderServiceSelect(services) {
        const sel = document.getElementById('serviceSelect');
        sel.innerHTML = '<option value="">-- Ch\u1ecdn d\u1ecbch v\u1ee5 --</option>';
        for (const s of services) {
            const opt = document.createElement('option');
            opt.value = s.service;
            opt.textContent = `#${s.service} ${s.name} ($${s.rate}/1K)`;
            sel.appendChild(opt);
        }
    }

    function renderServicesList(services) {
        const container = document.getElementById('servicesList');
        if (!services.length) {
            container.innerHTML = '<div class="loading-state"><span>Kh\u00f4ng t\u00ecm th\u1ea5y d\u1ecbch v\u1ee5</span></div>';
            return;
        }

        container.innerHTML = services.map(s => `
            <div class="service-item" data-id="${s.service}">
                <div class="service-item-category">${(s.category || 'Other').trim()}</div>
                <div class="service-item-name">#${s.service} ${s.name}</div>
                <div class="service-item-meta">
                    <span>$${s.rate}/1K</span>
                    <span>Min: ${s.min}</span>
                    <span>Max: ${Number(s.max).toLocaleString()}</span>
                    ${s.refill ? '<span>Refill</span>' : ''}
                    ${s.cancel ? '<span>Cancel</span>' : ''}
                </div>
            </div>
        `).join('');
    }

    function filterServices() {
        const category = document.getElementById('categorySelect').value;
        const search = document.getElementById('serviceSearch').value.toLowerCase().trim();

        let filtered = allServices;
        if (category) filtered = filtered.filter(s => s.category === category);
        if (search) filtered = filtered.filter(s =>
            s.name.toLowerCase().includes(search) ||
            String(s.service).includes(search) ||
            (s.category || '').toLowerCase().includes(search)
        );

        renderServicesList(filtered);
        renderServiceSelect(filtered);
    }

    // =====================================================
    // SELECT SERVICE
    // =====================================================

    function selectService(serviceId) {
        selectedService = allServices.find(s => String(s.service) === String(serviceId)) || null;

        // Update service select dropdown
        document.getElementById('serviceSelect').value = serviceId || '';

        // Highlight in list
        document.querySelectorAll('.service-item').forEach(el => {
            el.classList.toggle('selected', el.dataset.id === String(serviceId));
        });

        // Show/hide info
        const infoCard = document.getElementById('serviceInfo');
        if (!selectedService) {
            infoCard.style.display = 'none';
            return;
        }

        infoCard.style.display = 'block';
        document.getElementById('serviceRate').textContent = `$${selectedService.rate} / 1000`;
        document.getElementById('serviceMin').textContent = selectedService.min;
        document.getElementById('serviceMax').textContent = Number(selectedService.max).toLocaleString();

        // Show comments field for comment services
        const isComment = (selectedService.category || '').toLowerCase().includes('comment')
            || (selectedService.name || '').toLowerCase().includes('comment');
        document.getElementById('commentsGroup').style.display = isComment ? 'block' : 'none';

        // Set quantity min/max
        const qtyInput = document.getElementById('quantityInput');
        qtyInput.min = selectedService.min;
        qtyInput.max = selectedService.max;
        qtyInput.placeholder = `${selectedService.min} - ${Number(selectedService.max).toLocaleString()}`;

        updateTotal();
        updateSubmitButton();
    }

    // =====================================================
    // PRICE CALCULATION
    // =====================================================

    function updateTotal() {
        const qty = parseInt(document.getElementById('quantityInput').value) || 0;
        const rate = selectedService ? parseFloat(selectedService.rate) : 0;
        const total = (qty / 1000) * rate;
        const totalVND = Math.round(total * USD_TO_VND);

        document.getElementById('totalPrice').textContent = `$${total.toFixed(4)}`;
        document.getElementById('totalPriceVND').textContent = `(${totalVND.toLocaleString()} \u0111)`;
    }

    function updateSubmitButton() {
        const btn = document.getElementById('btnSubmitOrder');
        const qty = parseInt(document.getElementById('quantityInput').value) || 0;
        const link = document.getElementById('linkInput').value.trim();

        const valid = selectedService && link && qty >= (selectedService.min || 1) && qty <= (selectedService.max || Infinity);
        btn.disabled = !valid;
    }

    // =====================================================
    // ORDER SUBMISSION
    // =====================================================

    async function submitOrder() {
        const btn = document.getElementById('btnSubmitOrder');
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i> \u0110ang \u0111\u1eb7t...';
        if (typeof lucide !== 'undefined') lucide.createIcons();

        const link = document.getElementById('linkInput').value.trim();
        const qty = parseInt(document.getElementById('quantityInput').value);
        const comments = document.getElementById('commentsInput')?.value?.trim() || null;

        try {
            const result = await createOrder(selectedService.service, link, qty, comments);

            if (result.success && result.data?.order_id) {
                // Save to history
                const order = {
                    order_id: result.data.order_id,
                    service_id: selectedService.service,
                    service_name: selectedService.name,
                    link,
                    quantity: qty,
                    rate: selectedService.rate,
                    total: ((qty / 1000) * parseFloat(selectedService.rate)).toFixed(4),
                    status: 'Pending',
                    created_at: new Date().toISOString(),
                };
                orderHistory.unshift(order);
                saveHistory();
                renderHistory();
                updateSpendingStats();

                // Reset form
                document.getElementById('linkInput').value = '';
                document.getElementById('quantityInput').value = '';
                document.getElementById('commentsInput').value = '';
                updateTotal();

                // Refresh balance
                loadBalance();

                alert(`\u0110\u1eb7t \u0111\u01a1n th\u00e0nh c\u00f4ng! Order ID: ${result.data.order_id}`);
            } else {
                alert(`L\u1ed7i: ${result.error || 'Kh\u00f4ng th\u1ec3 \u0111\u1eb7t \u0111\u01a1n'}`);
            }
        } catch (e) {
            alert(`L\u1ed7i: ${e.message}`);
        }

        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="send"></i> \u0110\u1eb7t \u0110\u01a1n';
        if (typeof lucide !== 'undefined') lucide.createIcons();
        updateSubmitButton();
    }

    // =====================================================
    // ORDER HISTORY
    // =====================================================

    function loadHistory() {
        try {
            orderHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        } catch { orderHistory = []; }
    }

    function saveHistory() {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(orderHistory));
    }

    function renderHistory() {
        const tbody = document.getElementById('historyTable');
        if (!orderHistory.length) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Ch\u01b0a c\u00f3 \u0111\u01a1n h\u00e0ng n\u00e0o</td></tr>';
            return;
        }

        tbody.innerHTML = orderHistory.map(o => {
            const statusClass = getStatusClass(o.status);
            const date = new Date(o.created_at);
            const dateStr = `${date.getDate()}/${date.getMonth() + 1} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

            return `<tr>
                <td><strong>${o.order_id}</strong></td>
                <td title="${o.service_name}">#${o.service_id}</td>
                <td class="link-cell"><a href="${o.link}" target="_blank">${truncate(o.link, 30)}</a></td>
                <td>${Number(o.quantity).toLocaleString()}</td>
                <td>$${o.total}</td>
                <td><span class="status-badge ${statusClass}">${o.status}</span></td>
                <td>${dateStr}</td>
                <td>
                    <button class="btn btn-sm btn-outline" onclick="window._fbSvc.checkStatus(${o.order_id})" title="Check status">
                        <i data-lucide="refresh-cw"></i>
                    </button>
                    ${o.status === 'Pending' || o.status === 'Processing' ? `
                    <button class="btn btn-sm btn-outline btn-danger" onclick="window._fbSvc.cancelOrd(${o.order_id})" title="Cancel">
                        <i data-lucide="x"></i>
                    </button>` : ''}
                </td>
            </tr>`;
        }).join('');

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function getStatusClass(status) {
        if (!status) return '';
        const s = status.toLowerCase();
        if (s === 'completed') return 'status-completed';
        if (s === 'pending') return 'status-pending';
        if (s === 'processing' || s === 'in progress') return 'status-processing';
        if (s === 'partial') return 'status-partial';
        if (s === 'canceled' || s === 'cancelled' || s === 'refunded') return 'status-canceled';
        return '';
    }

    function truncate(str, len) {
        return str.length > len ? str.substring(0, len) + '...' : str;
    }

    async function refreshAllStatuses() {
        const ids = orderHistory.filter(o => o.status !== 'Completed' && o.status !== 'Canceled' && o.status !== 'Cancelled').map(o => o.order_id);
        if (!ids.length) return;

        try {
            const result = await checkOrderStatus(ids);
            if (result.success && result.data) {
                const statuses = result.data;
                // Handle both single and multi-order responses
                if (typeof statuses === 'object' && !Array.isArray(statuses)) {
                    // Multi-order: { orderId: { status, ... } }
                    for (const [id, info] of Object.entries(statuses)) {
                        const order = orderHistory.find(o => String(o.order_id) === String(id));
                        if (order && info.status) {
                            order.status = capitalizeFirst(info.status);
                            if (info.remains !== undefined) order.remains = info.remains;
                        }
                    }
                } else if (statuses.status) {
                    // Single order response
                    const order = orderHistory.find(o => String(o.order_id) === String(ids[0]));
                    if (order) order.status = capitalizeFirst(statuses.status);
                }
                saveHistory();
                renderHistory();
            }
        } catch (e) {
            console.error('[FB-SVC] refreshAllStatuses error:', e);
        }
    }

    function capitalizeFirst(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    // =====================================================
    // FACEBOOK PAGE POSTS
    // =====================================================

    async function fetchFacebookPages() {
        try {
            const res = await fetch(`${RENDER_SERVER}/facebook/crm-teams`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (!res.ok) return [];
            const data = await res.json();
            return data.data || data || [];
        } catch { return []; }
    }

    async function fetchPagePosts(pageId) {
        try {
            const res = await fetch(`${RENDER_SERVER}/facebook/livevideo?pageid=${pageId}&limit=10`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (!res.ok) return [];
            const data = await res.json();
            return data.data || [];
        } catch { return []; }
    }

    function getToken() {
        try {
            const auth = JSON.parse(localStorage.getItem('bearer_token_data') || '{}');
            return auth.access_token || '';
        } catch { return ''; }
    }

    // =====================================================
    // BALANCE
    // =====================================================

    let currentBalance = null;

    async function loadBalance() {
        const balData = await fetchBalance();
        const el = document.getElementById('balanceText');
        if (balData && balData.balance !== undefined) {
            currentBalance = Number(balData.balance);
            const vnd = Math.round(currentBalance * USD_TO_VND);
            el.textContent = `$${currentBalance.toFixed(2)} (~${vnd.toLocaleString()}\u0111)`;
            updateWalletBalance();
        } else {
            el.textContent = 'L\u1ed7i';
        }
    }

    // =====================================================
    // WALLET TAB
    // =====================================================

    function updateWalletBalance() {
        if (currentBalance === null) return;
        const vnd = Math.round(currentBalance * USD_TO_VND);
        document.getElementById('walletBalanceUSD').textContent = `$${currentBalance.toFixed(2)}`;
        document.getElementById('walletBalanceVND').textContent = `~${vnd.toLocaleString()} VND`;
    }

    function updateSpendingStats() {
        const total = orderHistory.length;
        const spent = orderHistory.reduce((sum, o) => sum + parseFloat(o.total || 0), 0);
        const completed = orderHistory.filter(o => o.status === 'Completed').length;
        const pending = orderHistory.filter(o => o.status === 'Pending' || o.status === 'Processing' || o.status === 'In progress').length;

        document.getElementById('statTotalOrders').textContent = total;
        document.getElementById('statTotalSpent').textContent = `$${spent.toFixed(2)}`;
        document.getElementById('statCompleted').textContent = completed;
        document.getElementById('statPending').textContent = pending;
    }

    function updateCreateQRButton() {
        const amount = parseInt(document.getElementById('depositAmount').value) || 0;
        document.getElementById('btnCreateQR').disabled = amount < 10000;
    }

    function setupWalletEvents() {
        // Quick amount buttons
        document.querySelectorAll('.quick-amount-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.quick-amount-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById('depositAmount').value = btn.dataset.amount;
                updateDepositUSD();
                updateCreateQRButton();
            });
        });

        // Deposit amount input
        document.getElementById('depositAmount').addEventListener('input', () => {
            document.querySelectorAll('.quick-amount-btn').forEach(b => b.classList.remove('active'));
            updateDepositUSD();
            updateCreateQRButton();
        });

        // Create QR button
        document.getElementById('btnCreateQR').addEventListener('click', async () => {
            const amount = parseInt(document.getElementById('depositAmount').value) || 0;
            if (amount < 10000) return;

            const btn = document.getElementById('btnCreateQR');
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i> \u0110ang t\u1ea1o m\u00e3...';
            if (typeof lucide !== 'undefined') lucide.createIcons();

            try {
                const result = await createPayment(amount);
                if (result.success && result.data) {
                    showQRResult(result.data, amount);
                } else {
                    alert(result.error || 'Kh\u00f4ng th\u1ec3 t\u1ea1o m\u00e3 QR');
                }
            } catch (e) {
                alert('L\u1ed7i: ' + e.message);
            }

            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="qr-code"></i> T\u1ea1o m\u00e3 QR n\u1ea1p ti\u1ec1n';
            if (typeof lucide !== 'undefined') lucide.createIcons();
            updateCreateQRButton();
        });

        // Copy buttons
        document.querySelectorAll('.btn-copy').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.dataset.copy;
                const text = document.getElementById(targetId).textContent;
                navigator.clipboard.writeText(text).then(() => {
                    btn.innerHTML = '<i data-lucide="check"></i>';
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                    setTimeout(() => {
                        btn.innerHTML = '<i data-lucide="copy"></i>';
                        if (typeof lucide !== 'undefined') lucide.createIcons();
                    }, 1500);
                });
            });
        });

        // Header deposit button → switch to wallet tab
        const headerBtn = document.getElementById('btnHeaderDeposit');
        if (headerBtn) {
            headerBtn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                document.querySelector('.tab-btn[data-tab="wallet"]').classList.add('active');
                document.getElementById('tabWallet').classList.add('active');
            });
        }

        // Refresh balance
        document.getElementById('btnRefreshBalance').addEventListener('click', async () => {
            const btn = document.getElementById('btnRefreshBalance');
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i> \u0110ang t\u1ea3i...';
            if (typeof lucide !== 'undefined') lucide.createIcons();
            await loadBalance();
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="refresh-cw"></i> L\u00e0m m\u1edbi';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        });
    }

    function showQRResult(data, amount) {
        const container = document.getElementById('qrResult');
        document.getElementById('qrBankName').textContent = data.bank_name || '--';
        document.getElementById('qrAccountNumber').textContent = data.bank_account_number || '--';
        document.getElementById('qrAccountName').textContent = data.bank_account_name || '--';
        document.getElementById('qrAmount').textContent = Number(amount).toLocaleString() + ' VND';
        document.getElementById('qrTransferContent').textContent = data.transfer_content || '--';

        const qrImg = document.getElementById('qrImage');
        if (data.QRCodeImage) {
            qrImg.src = data.QRCodeImage;
            qrImg.style.display = 'block';
        } else {
            qrImg.style.display = 'none';
        }

        container.style.display = 'block';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function updateDepositUSD() {
        const vnd = parseInt(document.getElementById('depositAmount').value) || 0;
        const usd = vnd / USD_TO_VND;
        document.getElementById('depositUSD').textContent = `~$${usd.toFixed(2)}`;
    }

    // =====================================================
    // TABS
    // =====================================================

    function setupTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                const tabId = 'tab' + capitalizeFirst(btn.dataset.tab);
                document.getElementById(tabId).classList.add('active');
            });
        });
    }

    // =====================================================
    // EVENT LISTENERS
    // =====================================================

    function setupEvents() {
        // Category filter
        document.getElementById('categorySelect').addEventListener('change', filterServices);

        // Search
        document.getElementById('serviceSearch').addEventListener('input', filterServices);

        // Service select dropdown
        document.getElementById('serviceSelect').addEventListener('change', (e) => {
            selectService(e.target.value);
        });

        // Service list click
        document.getElementById('servicesList').addEventListener('click', (e) => {
            const item = e.target.closest('.service-item');
            if (item) selectService(item.dataset.id);
        });

        // Quantity change
        document.getElementById('quantityInput').addEventListener('input', () => {
            updateTotal();
            updateSubmitButton();
        });

        // Link change
        document.getElementById('linkInput').addEventListener('input', updateSubmitButton);

        // Submit
        document.getElementById('btnSubmitOrder').addEventListener('click', submitOrder);

        // Pick from page → open post selection modal
        document.getElementById('btnPickFromPage').addEventListener('click', () => {
            openPostModal();
        });

        // Wallet events
        setupWalletEvents();

        // Refresh all statuses
        document.getElementById('btnRefreshAll').addEventListener('click', refreshAllStatuses);

        // Clear history
        document.getElementById('btnClearHistory').addEventListener('click', () => {
            if (confirm('X\u00f3a to\u00e0n b\u1ed9 l\u1ecbch s\u1eed \u0111\u01a1n h\u00e0ng?')) {
                orderHistory = [];
                saveHistory();
                renderHistory();
            }
        });
    }

    // =====================================================
    // POST SELECTION MODAL (Pancake API)
    // =====================================================

    const PANCAKE_PAGE_ID = '270136663390370'; // NhiJudy Store
    let cachedPancakePosts = [];
    let filteredPancakePosts = [];
    let currentPostTab = 'live'; // 'live' | 'video' | 'post'

    function postMatchesTab(post, tab) {
        if (tab === 'live') return post.type === 'livestream';
        if (tab === 'video') return post.type === 'video';
        // 'post' = mọi thứ không phải live/video
        return post.type !== 'livestream' && post.type !== 'video';
    }

    function setPostTab(tab) {
        currentPostTab = tab;
        document.querySelectorAll('#postTabs .fb-post-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        filterPancakePosts();
    }
    window.setPostTab = setPostTab;

    function openPostModal() {
        const modal = document.getElementById('postModal');
        if (modal) modal.classList.add('show');
        document.getElementById('postLoading').style.display = 'flex';
        document.getElementById('postList').innerHTML = '';

        if (cachedPancakePosts.length === 0) {
            fetchPancakePosts();
        } else {
            filterPancakePosts();
        }
    }

    function closePostModal() {
        const modal = document.getElementById('postModal');
        if (modal) modal.classList.remove('show');
    }

    // Load pancake account (token + userId + pageIds) from Render DB
    async function loadPancakeAccountFromRender() {
        try {
            const res = await fetch(`${RENDER_SERVER}/api/realtime/credentials/pancake`);
            const data = await res.json();
            if (data && data.found && data.token) {
                console.log('[FB-SVC] Loaded Pancake account from Render DB, pages:', (data.pageIds || []).length);
                return data;
            }
        } catch (e) {
            console.warn('[FB-SVC] loadPancakeAccountFromRender error:', e.message);
        }
        return null;
    }

    async function fetchPancakePosts() {
        try {
            // Strategy 0: Try Render DB credential first
            const renderAcc = await loadPancakeAccountFromRender();
            if (renderAcc && renderAcc.token) {
                const url = `${CF_WORKER}/api/pancake-direct/pages/posts?types=&current_count=0&page_id=${PANCAKE_PAGE_ID}&jwt=${encodeURIComponent(renderAcc.token)}&page_ids=${PANCAKE_PAGE_ID}&access_token=${encodeURIComponent(renderAcc.token)}`;
                try {
                    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
                    const result = await res.json();
                    if (result.success && result.data) {
                        cachedPancakePosts = result.data;
                        filteredPancakePosts = cachedPancakePosts;
                        filterPancakePosts();
                        console.log('[FB-SVC] Loaded', cachedPancakePosts.length, 'posts via Render DB account');
                        return;
                    }
                    console.warn('[FB-SVC] Render DB account failed:', result.message);
                } catch (e) {
                    console.warn('[FB-SVC] Render DB account error:', e.message);
                }
            }

            if (!window.pancakeTokenManager) {
                throw new Error('PancakeTokenManager ch\u01b0a kh\u1edfi t\u1ea1o');
            }

            // Strategy 1: Try internal API with all JWT accounts
            const accounts = window.pancakeTokenManager.getAllAccounts();
            const entries = Object.entries(accounts);
            entries.sort(([, a], [, b]) => {
                if (a.name === 'K\u1ef9 Thu\u1eadt NJD') return -1;
                if (b.name === 'K\u1ef9 Thu\u1eadt NJD') return 1;
                return 0;
            });

            for (const [, account] of entries) {
                if (!account.token) continue;
                console.log('[FB-SVC] Trying account:', account.name);
                const url = `${CF_WORKER}/api/pancake-direct/pages/posts?types=&current_count=0&page_id=${PANCAKE_PAGE_ID}&jwt=${encodeURIComponent(account.token)}&page_ids=${PANCAKE_PAGE_ID}&access_token=${encodeURIComponent(account.token)}`;
                try {
                    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
                    const result = await res.json();
                    if (result.success && result.data) {
                        cachedPancakePosts = result.data;
                        filteredPancakePosts = cachedPancakePosts;
                        filterPancakePosts();
                        console.log('[FB-SVC] Loaded', cachedPancakePosts.length, 'posts via', account.name);
                        return;
                    }
                    console.warn('[FB-SVC] Account', account.name, 'failed:', result.message);
                } catch (e) {
                    console.warn('[FB-SVC] Account', account.name, 'error:', e.message);
                }
            }

            // Strategy 2: Fallback to official API with page_access_token
            console.log('[FB-SVC] Trying official API...');
            let pat = window.pancakeTokenManager.getPageAccessToken(PANCAKE_PAGE_ID);
            if (!pat && window.pancakeTokenManager.generatePageAccessToken) {
                pat = await window.pancakeTokenManager.generatePageAccessToken(PANCAKE_PAGE_ID);
            }
            if (pat) {
                const now = Math.floor(Date.now() / 1000);
                const since = now - (90 * 24 * 60 * 60);
                const url = `${CF_WORKER}/api/pancake-official/pages/${PANCAKE_PAGE_ID}/posts?page_access_token=${encodeURIComponent(pat)}&since=${since}&until=${now}&page_number=1&page_size=30`;
                const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
                const result = await res.json();
                if (result.success && result.posts) {
                    cachedPancakePosts = result.posts;
                    filteredPancakePosts = cachedPancakePosts;
                    filterPancakePosts();
                    console.log('[FB-SVC] Loaded', cachedPancakePosts.length, 'posts via official API');
                    return;
                }
            }

            throw new Error('Phi\u00ean \u0111\u0103ng nh\u1eadp Pancake \u0111\u00e3 h\u1ebft h\u1ea1n');
        } catch (error) {
            console.error('[FB-SVC] fetchPancakePosts error:', error);
            document.getElementById('postLoading').style.display = 'none';
            document.getElementById('postList').innerHTML = `
                <div style="padding: 40px; text-align: center; color: var(--danger);">
                    <i data-lucide="alert-circle" style="width:32px;height:32px;margin:0 auto 12px;display:block;"></i>
                    <p>Kh\u00f4ng th\u1ec3 t\u1ea3i danh s\u00e1ch b\u00e0i vi\u1ebft.</p>
                    <p style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">${error.message}</p>
                    <button onclick="retryFetchPosts()"
                        style="margin-top: 12px; padding: 8px 20px; background: var(--primary); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">
                        <i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline;"></i> Th\u1eed l\u1ea1i
                    </button>
                </div>
            `;
        }
    }

    function renderPancakePosts(posts) {
        document.getElementById('postLoading').style.display = 'none';
        if (!posts || posts.length === 0) {
            document.getElementById('postList').innerHTML = `
                <div style="padding: 40px; text-align: center; color: var(--text-muted);">
                    <p>Kh\u00f4ng c\u00f3 b\u00e0i vi\u1ebft n\u00e0o.</p>
                </div>`;
            return;
        }

        const imgProxy = `${CF_WORKER}/api/image-proxy?url=`;
        const listEl = document.getElementById('postList');

        // Use DocumentFragment + event delegation for performance
        const fragment = document.createDocumentFragment();
        const container = document.createElement('div');

        for (const post of posts) {
            const thumb = post.attachments?.data?.[0]?.url || null;
            const multiImg = (post.attachments?.data?.length || 0) > 1;
            let title = post.message || 'Kh\u00f4ng c\u00f3 ti\u00eau \u0111\u1ec1';
            if (title.length > 80) title = title.substring(0, 80) + '...';

            const date = new Date(post.inserted_at);
            const dateStr = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const timeStr = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

            const postUrl = post.attachments?.target?.url || `https://www.facebook.com/${post.id}`;

            let typeLabel = '';
            if (post.type === 'livestream') typeLabel = '<span class="type-icon">LIVE</span>';
            else if (post.type === 'video') typeLabel = '<span class="type-icon">VIDEO</span>';

            let meta = '';
            if (post.comment_count > 0) meta += `<span>\u{1F4AC} ${post.comment_count}</span>`;
            if (post.share_count > 0) meta += `<span>\u{1F504} ${post.share_count}</span>`;
            if (post.phone_number_count > 0) meta += `<span>\u{1F4DE} ${post.phone_number_count}</span>`;

            const thumbUrl = thumb ? imgProxy + encodeURIComponent(thumb) : '';

            const row = document.createElement('div');
            row.className = 'fb-post-item';
            row.dataset.url = postUrl;
            row.dataset.id = post.id;
            row.dataset.thumb = thumbUrl;
            row.dataset.title = title;
            row.innerHTML = `<div class="fb-post-thumb">
                    ${thumb ? `<img src="${thumbUrl}" alt="" loading="lazy" onerror="this.style.display='none'">` : '<span class="no-img">\u{1F5BC}</span>'}
                    ${multiImg ? `<span class="type-icon">+${post.attachments.data.length - 1}</span>` : ''}
                    ${typeLabel}
                </div>
                <div class="fb-post-info">
                    <div class="fb-post-title">${title}</div>
                    <div class="fb-post-date">${dateStr} ${timeStr}</div>
                    ${meta ? `<div class="fb-post-meta">${meta}</div>` : ''}
                </div>
                <div class="fb-post-actions">
                    <button class="fb-post-copy-btn" data-copy-id="${post.id}" title="Copy ID">\u{1F4CB} ID</button>
                </div>`;
            fragment.appendChild(row);
        }

        listEl.innerHTML = '';
        listEl.appendChild(fragment);

        // Event delegation for clicks
        listEl.onclick = (e) => {
            const copyBtn = e.target.closest('.fb-post-copy-btn');
            if (copyBtn) {
                e.stopPropagation();
                navigator.clipboard.writeText(copyBtn.dataset.copyId);
                return;
            }
            const item = e.target.closest('.fb-post-item');
            if (item) selectPancakePost(item.dataset.url, item.dataset.thumb, item.dataset.title);
        };
    }

    function filterPancakePosts() {
        const term = (document.getElementById('postFilterInput')?.value || '').toLowerCase().trim();
        let list = cachedPancakePosts.filter(p => postMatchesTab(p, currentPostTab));
        if (term) list = list.filter(p => (p.message || '').toLowerCase().includes(term));
        filteredPancakePosts = list;
        renderPancakePosts(filteredPancakePosts);
    }

    function selectPancakePost(postUrl, thumbUrl, title) {
        document.getElementById('linkInput').value = postUrl;
        updateSubmitButton();

        // Show preview
        const preview = document.getElementById('selectedPostPreview');
        const thumbImg = document.getElementById('selectedPostThumb');
        const titleEl = document.getElementById('selectedPostTitle');
        if (preview && thumbImg && titleEl) {
            if (thumbUrl) {
                thumbImg.src = thumbUrl;
                thumbImg.style.display = 'block';
            } else {
                thumbImg.style.display = 'none';
            }
            titleEl.textContent = title || 'B\u00e0i vi\u1ebft \u0111\u00e3 ch\u1ecdn';
            preview.style.display = 'flex';
        }

        closePostModal();
    }

    function clearSelectedPost() {
        document.getElementById('linkInput').value = '';
        updateSubmitButton();
        const preview = document.getElementById('selectedPostPreview');
        if (preview) preview.style.display = 'none';
    }

    function retryFetchPosts() {
        cachedPancakePosts = [];
        document.getElementById('postLoading').style.display = 'flex';
        document.getElementById('postList').innerHTML = '';
        fetchPancakePosts();
    }

    // Expose modal functions for inline onclick
    window.openPostModal = openPostModal;
    window.closePostModal = closePostModal;
    window.filterPancakePosts = filterPancakePosts;
    window.selectPancakePost = selectPancakePost;
    window.clearSelectedPost = clearSelectedPost;
    window.retryFetchPosts = retryFetchPosts;

    // =====================================================
    // Expose functions for inline onclick
    // =====================================================

    window._fbSvc = {
        async checkStatus(orderId) {
            try {
                const result = await checkOrderStatus(orderId);
                if (result.success && result.data) {
                    const status = result.data.status || 'Unknown';
                    const order = orderHistory.find(o => String(o.order_id) === String(orderId));
                    if (order) {
                        order.status = capitalizeFirst(status);
                        if (result.data.remains !== undefined) order.remains = result.data.remains;
                        saveHistory();
                        renderHistory();
                    }
                }
            } catch (e) {
                console.error('[FB-SVC] checkStatus error:', e);
            }
        },
        async cancelOrd(orderId) {
            if (!confirm(`H\u1ee7y \u0111\u01a1n #${orderId}?`)) return;
            try {
                const result = await cancelOrder(orderId);
                if (result.success) {
                    const order = orderHistory.find(o => String(o.order_id) === String(orderId));
                    if (order) order.status = 'Canceled';
                    saveHistory();
                    renderHistory();
                } else {
                    alert(result.error || result.data?.error || 'Kh\u00f4ng th\u1ec3 h\u1ee7y');
                }
            } catch (e) {
                alert('L\u1ed7i: ' + e.message);
            }
        }
    };

    // =====================================================
    // INIT
    // =====================================================

    async function init() {
        const mainContainer = document.getElementById('mainContainer');
        if (mainContainer) mainContainer.style.display = 'block';

        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Initialize PancakeTokenManager for post selection
        if (window.pancakeTokenManager && window.pancakeTokenManager.init) {
            window.pancakeTokenManager.init().catch(e => console.warn('[FB-SVC] PancakeToken init:', e.message));
        }

        setupTabs();
        setupEvents();

        // Post tabs (Live / Video / Bài viết)
        document.getElementById('postTabs')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.fb-post-tab');
            if (btn) setPostTab(btn.dataset.tab);
        });
        loadHistory();
        renderHistory();

        // Load balance + wallet stats
        loadBalance();
        updateSpendingStats();

        // Load services
        allServices = await fetchServices();
        if (allServices.length) {
            const categories = getCategories(allServices);
            renderCategorySelect(categories);
            renderServiceSelect(allServices);
            renderServicesList(allServices);
        } else {
            document.getElementById('servicesList').innerHTML = '<div class="loading-state"><span>Kh\u00f4ng th\u1ec3 t\u1ea3i d\u1ecbch v\u1ee5. Ki\u1ec3m tra API key.</span></div>';
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Auto-refresh statuses
        refreshAllStatuses();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
