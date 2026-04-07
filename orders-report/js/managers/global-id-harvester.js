// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// GLOBAL ID HARVESTER
// Harvest globalUserId từ Pancake API responses (customers[].global_id)
// và push lên Render DB cache (table fb_global_id_cache).
// Mỗi user mở 1 conversation → fetchMessages trả customers[] có global_id →
// extract → push lên server. Cache shared giữa tất cả máy → bypass 6 strategies
// extension trong tương lai.
// =====================================================

(function () {
    'use strict';

    if (window.__globalIdHarvesterLoaded) return;
    window.__globalIdHarvesterLoaded = true;

    const ENDPOINT = 'https://n2store-fallback.onrender.com/api/fb-global-id';
    const LOG = '[GLOBAL-ID-HARVEST]';

    // Dedupe in-memory để tránh push duplicate trong cùng session
    const _seenInSession = new Set(); // key: pageId:psid
    let _totalPushed = 0;

    /**
     * Push 1 mapping lên server (fire-and-forget)
     */
    function _pushOne(pageId, psid, globalUserId, conversationId, customerName, threadId) {
        const username = window.authManager?.getAuthState?.()?.username || 'auto-harvest';
        try {
            fetch(ENDPOINT, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pageId: String(pageId),
                    psid: String(psid),
                    globalUserId: String(globalUserId),
                    conversationId: conversationId || null,
                    customerName: customerName || null,
                    threadId: threadId || null,
                    resolvedBy: username,
                }),
            }).catch(() => {});
            _totalPushed++;
        } catch (e) {}
    }

    /**
     * Extract + push global_ids từ customers[] array.
     * Mỗi customer object: { id, fb_id, global_id, name, ... }
     * @returns {number} số entry mới push
     */
    function harvestFromCustomers(pageId, customers, meta = {}) {
        if (!pageId || !Array.isArray(customers) || customers.length === 0) return 0;
        let pushed = 0;
        for (const c of customers) {
            const psid = c?.fb_id || c?.id;
            const globalId = c?.global_id;
            if (!psid || !globalId) continue;
            // Sanity: PSID phải khác globalId (nếu bằng nhau là Pancake bug, không đáng tin)
            if (String(psid) === String(globalId)) continue;
            const key = `${pageId}:${psid}`;
            if (_seenInSession.has(key)) continue;
            _seenInSession.add(key);

            _pushOne(pageId, psid, globalId, meta.conversationId, c.name, meta.threadId);
            pushed++;
        }
        if (pushed > 0) {
            console.log(`${LOG} ⚡ Pushed ${pushed} new mappings (page ${pageId}, total session: ${_totalPushed})`);
        }
        return pushed;
    }

    /**
     * Extract from a single conversation object.
     * Pancake conv: { from: { id }, page_customer: { global_id, name }, customers: [...] }
     */
    function harvestFromConversation(pageId, conv) {
        if (!conv) return 0;
        const candidates = [];
        // Source A: page_customer.global_id (most reliable when present)
        const pageCustomer = conv.page_customer;
        if (pageCustomer?.global_id) {
            const psid = conv.from?.id || conv.from_psid || pageCustomer.fb_id;
            if (psid) {
                candidates.push({
                    fb_id: psid,
                    global_id: pageCustomer.global_id,
                    name: pageCustomer.name || conv.from?.name,
                });
            }
        }
        // Source B: customers[] array
        if (Array.isArray(conv.customers)) {
            candidates.push(...conv.customers);
        }
        if (candidates.length === 0) return 0;
        return harvestFromCustomers(pageId, candidates, {
            conversationId: conv.id,
            threadId: conv.thread_id,
        });
    }

    /**
     * Bulk harvest from a conversation list.
     */
    function harvestFromConversations(pageId, conversations) {
        if (!Array.isArray(conversations)) return 0;
        let total = 0;
        for (const conv of conversations) {
            total += harvestFromConversation(pageId, conv);
        }
        return total;
    }

    window.GlobalIdHarvester = {
        fromCustomers: harvestFromCustomers,
        fromConversation: harvestFromConversation,
        fromConversations: harvestFromConversations,
        getStats: () => ({
            seenInSession: _seenInSession.size,
            totalPushed: _totalPushed,
        }),
        clearSeen: () => {
            _seenInSession.clear();
            _totalPushed = 0;
        },
    };

    console.log(`${LOG} Module loaded`);
})();
