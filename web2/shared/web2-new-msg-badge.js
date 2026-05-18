// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// Web 2.0 — New-message badge for native-orders rows
// =====================================================
//
// Maintains a map of PSID/fbUserId → unread count, sourced from:
//   1. Initial fetch:  Web2Realtime.fetchPendingCustomers()
//   2. Live updates:   Web2Realtime.subscribe(pages:new_message)
//   3. localStorage:   instant restore on page reload
//
// Renders a small red badge ("N MỚI") in the message column of any
// `tr[data-fb-user-id]` row whose customer is in the pending list.
// Idempotent — calling `reapply()` after a table re-render only
// toggles row state when it actually changes.
//
// Suppression: once the user replies to a customer, that PSID is added
// to a 24h "recently replied" map so subsequent WS echoes don't
// re-flash the badge.
//
// Standalone — no shared code with `orders-report/js/chat/new-messages-notifier.js`.

(function (global) {
    'use strict';

    if (global.Web2NewMsgBadge) return;

    const LS_PENDING = 'web2_pending_customers_v1';
    const LS_REPLIED = 'web2_recently_replied_v1';
    const REPLIED_TTL_MS = 24 * 60 * 60 * 1000; // 24h

    // psid → { pageId, name, snippet, count, lastTime }
    const _pending = new Map();
    // psid → epoch ms when user last replied
    let _recentlyReplied = {};
    let _initialized = false;
    let _reconcileTimer = null;
    const RECONCILE_INTERVAL_MS = 5 * 60 * 1000; // 5 min

    // -----------------------------------------------------
    // localStorage helpers
    // -----------------------------------------------------

    function _loadFromStorage() {
        try {
            const raw = localStorage.getItem(LS_PENDING);
            if (raw) {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) {
                    for (const c of arr) {
                        if (c && c.psid) _pending.set(String(c.psid), c);
                    }
                }
            }
        } catch {
            /* ignore */
        }
        try {
            const raw = localStorage.getItem(LS_REPLIED);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    _recentlyReplied = parsed;
                    _pruneRecentlyReplied();
                }
            }
        } catch {
            /* ignore */
        }
    }

    function _saveToStorage() {
        try {
            const arr = [..._pending.values()];
            localStorage.setItem(LS_PENDING, JSON.stringify(arr));
        } catch {
            /* quota */
        }
    }

    function _saveReplied() {
        try {
            localStorage.setItem(LS_REPLIED, JSON.stringify(_recentlyReplied));
        } catch {
            /* quota */
        }
    }

    function _pruneRecentlyReplied() {
        const cutoff = Date.now() - REPLIED_TTL_MS;
        let dirty = false;
        for (const k of Object.keys(_recentlyReplied)) {
            if (Number(_recentlyReplied[k]) < cutoff) {
                delete _recentlyReplied[k];
                dirty = true;
            }
        }
        if (dirty) _saveReplied();
    }

    // -----------------------------------------------------
    // DOM rendering
    // -----------------------------------------------------

    function _ensureStyle() {
        if (document.getElementById('w2-new-msg-style')) return;
        const css = `
            .w2-pending-row td { background: #fff7ed !important; }
            .w2-pending-row:hover td { background: #ffedd5 !important; }
            .w2-new-msg-badge {
                display: inline-flex;
                align-items: center;
                gap: 3px;
                background: #ef4444;
                color: #fff;
                font-size: 10px;
                font-weight: 700;
                padding: 2px 6px;
                border-radius: 10px;
                margin-left: 4px;
                vertical-align: middle;
                animation: w2NewMsgPulse 1.6s ease-in-out infinite;
            }
            @keyframes w2NewMsgPulse {
                0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
                50%      { box-shadow: 0 0 0 4px rgba(239,68,68,0); }
            }
        `;
        const style = document.createElement('style');
        style.id = 'w2-new-msg-style';
        style.textContent = css;
        document.head.appendChild(style);
    }

    /**
     * Apply / remove badges across all visible rows. Idempotent — only
     * toggles when state actually changes (cheap on every WS event).
     */
    function reapply() {
        _ensureStyle();
        const rows = document.querySelectorAll('tr[data-fb-user-id], tr[data-psid]');
        rows.forEach((tr) => {
            const psid = tr.dataset.fbUserId || tr.dataset.psid;
            if (!psid) return;
            const entry = _pending.get(String(psid));
            const isPending = !!entry && !_recentlyReplied[psid];
            const hadClass = tr.classList.contains('w2-pending-row');
            if (isPending && !hadClass) {
                tr.classList.add('w2-pending-row');
            } else if (!isPending && hadClass) {
                tr.classList.remove('w2-pending-row');
            }
            // Place the badge in any TD marked as the message column (CSS
            // class or data attribute). Fall back to the row's last cell.
            let cell = tr.querySelector('td[data-col="message"], td.col-message');
            if (!cell) return;
            const existing = cell.querySelector('.w2-new-msg-badge');
            if (isPending) {
                const count = entry.count || entry.message_count || 1;
                const html = `<span class="w2-new-msg-badge" title="${entry.snippet || ''}">${count} MỚI</span>`;
                if (!existing) {
                    cell.insertAdjacentHTML('beforeend', html);
                } else if (existing.textContent !== `${count} MỚI`) {
                    existing.outerHTML = html;
                }
            } else if (existing) {
                existing.remove();
            }
        });
    }

    // -----------------------------------------------------
    // Public state operations
    // -----------------------------------------------------

    function setPendingCustomers(customers) {
        _pending.clear();
        if (Array.isArray(customers)) {
            for (const c of customers) {
                if (!c) continue;
                const psid = c.psid || c.fb_user_id;
                if (!psid) continue;
                _pending.set(String(psid), {
                    psid: String(psid),
                    pageId: c.page_id || c.pageId || '',
                    name: c.customer_name || c.name || '',
                    snippet: c.last_message_snippet || c.snippet || '',
                    count: c.message_count || c.count || 1,
                    lastTime: c.last_message_time || c.lastTime || Date.now(),
                });
            }
        }
        _saveToStorage();
        reapply();
    }

    function onIncomingMessage(payload) {
        const msg = payload?.message || payload;
        if (!msg) return;
        const fromPsid = msg.from?.id;
        const pageId = msg.page_id || payload.page_id;
        if (!fromPsid || !pageId) return;
        // Skip echoes of the shop's own messages (from === page)
        if (String(fromPsid) === String(pageId)) return;
        // Suppress if user just replied
        if (_recentlyReplied[fromPsid]) return;

        const existing = _pending.get(String(fromPsid));
        const next = {
            psid: String(fromPsid),
            pageId: String(pageId),
            name: msg.from?.name || existing?.name || '',
            snippet: msg.message || msg.text || existing?.snippet || '',
            count: (existing?.count || 0) + 1,
            lastTime: msg.inserted_at || Date.now(),
        };
        _pending.set(String(fromPsid), next);
        _saveToStorage();
        reapply();
    }

    function clearPendingForCustomer(psid) {
        if (!psid) return;
        const key = String(psid);
        _pending.delete(key);
        _recentlyReplied[key] = Date.now();
        _saveToStorage();
        _saveReplied();
        reapply();
        // Server-side cleanup (best-effort)
        if (global.Web2Realtime?.markReplied) {
            global.Web2Realtime.markReplied(key).catch(() => {});
        }
    }

    function clearAll() {
        _pending.clear();
        _saveToStorage();
        reapply();
    }

    function getPendingCustomers() {
        return [..._pending.values()];
    }

    // -----------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------

    async function init() {
        if (_initialized) return;
        _initialized = true;
        _loadFromStorage();
        _ensureStyle();

        // Subscribe to live WS events
        if (global.Web2Realtime?.subscribe) {
            global.Web2Realtime.subscribe({
                types: ['pages:new_message'],
                onEvent: (m) => onIncomingMessage(m.payload),
                debounceMs: 0,
            });
            global.Web2Realtime.subscribe({
                types: ['pages:update_conversation'],
                onEvent: (m) => {
                    // Conversation read by shop → clear pending
                    const p = m.payload || {};
                    const psid = p.psid || p.recipient_id || p.from?.id;
                    const fromShop =
                        p.last_sent_by?.id && p.page_id && p.last_sent_by.id === p.page_id;
                    if (psid && fromShop) clearPendingForCustomer(psid);
                },
                debounceMs: 0,
            });
        }

        // Render immediately from localStorage
        reapply();

        // Initial server fetch — replace state (not merge) so stale rows
        // get removed.
        if (global.Web2Realtime?.fetchPendingCustomers) {
            try {
                const r = await global.Web2Realtime.fetchPendingCustomers();
                if (r.ok) setPendingCustomers(r.customers);
            } catch {
                /* network hiccup */
            }
        }

        // Periodic reconcile every 5 min
        if (_reconcileTimer) clearInterval(_reconcileTimer);
        _reconcileTimer = setInterval(async () => {
            try {
                const r = await global.Web2Realtime?.fetchPendingCustomers?.();
                if (r?.ok) setPendingCustomers(r.customers);
            } catch {
                /* ignore */
            }
        }, RECONCILE_INTERVAL_MS);
    }

    global.Web2NewMsgBadge = {
        init,
        reapply,
        setPendingCustomers,
        onIncomingMessage,
        clearPendingForCustomer,
        clearAll,
        getPendingCustomers,
        _internal: { LS_PENDING, LS_REPLIED },
    };
})(window);
