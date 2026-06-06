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
    const PROXY = 'https://chatomni-proxy.nhijudyshop.workers.dev';
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
        const d = document.createElement('div');
        d.textContent = String(s ?? '');
        return d.innerHTML;
    }
    function fmtTime(ts) {
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
        const r = await fetch(url, { credentials: 'include' });
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
        try {
            const d = await fetchJson(url);
            if (!d.success) throw new Error(d.error || 'Lỗi');
            const got = d.data || [];
            st.items.push(...got);
            st.hasMore = !!d.meta?.hasMore;
            st.offset += got.length;
        } catch (e) {
            /* ignore */
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
            b.onclick = async (e) => {
                e.stopPropagation();
                const id = Number(b.dataset.done);
                const body = window.Web2UserInfo?.attachToBody
                    ? window.Web2UserInfo.attachToBody({}, 'web2-ck-dashboard')
                    : {};
                try {
                    await fetch(`${INTENT}/${id}/done`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify(body),
                    });
                } catch (err) {
                    /* ignore */
                }
                loadCol('intents', true);
            };
        });
    }

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

    // ─── Tab: Đối soát CK | Tin nhắn chưa đọc ─────────────────────────
    let _unreadMounted = false;
    function switchTab(tab) {
        document
            .querySelectorAll('.ckd-tab')
            .forEach((t) => t.classList.toggle('is-active', t.dataset.tab === tab));
        const reconcile = tab === 'reconcile';
        document.getElementById('ckdReconcilePane').hidden = !reconcile;
        document.getElementById('ckdUnreadPane').hidden = reconcile;
        if (!reconcile) {
            // Mount panel "Tin nhắn chưa đọc" lần đầu; sau đó nó tự reload qua SSE.
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
            if (window.lucide) window.lucide.createIcons();
        }
    }
    function wireTabs() {
        document.querySelectorAll('.ckd-tab').forEach((t) => {
            t.onclick = () => switchTab(t.dataset.tab);
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (window.Web2Sidebar)
            window.Web2Sidebar.mount('#web2Aside', { activeRoute: 'ck-dashboard' });
        wireTabs();
        reloadAll();
        if (window.Web2SSE?.subscribe) {
            window.Web2SSE.subscribe('web2:payment-signals', () => {
                loadCol('pending', true);
                loadCol('wait', true);
            });
            window.Web2SSE.subscribe('web2:customer-intents', () => loadCol('intents', true));
            // Badge "Tin nhắn chưa đọc" cập nhật ngầm dù đang ở tab Đối soát.
            window.Web2SSE.subscribe('web2:unread', () => {
                if (_unreadMounted) return; // panel tự lo khi đã mount
            });
        }
        if (window.lucide) window.lucide.createIcons();
    });
})();
