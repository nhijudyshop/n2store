// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// FACEBOOK ADS MANAGER - Frontend (Full Features)
// =====================================================

// FB SDK init MUST run before SDK script loads
const FB_APP_ID = '1290728302927895';
window.fbAsyncInit = function() {
    FB.init({ appId: FB_APP_ID, cookie: true, xfbml: false, version: 'v21.0' });
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
    function init() { checkAuthStatus(); }
    function checkAuthAfterSDK() { checkAuthStatus(); }

    // =====================================================
    // AUTH
    // =====================================================
    async function checkAuthStatus() {
        try {
            const res = await api('/auth/status');
            if (res.authenticated) onLoginSuccess(res.user);
        } catch (e) { /* not authenticated */ }
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

    function onLoginSuccess(user) {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainApp').style.display = '';
        document.getElementById('loginBtn').style.display = 'none';
        document.getElementById('logoutBtn').style.display = '';
        document.getElementById('settingsBtn').style.display = '';
        document.getElementById('userInfo').style.display = 'flex';
        document.getElementById('userName').textContent = user.name;
        loadAdAccounts();
        loadPages();
    }

    async function logout() {
        await api('/auth/logout', { method: 'POST' });
        document.getElementById('loginScreen').style.display = '';
        document.getElementById('mainApp').style.display = 'none';
        document.getElementById('loginBtn').style.display = '';
        document.getElementById('logoutBtn').style.display = 'none';
        document.getElementById('settingsBtn').style.display = 'none';
        document.getElementById('userInfo').style.display = 'none';
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
            const budget = c.daily_budget ? fmtCurrency(c.daily_budget / 100) + '/ngày'
                : c.lifetime_budget ? fmtCurrency(c.lifetime_budget / 100) + ' tổng' : '--';
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
            const budget = a.daily_budget ? fmtCurrency(a.daily_budget / 100) + '/ngày'
                : a.lifetime_budget ? fmtCurrency(a.lifetime_budget / 100) + ' tổng' : '--';
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
    function switchTab(tab) {
        currentTab = tab;
        selectedIds.clear();
        updateBulkUI();
        document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
        document.getElementById('campaignsTable').style.display = tab === 'campaigns' ? '' : 'none';
        document.getElementById('adsetsTable').style.display = tab === 'adsets' ? '' : 'none';
        document.getElementById('adsTable').style.display = tab === 'ads' ? '' : 'none';
        renderCurrentTab();
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
            const body = { account_id: selectedAccountId, name, objective, status };
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
        document.getElementById('editCampaignBudget').value = c.daily_budget ? c.daily_budget / 100 : '';
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
                const budget = a.daily_budget ? fmtCurrency(a.daily_budget / 100) + '/ngày' : '--';
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
    function populateAdSetSelect() {
        const sel = document.getElementById('adAdSetId');
        sel.innerHTML = adsets.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
    }

    function populatePageSelect() {
        const sel = document.getElementById('adPageId');
        sel.innerHTML = pages.length
            ? pages.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')
            : '<option value="">Không tìm thấy Page</option>';
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
        const pageId = document.getElementById('adPageId').value;
        const message = document.getElementById('adMessage').value.trim();
        const headline = document.getElementById('adHeadline').value.trim();
        const description = document.getElementById('adDescription').value.trim();
        const link = document.getElementById('adLink').value.trim();
        const cta = document.getElementById('adCTA').value;
        const status = document.getElementById('adStatus').value;
        const imageFile = document.getElementById('adImageFile').files[0];

        if (!name) { toast('Nhập tên quảng cáo', 'error'); return; }
        if (!adsetId) { toast('Chọn nhóm QC', 'error'); return; }
        if (!pageId) { toast('Chọn Facebook Page', 'error'); return; }

        try {
            // Upload image if provided
            let imageHash = null;
            if (imageFile) {
                toast('Đang upload hình...', 'info');
                const base64 = await fileToBase64(imageFile);
                const imgRes = await api('/adimages', {
                    method: 'POST',
                    body: { account_id: selectedAccountId, image_base64: base64, filename: imageFile.name }
                });
                // Extract image hash from response
                const images = imgRes.data?.images;
                if (images) {
                    const firstKey = Object.keys(images)[0];
                    imageHash = images[firstKey]?.hash;
                }
            }

            // Build creative spec
            const linkData = {};
            if (message) linkData.message = message;
            if (link) {
                linkData.link = link;
                if (headline) linkData.name = headline;
                if (description) linkData.description = description;
                if (cta !== 'NO_BUTTON') linkData.call_to_action = { type: cta };
                if (imageHash) linkData.image_hash = imageHash;
            }

            const creative = {
                object_story_spec: {
                    page_id: pageId,
                    link_data: linkData
                }
            };

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
    // MODAL HELPERS
    // =====================================================
    function openModal(id) {
        document.getElementById(id).classList.add('active');
        if (id === 'settingsModal') {
            switchSettingsTab('roles');
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
            throw new Error(data.error || 'Unknown error');
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
        createAd, previewAdImage,
        onCheckbox, toggleSelectAll, bulkAction,
        addAppRole, removeRole, switchSettingsTab,
        checkAuthAfterSDK, loadInsights,
        viewCampaignDetails: viewAdSets
    };
})();
