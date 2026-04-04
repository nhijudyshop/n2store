// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/* =====================================================
   NEW MESSAGES NOTIFIER - Rebuilt
   Applies unread badges and row highlights to order table
   ===================================================== */

(function() {
    'use strict';

    // Cached pending customers data
    let _pendingCustomers = [];
    let _isApplying = false;

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

            // Update messages column badge
            if (pending.inboxCount > 0) {
                const msgCell = row.querySelector('td[data-column="messages"]');
                if (msgCell && !msgCell.querySelector('.new-msg-badge')) {
                    const badge = document.createElement('span');
                    badge.className = 'new-msg-badge';
                    badge.textContent = `${pending.inboxCount} MỚI`;
                    msgCell.prepend(badge);
                }
            }

            // Update comments column badge
            if (pending.commentCount > 0) {
                const cmtCell = row.querySelector('td[data-column="comments"]');
                if (cmtCell && !cmtCell.querySelector('.new-cmt-badge')) {
                    const badge = document.createElement('span');
                    badge.className = 'new-cmt-badge';
                    badge.textContent = `${pending.commentCount} MỚI`;
                    cmtCell.prepend(badge);
                }
            }
        });
    }

    // =====================================================
    // UPDATE FROM REALTIME
    // =====================================================

    /**
     * Called when new realtime events arrive.
     * Updates _pendingCustomers and re-applies badges.
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

        // Re-apply (debounced)
        clearTimeout(_reapplyTimer);
        _reapplyTimer = setTimeout(reapply, 200);
    }

    let _reapplyTimer = null;

    /**
     * Set pending customers data from external source (e.g. API fetch)
     */
    function setPendingCustomers(customers) {
        _pendingCustomers = customers || [];
        reapply();
    }

    /**
     * Clear pending status for a specific customer (e.g. after reading messages)
     */
    function clearPendingForCustomer(psid) {
        if (!psid) return;
        _pendingCustomers = _pendingCustomers.filter(pc =>
            String(pc.psid || pc.from_psid || '') !== String(psid)
        );
        reapply();
    }

    /**
     * Clear all pending
     */
    function clearAll() {
        _pendingCustomers = [];
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
