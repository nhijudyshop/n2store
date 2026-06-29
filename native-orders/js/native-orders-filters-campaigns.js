// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Native Orders — filters + campaign selection + parent campaigns + page posts + channel UI. MOVE-only.

(function () {
    'use strict';
    const NO = (window.NativeOrders = window.NativeOrders || {});

    // ---------- Filter handlers ----------
    NO.applyFilters = function applyFilters() {
        NO.STATE.search = NO.$('#filterSearch').value.trim();
        NO.STATE.status = NO.$('#filterStatus').value;
        NO.STATE.limit = parseInt(NO.$('#filterLimit').value, 10) || 200;
        NO.STATE.page = 1;
        NO.load();
    };

    // ---------- Tag filter — DANH SÁCH thẻ + "chi tiết" (client-side, không reload) ----------
    // Thay <select> cũ: panel xổ xuống liệt kê mọi thẻ trên trang (tên + số đơn). Bấm 1 thẻ
    // → lọc bảng. Nút "chi tiết" (mắt) cạnh thẻ → drawer tổng hợp (native-orders-tag-aggregate.js).
    // Tags (autoTags) tính server-side SAU phân trang → lọc trên trang đã tải (giống KPI health).

    // orders đang HIỂN THỊ sau khi áp thẻ. tagFilter rỗng → toàn bộ trang.
    NO._visibleOrders = function _visibleOrders() {
        const orders = NO.STATE.orders || [];
        const tf = NO.STATE.tagFilter;
        if (!tf) return orders;
        return orders.filter((o) => (o.autoTags || []).some((t) => t && t.trigger === tf));
    };

    // Gom các thẻ xuất hiện trên trang → [{trigger,label,color,count}] (sort theo count desc).
    // 1 đơn đếm 1 lần / trigger. kpi_user (tên NV động) → 1 nhãn cố định. DÙNG CHUNG cho
    // panel lọc + drawer chi tiết (native-orders-tag-aggregate.js gọi NO._tagSummary).
    NO._tagSummary = function _tagSummary() {
        const byTrigger = new Map();
        for (const o of NO.STATE.orders || []) {
            const seen = new Set();
            for (const t of o.autoTags || []) {
                if (!t || !t.trigger || seen.has(t.trigger)) continue;
                seen.add(t.trigger);
                const prev = byTrigger.get(t.trigger);
                if (prev) prev.count++;
                else
                    byTrigger.set(t.trigger, {
                        trigger: t.trigger,
                        label: t.trigger === 'kpi_user' ? 'KPI (người nhận)' : t.name || t.trigger,
                        color: t.color || '#6b7280',
                        count: 1,
                    });
            }
        }
        return [...byTrigger.values()].sort((a, b) => b.count - a.count);
    };

    NO._renderTagFilterLabel = function _renderTagFilterLabel() {
        const lab = NO.$('#filterTagLabel');
        if (!lab) return;
        const tf = NO.STATE.tagFilter;
        if (!tf) {
            lab.textContent = 'Tất cả';
            return;
        }
        const s = NO._tagSummary().find((x) => x.trigger === tf);
        lab.textContent = s ? s.label : 'Thẻ';
    };

    // Dựng panel danh sách thẻ (gọi sau mỗi load + khi mở dropdown). Reset tagFilter nếu
    // thẻ đang lọc không còn xuất hiện trên trang.
    NO.renderTagFilterPanel = function renderTagFilterPanel() {
        const box = NO.$('#filterTagList');
        if (!box) return;
        const tags = NO._tagSummary();
        const cur = NO.STATE.tagFilter || '';
        if (cur && !tags.some((t) => t.trigger === cur)) NO.STATE.tagFilter = '';
        const active = NO.STATE.tagFilter || '';
        const rowAll = `<button type="button" class="no-tagf-row${active === '' ? ' is-active' : ''}" data-trigger="">
                <i data-lucide="${active === '' ? 'check' : 'layout-list'}" class="no-tagf-ic"></i>
                <span class="no-tagf-name">Tất cả</span>
            </button>`;
        const rows = tags
            .map(
                (t) => `<div class="no-tagf-rowwrap">
                <button type="button" class="no-tagf-row${active === t.trigger ? ' is-active' : ''}" data-trigger="${NO.escapeHtml(t.trigger)}" title="Lọc bảng theo thẻ này">
                    <span class="no-tagf-dot" style="background:${NO.escapeHtml(t.color)};"></span>
                    <span class="no-tagf-name">${NO.escapeHtml(t.label)}</span>
                    <span class="no-tagf-count">${t.count}</span>
                </button>
                <button type="button" class="no-tagf-detail" data-detail="${NO.escapeHtml(t.trigger)}" title="Xem chi tiết tất cả đơn mang thẻ '${NO.escapeHtml(t.label)}'">
                    <i data-lucide="eye"></i>
                </button>
            </div>`
            )
            .join('');
        box.innerHTML =
            rowAll + (rows || '<div class="no-tagf-empty">Trang này chưa có thẻ nào.</div>');
        if (window.lucide) lucide.createIcons();
        NO._renderTagFilterLabel();
    };

    NO.toggleTagDropdown = function toggleTagDropdown(force) {
        const dd = NO.$('#filterTagDropdown');
        if (!dd) return;
        const isOpen = dd.style.display === 'block';
        const next = typeof force === 'boolean' ? force : !isOpen;
        dd.style.display = next ? 'block' : 'none';
        if (next) NO.renderTagFilterPanel();
    };

    // Bấm 1 thẻ trong panel → lọc bảng (client-side, không reload) + đóng dropdown.
    NO.applyTagFilter = function applyTagFilter(trigger) {
        NO.STATE.tagFilter = trigger || '';
        NO.toggleTagDropdown(false);
        NO._renderTagFilterLabel();
        NO.renderRows();
        NO.renderCounters();
    };

    NO.clearTagFilter = function clearTagFilter() {
        NO.STATE.tagFilter = '';
        NO.toggleTagDropdown(false);
        NO._renderTagFilterLabel();
    };

    // ---------- Search typeahead (gợi ý KH/đơn, client-side) ----------
    // Gợi ý lấy TỪ orders ĐÃ TẢI (STATE.orders) khớp text gõ — tức thì, KHÔNG fetch.
    // Bảng vẫn lọc server-side (debounce) như cũ; dropdown chỉ giúp chọn nhanh 1 KH/đơn.
    // Chọn 1 gợi ý → đặt search = SĐT (hoặc mã đơn) chính xác → load thu hẹp bảng.
    NO._suggestItems = [];
    NO._suggestActive = -1;

    NO._searchSuggestItems = function _searchSuggestItems(raw) {
        const q = (raw || '').trim().toLowerCase();
        if (!q) return [];
        const qDigits = q.replace(/\D/g, '');
        const map = new Map(); // key → suggestion (dedupe theo KH/đơn)
        // Nguồn = pool ỔN ĐỊNH (lần load gần nhất KHÔNG search) → gõ query mới sau khi
        // đã search trước đó vẫn gợi ý đủ. Chưa có pool → tạm dùng orders hiện tại.
        const pool = NO._suggestPool && NO._suggestPool.length ? NO._suggestPool : NO.STATE.orders;
        for (const o of pool || []) {
            const name = (o.customerName || '').toLowerCase();
            const phoneDigits = (o.phone || '').replace(/\D/g, '');
            const code = (o.code || '').toLowerCase();
            const note = (o.userNote || o.note || '').toLowerCase();
            const mPhone = qDigits.length >= 2 && phoneDigits.includes(qDigits);
            const mName = name.includes(q);
            const mCode = code.includes(q);
            const mNote = q.length >= 3 && note.includes(q);
            if (!(mPhone || mName || mCode || mNote)) continue;
            // Khớp DUY NHẤT bởi mã đơn → gợi ý cấp ĐƠN (chọn → search đúng mã đó).
            if (mCode && !mPhone && !mName) {
                const key = 'o:' + o.code;
                if (!map.has(key))
                    map.set(key, {
                        kind: 'order',
                        value: o.code,
                        label: o.code,
                        sub: o.customerName || 'Khách lạ',
                        o,
                        count: 1,
                        rank: code.startsWith(q) ? 0 : 1,
                    });
                continue;
            }
            // Còn lại → gom theo KHÁCH (SĐT, fallback tên) → chọn → search SĐT.
            const key = phoneDigits ? 'p:' + phoneDigits : 'n:' + name;
            const ex = map.get(key);
            if (ex) {
                ex.count++;
                continue;
            }
            map.set(key, {
                kind: 'customer',
                value: o.phone || o.code,
                label: o.customerName || 'Khách lạ',
                sub: o.phone || o.code,
                o,
                count: 1,
                rank: name.startsWith(q) || (qDigits && phoneDigits.startsWith(qDigits)) ? 0 : 1,
            });
        }
        return [...map.values()].sort((a, b) => a.rank - b.rank || b.count - a.count).slice(0, 8);
    };

    NO.renderSearchSuggest = function renderSearchSuggest() {
        const box = NO.$('#searchSuggest');
        const inp = NO.$('#filterSearch');
        if (!box || !inp) return;
        const items = NO._searchSuggestItems(inp.value);
        NO._suggestItems = items;
        NO._suggestActive = -1;
        if (!items.length) return NO.hideSearchSuggest();
        box.innerHTML = items
            .map((it, i) => {
                const cnt =
                    it.kind === 'customer' && it.count > 1
                        ? `<span class="nss-count">${it.count} đơn</span>`
                        : '';
                const icon = it.kind === 'order' ? '🧾 ' : '';
                return `<div class="nss-item" data-i="${i}" role="option">
                    <div class="nss-av">${NO.renderAvatar(it.o)}</div>
                    <div class="nss-main">
                        <div class="nss-label">${icon}${NO.escapeHtml(it.label)}</div>
                        <div class="nss-sub">${NO.escapeHtml(it.sub || '')}</div>
                    </div>${cnt}
                </div>`;
            })
            .join('');
        box.hidden = false;
        // mousedown (KHÔNG click) → fire TRƯỚC blur của input nên không bị đóng mất.
        box.querySelectorAll('.nss-item').forEach((el) =>
            el.addEventListener('mousedown', (e) => {
                e.preventDefault();
                NO.pickSuggestion(Number(el.dataset.i));
            })
        );
    };

    NO.pickSuggestion = function pickSuggestion(i) {
        const it = (NO._suggestItems || [])[i];
        if (!it) return;
        const inp = NO.$('#filterSearch');
        if (inp) inp.value = it.value;
        NO.hideSearchSuggest();
        NO.applyFilters();
    };

    NO.hideSearchSuggest = function hideSearchSuggest() {
        const box = NO.$('#searchSuggest');
        if (box) {
            box.hidden = true;
            box.innerHTML = '';
        }
        NO._suggestActive = -1;
    };

    // Điều hướng bàn phím trong dropdown. Trả true nếu đã xử lý (để chặn default).
    NO.moveSuggestActive = function moveSuggestActive(dir) {
        const box = NO.$('#searchSuggest');
        if (!box || box.hidden) return false;
        const n = (NO._suggestItems || []).length;
        if (!n) return false;
        NO._suggestActive = (NO._suggestActive + dir + n) % n;
        box.querySelectorAll('.nss-item').forEach((el, i) =>
            el.classList.toggle('is-active', i === NO._suggestActive)
        );
        return true;
    };

    NO.clearFilters = function clearFilters() {
        NO.hideSearchSuggest();
        NO.$('#filterSearch').value = '';
        NO.$('#filterStatus').value = 'all';
        NO.$('#filterLimit').value = '200';
        if (NO.clearTagFilter) NO.clearTagFilter();
        else NO.STATE.tagFilter = '';
        NO.STATE.search = '';
        NO.STATE.status = 'all';
        NO.STATE.limit = 200;
        NO.STATE.selectedCampaignIds = [];
        NO.saveCampaignSelection();
        NO.renderCampaignDropdown();
        NO.renderCampaignLabel();
        NO.STATE.page = 1;
        NO.load();
    };

    // ---------- Campaign filter ----------
    NO.CAMPAIGN_STORAGE_KEY = 'native_orders_selected_campaigns';

    NO.loadCampaignSelection = function loadCampaignSelection() {
        // Chỉ đọc lựa chọn riêng của trang. Mặc định (rỗng) → tự chọn 2 bài
        // mới nhất (House + Store) ở reconcileCampaignSelection().
        try {
            const own = localStorage.getItem(NO.CAMPAIGN_STORAGE_KEY);
            if (own != null) return JSON.parse(own) || [];
        } catch (_) {
            /* ignore */
        }
        return [];
    };

    NO.saveCampaignSelection = function saveCampaignSelection() {
        try {
            localStorage.setItem(
                NO.CAMPAIGN_STORAGE_KEY,
                JSON.stringify(NO.STATE.selectedCampaignIds)
            );
        } catch (_) {
            /* ignore quota */
        }
    };

    // Chọn mặc định 2 bài MỚI NHẤT: 1 của page House + 1 của page Store.
    // availableCampaigns đã sort theo lastOrderAt DESC (backend) → lấy bài đầu
    // tiên khớp mỗi page. Fallback (thiếu pageName) → 2 campaign mới nhất.
    NO.pickNewestHouseStore = function pickNewestHouseStore() {
        const list = NO.STATE.availableCampaigns || [];
        const real = list.filter((c) => c.id && c.id !== '__no_campaign__');
        const firstMatch = (re) => real.find((c) => re.test(String(c.pageName || c.name || '')));
        const house = firstMatch(/house/i);
        const store = firstMatch(/store/i);
        const ids = [];
        if (house) ids.push(String(house.id));
        if (store && (!house || String(store.id) !== String(house.id))) ids.push(String(store.id));
        if (ids.length) return ids;
        return real.slice(0, 2).map((c) => String(c.id));
    };

    // Dọn ID không còn tồn tại + tự chọn 2 bài mới nhất khi chưa có lựa chọn.
    // Bỏ qua khi đang lọc theo chiến dịch cha (loại trừ 2 chiều).
    NO.reconcileCampaignSelection = function reconcileCampaignSelection() {
        if (NO.STATE.parentCampaignId) {
            NO.STATE.selectedCampaignIds = [];
            return;
        }
        const valid = new Set((NO.STATE.availableCampaigns || []).map((c) => String(c.id)));
        const before = (NO.STATE.selectedCampaignIds || []).map(String);
        let ids = before.filter((id) => valid.has(id));
        if (!ids.length) ids = NO.pickNewestHouseStore();
        NO.STATE.selectedCampaignIds = ids;
        if (ids.join(',') !== before.join(',')) {
            NO.saveCampaignSelection();
            NO.STATE.page = 1;
            NO.load();
        }
    };

    // Loại trừ 2 chiều: chọn lọc theo bài viết (con) → bỏ chọn chiến dịch CHA.
    NO.clearParentSelection = function clearParentSelection() {
        if (!NO.STATE.parentCampaignId) return;
        NO.STATE.parentCampaignId = null;
        NO.STATE.parentPostIds = [];
        NO.renderParentCampaigns();
    };

    NO.loadAvailableCampaigns = async function loadAvailableCampaigns() {
        try {
            const resp = await window.NativeOrdersApi.campaigns();
            NO.STATE.availableCampaigns = resp.campaigns || [];
            NO.reconcileCampaignSelection();
            NO.renderCampaignDropdown();
            NO.renderCampaignLabel();
        } catch (e) {
            console.warn('[native-orders] campaigns fetch failed:', e.message);
            const list = NO.$('#campaignList');
            if (list)
                list.innerHTML = `<div style="padding:8px;color:#ef4444;font-size:12px;">Lỗi tải: ${NO.escapeHtml(e.message)}</div>`;
        }
    };

    NO.renderCampaignDropdown = function renderCampaignDropdown() {
        const list = NO.$('#campaignList');
        if (!list) return;
        if (NO.STATE.availableCampaigns.length === 0) {
            list.innerHTML =
                '<div style="padding:8px;color:#9ca3af;font-size:12px;">Chưa có chiến dịch nào</div>';
            return;
        }
        const sel = new Set(NO.STATE.selectedCampaignIds);
        const html = NO.STATE.availableCampaigns
            .map((c) => {
                const checked = sel.has(c.id) ? 'checked' : '';
                return `<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;font-size:13px;border-radius:4px;" data-id="${NO.escapeHtml(c.id)}">
                    <input type="checkbox" class="campaign-check" data-id="${NO.escapeHtml(c.id)}" ${checked} style="margin:0;">
                    <span style="flex:1;">${NO.escapeHtml(c.name)}</span>
                    <span style="color:#9ca3af;font-size:11px;">${c.count}</span>
                </label>`;
            })
            .join('');
        list.innerHTML = html;
    };

    // ===== Chiến dịch cha (parent campaign) — DÙNG CHUNG qua Web2Campaign =====
    // Logic chiến dịch (CRUD + gán bài) gom 1 nguồn ở web2/shared/web2-campaign.js;
    // trang chỉ điều phối UI. KHÔNG fetch /api/web2-live-comments trực tiếp nữa
    // (trước đây fork y hệt live-chat — gây drift). Auth x-web2-token do module lo.

    NO.loadParentCampaigns = async function loadParentCampaigns() {
        try {
            NO.STATE.parentCampaigns = (await window.Web2Campaign.list()) || [];
            NO.renderParentCampaigns();
        } catch (e) {
            console.warn('[native-orders] parent campaigns fail:', e.message);
        }
    };

    NO.renderParentCampaigns = function renderParentCampaigns() {
        const box = NO.$('#parentCampaignList');
        if (!box) return;
        const cur = NO.STATE.parentCampaignId || '';
        const row = (id, name, sub) =>
            `<label style="display:flex;align-items:center;gap:8px;padding:4px 6px;cursor:pointer;font-size:13px;border-radius:4px;${
                String(cur) === String(id) ? 'background:#eef2ff;' : ''
            }">
                <input type="radio" name="np-parent" class="np-parent-radio" value="${NO.escapeHtml(String(id))}" ${
                    String(cur) === String(id) ? 'checked' : ''
                } style="margin:0;">
                <span style="flex:1;">${NO.escapeHtml(name)}</span>
                ${sub ? `<span style="color:#9ca3af;font-size:11px;">${NO.escapeHtml(sub)}</span>` : ''}
            </label>`;
        let html = (NO.STATE.parentCampaigns || [])
            .map((c) => row(c.id, c.name, `${c.post_count || 0} bài`))
            .join('');
        if (!(NO.STATE.parentCampaigns || []).length)
            html +=
                '<div style="padding:4px 6px;color:#9ca3af;font-size:11.5px;">Chưa có chiến dịch cha. Tạo bên dưới hoặc ở live-chat.</div>';
        box.innerHTML = html;
    };

    NO.selectParentCampaign = async function selectParentCampaign(id) {
        NO.STATE.parentCampaignId = id || null;
        NO.STATE.parentPostIds = [];
        // Loại trừ 2 chiều: chọn chiến dịch CHA → bỏ chọn lọc theo bài viết (con).
        if (id && NO.STATE.selectedCampaignIds.length) {
            NO.STATE.selectedCampaignIds = [];
            NO.saveCampaignSelection();
            NO.renderCampaignDropdown();
            NO.renderCampaignLabel();
        }
        if (id) {
            try {
                // Nguồn-sự-thật = web2_live_post_assign (độc lập comment) → live CŨ
                // đã hết comment vẫn lọc ĐỦ đơn. Trước dùng listPosts() (comment-driven
                // /posts) → bài cũ mất khỏi tập → lọc đơn theo chiến dịch cha bị thiếu.
                const assigns = await window.Web2Campaign.listAssignments();
                NO.STATE.parentPostIds = (assigns || [])
                    .filter((p) => String(p.campaign_id) === String(id))
                    .map((p) => String(p.post_id));
            } catch (e) {
                // Fallback deploy gap (backend chưa có /assignments): comment-driven như cũ.
                try {
                    const posts = await window.Web2Campaign.listPosts();
                    NO.STATE.parentPostIds = (posts || [])
                        .filter((p) => String(p.campaign_id) === String(id))
                        .map((p) => String(p.post_id));
                } catch (e2) {
                    console.warn('[native-orders] parent posts fail:', e2.message);
                }
            }
        }
        NO.renderParentCampaigns();
        NO.renderCampaignLabel();
        NO.STATE.page = 1;
        NO.load();
    };

    NO.createParentCampaign = async function createParentCampaign() {
        const inp = NO.$('#parentCampaignNew');
        const name = (inp?.value || '').trim();
        if (!name) return;
        try {
            await window.Web2Campaign.create(name);
            if (inp) inp.value = '';
            await NO.loadParentCampaigns();
            NO.renderPagePosts(); // options select cập nhật theo parent mới
        } catch (e) {
            console.warn('[native-orders] create parent fail:', e.message);
        }
    };

    NO.loadPagePosts = async function loadPagePosts() {
        try {
            // Hai nguồn: (1) page-posts = bài live gần đây (poller — có thể trả 0 trên
            // web2-api sau split); (2) assignments = bảng-sự-thật gán bài↔chiến dịch
            // (độc lập comment). Trạng-thái-gán LẤY TỪ (2), và bổ sung bài ĐÃ GOM mà
            // (1) không trả để vẫn quản lý được (gỡ/đổi) — fix picker rỗng + live cũ.
            const [pagePosts, assigns] = await Promise.all([
                window.Web2Campaign.listPagePosts().catch(() => []),
                window.Web2Campaign.listAssignments().catch(() => []),
            ]);
            const aMap = {};
            for (const a of assigns || []) aMap[String(a.post_id)] = a;
            const list = (pagePosts || []).map((p) => ({
                ...p,
                campaign_id: aMap[String(p.postId)]?.campaign_id ?? p.campaign_id ?? null,
            }));
            const have = new Set(list.map((p) => String(p.postId)));
            for (const a of assigns || []) {
                const pid = String(a.post_id);
                if (have.has(pid)) continue;
                list.push({
                    postId: pid,
                    pageId: a.page_id || '',
                    title: a.post_title || '(bài đã gom)',
                    pageName: '',
                    date: '',
                    campaign_id: a.campaign_id,
                });
                have.add(pid);
            }
            NO.STATE.pagePosts = list;
            NO.renderPagePosts();
        } catch (e) {
            console.warn('[native-orders] page-posts fail:', e.message);
        }
    };

    NO.renderPagePosts = function renderPagePosts() {
        const box = NO.$('#parentPostsList');
        if (!box) return;
        const posts = NO.STATE.pagePosts || [];
        if (!posts.length) {
            box.innerHTML =
                '<div style="color:#9ca3af;font-size:11px;padding:2px 0;">Chưa có bài livestream gần đây.</div>';
            return;
        }
        const opts = (sel) =>
            `<option value="">— chưa gom —</option>` +
            (NO.STATE.parentCampaigns || [])
                .map(
                    (c) =>
                        `<option value="${NO.escapeHtml(String(c.id))}" ${String(sel) === String(c.id) ? 'selected' : ''}>${NO.escapeHtml(c.name)}</option>`
                )
                .join('');
        box.innerHTML = posts
            .map(
                (p) => `<div style="display:flex;align-items:center;gap:6px;font-size:11.5px;">
                    <div style="flex:1;min-width:0;">
                        <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500;">${NO.escapeHtml((p.title || '').slice(0, 50))}</div>
                        <div style="color:#9ca3af;font-size:10px;">${NO.escapeHtml(p.pageName || '')} · ${NO.escapeHtml(String(p.date || '').slice(0, 10))}</div>
                    </div>
                    <select class="np-post-assign" data-post="${NO.escapeHtml(p.postId)}" data-page="${NO.escapeHtml(p.pageId || '')}" data-title="${NO.escapeHtml((p.title || '').slice(0, 80))}" style="border:1px solid #d1d5db;border-radius:6px;padding:3px 6px;font-size:11px;max-width:140px;">${opts(p.campaign_id)}</select>
                </div>`
            )
            .join('');
    };

    NO.assignPost = async function assignPost(postId, campaignId, pageId, title) {
        try {
            if (campaignId) {
                await window.Web2Campaign.assignPost(campaignId, {
                    postId,
                    postTitle: title,
                    pageId,
                });
            } else {
                await window.Web2Campaign.unassignPost(postId);
            }
            await NO.loadParentCampaigns();
            await NO.loadPagePosts();
            if (NO.STATE.parentCampaignId) NO.selectParentCampaign(NO.STATE.parentCampaignId);
        } catch (e) {
            console.warn('[native-orders] assign post fail:', e.message);
        }
    };

    NO.renderCampaignLabel = function renderCampaignLabel() {
        const label = NO.$('#filterCampaignLabel');
        if (!label) return;
        // Lọc theo NHÓM (chiến dịch cha) → hiển thị tên nhóm.
        if (NO.STATE.parentCampaignId) {
            const p = (NO.STATE.parentCampaigns || []).find(
                (x) => String(x.id) === String(NO.STATE.parentCampaignId)
            );
            const nm = p ? p.name : 'Nhóm chiến dịch';
            label.textContent = nm.slice(0, 26) + (nm.length > 26 ? '…' : '');
            return;
        }
        const ids = NO.STATE.selectedCampaignIds;
        if (ids.length === 0) {
            label.textContent = 'Tất cả';
            return;
        }
        if (ids.length === 1) {
            const c = NO.STATE.availableCampaigns.find((x) => x.id === ids[0]);
            label.textContent = c
                ? c.name.slice(0, 28) + (c.name.length > 28 ? '…' : '')
                : '1 chiến dịch';
            return;
        }
        label.textContent = `${ids.length} chiến dịch`;
    };

    NO.toggleCampaignDropdown = function toggleCampaignDropdown(force) {
        const dd = NO.$('#filterCampaignDropdown');
        if (!dd) return;
        const isOpen = dd.style.display !== 'none';
        const next = typeof force === 'boolean' ? force : !isOpen;
        dd.style.display = next ? 'block' : 'none';
    };

    NO.toggleFilter = function toggleFilter() {
        NO.STATE.filterVisible = !NO.STATE.filterVisible;
        const bar = NO.controlBar();
        const label = NO.toggleLabel();
        if (NO.STATE.filterVisible) {
            bar?.classList.remove('hidden');
            if (label) label.textContent = 'Ẩn bộ lọc';
        } else {
            bar?.classList.add('hidden');
            if (label) label.textContent = 'Hiển thị bộ lọc';
        }
    };

    // Đồng bộ giao diện theo STATE.channel: đánh dấu tab active, hiện/ẩn nút "Thêm
    // đơn inbox", và ẩn bộ lọc chiến dịch (livestream-only) khi ở tab Inbox.
    NO._syncChannelUi = function _syncChannelUi() {
        const isInbox = NO.STATE.channel === 'web2_inbox';
        const tabs = NO.$('#channelTabs');
        if (tabs) {
            tabs.querySelectorAll('.no-channel-tab').forEach((t) => {
                t.classList.toggle('is-active', t.dataset.channel === NO.STATE.channel);
            });
        }
        const addBtn = NO.$('#btnAddInboxOrder');
        if (addBtn) addBtn.style.display = isInbox ? '' : 'none';
        const campGroup = NO.$('#campaignChipGroup');
        if (campGroup) campGroup.style.display = isInbox ? 'none' : '';
    };
})();
