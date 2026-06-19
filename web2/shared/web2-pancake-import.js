// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared module.
// =====================================================================
// Web2PancakeImport — 1 NGUỒN tra cứu KH fallback Pancake cho Web 2.0.
//
// Lý do (dedup, 2026-06-19): _searchPancakeByPhone (balance-history),
// _searchPancakeCustomers (native-orders), customers Pancake fallback đều lặp
// pattern: sync token → duyệt page tokens → searchConversations → map conv→KH.
// Gom 1 nguồn. TUÂN THỦ quy tắc dự án "KHO KH TRƯỚC, PANCAKE SAU"
// (CLAUDE.md / MEMORY [[feedback_lookup_kho_before_pancake]]).
//
// KHÔNG auto-load (feature-specific) — trang cần fallback Pancake load tường minh.
// Graceful nếu thiếu Web2Chat / Web2CustomerStore (trả mảng rỗng, không throw).
//
// API:
//   Web2PancakeImport.searchByPhone(phone, pageIds?) → Promise<customers[]>
//        (chỉ Pancake; customers = {phone,name,fbId,pageId,source:'pancake'})
//   Web2PancakeImport.lookupDeep(query, opts?)       → Promise<{ source, results }>
//        (kho KH TRƯỚC qua Web2CustomerStore; thiếu mới fetch Pancake)
//   Web2PancakeImport.convToCustomer(conv, pageId?)  → {phone,name,fbId,pageId}|null
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2PancakeImport) return;

    function _digits(v) {
        return String(v || '').replace(/\D/g, '');
    }

    // Map 1 hội thoại Pancake → KH lite. Lấy SĐT từ recent_phone_numbers (KH
    // tự gõ — đáng tin), tên + fb_id từ customers[0]/from. null nếu thiếu data.
    function convToCustomer(conv, pageId) {
        if (!conv) return null;
        var cust = (conv.customers && conv.customers[0]) || null;
        var name = (cust && cust.name) || (conv.from && conv.from.name) || '';
        var phones = (conv.recent_phone_numbers || [])
            .map(function (x) {
                return x && x.phone_number;
            })
            .filter(Boolean);
        var phone = phones[0] || '';
        var fbId = (conv.from && conv.from.id) || (cust && (cust.fb_id || cust.global_id)) || '';
        if (!phone && !fbId) return null;
        return {
            phone: phone,
            name: name,
            fbId: fbId,
            pageId: pageId || conv.page_id || '',
            source: 'pancake',
        };
    }

    function _pageIds(explicit) {
        if (Array.isArray(explicit) && explicit.length) return explicit;
        var Web2Chat = global.Web2Chat;
        if (Web2Chat && Web2Chat.getAllPageAccessTokens) {
            return Object.keys(Web2Chat.getAllPageAccessTokens() || {});
        }
        return [];
    }

    // Tìm KH trên Pancake theo SĐT (cần ≥4 chữ số giống SĐT). Duyệt mọi page,
    // dedupe theo phone|name, ưu tiên SĐT kết thúc đúng đuôi query.
    async function searchByPhone(phone, pageIds) {
        var digits = _digits(phone);
        if (digits.length < 4) return [];
        var Web2Chat = global.Web2Chat;
        if (!Web2Chat || !Web2Chat.searchConversations) return [];
        try {
            if (Web2Chat.syncFromRenderDB) {
                await Web2Chat.syncFromRenderDB().catch(function () {});
            }
        } catch (_) {}
        var pages = _pageIds(pageIds);
        if (!pages.length) return [];
        var seen = new Set();
        var out = [];
        await Promise.all(
            pages.map(async function (pg) {
                try {
                    var r = await Web2Chat.searchConversations(pg, digits);
                    if (!r || !r.ok) return;
                    var convs = r.conversations || [];
                    for (var i = 0; i < convs.length; i++) {
                        var c = convToCustomer(convs[i], pg);
                        if (!c || !c.phone || !c.name) continue;
                        var key = c.phone + '|' + c.name;
                        if (seen.has(key)) continue;
                        seen.add(key);
                        out.push(c);
                    }
                } catch (_) {}
            })
        );
        out.sort(function (a, b) {
            var ea = _digits(a.phone).endsWith(digits) ? 0 : 1;
            var eb = _digits(b.phone).endsWith(digits) ? 0 : 1;
            return ea - eb;
        });
        return out.slice(0, (pageIds && pageIds._limit) || 8);
    }

    // Tra cứu phân tầng theo quy tắc dự án: KHO KH (Web2CustomerStore) TRƯỚC;
    // CHỈ khi kho không có mới fetch Pancake. Trả { source:'kho'|'pancake'|'none',
    // results: customers[] }. opts: { pageIds, pancakeFallback:bool(=true) }.
    async function lookupDeep(query, opts) {
        var o = opts || {};
        var digits = _digits(query);
        var Store = global.Web2CustomerStore;

        // 1) Kho KH trước (nếu query là SĐT hợp lệ + store có).
        if (Store && /^0\d{9}$/.test(digits)) {
            try {
                var rec = null;
                if (Store.getByPhone) rec = await Store.getByPhone(digits);
                else if (Store.batchByPhones) {
                    var m = await Store.batchByPhones([digits]);
                    rec = m && (m.get ? m.get(digits) : m[digits]);
                }
                if (rec) {
                    return {
                        source: 'kho',
                        results: [
                            {
                                phone: rec.phone || digits,
                                name: rec.name || rec.full_name || '',
                                fbId: rec.fb_id || '',
                                pageId: '',
                                source: 'kho',
                            },
                        ],
                    };
                }
            } catch (_) {}
        }

        // 2) Pancake fallback (mặc định bật) — chỉ bù FB context khi kho thiếu.
        if (o.pancakeFallback !== false) {
            var pk = await searchByPhone(query, o.pageIds);
            if (pk.length) return { source: 'pancake', results: pk };
        }
        return { source: 'none', results: [] };
    }

    global.Web2PancakeImport = {
        searchByPhone: searchByPhone,
        lookupDeep: lookupDeep,
        convToCustomer: convToCustomer,
    };
})(typeof window !== 'undefined' ? window : globalThis);
