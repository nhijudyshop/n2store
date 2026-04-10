// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// FACEBOOK ADS MANAGER - Frontend
// =====================================================

const FBAds = (() => {
    // Config
    const FB_APP_ID = '1290728302927895';
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

    // =====================================================
    // INIT
    // =====================================================
    function init() {
        initFacebookSDK();
        checkAuthStatus();
    }

    function initFacebookSDK() {
        window.fbAsyncInit = function() {
            FB.init({
                appId: FB_APP_ID,
                cookie: true,
                xfbml: false,
                version: 'v21.0'
            });
            console.log('[FB-ADS] Facebook SDK initialized');
        };
    }

    // =====================================================
    // AUTH
    // =====================================================
    async function checkAuthStatus() {
        try {
            const res = await api('/auth/status');
            if (res.authenticated) {
                onLoginSuccess(res.user);
            }
        } catch (e) {
            console.log('[FB-ADS] Not authenticated');
        }
    }

    function login() {
        if (typeof FB === 'undefined') {
            toast('Facebook SDK chưa tải xong, thử lại sau 2 giây...', 'error');
            return;
        }

        FB.login(function(response) {
            if (response.authResponse) {
                const { accessToken, userID } = response.authResponse;
                // Get user name
                FB.api('/me', { fields: 'name' }, async function(me) {
                    try {
                        const res = await api('/auth/token', {
                            method: 'POST',
                            body: { accessToken, userID, name: me.name }
                        });
                        if (res.success) {
                            toast(`Đăng nhập thành công! Token hết hạn sau ${Math.round(res.expiresIn / 86400)} ngày`, 'success');
                            onLoginSuccess(res.user);
                        }
                    } catch (err) {
                        toast('Lỗi đăng nhập: ' + err.message, 'error');
                    }
                });
            } else {
                toast('Đăng nhập bị hủy', 'error');
            }
        }, { scope: 'ads_management,ads_read,business_management' });
    }

    function onLoginSuccess(user) {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainApp').style.display = '';
        document.getElementById('loginBtn').style.display = 'none';
        document.getElementById('logoutBtn').style.display = '';
        document.getElementById('userInfo').style.display = 'flex';
        document.getElementById('userName').textContent = user.name;
        loadAdAccounts();
    }

    async function logout() {
        await api('/auth/logout', { method: 'POST' });
        document.getElementById('loginScreen').style.display = '';
        document.getElementById('mainApp').style.display = 'none';
        document.getElementById('loginBtn').style.display = '';
        document.getElementById('logoutBtn').style.display = 'none';
        document.getElementById('userInfo').style.display = 'none';
        selectedAccountId = null;
        toast('Đã đăng xuất', 'info');
    }

    // =====================================================
    // AD ACCOUNTS
    // =====================================================
    async function loadAdAccounts() {
        try {
            const res = await api('/ad-accounts');
            adAccounts = res.data || [];
            const select = document.getElementById('accountSelector');
            select.innerHTML = '<option value="">Chọn tài khoản quảng cáo...</option>';

            adAccounts.forEach(acc => {
                const statusText = acc.account_status === 1 ? '' : ' (Bị vô hiệu)';
                const opt = document.createElement('option');
                opt.value = acc.account_id;
                opt.textContent = `${acc.name || acc.account_id}${statusText} — ${acc.currency || 'VND'}`;
                select.appendChild(opt);
            });

            // Auto-select if only one account
            if (adAccounts.length === 1) {
                select.value = adAccounts[0].account_id;
                selectAccount(adAccounts[0].account_id);
            } else if (adAccounts.length === 0) {
                toast('Không tìm thấy tài khoản quảng cáo nào', 'error');
            }
        } catch (err) {
            toast('Lỗi tải danh sách tài khoản: ' + err.message, 'error');
        }
    }

    function selectAccount(accountId) {
        selectedAccountId = accountId;
        if (accountId) {
            refreshData();
        }
    }

    // =====================================================
    // DATA LOADING
    // =====================================================
    async function refreshData() {
        if (!selectedAccountId) {
            toast('Chọn tài khoản quảng cáo trước', 'error');
            return;
        }

        await Promise.all([
            loadCampaigns(),
            loadInsights()
        ]);
    }

    async function loadCampaigns() {
        const tbody = document.getElementById('campaignsBody');
        tbody.innerHTML = '<tr><td colspan="11"><div class="loading-overlay"><div class="loading-spinner"></div> Đang tải...</div></td></tr>';

        try {
            const res = await api(`/campaigns?account_id=${selectedAccountId}`);
            campaigns = res.data || [];
            document.getElementById('campaignCount').textContent = campaigns.length;
            renderCampaigns();

            // Also load adsets and ads counts
            const [adsetsRes, adsRes] = await Promise.all([
                api(`/adsets?account_id=${selectedAccountId}`),
                api(`/ads?account_id=${selectedAccountId}`)
            ]);
            adsets = adsetsRes.data || [];
            ads = adsRes.data || [];
            document.getElementById('adsetCount').textContent = adsets.length;
            document.getElementById('adCount').textContent = ads.length;
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Lỗi tải dữ liệu</h3><p>${err.message}</p></div></td></tr>`;
        }
    }

    async function loadInsights() {
        if (!selectedAccountId) return;
        const datePreset = document.getElementById('datePreset').value;

        try {
            const res = await api(`/insights?account_id=${selectedAccountId}&date_preset=${datePreset}&level=account`);
            const data = res.data?.[0] || {};
            insights = data;

            document.getElementById('metricSpend').textContent = formatCurrency(data.spend);
            document.getElementById('metricImpressions').textContent = formatNumber(data.impressions);
            document.getElementById('metricClicks').textContent = formatNumber(data.clicks);
            document.getElementById('metricCTR').textContent = data.ctr ? parseFloat(data.ctr).toFixed(2) + '%' : '--';
            document.getElementById('metricCPC').textContent = formatCurrency(data.cpc);
            document.getElementById('metricReach').textContent = formatNumber(data.reach);

            // Also load per-campaign insights
            const campaignInsights = await api(`/insights?account_id=${selectedAccountId}&date_preset=${datePreset}&level=campaign`);
            const insightsMap = {};
            (campaignInsights.data || []).forEach(i => {
                insightsMap[i.campaign_id] = i;
            });
            insights.byCampaign = insightsMap;

            // Re-render to show insights in table
            if (currentTab === 'campaigns') renderCampaigns();
        } catch (err) {
            console.log('[FB-ADS] Insights error:', err.message);
        }
    }

    // =====================================================
    // RENDER
    // =====================================================
    function renderCampaigns() {
        const tbody = document.getElementById('campaignsBody');
        const searchTerm = (document.getElementById('searchBox').value || '').toLowerCase();

        const filtered = campaigns.filter(c =>
            !searchTerm || c.name.toLowerCase().includes(searchTerm) || c.id.includes(searchTerm)
        );

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr><td colspan="11">
                    <div class="empty-state">
                        <div class="empty-state-icon">+</div>
                        <h3>Không tìm thấy kết quả</h3>
                        <p>Bạn chưa tạo quảng cáo nào.</p>
                        <button class="btn btn-primary" onclick="FBAds.showCreateModal()">Tạo chiến dịch</button>
                    </div>
                </td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map(c => {
            const ci = insights.byCampaign?.[c.id] || {};
            const isActive = c.effective_status === 'ACTIVE';
            const statusClass = getStatusClass(c.effective_status);
            const budget = c.daily_budget
                ? formatCurrency(c.daily_budget / 100) + '/ngày'
                : c.lifetime_budget
                    ? formatCurrency(c.lifetime_budget / 100) + ' tổng'
                    : '--';

            const results = getResultsFromActions(ci.actions);

            return `<tr>
                <td><input type="checkbox" value="${c.id}"></td>
                <td>
                    <label class="toggle">
                        <input type="checkbox" ${isActive ? 'checked' : ''} onchange="FBAds.toggleStatus('campaigns', '${c.id}', this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                </td>
                <td>
                    <div style="font-weight:600">${escapeHtml(c.name)}</div>
                    <div style="font-size:12px;color:var(--fb-text-light)">${c.id}</div>
                </td>
                <td><span class="status-badge ${statusClass}"><span class="status-dot"></span> ${translateStatus(c.effective_status)}</span></td>
                <td>${budget}</td>
                <td>${formatCurrency(ci.spend)}</td>
                <td>${results.value || '--'}</td>
                <td>${results.cost || '--'}</td>
                <td>${formatNumber(ci.impressions)}</td>
                <td>${formatNumber(ci.reach)}</td>
                <td>
                    <button class="btn btn-outline btn-sm" onclick="FBAds.viewCampaignDetails('${c.id}')" title="Xem nhóm QC">👁</button>
                    <button class="btn btn-danger btn-sm" onclick="FBAds.deleteCampaign('${c.id}')" title="Xóa">🗑</button>
                </td>
            </tr>`;
        }).join('');
    }

    function renderAdSets() {
        const tbody = document.getElementById('adsetsBody');
        const searchTerm = (document.getElementById('searchBox').value || '').toLowerCase();

        const filtered = adsets.filter(a =>
            !searchTerm || a.name.toLowerCase().includes(searchTerm) || a.id.includes(searchTerm)
        );

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="empty-state-icon">📋</div><h3>Chưa có nhóm quảng cáo</h3></div></td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map(a => {
            const isActive = a.effective_status === 'ACTIVE';
            const statusClass = getStatusClass(a.effective_status);
            const budget = a.daily_budget
                ? formatCurrency(a.daily_budget / 100) + '/ngày'
                : a.lifetime_budget
                    ? formatCurrency(a.lifetime_budget / 100) + ' tổng'
                    : '--';
            const campaign = campaigns.find(c => c.id === a.campaign_id);

            return `<tr>
                <td><input type="checkbox" value="${a.id}"></td>
                <td>
                    <label class="toggle">
                        <input type="checkbox" ${isActive ? 'checked' : ''} onchange="FBAds.toggleStatus('adsets', '${a.id}', this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                </td>
                <td>
                    <div style="font-weight:600">${escapeHtml(a.name)}</div>
                    <div style="font-size:12px;color:var(--fb-text-light)">${a.id}</div>
                </td>
                <td><span class="status-badge ${statusClass}"><span class="status-dot"></span> ${translateStatus(a.effective_status)}</span></td>
                <td>${budget}</td>
                <td>--</td>
                <td>--</td>
                <td style="font-size:12px">${campaign ? escapeHtml(campaign.name) : a.campaign_id}</td>
                <td>
                    <button class="btn btn-outline btn-sm" onclick="FBAds.toggleStatus('adsets', '${a.id}', ${!isActive})">
                        ${isActive ? '⏸ Dừng' : '▶ Bật'}
                    </button>
                </td>
            </tr>`;
        }).join('');
    }

    function renderAds() {
        const tbody = document.getElementById('adsBody');
        const searchTerm = (document.getElementById('searchBox').value || '').toLowerCase();

        const filtered = ads.filter(a =>
            !searchTerm || a.name.toLowerCase().includes(searchTerm) || a.id.includes(searchTerm)
        );

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-state-icon">📢</div><h3>Chưa có quảng cáo</h3></div></td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map(a => {
            const isActive = a.effective_status === 'ACTIVE';
            const statusClass = getStatusClass(a.effective_status);
            const adset = adsets.find(s => s.id === a.adset_id);

            return `<tr>
                <td><input type="checkbox" value="${a.id}"></td>
                <td>
                    <label class="toggle">
                        <input type="checkbox" ${isActive ? 'checked' : ''} onchange="FBAds.toggleStatus('ads', '${a.id}', this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                </td>
                <td>
                    <div style="font-weight:600">${escapeHtml(a.name)}</div>
                    <div style="font-size:12px;color:var(--fb-text-light)">${a.id}</div>
                </td>
                <td><span class="status-badge ${statusClass}"><span class="status-dot"></span> ${translateStatus(a.effective_status)}</span></td>
                <td>--</td>
                <td>--</td>
                <td style="font-size:12px">${adset ? escapeHtml(adset.name) : a.adset_id}</td>
                <td>
                    <button class="btn btn-outline btn-sm" onclick="FBAds.toggleStatus('ads', '${a.id}', ${!isActive})">
                        ${isActive ? '⏸ Dừng' : '▶ Bật'}
                    </button>
                </td>
            </tr>`;
        }).join('');
    }

    // =====================================================
    // ACTIONS
    // =====================================================
    function switchTab(tab) {
        currentTab = tab;
        document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
        document.getElementById('campaignsTable').style.display = tab === 'campaigns' ? '' : 'none';
        document.getElementById('adsetsTable').style.display = tab === 'adsets' ? '' : 'none';
        document.getElementById('adsTable').style.display = tab === 'ads' ? '' : 'none';

        if (tab === 'campaigns') renderCampaigns();
        if (tab === 'adsets') renderAdSets();
        if (tab === 'ads') renderAds();
    }

    function filterTable() {
        if (currentTab === 'campaigns') renderCampaigns();
        if (currentTab === 'adsets') renderAdSets();
        if (currentTab === 'ads') renderAds();
    }

    async function toggleStatus(type, id, activate) {
        const status = activate ? 'ACTIVE' : 'PAUSED';
        try {
            await api(`/${type}/${id}/status`, {
                method: 'POST',
                body: { status }
            });
            toast(`Đã ${activate ? 'bật' : 'tạm dừng'} thành công`, 'success');
            refreshData();
        } catch (err) {
            toast('Lỗi: ' + err.message, 'error');
            refreshData();
        }
    }

    function showCreateModal() {
        document.getElementById('createCampaignModal').classList.add('active');
    }

    function closeModal(id) {
        document.getElementById(id).classList.remove('active');
    }

    async function createCampaign() {
        const name = document.getElementById('campaignName').value.trim();
        const objective = document.getElementById('campaignObjective').value;
        const budget = document.getElementById('campaignBudget').value;
        const status = document.getElementById('campaignStatus').value;

        if (!name) {
            toast('Nhập tên chiến dịch', 'error');
            return;
        }

        try {
            const body = {
                account_id: selectedAccountId,
                name,
                objective,
                status
            };
            // Facebook expects budget in cents (VND * 100? Actually VND doesn't have cents, but FB API uses smallest unit)
            if (budget) body.daily_budget = parseInt(budget);

            await api('/campaigns', { method: 'POST', body });
            toast('Tạo chiến dịch thành công!', 'success');
            closeModal('createCampaignModal');

            // Reset form
            document.getElementById('campaignName').value = '';
            document.getElementById('campaignBudget').value = '';
            refreshData();
        } catch (err) {
            toast('Lỗi tạo chiến dịch: ' + err.message, 'error');
        }
    }

    async function deleteCampaign(id) {
        if (!confirm('Bạn chắc chắn muốn xóa chiến dịch này?')) return;

        try {
            await api(`/campaigns/${id}`, { method: 'DELETE' });
            toast('Đã xóa chiến dịch', 'success');
            refreshData();
        } catch (err) {
            toast('Lỗi: ' + err.message, 'error');
        }
    }

    function viewCampaignDetails(campaignId) {
        switchTab('adsets');
        // Filter adsets by campaign
        const filtered = adsets.filter(a => a.campaign_id === campaignId);
        const campaign = campaigns.find(c => c.id === campaignId);
        toast(`Xem nhóm QC của: ${campaign?.name || campaignId}`, 'info');
    }

    // =====================================================
    // HELPERS
    // =====================================================
    async function api(endpoint, options = {}) {
        const url = API_BASE + endpoint;
        const fetchOptions = {
            method: options.method || 'GET',
            headers: { 'Content-Type': 'application/json' }
        };
        if (options.body) {
            fetchOptions.body = JSON.stringify(options.body);
        }

        const response = await fetch(url, fetchOptions);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Unknown error');
        }
        return data;
    }

    function formatCurrency(value) {
        if (!value && value !== 0) return '--';
        const num = parseFloat(value);
        if (isNaN(num)) return '--';
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(num);
    }

    function formatNumber(value) {
        if (!value && value !== 0) return '--';
        const num = parseInt(value);
        if (isNaN(num)) return '--';
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toLocaleString('vi-VN');
    }

    function getStatusClass(status) {
        const map = {
            'ACTIVE': 'status-active',
            'PAUSED': 'status-paused',
            'DELETED': 'status-deleted',
            'ARCHIVED': 'status-deleted',
            'CAMPAIGN_PAUSED': 'status-paused',
            'ADSET_PAUSED': 'status-paused',
            'DISAPPROVED': 'status-error',
            'WITH_ISSUES': 'status-error'
        };
        return map[status] || 'status-paused';
    }

    function translateStatus(status) {
        const map = {
            'ACTIVE': 'Đang chạy',
            'PAUSED': 'Tạm dừng',
            'DELETED': 'Đã xóa',
            'ARCHIVED': 'Lưu trữ',
            'CAMPAIGN_PAUSED': 'CD tạm dừng',
            'ADSET_PAUSED': 'Nhóm tạm dừng',
            'DISAPPROVED': 'Không duyệt',
            'PENDING_REVIEW': 'Đang xét duyệt',
            'WITH_ISSUES': 'Có vấn đề',
            'IN_PROCESS': 'Đang xử lý'
        };
        return map[status] || status;
    }

    function getResultsFromActions(actions) {
        if (!actions || !Array.isArray(actions)) return { value: null, cost: null };
        // Try common result types
        const priority = ['offsite_conversion.fb_pixel_purchase', 'lead', 'link_click', 'post_engagement', 'page_engagement', 'video_view'];
        for (const type of priority) {
            const action = actions.find(a => a.action_type === type);
            if (action) return { value: formatNumber(action.value), cost: null };
        }
        // Fallback to first action
        if (actions[0]) return { value: formatNumber(actions[0].value), cost: null };
        return { value: null, cost: null };
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function toast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.textContent = message;
        container.appendChild(el);
        setTimeout(() => el.remove(), 4000);
    }

    // =====================================================
    // INIT ON LOAD
    // =====================================================
    document.addEventListener('DOMContentLoaded', init);

    // Public API
    return {
        login,
        logout,
        selectAccount,
        switchTab,
        filterTable,
        refreshData,
        showCreateModal,
        closeModal,
        createCampaign,
        deleteCampaign,
        toggleStatus,
        viewCampaignDetails,
        loadInsights
    };
})();
