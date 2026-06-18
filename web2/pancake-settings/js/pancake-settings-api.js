// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web 2.0 — Pancake settings: data loading / API calls
// (pages, accounts, refresh-status, relay) — all via window.Web2*
// =====================================================

(function () {
    'use strict';

    const NS = (window.__PancakeSettings = window.__PancakeSettings || {});
    const S = NS.state;
    const $ = NS.$;
    const notify = NS.notify;
    const escapeHtml = NS.escapeHtml;

    async function loadPages() {
        const list = $('pageList');
        list.innerHTML = `<div class="ps-loading">Đang load danh sách pages…</div>`;
        const r = await window.Web2Chat.listPages();
        if (!r.ok) {
            list.innerHTML = `<div class="ps-loading" style="color:#b91c1c;">Lỗi: ${escapeHtml(r.reason || 'unknown')} — kiểm tra JWT.</div>`;
            return;
        }
        S._pagesCache = r.pages;
        NS.renderPageList(r.pages);
    }

    /**
     * Lưu token đang active vào DB pancake_accounts (account_id = uid) + set
     * active local + refresh danh sách accounts. Không chặn flow nếu lỗi mạng.
     */
    async function persistActiveToDb(token, decoded) {
        if (!window.Web2PancakeAccounts) return;
        try {
            const r = await window.Web2PancakeAccounts.addFromToken(token);
            if (r.ok) {
                window.Web2PancakeAccounts.setActiveLocal({
                    account_id: r.accountId,
                    token,
                    exp: (decoded || r.decoded)?.exp,
                });
                await loadAccounts();
            }
        } catch {
            /* DB offline — token vẫn lưu localStorage, không chặn */
        }
    }

    // Lấy lại danh sách page admin TRỰC TIẾP từ token của từng account còn hạn rồi
    // ghi vào DB (`pancake_accounts.pages`). Sửa case account có quyền page nhưng
    // pages cache rỗng/cũ (vd Kỹ Thuật NJD — token ok nhưng chưa từng fetch pages).
    // Sau khi ghi → force sync localStorage để "Tăng comment" (getPageAccountJwts)
    // cũng thấy pages mới.
    async function syncAccountPages() {
        const btn = $('btnSyncAccountPages');
        const PA = window.Web2PancakeAccounts;
        if (!PA || typeof PA.updatePages !== 'function') {
            notify('Module accounts chưa sẵn sàng (load lại trang)', 'error');
            return;
        }
        const accounts = Array.isArray(S._accountsCache) ? S._accountsCache : [];
        if (!accounts.length) {
            notify('Chưa có tài khoản nào để đồng bộ', 'warning');
            return;
        }
        const workerUrl =
            window.API_CONFIG?.WORKER_URL || window.Web2Chat?._internal?.WORKER_URL || '';
        if (!workerUrl) {
            notify('Thiếu worker URL (web2-auth chưa load)', 'error');
            return;
        }
        const now = Math.floor(Date.now() / 1000);
        let origHtml = '';
        if (btn) {
            origHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML =
                '<i data-lucide="loader" style="width:14px;height:14px;animation:spin 1s linear infinite;"></i> Đang đồng bộ…';
            if (window.lucide?.createIcons) window.lucide.createIcons();
        }
        let updated = 0,
            failed = 0,
            skipped = 0;
        for (const a of accounts) {
            const token = a.token;
            const expired = a.token_exp && Number(a.token_exp) < now;
            if (!token || expired) {
                skipped++;
                continue;
            }
            try {
                const url = `${workerUrl}/api/pancake/pages?access_token=${encodeURIComponent(token)}`;
                const data = await fetch(url).then((r) => r.json());
                const raw =
                    data?.categorized?.activated ||
                    data?.pages ||
                    (Array.isArray(data) ? data : []) ||
                    [];
                const pages = raw
                    .filter((p) => p && p.id)
                    .map((p) => ({
                        id: String(p.id),
                        name: p.name || p.page_name || String(p.id),
                    }));
                // Chỉ ghi khi danh sách khác cache hiện tại; KHÔNG ghi đè rỗng (token
                // lỗi/rate-limit trả [] sẽ không xoá pages đang có).
                const before = Array.isArray(a.pages)
                    ? a.pages
                          .map((p) => String((p && typeof p === 'object' ? p.id : p) || ''))
                          .sort()
                          .join(',')
                    : '';
                const after = pages
                    .map((p) => p.id)
                    .sort()
                    .join(',');
                if (after && after !== before) {
                    const r = await PA.updatePages(a.account_id, pages);
                    if (r.ok) updated++;
                    else failed++;
                }
            } catch (_) {
                failed++;
            }
        }
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHtml;
            if (window.lucide?.createIcons) window.lucide.createIcons();
        }
        // Làm tươi localStorage ALL_ACCOUNTS để boost thấy pages mới ngay.
        try {
            if (window.Web2Chat?.syncFromRenderDB)
                await window.Web2Chat.syncFromRenderDB({ force: true });
        } catch (_) {
            /* không chặn */
        }
        await loadAccounts(); // refetch + render lại cả 2 card
        notify(
            `Đồng bộ pages: ${updated} cập nhật · ${skipped} bỏ qua (hết hạn/không token) · ${failed} lỗi`,
            failed ? 'warning' : 'success'
        );
    }

    async function loadAccounts() {
        const list = $('accountList');
        const PA = window.Web2PancakeAccounts;
        if (!PA) {
            if (list) list.innerHTML = `<div class="ps-loading">Module accounts chưa load.</div>`;
            return;
        }
        if (list) list.innerHTML = `<div class="ps-loading">Đang tải danh sách tài khoản…</div>`;
        const r = await PA.list();
        if (!r.ok) {
            if (list)
                list.innerHTML = `<div class="ps-loading" style="color:#b91c1c;">Lỗi tải tài khoản: ${escapeHtml(r.reason || 'unknown')}</div>`;
            $('accountsBadge').textContent = 'lỗi';
            $('accountsBadge').className = 'badge err';
            return;
        }
        S._accountsCache = r.accounts;
        NS.renderAccountList(r.accounts);
        NS.renderPageAdminStats(); // tổng hợp admin theo page từ cùng dữ liệu
        // Lấy trạng thái auto-refresh (creds/auto) rồi render lại — không chặn.
        // Lưu promise để renewAccount có thể await tránh race (bấm "Gia hạn" khi status chưa load).
        S._refreshStatusLoaded = false;
        S._refreshStatusPromise = PA.getRefreshStatus()
            .then((s) => {
                if (s.ok) {
                    S._refreshStatus = s.map;
                    S._credsKeyConfigured = s.credsKeyConfigured;
                    NS.renderAccountList(S._accountsCache);
                }
                S._refreshStatusLoaded = true;
            })
            .catch(() => {
                S._refreshStatusLoaded = true;
            });
    }

    async function loadRelayPages() {
        const list = $('relayPageList');
        const badge = $('relayBadge');
        if (list)
            list.innerHTML = `<div class="ps-loading">Đang tải danh sách trang từ relay…</div>`;
        try {
            const r = await fetch(NS.RELAY_WORKER + '/api/web2-live-relay/pages', {
                signal: AbortSignal.timeout(25000),
            });
            const j = await r.json();
            if (!j.success) throw new Error(j.error || 'lỗi relay');
            S._relayAccounts = j.accounts || [];
            NS.renderRelayPages(S._relayAccounts);
        } catch (e) {
            if (list)
                list.innerHTML = `<div class="ps-loading" style="color:#b91c1c;">Không tải được từ relay: ${escapeHtml(e.message)}.<br>Relay có thể đang khởi động (Render) — bấm <strong>Tải lại</strong> sau ~30s.</div>`;
            if (badge) {
                badge.textContent = 'lỗi';
                badge.className = 'badge err';
            }
        }
    }

    async function saveRelaySelection() {
        const btn = $('btnRelaySave');
        const byUid = {};
        document.querySelectorAll('#relayPageList .relay-pg').forEach((cb) => {
            const uid = cb.dataset.uid;
            byUid[uid] = byUid[uid] || [];
            if (cb.checked) byUid[uid].push(cb.dataset.pid);
        });
        const uids = Object.keys(byUid);
        if (!uids.length) {
            notify('Không có trang nào để lưu', 'warning');
            return;
        }
        if (uids.every((u) => byUid[u].length === 0)) {
            notify('Tick ít nhất 1 trang để relay nghe comment', 'warning');
            return;
        }
        NS._setBtnLoading(btn, 'Đang kết nối lại…');
        let okCount = 0;
        for (const uid of uids) {
            try {
                const r = await fetch(NS.RELAY_WORKER + '/api/web2-live-relay/connect', {
                    method: 'POST',
                    headers: window.Web2Auth?.authHeaders
                        ? window.Web2Auth.authHeaders({ 'Content-Type': 'application/json' })
                        : { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: uid, pageIds: byUid[uid] }),
                    signal: AbortSignal.timeout(25000),
                });
                const j = await r.json();
                if (j.success) okCount++;
                else notify('Lỗi: ' + (j.error || 'unknown'), 'error');
            } catch (e) {
                notify('Lỗi gọi relay: ' + e.message, 'error');
            }
        }
        NS._restoreBtn(btn);
        if (okCount) {
            notify(`Đã lưu + kết nối lại ${okCount} tài khoản`, 'success');
            setTimeout(loadRelayPages, 3000); // relay reconnect vài giây → refresh trạng thái
        }
    }

    // Expose on namespace.
    NS.loadPages = loadPages;
    NS.persistActiveToDb = persistActiveToDb;
    NS.syncAccountPages = syncAccountPages;
    NS.loadAccounts = loadAccounts;
    NS.loadRelayPages = loadRelayPages;
    NS.saveRelaySelection = saveRelaySelection;
})();
