// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Kho KH warehouse events (search/filter/sort/paginate wiring + Pancake fallback). warehouse riêng.
// =====================================================================
// Kho Khách Hàng Web 2.0 (warehouse) — EVENTS: bind toàn bộ search /
// filter / sort / pagination / toolbar / table delegation / modal /
// SĐT–địa chỉ phụ; + Pancake fallback (kho KH rỗng → tìm hội thoại
// Pancake, auto-import non-destructive vào kho).
// Đọc state/utils + render/detail từ window.__wcApp (load TRƯỚC).
// =====================================================================

(function () {
    'use strict';

    const NS = (window.__wcApp = window.__wcApp || {});
    const { state, $, notify, normPhone } = NS;

    // ─── Bind events ────────────────────────────────────────────────────
    function bind() {
        // Search (debounce)
        let st;
        $('#wcSearchInput').addEventListener('input', (e) => {
            clearTimeout(st);
            st = setTimeout(() => {
                state.search = e.target.value.trim();
                state.page = 1;
                NS.load();
            }, 350);
        });
        $('#wcSearchBtn').addEventListener('click', () => {
            state.search = $('#wcSearchInput').value.trim();
            state.page = 1;
            NS.load();
        });
        // Status stats filter
        $('#wcStatsBar').addEventListener('click', (e) => {
            const btn = e.target.closest('.wc-stat');
            if (!btn) return;
            $('#wcStatsBar')
                .querySelectorAll('.wc-stat')
                .forEach((b) => b.classList.remove('is-active'));
            btn.classList.add('is-active');
            state.status = btn.dataset.status === 'all' ? '' : btn.dataset.status;
            state.page = 1;
            NS.load();
        });
        // Source filter
        $('#wcSourceFilter').addEventListener('change', (e) => {
            state.source = e.target.value;
            state.page = 1;
            NS.load();
        });
        // Page size
        $('#wcPageSize').addEventListener('change', (e) => {
            state.limit = parseInt(e.target.value, 10) || 50;
            state.page = 1;
            NS.load();
        });
        // Pagination
        $('#wcPaginationButtons').addEventListener('click', (e) => {
            const btn = e.target.closest('.wc-page-btn');
            if (!btn || btn.disabled) return;
            state.page = parseInt(btn.dataset.page, 10);
            NS.load();
        });
        // Toolbar
        $('#wcAddBtn').addEventListener('click', () => NS.openModal(null));
        $('#wcExportBtn').addEventListener('click', NS.exportCsv);
        $('#wcMergeBtn').addEventListener('click', NS.doMerge);
        // Pancake fallback: "Thêm vào kho"
        $('#wcPancakeList').addEventListener('click', (e) => {
            const btn = e.target.closest('.wc-pancake-add');
            if (!btn) return;
            const idx = Number(btn.dataset.idx);
            if (Number.isFinite(idx)) addPancakeToKho(idx);
        });
        // Table delegation (row checkbox + actions)
        $('#wcTableBody').addEventListener('click', (e) => {
            const tr = e.target.closest('tr[data-id]');
            if (!tr) return;
            const id = Number(tr.dataset.id);
            const row = state.rows.find((r) => r.id === id);
            const chk = e.target.closest('.wc-row-check');
            if (chk) {
                if (chk.checked) state.selected.add(id);
                else state.selected.delete(id);
                $('#wcMergeBtn').disabled = state.selected.size !== 2;
                return;
            }
            const actBtn = e.target.closest('.wc-act');
            if (actBtn && row) NS.onAction(actBtn.dataset.act, row);
        });
        // Select all
        $('#wcSelectAll').addEventListener('change', (e) => {
            const on = e.target.checked;
            state.selected.clear();
            if (on) state.rows.forEach((r) => state.selected.add(r.id));
            $('#wcTableBody')
                .querySelectorAll('.wc-row-check')
                .forEach((c) => (c.checked = on));
            $('#wcMergeBtn').disabled = state.selected.size !== 2;
        });
        // Modal
        $('#wcModalClose').addEventListener('click', NS.closeModal);
        $('#wcModalCancel').addEventListener('click', NS.closeModal);
        $('#wcModalBackdrop').addEventListener('click', NS.closeModal);
        $('#wcModalSave').addEventListener('click', NS.saveModal);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !$('#wcModal').hidden) NS.closeModal();
        });
        // SĐT phụ: thêm + xóa
        $('#wcfAltPhoneAddBtn').addEventListener('click', NS.addAltPhone);
        $('#wcfAltPhoneInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                NS.addAltPhone();
            }
        });
        $('#wcAltPhoneList').addEventListener('click', (e) => {
            const star = e.target.closest('.wc-altphone-star');
            if (star) {
                const i = Number(star.dataset.idx);
                if (Number.isFinite(i)) NS.setPrimaryAltPhone(i);
                return;
            }
            const rm = e.target.closest('.wc-altphone-rm');
            if (!rm) return;
            const idx = Number(rm.dataset.idx);
            if (Number.isFinite(idx)) {
                NS.modalAltPhones.splice(idx, 1);
                NS.renderAltPhones();
            }
        });
        // Địa chỉ phụ: thêm + xóa + đặt chính
        $('#wcfAltAddrAddBtn')?.addEventListener('click', NS.addAltAddress);
        $('#wcfAltAddrInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                NS.addAltAddress();
            }
        });
        $('#wcAltAddrList')?.addEventListener('click', (e) => {
            const star = e.target.closest('.wc-altaddr-star');
            if (star) {
                const i = Number(star.dataset.idx);
                if (Number.isFinite(i)) NS.setPrimaryAltAddr(i);
                return;
            }
            const rm = e.target.closest('.wc-altaddr-rm');
            if (!rm) return;
            const idx = Number(rm.dataset.idx);
            if (Number.isFinite(idx)) {
                NS.modalAltAddresses.splice(idx, 1);
                NS.renderAltAddresses();
            }
        });
    }

    // ─── Pancake fallback (kho KH không có → tìm hội thoại Pancake) ─────
    // Mọi page user có token. Gom theo fbId, ưu tiên INBOX + có SĐT. Cho phép
    // "Thêm vào kho" → upsert/create vào web2_customers (warehouse).
    function hidePancakeResults() {
        const sec = $('#wcPancakeResults');
        if (sec) sec.hidden = true;
        NS._pancakeRows = [];
    }

    function _getPageIds() {
        const set = new Set();
        try {
            const accs = JSON.parse(localStorage.getItem('pancake_all_accounts') || '{}');
            for (const v of Object.values(accs)) {
                const pages = Array.isArray(v?.pages) ? v.pages : [];
                for (const p of pages) {
                    const pid = p?.id || p?.page_id || p?.pageId;
                    if (pid) set.add(String(pid));
                }
            }
        } catch {
            /* tolerate */
        }
        const pat = window.Web2Chat?.getAllPageAccessTokens?.() || {};
        for (const k of Object.keys(pat)) set.add(String(k));
        return [...set].filter(Boolean);
    }

    async function _searchPancake(query) {
        const q = String(query || '').trim();
        if (!q || !window.Web2Chat?.searchConversations) return [];
        if (window.Web2Chat.syncFromRenderDB) {
            try {
                await window.Web2Chat.syncFromRenderDB();
            } catch {
                /* tolerate — vẫn thử với token hiện có */
            }
        }
        const pageIds = _getPageIds();
        if (!pageIds.length) return [];
        const settled = await Promise.allSettled(
            pageIds.map((pid) => window.Web2Chat.searchConversations(pid, q))
        );
        const byFbId = new Map();
        for (let i = 0; i < settled.length; i++) {
            const r = settled[i];
            if (r.status !== 'fulfilled' || !r.value?.ok) continue;
            for (const c of r.value.conversations || []) {
                const cust = c.customers?.[0] || c.from || {};
                const fbId = String(cust.fb_id || cust.id || c.from_customer_id || '');
                if (!fbId) continue;
                const isInbox = (c.type || '').toUpperCase() === 'INBOX';
                const phone = cust.phone || cust.phone_number || '';
                const cand = {
                    fbId,
                    pageId: String(c.page_id || c.fb_page_id || pageIds[i] || ''),
                    name: cust.name || cust.full_name || c.name || '',
                    phone,
                    avatarUrl: c.from?.avatar_url || cust.avatar_url || '',
                    isInbox,
                };
                const cur = byFbId.get(fbId);
                if (
                    !cur ||
                    (cand.isInbox && !cur.isInbox) ||
                    (cand.isInbox === cur.isInbox && cand.phone && !cur.phone)
                ) {
                    byFbId.set(fbId, cand);
                }
            }
        }
        return [...byFbId.values()]
            .sort(
                (a, b) =>
                    Number(b.isInbox) - Number(a.isInbox) || (b.phone ? 1 : 0) - (a.phone ? 1 : 0)
            )
            .slice(0, 12);
    }

    // 3 TẦNG (user 2026-06-09): Kho KH (tier1, đã chạy ở load()) → web2_live_comments
    // DB (tier2) → live fetch (tier3: server poll livestream + browser search hội
    // thoại Pancake). Mọi tầng TỰ ĐỘNG import non-destructive (server lo merge SĐT/
    // địa chỉ phụ). Tìm thấy → reload kho, KH hiện ngay với badge nguồn.
    async function runPancakeFallback(query) {
        const sec = $('#wcPancakeResults');
        if (!sec) return;
        const seq = ++NS._pancakeSeq;
        $('#wcPancakeQuery').textContent = `“${query}”`;
        $('#wcPancakeList').innerHTML =
            '<div class="wc-pancake-empty">Đang tìm trong dữ liệu Pancake (livestream)…</div>';
        sec.hidden = false;
        NS._pancakeRows = [];

        const finishImported = (n, tierLabel) => {
            if (seq !== NS._pancakeSeq) return;
            notify(`Đã tự thêm ${n} KH vào kho (${tierLabel})`, 'success');
            $('#wcPancakeList').innerHTML =
                `<div class="wc-pancake-empty">✓ Tìm thấy & tự thêm ${n} KH từ ${tierLabel}. Đang tải lại…</div>`;
            NS.load(); // KH mới khớp từ khoá → hiện trong kho, section tự ẩn (total>0)
        };

        // ── Tier 2: web2_live_comments (DB đã sync ~30s) ──
        try {
            const r2 = await window.CustomersApi.lookupDeep(query, { live: false });
            if (seq !== NS._pancakeSeq) return;
            if (r2?.success && r2.imported?.length) {
                return finishImported(r2.imported.length, 'comment livestream');
            }
        } catch {
            /* tolerate — sang tier 3 */
        }

        // ── Tier 3a: live fetch — server poll livestream ĐANG chạy ──
        $('#wcPancakeList').innerHTML =
            '<div class="wc-pancake-empty">Đang fetch livestream đang chạy…</div>';
        try {
            const r3 = await window.CustomersApi.lookupDeep(query, { live: true });
            if (seq !== NS._pancakeSeq) return;
            if (r3?.success && r3.imported?.length) {
                return finishImported(r3.imported.length, 'livestream đang chạy');
            }
        } catch {
            /* tolerate — sang tier 3b */
        }

        // ── Tier 3b: live fetch — search hội thoại Pancake qua browser (rộng nhất) ──
        $('#wcPancakeList').innerHTML =
            '<div class="wc-pancake-empty">Đang tìm hội thoại Pancake…</div>';
        let rows = [];
        try {
            rows = await _searchPancake(query);
        } catch {
            rows = [];
        }
        if (seq !== NS._pancakeSeq) return;
        if (!rows.length) {
            $('#wcPancakeList').innerHTML =
                '<div class="wc-pancake-empty">Không tìm thấy trong Kho KH lẫn Pancake.</div>';
            return;
        }
        // Auto-import tất cả kết quả hội thoại (non-destructive).
        // audit r8: song song thay vì for-await tuần tự (≤12 RTT serial → ~1 RTT).
        // Server upsert ON CONFLICT(phone) nên idempotent, an toàn chạy parallel.
        const _res = await Promise.allSettled(rows.map((c) => _importPancakeConv(c)));
        const added = _res.filter((r) => r.status === 'fulfilled' && r.value).length;
        if (seq !== NS._pancakeSeq) return;
        if (added) return finishImported(added, 'hội thoại Pancake');
        $('#wcPancakeList').innerHTML =
            '<div class="wc-pancake-empty">Đã tìm thấy nhưng không thêm được KH nào.</div>';
    }

    // Import 1 hội thoại Pancake (tier 3b) vào kho — non-destructive qua upsert/create.
    async function _importPancakeConv(c) {
        const phone = normPhone(c.phone);
        const actor = window.Web2UserInfo?.get?.('web2/customers') || {};
        try {
            let res;
            if (phone) {
                res = await window.CustomersApi.upsert({
                    phone,
                    name: c.name || undefined,
                    fbId: c.fbId || undefined,
                    source: 'pancake',
                });
            } else {
                res = await window.CustomersApi.create({
                    name: c.name || 'Khách FB',
                    fbId: c.fbId || undefined,
                    fbPageId: c.pageId || undefined,
                    source: 'pancake',
                    userId: actor.userId,
                    userName: actor.userName,
                });
            }
            return res && res.success !== false;
        } catch {
            return false;
        }
    }

    async function addPancakeToKho(idx) {
        const c = NS._pancakeRows[idx];
        if (!c) return;
        const actor = window.Web2UserInfo?.get?.('web2/customers') || {};
        const phone = normPhone(c.phone);
        try {
            let res;
            if (phone) {
                res = await window.CustomersApi.upsert({
                    phone,
                    name: c.name || undefined,
                    fbId: c.fbId || undefined,
                    source: 'pancake',
                });
            } else {
                // KH FB-only (chưa có SĐT) → tạo với fb identity.
                res = await window.CustomersApi.create({
                    name: c.name || 'Khách FB',
                    fbId: c.fbId || undefined,
                    fbPageId: c.pageId || undefined,
                    source: 'pancake',
                    userId: actor.userId,
                    userName: actor.userName,
                });
            }
            if (res && res.success === false) throw new Error(res.error || 'Thêm thất bại');
            notify('Đã thêm KH vào kho', 'success');
            hidePancakeResults();
            // Reload kho — KH mới sẽ khớp từ khoá đang tìm.
            NS.load();
        } catch (e) {
            notify('✗ ' + e.message, 'error');
        }
    }

    NS.bind = bind;
    NS.hidePancakeResults = hidePancakeResults;
    NS._getPageIds = _getPageIds;
    NS._searchPancake = _searchPancake;
    NS.runPancakeFallback = runPancakeFallback;
    NS._importPancakeConv = _importPancakeConv;
    NS.addPancakeToKho = addPancakeToKho;
})();
