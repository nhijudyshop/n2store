// =====================================================
// NEW MESSAGES NOTIFIER
// Thông báo tin nhắn/bình luận mới khi user load trang
// =====================================================

(function () {
    'use strict';

    const STORAGE_KEY = 'last_realtime_check';
    // Use n2store-realtime server (has WebSocket + Database + pending-customers API)
    const SERVER_URL = 'https://n2store-realtime.onrender.com';
    // Fallback to n2store-fallback if realtime server is down
    const FALLBACK_URL = 'https://n2store-fallback.onrender.com';
    // Cloudflare Worker fallback
    const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

    /**
     * Get last seen timestamp from localStorage
     */
    function getLastSeenTimestamp() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return parseInt(stored, 10);
        }
        // Default: 1 hour ago (first time user)
        return Date.now() - (60 * 60 * 1000);
    }

    /**
     * Save current timestamp to localStorage
     */
    function saveCurrentTimestamp() {
        localStorage.setItem(STORAGE_KEY, Date.now().toString());
    }

    /**
     * Mark messages as seen on server (so they don't appear again)
     */
    async function markMessagesAsSeen(timestamp) {
        try {
            const response = await fetch(`${SERVER_URL}/api/realtime/mark-seen`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ before: timestamp })
            });

            if (response.ok) {
                const result = await response.json();
                console.log(`[NEW-MSG-NOTIFIER] Marked ${result.updated} messages as seen`);
                return result;
            }
        } catch (error) {
            console.warn('[NEW-MSG-NOTIFIER] Failed to mark messages as seen:', error.message);
        }
        return null;
    }

    /**
     * Fetch new messages from server (legacy - based on timestamp)
     */
    async function fetchNewMessages(since) {
        const urls = [
            `${SERVER_URL}/api/realtime/summary?since=${since}`,
            `${WORKER_URL}/api/realtime/summary?since=${since}`
        ];

        for (const url of urls) {
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' },
                    signal: AbortSignal.timeout(10000) // 10s timeout
                });

                if (response.ok) {
                    return await response.json();
                }
            } catch (error) {
                console.warn(`[NEW-MSG-NOTIFIER] Failed to fetch from ${url}:`, error.message);
            }
        }

        return null;
    }

    /**
     * Fetch pending customers từ server (khách chưa được trả lời)
     * Đây là cách mới - persist qua tắt máy/đổi máy
     * Server 24/7 lưu tin nhắn vào database, frontend fetch nhanh
     */
    async function fetchPendingCustomers() {
        const urls = [
            `${SERVER_URL}/api/realtime/pending-customers?limit=1500`,
            `${FALLBACK_URL}/api/realtime/pending-customers?limit=1500`
        ];

        for (const url of urls) {
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' },
                    signal: AbortSignal.timeout(10000)
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.success) {
                        console.log(`[NEW-MSG-NOTIFIER] Fetched from ${url.includes('realtime') ? 'realtime' : 'fallback'} server`);
                        return data.customers || [];
                    }
                }
            } catch (error) {
                console.warn(`[NEW-MSG-NOTIFIER] Failed to fetch from ${url}:`, error.message);
            }
        }

        console.warn('[NEW-MSG-NOTIFIER] All servers failed to fetch pending customers');
        return [];
    }

    /**
     * Đánh dấu đã trả lời khách trên server
     * Gọi cả 2 server để đảm bảo đồng bộ (nếu dùng chung database thì chỉ cần 1)
     */
    async function markRepliedOnServer(psid, pageId) {
        const urls = [
            `${SERVER_URL}/api/realtime/mark-replied`,
            `${FALLBACK_URL}/api/realtime/mark-replied`
        ];

        for (const url of urls) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ psid, pageId })
                });

                if (response.ok) {
                    const data = await response.json();
                    console.log(`[NEW-MSG-NOTIFIER] Marked replied: ${psid} (${data.removed} removed)`);
                    return true;
                }
            } catch (error) {
                console.warn(`[NEW-MSG-NOTIFIER] Failed to mark replied on ${url}:`, error.message);
            }
        }

        return false;
    }

    /**
     * Show notification toast
     */
    function showNotification(summary) {
        if (!summary || summary.total === 0) return;

        const { messages, comments, uniqueCustomers } = summary;

        // Build message
        let text = '';
        if (messages > 0 && comments > 0) {
            text = `${messages} tin nhắn và ${comments} bình luận mới`;
        } else if (messages > 0) {
            text = `${messages} tin nhắn mới`;
        } else if (comments > 0) {
            text = `${comments} bình luận mới`;
        }

        if (uniqueCustomers > 0) {
            text += ` từ ${uniqueCustomers} khách hàng`;
        }

        // Show toast notification
        if (window.notificationManager && window.notificationManager.success) {
            window.notificationManager.success(text, 8000);
        } else {
            // Fallback: Show custom toast if notificationManager not ready
            showFallbackToast(text, summary);
        }

        console.log(`[NEW-MSG-NOTIFIER] ${text}`);
    }

    /**
     * Fallback toast when notificationManager not available
     */
    function showFallbackToast(text, summary) {
        // Create toast element
        const toast = document.createElement('div');
        toast.id = 'new-messages-toast';
        toast.innerHTML = `
            <div style="
                position: fixed;
                top: 20px;
                right: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 16px 24px;
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(102, 126, 234, 0.4);
                z-index: 99999;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                animation: slideIn 0.3s ease-out;
                max-width: 350px;
                cursor: pointer;
            ">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="font-size: 28px;">📬</div>
                    <div>
                        <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px;">
                            Có tin mới!
                        </div>
                        <div style="font-size: 13px; opacity: 0.95;">
                            ${text}
                        </div>
                    </div>
                    <button onclick="this.parentElement.parentElement.parentElement.remove()"
                            style="background: none; border: none; color: white; font-size: 18px; cursor: pointer; opacity: 0.7; margin-left: auto;">
                        ×
                    </button>
                </div>
            </div>
            <style>
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            </style>
        `;

        document.body.appendChild(toast);

        // Auto remove after 8 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.style.animation = 'slideOut 0.3s ease-in forwards';
                toast.innerHTML += `
                    <style>
                        @keyframes slideOut {
                            from { transform: translateX(0); opacity: 1; }
                            to { transform: translateX(100%); opacity: 0; }
                        }
                    </style>
                `;
                setTimeout(() => toast.remove(), 300);
            }
        }, 8000);
    }

    /**
     * Update table cells with "NEW" badge
     */
    function highlightNewMessagesInTable(items) {
        if (!items || items.length === 0) return;

        // Group by psid + pageId for accurate matching
        const psidMap = new Map();
        items.forEach(item => {
            if (item.psid) {
                const key = item.page_id ? `${item.psid}_${item.page_id}` : item.psid;
                if (!psidMap.has(key)) {
                    psidMap.set(key, { messages: 0, comments: 0, psid: item.psid, pageId: item.page_id });
                }
                const entry = psidMap.get(key);
                // Use message_count if available (from pending_customers API)
                const count = item.message_count || 1;
                if (item.type === 'INBOX') {
                    entry.messages += count;
                } else {
                    entry.comments += count;
                }
            }
        });

        // Find rows in table and add badge
        let highlightedCount = 0;
        psidMap.forEach((counts) => {
            const { psid, pageId } = counts;
            // Find rows with matching PSID (and optionally pageId for more precision)
            let rows;
            if (pageId) {
                rows = document.querySelectorAll(`tr[data-psid="${psid}"][data-page-id="${pageId}"]`);
                // Fallback to psid-only if no match with pageId
                if (rows.length === 0) {
                    rows = document.querySelectorAll(`tr[data-psid="${psid}"]`);
                }
            } else {
                rows = document.querySelectorAll(`tr[data-psid="${psid}"]`);
            }
            rows.forEach(row => {
                highlightedCount++;

                // Add badge to messages column
                if (counts.messages > 0) {
                    const msgCell = row.querySelector('td[data-column="messages"]');
                    if (msgCell) {
                        addNewBadge(msgCell, counts.messages);
                    }
                }

                // Add badge to comments column
                if (counts.comments > 0) {
                    const cmtCell = row.querySelector('td[data-column="comments"]');
                    if (cmtCell) {
                        addNewBadge(cmtCell, counts.comments);
                    }
                }

                // Highlight row (permanent until user replies)
                row.classList.add('pending-customer-row');
            });
        });

        console.log(`[NEW-MSG-NOTIFIER] Highlighted ${highlightedCount} rows`);
    }

    /**
     * Add "NEW" badge to cell
     */
    function addNewBadge(cell, count) {
        // Check if badge already exists
        if (cell.querySelector('.new-msg-badge')) return;

        const badge = document.createElement('span');
        badge.className = 'new-msg-badge';
        badge.innerHTML = `<span style="
            background: #ef4444;
            color: white;
            font-size: 10px;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 9999px;
            margin-left: 6px;
            animation: pulse 1s infinite;
        ">${count} MỚI</span>`;

        cell.appendChild(badge);

        // Add pulse animation
        if (!document.getElementById('new-msg-badge-style')) {
            const style = document.createElement('style');
            style.id = 'new-msg-badge-style';
            style.textContent = `
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }
            `;
            document.head.appendChild(style);
        }
    }

    // Cache pending customers để re-apply sau khi table render
    let cachedPendingCustomers = [];

    /**
     * Wait for table rows to exist
     */
    function waitForTableRows(maxWait = 10000) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const check = () => {
                const rows = document.querySelectorAll('tr[data-psid]');
                if (rows.length > 0) {
                    resolve(true);
                } else if (Date.now() - startTime > maxWait) {
                    resolve(false);
                } else {
                    setTimeout(check, 500);
                }
            };
            check();
        });
    }

    /**
     * Re-apply highlights (called after table re-renders)
     */
    function reapplyHighlights() {
        if (cachedPendingCustomers.length > 0) {
            console.log('[NEW-MSG-NOTIFIER] Re-applying highlights for', cachedPendingCustomers.length, 'pending customers');
            highlightNewMessagesInTable(cachedPendingCustomers.map(c => ({
                psid: c.psid,
                page_id: c.page_id,
                type: c.type,
                message_count: c.message_count
            })));
        }
    }

    /**
     * Main function - Check for new messages on page load
     * Sử dụng pending_customers API (persist qua tắt máy/đổi máy)
     */
    async function checkNewMessages() {
        try {
            console.log('[NEW-MSG-NOTIFIER] Checking pending customers from server...');

            // Fetch pending customers từ server (thay vì timestamp-based)
            const pendingCustomers = await fetchPendingCustomers();
            cachedPendingCustomers = pendingCustomers || [];

            if (pendingCustomers && pendingCustomers.length > 0) {
                console.log(`[NEW-MSG-NOTIFIER] Found ${pendingCustomers.length} pending customers`);

                // Count messages vs comments
                const messages = pendingCustomers.filter(c => c.type === 'INBOX').length;
                const comments = pendingCustomers.filter(c => c.type === 'COMMENT').length;

                // Show notification
                showNotification({
                    total: pendingCustomers.length,
                    messages: messages,
                    comments: comments,
                    uniqueCustomers: pendingCustomers.length
                });

                // Wait for table rows to exist before highlighting
                const tableReady = await waitForTableRows();
                if (tableReady) {
                    highlightNewMessagesInTable(pendingCustomers.map(c => ({
                        psid: c.psid,
                        page_id: c.page_id,
                        type: c.type,
                        message_count: c.message_count
                    })));
                } else {
                    console.warn('[NEW-MSG-NOTIFIER] Table rows not found, will retry on render');
                }
            } else {
                console.log('[NEW-MSG-NOTIFIER] No pending customers');
            }

            // Save current timestamp for reference
            saveCurrentTimestamp();

        } catch (error) {
            console.error('[NEW-MSG-NOTIFIER] Error checking new messages:', error);
        }
    }

    /**
     * Initialize on page load
     */
    function init() {
        // Wait for page to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                // Delay check by 2 seconds to let other things load first
                setTimeout(checkNewMessages, 2000);
            });
        } else {
            setTimeout(checkNewMessages, 2000);
        }

        // Also check when user comes back to tab (visibility change)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                // Check if it's been more than 1 minute since last check
                const lastCheck = getLastSeenTimestamp();
                if (Date.now() - lastCheck > 60000) {
                    checkNewMessages();
                }
            }
        });
    }

    // Export for external use
    window.newMessagesNotifier = {
        check: checkNewMessages,
        getLastSeen: getLastSeenTimestamp,
        saveTimestamp: saveCurrentTimestamp,
        fetchPending: fetchPendingCustomers,
        markReplied: markRepliedOnServer,
        highlight: highlightNewMessagesInTable,
        reapply: reapplyHighlights,
        getCached: () => cachedPendingCustomers
    };

    // Auto-initialize
    init();

    console.log('[NEW-MSG-NOTIFIER] Module loaded');

})();
