// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Dashboard đối soát CK.
// =====================================================
// Web 2.0 — Dashboard đối soát CK (3 cột)
// =====================================================
//   1. Chờ duyệt           — payment-signals?status=pending
//   2. Đã duyệt chờ tiền về — payment-signals?status=confirmed&noTx=1
//   3. Yêu cầu khác của KH  — customer-intents?status=open
// Click card → Web2CkReview.openReview / mark done. SSE realtime.

(function () {
    'use strict';
    const PROXY =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const SIG = PROXY + '/api/web2/payment-signals';
    const INTENT = PROXY + '/api/web2/customer-intents';
    const PAGE = 10;
    const AGING_MS = 6 * 60 * 60 * 1000; // > 6h = đỏ

    const state = {
        pending: { offset: 0, items: [], hasMore: true },
        wait: { offset: 0, items: [], hasMore: true },
        intents: { offset: 0, items: [], hasMore: true },
    };

    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        if (window.Web2Escape) return window.Web2Escape.escapeHtml(s);
        const d = document.createElement('div');
        d.textContent = String(s ?? '');
        return d.innerHTML;
    }
    function fmtTime(ts) {
        if (window.Web2Format) return window.Web2Format.dateTime(ts);
        if (!ts) return '';
        const n = typeof ts === 'number' ? ts : Date.parse(ts);
        return Number.isNaN(n) ? '' : new Date(n).toLocaleString('vi-VN');
    }
    function ageTxt(ts) {
        if (!ts) return '';
        const ms = Date.now() - Number(ts);
        const h = Math.floor(ms / 3600000);
        if (h < 1) return `${Math.floor(ms / 60000)} phút`;
        if (h < 24) return `${h} giờ`;
        return `${Math.floor(h / 24)} ngày`;
    }

    async function fetchJson(url) {
        // audit r8 fix: gửi x-web2-token — route customer-intents/payment-signals GET
        // đã gate requireWeb2AuthSoft (WEB2_AUTH_ENFORCE=1) → thiếu token = 401.
        const headers = window.Web2Auth?.authHeaders ? window.Web2Auth.authHeaders() : {};
        const r = await fetch(url, { credentials: 'include', headers });
        return r.json();
    }

    // ─── Lịch sử thao tác (timeline) trên thẻ ─────────────────────────
    const ACTION_VI = {
        detect: 'Hệ thống nhận',
        confirm: 'Xác nhận',
        approve: 'Duyệt',
        dismiss: 'Bỏ qua',
        link: 'Gán đơn',
        'auto-link': 'Tự khớp',
        notify: 'Gửi tin',
    };
    function historyHtml(h) {
        if (!Array.isArray(h) || !h.length) return '';
        let inner;
        if (window.Web2HistoryTimeline?.render) {
            inner = window.Web2HistoryTimeline.render(h, { title: false });
        } else {
            inner = h
                .map(
                    (e) =>
                        `<div class="ckd-hist-row"><b>${esc(ACTION_VI[e.action] || e.action)}</b> · ${esc(e.userName || '(ẩn danh)')} · ${esc(fmtTime(e.ts))}${e.note ? ' · ' + esc(e.note) : ''}</div>`
                )
                .join('');
        }
        return `<details class="ckd-history" onclick="event.stopPropagation()"><summary>Lịch sử (${h.length})</summary>${inner}</details>`;
    }

    // ─── Render signal card (pending / wait) ──────────────────────────
    function sigCard(sig) {
        const aging = sig.createdAt && Date.now() - sig.createdAt > AGING_MS ? ' aging' : '';
        const order = sig.orderCode
            ? `Đơn ${esc(sig.orderCode)}${sig.order ? ' · ' + Number(sig.order.total).toLocaleString('vi-VN') + 'đ' : ''}`
            : 'Chưa khớp đơn';
        return `
        <div class="ckd-card${aging}" data-sig="${sig.id}">
            <div class="ckd-cust">${esc(sig.customerName || sig.psid || 'KH')}
                <span class="ckd-kw">${esc(sig.keyword || '')}</span></div>
            <div class="ckd-msg">"${esc(sig.rawMessage || '')}"</div>
            <div class="ckd-meta">${esc(order)} · <span class="ckd-age">${esc(ageTxt(sig.createdAt))}</span></div>
            ${historyHtml(sig.history)}
        </div>`;
    }
    function intentCard(it) {
        return `
        <div class="ckd-card intent" data-intent="${it.id}">
            <div class="ckd-cust">${esc(it.customerName || it.psid || 'KH')}
                <span class="ckd-kw">${esc(it.label || it.intent)}</span></div>
            <div class="ckd-msg">"${esc(it.rawMessage || '')}"</div>
            <div class="ckd-meta">${esc(fmtTime(it.createdAt))} · <span class="ckd-age">${esc(ageTxt(it.createdAt))}</span></div>
            <button class="ckd-done-btn" data-done="${it.id}">✓ Đã xử lý</button>
        </div>`;
    }

    function renderCol(key, elId, countId, cardFn, openFn) {
        const st = state[key];
        const root = document.getElementById(elId);
        document.getElementById(countId).textContent = st.items.length;
        if (!st.items.length) {
            root.innerHTML = '<div class="ckd-empty">Trống.</div>';
            return;
        }
        root.innerHTML =
            st.items.map(cardFn).join('') +
            (st.hasMore ? '<button class="ckd-more">Tải thêm</button>' : '');
        const mb = root.querySelector('.ckd-more');
        if (mb) mb.onclick = () => loadCol(key, false);
        openFn(root);
    }

    async function loadCol(key, reset) {
        const st = state[key];
        if (reset) {
            st.offset = 0;
            st.items = [];
        }
        let url;
        if (key === 'pending') url = `${SIG}?status=pending&limit=${PAGE}&offset=${st.offset}`;
        else if (key === 'wait')
            url = `${SIG}?status=confirmed&noTx=1&limit=${PAGE}&offset=${st.offset}`;
        else url = `${INTENT}?status=open&limit=${PAGE}&offset=${st.offset}`;
        let loadErr = null;
        try {
            const d = await fetchJson(url);
            if (!d.success) throw new Error(d.error || 'Lỗi');
            const got = d.data || [];
            st.items.push(...got);
            st.hasMore = !!d.meta?.hasMore;
            st.offset += got.length;
        } catch (e) {
            loadErr = e;
            console.warn('[ck-dashboard] loadCol', key, 'failed:', e.message || e);
            // Chỉ hiện error state khi cột rỗng (lần load đầu thất bại) — tránh
            // đè data đã có khi "Tải thêm" lỗi.
            if (!st.items.length) {
                const elId =
                    key === 'pending' ? 'ckdPending' : key === 'wait' ? 'ckdWait' : 'ckdIntents';
                const root = document.getElementById(elId);
                if (root) {
                    root.innerHTML = `<div class="ckd-empty" style="color:#dc2626;">Lỗi tải: ${esc(e.message || e)}</div>`;
                }
            }
            if (window.notificationManager?.show) {
                window.notificationManager.show(
                    '✗ Lỗi tải dữ liệu đối soát: ' + (e.message || e),
                    'error'
                );
            }
        }
        // Khi load đầu lỗi + cột rỗng → đã render error state ở trên, không
        // render đè empty. Vẫn cập nhật stats.
        if (loadErr && !st.items.length) {
            renderStats();
            return;
        }
        if (key === 'intents') {
            renderCol('intents', 'ckdIntents', 'ckdIntentCount', intentCard, bindIntents);
        } else {
            const elId = key === 'pending' ? 'ckdPending' : 'ckdWait';
            const cntId = key === 'pending' ? 'ckdPendingCount' : 'ckdWaitCount';
            renderCol(key, elId, cntId, sigCard, (root) => bindSig(root, key));
        }
        renderStats();
    }

    function bindSig(root, key) {
        root.querySelectorAll('[data-sig]').forEach((c) => {
            c.onclick = () => {
                const id = Number(c.dataset.sig);
                const sig = state[key].items.find((s) => s.id === id);
                window.Web2CkReview?.openReview({
                    signal: sig,
                    onDone: () => {
                        loadCol('pending', true);
                        loadCol('wait', true);
                    },
                });
            };
        });
    }
    function bindIntents(root) {
        root.querySelectorAll('[data-done]').forEach((b) => {
            b.onclick = (e) => {
                e.stopPropagation();
                const id = Number(b.dataset.done);
                const body = window.Web2UserInfo?.attachToBody
                    ? window.Web2UserInfo.attachToBody({}, 'web2-ck-dashboard')
                    : {};
                const doFetch = async () => {
                    const r = await fetch(`${INTENT}/${id}/done`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(window.Web2Auth?.authHeaders ? window.Web2Auth.authHeaders() : {}),
                        },
                        credentials: 'include',
                        body: JSON.stringify(body),
                    });
                    if (!r.ok) {
                        let msg = `HTTP ${r.status}`;
                        try {
                            const d = await r.json();
                            msg = d.error || msg;
                        } catch {
                            /* body không phải JSON */
                        }
                        throw new Error(msg);
                    }
                    return r;
                };

                if (window.Web2Optimistic?.run) {
                    const st = state.intents;
                    const idx = st.items.findIndex((it) => it.id === id);
                    const removed = idx !== -1 ? st.items[idx] : null;
                    Web2Optimistic.run({
                        snapshot: () => ({ idx, removed }),
                        apply: () => {
                            // Optimistic: gỡ card khỏi cột ngay.
                            if (idx !== -1) {
                                st.items.splice(idx, 1);
                                renderCol(
                                    'intents',
                                    'ckdIntents',
                                    'ckdIntentCount',
                                    intentCard,
                                    bindIntents
                                );
                                renderStats();
                            }
                        },
                        run: doFetch,
                        onSuccess: () => loadCol('intents', true),
                        rollback: (snap) => {
                            // Chèn lại card về đúng vị trí cũ.
                            if (snap?.removed) {
                                const at = Math.min(snap.idx, st.items.length);
                                st.items.splice(at < 0 ? st.items.length : at, 0, snap.removed);
                                renderCol(
                                    'intents',
                                    'ckdIntents',
                                    'ckdIntentCount',
                                    intentCard,
                                    bindIntents
                                );
                                renderStats();
                            }
                        },
                        successMsg: 'Đã xử lý yêu cầu',
                        errLabel: 'xử lý yêu cầu KH',
                    });
                    return;
                }

                // Legacy await path.
                (async () => {
                    try {
                        await doFetch();
                    } catch (err) {
                        if (window.notificationManager?.show) {
                            window.notificationManager.show(
                                '✗ Lỗi xử lý yêu cầu: ' + (err.message || err),
                                'error'
                            );
                        }
                    }
                    loadCol('intents', true);
                })();
            };
        });
    }

    // NOTE (low-pri, để nguyên): dùng items.length đã load (capped PAGE=10 +
    // các lần "Tải thêm"), KHÔNG phải tổng thực từ /stats. Endpoint
    // GET /payment-signals/stats chỉ trả {pending, confirmed, dismissed} —
    // KHÔNG khớp 3 cột dashboard ("Chờ duyệt"=pending OK, nhưng "Chờ tiền về"
    // = confirmed&noTx=1 ⊄ stats.confirmed, "Yêu cầu khác" = endpoint intents
    // riêng). Trộn 1 cột total-thực + 2 cột loaded-length sẽ gây lệch khó hiểu
    // hơn. Khi cần đếm chuẩn cả 3 → thêm count vào meta của từng list response
    // rồi đọc d.meta.total ở loadCol.
    function renderStats() {
        const el = document.getElementById('ckdStats');
        el.innerHTML = `
            <div class="ckd-stat"><div class="n">${state.pending.items.length}</div><div class="l">Chờ duyệt</div></div>
            <div class="ckd-stat"><div class="n">${state.wait.items.length}</div><div class="l">Chờ tiền về</div></div>
            <div class="ckd-stat"><div class="n">${state.intents.items.length}</div><div class="l">Yêu cầu khác</div></div>`;
    }

    function reloadAll() {
        loadCol('pending', true);
        loadCol('wait', true);
        loadCol('intents', true);
    }

    // ─── Lịch sử CK (tín hiệu đã xử lý) ──────────────────────────────
    const STATUS_VI = { confirmed: 'Đã xác nhận', dismissed: 'Đã bỏ qua', pending: 'Chờ duyệt' };
    const hist = { offset: 0, items: [], hasMore: true, status: 'confirmed', search: '' };
    function histCard(sig) {
        const h = Array.isArray(sig.history) ? sig.history : [];
        const sent = h.some((e) => e.action === 'notify' && /đã gửi/.test(e.note || ''));
        const phonePill = sig.phone ? ` <span data-w2wallet-phone="${esc(sig.phone)}"></span>` : '';
        const bits = [];
        if (sig.orderCode) bits.push('Đơn ' + esc(sig.orderCode));
        if (sig.matchedTxId) bits.push('GD#' + sig.matchedTxId);
        if (sig.confirmedBy) bits.push(esc(sig.confirmedBy));
        return `
        <div class="ckd-hist-card status-${esc(sig.status)}">
            <div class="ckd-cust">${esc(sig.customerName || sig.psid || 'KH')}
                <span class="ckd-kw">${esc(sig.keyword || '')}</span>${phonePill}
                <span class="ckd-hist-badge ${esc(sig.status)}">${esc(STATUS_VI[sig.status] || sig.status)}</span>
                ${sent ? '<span class="ckd-hist-sent">✓ đã gửi tin</span>' : ''}</div>
            <div class="ckd-msg">"${esc(sig.rawMessage || '')}"</div>
            <div class="ckd-meta">${esc(fmtTime(sig.createdAt))}${bits.length ? ' · ' + bits.join(' · ') : ''}</div>
            ${historyHtml(h)}
        </div>`;
    }
    async function loadHistory(reset) {
        // Snapshot TRƯỚC khi reset xoá items → phân biệt lần load đầu (cột rỗng)
        // với reload/đổi filter/refresh/SSE (đã có data) để KHÔNG flash skeleton.
        const hadItems = hist.items.length > 0;
        if (reset) {
            hist.offset = 0;
            hist.items = [];
        }
        const root = document.getElementById('ckdHistory');
        // First-load only: chỉ show skeleton khi cột chưa có data. renderHistory()
        // cuối hàm + catch (khi !items.length) đều innerHTML= → không kẹt skeleton.
        if (reset && !hadItems) {
            if (window.Web2Skeleton) {
                window.Web2Skeleton.cards(root, { count: 4 });
            } else {
                root.innerHTML = '<div class="ckd-empty">Đang tải…</div>';
            }
        }
        const url = `${SIG}?status=${encodeURIComponent(hist.status)}&limit=20&offset=${hist.offset}`;
        try {
            const d = await fetchJson(url);
            if (!d.success) throw new Error(d.error || 'Lỗi');
            const got = d.data || [];
            hist.items.push(...got);
            hist.hasMore = !!d.meta?.hasMore;
            hist.offset += got.length;
        } catch (e) {
            console.warn('[ck-dashboard] loadHistory failed:', e.message || e);
            window.notificationManager?.show('Không tải được lịch sử', 'error');
            if (root && !hist.items.length) {
                root.innerHTML =
                    '<div class="ckd-empty" style="color:#dc2626;">Lỗi tải lịch sử. Vui lòng thử lại.</div>';
            }
        }
        renderHistory();
    }
    function renderHistory() {
        const root = document.getElementById('ckdHistory');
        const q = hist.search.trim().toLowerCase();
        const items = q
            ? hist.items.filter(
                  (s) =>
                      (s.customerName || '').toLowerCase().includes(q) ||
                      (s.phone || '').includes(q)
              )
            : hist.items;
        if (!items.length) {
            root.innerHTML = '<div class="ckd-empty">Chưa có lịch sử.</div>';
            return;
        }
        root.innerHTML =
            items.map(histCard).join('') +
            (hist.hasMore && !q ? '<button class="ckd-more">Tải thêm</button>' : '');
        const mb = root.querySelector('.ckd-more');
        if (mb) mb.onclick = () => loadHistory(false);
        if (window.Web2WalletBalance?.attachBalances) window.Web2WalletBalance.attachBalances(root);
    }
    function wireHistory() {
        const sel = document.getElementById('ckdHistStatus');
        if (sel)
            sel.onchange = () => {
                hist.status = sel.value;
                loadHistory(true);
            };
        const se = document.getElementById('ckdHistSearch');
        if (se) se.oninput = () => ((hist.search = se.value), renderHistory());
        const rf = document.getElementById('ckdHistRefresh');
        if (rf) rf.onclick = () => loadHistory(true);
    }

    // ─── Tab: Đối soát CK | Tin nhắn chưa đọc | Lịch sử CK ────────────
    let _unreadMounted = false;
    function switchTab(tab) {
        document
            .querySelectorAll('.ckd-tab')
            .forEach((t) => t.classList.toggle('is-active', t.dataset.tab === tab));
        document.getElementById('ckdReconcilePane').hidden = tab !== 'reconcile';
        document.getElementById('ckdUnreadPane').hidden = tab !== 'unread';
        document.getElementById('ckdHistoryPane').hidden = tab !== 'history';
        if (tab === 'unread') {
            const root = document.getElementById('ckdUnreadList');
            if (window.Web2UnreadPanel?.mount) {
                if (!_unreadMounted) {
                    _unreadMounted = true;
                    window.Web2UnreadPanel.mount(root, {
                        onCount: (n) => {
                            const el = document.getElementById('ckdUnreadCount');
                            if (el) el.textContent = n;
                        },
                    });
                } else {
                    window.Web2UnreadPanel.reload();
                }
            }
        } else if (tab === 'history') {
            loadHistory(true);
        }
        if (window.lucide) window.lucide.createIcons();
    }
    function wireTabs() {
        document.querySelectorAll('.ckd-tab').forEach((t) => {
            t.onclick = () => switchTab(t.dataset.tab);
        });
        wireHistory();
    }

    function showColSkeletons() {
        // First-load only: gọi 1 lần lúc boot, TRƯỚC reloadAll() → cột còn rỗng.
        // Mọi reload/SSE/filter sau đó renderCol() ghi đè innerHTML → không flash.
        ['ckdPending', 'ckdWait', 'ckdIntents'].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (window.Web2Skeleton) {
                window.Web2Skeleton.list(el, { count: 3, avatar: false });
            } else {
                el.innerHTML =
                    '<span class="w2-skel" style="display:block;height:72px;border-radius:8px;margin-bottom:8px"></span>'.repeat(
                        2
                    ) +
                    '<div class="ckd-empty" style="color:#94a3b8;font-size:12px">Đang tải…</div>';
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (window.Web2Sidebar)
            window.Web2Sidebar.mount('#web2Aside', { activeRoute: 'ck-dashboard' });
        showColSkeletons();
        wireTabs();
        reloadAll();
        if (window.Web2SSE?.subscribe) {
            // MEDIUM-cleanup (2026-06-13): debounce 550ms 1 timer chung — mỗi
            // event burst trước đây bắn 2-3 fetch (pending+wait+history) tức thì.
            let _signalT = null;
            window.Web2SSE.subscribe('web2:payment-signals', () => {
                clearTimeout(_signalT);
                _signalT = setTimeout(() => {
                    loadCol('pending', true);
                    loadCol('wait', true);
                    // Tab Lịch sử đang mở → cập nhật luôn (CK vừa duyệt/khớp/gửi tin).
                    if (!document.getElementById('ckdHistoryPane').hidden) loadHistory(true);
                }, 550);
            });
            // Debounce 450ms (2026-06-22): nhất quán với handler payment-signals (sibling)
            // — burst intents → 1 loadCol thay vì nhiều fetch xếp chồng.
            let _intentsT = null;
            window.Web2SSE.subscribe('web2:customer-intents', () => {
                clearTimeout(_intentsT);
                _intentsT = setTimeout(() => loadCol('intents', true), 450);
            });
            // Badge "Tin nhắn chưa đọc" cập nhật ngầm dù đang ở tab Đối soát.
            window.Web2SSE.subscribe('web2:unread', () => {
                if (_unreadMounted) return; // panel tự lo khi đã mount
            });
        }
        if (window.lucide) window.lucide.createIcons();
    });
})();
