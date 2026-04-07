// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// TAB1 TAG SYNC v3 — Hardcoded mapping, tối giản
// =====================================================
// Architecture:
//   - Hardcoded mapping tables (không có modal user-configurable)
//   - Forward (XL→TPOS): preserve unmanaged tags, replace managed tags
//   - Reverse (TPOS→XL): per-flag + per-ttag diff, subtag chỉ REMOVE bidirectional
//   - Guard flags kép tránh loop vô hạn
// =====================================================

(function() {
    'use strict';

    const LOG = '[TAG-SYNC-V3]';
    const ASSIGN_TAG_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/TagSaleOnlineOrder/ODataService.AssignTag';
    const CREATE_TAG_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Tag';

    // =====================================================
    // MAPPING TABLES (hardcoded)
    // =====================================================

    // Category (XL cat id → TPOS tag name). 1 chiều XL→TPOS, không reverse.
    const CAT_TO_TPOS = {
        0: 'ĐÃ RA ĐƠN',
        1: 'CHỜ ĐI ĐƠN (OKE)',
        2: 'MỤC XỬ LÝ',
        3: 'KHÔNG CẦN CHỐT',
        4: 'KHÁCH XÃ SAU CHỐT'
    };

    // Subtag (XL subtag id → TPOS tag name). 1 chiều XL→TPOS cho 7 subtag thường,
    // + bidirectional REMOVE cho 3 subtag đặc biệt (GIO_TRONG, DA_GOP_KHONG_CHOT, NCC_HET_HANG).
    const SUBTAG_TO_TPOS = {
        // Cat 2 — MỤC XỬ LÝ
        CHUA_PHAN_HOI:     'ĐƠN CHƯA PHẢN HỒI',
        CHUA_DUNG_SP:      'ĐƠN CHƯA ĐÚNG SP',
        KHACH_MUON_XA:     'ĐƠN KHÁCH MUỐN XÃ',
        BAN_HANG:          'BÁN HÀNG',
        XU_LY_KHAC:        'KHÁC (GHI CHÚ)',
        // Cat 3 — KHÔNG CẦN CHỐT  (⚠ bidirectional REMOVE)
        DA_GOP_KHONG_CHOT: 'ĐÃ GỘP KO CHỐT',
        GIO_TRONG:         'GIỎ TRỐNG',
        // Cat 4 — KHÁCH XÃ SAU CHỐT  (⚠ bidirectional REMOVE: NCC_HET_HANG)
        NCC_HET_HANG:      'NCC HẾT HÀNG',
        KHACH_HUY_DON:     'KHÁCH HỦY NGUYÊN ĐƠN',
        KHACH_KO_LIEN_LAC: 'KHÁCH KHÔNG LIÊN LẠC ĐƯỢC'
    };

    // GIO_TRONG bị loại khỏi bidirectional REMOVE — server n2store-realtime tự
    // quản lý độc lập theo SL (xem tab1-empty-cart-auto-sync.js).
    const BIDIRECTIONAL_REMOVE_SUBTAGS = new Set([
        'DA_GOP_KHONG_CHOT', 'NCC_HET_HANG'
    ]);

    // Flag (XL flag id → TPOS tag name). Bidirectional ADD + REMOVE.
    // KHAC flag không map (nội bộ XL only).
    const FLAG_TO_TPOS = {
        TRU_CONG_NO:      'TRỪ CÔNG NỢ',
        CHUYEN_KHOAN:     'CHUYỂN KHOẢN',
        GIAM_GIA:         'GIẢM GIÁ',
        CHO_LIVE:         'CHỜ LIVE',
        GIU_DON:          'GIỮ ĐƠN',
        QUA_LAY:          'QUA LẤY',
        GOI_BAO_KHACH_HH: 'GỌI BÁO KHÁCH HH',
        KHACH_BOOM:       'KHÁCH BOOM',
        THE_KHACH_LA:     'THẺ KHÁCH LẠ',
        DA_DI_DON_GAP:    'ĐÃ ĐI ĐƠN GẤP'
    };

    // T-tag hardcoded (default T-tag). Bidirectional.
    // Dynamic T-tags: match theo def.name (uppercase), pattern /^T\d+\s+/.
    const TTAG_HARDCODED = {
        T_MY: 'MY THÊM CHỜ VỀ'
    };

    // Reverse aliases — chỉ dùng khi TPOS → XL (TPOS tag name → XL key).
    const TPOS_ALIASES = {
        'TRỪ THU VỀ': 'flag:TRU_CONG_NO',
        'KHÁCH CK':   'flag:CHUYEN_KHOAN',
        'CK':         'flag:CHUYEN_KHOAN'
    };

    // Pattern aliases — match TPOS tag bằng regex thay vì exact name.
    // Trả về XL key (vd "flag:CHUYEN_KHOAN") nếu match.
    // KHÔNG đưa vào managed set: tag matching pattern vẫn được PRESERVE
    // bởi forward sync (vd "CỌC 100K" giữ nguyên trên TPOS, không bị xoá).
    function _matchTPOSAliasPattern(name) {
        const upper = _normalizeName(name);
        // Strip Vietnamese diacritics for permissive match
        const stripped = upper.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/Đ/g, 'D');
        // "CỌC 100K", "CỌC 200K", "CỌC 50K", "COC500K"... → flag CHUYEN_KHOAN
        if (/^COC\s*\d+\s*K?$/.test(stripped)) {
            return 'flag:CHUYEN_KHOAN';
        }
        return null;
    }

    // Build managed TPOS name set (uppercase) — dùng cho forward sync để phân biệt
    // tag do XL quản lý và tag ngoài mapping (giữ nguyên).
    function _buildManagedNameSet() {
        const set = new Set();
        Object.values(CAT_TO_TPOS).forEach(n => set.add(_normalizeName(n)));
        Object.values(SUBTAG_TO_TPOS).forEach(n => set.add(_normalizeName(n)));
        Object.values(FLAG_TO_TPOS).forEach(n => set.add(_normalizeName(n)));
        Object.values(TTAG_HARDCODED).forEach(n => set.add(_normalizeName(n)));
        // Aliases: cũng đánh dấu là managed (để forward sync xóa nếu XL không còn)
        Object.keys(TPOS_ALIASES).forEach(n => set.add(_normalizeName(n)));
        return set;
    }

    // =====================================================
    // GUARD FLAGS (tránh loop vô hạn) — per orderCode
    // Trước đây dùng boolean toàn cục, gây silent skip khi nhiều order
    // sync song song (vd auto wallet detect 100 row cùng lúc → 99 bị skip).
    // =====================================================

    const _syncingForward = new Set(); // Set<orderCode>
    const _syncingReverse = new Set(); // Set<orderCode>

    // =====================================================
    // HELPERS
    // =====================================================

    function _normalizeName(s) {
        return String(s || '').trim().toUpperCase();
    }

    function _setEqual(a, b) {
        if (a.size !== b.size) return false;
        for (const v of a) if (!b.has(v)) return false;
        return true;
    }

    function _resolveOrderCode(orderId) {
        if (typeof window._ptagResolveCode === 'function') {
            return window._ptagResolveCode(orderId);
        }
        const allOrders = (typeof window.getAllOrders === 'function') ? window.getAllOrders() : [];
        const order = allOrders.find(o => String(o.Id) === String(orderId));
        return order?.Code ? String(order.Code) : null;
    }

    function _findOrderByCode(orderCode) {
        const allOrders = (typeof window.getAllOrders === 'function') ? window.getAllOrders() : [];
        return allOrders.find(o => String(o.Code) === String(orderCode)) || null;
    }

    function _getTPOSTagsFromOrder(order) {
        if (!order || !order.Tags) return [];
        try {
            const parsed = JSON.parse(order.Tags);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    // Managed name set computed once (constants). Dynamic T-tag names được check riêng.
    const MANAGED_NAMES = _buildManagedNameSet();

    function _isManagedTPOSTag(tagName, dynamicTTagNames) {
        const n = _normalizeName(tagName);
        if (MANAGED_NAMES.has(n)) return true;
        // Dynamic T-tag pattern: TPOS tag tên khớp 1 XL T-tag def hiện có
        if (dynamicTTagNames && dynamicTTagNames.has(n)) return true;
        // Pattern /^T\d+\s+/: treat as managed T-tag even nếu chưa có def (reverse sẽ auto-create)
        if (/^T\d+\s+/i.test(tagName)) return true;
        return false;
    }

    /**
     * Query single TPOS tag bằng OData $filter=Name eq '...'.
     * Targeted lookup — không bị giới hạn pagination ($top=1000).
     * @returns {Promise<{Id, Name, Color}|null>}
     */
    async function _queryTPOSTagByName(name) {
        try {
            const headers = await window.tokenManager.getAuthHeader();
            const escapedName = String(name).replace(/'/g, "''");
            const filterExpr = `Name eq '${escapedName}'`;
            const url = `${CREATE_TAG_URL}?$format=json&$filter=${encodeURIComponent(filterExpr)}&$top=5`;
            const resp = await window.API_CONFIG.smartFetch(url, {
                method: 'GET',
                headers: { ...headers, accept: 'application/json' }
            });
            if (!resp.ok) return null;
            const data = await resp.json();
            const list = Array.isArray(data?.value) ? data.value : [];
            if (list.length === 0) return null;
            const upperName = _normalizeName(name);
            return list.find(t => _normalizeName(t.Name) === upperName) || list[0];
        } catch (e) {
            console.warn(`${LOG} _queryTPOSTagByName error for "${name}":`, e.message);
            return null;
        }
    }

    /**
     * Tìm TPOS tag trong window.availableTags theo tên.
     * Lookup chain (tránh 400 "đã tồn tại" do pagination cap):
     *   1. Local cache
     *   2. OData $filter query (targeted, scale với DB lớn)
     *   3. Full reload (loadAvailableTags / fetchAllTagsWithPagination)
     *   4. POST create — nếu 400 thì re-query bằng $filter để recover
     * @returns {Promise<{Id, Name, Color}|null>}
     */
    async function _findOrCreateTPOSTag(name) {
        const tags = window.availableTags || [];
        const upperName = _normalizeName(name);

        // 1. Cache lookup
        let tag = tags.find(t => _normalizeName(t.Name) === upperName);
        if (tag) return tag;

        // 2. OData $filter query — targeted, không bị pagination
        const filtered = await _queryTPOSTagByName(name);
        if (filtered) {
            // Sync vào cache
            if (Array.isArray(window.availableTags) && !window.availableTags.find(t => t.Id === filtered.Id)) {
                window.availableTags.push(filtered);
                if (window.cacheManager) window.cacheManager.set('tags', window.availableTags, 'tags');
            }
            return filtered;
        }

        // 3. Full reload (last resort trước khi create)
        console.log(`${LOG} Tag "${name}" not in cache or filter query, reloading all...`);
        try {
            if (typeof window.loadAvailableTags === 'function') {
                await window.loadAvailableTags();
            } else if (typeof window.fetchAllTagsWithPagination === 'function') {
                const headers = await window.tokenManager.getAuthHeader();
                const fresh = await window.fetchAllTagsWithPagination(headers);
                window.availableTags = fresh;
                if (window.cacheManager) window.cacheManager.set('tags', fresh, 'tags');
            }
            const reloaded = window.availableTags || [];
            tag = reloaded.find(t => _normalizeName(t.Name) === upperName);
            if (tag) return tag;
        } catch (e) {
            console.warn(`${LOG} Reload tags failed:`, e.message);
        }

        // 4. Create mới
        console.log(`${LOG} Creating new TPOS tag "${name}"...`);
        try {
            const headers = await window.tokenManager.getAuthHeader();
            const color = (typeof window.generateRandomColor === 'function') ? window.generateRandomColor() : '#6b7280';
            const response = await window.API_CONFIG.smartFetch(CREATE_TAG_URL, {
                method: 'POST',
                headers: {
                    ...headers,
                    'accept': 'application/json',
                    'content-type': 'application/json;charset=UTF-8'
                },
                body: JSON.stringify({ Name: name, Color: color })
            });
            if (!response.ok) {
                // 400 = tag đã tồn tại race condition → re-query bằng $filter để recover
                if (response.status === 400) {
                    const recovered = await _queryTPOSTagByName(name);
                    if (recovered) {
                        if (Array.isArray(window.availableTags) && !window.availableTags.find(t => t.Id === recovered.Id)) {
                            window.availableTags.push(recovered);
                            if (window.cacheManager) window.cacheManager.set('tags', window.availableTags, 'tags');
                        }
                        return recovered;
                    }
                }
                throw new Error(`HTTP ${response.status}`);
            }
            const newTag = await response.json();
            if (newTag['@odata.context']) delete newTag['@odata.context'];
            if (window.availableTags) {
                window.availableTags.push(newTag);
                if (window.cacheManager) window.cacheManager.set('tags', window.availableTags, 'tags');
            }
            console.log(`${LOG} Created TPOS tag: ${newTag.Name} (ID: ${newTag.Id})`);
            return newTag;
        } catch (e) {
            console.error(`${LOG} Create tag "${name}" failed:`, e.message);
            return null;
        }
    }

    /**
     * Gọi TPOS AssignTag API với full tag array (replace, không phải delta).
     */
    async function _callAssignTag(orderId, tagObjects) {
        const headers = await window.tokenManager.getAuthHeader();
        const response = await window.API_CONFIG.smartFetch(ASSIGN_TAG_URL, {
            method: 'POST',
            headers: {
                ...headers,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                Tags: tagObjects.map(t => ({ Id: t.Id, Color: t.Color, Name: t.Name })),
                OrderId: orderId
            })
        });
        if (!response.ok) throw new Error(`AssignTag HTTP ${response.status}`);
        return response;
    }

    /**
     * Build tập hợp TPOS tag name (uppercase) mà XL state hiện tại đang yêu cầu.
     */
    function _buildDesiredManagedTagNames(orderCode) {
        const desired = new Set();
        const data = window.ProcessingTagState?.getOrderData?.(orderCode);
        if (!data) return desired;

        // 1. Category
        if (data.category != null && CAT_TO_TPOS[data.category]) {
            desired.add(_normalizeName(CAT_TO_TPOS[data.category]));
        }

        // 2. Subtag
        if (data.subTag && SUBTAG_TO_TPOS[data.subTag]) {
            desired.add(_normalizeName(SUBTAG_TO_TPOS[data.subTag]));
        }

        // 3. Flags
        const flagIds = (data.flags || []).map(f => f?.id || f);
        for (const flagId of flagIds) {
            if (FLAG_TO_TPOS[flagId]) {
                desired.add(_normalizeName(FLAG_TO_TPOS[flagId]));
            }
        }

        // 4. T-tags
        const tTagIds = (data.tTags || []).map(t => t?.id || t);
        const defs = window.ProcessingTagState?.getTTagDefinitions?.() || [];
        for (const ttagId of tTagIds) {
            if (TTAG_HARDCODED[ttagId]) {
                desired.add(_normalizeName(TTAG_HARDCODED[ttagId]));
                continue;
            }
            const def = defs.find(d => d.id === ttagId);
            if (def && def.name) {
                desired.add(_normalizeName(def.name));
            }
        }

        return desired;
    }

    // =====================================================
    // FORWARD SYNC: XL → TPOS
    // =====================================================

    /**
     * @param {string} orderCode
     * @param {string} reason - 'category', 'flag', 'ttag-add', 'ttag-remove' (for logging)
     */
    async function syncXLToTPOS(orderCode, reason) {
        if (_syncingReverse.has(orderCode)) {
            console.log(`${LOG} [XL→TPOS] Skip ${orderCode} — đang reverse sync`);
            return;
        }
        if (_syncingForward.has(orderCode)) return;

        _syncingForward.add(orderCode);
        try {
            const order = _findOrderByCode(orderCode);
            if (!order || !order.Id) {
                console.warn(`${LOG} [XL→TPOS] Không tìm thấy order ${orderCode}`);
                return;
            }

            // Build desired managed tag names từ XL state
            const desired = _buildDesiredManagedTagNames(orderCode);

            // Current TPOS tags
            const currentTags = _getTPOSTagsFromOrder(order);
            const currentNamesUpper = new Set(currentTags.map(t => _normalizeName(t.Name)));

            // Dynamic T-tag names set (cho _isManagedTPOSTag check)
            const defs = window.ProcessingTagState?.getTTagDefinitions?.() || [];
            const dynTTagNames = new Set(defs.map(d => _normalizeName(d.name || '')).filter(Boolean));

            // Build final tag name set: preserve tag unmanaged + thêm desired managed
            const finalNamesUpper = new Set();
            const keptObjects = []; // giữ nguyên tag object gốc cho tag unmanaged

            for (const t of currentTags) {
                const n = _normalizeName(t.Name);
                if (!_isManagedTPOSTag(t.Name, dynTTagNames)) {
                    finalNamesUpper.add(n);
                    keptObjects.push(t);
                }
            }
            for (const n of desired) {
                finalNamesUpper.add(n);
            }

            // No-op check
            if (_setEqual(currentNamesUpper, finalNamesUpper)) {
                return;
            }

            // Build final tag object array
            // - Tag giữ nguyên: dùng keptObjects
            // - Tag mới từ desired: _findOrCreateTPOSTag
            const finalTagObjs = [...keptObjects];
            for (const n of desired) {
                // Nếu đã có trong keptObjects → skip
                if (keptObjects.some(k => _normalizeName(k.Name) === n)) continue;
                // Tìm display name gốc (để giữ diacritics) từ mapping
                const displayName = _findDisplayNameFromManaged(n);
                const tag = await _findOrCreateTPOSTag(displayName || n);
                if (tag) {
                    finalTagObjs.push({ Id: tag.Id, Name: tag.Name, Color: tag.Color });
                }
            }

            console.log(`${LOG} [XL→TPOS] ${reason || ''} ${orderCode}: ${finalTagObjs.length} tags (${finalTagObjs.map(t => t.Name).join(', ')})`);

            // Call API
            await _callAssignTag(order.Id, finalTagObjs);

            // Clear cache
            if (window.cacheManager) window.cacheManager.clear('orders');

            // Update local data + UI
            const tagsJson = JSON.stringify(finalTagObjs);
            if (typeof window.updateOrderInTable === 'function') {
                window.updateOrderInTable(order.Id, { Tags: tagsJson });
            }
        } catch (e) {
            console.error(`${LOG} [XL→TPOS] error:`, e.message || e);
        } finally {
            _syncingForward.delete(orderCode);
        }
    }

    /**
     * Reverse lookup: từ uppercase name → tìm display name gốc trong mapping tables
     */
    function _findDisplayNameFromManaged(upperName) {
        for (const v of Object.values(CAT_TO_TPOS)) {
            if (_normalizeName(v) === upperName) return v;
        }
        for (const v of Object.values(SUBTAG_TO_TPOS)) {
            if (_normalizeName(v) === upperName) return v;
        }
        for (const v of Object.values(FLAG_TO_TPOS)) {
            if (_normalizeName(v) === upperName) return v;
        }
        for (const v of Object.values(TTAG_HARDCODED)) {
            if (_normalizeName(v) === upperName) return v;
        }
        // Dynamic T-tag: tìm def
        const defs = window.ProcessingTagState?.getTTagDefinitions?.() || [];
        const def = defs.find(d => _normalizeName(d.name || '') === upperName);
        if (def) return def.name;
        return null;
    }

    // =====================================================
    // REVERSE SYNC: TPOS → XL
    // =====================================================

    /**
     * @param {string} orderId - TPOS order GUID
     * @param {Array<{Id,Name,Color}>} newTPOSTags - Tag array mới
     */
    async function handleTPOSTagsChanged(orderId, newTPOSTags) {
        const orderCode = _resolveOrderCode(orderId);
        if (!orderCode) {
            console.warn(`${LOG} [TPOS→XL] Không resolve được orderCode cho ${orderId}`);
            return;
        }
        if (_syncingForward.has(orderCode)) {
            console.log(`${LOG} [TPOS→XL] Skip ${orderCode} — đang forward sync`);
            return;
        }
        if (_syncingReverse.has(orderCode)) return;

        _syncingReverse.add(orderCode);
        try {

            // Đọc XL data mới nhất
            const data = window.ProcessingTagState?.getOrderData?.(orderCode) || null;
            const currentFlags = (data?.flags || []).map(f => f?.id || f);
            const currentTTags = (data?.tTags || []).map(t => t?.id || t);
            const currentSubTag = data?.subTag || null;
            const currentCategory = (data?.category != null) ? data.category : null;

            // Build TPOS tag name set (uppercase)
            const tposNamesUpper = new Set(
                (newTPOSTags || []).map(t => _normalizeName(t.Name))
            );

            // (a) Flags bidirectional
            for (const [flagKey, tposName] of Object.entries(FLAG_TO_TPOS)) {
                const hasTPOS = tposNamesUpper.has(_normalizeName(tposName));
                const hasXL = currentFlags.includes(flagKey);
                if (hasTPOS && !hasXL) {
                    console.log(`${LOG} [TPOS→XL] ADD flag ${flagKey} → ${orderCode}`);
                    if (typeof window.toggleOrderFlag === 'function') {
                        await window.toggleOrderFlag(orderCode, flagKey, 'TPOS-SYNC');
                    }
                } else if (!hasTPOS && hasXL) {
                    console.log(`${LOG} [TPOS→XL] REMOVE flag ${flagKey} → ${orderCode}`);
                    if (typeof window.toggleOrderFlag === 'function') {
                        await window.toggleOrderFlag(orderCode, flagKey, 'TPOS-SYNC');
                    }
                }
            }

            // (b) Aliases — nếu TPOS có alias tag và XL chưa có flag tương ứng → set flag
            // Gồm 2 nguồn: (1) TPOS_ALIASES exact name, (2) pattern match (vd CỌC <n>K)
            const matchedAliasFlags = new Set(); // flagKey set, dedupe ADD calls
            for (const [aliasName, xlKey] of Object.entries(TPOS_ALIASES)) {
                if (!tposNamesUpper.has(_normalizeName(aliasName))) continue;
                if (!xlKey.startsWith('flag:')) continue;
                matchedAliasFlags.add(xlKey.split(':')[1]);
            }
            // Pattern alias: iterate TPOS tag names, check pattern matchers
            for (const tag of (newTPOSTags || [])) {
                const xlKey = _matchTPOSAliasPattern(tag?.Name || '');
                if (xlKey && xlKey.startsWith('flag:')) {
                    matchedAliasFlags.add(xlKey.split(':')[1]);
                }
            }
            for (const flagKey of matchedAliasFlags) {
                const latestData = window.ProcessingTagState?.getOrderData?.(orderCode);
                const latestFlags = (latestData?.flags || []).map(f => f?.id || f);
                if (!latestFlags.includes(flagKey)) {
                    console.log(`${LOG} [TPOS→XL] ALIAS ADD flag ${flagKey} → ${orderCode}`);
                    if (typeof window.toggleOrderFlag === 'function') {
                        await window.toggleOrderFlag(orderCode, flagKey, 'TPOS-SYNC-ALIAS');
                    }
                }
            }

            // (c) Bidirectional REMOVE cho 3 subtag đặc biệt
            //     Nếu XL đang có subtag đặc biệt mà TPOS không còn tag tương ứng → clear subtag, GIỮ category
            if (currentSubTag && BIDIRECTIONAL_REMOVE_SUBTAGS.has(currentSubTag)) {
                const tposName = SUBTAG_TO_TPOS[currentSubTag];
                if (tposName && !tposNamesUpper.has(_normalizeName(tposName))) {
                    console.log(`${LOG} [TPOS→XL] REMOVE subtag ${currentSubTag} (giữ Cat ${currentCategory}) → ${orderCode}`);
                    if (typeof window.assignOrderCategory === 'function' && currentCategory != null) {
                        await window.assignOrderCategory(orderCode, currentCategory, {
                            subTag: null,
                            source: 'TPOS-SYNC-REMOVE-SUBTAG'
                        });
                    }
                }
            }

            // (d) T-tag T_MY bidirectional
            const tposNameTMY = _normalizeName(TTAG_HARDCODED.T_MY);
            const hasTMYTPOS = tposNamesUpper.has(tposNameTMY);
            const hasTMYXL = currentTTags.includes('T_MY');
            if (hasTMYTPOS && !hasTMYXL) {
                console.log(`${LOG} [TPOS→XL] ADD T_MY → ${orderCode}`);
                if (typeof window.assignTTagToOrder === 'function') {
                    await window.assignTTagToOrder(orderCode, 'T_MY', 'TPOS-SYNC');
                }
            } else if (!hasTMYTPOS && hasTMYXL) {
                console.log(`${LOG} [TPOS→XL] REMOVE T_MY → ${orderCode}`);
                if (typeof window.removeTTagFromOrder === 'function') {
                    await window.removeTTagFromOrder(orderCode, 'T_MY');
                }
            }

            // (e) T-tag Tx pattern bidirectional (auto-create def)
            const defs = window.ProcessingTagState?.getTTagDefinitions?.() || [];
            // e1. ADD: TPOS có tag match /^T\d+\s+/ mà XL chưa có
            for (const tag of (newTPOSTags || [])) {
                const tagName = String(tag?.Name || '').trim();
                if (!/^T\d+\s+/i.test(tagName)) continue;
                const upperName = tagName.toUpperCase();
                if (upperName === tposNameTMY) continue; // T_MY đã xử lý ở (d)

                // Tìm def theo name (không phải id)
                let def = defs.find(d => _normalizeName(d.name || '') === upperName);
                if (!def) {
                    // Auto-create def: id = name uppercase (nhất quán với _ptagAutoCreateTTag)
                    def = { id: upperName, name: upperName, productCode: '', createdAt: Date.now() };
                    defs.push(def);
                    if (typeof window.ProcessingTagState?.setTTagDefinitions === 'function') {
                        window.ProcessingTagState.setTTagDefinitions(defs);
                    }
                    if (typeof window.mergeConfigDefs === 'function') {
                        window.mergeConfigDefs('__ttag_config__', [def]);
                    }
                    console.log(`${LOG} [TPOS→XL] Auto-created T-tag def: ${def.id}`);
                }

                // Re-read latest tTags (có thể đã add ở loop trước)
                const latestData = window.ProcessingTagState?.getOrderData?.(orderCode);
                const latestTTagIds = (latestData?.tTags || []).map(t => t?.id || t);
                if (!latestTTagIds.includes(def.id)) {
                    console.log(`${LOG} [TPOS→XL] ADD T-tag ${def.id} → ${orderCode}`);
                    if (typeof window.assignTTagToOrder === 'function') {
                        await window.assignTTagToOrder(orderCode, def.id, 'TPOS-SYNC');
                    }
                }
            }

            // e2. REMOVE: XL có T-tag (khác T_MY) mà TPOS không còn
            // Re-read để tránh dựa vào state cũ
            const latestData2 = window.ProcessingTagState?.getOrderData?.(orderCode);
            const latestTTagIds2 = (latestData2?.tTags || []).map(t => t?.id || t);
            for (const ttagId of latestTTagIds2) {
                if (ttagId === 'T_MY') continue;
                const def = defs.find(d => d.id === ttagId);
                if (!def) continue;
                if (!tposNamesUpper.has(_normalizeName(def.name || ''))) {
                    console.log(`${LOG} [TPOS→XL] REMOVE T-tag ${ttagId} → ${orderCode}`);
                    if (typeof window.removeTTagFromOrder === 'function') {
                        await window.removeTTagFromOrder(orderCode, ttagId);
                    }
                }
            }
        } catch (e) {
            console.error(`${LOG} [TPOS→XL] error:`, e.message || e);
        } finally {
            _syncingReverse.delete(orderCode);
        }
    }

    // =====================================================
    // EXPOSE
    // =====================================================

    window.syncXLToTPOS = syncXLToTPOS;
    window.handleTPOSTagsChanged = handleTPOSTagsChanged;
    // Expose managed-name lookup so other modules (vd Tag XL cell render)
    // có thể detect tag KHÁC = unmanaged TPOS tag.
    window.isTPOSTagManaged = function(tagName) {
        if (_buildManagedNameSet().has(_normalizeName(tagName))) return true;
        // Pattern alias (vd CỌC 100K) cũng coi là managed về mặt logical
        if (_matchTPOSAliasPattern(tagName)) return true;
        return false;
    };
    // Trả về flag key (vd 'CHUYEN_KHOAN') nếu tag match pattern alias, null nếu không.
    window.matchTPOSAliasFlag = function(tagName) {
        const xlKey = _matchTPOSAliasPattern(tagName);
        if (!xlKey || !xlKey.startsWith('flag:')) return null;
        return xlKey.split(':')[1];
    };
    window.getUnmanagedTPOSTagsFromOrder = function(orderTagsRaw) {
        const set = _buildManagedNameSet();
        let arr = [];
        if (Array.isArray(orderTagsRaw)) arr = orderTagsRaw;
        else if (typeof orderTagsRaw === 'string' && orderTagsRaw) {
            try { const p = JSON.parse(orderTagsRaw); if (Array.isArray(p)) arr = p; } catch (e) {}
        }
        return arr.filter(t => {
            const upper = _normalizeName(t?.Name || '');
            if (set.has(upper)) return false;            // exact mapping
            if (_matchTPOSAliasPattern(t?.Name)) return false; // pattern alias
            return true;
        });
    };

    console.log(`${LOG} module loaded (hardcoded mapping, v3)`);
})();
