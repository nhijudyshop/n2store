// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// FACEBOOK ADS MANAGER - Frontend (Full Features)
// =====================================================

// FB SDK init MUST run before SDK script loads
const FB_APP_ID = '1290728302927895';
window.fbAsyncInit = function() {
    FB.init({ appId: FB_APP_ID, cookie: false, xfbml: false, version: 'v21.0' });
    console.log('[FB-ADS] Facebook SDK initialized');
    if (typeof FBAds !== 'undefined') FBAds.checkAuthAfterSDK();
};

const FBAds = (() => {
    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:3000/api/fb-ads'
        : 'https://n2store-fallback.onrender.com/api/fb-ads';

    // State
    let currentTab = 'campaigns';
    let selectedAccountId = null;
    let campaigns = [];
    let adsets = [];
    let ads = [];
    let insights = {};
    let adAccounts = [];
    let pages = [];
    let selectedInterests = [];
    let selectedIds = new Set();

    // =====================================================
    // INIT
    // =====================================================
    let _authChecked = false;
    function init() { checkAuthStatus(); loadSavedAccounts(); }
    function checkAuthAfterSDK() {
        // Avoid double-check — init() already called checkAuthStatus
        if (!_authChecked) checkAuthStatus();
    }

    // =====================================================
    // AUTH
    // =====================================================
    async function checkAuthStatus() {
        _authChecked = true;
        try {
            const res = await fetch(API_BASE + '/auth/status').then(r => r.json());
            if (res.success && res.authenticated) {
                onLoginSuccess(res.user);
            } else if (res.needsRefresh && res.user) {
                // Token expired — try cookie refresh first, then SDK
                console.log('[FB-ADS] Token needs refresh...');
                toast('Đang cập nhật token...', 'info');
                const cookieRefreshed = await cookieTokenRefresh();
                if (cookieRefreshed) {
                    onLoginSuccess(res.user);
                } else {
                    await silentTokenRefresh();
                }
            }
        } catch (e) { /* server error */ }
    }

    async function silentTokenRefresh() {
        if (typeof FB === 'undefined') {
            toast('Cần đăng nhập lại Facebook', 'error');
            return;
        }
        // Try FB.login silently — if user already authorized app, no popup needed
        FB.login(function(response) {
            if (response.authResponse) {
                const { accessToken, userID } = response.authResponse;
                FB.api('/me', { fields: 'name' }, async function(me) {
                    try {
                        const res = await fetch(API_BASE + '/auth/token', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ accessToken, userID, name: me?.name || 'User' })
                        }).then(r => r.json());
                        if (res.success) {
                            toast('Token đã được cập nhật!', 'success');
                            onLoginSuccess(res.user);
                        }
                    } catch (e) { toast('Lỗi refresh token', 'error'); }
                });
            } else {
                toast('Cần đăng nhập lại Facebook', 'error');
            }
        }, { scope: 'ads_management,ads_read,business_management,pages_read_engagement,pages_manage_ads', auth_type: 'reauthorize' });
    }

    function login() {
        if (typeof FB === 'undefined') {
            toast('Facebook SDK chưa tải xong, thử lại...', 'error');
            return;
        }
        FB.login(function(response) {
            if (response.authResponse) {
                const { accessToken, userID } = response.authResponse;
                FB.api('/me', { fields: 'name' }, async function(me) {
                    try {
                        const res = await api('/auth/token', {
                            method: 'POST',
                            body: { accessToken, userID, name: me.name }
                        });
                        if (res.success) {
                            toast(`Xin chào ${res.user.name}! Token: ${Math.round(res.expiresIn / 86400)} ngày`, 'success');
                            onLoginSuccess(res.user);
                        }
                    } catch (err) { toast('Lỗi đăng nhập: ' + err.message, 'error'); }
                });
            } else { toast('Đăng nhập bị hủy', 'error'); }
        }, { scope: 'ads_management,ads_read,business_management,pages_read_engagement,pages_manage_ads' });
    }

    // =====================================================
    // SAVED ACCOUNTS
    // =====================================================
    async function loadSavedAccounts() {
        try {
            const res = await fetch(API_BASE + '/auth/saved-accounts').then(r => r.json());
            if (!res.success || !res.data?.length) return;

            const section = document.getElementById('savedAccountsSection');
            const list = document.getElementById('savedAccountsList');
            section.style.display = '';

            list.innerHTML = res.data.map(a => `
                <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--fb-surface);border:1px solid var(--fb-border);border-radius:var(--radius);cursor:pointer;transition:all 0.15s"
                     onmouseover="this.style.borderColor='var(--fb-primary)'" onmouseout="this.style.borderColor='var(--fb-border)'"
                     onclick="FBAds.switchAccount('${a.user_id}')">
                    <div style="width:40px;height:40px;background:var(--fb-primary);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px">${(a.name || '?')[0].toUpperCase()}</div>
                    <div style="flex:1">
                        <div style="font-weight:600;font-size:14px">${a.name || a.user_id}</div>
                        <div style="font-size:12px;color:var(--fb-text-light)">Token: còn ${a.days_left} ngày</div>
                    </div>
                    <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();FBAds.removeSavedAccount('${a.user_id}')" title="Xóa">&#128465;</button>
                </div>
            `).join('');
        } catch (e) { /* no saved accounts */ }
    }

    async function switchAccount(userId) {
        try {
            const res = await api('/auth/switch', { method: 'POST', body: { user_id: userId } });
            if (res.success) {
                toast(`Đã chuyển sang ${res.user.name}`, 'success');
                onLoginSuccess(res.user);
            }
        } catch (err) { toast('Lỗi: ' + err.message, 'error'); }
    }

    async function removeSavedAccount(userId) {
        if (!confirm('Xóa tài khoản đã lưu này?')) return;
        try {
            await fetch(API_BASE + '/auth/saved-accounts/' + userId, { method: 'DELETE' });
            toast('Đã xóa', 'success');
            loadSavedAccounts();
            refreshAccountDropdown();
        } catch (e) { toast('Lỗi', 'error'); }
    }

    // Account dropdown in topbar
    function toggleAccountMenu() {
        const dd = document.getElementById('accountDropdown');
        dd.style.display = dd.style.display === 'none' ? '' : 'none';
    }

    async function refreshAccountDropdown() {
        try {
            const res = await fetch(API_BASE + '/auth/saved-accounts').then(r => r.json());
            const list = document.getElementById('accountDropdownList');
            if (!res.success || !res.data?.length) {
                list.innerHTML = '<div style="padding:12px 14px;color:var(--fb-text-light);font-size:13px">Chưa có tài khoản nào</div>';
                return;
            }
            const currentUser = document.getElementById('userName').textContent;
            list.innerHTML = res.data.map(a => {
                const isCurrent = a.name === currentUser;
                return `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;transition:background 0.1s;${isCurrent ? 'background:#e7f3ff;' : ''}"
                    onmouseover="this.style.background='${isCurrent ? '#d4e8ff' : '#f8f9fa'}'" onmouseout="this.style.background='${isCurrent ? '#e7f3ff' : ''}'"
                    onclick="FBAds.switchAccount('${a.user_id}');FBAds.toggleAccountMenu()">
                    <div style="width:32px;height:32px;background:${isCurrent ? 'var(--fb-primary)' : '#65676b'};border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px">${(a.name || '?')[0].toUpperCase()}</div>
                    <div style="flex:1;min-width:0">
                        <div style="font-weight:${isCurrent ? '700' : '500'};font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.name || a.user_id)}${isCurrent ? ' &#10003;' : ''}</div>
                        <div style="font-size:11px;color:var(--fb-text-light)">Còn ${a.days_left} ngày</div>
                    </div>
                    <button class="btn btn-outline btn-sm" style="padding:2px 6px;font-size:11px" onclick="event.stopPropagation();FBAds.removeSavedAccount('${a.user_id}');FBAds.toggleAccountMenu()">&#10005;</button>
                </div>`;
            }).join('');
        } catch (e) { /* ignore */ }
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        const switcher = document.getElementById('accountSwitcher');
        const dd = document.getElementById('accountDropdown');
        if (switcher && dd && !switcher.contains(e.target)) {
            dd.style.display = 'none';
        }
    });

    // =====================================================
    // COOKIE-BASED AUTH (No SDK required)
    // =====================================================
    async function loginWithCookies() {
        const input = document.getElementById('cookieInput');
        const statusEl = document.getElementById('cookieStatus');
        const btn = document.getElementById('cookieLoginBtn');
        const cookieStr = (input?.value || '').trim();

        if (!cookieStr) {
            toast('Paste cookies vào ô trước khi đăng nhập', 'error');
            return;
        }

        // Validate basic format
        if (!cookieStr.includes('c_user=')) {
            toast('Thiếu cookie c_user. Hãy copy đầy đủ cookies từ Facebook.', 'error');
            return;
        }
        if (!cookieStr.includes('xs=')) {
            toast('Thiếu cookie xs. Hãy copy đầy đủ cookies từ Facebook.', 'error');
            return;
        }

        // Show loading state
        btn.disabled = true;
        btn.textContent = 'Đang xử lý...';
        statusEl.style.display = '';
        statusEl.style.color = 'var(--fb-primary)';
        statusEl.textContent = '⏳ Đang trích xuất access token từ cookies...';

        try {
            const res = await api('/auth/cookie-login', {
                method: 'POST',
                body: { cookies: cookieStr }
            });

            if (res.success) {
                toast(`Đăng nhập thành công: ${res.user.name}! (Cookie mode)`, 'success');
                statusEl.style.color = 'var(--fb-success)';
                statusEl.textContent = `✅ Đã đăng nhập: ${res.user.name}`;

                // Save cookies to localStorage for auto-refresh
                try {
                    localStorage.setItem('fb_ads_cookies', cookieStr);
                } catch (e) { /* ignore */ }

                onLoginSuccess(res.user);
            }
        } catch (err) {
            statusEl.style.color = 'var(--fb-danger)';
            statusEl.textContent = `❌ ${err.message}`;
            toast('Lỗi: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = '🔐 Đăng nhập với Cookie';
        }
    }

    function showCookieHelp() {
        openModal('cookieHelpModal');
    }

    // Auto-refresh cookie token when expired
    async function cookieTokenRefresh() {
        const savedCookies = localStorage.getItem('fb_ads_cookies');
        if (!savedCookies) return false;

        try {
            const res = await api('/auth/cookie-refresh', {
                method: 'POST',
                body: { cookies: savedCookies }
            });
            if (res.success) {
                console.log('[FB-ADS] Cookie token refreshed');
                return true;
            }
        } catch (e) {
            console.log('[FB-ADS] Cookie refresh failed:', e.message);
            localStorage.removeItem('fb_ads_cookies');
        }
        return false;
    }

    // Listen for cookie messages from extension
    window.addEventListener('message', function(event) {
        if (event.data && event.data.type === 'FB_COOKIES_FROM_EXTENSION') {
            const input = document.getElementById('cookieInput');
            if (input) {
                input.value = event.data.cookies;
                toast('Cookies đã được điền từ Extension! Bấm đăng nhập.', 'info');
            }
        }
    });

    function onLoginSuccess(user) {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainApp').style.display = '';
        document.getElementById('loginBtn').style.display = 'none';
        document.getElementById('logoutBtn').style.display = '';
        document.getElementById('settingsBtn').style.display = '';
        document.getElementById('userInfo').style.display = 'flex';
        document.getElementById('userName').textContent = user.name;
        document.getElementById('currentAccountAvatar').textContent = (user.name || '?')[0].toUpperCase();
        loadAdAccounts();
        loadPages();
        refreshAccountDropdown();
    }

    async function logout() {
        await api('/auth/logout', { method: 'POST' });
        document.getElementById('loginScreen').style.display = '';
        document.getElementById('mainApp').style.display = 'none';
        document.getElementById('loginBtn').style.display = '';
        document.getElementById('logoutBtn').style.display = 'none';
        document.getElementById('settingsBtn').style.display = 'none';
        document.getElementById('userInfo').style.display = 'none';
        document.getElementById('accountDropdown').style.display = 'none';
        selectedAccountId = null;
        toast('Đã đăng xuất', 'info');
    }

    // =====================================================
    // AD ACCOUNTS & PAGES
    // =====================================================
    async function loadAdAccounts() {
        try {
            const res = await api('/ad-accounts');
            adAccounts = res.data || [];
            const select = document.getElementById('accountSelector');
            select.innerHTML = '<option value="">Chọn tài khoản quảng cáo...</option>';
            adAccounts.forEach(acc => {
                const st = acc.account_status === 1 ? '' : ' [Vô hiệu]';
                const opt = document.createElement('option');
                opt.value = acc.account_id;
                opt.textContent = `${acc.name || acc.account_id}${st} — ${acc.currency || 'VND'}`;
                select.appendChild(opt);
            });
            if (adAccounts.length === 1) {
                select.value = adAccounts[0].account_id;
                selectAccount(adAccounts[0].account_id);
            } else if (adAccounts.length === 0) {
                toast('Không tìm thấy tài khoản QC', 'error');
            }
        } catch (err) { toast('Lỗi tải tài khoản: ' + err.message, 'error'); }
    }

    async function loadPages() {
        try {
            const res = await api('/pages');
            pages = res.data || [];
        } catch (e) { console.log('[FB-ADS] Pages load error:', e.message); }
    }

    function selectAccount(accountId) {
        selectedAccountId = accountId;
        if (accountId) refreshData();
    }

    // =====================================================
    // DATA LOADING
    // =====================================================
    async function refreshData() {
        if (!selectedAccountId) { toast('Chọn tài khoản QC', 'error'); return; }
        selectedIds.clear();
        updateBulkUI();
        await Promise.all([loadCampaigns(), loadInsights()]);
    }

    async function loadCampaigns() {
        showTableLoading('campaignsBody', 11);
        try {
            const res = await api(`/campaigns?account_id=${selectedAccountId}`);
            campaigns = res.data || [];
            document.getElementById('campaignCount').textContent = campaigns.length;
            renderCurrentTab();

            const [adsetsRes, adsRes] = await Promise.all([
                api(`/adsets?account_id=${selectedAccountId}`),
                api(`/ads?account_id=${selectedAccountId}`)
            ]);
            adsets = adsetsRes.data || [];
            ads = adsRes.data || [];
            document.getElementById('adsetCount').textContent = adsets.length;
            document.getElementById('adCount').textContent = ads.length;
            renderCurrentTab();
        } catch (err) {
            document.getElementById('campaignsBody').innerHTML = errorRow(11, err.message);
        }
    }

    async function loadInsights() {
        if (!selectedAccountId) return;
        const dp = document.getElementById('datePreset').value;
        try {
            const res = await api(`/insights?account_id=${selectedAccountId}&date_preset=${dp}&level=account`);
            const d = res.data?.[0] || {};
            insights = d;
            document.getElementById('metricSpend').textContent = fmtCurrency(d.spend);
            document.getElementById('metricImpressions').textContent = fmtNum(d.impressions);
            document.getElementById('metricClicks').textContent = fmtNum(d.clicks);
            document.getElementById('metricCTR').textContent = d.ctr ? parseFloat(d.ctr).toFixed(2) + '%' : '--';
            document.getElementById('metricCPC').textContent = fmtCurrency(d.cpc);
            document.getElementById('metricReach').textContent = fmtNum(d.reach);

            const ci = await api(`/insights?account_id=${selectedAccountId}&date_preset=${dp}&level=campaign`);
            insights.byCampaign = {};
            (ci.data || []).forEach(i => { insights.byCampaign[i.campaign_id] = i; });
            renderCurrentTab();
        } catch (err) { console.log('[FB-ADS] Insights error:', err.message); }
    }

    // =====================================================
    // RENDER TABLES
    // =====================================================
    function renderCurrentTab() {
        if (currentTab === 'campaigns') renderCampaigns();
        else if (currentTab === 'adsets') renderAdSets();
        else if (currentTab === 'ads') renderAds();
    }

    function renderCampaigns() {
        const tbody = document.getElementById('campaignsBody');
        const q = getSearch();
        const list = campaigns.filter(c => !q || c.name.toLowerCase().includes(q) || c.id.includes(q));

        if (!list.length) { tbody.innerHTML = emptyRow(11, 'Chưa có chiến dịch', 'showCreateModal'); return; }

        tbody.innerHTML = list.map(c => {
            const ci = insights.byCampaign?.[c.id] || {};
            const active = c.effective_status === 'ACTIVE';
            const budget = c.daily_budget ? fmtCurrency(c.daily_budget) + '/ngày'
                : c.lifetime_budget ? fmtCurrency(c.lifetime_budget) + ' tổng' : '--';
            const res = getResults(ci.actions);

            return `<tr class="${selectedIds.has(c.id) ? 'selected' : ''}">
                <td><input type="checkbox" value="${c.id}" ${selectedIds.has(c.id) ? 'checked' : ''} onchange="FBAds.onCheckbox(this)"></td>
                <td><label class="toggle"><input type="checkbox" ${active ? 'checked' : ''} onchange="FBAds.toggleStatus('campaigns','${c.id}',this.checked)"><span class="toggle-slider"></span></label></td>
                <td><div style="font-weight:600">${esc(c.name)}</div><div style="font-size:12px;color:var(--fb-text-light)">${c.id}</div></td>
                <td><span class="status-badge ${statusClass(c.effective_status)}"><span class="status-dot"></span> ${statusText(c.effective_status)}</span></td>
                <td>${budget}</td>
                <td>${fmtCurrency(ci.spend)}</td>
                <td>${res.value || '--'}</td>
                <td>${res.cost || '--'}</td>
                <td>${fmtNum(ci.impressions)}</td>
                <td>${fmtNum(ci.reach)}</td>
                <td>
                    <button class="btn btn-outline btn-sm" onclick="FBAds.editCampaign('${c.id}')" title="Sửa">&#9998;</button>
                    <button class="btn btn-outline btn-sm" onclick="FBAds.viewAdSets('${c.id}')" title="Xem nhóm QC">&#128065;</button>
                    <button class="btn btn-danger btn-sm" onclick="FBAds.deleteCampaign('${c.id}')" title="Xóa">&#128465;</button>
                </td>
            </tr>`;
        }).join('');
    }

    function renderAdSets() {
        const tbody = document.getElementById('adsetsBody');
        const q = getSearch();
        const list = adsets.filter(a => !q || a.name.toLowerCase().includes(q) || a.id.includes(q));

        if (!list.length) { tbody.innerHTML = emptyRow(9, 'Chưa có nhóm QC'); return; }

        tbody.innerHTML = list.map(a => {
            const active = a.effective_status === 'ACTIVE';
            const budget = a.daily_budget ? fmtCurrency(a.daily_budget) + '/ngày'
                : a.lifetime_budget ? fmtCurrency(a.lifetime_budget) + ' tổng' : '--';
            const camp = campaigns.find(c => c.id === a.campaign_id);

            return `<tr class="${selectedIds.has(a.id) ? 'selected' : ''}">
                <td><input type="checkbox" value="${a.id}" ${selectedIds.has(a.id) ? 'checked' : ''} onchange="FBAds.onCheckbox(this)"></td>
                <td><label class="toggle"><input type="checkbox" ${active ? 'checked' : ''} onchange="FBAds.toggleStatus('adsets','${a.id}',this.checked)"><span class="toggle-slider"></span></label></td>
                <td><div style="font-weight:600">${esc(a.name)}</div><div style="font-size:12px;color:var(--fb-text-light)">${a.id}</div></td>
                <td><span class="status-badge ${statusClass(a.effective_status)}"><span class="status-dot"></span> ${statusText(a.effective_status)}</span></td>
                <td>${budget}</td>
                <td>--</td><td>--</td>
                <td style="font-size:12px">${camp ? esc(camp.name) : a.campaign_id}</td>
                <td>
                    <button class="btn btn-outline btn-sm" onclick="FBAds.viewAds('${a.id}')" title="Xem ads">&#128065;</button>
                    <button class="btn btn-outline btn-sm" onclick="FBAds.toggleStatus('adsets','${a.id}',${!active})">${active ? '&#10074;&#10074;' : '&#9654;'}</button>
                </td>
            </tr>`;
        }).join('');
    }

    function renderAds() {
        const tbody = document.getElementById('adsBody');
        const q = getSearch();
        const list = ads.filter(a => !q || a.name.toLowerCase().includes(q) || a.id.includes(q));

        if (!list.length) { tbody.innerHTML = emptyRow(8, 'Chưa có quảng cáo'); return; }

        tbody.innerHTML = list.map(a => {
            const active = a.effective_status === 'ACTIVE';
            const adset = adsets.find(s => s.id === a.adset_id);

            return `<tr class="${selectedIds.has(a.id) ? 'selected' : ''}">
                <td><input type="checkbox" value="${a.id}" ${selectedIds.has(a.id) ? 'checked' : ''} onchange="FBAds.onCheckbox(this)"></td>
                <td><label class="toggle"><input type="checkbox" ${active ? 'checked' : ''} onchange="FBAds.toggleStatus('ads','${a.id}',this.checked)"><span class="toggle-slider"></span></label></td>
                <td><div style="font-weight:600">${esc(a.name)}</div><div style="font-size:12px;color:var(--fb-text-light)">${a.id}</div></td>
                <td><span class="status-badge ${statusClass(a.effective_status)}"><span class="status-dot"></span> ${statusText(a.effective_status)}</span></td>
                <td>--</td><td>--</td>
                <td style="font-size:12px">${adset ? esc(adset.name) : a.adset_id}</td>
                <td>
                    <button class="btn btn-outline btn-sm" onclick="FBAds.toggleStatus('ads','${a.id}',${!active})">${active ? '&#10074;&#10074;' : '&#9654;'}</button>
                </td>
            </tr>`;
        }).join('');
    }

    // =====================================================
    // TAB SWITCHING
    // =====================================================
    const adsTabs = ['campaigns', 'adsets', 'ads'];
    const allPanels = ['audiences', 'pixels', 'billing', 'reports', 'rules', 'account'];

    function switchTab(tab) {
        currentTab = tab;
        selectedIds.clear();
        updateBulkUI();
        // Clear search when switching tabs (prevents stale filter from drill-down)
        document.getElementById('searchBox').value = '';
        document.querySelectorAll('#mainTabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));

        // Show/hide ads toolbar, metrics, tables
        const isAdsTab = adsTabs.includes(tab);
        document.getElementById('adsToolbar').style.display = isAdsTab ? '' : 'none';
        document.getElementById('metricsBar').style.display = isAdsTab ? '' : 'none';
        document.getElementById('adsTablesContainer').style.display = isAdsTab ? '' : 'none';

        if (isAdsTab) {
            document.getElementById('campaignsTable').style.display = tab === 'campaigns' ? '' : 'none';
            document.getElementById('adsetsTable').style.display = tab === 'adsets' ? '' : 'none';
            document.getElementById('adsTable').style.display = tab === 'ads' ? '' : 'none';
        }

        // Show/hide other panels
        allPanels.forEach(p => {
            const el = document.getElementById(p + 'Panel');
            if (el) el.style.display = p === tab ? '' : 'none';
        });

        // Render / load data for tab
        if (isAdsTab) renderCurrentTab();
        else if (tab === 'audiences') loadAudiences();
        else if (tab === 'pixels') loadPixels();
        else if (tab === 'billing') loadBilling();
        else if (tab === 'reports') loadReport();
        else if (tab === 'rules') loadRules();
        else if (tab === 'account') loadAccountDetails();
    }

    function filterTable() { renderCurrentTab(); }

    // =====================================================
    // SELECTION & BULK ACTIONS
    // =====================================================
    function onCheckbox(el) {
        if (el.checked) selectedIds.add(el.value);
        else selectedIds.delete(el.value);
        el.closest('tr').classList.toggle('selected', el.checked);
        updateBulkUI();
    }

    function toggleSelectAll(el) {
        const table = el.closest('table');
        table.querySelectorAll('tbody input[type=checkbox]').forEach(cb => {
            cb.checked = el.checked;
            if (el.checked) selectedIds.add(cb.value);
            else selectedIds.delete(cb.value);
            cb.closest('tr').classList.toggle('selected', el.checked);
        });
        updateBulkUI();
    }

    function updateBulkUI() {
        const bar = document.getElementById('bulkActions');
        if (selectedIds.size > 0) {
            bar.style.display = 'flex';
            document.getElementById('selectedCount').textContent = `${selectedIds.size} đã chọn`;
        } else {
            bar.style.display = 'none';
        }
    }

    async function bulkAction(action) {
        if (!selectedIds.size) return;
        const ids = [...selectedIds];

        if (action === 'DELETE' && !confirm(`Xóa ${ids.length} mục đã chọn?`)) return;

        try {
            if (action === 'DELETE') {
                const res = await api('/bulk/delete', { method: 'POST', body: { ids } });
                toast(`Đã xóa ${res.data.succeeded}/${res.data.total}`, 'success');
            } else {
                const res = await api('/bulk/status', { method: 'POST', body: { ids, status: action } });
                toast(`Đã cập nhật ${res.data.succeeded}/${res.data.total}`, 'success');
            }
            selectedIds.clear();
            updateBulkUI();
            refreshData();
        } catch (err) { toast('Lỗi: ' + err.message, 'error'); }
    }

    // =====================================================
    // CAMPAIGN ACTIONS
    // =====================================================
    async function toggleStatus(type, id, activate) {
        try {
            await api(`/${type}/${id}/status`, { method: 'POST', body: { status: activate ? 'ACTIVE' : 'PAUSED' } });
            toast(`Đã ${activate ? 'bật' : 'tạm dừng'}`, 'success');
            refreshData();
        } catch (err) { toast('Lỗi: ' + err.message, 'error'); refreshData(); }
    }

    function showCreateModal() {
        if (currentTab === 'campaigns') openModal('createCampaignModal');
        else if (currentTab === 'adsets') {
            populateCampaignSelect();
            openModal('createAdSetModal');
        } else if (currentTab === 'ads') {
            populateAdSetSelect();
            populatePageSelect();
            openModal('createAdModal');
        }
    }

    async function createCampaign() {
        const name = document.getElementById('campaignName').value.trim();
        const objective = document.getElementById('campaignObjective').value;
        const budget = document.getElementById('campaignBudget').value;
        const status = document.getElementById('campaignStatus').value;
        if (!name) { toast('Nhập tên chiến dịch', 'error'); return; }
        try {
            const body = {
                account_id: selectedAccountId, name, objective, status,
                is_skadnetwork_attribution: false,
                is_adset_budget_sharing_enabled: false
            };
            if (budget) body.daily_budget = parseInt(budget);
            await api('/campaigns', { method: 'POST', body });
            toast('Tạo chiến dịch thành công!', 'success');
            closeModal('createCampaignModal');
            document.getElementById('campaignName').value = '';
            document.getElementById('campaignBudget').value = '';
            refreshData();
        } catch (err) { toast('Lỗi: ' + err.message, 'error'); }
    }

    function editCampaign(id) {
        const c = campaigns.find(x => x.id === id);
        if (!c) return;
        document.getElementById('editCampaignId').value = id;
        document.getElementById('editCampaignName').value = c.name;
        document.getElementById('editCampaignBudget').value = c.daily_budget ? c.daily_budget : '';
        document.getElementById('editCampaignStatus').value = c.status;
        openModal('editCampaignModal');
    }

    async function updateCampaign() {
        const id = document.getElementById('editCampaignId').value;
        const name = document.getElementById('editCampaignName').value.trim();
        const budget = document.getElementById('editCampaignBudget').value;
        const status = document.getElementById('editCampaignStatus').value;
        if (!name) { toast('Nhập tên', 'error'); return; }
        try {
            const body = { name, status };
            if (budget) body.daily_budget = parseInt(budget);
            await api(`/campaigns/${id}/update`, { method: 'POST', body });
            toast('Đã cập nhật chiến dịch', 'success');
            closeModal('editCampaignModal');
            refreshData();
        } catch (err) { toast('Lỗi: ' + err.message, 'error'); }
    }

    async function deleteCampaign(id) {
        if (!confirm('Xóa chiến dịch này?')) return;
        try {
            await api(`/campaigns/${id}`, { method: 'DELETE' });
            toast('Đã xóa', 'success');
            refreshData();
        } catch (err) { toast('Lỗi: ' + err.message, 'error'); }
    }

    function viewAdSets(campaignId) {
        switchTab('adsets');
        const camp = campaigns.find(c => c.id === campaignId);
        document.getElementById('searchBox').value = camp ? camp.name : '';
        // Filter to just this campaign's adsets
        const filtered = adsets.filter(a => a.campaign_id === campaignId);
        if (filtered.length) {
            document.getElementById('adsetsBody').innerHTML = filtered.map(a => {
                const active = a.effective_status === 'ACTIVE';
                const budget = a.daily_budget ? fmtCurrency(a.daily_budget) + '/ngày' : '--';
                return `<tr>
                    <td><input type="checkbox" value="${a.id}" onchange="FBAds.onCheckbox(this)"></td>
                    <td><label class="toggle"><input type="checkbox" ${active ? 'checked' : ''} onchange="FBAds.toggleStatus('adsets','${a.id}',this.checked)"><span class="toggle-slider"></span></label></td>
                    <td><div style="font-weight:600">${esc(a.name)}</div><div style="font-size:12px;color:var(--fb-text-light)">${a.id}</div></td>
                    <td><span class="status-badge ${statusClass(a.effective_status)}"><span class="status-dot"></span> ${statusText(a.effective_status)}</span></td>
                    <td>${budget}</td><td>--</td><td>--</td>
                    <td style="font-size:12px">${camp ? esc(camp.name) : ''}</td>
                    <td><button class="btn btn-outline btn-sm" onclick="FBAds.viewAds('${a.id}')">&#128065;</button></td>
                </tr>`;
            }).join('');
        }
        toast(`Nhóm QC của: ${camp?.name || campaignId}`, 'info');
    }

    function viewAds(adsetId) {
        switchTab('ads');
        const filtered = ads.filter(a => a.adset_id === adsetId);
        const adset = adsets.find(s => s.id === adsetId);
        document.getElementById('searchBox').value = adset ? adset.name : '';
        renderAds();
        toast(`Quảng cáo của: ${adset?.name || adsetId}`, 'info');
    }

    // =====================================================
    // ADSET CREATION
    // =====================================================
    function populateCampaignSelect() {
        const sel = document.getElementById('adsetCampaignId');
        sel.innerHTML = campaigns.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    }

    async function searchInterests() {
        const q = document.getElementById('interestSearch').value.trim();
        if (!q) return;
        const container = document.getElementById('interestResults');
        container.innerHTML = '<div class="loading-spinner" style="margin:8px"></div>';
        try {
            const res = await api(`/targeting/search?q=${encodeURIComponent(q)}&type=adinterest`);
            container.innerHTML = (res.data || []).map(i =>
                `<div style="padding:6px 8px;cursor:pointer;font-size:13px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between" onclick="FBAds.addInterest(${i.id},'${esc(i.name)}',${i.audience_size || 0})">
                    <span>${esc(i.name)}</span>
                    <span style="color:var(--fb-text-light);font-size:11px">${fmtNum(i.audience_size)}</span>
                </div>`
            ).join('') || '<div style="padding:8px;color:var(--fb-text-light)">Không tìm thấy</div>';
        } catch (err) { container.innerHTML = `<div style="padding:8px;color:red">${err.message}</div>`; }
    }

    function addInterest(id, name, size) {
        if (selectedInterests.find(i => i.id === id)) return;
        selectedInterests.push({ id, name });
        renderSelectedInterests();
    }

    function removeInterest(id) {
        selectedInterests = selectedInterests.filter(i => i.id !== id);
        renderSelectedInterests();
    }

    function renderSelectedInterests() {
        document.getElementById('selectedInterests').innerHTML = selectedInterests.map(i =>
            `<span style="background:#e7f3ff;padding:4px 10px;border-radius:12px;font-size:12px;display:flex;align-items:center;gap:4px">
                ${esc(i.name)}
                <span style="cursor:pointer;font-weight:bold;color:var(--fb-danger)" onclick="FBAds.removeInterest(${i.id})">&times;</span>
            </span>`
        ).join('');
    }

    async function createAdSet() {
        const campaignId = document.getElementById('adsetCampaignId').value;
        const name = document.getElementById('adsetName').value.trim();
        const budget = document.getElementById('adsetBudget').value;
        const optGoal = document.getElementById('adsetOptGoal').value;
        const countries = document.getElementById('adsetCountries').value.split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
        const ageMin = parseInt(document.getElementById('adsetAgeMin').value) || 18;
        const ageMax = parseInt(document.getElementById('adsetAgeMax').value) || 65;
        const gender = parseInt(document.getElementById('adsetGender').value);
        const status = document.getElementById('adsetStatus').value;

        if (!name) { toast('Nhập tên nhóm QC', 'error'); return; }
        if (!campaignId) { toast('Chọn chiến dịch', 'error'); return; }

        const targeting = {
            geo_locations: { countries },
            age_min: ageMin,
            age_max: ageMax
        };
        if (gender > 0) targeting.genders = [gender];
        if (selectedInterests.length > 0) {
            targeting.flexible_spec = [{ interests: selectedInterests.map(i => ({ id: i.id, name: i.name })) }];
        }

        try {
            const body = {
                account_id: selectedAccountId,
                campaign_id: campaignId,
                name,
                optimization_goal: optGoal,
                billing_event: 'IMPRESSIONS',
                targeting,
                status
            };
            if (budget) body.daily_budget = parseInt(budget);
            await api('/adsets', { method: 'POST', body });
            toast('Tạo nhóm QC thành công!', 'success');
            closeModal('createAdSetModal');
            selectedInterests = [];
            refreshData();
        } catch (err) { toast('Lỗi: ' + err.message, 'error'); }
    }

    // =====================================================
    // AD CREATION
    // =====================================================
    let adType = 'post'; // 'post' = existing post, 'new' = create new content

    function setAdType(type) {
        adType = type;
        document.getElementById('adPostSection').style.display = type === 'post' ? '' : 'none';
        document.getElementById('adNewSection').style.display = type === 'new' ? '' : 'none';
        document.getElementById('adTypePost').className = type === 'post' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm';
        document.getElementById('adTypeNew').className = type === 'new' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm';
    }

    function populateAdSetSelect() {
        const sel = document.getElementById('adAdSetId');
        sel.innerHTML = adsets.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
    }

    function populatePageSelect() {
        const opts = pages.length
            ? pages.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')
            : '<option value="">Không tìm thấy Page</option>';
        document.getElementById('adPageId').innerHTML = opts;
        document.getElementById('adPageIdNew').innerHTML = opts;
        // Auto load posts for first page
        if (pages.length) loadPagePosts();
    }

    async function loadPagePosts() {
        const pageId = document.getElementById('adPageId').value;
        if (!pageId) return;
        const container = document.getElementById('pagePostsList');
        container.innerHTML = '<div style="padding:20px;text-align:center"><div class="loading-spinner"></div></div>';
        document.getElementById('selectedPostId').value = '';

        try {
            const res = await api(`/pages/${pageId}/posts?limit=20`);
            const posts = res.data || [];
            if (!posts.length) {
                container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--fb-text-light)">Chưa có bài viết nào</div>';
                return;
            }
            container.innerHTML = posts.map(p => {
                const msg = p.message ? (p.message.length > 120 ? p.message.substring(0, 120) + '...' : p.message) : '(Không có text)';
                const time = new Date(p.created_time).toLocaleString('vi-VN');
                const isLive = p.live_status === 'LIVE';
                const isVOD = p.live_status === 'VOD';
                const liveBadge = isLive ? '<span style="background:#e53935;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;animation:pulse 1.5s infinite">LIVE</span> '
                    : isVOD ? '<span style="background:#f57c00;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">Vừa Live</span> '
                    : p.is_live ? '<span style="background:var(--fb-text-light);color:#fff;padding:2px 8px;border-radius:4px;font-size:11px">Video</span> ' : '';
                const borderLeft = isLive ? 'border-left:4px solid #e53935;' : isVOD ? 'border-left:4px solid #f57c00;' : '';
                const icon = isLive ? '🔴' : isVOD ? '📹' : p.full_picture ? '' : '📝';

                return `<div class="post-item" data-post-id="${p.id}" onclick="FBAds.selectPost('${p.id}', this)" style="display:flex;gap:12px;padding:12px;border-bottom:1px solid #f0f0f0;cursor:pointer;transition:background 0.1s;${borderLeft}" onmouseover="this.style.background='#f8f9fa'" onmouseout="if(!this.classList.contains('selected'))this.style.background=''">
                    ${p.full_picture ? `<img src="${p.full_picture}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;flex-shrink:0">` : `<div style="width:80px;height:80px;background:${isLive ? '#fde8e8' : isVOD ? '#fff3e0' : 'var(--fb-bg)'};border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:24px">${icon}</div>`}
                    <div style="flex:1;min-width:0">
                        <div style="font-size:13px;line-height:1.4;color:var(--fb-text)">${liveBadge}${esc(msg)}</div>
                        <div style="font-size:11px;color:var(--fb-text-light);margin-top:4px">${time}</div>
                    </div>
                    <div style="flex-shrink:0;display:flex;align-items:center"><div class="post-check" style="width:20px;height:20px;border:2px solid var(--fb-border);border-radius:50%"></div></div>
                </div>`;
            }).join('');
        } catch (err) {
            container.innerHTML = `<div style="padding:20px;text-align:center;color:red">${err.message}</div>`;
        }
    }

    function selectPost(postId, el) {
        // Deselect all
        document.querySelectorAll('#pagePostsList .post-item').forEach(item => {
            item.classList.remove('selected');
            item.style.background = '';
            item.querySelector('.post-check').style.cssText = 'width:20px;height:20px;border:2px solid var(--fb-border);border-radius:50%';
        });
        // Select this one
        el.classList.add('selected');
        el.style.background = '#e7f3ff';
        el.querySelector('.post-check').style.cssText = 'width:20px;height:20px;border:2px solid var(--fb-primary);border-radius:50%;background:var(--fb-primary);box-shadow:inset 0 0 0 3px #fff';
        document.getElementById('selectedPostId').value = postId;
    }

    function previewAdImage(input) {
        const preview = document.getElementById('adImagePreview');
        if (input.files && input.files[0]) {
            const reader = new FileReader();
            reader.onload = e => {
                preview.innerHTML = `<img src="${e.target.result}" style="max-width:200px;max-height:150px;border-radius:8px;border:1px solid var(--fb-border)">`;
            };
            reader.readAsDataURL(input.files[0]);
        }
    }

    async function createAd() {
        const adsetId = document.getElementById('adAdSetId').value;
        const name = document.getElementById('adName').value.trim();
        const status = document.getElementById('adStatus').value;

        if (!name) { toast('Nhập tên quảng cáo', 'error'); return; }
        if (!adsetId) { toast('Chọn nhóm QC', 'error'); return; }

        try {
            let creative;

            if (adType === 'post') {
                // Use existing post
                const postId = document.getElementById('selectedPostId').value;
                if (!postId) { toast('Chọn 1 bài viết từ Page', 'error'); return; }
                creative = { object_story_id: postId };
            } else {
                // Create new content
                const pageId = document.getElementById('adPageIdNew').value;
                if (!pageId) { toast('Chọn Facebook Page', 'error'); return; }

                const message = document.getElementById('adMessage').value.trim();
                const headline = document.getElementById('adHeadline').value.trim();
                const description = document.getElementById('adDescription').value.trim();
                const link = document.getElementById('adLink').value.trim();
                const cta = document.getElementById('adCTA').value;
                const imageFile = document.getElementById('adImageFile').files[0];

                let imageHash = null;
                if (imageFile) {
                    toast('Đang upload hình...', 'info');
                    const base64 = await fileToBase64(imageFile);
                    const imgRes = await api('/adimages', {
                        method: 'POST',
                        body: { account_id: selectedAccountId, image_base64: base64, filename: imageFile.name }
                    });
                    const images = imgRes.data?.images;
                    if (images) {
                        const firstKey = Object.keys(images)[0];
                        imageHash = images[firstKey]?.hash;
                    }
                }

                const linkData = {};
                if (message) linkData.message = message;
                if (link) {
                    linkData.link = link;
                    if (headline) linkData.name = headline;
                    if (description) linkData.description = description;
                    if (cta !== 'NO_BUTTON') linkData.call_to_action = { type: cta };
                    if (imageHash) linkData.image_hash = imageHash;
                }

                creative = { object_story_spec: { page_id: pageId, link_data: linkData } };
            }

            await api('/ads', {
                method: 'POST',
                body: { account_id: selectedAccountId, adset_id: adsetId, name, creative, status }
            });
            toast('Tạo quảng cáo thành công!', 'success');
            closeModal('createAdModal');
            refreshData();
        } catch (err) { toast('Lỗi: ' + err.message, 'error'); }
    }

    // =====================================================
    // SETTINGS
    // =====================================================
    function switchSettingsTab(tab) {
        document.querySelectorAll('.settings-tab').forEach(t => {
            const isActive = t.dataset.stab === tab;
            t.style.borderBottomColor = isActive ? 'var(--fb-primary)' : 'transparent';
            t.style.color = isActive ? 'var(--fb-primary)' : 'var(--fb-text-secondary)';
        });
        document.getElementById('settingsRoles').style.display = tab === 'roles' ? '' : 'none';
        document.getElementById('settingsPages').style.display = tab === 'pages' ? '' : 'none';
        document.getElementById('settingsInfo').style.display = tab === 'info' ? '' : 'none';

        if (tab === 'roles') loadRoles();
        if (tab === 'pages') renderPages();
        if (tab === 'info') renderInfo();
    }

    async function loadRoles() {
        const container = document.getElementById('rolesListContainer');
        container.innerHTML = '<div class="loading-overlay"><div class="loading-spinner"></div></div>';
        try {
            const res = await api('/app/roles');
            const roles = res.data || [];
            if (!roles.length) {
                container.innerHTML = '<div style="padding:12px;color:var(--fb-text-secondary)">Chưa có người dùng nào</div>';
                return;
            }
            container.innerHTML = `<table class="data-table" style="box-shadow:none"><thead><tr><th>User</th><th>Role</th><th></th></tr></thead><tbody>
                ${roles.map(r => `<tr>
                    <td>${r.user ? esc(r.user) : 'N/A'}</td>
                    <td><span class="status-badge status-active">${esc(r.role)}</span></td>
                    <td><button class="btn btn-danger btn-sm" onclick="FBAds.removeRole('${r.user}')" title="Xóa">&#128465;</button></td>
                </tr>`).join('')}
            </tbody></table>`;
        } catch (err) {
            container.innerHTML = `<div style="padding:12px;color:red">${err.message}</div>`;
        }
    }

    async function addAppRole() {
        const userId = document.getElementById('roleUserId').value.trim();
        const role = document.getElementById('roleType').value;
        if (!userId) { toast('Nhập Facebook User ID', 'error'); return; }
        try {
            await api('/app/roles', { method: 'POST', body: { user_id: userId, role } });
            toast(`Đã thêm ${role}: ${userId}`, 'success');
            document.getElementById('roleUserId').value = '';
            loadRoles();
        } catch (err) { toast('Lỗi: ' + err.message, 'error'); }
    }

    async function removeRole(userId) {
        if (!confirm('Xóa người dùng này?')) return;
        try {
            await api(`/app/roles/${userId}`, { method: 'DELETE' });
            toast('Đã xóa', 'success');
            loadRoles();
        } catch (err) { toast('Lỗi: ' + err.message, 'error'); }
    }

    function renderPages() {
        const container = document.getElementById('pagesListContainer');
        if (!pages.length) {
            container.innerHTML = '<div style="padding:12px;color:var(--fb-text-secondary)">Không tìm thấy Page nào. Đảm bảo bạn đã cấp quyền pages_read_engagement.</div>';
            return;
        }
        container.innerHTML = `<table class="data-table" style="box-shadow:none"><thead><tr><th></th><th>Tên Page</th><th>ID</th><th>Fans</th></tr></thead><tbody>
            ${pages.map(p => `<tr>
                <td>${p.picture?.data?.url ? `<img src="${p.picture.data.url}" style="width:32px;height:32px;border-radius:50%">` : ''}</td>
                <td style="font-weight:600">${esc(p.name)}</td>
                <td style="font-size:12px;color:var(--fb-text-light)">${p.id}</td>
                <td>${fmtNum(p.fan_count)}</td>
            </tr>`).join('')}
        </tbody></table>`;
    }

    function renderInfo() {
        document.getElementById('infoAppId').textContent = FB_APP_ID;
        document.getElementById('infoUserId').textContent = document.getElementById('userName')?.textContent || '--';
        document.getElementById('infoAdAccount').textContent = selectedAccountId || '--';
        // Token expiry from auth status
        api('/auth/status').then(res => {
            document.getElementById('infoTokenExpiry').textContent = res.expiresAt
                ? new Date(res.expiresAt).toLocaleDateString('vi-VN') : '--';
        });
    }

    // =====================================================
    // AUDIENCES
    // =====================================================
    async function loadAudiences() {
        if (!selectedAccountId) return;
        const tbody = document.getElementById('audiencesBody');
        tbody.innerHTML = '<tr><td colspan="6"><div class="loading-overlay"><div class="loading-spinner"></div> Đang tải...</div></td></tr>';
        try {
            const res = await api(`/audiences?account_id=${selectedAccountId}`);
            const list = res.data || [];
            if (!list.length) { tbody.innerHTML = emptyRow(6, 'Chưa có đối tượng'); return; }
            tbody.innerHTML = list.map(a => `<tr>
                <td style="font-weight:600">${esc(a.name)}</td>
                <td><span class="status-badge status-active">${a.subtype || 'CUSTOM'}</span></td>
                <td>${fmtNum(a.approximate_count)}</td>
                <td>${a.delivery_status?.status || a.operation_status?.status || '--'}</td>
                <td style="font-size:12px">${a.time_created ? new Date(a.time_created * 1000).toLocaleDateString('vi-VN') : '--'}</td>
                <td><button class="btn btn-danger btn-sm" onclick="FBAds.deleteAudience('${a.id}')">&#128465;</button></td>
            </tr>`).join('');
        } catch (err) { tbody.innerHTML = errorRow(6, err.message); }
    }

    async function createAudience() {
        const name = document.getElementById('audienceName').value.trim();
        const desc = document.getElementById('audienceDesc').value.trim();
        const subtype = document.getElementById('audienceSubtype').value;
        if (!name) { toast('Nhập tên', 'error'); return; }

        try {
            if (subtype === 'LOOKALIKE') {
                const sourceId = document.getElementById('lookalikeSourceId').value.trim();
                const country = document.getElementById('lookalikeCountry').value.trim() || 'VN';
                const ratio = (parseInt(document.getElementById('lookalikeRatio').value) || 1) / 100;
                if (!sourceId) { toast('Nhập Audience ID gốc', 'error'); return; }
                await api('/audiences/lookalike', {
                    method: 'POST',
                    body: { account_id: selectedAccountId, name, origin_audience_id: sourceId, country, ratio }
                });
            } else {
                await api('/audiences', {
                    method: 'POST',
                    body: { account_id: selectedAccountId, name, description: desc, subtype }
                });
            }
            toast('Tạo đối tượng thành công!', 'success');
            closeModal('createAudienceModal');
            loadAudiences();
        } catch (err) { toast('Lỗi: ' + err.message, 'error'); }
    }

    async function deleteAudience(id) {
        if (!confirm('Xóa đối tượng này?')) return;
        try {
            await api(`/audiences/${id}`, { method: 'DELETE' });
            toast('Đã xóa', 'success');
            loadAudiences();
        } catch (err) { toast('Lỗi: ' + err.message, 'error'); }
    }

    // =====================================================
    // PIXELS
    // =====================================================
    async function loadPixels() {
        if (!selectedAccountId) return;
        const tbody = document.getElementById('pixelsBody');
        tbody.innerHTML = '<tr><td colspan="5"><div class="loading-overlay"><div class="loading-spinner"></div></div></td></tr>';
        try {
            const res = await api(`/pixels?account_id=${selectedAccountId}`);
            const list = res.data || [];
            if (!list.length) { tbody.innerHTML = emptyRow(5, 'Chưa có Pixel'); return; }
            tbody.innerHTML = list.map(p => `<tr>
                <td style="font-weight:600">${esc(p.name)}</td>
                <td style="font-size:12px">${p.id}</td>
                <td style="font-size:12px">${p.last_fired_time ? new Date(p.last_fired_time).toLocaleString('vi-VN') : 'Chưa bắn'}</td>
                <td style="font-size:12px">${p.creation_time ? new Date(p.creation_time).toLocaleDateString('vi-VN') : '--'}</td>
                <td><button class="btn btn-outline btn-sm" onclick="FBAds.viewPixelEvents('${p.id}')">Xem sự kiện</button></td>
            </tr>`).join('');
        } catch (err) { tbody.innerHTML = errorRow(5, err.message); }
    }

    async function viewPixelEvents(pixelId) {
        const container = document.getElementById('pixelEventsContainer');
        container.innerHTML = '<div class="loading-overlay"><div class="loading-spinner"></div> Đang tải sự kiện...</div>';
        try {
            const res = await api(`/pixels/${pixelId}/stats`);
            const events = res.data || [];
            if (!events.length) { container.innerHTML = '<p style="color:var(--fb-text-secondary)">Chưa có sự kiện nào trong 7 ngày qua</p>'; return; }
            container.innerHTML = `<h4 style="margin-bottom:8px">Sự kiện Pixel (7 ngày)</h4>
            <table class="data-table"><thead><tr><th>Sự kiện</th><th>Số lượng</th></tr></thead><tbody>
                ${events.map(e => `<tr><td>${esc(e.event || e.aggregation)}</td><td>${fmtNum(e.count || e.value)}</td></tr>`).join('')}
            </tbody></table>`;
        } catch (err) { container.innerHTML = `<p style="color:red">${err.message}</p>`; }
    }

    // =====================================================
    // BILLING
    // =====================================================
    async function loadBilling() {
        if (!selectedAccountId) return;
        try {
            const res = await api(`/billing/payment-methods?account_id=${selectedAccountId}`);
            const d = res.data || {};
            const accStatusMap = { 1: 'Hoạt động', 2: 'Bị vô hiệu', 3: 'Chưa thanh toán', 7: 'Đang xét duyệt', 9: 'Trong thời gian ân hạn', 100: 'Đang chờ đóng', 101: 'Đã đóng' };

            document.getElementById('billingAccStatus').textContent = accStatusMap[d.account_status] || d.account_status || '--';
            document.getElementById('billingTotalSpent').textContent = fmtCurrency(d.amount_spent);
            document.getElementById('billingBalance').textContent = fmtCurrency(d.balance);
            document.getElementById('billingSpendCap').textContent = d.spend_cap ? fmtCurrency(d.spend_cap) : 'Không giới hạn';
            document.getElementById('billingCurrency').textContent = d.currency || '--';

            // Funding source
            const fs = d.funding_source_details;
            if (fs) {
                const typeMap = { 1: 'Thẻ tín dụng', 2: 'PayPal', 4: 'Chuyển khoản', 12: 'Coupon' };
                document.getElementById('billingFunding').textContent = `${typeMap[fs.type] || 'Loại ' + fs.type}${fs.display_string ? ' - ' + fs.display_string : ''}`;
            } else {
                document.getElementById('billingFunding').textContent = d.funding_source || 'Chưa thiết lập';
            }

            if (d.spend_cap) document.getElementById('spendCapInput').value = d.spend_cap;
        } catch (err) {
            // Account may be disabled — show error inline instead of toast spam
            document.getElementById('billingAccStatus').textContent = 'Lỗi';
            document.getElementById('billingTotalSpent').textContent = '--';
            document.getElementById('billingBalance').textContent = '--';
            document.getElementById('billingSpendCap').textContent = '--';
            document.getElementById('billingCurrency').textContent = '--';
            document.getElementById('billingFunding').textContent = err.message;
        }

        // Load transactions
        loadTransactions();
    }

    async function loadTransactions() {
        const tbody = document.getElementById('transactionsBody');
        tbody.innerHTML = '<tr><td colspan="5"><div class="loading-overlay"><div class="loading-spinner"></div></div></td></tr>';
        try {
            const res = await api(`/billing/transactions?account_id=${selectedAccountId}`);
            const list = res.data || [];
            if (!list.length) { tbody.innerHTML = emptyRow(5, 'Chưa có giao dịch'); return; }
            tbody.innerHTML = list.map(t => `<tr>
                <td style="font-size:12px">${t.time ? new Date(t.time).toLocaleString('vi-VN') : '--'}</td>
                <td>${esc(t.charge_type || '--')}</td>
                <td style="font-weight:600">${t.billing_amount ? fmtCurrency(t.billing_amount) : '--'}</td>
                <td><span class="status-badge ${t.status === 'completed' ? 'status-active' : 'status-paused'}">${t.status || '--'}</span></td>
                <td style="font-size:12px">${esc(t.reason || '--')}</td>
            </tr>`).join('');
        } catch (err) { tbody.innerHTML = errorRow(5, err.message); }
    }

    async function updateSpendCap() {
        const val = document.getElementById('spendCapInput').value;
        const cap = val ? parseInt(val) : 0;
        try {
            await api('/billing/spend-cap', {
                method: 'POST',
                body: { account_id: selectedAccountId, spend_cap: cap }
            });
            toast(cap ? `Giới hạn: ${fmtCurrency(val)}` : 'Đã xóa giới hạn chi tiêu', 'success');
            loadBilling();
        } catch (err) { toast('Lỗi: ' + err.message, 'error'); }
    }

    // =====================================================
    // REPORTS
    // =====================================================
    let reportData = [];

    async function loadReport() {
        if (!selectedAccountId) return;
        const type = document.getElementById('reportType').value;
        const dp = document.getElementById('reportDatePreset').value;
        const thead = document.getElementById('reportHead');
        const tbody = document.getElementById('reportBody');
        tbody.innerHTML = '<tr><td colspan="8"><div class="loading-overlay"><div class="loading-spinner"></div></div></td></tr>';

        try {
            let res;
            if (type === 'daily') {
                res = await api(`/reports/daily?account_id=${selectedAccountId}&date_preset=${dp}`);
                thead.innerHTML = '<tr><th>Ngày</th><th>Chi tiêu</th><th>Hiển thị</th><th>Click</th><th>CTR</th><th>CPC</th><th>Tiếp cận</th><th>Tần suất</th></tr>';
                reportData = res.data || [];
                tbody.innerHTML = reportData.map(r => `<tr>
                    <td>${r.date_start}</td><td>${fmtCurrency(r.spend)}</td><td>${fmtNum(r.impressions)}</td>
                    <td>${fmtNum(r.clicks)}</td><td>${r.ctr ? parseFloat(r.ctr).toFixed(2) + '%' : '--'}</td>
                    <td>${fmtCurrency(r.cpc)}</td><td>${fmtNum(r.reach)}</td><td>${r.frequency || '--'}</td>
                </tr>`).join('') || emptyRow(8, 'Chưa có dữ liệu');
            } else if (type === 'age_gender') {
                res = await api(`/reports/breakdown?account_id=${selectedAccountId}&date_preset=${dp}&breakdowns=age,gender`);
                thead.innerHTML = '<tr><th>Tuổi</th><th>Giới tính</th><th>Chi tiêu</th><th>Hiển thị</th><th>Click</th><th>CTR</th><th>CPC</th><th>Tiếp cận</th></tr>';
                reportData = res.data || [];
                tbody.innerHTML = reportData.map(r => `<tr>
                    <td>${r.age || '--'}</td><td>${r.gender === '1' ? 'Nam' : r.gender === '2' ? 'Nữ' : r.gender || '--'}</td>
                    <td>${fmtCurrency(r.spend)}</td><td>${fmtNum(r.impressions)}</td><td>${fmtNum(r.clicks)}</td>
                    <td>${r.ctr ? parseFloat(r.ctr).toFixed(2) + '%' : '--'}</td><td>${fmtCurrency(r.cpc)}</td><td>${fmtNum(r.reach)}</td>
                </tr>`).join('') || emptyRow(8, 'Chưa có dữ liệu');
            } else if (type === 'placement') {
                res = await api(`/reports/placement?account_id=${selectedAccountId}&date_preset=${dp}`);
                thead.innerHTML = '<tr><th>Nền tảng</th><th>Vị trí</th><th>Chi tiêu</th><th>Hiển thị</th><th>Click</th><th>CTR</th><th>CPC</th><th>Tiếp cận</th></tr>';
                reportData = res.data || [];
                tbody.innerHTML = reportData.map(r => `<tr>
                    <td>${esc(r.publisher_platform || '--')}</td><td>${esc(r.platform_position || '--')}</td>
                    <td>${fmtCurrency(r.spend)}</td><td>${fmtNum(r.impressions)}</td><td>${fmtNum(r.clicks)}</td>
                    <td>${r.ctr ? parseFloat(r.ctr).toFixed(2) + '%' : '--'}</td><td>${fmtCurrency(r.cpc)}</td><td>${fmtNum(r.reach)}</td>
                </tr>`).join('') || emptyRow(8, 'Chưa có dữ liệu');
            }
        } catch (err) { tbody.innerHTML = errorRow(8, err.message); }
    }

    function exportReport() {
        if (!reportData.length) { toast('Không có dữ liệu để xuất', 'error'); return; }
        const headers = Object.keys(reportData[0]);
        const csv = [headers.join(','), ...reportData.map(r => headers.map(h => `"${r[h] || ''}"`).join(','))].join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fb-ads-report-${document.getElementById('reportType').value}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast('Đã xuất CSV', 'success');
    }

    // =====================================================
    // AUTOMATED RULES
    // =====================================================
    async function loadRules() {
        if (!selectedAccountId) return;
        const tbody = document.getElementById('rulesBody');
        tbody.innerHTML = '<tr><td colspan="4"><div class="loading-overlay"><div class="loading-spinner"></div></div></td></tr>';
        try {
            const res = await api(`/rules?account_id=${selectedAccountId}`);
            const list = res.data || [];
            if (!list.length) { tbody.innerHTML = emptyRow(4, 'Chưa có quy tắc'); return; }
            tbody.innerHTML = list.map(r => {
                const active = r.status === 'ENABLED';
                return `<tr>
                    <td><label class="toggle"><input type="checkbox" ${active ? 'checked' : ''} onchange="FBAds.toggleRule('${r.id}',this.checked)"><span class="toggle-slider"></span></label></td>
                    <td><div style="font-weight:600">${esc(r.name)}</div><div style="font-size:12px;color:var(--fb-text-light)">${r.id}</div></td>
                    <td style="font-size:12px">${r.created_time ? new Date(r.created_time).toLocaleDateString('vi-VN') : '--'}</td>
                    <td><button class="btn btn-danger btn-sm" onclick="FBAds.deleteRule('${r.id}')">&#128465;</button></td>
                </tr>`;
            }).join('');
        } catch (err) { tbody.innerHTML = errorRow(4, err.message); }
    }

    async function createRule() {
        const name = document.getElementById('ruleName').value.trim();
        const entityType = document.getElementById('ruleEntityType').value;
        const metric = document.getElementById('ruleMetric').value;
        const operator = document.getElementById('ruleOperator').value;
        const value = document.getElementById('ruleValue').value;
        const action = document.getElementById('ruleAction').value;
        const schedule = document.getElementById('ruleSchedule').value;

        if (!name || !value) { toast('Nhập tên và giá trị', 'error'); return; }

        try {
            await api('/rules', {
                method: 'POST',
                body: {
                    account_id: selectedAccountId,
                    name,
                    evaluation_spec: {
                        evaluation_type: 'TRIGGER',
                        filters: [{
                            field: metric,
                            value: parseFloat(value),
                            operator
                        }, {
                            field: 'entity_type',
                            value: [entityType],
                            operator: 'IN'
                        }],
                        trigger: { type: 'STATS_CHANGE', field: metric }
                    },
                    execution_spec: {
                        execution_type: action === 'SEND_NOTIFICATION' ? 'NOTIFICATION' : action
                    },
                    schedule_spec: { schedule_type: schedule }
                }
            });
            toast('Tạo quy tắc thành công!', 'success');
            closeModal('createRuleModal');
            loadRules();
        } catch (err) { toast('Lỗi: ' + err.message, 'error'); }
    }

    async function toggleRule(id, enable) {
        try {
            await api(`/rules/${id}/status`, { method: 'POST', body: { status: enable ? 'ENABLED' : 'DISABLED' } });
            toast(`Đã ${enable ? 'bật' : 'tắt'} quy tắc`, 'success');
        } catch (err) { toast('Lỗi: ' + err.message, 'error'); loadRules(); }
    }

    async function deleteRule(id) {
        if (!confirm('Xóa quy tắc này?')) return;
        try {
            await api(`/rules/${id}`, { method: 'DELETE' });
            toast('Đã xóa', 'success');
            loadRules();
        } catch (err) { toast('Lỗi: ' + err.message, 'error'); }
    }

    // =====================================================
    // ACCOUNT DETAILS
    // =====================================================
    async function loadAccountDetails() {
        if (!selectedAccountId) return;
        try {
            const res = await api(`/account/details?account_id=${selectedAccountId}`);
            const d = res.data || {};
            const accStatusMap = { 1: 'Hoạt động', 2: 'Bị vô hiệu', 3: 'Chưa thanh toán', 7: 'Đang xét duyệt', 9: 'Ân hạn', 100: 'Chờ đóng', 101: 'Đã đóng' };
            const disableReasonMap = { 0: 'Không', 1: 'ADS_INTEGRITY_POLICY', 2: 'ADS_IP_REVIEW', 3: 'RISK_PAYMENT', 4: 'GRAY_ACCOUNT_SHUT_DOWN', 5: 'ADS_AFC_REVIEW', 6: 'BUSINESS_INTEGRITY_RAR', 7: 'PERMANENT_CLOSE', 8: 'UNUSED_RESELLER_ACCOUNT', 9: 'UNUSED_ACCOUNT' };

            document.getElementById('accName').textContent = d.name || '--';
            document.getElementById('accId').textContent = d.account_id || d.id || '--';
            document.getElementById('accStatus').textContent = accStatusMap[d.account_status] || d.account_status || '--';
            document.getElementById('accTimezone').textContent = d.timezone_name || '--';
            document.getElementById('accBusiness').textContent = d.business_name || '--';
            document.getElementById('accCreated').textContent = d.created_time ? new Date(d.created_time).toLocaleDateString('vi-VN') : '--';
            document.getElementById('accPrepay').textContent = d.is_prepay_account ? 'Có (Trả trước)' : 'Không (Trả sau)';
            document.getElementById('accDisableReason').textContent = disableReasonMap[d.disable_reason] || d.disable_reason || 'Không';
        } catch (err) { toast('Lỗi: ' + err.message, 'error'); }

        loadAccountUsers();
        loadAccountActivities();
    }

    async function loadAccountUsers() {
        const tbody = document.getElementById('accUsersBody');
        tbody.innerHTML = '<tr><td colspan="4"><div class="loading-overlay"><div class="loading-spinner"></div></div></td></tr>';
        try {
            const res = await api(`/account/users?account_id=${selectedAccountId}`);
            const list = res.data || [];
            if (!list.length) { tbody.innerHTML = emptyRow(4, 'Không có user'); return; }
            tbody.innerHTML = list.map(u => `<tr>
                <td style="font-weight:600">${esc(u.name || '--')}</td>
                <td style="font-size:12px">${u.id}</td>
                <td><span class="status-badge status-active">${u.role || '--'}</span></td>
                <td style="font-size:12px">${(u.permissions || []).join(', ') || '--'}</td>
            </tr>`).join('');
        } catch (err) { tbody.innerHTML = errorRow(4, err.message); }
    }

    async function loadAccountActivities() {
        const tbody = document.getElementById('accActivityBody');
        tbody.innerHTML = '<tr><td colspan="4"><div class="loading-overlay"><div class="loading-spinner"></div></div></td></tr>';
        try {
            const res = await api(`/account/activities?account_id=${selectedAccountId}&limit=20`);
            const list = res.data || [];
            if (!list.length) { tbody.innerHTML = emptyRow(4, 'Chưa có hoạt động'); return; }
            tbody.innerHTML = list.map(a => `<tr>
                <td style="font-size:12px">${a.event_time ? new Date(a.event_time).toLocaleString('vi-VN') : '--'}</td>
                <td>${esc(a.event_type || '--')}</td>
                <td style="font-size:12px">${esc(a.actor_name || a.actor_id || '--')}</td>
                <td style="font-size:12px">${esc(a.object_name || a.object_id || '--')}</td>
            </tr>`).join('');
        } catch (err) { tbody.innerHTML = errorRow(4, err.message); }
    }

    // =====================================================
    // MODAL HELPERS
    // =====================================================
    function openModal(id) {
        document.getElementById(id).classList.add('active');
        if (id === 'settingsModal') switchSettingsTab('roles');
        if (id === 'createAudienceModal') {
            // Toggle lookalike fields
            document.getElementById('audienceSubtype').onchange = function() {
                document.getElementById('lookalikeFields').style.display = this.value === 'LOOKALIKE' ? '' : 'none';
            };
        }
    }

    function closeModal(id) {
        document.getElementById(id).classList.remove('active');
    }

    // =====================================================
    // UTILITY FUNCTIONS
    // =====================================================
    async function api(endpoint, options = {}) {
        const url = API_BASE + endpoint;
        const fetchOptions = { method: options.method || 'GET', headers: { 'Content-Type': 'application/json' } };
        if (options.body) fetchOptions.body = JSON.stringify(options.body);
        const response = await fetch(url, fetchOptions);
        const data = await response.json();
        if (!data.success) {
            console.error('[FB-ADS] API error:', endpoint, data);
            // Show detailed FB error if available
            const fbDetail = data.fbError?.error_user_msg || data.fbError?.error_user_title || '';
            const msg = fbDetail ? `${data.error}\n${fbDetail}` : (data.error || 'Unknown error');
            throw new Error(msg);
        }
        return data;
    }

    function fmtCurrency(v) {
        if (!v && v !== 0) return '--';
        const n = parseFloat(v);
        return isNaN(n) ? '--' : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);
    }

    function fmtNum(v) {
        if (!v && v !== 0) return '--';
        const n = parseInt(v);
        if (isNaN(n)) return '--';
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
        return n.toLocaleString('vi-VN');
    }

    function statusClass(s) {
        const m = { ACTIVE: 'status-active', PAUSED: 'status-paused', DELETED: 'status-deleted', ARCHIVED: 'status-deleted', CAMPAIGN_PAUSED: 'status-paused', ADSET_PAUSED: 'status-paused', DISAPPROVED: 'status-error', WITH_ISSUES: 'status-error' };
        return m[s] || 'status-paused';
    }

    function statusText(s) {
        const m = { ACTIVE: 'Đang chạy', PAUSED: 'Tạm dừng', DELETED: 'Đã xóa', ARCHIVED: 'Lưu trữ', CAMPAIGN_PAUSED: 'CD tạm dừng', ADSET_PAUSED: 'Nhóm dừng', DISAPPROVED: 'Không duyệt', PENDING_REVIEW: 'Đang duyệt', WITH_ISSUES: 'Có lỗi', IN_PROCESS: 'Xử lý' };
        return m[s] || s;
    }

    function getResults(actions) {
        if (!actions || !Array.isArray(actions)) return { value: null, cost: null };
        const types = ['offsite_conversion.fb_pixel_purchase', 'lead', 'link_click', 'post_engagement', 'video_view'];
        for (const t of types) {
            const a = actions.find(x => x.action_type === t);
            if (a) return { value: fmtNum(a.value), cost: null };
        }
        return actions[0] ? { value: fmtNum(actions[0].value), cost: null } : { value: null, cost: null };
    }

    function esc(str) {
        if (!str) return '';
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function getSearch() { return (document.getElementById('searchBox').value || '').toLowerCase(); }

    function showTableLoading(id, cols) {
        document.getElementById(id).innerHTML = `<tr><td colspan="${cols}"><div class="loading-overlay"><div class="loading-spinner"></div> Đang tải...</div></td></tr>`;
    }

    function emptyRow(cols, msg, action) {
        return `<tr><td colspan="${cols}"><div class="empty-state"><div class="empty-state-icon">+</div><h3>${msg}</h3>${action ? `<button class="btn btn-primary" onclick="FBAds.${action}()">Tạo mới</button>` : ''}</div></td></tr>`;
    }

    function errorRow(cols, msg) {
        return `<tr><td colspan="${cols}"><div class="empty-state"><div class="empty-state-icon">&#9888;</div><h3>Lỗi</h3><p>${esc(msg)}</p></div></td></tr>`;
    }

    function toast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.textContent = message;
        container.appendChild(el);
        setTimeout(() => el.remove(), 4000);
    }

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // Init
    document.addEventListener('DOMContentLoaded', init);

    return {
        login, logout, selectAccount, switchTab, filterTable, refreshData,
        showCreateModal, closeModal, openModal,
        createCampaign, editCampaign, updateCampaign, deleteCampaign,
        toggleStatus, viewAdSets, viewAds,
        createAdSet, searchInterests, addInterest, removeInterest,
        createAd, previewAdImage, setAdType, loadPagePosts, selectPost,
        onCheckbox, toggleSelectAll, bulkAction,
        addAppRole, removeRole, switchSettingsTab,
        checkAuthAfterSDK, loadInsights,
        viewCampaignDetails: viewAdSets,
        // Account switching
        switchAccount, removeSavedAccount, loadSavedAccounts,
        toggleAccountMenu, refreshAccountDropdown,
        // Cookie auth
        loginWithCookies, showCookieHelp,
        // New features
        loadAudiences, createAudience, deleteAudience,
        loadPixels, viewPixelEvents,
        loadBilling, updateSpendCap,
        loadReport, exportReport,
        loadRules, createRule, toggleRule, deleteRule,
        loadAccountDetails
    };
})();
