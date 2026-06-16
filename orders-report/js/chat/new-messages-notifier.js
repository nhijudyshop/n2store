// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/* =====================================================
   NEW MESSAGES NOTIFIER - Rebuilt v2
   Applies unread badges and row highlights to order table
   localStorage persistence + server merge + realtime updates
   ===================================================== */

(function () {
    'use strict';

    // Module guard — chống IIFE chạy 2 lần
    if (window.__newMessagesNotifierLoaded) {
        return;
    }
    window.__newMessagesNotifierLoaded = true;

    const LS_KEY = 'n2s_pending_customers';
    const LS_REPLIED_KEY = 'n2s_recently_replied_v1';
    const REPLIED_TTL_MS = 24 * 60 * 60 * 1000; // 24h — đủ dài để chặn server stale data

    // Cached pending customers data (persisted to localStorage)
    let _pendingCustomers = [];
    // psid → repliedAt timestamp (ms). Mọi event/server data có message_time <=
    // repliedAt sẽ bị bỏ qua → ngăn badge "tin mới" quay lại sau khi reply.
    let _recentlyRepliedAt = {};
    let _isApplying = false;
    let _reapplyTimer = null;

    // =====================================================
    // LOCALSTORAGE PERSISTENCE
    // =====================================================

    function _saveToLocalStorage() {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(_pendingCustomers));
        } catch (e) {}
    }

    function _loadFromLocalStorage() {
        try {
            const saved = localStorage.getItem(LS_KEY);
            if (saved) return JSON.parse(saved);
        } catch (e) {}
        return [];
    }

    function _saveRepliedMap() {
        try {
            localStorage.setItem(LS_REPLIED_KEY, JSON.stringify(_recentlyRepliedAt));
        } catch (e) {}
    }

    function _loadRepliedMap() {
        try {
            const saved = localStorage.getItem(LS_REPLIED_KEY);
            const obj = saved ? JSON.parse(saved) : {};
            // Cleanup expired (> 24h)
            const cutoff = Date.now() - REPLIED_TTL_MS;
            const cleaned = {};
            for (const [psid, ts] of Object.entries(obj)) {
                if (typeof ts === 'number' && ts > cutoff) cleaned[psid] = ts;
            }
            return cleaned;
        } catch (e) {
            return {};
        }
    }

    // Buffer (ms) hấp thụ lệch giờ giữa timestamp Pancake (server) và Date.now()
    // local lúc set _recentlyRepliedAt. Chỉ suppress tin RÕ RÀNG cũ hơn mốc reply.
    const REPLIED_SKEW_MS = 2000;

    function _wasRecentlyReplied(psid, eventTimeMs) {
        const repliedAt = _recentlyRepliedAt[String(psid)];
        if (!repliedAt) return false;
        // Event KHÔNG kèm timestamp → coi là tin MỚI (KHÔNG suppress). Trước đây
        // fallback Date.now() khiến tin mới tới ngay sau reply (cùng millisecond)
        // bị nuốt suốt REPLIED_TTL_MS (24h). Thà hiện thừa badge còn hơn mất tin khách.
        if (typeof eventTimeMs !== 'number' || !eventTimeMs) return false;
        // Chỉ bỏ qua khi event cũ hơn mốc reply (trừ skew) = echo cũ thật sự.
        return eventTimeMs < repliedAt - REPLIED_SKEW_MS;
    }

    // Load immediately from localStorage (before server fetch completes)
    _pendingCustomers = _loadFromLocalStorage();
    _recentlyRepliedAt = _loadRepliedMap();
    console.log(`[NOTIFIER] Init: loaded ${_pendingCustomers.length} from localStorage`);

    // Schedule initial reapply after DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(reapply, 300));
    } else {
        setTimeout(reapply, 300);
    }

    // Safety net: reapply again after ALL resources loaded (images, etc.)
    // This ensures badges appear even if table renders late
    window.addEventListener('load', () => {
        setTimeout(reapply, 500);
    });

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

        // Báo cho consumer ngoài (vd thanh "Khách chưa trả lời") rằng danh sách
        // pending vừa thay đổi / được áp lại. Consumer tự đọc getPendingCustomers().
        try {
            window.dispatchEvent(new CustomEvent('n2s:pendingCustomersChanged'));
        } catch (e) {}
    }

    // =====================================================
    // BADGE APPLICATION
    // =====================================================

    /**
     * Chuẩn hoá SĐT VN để match 2 chiều: order.Telephone (TPOS) ↔ Pancake
     * recent_phone_numbers (lưu ở pending_customers.phone). Bỏ ký tự không phải
     * số; 84xxxxxxxxx → 0xxxxxxxxx. Trả '' nếu không giống SĐT (loại nhiễu).
     */
    function _normPhone(raw) {
        if (!raw) return '';
        let d = String(raw).replace(/\D/g, '');
        if (!d) return '';
        if (d.startsWith('84') && d.length >= 10) d = '0' + d.slice(2);
        if (d.length < 8 || d.length > 12) return '';
        return d;
    }

    function _applyBadgesToRows() {
        // Build 2 lookup maps: PSID và SĐT chuẩn hoá → pending.
        // Match ưu tiên PSID; fallback PHONE cho ca PSID TPOS lệch PSID Pancake
        // (đơn comment/livestream, khác page). Phone là khoá ổn định nhất — xem
        // docs/pancake §14 priority global_id → phone → fb_id.
        const byPsid = new Map();
        const byPhone = new Map();
        _pendingCustomers.forEach((pc) => {
            const key = String(pc.psid || pc.from_psid || pc.fbId || '');
            const phoneKey = _normPhone(pc.phone || pc.phone_number);
            const count = pc.inboxCount || pc.unread_count || 0;
            if (key) {
                const ex = byPsid.get(key);
                if (ex) ex.inboxCount += count;
                else
                    byPsid.set(key, {
                        psid: key,
                        pageId: String(pc.pageId || pc.page_id || ''),
                        inboxCount: count,
                        snippet: pc.snippet || pc.lastMessage || '',
                        timestamp: pc.timestamp || pc.updated_at || null,
                    });
            }
            if (phoneKey) {
                const ex = byPhone.get(phoneKey);
                if (ex) ex.inboxCount += count;
                else byPhone.set(phoneKey, { phone: phoneKey, inboxCount: count });
            }
        });

        // Find all table rows with psid hoặc phone
        const rows = document.querySelectorAll('tr[data-psid], tr[data-fb-id]');
        let matched = 0;
        rows.forEach((row) => {
            const psid = row.dataset.psid || row.dataset.fbId || '';
            const phone = _normPhone(row.dataset.phone);
            if (!psid && !phone) return;

            // Ưu tiên PSID; nếu PSID không khớp → fallback theo SĐT.
            let pending = (psid && byPsid.get(String(psid))) || null;
            if (!pending && phone) pending = byPhone.get(phone) || null;

            const shouldHaveClass = !!pending;
            const hasClass = row.classList.contains('pending-customer-row');

            // CHỈ toggle class khi state thực sự đổi — tránh 51 rows × invalidate style
            // mỗi lần có tin mới (gây "nháy bảng" do browser repaint composite full table).
            if (shouldHaveClass !== hasClass) {
                if (shouldHaveClass) {
                    row.classList.add('pending-customer-row');
                } else {
                    row.classList.remove('pending-customer-row');
                }
            }

            if (!pending) {
                // Remove badges only if exists (skip pure row scan when no badge)
                const existing = row.querySelector('.new-msg-badge');
                if (existing) existing.remove();
                return;
            }

            matched++;
            // Update messages column badge (create or update existing — _upsertBadge
            // already idempotent — chỉ thay textContent nếu count đổi).
            _upsertBadge(row, 'td[data-column="messages"]', 'new-msg-badge', pending.inboxCount);
        });

        console.log(
            `[NOTIFIER] reapply: ${byPsid.size} psid / ${byPhone.size} phone, ${rows.length} rows, ${matched} matched`
        );
    }

    /**
     * Create or update a badge in a table cell.
     * If count > 0: ensure badge exists with correct text.
     * If count <= 0: remove badge if exists.
     */
    function _upsertBadge(row, cellSelector, badgeClass, count) {
        const cell = row.querySelector(cellSelector);
        if (!cell) return;
        // Guard: nếu row/cell đã bị tách khỏi DOM (surgical row-replace chạy GIỮA
        // lúc _applyBadgesToRows đang lặp) thì prepend sẽ rơi vào cây DOM mồ côi
        // → badge vô hình. Bỏ qua; lần reapply kế sẽ tô lại trên row mới.
        if (!cell.isConnected) return;

        let badge = cell.querySelector(`.${badgeClass}`);

        if (count > 0) {
            const newText = `${count} MỚI`;
            if (badge) {
                // Update existing badge text — chỉ ghi nếu thật sự đổi
                // (tránh layout invalidate cho hàng có badge giống count cũ).
                if (badge.textContent !== newText) badge.textContent = newText;
            } else {
                // Create new badge
                badge = document.createElement('span');
                badge.className = badgeClass;
                badge.textContent = newText;
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

        const type = event.type || event.conversation_type || 'INBOX';
        if (type === 'COMMENT') return; // Skip comments — no badge tracking for comment column

        // Suppress stale broadcast: nếu user vừa reply thì các event có message_time
        // <= repliedAt là echo cũ (broadcast lan từ chính reply hoặc Pancake chậm clear
        // unread_count). Date.now() fallback chỉ áp khi event không kèm timestamp.
        const eventTimeMs =
            (typeof event.eventTimeMs === 'number' && event.eventTimeMs) ||
            (event.timestamp ? new Date(event.timestamp).getTime() : null) ||
            (event.updated_at ? new Date(event.updated_at).getTime() : null);
        if (_wasRecentlyReplied(psid, eventTimeMs)) {
            return;
        }

        // Find or create entry
        let existing = _pendingCustomers.find(
            (pc) => String(pc.psid || pc.from_psid || '') === psid
        );

        if (!existing) {
            existing = {
                psid,
                pageId: event.page_id || event.pageId || '',
                customerName: event.customerName || event.customer_name || event.from?.name || '',
                phone: event.phone || event.phone_number || '',
                inboxCount: 0,
            };
            _pendingCustomers.push(existing);
        }

        // Pancake's unread_count là authoritative source. Khi event có unread_count
        // hợp lệ → SET inboxCount đúng giá trị Pancake (không tích lũy local).
        // Trước đây luôn +=1 → tích lũy sai khi shop trả lời (Nv.My snippet với
        // count 285, trong khi Pancake unread=0 hoặc nhỏ).
        // Fallback +=1 chỉ áp khi event KHÔNG có unread_count (vd pages:new_message
        // single message event); pages:update_conversation luôn có unread_count.
        const eventUnread =
            typeof event.unread_count === 'number'
                ? event.unread_count
                : typeof event.unreadCount === 'number'
                  ? event.unreadCount
                  : null;
        if (eventUnread !== null && eventUnread >= 0) {
            existing.inboxCount = eventUnread;
        } else {
            existing.inboxCount = (existing.inboxCount || 0) + 1;
        }

        // Update customerName nếu event có (server WS push có from.name)
        const evName = event.customerName || event.customer_name || event.from?.name;
        if (evName && !existing.customerName) existing.customerName = evName;

        // Phone (recent_phone_numbers Pancake) — fill nếu chưa có (match badge theo SĐT)
        const evPhone = event.phone || event.phone_number;
        if (evPhone && !existing.phone) existing.phone = evPhone;

        existing.snippet = event.snippet || event.message || existing.snippet;
        existing.timestamp = eventTimeMs || Date.now();

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
        // SERVER IS THE SINGLE SOURCE OF TRUTH.
        //
        // pending_customers table on Render Postgres is canonical:
        // - WS handlers upsert/delete per pages:* events
        // - Cron mỗi 5 phút reconcile against Pancake's unread_count
        // - mark-replied API deletes when user opens chat
        //
        // Client cache (_pendingCustomers + localStorage) only exists
        // for instant render before fetch completes. Whenever we fetch
        // fresh from server, REPLACE local — don't merge or take max,
        // since both lead to stale-high counts:
        //   • Math.max keeps local count even when server is correct lower
        //     (eg cron reconciled count=2 but local still has 8 from old bumps)
        //   • Keeping local-only entries (not in server) preserves rows
        //     that server already deleted (shop replied → server DELETED → local kept)
        // Owner repro 2026-05-12: Mật Ngọt showed "4 MỚI" even after server
        // reconcile DELETEd the row, because client merged old local in.
        //
        // The only thing we PRESERVE locally: entries that have been
        // marked-replied recently (within REPLIED_TTL_MS = 24h) — used to
        // suppress stale WS broadcasts that may re-add a just-replied
        // customer. That filter remains via _wasRecentlyReplied.
        //
        // Trade-off accepted: if a realtime event arrives between fetch
        // start and finish, it'll be briefly overwritten by stale fetch
        // data. The next realtime event or 5-min reconcile corrects it.

        const next = [];
        const arr = Array.isArray(customers) ? customers : [];
        for (const pc of arr) {
            const key = String(pc.psid || '');
            if (!key) continue;
            // Skip entries server hasn't cleaned but we already marked replied.
            if (_wasRecentlyReplied(key, pc.timestamp)) continue;
            next.push({
                psid: key,
                pageId: String(pc.pageId || pc.page_id || ''),
                customerName: pc.customerName || pc.customer_name || '',
                phone: pc.phone || pc.phone_number || '',
                inboxCount: pc.inboxCount || pc.unread_count || pc.message_count || 0,
                snippet: pc.snippet || pc.lastMessage || '',
                timestamp: pc.timestamp || pc.updated_at || null,
            });
        }
        _pendingCustomers = next;
        _saveToLocalStorage();
        reapply();
    }

    /**
     * Clear pending status for a specific customer (e.g. after sending reply)
     */
    function clearPendingForCustomer(psid) {
        if (!psid) return;
        _pendingCustomers = _pendingCustomers.filter(
            (pc) => String(pc.psid || pc.from_psid || '') !== String(psid)
        );
        // Đánh dấu thời điểm reply để chặn server stale data + WS echo broadcast
        // re-add cùng psid trong vòng 24h tới (xem _wasRecentlyReplied).
        _recentlyRepliedAt[String(psid)] = Date.now();
        _saveToLocalStorage();
        _saveRepliedMap();
        reapply();
    }

    /**
     * Gỡ 1 entry pending NHƯNG KHÔNG set cờ suppress 24h.
     * Dùng cho dọn dẹp theo state Pancake (reconcile / WS báo shop đã đọc ở máy
     * khác). KHÔNG được poison _recentlyRepliedAt — nếu không, tin mới của khách
     * NGAY SAU đó sẽ bị _wasRecentlyReplied nuốt (bug reconcile-premature-clear:
     * reconcile xoá badge user chưa thấy + chặn tin mới). Cờ suppress CHỈ dành
     * cho clearPendingForCustomer (chính user reply → chặn echo của tin mình gửi).
     */
    function _removePending(psid) {
        if (!psid) return;
        const key = String(psid);
        const before = _pendingCustomers.length;
        _pendingCustomers = _pendingCustomers.filter(
            (pc) => String(pc.psid || pc.from_psid || '') !== key
        );
        if (_pendingCustomers.length !== before) {
            _saveToLocalStorage();
            reapply();
        }
    }

    /**
     * Clear all pending
     */
    function clearAll() {
        _pendingCustomers = [];
        _saveToLocalStorage();
        // Remove all highlights
        document.querySelectorAll('.pending-customer-row').forEach((row) => {
            row.classList.remove('pending-customer-row');
        });
        document.querySelectorAll('.new-msg-badge').forEach((el) => el.remove());
    }

    // =====================================================
    // REGISTER REALTIME HANDLER
    // =====================================================

    function _initRealtimeHandler() {
        if (!window.realtimeManager) return;

        window.realtimeManager.on('pages:new_message', (payload) => {
            // Pancake raw format: { message: { from: { id, name } }, page_id, conversation_id }
            const msg = payload?.message || payload;
            const ts = msg?.inserted_at || msg?.created_at || payload?.inserted_at;
            const normalized = {
                psid: String(msg?.from?.id || payload?.from_psid || payload?.from?.id || ''),
                pageId: String(payload?.page_id || msg?.page_id || ''),
                customerName: msg?.from?.name || payload?.from?.name || '',
                snippet: msg?.message || msg?.original_message || '',
                type: 'INBOX',
                inboxCount: 1,
                eventTimeMs: ts ? new Date(ts).getTime() : Date.now(),
            };
            if (normalized.psid) onNewConversationEvent(normalized);
        });

        window.realtimeManager.on('pages:update_conversation', (payload) => {
            // Pancake raw format: { conversation: { from_psid, page_id, unread_count, type, snippet } }
            const conv = payload?.conversation || payload;
            const unread = conv?.unread_count || payload?.unread_count || 0;
            const snippet = conv?.snippet || '';
            const convType = conv?.type || 'INBOX';
            const fromId = String(
                conv?.from_psid ||
                    conv?.from?.id ||
                    conv?.customers?.[0]?.fb_id ||
                    payload?.from_psid ||
                    ''
            );
            const pageId = String(conv?.page_id || payload?.page_id || '');
            const ts = conv?.updated_at || conv?.last_sent_at || payload?.updated_at;

            // Shop là người gửi cuối → conversation đã được shop xử lý/reply.
            // Pancake không phải lúc nào cũng auto-clear unread_count khi shop reply
            // qua direct API → ta tự detect và force clear.
            // User báo bug: snippet "...Nv.My" (Nv signature = shop reply) nhưng
            // count vẫn 285. Detection dùng last_sent_by.id === pageId.
            const lastSentById = String(
                conv?.last_sent_by?.id ||
                    conv?.last_message?.from?.id ||
                    payload?.last_sent_by?.id ||
                    ''
            );
            const shopSentLast = !!lastSentById && lastSentById === pageId;

            // Reactions: unread_count=0, seen=true, but snippet starts with [emoji Name]
            const isReaction =
                unread <= 0 && /^\[.{1,2}\s/.test(snippet) && fromId && fromId !== pageId;

            // Force unread=0 khi shop sent last (override Pancake's value).
            const effectiveUnread = shopSentLast ? 0 : unread;

            if (effectiveUnread > 0 || (isReaction && !shopSentLast)) {
                const customerName =
                    conv?.from?.name || conv?.customers?.[0]?.name || payload?.from?.name || '';
                const normalized = {
                    psid: fromId,
                    pageId: pageId,
                    customerName,
                    snippet: snippet,
                    type: convType,
                    unread_count: effectiveUnread || 1,
                    eventTimeMs: ts ? new Date(ts).getTime() : Date.now(),
                };
                if (normalized.psid) onNewConversationEvent(normalized);
                return;
            }

            // unread = 0 (hoặc shop-sent-last) cho INBOX = shop staff đọc/reply.
            // Clear local badge → multi-user sync. Skip COMMENT events.
            if (convType === 'INBOX' && fromId && fromId !== pageId) {
                if (
                    _pendingCustomers.some((pc) => String(pc.psid || pc.from_psid || '') === fromId)
                ) {
                    // Shop đọc/reply ở máy khác → gỡ badge KHÔNG set cờ suppress
                    // (để tin mới sau đó của khách vẫn hiện). Cờ suppress chỉ set
                    // khi CHÍNH user ở tab này reply (clearPendingForCustomer).
                    _removePending(fromId);
                }
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
    // BULK RECONCILE STALE PENDING vs LIVE PANCAKE STATE
    // =====================================================

    /**
     * Reconcile local pending_customers with Pancake's authoritative state.
     *
     * Stale entries appear when the shop replies but our pages:update_conversation
     * handler missed the event (offline, page refresh during the event window,
     * server merge restored an old entry, etc.). Pancake's conv `last_sent_by.id`
     * + `unread_count` is the source of truth.
     *
     * Strategy: for each page that has ≥1 pending entry, fetch that page's
     * recent conversation list ONCE (`fetchConversationsForPage` is cached),
     * then for every pending psid that appears in the list, check if shop
     * sent last or unread_count=0 → clear it. One API call per page, not
     * per customer (489 entries × per-customer would be untenable).
     *
     * Customers absent from the page's recent list are left alone — they
     * may have legitimately old unread state that's still tracked.
     */
    let _lastReconcileAt = 0;
    async function reconcilePendingWithPancake() {
        // Tab ẩn → KHÔNG reconcile: tránh xoá badge user CHƯA TỪNG thấy ở background
        // (badge bị dọn rồi khi user quay lại đã mất). Sẽ chạy lại khi tab visible.
        if (typeof document !== 'undefined' && document.hidden) return;
        const RECONCILE_COOLDOWN_MS = 60_000; // skip if ran in last 60s
        if (Date.now() - _lastReconcileAt < RECONCILE_COOLDOWN_MS) return;
        _lastReconcileAt = Date.now();

        const pdm = window.pancakeDataManager;
        if (!pdm || _pendingCustomers.length === 0) return;

        // Group pending by pageId
        const byPage = new Map();
        for (const pc of _pendingCustomers) {
            const pid = String(pc.pageId || pc.page_id || '');
            const psid = String(pc.psid || pc.from_psid || '');
            if (!pid || !psid) continue;
            if (!byPage.has(pid)) byPage.set(pid, new Set());
            byPage.get(pid).add(psid);
        }
        if (byPage.size === 0) return;

        let cleared = 0;
        for (const [pageId, psidSet] of byPage) {
            try {
                const result = await pdm.fetchConversationsForPage(pageId, {});
                const convs = result?.conversations || [];
                if (convs.length === 0) continue;
                // Build psid → conv lookup (page-scoped fb_id = INBOX from_psid)
                const convByPsid = new Map();
                for (const c of convs) {
                    const psid = String(c.from_psid || c.from?.id || '');
                    if (psid) convByPsid.set(psid, c);
                }
                for (const psid of psidSet) {
                    const conv = convByPsid.get(psid);
                    if (!conv) continue; // not in recent list — leave alone
                    const lastSenderId = String(
                        conv.last_sent_by?.id || conv.last_message?.from?.id || ''
                    );
                    const shopSentLast = !!lastSenderId && lastSenderId === String(pageId);
                    const unread = typeof conv.unread_count === 'number' ? conv.unread_count : null;
                    if (shopSentLast || unread === 0) {
                        // Dọn entry stale theo Pancake — KHÔNG set cờ suppress 24h
                        // (reconcile chạy nền, không phải user reply). Tin mới sau
                        // đó của khách vẫn được phép hiện badge.
                        _removePending(psid);
                        cleared++;
                    }
                }
            } catch (_e) {
                /* one page failure shouldn't block the rest */
            }
        }
        if (cleared > 0) {
            console.log(`[NOTIFIER] reconcile: cleared ${cleared} stale pending entries`);
        }
    }

    // =====================================================
    // DISCOVER unread từ Pancake (vào trang / chọn / đổi chiến dịch)
    // =====================================================
    // Mirror "list unread" của Pancake vào badge — bù cho WS-only (WS KHÔNG replay
    // event đã miss khi không có client/restart/token gap → mở lại không thấy tin
    // mới). Fetch TRỰC TIẾP Pancake từ browser (pdm.fetchConversationsForPage, đã
    // cache + unread_first), KHÔNG cần cron/poller server. Cache = _pendingCustomers
    // (localStorage). Clear theo khách qua clearPendingForCustomer khi shop reply.
    let _lastDiscoverAt = 0;
    async function discoverUnreadFromPancake(opts) {
        const force = opts && opts.force;
        const COOLDOWN_MS = 30_000; // gom các trigger gần nhau (trừ khi force)
        if (!force && Date.now() - _lastDiscoverAt < COOLDOWN_MS) return;
        const pdm = window.pancakeDataManager;
        if (!pdm || typeof pdm.fetchConversationsForPage !== 'function') return;
        const pages = (pdm.pages || []).map((p) => String(p.id || p.page_id || '')).filter(Boolean);
        if (pages.length === 0) return;
        _lastDiscoverAt = Date.now();

        let added = 0;
        for (const pageId of pages) {
            try {
                const result = await pdm.fetchConversationsForPage(pageId, {});
                const convs = result?.conversations || [];
                for (const c of convs) {
                    const unread = typeof c.unread_count === 'number' ? c.unread_count : 0;
                    if (unread <= 0) continue; // chỉ chưa đọc
                    if ((c.type || 'INBOX') !== 'INBOX') continue;
                    const psid = String(c.from_psid || c.from?.id || '');
                    if (!psid || psid === String(pageId)) continue;
                    const lastSenderId = String(
                        c.last_sent_by?.id || c.last_message?.from?.id || ''
                    );
                    if (lastSenderId && lastSenderId === String(pageId)) continue; // shop gửi cuối → bỏ
                    const phone =
                        c.recent_phone_numbers?.[0]?.phone_number ||
                        c.conv_phone_numbers?.[0]?.phone_number ||
                        '';
                    // onNewConversationEvent: dedupe theo psid + tôn trọng
                    // _wasRecentlyReplied + SET inboxCount = unread (authoritative).
                    onNewConversationEvent({
                        psid,
                        page_id: String(pageId),
                        customerName: c.from?.name || c.customers?.[0]?.name || '',
                        phone,
                        snippet: c.snippet || '',
                        type: 'INBOX',
                        unread_count: unread,
                        eventTimeMs: c.updated_at ? new Date(c.updated_at).getTime() : Date.now(),
                    });
                    added++;
                }
            } catch (_e) {
                /* one page failure shouldn't block the rest */
            }
        }
        if (added > 0) {
            console.log(`[NOTIFIER] discoverUnread: +${added} unread từ Pancake`);
            reapply();
        }
    }

    // Vào trang: discover unread 1 lần khi pancakeDataManager sẵn sàng (pages + PAT).
    // KHÔNG phải interval — chỉ chờ readiness rồi fire một lần.
    (function _discoverOnEnter() {
        let tries = 0;
        const t = setInterval(() => {
            tries++;
            const pdm = window.pancakeDataManager;
            if (pdm && (pdm.pages || []).length > 0) {
                clearInterval(t);
                discoverUnreadFromPancake({ force: true }).catch(() => {});
            } else if (tries > 30) {
                clearInterval(t);
            }
        }, 1000);
    })();

    // Run reconcile once on startup, then every 5 min.
    // Defer initial run to give pancakeDataManager time to authenticate.
    setTimeout(() => {
        reconcilePendingWithPancake().catch(() => {});
    }, 8000);
    setInterval(
        () => {
            reconcilePendingWithPancake().catch(() => {});
        },
        5 * 60 * 1000
    );

    // Khi tab trở lại visible: tô lại badge ngay + reconcile (cooldown 60s tự chặn
    // spam). Bù cho việc reconcile bị skip lúc tab ẩn.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            reapply();
            reconcilePendingWithPancake().catch(() => {});
        }
    });

    // Cross-tab sync: tab A đổi pending/replied-map trong localStorage → tab B
    // nạp lại in-memory + tô lại badge. Trước đây không listen 'storage' nên 2 tab
    // lệch nhau (tab A clear xong tab B vẫn hiện badge cũ, hoặc ngược lại).
    window.addEventListener('storage', (e) => {
        if (e.key === LS_KEY) {
            _pendingCustomers = _loadFromLocalStorage();
            reapply();
        } else if (e.key === LS_REPLIED_KEY) {
            _recentlyRepliedAt = _loadRepliedMap();
        }
    });

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
        .new-msg-badge {
            display: inline-flex;
            align-items: center;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 700;
            margin-right: 4px;
            animation: badgePulse 2s infinite;
            background: #ef4444;
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
        reconcilePendingWithPancake,
        discoverUnreadFromPancake,
    };
})();
