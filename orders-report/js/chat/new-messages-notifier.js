// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/* =====================================================
   NEW MESSAGES NOTIFIER - Rebuilt v2
   Applies unread badges and row highlights to order table
   localStorage persistence + server merge + realtime updates
   ===================================================== */

(function() {
    'use strict';

    const LS_KEY = 'n2s_pending_customers';

    // Cached pending customers data (persisted to localStorage)
    let _pendingCustomers = [];
    let _isApplying = false;
    let _reapplyTimer = null;

    // =====================================================
    // LOCALSTORAGE PERSISTENCE
    // =====================================================

    function _saveToLocalStorage() {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(_pendingCustomers));
        } catch(e) {}
    }

    function _loadFromLocalStorage() {
        try {
            const saved = localStorage.getItem(LS_KEY);
            if (saved) return JSON.parse(saved);
        } catch(e) {}
        return [];
    }

    // Load immediately from localStorage (before server fetch completes)
    _pendingCustomers = _loadFromLocalStorage();

    // Schedule initial reapply after DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(reapply, 300));
    } else {
        setTimeout(reapply, 300);
    }

    // =====================================================
    // REAPPLY - Main method called by tab1-table.js
    // =====================================================

    /**
     * Re-apply unread message badges and row highlights to table rows.
     * Called after table render, row updates, virtual scroll, load more.
     */
    function reapply() {
        if (_isApplying) return;
        _isApplying = true;

        try {
            _applyBadgesToRows();
        } finally {
            _isApplying = false;
        }
    }

    // =====================================================
    // BADGE APPLICATION
    // =====================================================

    function _applyBadgesToRows() {
        // Build lookup map: psid → pending data
        const pendingMap = new Map();
        _pendingCustomers.forEach(pc => {
            const key = String(pc.psid || pc.from_psid || pc.fbId || '');
            if (key) {
                const existing = pendingMap.get(key);
                if (existing) {
                    existing.inboxCount += (pc.inboxCount || pc.unread_count || 0);
                    existing.commentCount += (pc.commentCount || 0);
                } else {
                    pendingMap.set(key, {
                        psid: key,
                        pageId: String(pc.pageId || pc.page_id || ''),
                        inboxCount: pc.inboxCount || pc.unread_count || 0,
                        commentCount: pc.commentCount || 0,
                        snippet: pc.snippet || pc.lastMessage || '',
                        timestamp: pc.timestamp || pc.updated_at || null,
                    });
                }
            }
        });

        // Find all table rows with psid
        const rows = document.querySelectorAll('tr[data-psid], tr[data-fb-id]');
        rows.forEach(row => {
            const psid = row.dataset.psid || row.dataset.fbId || '';
            if (!psid) return;

            const pending = pendingMap.get(String(psid));
            if (!pending) {
                // Remove highlights and badges if no longer pending
                row.classList.remove('pending-customer-row');
                row.querySelectorAll('.new-msg-badge, .new-cmt-badge').forEach(el => el.remove());
                return;
            }

            // Add row highlight
            row.classList.add('pending-customer-row');

            // Update messages column badge (create or update existing)
            _upsertBadge(row, 'td[data-column="messages"]', 'new-msg-badge', pending.inboxCount);

            // Update comments column badge (create or update existing)
            _upsertBadge(row, 'td[data-column="comments"]', 'new-cmt-badge', pending.commentCount);
        });
    }

    /**
     * Create or update a badge in a table cell.
     * If count > 0: ensure badge exists with correct text.
     * If count <= 0: remove badge if exists.
     */
    function _upsertBadge(row, cellSelector, badgeClass, count) {
        const cell = row.querySelector(cellSelector);
        if (!cell) return;

        let badge = cell.querySelector(`.${badgeClass}`);

        if (count > 0) {
            if (badge) {
                // Update existing badge text
                badge.textContent = `${count} MỚI`;
            } else {
                // Create new badge
                badge = document.createElement('span');
                badge.className = badgeClass;
                badge.textContent = `${count} MỚI`;
                cell.prepend(badge);
            }
        } else if (badge) {
            badge.remove();
        }
    }

    // =====================================================
    // UPDATE FROM REALTIME
    // =====================================================

    /**
     * Called when new realtime events arrive.
     * Updates _pendingCustomers, saves to localStorage, and re-applies badges.
     */
    function onNewConversationEvent(event) {
        if (!event) return;

        const psid = String(event.from_psid || event.psid || event.from?.id || '');
        if (!psid) return;

        // Find or create entry
        let existing = _pendingCustomers.find(pc =>
            String(pc.psid || pc.from_psid || '') === psid
        );

        if (!existing) {
            existing = { psid, pageId: event.page_id || event.pageId || '', inboxCount: 0, commentCount: 0 };
            _pendingCustomers.push(existing);
        }

        const type = event.type || event.conversation_type || 'INBOX';
        if (type === 'COMMENT') {
            existing.commentCount = (existing.commentCount || 0) + 1;
        } else {
            existing.inboxCount = (existing.inboxCount || 0) + 1;
        }

        existing.snippet = event.snippet || event.message || existing.snippet;
        existing.timestamp = Date.now();

        // Persist to localStorage
        _saveToLocalStorage();

        // Re-apply (debounced)
        clearTimeout(_reapplyTimer);
        _reapplyTimer = setTimeout(reapply, 200);
    }

    /**
     * Set pending customers data from external source (e.g. server API fetch).
     * MERGES with existing data instead of replacing, so realtime + localStorage
     * data is not lost if server has incomplete data.
     */
    function setPendingCustomers(customers) {
        if (!customers || !customers.length) {
            // Server returned empty — keep existing data (from localStorage/realtime)
            reapply();
            return;
        }

        // Merge: existing data + server data
        const merged = new Map();

        // Load existing first (from localStorage/realtime)
        _pendingCustomers.forEach(pc => {
            const key = String(pc.psid || '');
            if (key) merged.set(key, { ...pc });
        });

        // Merge server data (take higher count — server accumulates while browser offline)
        customers.forEach(pc => {
            const key = String(pc.psid || '');
            if (!key) return;
            const existing = merged.get(key);
            if (existing) {
                existing.inboxCount = Math.max(existing.inboxCount || 0, pc.inboxCount || 0);
                existing.commentCount = Math.max(existing.commentCount || 0, pc.commentCount || 0);
                if ((pc.timestamp || 0) > (existing.timestamp || 0)) {
                    existing.snippet = pc.snippet || existing.snippet;
                    existing.timestamp = pc.timestamp;
                }
                existing.pageId = pc.pageId || existing.pageId;
            } else {
                merged.set(key, { ...pc });
            }
        });

        _pendingCustomers = [...merged.values()];
        _saveToLocalStorage();
        reapply();
    }

    /**
     * Clear pending status for a specific customer (e.g. after sending reply)
     */
    function clearPendingForCustomer(psid) {
        if (!psid) return;
        _pendingCustomers = _pendingCustomers.filter(pc =>
            String(pc.psid || pc.from_psid || '') !== String(psid)
        );
        _saveToLocalStorage();
        reapply();
    }

    /**
     * Clear all pending
     */
    function clearAll() {
        _pendingCustomers = [];
        _saveToLocalStorage();
        // Remove all highlights
        document.querySelectorAll('.pending-customer-row').forEach(row => {
            row.classList.remove('pending-customer-row');
        });
        document.querySelectorAll('.new-msg-badge, .new-cmt-badge').forEach(el => el.remove());
    }

    // =====================================================
    // REGISTER REALTIME HANDLER
    // =====================================================

    function _initRealtimeHandler() {
        if (!window.realtimeManager) return;

        window.realtimeManager.on('pages:new_message', (payload) => {
            // Pancake raw format: { message: { from: { id } }, page_id, conversation_id }
            const msg = payload?.message || payload;
            const normalized = {
                psid: String(msg?.from?.id || payload?.from_psid || payload?.from?.id || ''),
                pageId: String(payload?.page_id || msg?.page_id || ''),
                snippet: msg?.message || msg?.original_message || '',
                type: 'INBOX',
                inboxCount: 1,
            };
            if (normalized.psid) onNewConversationEvent(normalized);
        });

        window.realtimeManager.on('pages:update_conversation', (payload) => {
            // Pancake raw format: { conversation: { from_psid, page_id, unread_count, type, snippet } }
            const conv = payload?.conversation || payload;
            const unread = conv?.unread_count || payload?.unread_count || 0;
            if (unread > 0) {
                const normalized = {
                    psid: String(conv?.from_psid || conv?.from?.id || conv?.customers?.[0]?.fb_id || payload?.from_psid || ''),
                    pageId: String(conv?.page_id || payload?.page_id || ''),
                    snippet: conv?.snippet || '',
                    type: conv?.type || 'INBOX',
                    unread_count: unread,
                };
                if (normalized.psid) onNewConversationEvent(normalized);
            }
        });
    }

    // Init when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _initRealtimeHandler);
    } else {
        setTimeout(_initRealtimeHandler, 100);
    }

    // =====================================================
    // CSS for badges and row highlight
    // =====================================================

    const style = document.createElement('style');
    style.textContent = `
        .pending-customer-row {
            background: linear-gradient(135deg, #fef2f2 0%, #fff1f2 100%) !important;
        }
        .pending-customer-row:hover {
            background: linear-gradient(135deg, #fee2e2 0%, #fecdd3 100%) !important;
        }
        .new-msg-badge, .new-cmt-badge {
            display: inline-flex;
            align-items: center;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 700;
            margin-right: 4px;
            animation: badgePulse 2s infinite;
        }
        .new-msg-badge {
            background: #ef4444;
            color: #fff;
        }
        .new-cmt-badge {
            background: #f59e0b;
            color: #fff;
        }
        @keyframes badgePulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }
    `;
    document.head.appendChild(style);

    // =====================================================
    // EXPOSE GLOBALLY
    // =====================================================

    window.newMessagesNotifier = {
        reapply,
        onNewConversationEvent,
        setPendingCustomers,
        clearPendingForCustomer,
        clearAll,
        getPendingCustomers: () => [..._pendingCustomers],
    };

})();
