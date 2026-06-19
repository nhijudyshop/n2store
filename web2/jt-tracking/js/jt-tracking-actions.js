// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// J&T Tracking — actions: quickAdd, scanZalo, scanHistory, refreshAll, rowAction (refresh/duyệt),
// tagPancake (gắn/gỡ thẻ Pancake) + resolvePancakeConv. UI-first cho duyệt qua Web2Optimistic.
(function () {
    'use strict';

    const { DEFAULT_CELL, $, notify } = window.JtTrackingConst;
    const { api } = window.JtTrackingApi;
    const S = window.JtTrackingState;
    const R = window.JtTrackingRender;
    const M = window.JtTrackingModals;

    function setBusy(btn, on, labelHtml) {
        if (!btn) return;
        if (on) {
            btn.dataset._html = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = `<span class="jt-spin"></span>${labelHtml || ''}`;
        } else {
            btn.disabled = false;
            if (btn.dataset._html) btn.innerHTML = btn.dataset._html;
        }
    }

    async function quickAdd(e) {
        e.preventDefault();
        const raw = $('jtQaCode').value || '';
        const cell =
            ($('jtQaCell').value || DEFAULT_CELL).replace(/\D/g, '').slice(-4) || DEFAULT_CELL;
        const codes = [...new Set(raw.match(/\d{12}/g) || [])];
        if (!codes.length) return notify('Nhập mã 12 số (vd 802762251204)', 'warning');
        const btn = $('jtQaBtn');
        setBusy(btn, true, ' Đang tra…');
        try {
            if (codes.length === 1) {
                await api('/track', {
                    method: 'POST',
                    body: { billcode: codes[0], cellphone: cell, source: 'manual' },
                });
                $('jtQaCode').value = '';
                await window.JtTrackingApp.load();
                R.openTimeline(codes[0]);
            } else {
                await api('/add', { method: 'POST', body: { codes } });
                await api('/refresh', { method: 'POST', body: { codes } });
                $('jtQaCode').value = '';
                notify(`Đã thêm + tra ${codes.length} mã`, 'success');
                await window.JtTrackingApp.load();
            }
        } catch (err) {
            notify('✗ ' + err.message, 'error');
        } finally {
            setBusy(btn, false);
        }
    }

    async function scanZalo() {
        const btn = $('jtScan');
        setBusy(btn, true, ' Đang quét…');
        try {
            const j = await api('/scan', { method: 'POST' });
            notify(`Quét xong: ${j.found} mã, thêm mới ${j.added}`, 'success');
            await window.JtTrackingApp.load();
            if (j.added) refreshAll(); // tự tra các mã mới
        } catch (e) {
            notify('✗ ' + e.message, 'error');
        } finally {
            setBusy(btn, false);
        }
    }

    // Đọc lịch sử nhóm Zalo (zca, 14 ngày) → quét đơn CŨ / bị thiếu.
    async function scanHistory() {
        const btn = $('jtScanHistory');
        setBusy(btn, true, ' Đang đọc lịch sử…');
        try {
            const j = await api('/scan-history', {
                method: 'POST',
                body: { days: 14, count: 1000 },
            });
            const reach = j.oldestDate ? ` (tới ${j.oldestDate})` : '';
            const more = j.more ? ' · Zalo còn tin cũ hơn nhưng API không lấy sâu được' : '';
            notify(
                `Lịch sử ${j.days || 14} ngày: đọc ${j.fetched} tin${reach} · ${j.found} mã · thêm mới ${j.added}${more}` +
                    (j.errors?.length ? ` (${j.errors.length} nhóm lỗi)` : ''),
                j.added ? 'success' : 'info'
            );
            await window.JtTrackingApp.load();
            if (j.added) refreshAll(); // tự tra các mã mới
        } catch (e) {
            notify('✗ ' + e.message, 'error');
        } finally {
            setBusy(btn, false);
        }
    }

    let _refreshing = false;
    async function refreshAll() {
        if (_refreshing) return; // tránh 2 vòng refresh chạy song song (scan + nút)
        _refreshing = true;
        const btn = $('jtRefreshAll');
        setBusy(btn, true, ' Đang làm mới…');
        try {
            let guard = 0;
            let r;
            do {
                r = await api('/refresh', { method: 'POST' });
                guard++;
            } while (r.remaining && guard < 20);
            await window.JtTrackingApp.load();
            notify('Đã làm mới trạng thái', 'success');
        } catch (e) {
            notify('✗ ' + e.message, 'error');
        } finally {
            setBusy(btn, false);
            _refreshing = false;
        }
    }

    // ── AUTO cập nhật trạng thái khi MỞ trang (browser-driven, nhẹ J&T) ──────
    // Tra lại nhỏ giọt các đơn ĐANG HOẠT ĐỘNG khi tab đang xem. KHÔNG cron 24/7 →
    // đóng trang là ngừng (ít rủi ro jtexpress chặn). SSE đẩy update sang tab/máy khác.
    const AUTO_INTERVAL_MS = 90000; // 90s/lần khi tab visible
    const AUTO_MIN_GAP_MS = 30000; // chặn gọi dồn (vd visibilitychange liên tục)
    let _autoBusy = false;
    let _autoTimer = null;
    let _lastAuto = 0;
    async function autoRefreshActive() {
        if (_autoBusy || _refreshing) return;
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
        const t = Date.now();
        if (t - _lastAuto < AUTO_MIN_GAP_MS) return;
        _lastAuto = t;
        _autoBusy = true;
        const ind = $('jtAutoStatus');
        ind?.classList.add('is-syncing');
        try {
            // mode:'active' → server tra các đơn chưa chốt, nhỏ giọt. Đổi trạng thái → _notify
            // → SSE web2:jt-tracking → mọi tab reload. Reload tab này luôn cho chắc.
            const r = await api('/refresh', {
                method: 'POST',
                body: { mode: 'active', limit: 15 },
            });
            if (r && (r.ok || r.rederived)) await window.JtTrackingApp.load();
        } catch (e) {
            /* im lặng — auto chạy nền, không toast để khỏi phiền khi mạng/J&T chập chờn */
        } finally {
            ind?.classList.remove('is-syncing');
            _autoBusy = false;
        }
    }
    function startAutoRefresh() {
        if (_autoTimer) return;
        const tick = () => {
            if (document.visibilityState === 'visible') autoRefreshActive();
        };
        setTimeout(tick, 2500); // chạy 1 lần sau khi list load xong
        _autoTimer = setInterval(tick, AUTO_INTERVAL_MS);
        // Quay lại tab (foreground) → tra ngay để fresh đúng lúc bắt đầu làm việc.
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') autoRefreshActive();
        });
    }

    async function rowAction(act, code) {
        // refresh = tra cứu J&T server-side (NẶNG) → giữ await + reload (không optimistic).
        if (act === 'refresh') {
            try {
                await api('/track', { method: 'POST', body: { billcode: code } });
                notify('Đã làm mới ' + code, 'success');
                await window.JtTrackingApp.load();
            } catch (e) {
                notify('✗ ' + e.message, 'error');
            }
            return;
        }
        // approve / unapprove (duyệt): UI-FIRST — đổi trạng thái + mờ row NGAY,
        // backend chạy ngầm, lỗi thì rollback. SSE web2:jt-tracking reload authoritative.
        const row = S.state.list.find((r) => String(r.billcode) === String(code));
        const prev = row ? row.approved_at : undefined;
        const next = act === 'approve' ? Date.now() : null;
        const apply = () => {
            if (row) {
                row.approved_at = next;
                R.renderList();
                R.renderKpi();
            }
        };
        const rollback = () => {
            if (row) {
                row.approved_at = prev;
                R.renderList();
                R.renderKpi();
            }
        };
        const run = () => api('/' + code + '/' + act, { method: 'POST' });
        const opts = {
            snapshot: prev,
            apply,
            run,
            rollback,
            successMsg: act === 'approve' ? 'Đã duyệt — tự xoá sau 7 ngày' : 'Đã bỏ duyệt',
            errLabel: (act === 'approve' ? 'duyệt ' : 'bỏ duyệt ') + code,
        };
        if (window.Web2Optimistic?.run) {
            window.Web2Optimistic.run(opts);
        } else {
            apply();
            run().catch(() => {
                rollback();
                notify('✗ Lỗi ' + opts.errLabel, 'error');
            });
        }
    }

    // ── Nhắn tin khách (Zalo / Pancake) + tag Pancake ──────────────
    // Danh sách pageId Pancake của shop (từ accounts đã lưu — giống web2/customers).
    function getPancakePageIds() {
        const set = new Set();
        try {
            const accs = JSON.parse(localStorage.getItem('pancake_all_accounts') || '{}');
            for (const v of Object.values(accs)) {
                for (const p of Array.isArray(v?.pages) ? v.pages : []) {
                    const pid = p?.id || p?.page_id || p?.pageId;
                    if (pid) set.add(String(pid));
                }
            }
        } catch {}
        const pat = window.Web2Chat?.getAllPageAccessTokens?.() || {};
        for (const k of Object.keys(pat)) set.add(String(k));
        return [...set].filter(Boolean);
    }

    // Tìm hội thoại Pancake INBOX theo SĐT (quét mọi page). Trả {pageId,convId,customerId,name} | null.
    async function resolvePancakeConv(phone) {
        if (!window.Web2Chat?.searchConversations) return null;
        try {
            await window.Web2Chat.syncFromRenderDB?.();
        } catch {}
        const pageIds = getPancakePageIds();
        if (!pageIds.length) return null;
        const q = String(phone || '').replace(/\s+/g, '');
        const settled = await Promise.allSettled(
            pageIds.map((pid) => window.Web2Chat.searchConversations(pid, q))
        );
        let best = null;
        for (let i = 0; i < settled.length; i++) {
            const r = settled[i];
            if (r.status !== 'fulfilled' || !r.value?.ok) continue;
            for (const c of r.value.conversations || []) {
                if (!c.id) continue;
                const cust = c.customers?.[0] || {};
                const cand = {
                    pageId: String(c.page_id || c.fb_page_id || pageIds[i] || ''),
                    convId: c.id,
                    customerId: cust.id || null,
                    name: cust.name || cust.full_name || c.name || '',
                    isInbox: (c.type || '').toUpperCase() === 'INBOX',
                    tags: Array.isArray(c.tags) ? c.tags : [], // thẻ HIỆN TẠI của hội thoại (2 chiều)
                };
                if (!best || (cand.isInbox && !best.isInbox)) best = cand;
            }
        }
        return best;
    }

    // Gắn / GỠ thẻ Pancake "XỬ LÝ BC" — TOGGLE theo trạng thái THẬT trên Pancake (2 chiều):
    // đã có thẻ → hỏi (custom confirm) rồi gỡ; chưa có → gắn. Đồng bộ nút + localStorage.
    async function tagPancake(phone, btn) {
        if (!phone) return;
        const TAG_NAME = 'xử lý bc';
        if (btn) {
            btn.disabled = true;
            btn.classList.add('is-busy');
        }
        try {
            if (!window.Web2Chat?.fetchTags) {
                notify('Pancake chưa sẵn sàng', 'warning');
                return;
            }
            const conv = await resolvePancakeConv(phone);
            if (!conv) {
                notify('Không tìm thấy hội thoại Pancake cho SĐT này', 'warning');
                return;
            }
            const tagsRes = await window.Web2Chat.fetchTags(conv.pageId);
            if (!tagsRes.ok) {
                notify('Không lấy được danh sách thẻ Pancake', 'error');
                return;
            }
            const tag = (tagsRes.tags || []).find(
                (t) =>
                    String(t.text || t.name || '')
                        .trim()
                        .toLowerCase() === TAG_NAME
            );
            if (!tag) {
                notify('Page chưa có thẻ "XỬ LÝ BC"', 'warning');
                return;
            }
            const tagId = tag.id ?? tag.tag_id;
            // Trạng thái THẬT trên Pancake: hội thoại có sẵn thẻ này chưa?
            const has = Array.isArray(conv.tags)
                ? conv.tags.some((t) => String(t?.id ?? t?.tag_id ?? t) === String(tagId))
                : S.taggedPhones.has(phone);
            // đồng bộ hiển thị về đúng trạng thái thật trước khi thao tác
            if (has) S.markTagged(phone);
            else S.unmarkTagged(phone);
            S.setTagButtons(phone, has);

            if (has) {
                const ok = await M.jtConfirm(
                    'Khách đã có thẻ "XỬ LÝ BC" trên Pancake.\nGỡ thẻ này?',
                    'Gỡ thẻ',
                    'danger'
                );
                if (!ok) return;
                const r = await window.Web2Chat.toggleTag(
                    conv.pageId,
                    conv.convId,
                    tagId,
                    'remove'
                );
                if (r.ok) {
                    notify('Đã gỡ thẻ "XỬ LÝ BC"', 'success');
                    S.unmarkTagged(phone);
                    S.setTagButtons(phone, false);
                } else notify('Gỡ thẻ lỗi: ' + (r.reason || ''), 'error');
            } else {
                const r = await window.Web2Chat.toggleTag(conv.pageId, conv.convId, tagId, 'add');
                if (r.ok) {
                    notify('Đã gắn thẻ "XỬ LÝ BC" cho khách', 'success');
                    S.markTagged(phone);
                    S.setTagButtons(phone, true);
                } else notify('Gắn thẻ lỗi: ' + (r.reason || ''), 'error');
            }
        } catch (e) {
            notify('Lỗi: ' + e.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('is-busy');
            }
        }
    }

    window.JtTrackingActions = {
        setBusy,
        quickAdd,
        scanZalo,
        scanHistory,
        refreshAll,
        autoRefreshActive,
        startAutoRefresh,
        rowAction,
        getPancakePageIds,
        resolvePancakeConv,
        tagPancake,
    };
})();
