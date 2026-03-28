// =====================================================
// TAB1 PROCESSING TAGS v2
// Hệ thống tag xử lý chốt đơn — 5 categories
// =====================================================

(function() {
    'use strict';

    const PTAG_API_BASE = 'https://n2store-fallback.onrender.com/api/realtime/processing-tags';
    const PTAG_LOG = '[PTAG v2]';

    // =====================================================
    // SECTION 1: CONSTANTS
    // =====================================================

    const PTAG_CATEGORIES = {
        HOAN_TAT: 0,
        CHO_DI_DON: 1,
        XU_LY: 2,
        KHONG_CAN_CHOT: 3,
        KHACH_XA: 4
    };

    const PTAG_CATEGORY_META = {
        0: { name: 'HOÀN TẤT — ĐÃ RA ĐƠN', short: 'Hoàn tất', icon: 'fa-check-circle', emoji: '🟢' },
        1: { name: 'CHỜ ĐI ĐƠN (OKE)', short: 'Chờ đi đơn', icon: 'fa-clock', emoji: '🔵' },
        2: { name: 'MỤC XỬ LÝ', short: 'Xử lý', icon: 'fa-exclamation-triangle', emoji: '🟠' },
        3: { name: 'KHÔNG CẦN CHỐT', short: 'Ko cần chốt', icon: 'fa-minus-circle', emoji: '⚪' },
        4: { name: 'KHÁCH XÃ SAU CHỐT', short: 'Khách xã', icon: 'fa-times-circle', emoji: '🔴' }
    };

    const PTAG_CATEGORY_COLORS = {
        0: { bg: 'rgba(16,185,129,0.12)', border: '#10b981', text: '#065f46' },
        1: { bg: 'rgba(59,130,246,0.08)', border: '#3b82f6', text: '#1e40af' },
        2: { bg: 'rgba(245,158,11,0.08)', border: '#f59e0b', text: '#92400e' },
        3: { bg: 'rgba(107,114,128,0.08)', border: '#6b7280', text: '#374151' },
        4: { bg: 'rgba(239,68,68,0.08)', border: '#ef4444', text: '#991b1b' }
    };

    const PTAG_SUBSTATES = {
        OKIE_CHO_DI_DON: { key: 'OKIE_CHO_DI_DON', label: 'Okie Chờ Đi Đơn', color: '#3b82f6' },
        CHO_HANG:        { key: 'CHO_HANG',         label: 'Chờ Hàng',         color: '#f59e0b' }
    };

    const PTAG_FLAGS = {
        TRU_CONG_NO:  { key: 'TRU_CONG_NO',  label: 'Trừ công nợ', auto: true,  icon: '\u{1F4B0}' },
        CHUYEN_KHOAN: { key: 'CHUYEN_KHOAN', label: 'CK',          auto: true,  icon: '\u{1F4B3}' },
        GIAM_GIA:     { key: 'GIAM_GIA',     label: 'Giảm giá',    auto: true,  icon: '\u{1F3F7}\uFE0F' },
        CHO_LIVE:     { key: 'CHO_LIVE',     label: 'Chờ live',    auto: false, icon: '\u{1F4FA}' },
        GIU_DON:      { key: 'GIU_DON',      label: 'Giữ đơn',     auto: false, icon: '\u{231B}' },
        QUA_LAY:      { key: 'QUA_LAY',      label: 'Qua lấy',     auto: false, icon: '\u{1F3E0}' },
        KHAC:         { key: 'KHAC',         label: 'Khác',        auto: false, icon: '\u{1F4CB}', hasNote: true }
    };

    const PTAG_SUBTAGS = {
        // Category 2 — MỤC XỬ LÝ
        CHUA_PHAN_HOI:  { key: 'CHUA_PHAN_HOI',  label: 'Đơn chưa phản hồi', category: 2 },
        CHUA_DUNG_SP:   { key: 'CHUA_DUNG_SP',   label: 'Đơn chưa đúng SP',  category: 2 },
        KHACH_MUON_XA:  { key: 'KHACH_MUON_XA',  label: 'Đơn khách muốn xã', category: 2 },
        NCC_HET_HANG:   { key: 'NCC_HET_HANG',   label: 'NCC hết hàng',       category: 2 },
        BAN_HANG:       { key: 'BAN_HANG',        label: 'Bán hàng',           category: 2 },
        XU_LY_KHAC:     { key: 'XU_LY_KHAC',     label: 'Khác (ghi chú)',     category: 2, hasNote: true },
        // Category 3 — KHÔNG CẦN CHỐT
        DA_GOP_KHONG_CHOT: { key: 'DA_GOP_KHONG_CHOT', label: 'Đã gộp không chốt', category: 3 },
        GIO_TRONG:          { key: 'GIO_TRONG',         label: 'Giỏ trống',         category: 3 },
        // Category 4 — KHÁCH XÃ
        KHACH_HUY_DON:      { key: 'KHACH_HUY_DON',     label: 'Khách hủy nguyên đơn',      category: 4 },
        KHACH_KO_LIEN_LAC:  { key: 'KHACH_KO_LIEN_LAC', label: 'Khách không liên lạc được', category: 4 }
    };

    const PTAG_TOOLTIPS = {
        // Categories
        cat_0: 'Đơn đã tạo bill thành công, hoàn thành chốt đơn. Tự động khi bill tạo thành công.',
        cat_1: 'Khách đã xác nhận OK, đơn chờ đủ điều kiện để ra bill.',
        cat_2: 'Đơn cần seller xử lý vấn đề trước khi có thể ra bill.',
        cat_3: 'Đơn không cần xử lý chốt đơn.',
        cat_4: 'Khách hủy hoặc không liên lạc được sau chốt đơn.',
        // Sub-states
        sub_OKIE_CHO_DI_DON: 'Đủ hàng, sẵn sàng ra bill. Không có tag T nào.',
        sub_CHO_HANG: 'Thiếu hàng, chờ hàng về. Có ít nhất 1 tag T.',
        // Flags
        flag_TRU_CONG_NO: 'Ví khách có virtual balance (công nợ ảo). Auto-detect từ ví.',
        flag_CHUYEN_KHOAN: 'Ví khách có real balance (đã chuyển khoản). Auto-detect từ ví.',
        flag_GIAM_GIA: 'Đơn có chiết khấu/sale. Auto-detect từ data.',
        flag_CHO_LIVE: 'Chờ gộp vào live sau, in phiếu soạn hàng ghi chú.',
        flag_GIU_DON: 'Giữ 10-20 ngày, khách đã CK đủ nhưng chưa muốn nhận.',
        flag_QUA_LAY: 'Khách qua shop lấy, soạn hàng để kệ qua lấy.',
        flag_KHAC: 'Ghi chú tự do cho trường hợp đặc biệt.',
        // Sub-tags cat 2
        subtag_CHUA_PHAN_HOI: 'Khách chưa trả lời tin nhắn + chưa gọi được.',
        subtag_CHUA_DUNG_SP: 'Thiếu, dư, sai sản phẩm cần kiểm tra lại.',
        subtag_KHACH_MUON_XA: 'Khách muốn bỏ 1 hoặc vài món, đang năn nỉ.',
        subtag_NCC_HET_HANG: 'Báo khách hết hàng hoặc đổi qua mẫu khác.',
        subtag_BAN_HANG: 'Khách đang mua thêm, seller đang chào hàng.',
        subtag_XU_LY_KHAC: 'Ghi chú — VD: xử lý bưu cục, khách yêu cầu thêm deal.',
        // Sub-tags cat 3
        subtag_DA_GOP_KHONG_CHOT: 'Đơn khách mua 2 page đã gộp vào 1 đơn khác.',
        subtag_GIO_TRONG: 'Đơn không có SP, đã xử lý trước đó.',
        // Sub-tags cat 4
        subtag_KHACH_HUY_DON: 'Khách báo lý do không nhận: đi công tác, không có tiền, đổi ý.',
        subtag_KHACH_KO_LIEN_LAC: 'Sau buổi chốt đơn vẫn không liên lạc được, bắt buộc xã.'
    };

    const PTAG_SUBTAG_ICONS = {
        CHUA_PHAN_HOI: '💬', CHUA_DUNG_SP: '📦', KHACH_MUON_XA: '🙏',
        NCC_HET_HANG: '🚫', BAN_HANG: '🛒', XU_LY_KHAC: '📋',
        DA_GOP_KHONG_CHOT: '🔗', GIO_TRONG: '🛒',
        KHACH_HUY_DON: '❌', KHACH_KO_LIEN_LAC: '📵'
    };

    // =====================================================
    // SECTION 2: STATE MANAGEMENT
    // =====================================================

    const ProcessingTagState = {
        _orderData: new Map(),
        _panelOpen: false,
        _panelPinned: JSON.parse(localStorage.getItem('ptag_panel_pinned') || 'false'),
        _activeFilter: null,
        _activeFlagFilters: new Set(),
        _campaignId: null,
        _sseSource: null,
        _pollInterval: null,
        _tTagDefinitions: [],
        _customFlags: new Map(),

        getOrderData(orderId) {
            return this._orderData.get(String(orderId)) || null;
        },
        setOrderData(orderId, data) {
            this._orderData.set(String(orderId), data);
        },
        updateOrder(orderId, updates) {
            const current = this._orderData.get(String(orderId));
            if (current) {
                Object.assign(current, updates);
            }
        },
        getOrderFlags(orderId) {
            return this._orderData.get(String(orderId))?.flags || [];
        },
        removeOrder(orderId) {
            this._orderData.delete(String(orderId));
        },
        hasOrder(orderId) {
            return this._orderData.has(String(orderId));
        },
        getAllOrders() {
            return this._orderData;
        },
        clear() {
            this._orderData.clear();
        },
        getTTagDefinitions() {
            return this._tTagDefinitions;
        },
        setTTagDefinitions(defs) {
            this._tTagDefinitions = Array.isArray(defs) ? defs : [];
        },
        getTTagName(tagId) {
            const def = this._tTagDefinitions.find(d => d.id === tagId);
            return def ? def.name : tagId;
        },
        getTTagDef(tagId) {
            return this._tTagDefinitions.find(d => d.id === tagId) || null;
        },
        getTTagLabel(tagId) {
            const def = this._tTagDefinitions.find(d => d.id === tagId);
            if (!def) return tagId;
            const pc = def.productCode ? ` · ${def.productCode}` : '';
            return `${def.name}${pc}`;
        }
    };

    // =====================================================
    // SECTION 3: API LAYER
    // =====================================================

    async function _ptagFetch(url, options = {}) {
        const defaults = {
            headers: { 'Content-Type': 'application/json' },
            ...options
        };
        const response = await fetch(url, defaults);
        if (!response.ok) {
            throw new Error(`PTAG API ${response.status}: ${response.statusText}`);
        }
        return response.json();
    }

    async function loadProcessingTags(campaignId) {
        ProcessingTagState._campaignId = campaignId;
        // Reset filter khi đổi campaign
        ProcessingTagState._activeFilter = null;
        try {
            const result = await _ptagFetch(`${PTAG_API_BASE}/${encodeURIComponent(campaignId)}`);
            ProcessingTagState.clear();
            if (result.data) {
                for (const [orderId, data] of Object.entries(result.data)) {
                    if (orderId === '__ttag_config__') {
                        ProcessingTagState.setTTagDefinitions(data.tTagDefinitions || []);
                        continue;
                    }
                    if (orderId === '__ptag_custom_flags__') {
                        if (data.customFlags) {
                            ProcessingTagState._customFlags = new Map(Object.entries(data.customFlags));
                        }
                        continue;
                    }
                    // Normalize subState for cat 1 orders based on tTags
                    if (data.category === PTAG_CATEGORIES.CHO_DI_DON) {
                        const hasTTags = (data.tTags || []).length > 0;
                        data.subState = hasTTags ? 'CHO_HANG' : 'OKIE_CHO_DI_DON';
                    }
                    ProcessingTagState.setOrderData(orderId, data);
                }
            }
            console.log(`${PTAG_LOG} Loaded ${result.count || 0} tags for campaign ${campaignId}`);
            _ptagReconcileIds();
            renderPanelContent();
            _ptagRefreshAllRows();
        } catch (e) {
            console.error(`${PTAG_LOG} Failed to load tags:`, e);
        }
    }

    /**
     * Re-map processing tag IDs to match current allData order IDs.
     * Uses order Code (Mã ĐH) as cross-reference key — unique per order on TPOS.
     * Fixes the issue where order.Id changes between page loads.
     */
    function _ptagReconcileIds() {
        const allOrders = (typeof window.getAllOrders === 'function') ? window.getAllOrders() : [];
        if (allOrders.length === 0) return;

        const allDataIds = new Set(allOrders.map(o => String(o.Id)));
        const codeToTableId = new Map();
        allOrders.forEach(o => {
            if (o.Code) codeToTableId.set(String(o.Code), String(o.Id));
        });

        const remaps = [];
        for (const [orderId, data] of ProcessingTagState.getAllOrders()) {
            if (allDataIds.has(orderId)) continue; // Already matches
            const code = String(data.code || '');
            if (code && codeToTableId.has(code)) {
                const newId = codeToTableId.get(code);
                if (newId !== orderId) {
                    remaps.push({ oldId: orderId, newId, data });
                }
            }
        }

        for (const { oldId, newId, data } of remaps) {
            if (ProcessingTagState.hasOrder(newId)) continue;
            ProcessingTagState.removeOrder(oldId);
            ProcessingTagState.setOrderData(newId, data);
            saveProcessingTagToAPI(newId, data);
            clearProcessingTagAPI(oldId);
            console.log(`${PTAG_LOG} Re-mapped order: ${oldId} → ${newId} (Code: ${data.code})`);
        }

        if (remaps.length > 0) {
            console.log(`${PTAG_LOG} Reconciled ${remaps.length} order ID(s) by Code cross-reference`);
        }
    }

    async function saveProcessingTagToAPI(orderId, data) {
        const campaignId = ProcessingTagState._campaignId;
        if (!campaignId) return;
        try {
            const userName = window.authManager?.getAuthState()?.username || '';
            await _ptagFetch(
                `${PTAG_API_BASE}/${encodeURIComponent(campaignId)}/${encodeURIComponent(orderId)}`,
                { method: 'PUT', body: JSON.stringify({ data, updatedBy: userName }) }
            );
        } catch (e) {
            console.error(`${PTAG_LOG} Failed to save tag for ${orderId}:`, e);
        }
    }

    async function saveTTagDefinitions() {
        const data = { tTagDefinitions: ProcessingTagState.getTTagDefinitions() };
        await saveProcessingTagToAPI('__ttag_config__', data);
    }

    async function clearProcessingTagAPI(orderId) {
        const campaignId = ProcessingTagState._campaignId;
        if (!campaignId) return;
        try {
            await _ptagFetch(
                `${PTAG_API_BASE}/${encodeURIComponent(campaignId)}/${encodeURIComponent(orderId)}`,
                { method: 'DELETE' }
            );
        } catch (e) {
            console.error(`${PTAG_LOG} Failed to clear tag for ${orderId}:`, e);
        }
    }

    // SSE realtime listener
    function setupProcessingTagSSE(campaignId) {
        // Cleanup previous
        if (ProcessingTagState._sseSource) {
            ProcessingTagState._sseSource.close();
            ProcessingTagState._sseSource = null;
        }
        if (ProcessingTagState._pollInterval) {
            clearInterval(ProcessingTagState._pollInterval);
            ProcessingTagState._pollInterval = null;
        }

        const sseKey = 'processing_tags/' + campaignId;
        const sseUrl = `https://n2store-fallback.onrender.com/api/realtime/sse?keys=${encodeURIComponent(sseKey)}`;

        try {
            const source = new EventSource(sseUrl);
            ProcessingTagState._sseSource = source;

            source.addEventListener('update', (e) => {
                try {
                    const payload = JSON.parse(e.data);
                    const { orderId, data } = payload.data || payload;
                    if (orderId === '__ttag_config__' && data) {
                        ProcessingTagState.setTTagDefinitions(data.tTagDefinitions || []);
                        renderPanelContent();
                        return;
                    }
                    if (orderId && data) {
                        ProcessingTagState.setOrderData(orderId, data);
                        _ptagRefreshRow(orderId);
                        renderPanelContent();
                    }
                } catch (err) {
                    console.warn(`${PTAG_LOG} SSE parse error:`, err);
                }
            });

            source.addEventListener('deleted', (e) => {
                try {
                    const payload = JSON.parse(e.data);
                    const { orderId } = payload.data || payload;
                    if (orderId) {
                        ProcessingTagState.removeOrder(orderId);
                        _ptagRefreshRow(orderId);
                        renderPanelContent();
                    }
                } catch (err) {
                    console.warn(`${PTAG_LOG} SSE delete parse error:`, err);
                }
            });

            source.onerror = () => {
                console.warn(`${PTAG_LOG} SSE disconnected, falling back to polling`);
                source.close();
                ProcessingTagState._sseSource = null;
                _ptagStartPolling(campaignId);
            };

            console.log(`${PTAG_LOG} SSE connected for ${sseKey}`);
        } catch (e) {
            console.warn(`${PTAG_LOG} SSE failed, using polling:`, e);
            _ptagStartPolling(campaignId);
        }
    }

    function _ptagStartPolling(campaignId) {
        if (ProcessingTagState._pollInterval) return;
        ProcessingTagState._pollInterval = setInterval(() => {
            loadProcessingTags(campaignId);
        }, 15000);
        console.log(`${PTAG_LOG} Polling started (15s interval)`);
    }

    function _ptagRefreshRow(orderId) {
        // Re-render the processing tag cell for this order in the table
        const row = document.querySelector(`tr[data-order-id="${orderId}"]`);
        if (!row) return;
        const cell = row.querySelector('td[data-column="processing-tag"]');
        if (!cell) return;
        const order = ((typeof window.getAllOrders === 'function') ? window.getAllOrders() : []).find(o => o.Id === orderId);
        cell.innerHTML = renderProcessingTagCell(orderId, order?.Code || '');
    }

    function _ptagRefreshAllRows() {
        // Re-render all visible processing tag cells after bulk load
        const cells = document.querySelectorAll('td[data-column="processing-tag"]');
        cells.forEach(cell => {
            const row = cell.closest('tr');
            if (!row) return;
            const orderId = row.getAttribute('data-order-id');
            if (!orderId) return;
            const order = ((typeof window.getAllOrders === 'function') ? window.getAllOrders() : []).find(o => o.Id === orderId);
            cell.innerHTML = renderProcessingTagCell(orderId, order?.Code || '');
        });
    }

    // =====================================================
    // SECTION 4: CORE BUSINESS LOGIC
    // =====================================================

    async function assignOrderCategory(orderId, category, options = {}) {
        const existingData = ProcessingTagState.getOrderData(orderId);
        // Preserve existing flags when changing category
        const existingFlags = existingData?.flags || [];
        const newFlags = options.flags || [];
        const data = {
            category,
            subTag: options.subTag || null,
            subState: null,
            flags: [...new Set([...existingFlags, ...newFlags])],
            tTags: existingData?.tTags ? [...existingData.tTags] : [],
            note: options.note || '',
            assignedAt: Date.now(),
            previousPosition: null
        };

        // Category 1 (CHỜ ĐI ĐƠN): auto-detect sub-state + flags
        if (category === PTAG_CATEGORIES.CHO_DI_DON) {
            // Auto sub-state from internal tTags
            data.subState = data.tTags.length > 0 ? 'CHO_HANG' : 'OKIE_CHO_DI_DON';

            // Auto-detect flags from wallet
            const phone = _ptagGetOrderPhone(orderId);
            if (phone) {
                const autoFlags = await autoDetectFlags(orderId, phone);
                data.flags = [...new Set([...data.flags, ...autoFlags])];
            }
        }

        // Preserve history from existing data
        data.history = existingData?.history || [];

        _ptagEnsureCode(orderId, data);
        ProcessingTagState.setOrderData(orderId, data);

        // Log history
        const catValue = `${category}:${options.subTag || ''}`;
        _ptagAddHistory(orderId, 'SET_CATEGORY', catValue);
        // Log auto-detected flags
        if (category === PTAG_CATEGORIES.CHO_DI_DON) {
            const autoFlags = data.flags.filter(f => !existingFlags.includes(f) && !newFlags.includes(f));
            autoFlags.forEach(f => _ptagAddHistory(orderId, 'ADD_FLAG', f, 'Hệ thống'));
        }

        _ptagRefreshRow(orderId);
        renderPanelContent();
        await saveProcessingTagToAPI(orderId, data);
    }

    async function autoDetectFlags(orderId, phone) {
        const existingFlags = ProcessingTagState.getOrderFlags(orderId);
        const newFlags = [];

        // 1. Wallet → CK + Công nợ
        try {
            const wallet = window.WalletIntegration?.getWallet
                ? await window.WalletIntegration.getWallet(phone)
                : null;
            if (wallet?.balance > 0 && !existingFlags.includes('CHUYEN_KHOAN')) {
                newFlags.push('CHUYEN_KHOAN');
            }
            if (wallet?.virtual_balance > 0 && !existingFlags.includes('TRU_CONG_NO')) {
                newFlags.push('TRU_CONG_NO');
            }
        } catch (e) {
            console.warn(`${PTAG_LOG} Wallet check failed for ${phone}:`, e);
        }

        // 2. Order Discount → Giảm giá
        try {
            const order = ((typeof window.getAllOrders === 'function') ? window.getAllOrders() : []).find(o => o.Id === orderId);
            if (order && parseFloat(order.Discount || 0) > 0 && !existingFlags.includes('GIAM_GIA')) {
                newFlags.push('GIAM_GIA');
            }
        } catch (e) {
            console.warn(`${PTAG_LOG} Discount check failed:`, e);
        }

        return newFlags;
    }

    async function toggleOrderFlag(orderId, flagKey) {
        let data = ProcessingTagState.getOrderData(orderId);
        // If no data yet, create a minimal entry with just flags (no category)
        if (!data) {
            data = { category: null, subTag: null, subState: null, flags: [], tTags: [], note: '', assignedAt: Date.now() };
        }

        const flags = data.flags || [];
        const idx = flags.indexOf(flagKey);
        const isAdding = idx < 0;
        if (idx >= 0) {
            flags.splice(idx, 1);
        } else {
            flags.push(flagKey);
        }
        data.flags = flags;

        _ptagEnsureCode(orderId, data);
        ProcessingTagState.setOrderData(orderId, data);
        _ptagAddHistory(orderId, isAdding ? 'ADD_FLAG' : 'REMOVE_FLAG', flagKey);
        _ptagRefreshRow(orderId);
        renderPanelContent();
        await saveProcessingTagToAPI(orderId, data);
    }

    async function clearProcessingTag(orderId) {
        _ptagAddHistory(orderId, 'REMOVE_CATEGORY', '');
        ProcessingTagState.removeOrder(orderId);
        _ptagRefreshRow(orderId);
        renderPanelContent();
        await clearProcessingTagAPI(orderId);
    }

    // T-tag assignment functions — works for ANY order state
    async function assignTTagToOrder(orderId, tagId) {
        let data = ProcessingTagState.getOrderData(orderId);
        if (!data) {
            // Create minimal data for orders without processing tag
            data = { tTags: [] };
        }
        const tTags = data.tTags || [];
        if (!tTags.includes(tagId)) tTags.push(tagId);
        data.tTags = tTags;
        // Auto sub-state ONLY when at Cat 1 "Okie Chờ Đi Đơn"
        if (data.category === PTAG_CATEGORIES.CHO_DI_DON && data.subState === 'OKIE_CHO_DI_DON') {
            data.subState = 'CHO_HANG';
        }
        _ptagEnsureCode(orderId, data);
        ProcessingTagState.setOrderData(orderId, data);
        _ptagAddHistory(orderId, 'ADD_TTAG', tagId);
        _ptagRefreshRow(orderId);
        renderPanelContent();
        await saveProcessingTagToAPI(orderId, data);
    }

    async function removeTTagFromOrder(orderId, tagId) {
        const data = ProcessingTagState.getOrderData(orderId);
        if (!data) return;
        data.tTags = (data.tTags || []).filter(t => t !== tagId);
        // Auto sub-state ONLY when at Cat 1 "Chờ Hàng" and all T-tags removed
        if (data.category === PTAG_CATEGORIES.CHO_DI_DON && data.subState === 'CHO_HANG' && data.tTags.length === 0) {
            data.subState = 'OKIE_CHO_DI_DON';
        }
        _ptagEnsureCode(orderId, data);
        ProcessingTagState.setOrderData(orderId, data);
        _ptagAddHistory(orderId, 'REMOVE_TTAG', tagId);
        _ptagRefreshRow(orderId);
        renderPanelContent();
        await saveProcessingTagToAPI(orderId, data);
    }

    // DEPRECATED — T-tags now managed internally, not from TPOS
    // Kept as no-op to avoid breaking call sites in tab1-tags.js
    function onPtagOrderTagsChanged(orderId, newTags) {
        // no-op
    }

    // Auto transition: bill created → HOÀN TẤT
    function onPtagBillCreated(saleOnlineId) {
        const data = ProcessingTagState.getOrderData(saleOnlineId);
        if (!data) return;

        const snapshot = {
            category: data.category,
            subTag: data.subTag,
            subState: data.subState,
            flags: [...(data.flags || [])],
            tTags: [...(data.tTags || [])],
            note: data.note
        };

        const newData = {
            category: PTAG_CATEGORIES.HOAN_TAT,
            subTag: null,
            subState: null,
            flags: [],
            tTags: [],
            note: '',
            assignedAt: Date.now(),
            previousPosition: snapshot,
            history: data.history || []
        };

        ProcessingTagState.setOrderData(saleOnlineId, newData);
        _ptagAddHistory(saleOnlineId, 'AUTO_HOAN_TAT', '', 'Hệ thống');
        _ptagRefreshRow(saleOnlineId);
        renderPanelContent();
        saveProcessingTagToAPI(saleOnlineId, newData);
    }

    // Auto rollback: bill cancelled → restore previous position
    function onPtagBillCancelled(saleOnlineId) {
        const data = ProcessingTagState.getOrderData(saleOnlineId);
        if (!data?.previousPosition) return;

        const prev = data.previousPosition;
        const restored = {
            category: prev.category,
            subTag: prev.subTag,
            subState: prev.subState,
            flags: prev.flags || [],
            tTags: prev.tTags || [],
            note: prev.note || '',
            assignedAt: Date.now(),
            previousPosition: null,
            history: data.history || []
        };

        ProcessingTagState.setOrderData(saleOnlineId, restored);
        _ptagAddHistory(saleOnlineId, 'AUTO_ROLLBACK', '', 'Hệ thống');
        _ptagRefreshRow(saleOnlineId);
        renderPanelContent();
        saveProcessingTagToAPI(saleOnlineId, restored);
    }

    // Helpers
    function _ptagGetOrderPhone(orderId) {
        const order = ((typeof window.getAllOrders === 'function') ? window.getAllOrders() : []).find(o => o.Id === orderId);
        return order?.Telephone || order?.Phone || '';
    }

    /** Inject order Code into data before saving (for cross-referencing after reload) */
    function _ptagEnsureCode(orderId, data) {
        if (!data.code) {
            const order = ((typeof window.getAllOrders === 'function') ? window.getAllOrders() : []).find(o => String(o.Id) === String(orderId));
            if (order?.Code) data.code = order.Code;
        }
    }

    // =====================================================
    // SECTION 5: UI — TABLE CELL RENDERING
    // =====================================================

    function renderProcessingTagCell(orderId, orderCode) {
        const data = ProcessingTagState.getOrderData(orderId);

        // Buttons row: [🏷 tags] [⏰ wait] [✓ ok] — identical to TPOS tag column
        const btns = `<div class="ptag-cell-buttons">` +
            `<button class="ptag-tag-btn" onclick="window._ptagOpenDropdown('${orderId}', '${orderCode}', this); event.stopPropagation();" title="Chọn trạng thái"><i class="fas fa-tags"></i></button>` +
            `<button class="ptag-quick-btn ptag-quick-btn--wait" onclick="window._ptagQuickAssign('${orderId}', 'wait'); event.stopPropagation();" title="Đơn chưa phản hồi"><i class="fas fa-clock"></i></button>` +
            `<button class="ptag-quick-btn ptag-quick-btn--ok" onclick="window._ptagQuickAssign('${orderId}', 'ok'); event.stopPropagation();" title="Okie Chờ Đi Đơn"><i class="fas fa-check"></i></button>` +
            `</div>`;

        if (!data) {
            return `<div class="ptag-cell">${btns}</div>`;
        }

        // Build badges: tag xử lý → flags → tTags (display priority order)
        // All badges have × button for quick removal
        let badges = '';
        const oid = orderId; // shorthand for onclick

        // 1. Category badge (tag xử lý) — FIRST — with × to remove
        if (data.category !== null && data.category !== undefined) {
            const catColor = PTAG_CATEGORY_COLORS[data.category];
            const removeBtn = `<button class="ptag-badge-remove" onclick="window._ptagClear('${oid}'); event.stopPropagation();" title="Xóa tag">&times;</button>`;
            if (data.category === PTAG_CATEGORIES.HOAN_TAT) {
                badges += `<span class="ptag-badge ptag-cat-0 ptag-badge-removable">🟢 Hoàn tất${removeBtn}</span>`;
            } else if (data.category === PTAG_CATEGORIES.CHO_DI_DON) {
                const ss = PTAG_SUBSTATES[data.subState] || PTAG_SUBSTATES.OKIE_CHO_DI_DON;
                badges += `<span class="ptag-badge ptag-badge-removable" style="border-color:${ss.color};color:${ss.color};background:${ss.color}12;">${ss.label}${removeBtn}</span>`;
            } else {
                const subTagDef = PTAG_SUBTAGS[data.subTag];
                const label = subTagDef?.label || PTAG_CATEGORY_META[data.category]?.short || '';
                badges += `<span class="ptag-badge ptag-badge-removable" style="border-color:${catColor.border};color:${catColor.text};background:${catColor.bg};">${label}${removeBtn}</span>`;
            }
        }

        // 2. Flag badges (đặc điểm) — SECOND — with × to remove
        (data.flags || []).forEach(f => {
            const fl = PTAG_FLAGS[f];
            const label = fl ? fl.label : (ProcessingTagState._customFlags?.get(f)?.label || f);
            const removeBtn = `<button class="ptag-badge-remove" onclick="window._ptagToggleFlag('${oid}', '${f}'); event.stopPropagation();" title="Xóa flag">&times;</button>`;
            badges += `<span class="ptag-flag-badge ptag-badge-removable">${label}${removeBtn}</span>`;
        });

        // 3. T-tag badges — LAST — FULL display with × to remove
        const _tTags = data.tTags || [];
        _tTags.forEach(t => {
            const tLabel = ProcessingTagState.getTTagLabel(t);
            const removeBtn = `<button class="ptag-badge-remove" onclick="window.removeTTagFromOrder('${oid}', '${t.replace(/'/g, "\\'")}'); event.stopPropagation();" title="Gỡ tag T">&times;</button>`;
            badges += `<span class="ptag-ttag-badge ptag-badge-removable">${tLabel}${removeBtn}</span>`;
        });

        // History button (only when there's history)
        const hasHistory = (data.history || []).length > 0;
        const historyBtn = hasHistory ? `<button class="ptag-history-btn" onclick="window._ptagShowHistory('${oid}', this); event.stopPropagation();" title="Xem lịch sử tag"><i class="fas fa-history"></i></button>` : '';

        const badgesRow = badges ? `<div class="ptag-cell-badges">${badges}${historyBtn}</div>` : '';
        return `<div class="ptag-cell">${btns}${badgesRow}</div>`;
    }

    // =====================================================
    // SECTION 6: UI — DROPDOWN
    // =====================================================

    let _currentDropdown = null;
    let _ddOrderId = null;

    // Build the full list of all tags for the dropdown (flat, grouped by category)
    function _ptagBuildAllTags() {
        const tags = [];
        // Cat 1 — CHỜ ĐI ĐƠN
        tags.push({ type: 'cat-label', label: `${PTAG_CATEGORY_META[1].emoji} CHỜ ĐI ĐƠN` });
        tags.push({ type: 'tag', key: 'cat:1:null', label: 'Okie Chờ Đi Đơn', isCat: true, cat: 1, subTag: null, color: PTAG_CATEGORY_COLORS[1].border });
        // T-tag button
        tags.push({ type: 'tag', key: 'ttag-btn', label: '📦 Tag T Chờ Hàng', isTTagBtn: true, color: '#8b5cf6' });
        // Cat 2 — XỬ LÝ
        tags.push({ type: 'cat-label', label: `${PTAG_CATEGORY_META[2].emoji} MỤC XỬ LÝ` });
        for (const [key, st] of Object.entries(PTAG_SUBTAGS)) {
            if (st.category !== 2) continue;
            tags.push({ type: 'tag', key: `cat:2:${key}`, label: st.label, isCat: true, cat: 2, subTag: key, color: PTAG_CATEGORY_COLORS[2].border });
        }
        // Cat 3 — KHÔNG CẦN CHỐT
        tags.push({ type: 'cat-label', label: `${PTAG_CATEGORY_META[3].emoji} KHÔNG CẦN CHỐT` });
        for (const [key, st] of Object.entries(PTAG_SUBTAGS)) {
            if (st.category !== 3) continue;
            tags.push({ type: 'tag', key: `cat:3:${key}`, label: st.label, isCat: true, cat: 3, subTag: key, color: PTAG_CATEGORY_COLORS[3].border });
        }
        // Cat 4 — KHÁCH XÃ
        tags.push({ type: 'cat-label', label: `${PTAG_CATEGORY_META[4].emoji} KHÁCH XÃ SAU CHỐT` });
        for (const [key, st] of Object.entries(PTAG_SUBTAGS)) {
            if (st.category !== 4) continue;
            tags.push({ type: 'tag', key: `cat:4:${key}`, label: st.label, isCat: true, cat: 4, subTag: key, color: PTAG_CATEGORY_COLORS[4].border });
        }
        // Cat 0 — HOÀN TẤT
        tags.push({ type: 'cat-label', label: `${PTAG_CATEGORY_META[0].emoji} HOÀN TẤT` });
        tags.push({ type: 'tag', key: 'cat:0:null', label: 'Hoàn tất — Đã ra đơn', isCat: true, cat: 0, subTag: null, color: PTAG_CATEGORY_COLORS[0].border });
        // Flags — ĐẶC ĐIỂM ĐƠN HÀNG
        tags.push({ type: 'cat-label', label: '🏷️ ĐẶC ĐIỂM ĐƠN HÀNG' });
        for (const [key, flag] of Object.entries(PTAG_FLAGS)) {
            tags.push({ type: 'tag', key: `flag:${key}`, label: `${flag.icon} ${flag.label}`, isFlag: true, flagKey: key, color: '#7c3aed', auto: flag.auto });
        }
        // Custom flags
        const customFlags = ProcessingTagState._customFlags;
        if (customFlags && customFlags.size > 0) {
            for (const [key, cf] of customFlags) {
                tags.push({ type: 'tag', key: `flag:${key}`, label: cf.label, isFlag: true, flagKey: key, color: cf.color || '#7c3aed' });
            }
        }
        return tags;
    }

    // Get pill color for a selected tag
    function _ptagPillColor(tagInfo) {
        if (tagInfo.isCat) return tagInfo.color;
        if (tagInfo.isFlag) return '#7c3aed';
        return '#6b7280';
    }

    // Get all currently selected tags for an order as tag-info objects
    function _ptagGetSelectedTags(orderId) {
        const data = ProcessingTagState.getOrderData(orderId);
        if (!data) return [];
        const selected = [];
        // Category tag
        if (data.category !== null && data.category !== undefined) {
            const catColor = PTAG_CATEGORY_COLORS[data.category];
            if (data.category === PTAG_CATEGORIES.CHO_DI_DON) {
                selected.push({ key: 'cat:1:null', label: 'Okie Chờ Đi Đơn', isCat: true, cat: 1, subTag: null, color: catColor.border });
            } else if (data.category === PTAG_CATEGORIES.HOAN_TAT) {
                selected.push({ key: 'cat:0:null', label: 'Hoàn tất', isCat: true, cat: 0, subTag: null, color: catColor.border });
            } else {
                const st = PTAG_SUBTAGS[data.subTag];
                const label = st?.label || PTAG_CATEGORY_META[data.category]?.short || '';
                selected.push({ key: `cat:${data.category}:${data.subTag}`, label, isCat: true, cat: data.category, subTag: data.subTag, color: catColor.border });
            }
        }
        // Flags
        (data.flags || []).forEach(f => {
            const fl = PTAG_FLAGS[f];
            if (fl) {
                selected.push({ key: `flag:${f}`, label: `${fl.icon} ${fl.label}`, isFlag: true, flagKey: f, color: '#7c3aed' });
            } else {
                const cf = ProcessingTagState._customFlags?.get(f);
                if (cf) selected.push({ key: `flag:${f}`, label: cf.label, isFlag: true, flagKey: f, color: cf.color || '#7c3aed' });
            }
        });
        return selected;
    }

    function _ptagOpenDropdown(orderId, orderCode, anchorEl) {
        _ptagCloseDropdown();

        const rect = anchorEl.getBoundingClientRect();
        _ddOrderId = orderId;
        const allTags = _ptagBuildAllTags();
        const selectedTags = _ptagGetSelectedTags(orderId);
        const selectedKeys = new Set(selectedTags.map(t => t.key));

        // Build HTML
        let html = `<div class="ptag-dropdown" id="ptag-dropdown" data-order-id="${orderId}">`;

        // Input container: pills + search input
        html += `<div class="ptag-dd-input-container">`;
        selectedTags.forEach(t => {
            html += `<span class="ptag-dd-pill" style="background:${_ptagPillColor(t)};" data-key="${t.key}">${t.label} <button onclick="window._ptagDdRemovePill('${t.key}'); event.stopPropagation();">&times;</button></span>`;
        });
        html += `<input type="text" class="ptag-dd-input" id="ptag-dd-input" placeholder="Tìm tag..." />`;
        html += `</div>`;

        // Tag list (scrollable, filterable)
        html += `<div class="ptag-dd-list">`;
        for (const tag of allTags) {
            if (tag.type === 'cat-label') {
                html += `<div class="ptag-dd-cat-label">${tag.label}</div>`;
            } else {
                const isSelected = selectedKeys.has(tag.key);
                const cls = isSelected ? 'selected' : '';
                const autoLabel = tag.auto ? ' <span class="ptag-auto-badge">auto</span>' : '';
                html += `<div class="ptag-dd-tag-item ${cls}" data-key="${tag.key}" data-search="${_ptagNormalize(tag.label)}">${tag.label}${autoLabel}</div>`;
            }
        }
        html += `</div></div>`;

        // Insert dropdown
        const wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        const ddEl = wrapper.firstElementChild;
        document.body.appendChild(ddEl);

        // Position
        const ddRect = ddEl.getBoundingClientRect();
        let top = rect.bottom + 4;
        let left = rect.left;
        if (top + ddRect.height > window.innerHeight) top = rect.top - ddRect.height - 4;
        if (left + ddRect.width > window.innerWidth) left = window.innerWidth - ddRect.width - 8;
        ddEl.style.top = top + 'px';
        ddEl.style.left = Math.max(4, left) + 'px';

        _currentDropdown = ddEl;

        // Auto-focus search input
        const input = ddEl.querySelector('#ptag-dd-input');
        if (input) {
            setTimeout(() => input.focus(), 50);
            input.addEventListener('input', () => _ptagFilterDropdown(input.value));
            input.addEventListener('keydown', _ptagDdKeydown);
        }

        // Click on tag items
        ddEl.querySelectorAll('.ptag-dd-tag-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const key = item.dataset.key;
                _ptagDdSelectTag(key);
            });
        });

        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', _ptagCloseOnOutside);
            document.addEventListener('keydown', _ptagCloseOnEsc);
        }, 10);
    }

    // Select a tag from dropdown
    function _ptagDdSelectTag(key) {
        const orderId = _ddOrderId;
        if (!orderId) return;

        if (key === 'ttag-btn') {
            _ptagCloseDropdown();
            _ptagOpenTTagModal(orderId);
            return;
        }

        if (key.startsWith('cat:')) {
            // Processing tag — parse cat:N:subTag
            const parts = key.split(':');
            const cat = parseInt(parts[1]);
            const subTag = parts[2] === 'null' ? null : parts[2];
            // This replaces any existing processing tag (implicit rule)
            assignOrderCategory(orderId, cat, { subTag });
        } else if (key.startsWith('flag:')) {
            const flagKey = key.replace('flag:', '');
            toggleOrderFlag(orderId, flagKey);
        }

        // Refresh dropdown pills and selected state (don't close — TPOS style)
        _ptagRefreshDropdownState();
    }

    // Remove a pill from dropdown
    function _ptagDdRemovePill(key) {
        const orderId = _ddOrderId;
        if (!orderId) return;

        if (key.startsWith('cat:')) {
            // Remove processing tag = clear category
            clearProcessingTag(orderId);
        } else if (key.startsWith('flag:')) {
            const flagKey = key.replace('flag:', '');
            toggleOrderFlag(orderId, flagKey);
        }

        _ptagRefreshDropdownState();
    }

    // Refresh pills and selected states in open dropdown
    function _ptagRefreshDropdownState() {
        const dd = _currentDropdown;
        if (!dd) return;
        const orderId = _ddOrderId;
        const selectedTags = _ptagGetSelectedTags(orderId);
        const selectedKeys = new Set(selectedTags.map(t => t.key));

        // Refresh pills
        const container = dd.querySelector('.ptag-dd-input-container');
        const input = dd.querySelector('#ptag-dd-input');
        if (container && input) {
            // Remove old pills
            container.querySelectorAll('.ptag-dd-pill').forEach(p => p.remove());
            // Insert new pills before input
            selectedTags.forEach(t => {
                const pill = document.createElement('span');
                pill.className = 'ptag-dd-pill';
                pill.style.background = _ptagPillColor(t);
                pill.dataset.key = t.key;
                pill.innerHTML = `${t.label} <button onclick="window._ptagDdRemovePill('${t.key}'); event.stopPropagation();">&times;</button>`;
                container.insertBefore(pill, input);
            });
        }

        // Refresh selected class on items
        dd.querySelectorAll('.ptag-dd-tag-item').forEach(item => {
            item.classList.toggle('selected', selectedKeys.has(item.dataset.key));
        });
    }

    // Keyboard handler for dropdown input
    function _ptagDdKeydown(e) {
        const dd = _currentDropdown;
        if (!dd) return;
        const input = dd.querySelector('#ptag-dd-input');

        if (e.key === 'Enter') {
            e.preventDefault();
            // Select highlighted item
            const highlighted = dd.querySelector('.ptag-dd-tag-item.highlighted');
            if (highlighted) {
                _ptagDdSelectTag(highlighted.dataset.key);
                if (input) input.value = '';
                _ptagFilterDropdown('');
            } else if (input && input.value.trim()) {
                // No match — create custom tag
                _ptagCreateCustomTag(input.value.trim());
                input.value = '';
                _ptagFilterDropdown('');
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            _ptagDdMoveHighlight(1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            _ptagDdMoveHighlight(-1);
        } else if (e.key === 'Backspace' && input && !input.value) {
            // Backspace on empty input → pending delete last pill, then delete on 2nd press
            const pills = dd.querySelectorAll('.ptag-dd-pill');
            if (pills.length > 0) {
                const lastPill = pills[pills.length - 1];
                if (lastPill.classList.contains('deletion-pending')) {
                    // 2nd backspace — remove
                    const key = lastPill.dataset.key;
                    _ptagDdRemovePill(key);
                } else {
                    // 1st backspace — mark pending
                    lastPill.classList.add('deletion-pending');
                }
            }
        }
    }

    // Move highlight up/down in tag list
    function _ptagDdMoveHighlight(dir) {
        const dd = _currentDropdown;
        if (!dd) return;
        const items = [...dd.querySelectorAll('.ptag-dd-tag-item')].filter(i => i.style.display !== 'none');
        if (!items.length) return;
        const current = dd.querySelector('.ptag-dd-tag-item.highlighted');
        let idx = current ? items.indexOf(current) : -1;
        if (current) current.classList.remove('highlighted');
        idx += dir;
        if (idx < 0) idx = items.length - 1;
        if (idx >= items.length) idx = 0;
        items[idx].classList.add('highlighted');
        items[idx].scrollIntoView({ block: 'nearest' });
    }

    // Create custom tag from search input
    function _ptagCreateCustomTag(label) {
        const orderId = _ddOrderId;
        if (!orderId) return;
        const key = 'CUSTOM_' + Date.now();
        if (!ProcessingTagState._customFlags) ProcessingTagState._customFlags = new Map();
        ProcessingTagState._customFlags.set(key, { label, color: '#7c3aed' });
        // Toggle this flag onto the order
        toggleOrderFlag(orderId, key);
        // Save custom flags config to API
        _ptagSaveCustomFlags();
        _ptagRefreshDropdownState();
    }

    // Save custom flags config to API (persisted under __ptag_custom_flags__)
    async function _ptagSaveCustomFlags() {
        const customFlags = ProcessingTagState._customFlags;
        if (!customFlags) return;
        const data = { customFlags: Object.fromEntries(customFlags) };
        await saveProcessingTagToAPI('__ptag_custom_flags__', data);
    }

    function _ptagCloseDropdown() {
        if (_currentDropdown) {
            _currentDropdown.remove();
            _currentDropdown = null;
        }
        _ddOrderId = null;
        document.removeEventListener('click', _ptagCloseOnOutside);
        document.removeEventListener('keydown', _ptagCloseOnEsc);
    }

    function _ptagCloseOnOutside(e) {
        if (_currentDropdown && !_currentDropdown.contains(e.target)) {
            _ptagCloseDropdown();
        }
    }

    function _ptagCloseOnEsc(e) {
        if (e.key === 'Escape') _ptagCloseDropdown();
    }

    function _ptagFilterDropdown(query) {
        const norm = _ptagNormalize(query);
        const dd = document.getElementById('ptag-dropdown');
        if (!dd) return;

        // Remove pending delete from pills when typing
        dd.querySelectorAll('.ptag-dd-pill.deletion-pending').forEach(p => p.classList.remove('deletion-pending'));

        const list = dd.querySelector('.ptag-dd-list');
        if (!list) return;

        let firstVisible = null;
        let currentCatLabel = null;
        let catHasVisibleItem = false;

        // First pass: show/hide tag items
        list.querySelectorAll('.ptag-dd-cat-label, .ptag-dd-tag-item').forEach(el => {
            if (el.classList.contains('ptag-dd-cat-label')) {
                // Before moving to next cat, apply visibility to previous cat label
                if (currentCatLabel) {
                    currentCatLabel.style.display = catHasVisibleItem ? '' : 'none';
                }
                currentCatLabel = el;
                catHasVisibleItem = false;
            } else {
                el.classList.remove('highlighted');
                const search = el.dataset.search || '';
                const match = !norm || search.includes(norm);
                el.style.display = match ? '' : 'none';
                if (match) {
                    catHasVisibleItem = true;
                    if (!firstVisible) firstVisible = el;
                }
            }
        });
        // Handle last category label
        if (currentCatLabel) {
            currentCatLabel.style.display = catHasVisibleItem ? '' : 'none';
        }

        // Highlight first visible item
        if (firstVisible) {
            firstVisible.classList.add('highlighted');
        }
    }

    function _ptagAssign(orderId, category, subTag) {
        assignOrderCategory(orderId, category, { subTag });
    }

    function _ptagToggleFlag(orderId, flagKey) {
        toggleOrderFlag(orderId, flagKey);
    }

    function _ptagClear(orderId) {
        clearProcessingTag(orderId);
    }

    // =====================================================
    // SECTION 7: UI — PANEL (SIDEBAR)
    // =====================================================

    function _ptagQuickAssign(orderId, type) {
        if (type === 'ok') {
            assignOrderCategory(orderId, PTAG_CATEGORIES.CHO_DI_DON, { subTag: null });
        } else if (type === 'wait') {
            assignOrderCategory(orderId, PTAG_CATEGORIES.XU_LY, { subTag: 'CHUA_PHAN_HOI' });
        }
    }

    function initProcessingTagPanel() {
        let panel = document.getElementById('ptag-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'ptag-panel';
            panel.className = 'ptag-panel';
            document.body.appendChild(panel);
        }

        panel.innerHTML = `
            <div class="ptag-panel-header">
                <span class="ptag-panel-title">Chốt Đơn</span>
                <div class="ptag-panel-actions">
                    <button class="ptag-panel-btn" id="ptag-pin-btn" title="Ghim panel" onclick="window._ptagTogglePin()">
                        <i class="fas fa-thumbtack"></i>
                    </button>
                    <button class="ptag-panel-btn" title="Quản lý Tag T" onclick="window._ptagOpenTTagManager()" style="color:#7c3aed;">
                        <i class="fas fa-tags"></i>
                    </button>
                    <button class="ptag-panel-btn" id="ptag-bulk-btn" title="Gán hàng loạt" onclick="window._ptagOpenBulkModal()">
                        <i class="fas fa-layer-group"></i>
                    </button>
                    <button class="ptag-panel-btn" title="Đóng" onclick="window._ptagTogglePanel()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div class="ptag-panel-search">
                <input type="text" placeholder="Tìm trạng thái..." oninput="window._ptagFilterPanel(this.value)" />
            </div>
            <div class="ptag-panel-body" id="ptag-panel-body"></div>
        `;

        if (ProcessingTagState._panelPinned) {
            panel.classList.add('open', 'pinned');
            ProcessingTagState._panelOpen = true;
        }

        renderPanelContent();
    }

    function _tooltipHtml(key) {
        const text = PTAG_TOOLTIPS[key];
        if (!text) return '';
        return `<span class="ptag-tooltip-trigger" data-tooltip="${text.replace(/"/g, '&quot;')}" onclick="event.stopPropagation();">?</span>`;
    }

    function renderPanelContent() {
        const body = document.getElementById('ptag-panel-body');
        if (!body) return;

        const allOrders = (typeof window.getAllOrders === 'function') ? window.getAllOrders() : [];
        const taggedOrders = ProcessingTagState.getAllOrders();
        const totalOrders = allOrders.length;

        // Only count tagged orders that exist in current allData
        const allDataIds = new Set(allOrders.map(o => String(o.Id)));
        let taggedCount = 0;
        const catCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
        const subStateCounts = {};
        const flagCounts = {};
        const subTagCounts = {};
        const tTagCounts = {};

        for (const [orderId, data] of taggedOrders) {
            if (!allDataIds.has(orderId)) continue; // Skip stale/mismatched IDs
            taggedCount++;

            catCounts[data.category] = (catCounts[data.category] || 0) + 1;

            if (data.category === PTAG_CATEGORIES.CHO_DI_DON) {
                // Derive subState from tTags (source of truth) for accurate counting
                const ss = (data.tTags || []).length > 0 ? 'CHO_HANG' : 'OKIE_CHO_DI_DON';
                subStateCounts[ss] = (subStateCounts[ss] || 0) + 1;
            }
            // Count flags for ALL orders (flags are independent of category)
            (data.flags || []).forEach(f => {
                flagCounts[f] = (flagCounts[f] || 0) + 1;
            });
            if (data.subTag) {
                subTagCounts[data.subTag] = (subTagCounts[data.subTag] || 0) + 1;
            }
        }

        const untaggedCount = totalOrders - taggedCount;

        // Count T-tags from internal processing tag data
        for (const [orderId, data] of taggedOrders) {
            if (!allDataIds.has(orderId)) continue;
            if (data.tTags) {
                for (const tagId of data.tTags) {
                    tTagCounts[tagId] = (tTagCounts[tagId] || 0) + 1;
                }
            }
        }

        const activeFilter = ProcessingTagState._activeFilter;
        const activeFlagFilters = ProcessingTagState._activeFlagFilters;

        let html = '';

        // --- Special filters: TẤT CẢ & CHƯA GÁN TAG ---
        html += `<div class="ptag-panel-card ${activeFilter === null && activeFlagFilters.size === 0 ? 'active' : ''}" onclick="window._ptagSetFilter(null)" data-search="tat ca">
            <div class="ptag-panel-card-icon" style="background:#6b7280;">
                <i class="fas fa-globe" style="color:#fff;font-size:14px;"></i>
            </div>
            <div class="ptag-panel-card-info">
                <div class="ptag-panel-card-name">TẤT CẢ</div>
                <div class="ptag-panel-card-count">${totalOrders} đơn hàng</div>
            </div>
        </div>`;
        html += `<div class="ptag-panel-card ${activeFilter === '__no_tag__' ? 'active' : ''}" onclick="window._ptagSetFilter('__no_tag__')" data-search="chua gan tag">
            <div class="ptag-panel-card-icon" style="background:#d1d5db;">
                <i class="fas fa-tag" style="color:#6b7280;font-size:14px;"></i>
            </div>
            <div class="ptag-panel-card-info">
                <div class="ptag-panel-card-name">CHƯA GÁN TAG</div>
                <div class="ptag-panel-card-count">${untaggedCount} đơn hàng</div>
            </div>
        </div>`;

        // --- Category 0 — HOÀN TẤT ---
        html += `<div class="ptag-panel-card ${activeFilter === 'cat_0' ? 'active' : ''}" onclick="window._ptagSetFilter('cat_0')" data-search="${_ptagNormalize(PTAG_CATEGORY_META[0].name)}">
            <div class="ptag-panel-card-icon" style="background:${PTAG_CATEGORY_COLORS[0].border};">
                <i class="fas ${PTAG_CATEGORY_META[0].icon}" style="color:#fff;font-size:14px;"></i>
            </div>
            <div class="ptag-panel-card-info">
                <div class="ptag-panel-card-name">${PTAG_CATEGORY_META[0].emoji} ${PTAG_CATEGORY_META[0].name}</div>
                <div class="ptag-panel-card-count">${catCounts[0]} đơn hàng</div>
            </div>
            ${_tooltipHtml('cat_0')}
        </div>`;

        // --- Category 1 — CHỜ ĐI ĐƠN + sub-states ---
        html += `<div class="ptag-panel-group" data-search="cho di don oke okie cho hang">
            <div class="ptag-panel-cat-header-v2 ${activeFilter === 'cat_1' ? 'active' : ''}" style="border-left-color:${PTAG_CATEGORY_COLORS[1].border};background:${PTAG_CATEGORY_COLORS[1].bg};" onclick="window._ptagSetFilter('cat_1')">
                <span class="ptag-cat-name" style="color:${PTAG_CATEGORY_COLORS[1].text};">${PTAG_CATEGORY_META[1].emoji} ${PTAG_CATEGORY_META[1].name}</span>
                <span class="ptag-cat-count">${catCounts[1]}</span>
                ${_tooltipHtml('cat_1')}
            </div>`;

        // Sub-states as cards
        for (const [key, ss] of Object.entries(PTAG_SUBSTATES)) {
            const fk = 'sub_' + key;
            const ssIcon = key === 'OKIE_CHO_DI_DON' ? 'fa-check' : 'fa-hourglass-half';
            html += `<div class="ptag-panel-card ${activeFilter === fk ? 'active' : ''}" onclick="window._ptagSetFilter('${fk}')" data-search="${_ptagNormalize(ss.label)}">
                <div class="ptag-panel-card-icon" style="background:${ss.color};">
                    <i class="fas ${ssIcon}" style="color:#fff;font-size:13px;"></i>
                </div>
                <div class="ptag-panel-card-info">
                    <div class="ptag-panel-card-name">${ss.label}</div>
                    <div class="ptag-panel-card-count">${subStateCounts[key] || 0} đơn hàng</div>
                </div>
                ${_tooltipHtml(fk)}
            </div>`;
        }
        html += `</div>`;

        // --- ĐẶC ĐIỂM ĐƠN HÀNG (Flags) — Independent section ---
        html += `<div class="ptag-panel-group" data-search="dac diem don hang tru cong no ck giam gia cho live giu don qua lay khac">
            <div class="ptag-panel-cat-header-v2" style="border-left-color:#7c3aed;background:rgba(124,58,237,0.06);">
                <span class="ptag-cat-name" style="color:#5b21b6;">🏷️ ĐẶC ĐIỂM ĐƠN HÀNG</span>
            </div>`;
        for (const [key, flag] of Object.entries(PTAG_FLAGS)) {
            const fk = 'flag_' + key;
            const checked = activeFlagFilters.has(key) ? 'checked' : '';
            const count = flagCounts[key] || 0;
            html += `<div class="ptag-panel-flag-item" data-search="${_ptagNormalize(flag.label)}">
                <label class="ptag-flag-checkbox">
                    <input type="checkbox" ${checked} onchange="window._ptagToggleFlagFilter('${key}'); event.stopPropagation();" />
                    <span style="font-size:15px;flex-shrink:0;">${flag.icon}</span>
                    <span class="ptag-flag-label">${flag.label}</span>
                </label>
                <span class="ptag-panel-card-count">${count}</span>
                ${_tooltipHtml(fk)}
            </div>`;
        }
        html += `</div>`;

        // --- Categories 2, 3, 4 ---
        for (const cat of [2, 3, 4]) {
            const subtags = Object.entries(PTAG_SUBTAGS).filter(([, v]) => v.category === cat);
            const catColors = PTAG_CATEGORY_COLORS[cat];
            html += `<div class="ptag-panel-group" data-search="${_ptagNormalize(PTAG_CATEGORY_META[cat].name)}">
                <div class="ptag-panel-cat-header-v2 ${activeFilter === 'cat_' + cat ? 'active' : ''}" style="border-left-color:${catColors.border};background:${catColors.bg};" onclick="window._ptagSetFilter('cat_${cat}')">
                    <span class="ptag-cat-name" style="color:${catColors.text};">${PTAG_CATEGORY_META[cat].emoji} ${PTAG_CATEGORY_META[cat].name}</span>
                    <span class="ptag-cat-count">${catCounts[cat]}</span>
                    ${_tooltipHtml('cat_' + cat)}
                </div>`;
            for (const [key, st] of subtags) {
                const fk = 'subtag_' + key;
                const icon = PTAG_SUBTAG_ICONS[key] || '📋';
                html += `<div class="ptag-panel-card ${activeFilter === fk ? 'active' : ''}" onclick="window._ptagSetFilter('${fk}')" data-search="${_ptagNormalize(st.label)}">
                    <div class="ptag-panel-card-icon ptag-panel-card-icon--sm" style="background:${catColors.border};">
                        <span style="font-size:12px;">${icon}</span>
                    </div>
                    <div class="ptag-panel-card-info">
                        <div class="ptag-panel-card-name">${st.label}</div>
                        <div class="ptag-panel-card-count">${subTagCounts[key] || 0} đơn hàng</div>
                    </div>
                    ${_tooltipHtml(fk)}
                </div>`;
            }
            html += `</div>`;
        }

        // --- Tag T section ---
        const tTagDefs = ProcessingTagState.getTTagDefinitions();
        const totalTTagOrders = Object.values(tTagCounts).reduce((s, c) => s + c, 0);
        {
            html += `<div class="ptag-panel-group ptag-ttag-section" data-search="tag t cho hang">
                <div class="ptag-panel-cat-header-v2" style="border-left-color:#8b5cf6;background:rgba(139,92,246,0.08);">
                    <span class="ptag-cat-name" style="color:#5b21b6;">\u{1F4E6} TAG T CHỜ HÀNG (${totalTTagOrders} đơn)</span>
                    <span class="ptag-cat-count">${tTagDefs.length}</span>
                    <button class="ptag-panel-btn" style="display:inline-flex;width:20px;height:20px;font-size:10px;margin-left:4px;background:none;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;align-items:center;justify-content:center;" onclick="window._ptagOpenTTagManager(); event.stopPropagation();" title="Quản lý Tag T">
                        <i class="fas fa-cog" style="font-size:9px;color:#6b7280;"></i>
                    </button>
                </div>`;
            for (const def of tTagDefs) {
                const fk = 'ttag_' + def.id;
                const escapedFk = fk.replace(/'/g, "\\'");
                const count = tTagCounts[def.id] || 0;
                const pcLabel = def.productCode ? `<span style="color:#6b7280;font-size:11px;margin-left:4px;font-weight:500;">${def.productCode}</span>` : '';
                const deleteBtn = `<button class="ptag-ttag-panel-delete-v2" onclick="window._ptagDeleteTTagDefAndOrders('${escapedFk.replace('ttag_', '')}'); event.stopPropagation();" title="Xóa tag và gỡ khỏi tất cả đơn">&times;</button>`;
                html += `<div class="ptag-panel-card ${activeFilter === fk ? 'active' : ''}" onclick="window._ptagSetFilter('${escapedFk}')" data-search="${_ptagNormalize(def.name + ' ' + (def.productCode || ''))}">
                    <div class="ptag-panel-card-icon ptag-panel-card-icon--sm" style="background:#8b5cf6;">
                        <span style="font-size:12px;">\u{1F3F7}\uFE0F</span>
                    </div>
                    <div class="ptag-panel-card-info">
                        <div class="ptag-panel-card-name" style="color:#7c3aed;">${def.name}${pcLabel}</div>
                        <div class="ptag-panel-card-count">${count} đơn hàng</div>
                    </div>
                    ${deleteBtn}
                </div>`;
            }
            html += `</div>`;
        }

        body.innerHTML = html;
    }

    function _ptagTogglePanel() {
        const panel = document.getElementById('ptag-panel');
        if (!panel) return;
        ProcessingTagState._panelOpen = !ProcessingTagState._panelOpen;
        panel.classList.toggle('open', ProcessingTagState._panelOpen);
    }

    function _ptagTogglePin() {
        ProcessingTagState._panelPinned = !ProcessingTagState._panelPinned;
        localStorage.setItem('ptag_panel_pinned', JSON.stringify(ProcessingTagState._panelPinned));
        const panel = document.getElementById('ptag-panel');
        if (panel) panel.classList.toggle('pinned', ProcessingTagState._panelPinned);
        const btn = document.getElementById('ptag-pin-btn');
        if (btn) btn.classList.toggle('active', ProcessingTagState._panelPinned);
    }

    let _ptagFilterTimer = null;

    function _ptagSetFilter(filterKey) {
        ProcessingTagState._activeFilter = filterKey;
        // Only clear flag filters when resetting to "TẤT CẢ" (null)
        // Flags are independent of processing tag filters otherwise
        if (filterKey === null) {
            ProcessingTagState._activeFlagFilters.clear();
        }
        renderPanelContent();
        // Debounce table re-render to avoid redundant work on rapid clicks
        clearTimeout(_ptagFilterTimer);
        _ptagFilterTimer = setTimeout(() => {
            if (typeof window.performTableSearch === 'function') {
                window.performTableSearch();
            }
        }, 50);
    }

    function _ptagToggleFlagFilter(flagKey) {
        const set = ProcessingTagState._activeFlagFilters;
        if (set.has(flagKey)) {
            set.delete(flagKey);
        } else {
            set.add(flagKey);
        }
        renderPanelContent();
        clearTimeout(_ptagFilterTimer);
        _ptagFilterTimer = setTimeout(() => {
            if (typeof window.performTableSearch === 'function') {
                window.performTableSearch();
            }
        }, 50);
    }

    function _ptagFilterPanel(query) {
        const norm = _ptagNormalize(query);
        const body = document.getElementById('ptag-panel-body');
        if (!body) return;

        // First: filter individual items (cards, flags, headers)
        body.querySelectorAll('.ptag-panel-card, .ptag-panel-cat-header-v2, .ptag-panel-flag-item').forEach(el => {
            if (!el.dataset.search) return;
            el.style.display = el.dataset.search.includes(norm) ? '' : 'none';
        });

        // Then: show/hide groups — visible if group itself matches OR any child card is visible
        body.querySelectorAll('.ptag-panel-group').forEach(group => {
            const groupMatch = group.dataset.search && group.dataset.search.includes(norm);
            const hasVisibleChild = group.querySelector('.ptag-panel-card:not([style*="display: none"]), .ptag-panel-card:not([style*="display:none"])');
            if (groupMatch) {
                // Group matches → show group + all children
                group.style.display = '';
                group.querySelectorAll('.ptag-panel-card, .ptag-panel-cat-header-v2').forEach(c => c.style.display = '');
            } else if (hasVisibleChild) {
                // Some children match → show group + header, keep children filtered
                group.style.display = '';
                const header = group.querySelector('.ptag-panel-cat-header-v2');
                if (header) header.style.display = '';
            } else {
                group.style.display = 'none';
            }
        });
    }

    // =====================================================
    // SECTION 8: UI — BULK ASSIGN MODAL
    // =====================================================

    function _ptagOpenBulkModal() {
        _ptagCloseBulkModal();

        const html = `<div class="ptag-bulk-overlay" id="ptag-bulk-overlay" onclick="if(event.target===this)window._ptagCloseBulkModal();">
            <div class="ptag-bulk-modal">
                <div class="ptag-bulk-header">
                    <span style="font-weight:600;">Gán Trạng Thái Hàng Loạt</span>
                    <button onclick="window._ptagCloseBulkModal();" style="background:none;border:none;cursor:pointer;font-size:16px;">&times;</button>
                </div>
                <div class="ptag-bulk-body">
                    <label style="font-size:12px;font-weight:500;">Nhập STT (VD: 1, 5-10, 15)</label>
                    <input type="text" id="ptag-bulk-stt" class="ptag-bulk-input" placeholder="1, 5-10, 15" />
                    <label style="font-size:12px;font-weight:500;margin-top:8px;">Chọn trạng thái</label>
                    <div class="ptag-bulk-options" id="ptag-bulk-options">
                        ${_ptagBuildBulkOptions()}
                    </div>
                </div>
                <div class="ptag-bulk-footer">
                    <button class="ptag-bulk-cancel" onclick="window._ptagCloseBulkModal();">Hủy</button>
                    <button class="ptag-bulk-confirm" onclick="window._ptagConfirmBulk();">Gán</button>
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', html);
    }

    function _ptagBuildBulkOptions() {
        let html = '';
        // Cat 1
        html += `<div class="ptag-bulk-group">
            <div class="ptag-bulk-cat" style="color:${PTAG_CATEGORY_COLORS[1].text};">${PTAG_CATEGORY_META[1].emoji} ${PTAG_CATEGORY_META[1].short}</div>
            <label><input type="radio" name="ptag-bulk-choice" value="1:null" /> Okie Chờ Đi Đơn</label>
        </div>`;
        // Cat 2
        html += `<div class="ptag-bulk-group">
            <div class="ptag-bulk-cat" style="color:${PTAG_CATEGORY_COLORS[2].text};">${PTAG_CATEGORY_META[2].emoji} ${PTAG_CATEGORY_META[2].short}</div>`;
        Object.entries(PTAG_SUBTAGS).filter(([,v]) => v.category === 2).forEach(([key, st]) => {
            html += `<label><input type="radio" name="ptag-bulk-choice" value="2:${key}" /> ${st.label}</label>`;
        });
        html += `</div>`;
        // Cat 3
        html += `<div class="ptag-bulk-group">
            <div class="ptag-bulk-cat" style="color:${PTAG_CATEGORY_COLORS[3].text};">${PTAG_CATEGORY_META[3].emoji} ${PTAG_CATEGORY_META[3].short}</div>`;
        Object.entries(PTAG_SUBTAGS).filter(([,v]) => v.category === 3).forEach(([key, st]) => {
            html += `<label><input type="radio" name="ptag-bulk-choice" value="3:${key}" /> ${st.label}</label>`;
        });
        html += `</div>`;
        // Cat 4
        html += `<div class="ptag-bulk-group">
            <div class="ptag-bulk-cat" style="color:${PTAG_CATEGORY_COLORS[4].text};">${PTAG_CATEGORY_META[4].emoji} ${PTAG_CATEGORY_META[4].short}</div>`;
        Object.entries(PTAG_SUBTAGS).filter(([,v]) => v.category === 4).forEach(([key, st]) => {
            html += `<label><input type="radio" name="ptag-bulk-choice" value="4:${key}" /> ${st.label}</label>`;
        });
        html += `</div>`;
        return html;
    }

    function _ptagCloseBulkModal() {
        const overlay = document.getElementById('ptag-bulk-overlay');
        if (overlay) overlay.remove();
    }

    async function _ptagConfirmBulk() {
        const sttInput = document.getElementById('ptag-bulk-stt')?.value || '';
        const choice = document.querySelector('input[name="ptag-bulk-choice"]:checked')?.value;

        if (!sttInput.trim() || !choice) {
            alert('Vui lòng nhập STT và chọn trạng thái.');
            return;
        }

        const [catStr, subTag] = choice.split(':');
        const category = parseInt(catStr);
        const stts = _ptagParseSTT(sttInput);

        if (stts.length === 0) {
            alert('STT không hợp lệ.');
            return;
        }

        // Find orders by STT (SessionIndex)
        const orders = ((typeof window.getAllOrders === 'function') ? window.getAllOrders() : []).filter(o => stts.includes(o.SessionIndex));

        if (orders.length === 0) {
            alert('Không tìm thấy đơn nào với STT đã nhập.');
            return;
        }

        const confirmMsg = `Gán ${PTAG_CATEGORY_META[category]?.short || ''} cho ${orders.length} đơn?`;
        if (!confirm(confirmMsg)) return;

        _ptagCloseBulkModal();

        for (const order of orders) {
            await assignOrderCategory(order.Id, category, { subTag: subTag === 'null' ? null : subTag });
        }

        console.log(`${PTAG_LOG} Bulk assigned ${orders.length} orders to category ${category}`);
    }

    function _ptagParseSTT(input) {
        const stts = [];
        const parts = input.split(',').map(s => s.trim()).filter(Boolean);
        for (const part of parts) {
            if (part.includes('-')) {
                const [start, end] = part.split('-').map(Number);
                if (!isNaN(start) && !isNaN(end)) {
                    for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
                        stts.push(i);
                    }
                }
            } else {
                const n = parseInt(part);
                if (!isNaN(n)) stts.push(n);
            }
        }
        return [...new Set(stts)];
    }

    // =====================================================
    // SECTION 8B: T-TAG MODAL (UX giống TPOS tag modal)
    // =====================================================

    let _ttagModalOrderId = null;
    let _ttagSelectedTags = [];
    let _ttagPendingDeleteIndex = -1;

    async function _ptagOpenTTagModal(orderId) {
        const data = ProcessingTagState.getOrderData(orderId);

        _ttagModalOrderId = orderId;
        _ttagSelectedTags = [...(data?.tTags || [])];
        _ttagPendingDeleteIndex = -1;

        // Remove existing modal
        const existing = document.getElementById('ptag-ttag-modal');
        if (existing) existing.remove();

        const order = ((typeof window.getAllOrders === 'function') ? window.getAllOrders() : []).find(o => o.Id === orderId);
        const orderCode = order?.Code || '';

        const modal = document.createElement('div');
        modal.id = 'ptag-ttag-modal';
        modal.className = 'ptag-ttag-modal';
        modal.innerHTML = `
            <div class="ptag-ttag-modal-content">
                <div class="ptag-ttag-header">
                    <button class="ptag-ttag-save-btn" onclick="window._ptagSaveTTags()" title="Lưu (Tab / Ctrl+Enter)">\u{1F4BE} Lưu (Tab)</button>
                    <span style="flex:1;"></span>
                    <span style="font-size:11px;color:#6b7280;">Đơn ${orderCode}</span>
                    <button class="ptag-ttag-close-btn" onclick="window._ptagCloseTTagModal()" title="Đóng">&times;</button>
                </div>
                <div class="ptag-ttag-body">
                    <div class="ptag-ttag-input-container" id="ptag-ttag-input-container">
                        <div id="ptag-ttag-chips"></div>
                        <input type="text" id="ptag-ttag-search" class="ptag-ttag-search-input" placeholder="Tìm hoặc tạo tag T..."
                            oninput="window._ptagFilterTTags()"
                            onkeydown="window._ptagHandleTTagKeydown(event)" />
                    </div>
                    <div class="ptag-ttag-dropdown" id="ptag-ttag-dropdown"></div>
                </div>
            </div>`;
        document.body.appendChild(modal);

        _ptagUpdateTTagChips();
        _ptagRenderTTagSuggestions('');

        setTimeout(() => {
            document.getElementById('ptag-ttag-search')?.focus();
        }, 100);
    }

    function _ptagCloseTTagModal() {
        const modal = document.getElementById('ptag-ttag-modal');
        if (modal) modal.remove();
        _ttagModalOrderId = null;
        _ttagSelectedTags = [];
        _ttagPendingDeleteIndex = -1;
    }

    function _ptagUpdateTTagChips() {
        const container = document.getElementById('ptag-ttag-chips');
        if (!container) return;
        if (_ttagSelectedTags.length === 0) {
            container.innerHTML = '';
            _ttagPendingDeleteIndex = -1;
            return;
        }
        container.innerHTML = _ttagSelectedTags.map((tagId, index) => {
            const isPending = index === _ttagPendingDeleteIndex;
            const bg = isPending ? '#ef4444' : '#8b5cf6';
            const label = ProcessingTagState.getTTagName(tagId) || tagId;
            return `<span class="ptag-ttag-pill ${isPending ? 'deletion-pending' : ''}" style="background-color:${bg};">
                ${label}
                <button class="ptag-ttag-pill-remove" onclick="event.stopPropagation(); window._ptagRemoveTTagAtIndex(${index});">\u2715</button>
            </span>`;
        }).join('');
    }

    function _ptagRenderTTagSuggestions(query) {
        const dropdown = document.getElementById('ptag-ttag-dropdown');
        if (!dropdown) return;

        const defs = ProcessingTagState.getTTagDefinitions();
        const q = _ptagNormalize(query);

        const filtered = defs.filter(def => {
            if (_ttagSelectedTags.includes(def.id)) return false;
            if (!q) return true;
            return _ptagNormalize(def.name).includes(q);
        });

        if (filtered.length === 0 && !query.trim()) {
            dropdown.innerHTML = `<div class="ptag-ttag-no-match"><i class="fas fa-box-open" style="font-size:32px;margin-bottom:8px;display:block;"></i><p>Chưa có tag T nào. Gõ tên và Enter để tạo mới.</p></div>`;
            return;
        }
        if (filtered.length === 0) {
            dropdown.innerHTML = `<div class="ptag-ttag-no-match"><i class="fas fa-search" style="font-size:32px;margin-bottom:8px;display:block;"></i><p>Không tìm thấy tag phù hợp.<br>Nhấn <b>Enter</b> để tạo "<b>${query.trim().toUpperCase()}</b>"</p></div>`;
            return;
        }

        dropdown.innerHTML = filtered.map((def, idx) => {
            const escapedId = def.id.replace(/'/g, "\\'");
            return `<div class="ptag-ttag-dropdown-item ${idx === 0 ? 'highlighted' : ''}" onclick="window._ptagToggleTTagSelection('${escapedId}')" data-tag-id="${def.id}">
                <span style="color:#7c3aed;font-weight:600;">${def.name}</span>
            </div>`;
        }).join('');
    }

    function _ptagFilterTTags() {
        const input = document.getElementById('ptag-ttag-search');
        _ptagRenderTTagSuggestions(input?.value || '');
    }

    function _ptagHandleTTagKeydown(event) {
        const input = document.getElementById('ptag-ttag-search');
        const inputValue = input?.value || '';

        // Ctrl+Enter or Tab → save
        if ((event.ctrlKey && event.key === 'Enter') || event.key === 'Tab') {
            event.preventDefault();
            _ptagSaveTTags();
            return;
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            const highlighted = document.querySelector('.ptag-ttag-dropdown-item.highlighted');
            if (highlighted) {
                const tagId = highlighted.getAttribute('data-tag-id');
                if (tagId) {
                    _ptagToggleTTagSelection(tagId);
                    if (input) input.value = '';
                    _ptagRenderTTagSuggestions('');
                    _ttagPendingDeleteIndex = -1;
                }
            } else if (inputValue.trim()) {
                _ptagAutoCreateTTag(inputValue.trim());
                if (input) input.value = '';
            }
        } else if (event.key === 'Backspace' && inputValue === '') {
            event.preventDefault();
            if (_ttagSelectedTags.length === 0) return;
            if (_ttagPendingDeleteIndex >= 0) {
                _ptagRemoveTTagAtIndex(_ttagPendingDeleteIndex);
            } else {
                _ttagPendingDeleteIndex = _ttagSelectedTags.length - 1;
                _ptagUpdateTTagChips();
            }
        } else if (event.key === 'Escape') {
            _ptagCloseTTagModal();
        } else {
            if (event.key === 'Control' || event.key === 'Shift') return;
            if (_ttagPendingDeleteIndex >= 0) {
                _ttagPendingDeleteIndex = -1;
                _ptagUpdateTTagChips();
            }
        }
    }

    function _ptagToggleTTagSelection(tagId) {
        const idx = _ttagSelectedTags.indexOf(tagId);
        if (idx >= 0) {
            _ttagSelectedTags.splice(idx, 1);
        } else {
            _ttagSelectedTags.push(tagId);
        }
        _ttagPendingDeleteIndex = -1;
        _ptagUpdateTTagChips();
        const input = document.getElementById('ptag-ttag-search');
        _ptagRenderTTagSuggestions(input?.value || '');
        input?.focus();
    }

    function _ptagRemoveTTagAtIndex(index) {
        if (index >= 0 && index < _ttagSelectedTags.length) {
            _ttagSelectedTags.splice(index, 1);
            _ttagPendingDeleteIndex = -1;
            _ptagUpdateTTagChips();
            const input = document.getElementById('ptag-ttag-search');
            _ptagRenderTTagSuggestions(input?.value || '');
        }
    }

    function _ptagAutoCreateTTag(name, productCode) {
        const upperName = name.toUpperCase();
        const defs = ProcessingTagState.getTTagDefinitions();

        // Check if already exists (id = name, case-insensitive)
        const existing = defs.find(d => d.id === upperName);
        if (existing) {
            if (!_ttagSelectedTags.includes(existing.id)) {
                _ttagSelectedTags.push(existing.id);
            }
            _ptagUpdateTTagChips();
            _ptagRenderTTagSuggestions('');
            return;
        }

        // Create new definition: id = name (UPPERCASE), with optional productCode
        const newDef = { id: upperName, name: upperName, productCode: productCode || '', createdAt: Date.now() };
        defs.push(newDef);
        ProcessingTagState.setTTagDefinitions(defs);
        saveTTagDefinitions();

        // Add to selection
        _ttagSelectedTags.push(upperName);
        _ptagUpdateTTagChips();
        _ptagRenderTTagSuggestions('');
        renderPanelContent();

        console.log(`${PTAG_LOG} Created T-tag: ${upperName}`);
    }

    async function _ptagSaveTTags() {
        if (!_ttagModalOrderId) return;
        const orderId = _ttagModalOrderId;
        let data = ProcessingTagState.getOrderData(orderId);

        if (!data) {
            // Create minimal data for orders without processing tag
            data = { tTags: [..._ttagSelectedTags] };
        } else {
            data.tTags = [..._ttagSelectedTags];
        }

        // Auto sub-state ONLY when at Cat 1
        if (data.category === PTAG_CATEGORIES.CHO_DI_DON) {
            if (data.subState === 'OKIE_CHO_DI_DON' && data.tTags.length > 0) {
                data.subState = 'CHO_HANG';
            } else if (data.subState === 'CHO_HANG' && data.tTags.length === 0) {
                data.subState = 'OKIE_CHO_DI_DON';
            }
        }

        _ptagEnsureCode(orderId, data);
        ProcessingTagState.setOrderData(orderId, data);
        _ptagRefreshRow(orderId);
        renderPanelContent();
        await saveProcessingTagToAPI(orderId, data);

        _ptagCloseTTagModal();
        console.log(`${PTAG_LOG} Saved ${data.tTags.length} T-tags for order ${orderId}`);
    }

    // =====================================================
    // SECTION 8C: T-TAG MANAGER (full management modal)
    // =====================================================

    let _ttagManagerExpanded = null; // Currently expanded tag ID

    function _ttagGetCounts() {
        const counts = {};
        for (const [, data] of ProcessingTagState.getAllOrders()) {
            if (data.tTags) {
                for (const tagId of data.tTags) {
                    counts[tagId] = (counts[tagId] || 0) + 1;
                }
            }
        }
        return counts;
    }

    function _ttagGetOrdersForTag(tagId) {
        const orders = [];
        const allOrders = (typeof window.getAllOrders === 'function') ? window.getAllOrders() : [];
        for (const [orderId, data] of ProcessingTagState.getAllOrders()) {
            if (data.tTags && data.tTags.includes(tagId)) {
                const order = allOrders.find(o => String(o.Id) === String(orderId));
                orders.push({ orderId, stt: order?.SessionIndex || '?', name: order?.PartnerName || order?.Name || '', phone: order?.Telephone || '' });
            }
        }
        return orders.sort((a, b) => (a.stt || 0) - (b.stt || 0));
    }

    function _ptagOpenTTagManager() {
        const existing = document.getElementById('ptag-ttag-manager');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'ptag-ttag-manager';
        modal.className = 'ptag-ttag-modal';
        modal.onclick = (e) => { if (e.target === modal) _ptagCloseTTagManager(); };
        modal.innerHTML = `
            <div class="ptag-ttag-modal-content ptag-ttag-manager-content">
                <div class="ptag-ttag-header" style="background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;">
                    <span style="font-weight:700;font-size:16px;">\u{1F3F7}\uFE0F QUẢN LÝ TAG T CHỜ HÀNG</span>
                    <span style="flex:1;"></span>
                    <button class="ptag-ttag-close-btn" style="color:#fff;" onclick="window._ptagCloseTTagManager()">&times;</button>
                </div>
                <div id="ptag-ttag-manager-summary" style="padding:10px 16px;font-size:14px;color:#374151;font-weight:500;border-bottom:1px solid #e5e7eb;"></div>
                <div id="ptag-ttag-manager-create" style="padding:14px 16px;border-bottom:1px solid #e5e7eb;">
                    <button id="ptag-ttag-create-toggle" onclick="window._ptagToggleCreateForm()" style="width:100%;padding:12px;border:2px dashed #a855f7;border-radius:8px;background:rgba(168,85,247,0.04);color:#7c3aed;font-size:14px;font-weight:700;cursor:pointer;transition:all 0.15s;">+ TẠO TAG T MỚI</button>
                    <div id="ptag-ttag-create-form" style="display:none;margin-top:10px;"></div>
                </div>
                <div id="ptag-ttag-manager-list" style="padding:8px 16px;max-height:calc(80vh - 200px);overflow-y:auto;"></div>
            </div>`;
        document.body.appendChild(modal);
        _ttagManagerExpanded = null;
        _ttagRenderManagerList();
    }

    function _ttagRenderManagerList() {
        const defs = ProcessingTagState.getTTagDefinitions();
        const counts = _ttagGetCounts();
        const totalOrders = Object.values(counts).reduce((s, c) => s + c, 0);

        // Summary
        const summary = document.getElementById('ptag-ttag-manager-summary');
        if (summary) summary.textContent = `Tổng: ${defs.length} tag · ${totalOrders} đơn chờ hàng`;

        // List
        const list = document.getElementById('ptag-ttag-manager-list');
        if (!list) return;

        if (defs.length === 0) {
            list.innerHTML = '<div style="text-align:center;padding:30px;color:#6b7280;font-size:14px;"><i class="fas fa-box-open" style="font-size:36px;margin-bottom:10px;display:block;color:#a855f7;"></i>Chưa có tag T nào.<br>Nhấn <b style="color:#7c3aed;">+ TẠO TAG T MỚI</b> để bắt đầu.</div>';
            return;
        }

        list.innerHTML = defs.map(def => {
            const count = counts[def.id] || 0;
            const escapedId = def.id.replace(/'/g, "\\'");
            const isExpanded = _ttagManagerExpanded === def.id;
            const pcLabel = def.productCode ? `<span style="color:#6b7280;font-weight:500;"> · ${def.productCode}</span>` : '';
            const expandIcon = isExpanded ? 'fa-chevron-down' : 'fa-chevron-right';

            let cardHtml = `<div class="ptag-ttag-mgr-card ${isExpanded ? 'expanded' : ''}">
                <div class="ptag-ttag-mgr-card-header" onclick="window._ptagToggleTTagCard('${escapedId}')">
                    <i class="fas ${expandIcon}" style="font-size:11px;color:#7c3aed;margin-right:4px;"></i>
                    <span style="color:#7c3aed;font-weight:600;font-size:14px;flex:1;">${def.name}${pcLabel}</span>
                    <span style="font-size:13px;font-weight:500;color:#374151;margin-right:4px;">${count} đơn</span>
                    <button class="ptag-ttag-mgr-delete-btn" onclick="window._ptagDeleteTTagDefAndOrders('${escapedId}'); event.stopPropagation();" title="Xóa tag và gỡ khỏi tất cả đơn">&times;</button>
                </div>`;

            if (isExpanded) {
                const orders = _ttagGetOrdersForTag(def.id);
                cardHtml += `<div class="ptag-ttag-mgr-card-body">`;

                // STT pills (removable)
                if (orders.length > 0) {
                    cardHtml += `<div class="ptag-ttag-mgr-pills">`;
                    orders.forEach(o => {
                        cardHtml += `<span class="ptag-ttag-mgr-pill">STT ${o.stt}<button onclick="window._ptagRemoveTTagBySTT('${escapedId}', '${o.orderId}'); event.stopPropagation();">&times;</button></span>`;
                    });
                    cardHtml += `</div>`;
                } else {
                    cardHtml += `<div style="color:#6b7280;font-size:13px;padding:6px 0;">Chưa có đơn nào.</div>`;
                }

                // Add orders section
                cardHtml += `<div style="margin-top:12px;padding-top:12px;border-top:1px solid #f3f4f6;">
                    <div style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">➕ Thêm đơn</div>
                    <div style="display:flex;gap:8px;margin-bottom:8px;">
                        <input type="text" id="ptag-ttag-add-stt-${def.id}" placeholder="Nhập STT: 1, 5-10, 15" style="flex:1;padding:9px 12px;font-size:13px;border:1.5px solid #d1d5db;border-radius:6px;color:#1f2937;outline:none;" onfocus="this.style.borderColor='#a855f7';this.style.boxShadow='0 0 0 3px rgba(168,85,247,0.12)'" onblur="this.style.borderColor='#d1d5db';this.style.boxShadow='none'" />
                        <button onclick="window._ptagAddSTTsToTag('${escapedId}')" style="padding:9px 16px;font-size:13px;font-weight:600;background:#7c3aed;color:#fff;border:none;border-radius:6px;cursor:pointer;white-space:nowrap;">+ Thêm</button>
                    </div>
                    <button onclick="window._ptagFindByProductCode('${escapedId}')" style="width:100%;padding:10px 16px;font-size:13px;font-weight:600;background:#f5f3ff;color:#7c3aed;border:1.5px solid #c4b5fd;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
                        <i class="fas fa-search"></i> Tìm đơn chứa SP ${def.productCode || def.name}
                    </button>
                </div>`;

                // Remove section
                cardHtml += `<div style="margin-top:12px;padding-top:12px;border-top:1px solid #f3f4f6;">
                    <div style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">➖ Gỡ đơn</div>
                    <div style="display:flex;gap:8px;margin-bottom:8px;">
                        <input type="text" id="ptag-ttag-remove-stt-${def.id}" placeholder="STT cần gỡ: 1, 5, 10" style="flex:1;padding:9px 12px;font-size:13px;border:1.5px solid #d1d5db;border-radius:6px;color:#1f2937;outline:none;" onfocus="this.style.borderColor='#ef4444';this.style.boxShadow='0 0 0 3px rgba(239,68,68,0.1)'" onblur="this.style.borderColor='#d1d5db';this.style.boxShadow='none'" />
                        <button onclick="window._ptagRemoveSTTsFromTag('${escapedId}')" style="padding:9px 16px;font-size:13px;font-weight:600;background:rgba(239,68,68,0.08);color:#ef4444;border:1.5px solid rgba(239,68,68,0.2);border-radius:6px;cursor:pointer;white-space:nowrap;">Gỡ chọn</button>
                    </div>
                    ${count > 0 ? `<button onclick="window._ptagRemoveAllFromTag('${escapedId}')" style="width:100%;padding:10px 16px;font-size:14px;font-weight:600;background:#22c55e;color:#fff;border:none;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
                        🟢 HÀNG ĐÃ VỀ — Gỡ tất cả ${count} đơn
                    </button>` : ''}
                </div>`;

                cardHtml += `</div>`;
            }

            cardHtml += `</div>`;
            return cardHtml;
        }).join('');
    }

    function _ptagToggleTTagCard(tagId) {
        _ttagManagerExpanded = _ttagManagerExpanded === tagId ? null : tagId;
        _ttagRenderManagerList();
    }

    function _ptagToggleCreateForm() {
        const form = document.getElementById('ptag-ttag-create-form');
        if (!form) return;
        const isVisible = form.style.display !== 'none';
        form.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) {
            form.innerHTML = `
                <div class="ptag-ttag-create-fields" style="border:2px solid #a855f7;border-radius:10px;padding:16px;background:rgba(168,85,247,0.03);">
                    <div style="font-size:15px;font-weight:700;color:#7c3aed;margin-bottom:4px;">📋 Tạo Tag T mới</div>
                    <div class="ptag-ttag-create-row">
                        <label style="font-size:14px;font-weight:600;color:#374151;min-width:100px;">Mã SP <span style="color:#ef4444;">*</span></label>
                        <input type="text" id="ptag-ttag-new-pc" placeholder="VD: B16" style="text-transform:uppercase;font-size:14px;padding:10px 12px;border:1.5px solid #d1d5db;border-radius:6px;" />
                    </div>
                    <div class="ptag-ttag-create-row">
                        <label style="font-size:14px;font-weight:600;color:#374151;min-width:100px;">Tên gợi nhớ <span style="color:#ef4444;">*</span></label>
                        <input type="text" id="ptag-ttag-new-name" placeholder="VD: Áo nâu ngắn tay" style="font-size:14px;padding:10px 12px;border:1.5px solid #d1d5db;border-radius:6px;" />
                    </div>
                    <div class="ptag-ttag-create-row">
                        <label style="font-size:14px;font-weight:600;color:#374151;min-width:100px;">Gắn đơn ngay:</label>
                        <div style="display:flex;gap:14px;margin-top:2px;">
                            <label style="font-size:13px;font-weight:500;color:#374151;cursor:pointer;display:flex;align-items:center;gap:6px;"><input type="radio" name="ptag-ttag-assign-mode" value="search" checked style="width:15px;height:15px;accent-color:#7c3aed;" /> Tự tìm đơn chứa SP</label>
                            <label style="font-size:13px;font-weight:500;color:#374151;cursor:pointer;display:flex;align-items:center;gap:6px;"><input type="radio" name="ptag-ttag-assign-mode" value="manual" style="width:15px;height:15px;accent-color:#7c3aed;" /> Nhập STT thủ công</label>
                        </div>
                    </div>
                    <div style="display:flex;gap:10px;margin-top:12px;">
                        <button class="ptag-ttag-mgr-btn ptag-ttag-mgr-btn--warn" style="padding:10px 20px;font-size:14px;" onclick="window._ptagCancelCreateForm()">Hủy</button>
                        <button class="ptag-ttag-mgr-btn ptag-ttag-mgr-btn--success" style="flex:1;padding:10px 20px;font-size:14px;" onclick="window._ptagConfirmCreateTag()">Tạo & Tiếp tục</button>
                    </div>
                </div>`;
            setTimeout(() => document.getElementById('ptag-ttag-new-pc')?.focus(), 50);
        }
    }

    function _ptagCancelCreateForm() {
        const form = document.getElementById('ptag-ttag-create-form');
        if (form) { form.style.display = 'none'; form.innerHTML = ''; }
    }

    function _ptagConfirmCreateTag() {
        const pcInput = document.getElementById('ptag-ttag-new-pc');
        const nameInput = document.getElementById('ptag-ttag-new-name');
        const productCode = (pcInput?.value || '').trim().toUpperCase();
        const name = (nameInput?.value || '').trim();

        if (!productCode || !name) {
            alert('Vui lòng nhập đầy đủ Mã SP và Tên gợi nhớ.');
            return;
        }

        // Generate ID: T + next number
        const defs = ProcessingTagState.getTTagDefinitions();
        let nextNum = 1;
        for (const d of defs) {
            const match = d.id.match(/^T(\d+)/);
            if (match) nextNum = Math.max(nextNum, parseInt(match[1]) + 1);
        }
        const tagId = `T${nextNum}`;

        // Create definition
        const newDef = { id: tagId, name, productCode, createdAt: Date.now() };
        defs.push(newDef);
        ProcessingTagState.setTTagDefinitions(defs);
        saveTTagDefinitions();

        const mode = document.querySelector('input[name="ptag-ttag-assign-mode"]:checked')?.value || 'search';
        _ptagCancelCreateForm();

        if (mode === 'search') {
            _ptagFindByProductCode(tagId);
        } else {
            // Show manual STT input — expand the new card
            _ttagManagerExpanded = tagId;
            _ttagRenderManagerList();
            renderPanelContent();
        }

        console.log(`${PTAG_LOG} Created T-tag: ${tagId} (${productCode} - ${name})`);
    }

    /**
     * Cache for order details loaded from Firestore (Báo Cáo Tổng Hợp).
     * Key: tableName, Value: array of orders with Details[].ProductCode
     */
    let _reportOrderDetailsCache = null; // { tableName, orders[] }
    let _reportOrderDetailsLoading = null; // Promise if currently loading

    /**
     * Load order details from Firestore collection 'report_order_details'.
     * This data was fetched & saved by Tab "Báo Cáo Tổng Hợp" (overview)
     * via "Lấy chi tiết đơn hàng" button → fetchOrderData() with $expand=Details.
     */
    async function _ptagLoadReportOrderDetails() {
        const tableName = window.campaignManager?.activeCampaign?.name
            || localStorage.getItem('orders_table_name') || '';
        if (!tableName) return null;

        // Return cache if same table
        if (_reportOrderDetailsCache && _reportOrderDetailsCache.tableName === tableName) {
            return _reportOrderDetailsCache.orders;
        }

        // Prevent duplicate concurrent loads
        if (_reportOrderDetailsLoading) return _reportOrderDetailsLoading;

        _reportOrderDetailsLoading = _ptagLoadReportOrderDetailsInner(tableName);
        try {
            return await _reportOrderDetailsLoading;
        } finally {
            _reportOrderDetailsLoading = null;
        }
    }

    async function _ptagLoadReportOrderDetailsInner(tableName) {

        const db = window.firestoreDb || (typeof firebase !== 'undefined' && firebase.firestore());
        if (!db) {
            console.warn(`${PTAG_LOG} Firestore not available for loading report order details`);
            return null;
        }

        const safeTableName = tableName.replace(/[.$#\[\]\/]/g, '_');
        const FIREBASE_PATH = 'report_order_details';

        try {
            const docRef = db.collection(FIREBASE_PATH).doc(safeTableName);
            const doc = await docRef.get();
            if (!doc.exists) {
                console.log(`${PTAG_LOG} No report data in Firestore for table: ${tableName}`);
                return null;
            }

            const data = doc.data();
            let orders;

            if (data.isChunked) {
                // Load chunked data
                const chunksSnapshot = await docRef.collection('order_chunks')
                    .orderBy('chunkIndex').get();
                orders = [];
                chunksSnapshot.forEach(chunkDoc => {
                    const chunkData = chunkDoc.data();
                    if (chunkData.orders) orders.push(...chunkData.orders);
                });
                console.log(`${PTAG_LOG} Loaded ${orders.length} orders from ${chunksSnapshot.size} chunks (report_order_details)`);
            } else {
                orders = data.orders || [];
                console.log(`${PTAG_LOG} Loaded ${orders.length} orders from report_order_details`);
            }

            _reportOrderDetailsCache = { tableName, orders };
            return orders;
        } catch (e) {
            console.error(`${PTAG_LOG} Error loading report order details:`, e);
            return null;
        }
    }

    async function _ptagFindByProductCode(tagId) {
        const def = ProcessingTagState.getTTagDef(tagId);
        const productCode = (def?.productCode || tagId).toUpperCase();
        const allOrders = (typeof window.getAllOrders === 'function') ? window.getAllOrders() : [];

        // Build lookups from current Tab 1 data
        // TPOS changes order IDs between page loads → use Code (Mã ĐH) as stable key
        const orderByCode = new Map();
        const orderById = new Map();
        for (const o of allOrders) {
            if (o.Code) orderByCode.set(String(o.Code), o);
            orderById.set(String(o.Id), o);
        }

        // Check if allData already has Details (unlikely for GetView)
        let hasDetails = allOrders.some(o => Array.isArray(o.Details) && o.Details.length > 0);
        let searchSource = allOrders;

        if (!hasDetails) {
            // Load order details from Firestore (Báo Cáo Tổng Hợp data)
            const list = document.getElementById('ptag-ttag-manager-list');
            if (list) {
                list.innerHTML = `<div style="text-align:center;padding:30px 20px;">
                    <i class="fas fa-spinner fa-spin" style="font-size:28px;color:#a855f7;margin-bottom:12px;display:block;"></i>
                    <div style="font-size:14px;font-weight:500;color:#374151;">Đang tải chi tiết SP từ Báo Cáo Tổng Hợp...</div>
                    <div style="font-size:12px;color:#6b7280;margin-top:4px;">Lần đầu có thể mất vài giây</div>
                </div>`;
            }

            const reportOrders = await _ptagLoadReportOrderDetails();
            if (!reportOrders || reportOrders.length === 0) {
                alert('Chưa có dữ liệu chi tiết đơn hàng.\n\nVui lòng vào Tab "Báo Cáo Tổng Hợp" → nhấn "Lấy chi tiết đơn hàng" trước.\n\nHoặc dùng cách nhập STT thủ công.');
                _ttagManagerExpanded = tagId;
                _ttagRenderManagerList();
                renderPanelContent();
                return;
            }
            searchSource = reportOrders;
        }

        // Search for orders containing this product code
        // Collect both Code and Id from report data for cross-reference
        const matchedCodes = new Set();
        const matchedIds = new Set();
        for (const order of searchSource) {
            const details = order.Details;
            if (!Array.isArray(details)) continue;
            if (details.some(d => (d.ProductCode || '').toUpperCase() === productCode)) {
                if (order.Code) matchedCodes.add(String(order.Code));
                matchedIds.add(String(order.Id));
            }
        }

        // Resolve to Tab 1 order objects — try Code first (stable), fallback to Id
        const matchingOrders = [];
        const seenIds = new Set();
        for (const code of matchedCodes) {
            const order = orderByCode.get(code);
            if (order && !seenIds.has(String(order.Id))) {
                matchingOrders.push(order);
                seenIds.add(String(order.Id));
            }
        }
        // Fallback: also try by Id for any not matched by Code
        for (const oid of matchedIds) {
            const order = orderById.get(oid);
            if (order && !seenIds.has(oid)) {
                matchingOrders.push(order);
                seenIds.add(oid);
            }
        }

        // Filter out orders already having this tag T
        const existingOrderIds = new Set();
        for (const [orderId, data] of ProcessingTagState.getAllOrders()) {
            if (data.tTags && data.tTags.includes(tagId)) existingOrderIds.add(String(orderId));
        }
        const newOrders = matchingOrders.filter(o => !existingOrderIds.has(String(o.Id)));

        if (newOrders.length === 0) {
            if (matchingOrders.length > 0) {
                alert(`Tất cả ${matchingOrders.length} đơn chứa SP "${productCode}" đã có tag này.`);
            } else if (matchedIds.size > 0) {
                alert(`Tìm thấy ${matchedIds.size} đơn chứa SP "${productCode}" trong Báo Cáo Tổng Hợp nhưng không khớp với đơn hiện tại.\n\nHãy dùng cách nhập STT thủ công.`);
            } else {
                alert(`Không tìm thấy đơn nào chứa SP "${productCode}".`);
            }
            _ttagManagerExpanded = tagId;
            _ttagRenderManagerList();
            renderPanelContent();
            return;
        }

        console.log(`${PTAG_LOG} Found ${newOrders.length} orders with SP "${productCode}" (source: ${hasDetails ? 'allData' : 'report_order_details'})`);
        _ptagShowSearchResults(tagId, productCode, newOrders);
    }

    function _ptagShowSearchResults(tagId, productCode, orders) {
        // Replace manager content with search results
        const list = document.getElementById('ptag-ttag-manager-list');
        if (!list) return;

        let html = `<div class="ptag-ttag-search-results">
            <div style="font-weight:600;font-size:13px;margin-bottom:8px;">
                Kết quả tìm SP: ${productCode} — ${orders.length} đơn mới
            </div>
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:8px;cursor:pointer;">
                <input type="checkbox" id="ptag-ttag-search-all" checked onchange="window._ptagToggleAllSearchResults(this.checked)" />
                <strong>Chọn tất cả (${orders.length})</strong>
            </label>
            <div class="ptag-ttag-search-list" style="max-height:300px;overflow-y:auto;">`;

        orders.forEach(o => {
            const stt = o.SessionIndex || '?';
            const name = o.PartnerName || o.Name || '';
            const phone = o.Telephone || '';
            const qty = o.TotalQuantity || '';
            const amount = o.TotalAmount ? parseInt(o.TotalAmount).toLocaleString('vi-VN') + 'đ' : '';
            html += `<label class="ptag-ttag-search-item">
                <input type="checkbox" checked data-order-id="${o.Id}" />
                <span class="ptag-ttag-search-stt">STT ${stt}</span>
                <span style="flex:1;font-size:11px;">${name}</span>
                <span style="font-size:11px;color:#6b7280;">${phone}</span>
                <span style="font-size:11px;color:#6b7280;min-width:50px;text-align:right;">${qty} SP</span>
                <span style="font-size:11px;color:#6b7280;min-width:80px;text-align:right;">${amount}</span>
            </label>`;
        });

        html += `</div>
            <div style="display:flex;gap:8px;margin-top:12px;">
                <button class="ptag-ttag-mgr-btn ptag-ttag-mgr-btn--warn" onclick="window._ptagCancelSearchResults('${tagId.replace(/'/g, "\\'")}')">Hủy</button>
                <button class="ptag-ttag-mgr-btn ptag-ttag-mgr-btn--success" style="flex:1;" onclick="window._ptagConfirmSearchResults('${tagId.replace(/'/g, "\\'")}')">
                    Gắn cho <span id="ptag-ttag-search-count">${orders.length}</span> đơn đã chọn
                </button>
            </div>
        </div>`;

        list.innerHTML = html;

        // Update count when checkboxes change
        list.querySelectorAll('.ptag-ttag-search-item input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                const checked = list.querySelectorAll('.ptag-ttag-search-item input[type="checkbox"]:checked').length;
                const countEl = document.getElementById('ptag-ttag-search-count');
                if (countEl) countEl.textContent = checked;
            });
        });
    }

    function _ptagToggleAllSearchResults(checked) {
        const list = document.getElementById('ptag-ttag-manager-list');
        if (!list) return;
        list.querySelectorAll('.ptag-ttag-search-item input[type="checkbox"]').forEach(cb => cb.checked = checked);
        const countEl = document.getElementById('ptag-ttag-search-count');
        if (countEl) countEl.textContent = checked ? list.querySelectorAll('.ptag-ttag-search-item input[type="checkbox"]').length : 0;
    }

    function _ptagCancelSearchResults(tagId) {
        _ttagManagerExpanded = tagId;
        _ttagRenderManagerList();
        renderPanelContent();
    }

    async function _ptagConfirmSearchResults(tagId) {
        const list = document.getElementById('ptag-ttag-manager-list');
        if (!list) return;
        const checkedIds = [...list.querySelectorAll('.ptag-ttag-search-item input[type="checkbox"]:checked')]
            .map(cb => cb.dataset.orderId).filter(Boolean);

        if (checkedIds.length === 0) { alert('Chưa chọn đơn nào.'); return; }

        for (const orderId of checkedIds) {
            await assignTTagToOrder(orderId, tagId);
        }

        console.log(`${PTAG_LOG} Assigned tag ${tagId} to ${checkedIds.length} orders via SP search`);
        _ttagManagerExpanded = tagId;
        _ttagRenderManagerList();
        renderPanelContent();
    }

    async function _ptagAddSTTsToTag(tagId) {
        const input = document.getElementById(`ptag-ttag-add-stt-${tagId}`);
        const sttText = input?.value || '';
        const stts = _ptagParseSTT(sttText);
        if (stts.length === 0) { alert('STT không hợp lệ.'); return; }

        const allOrders = (typeof window.getAllOrders === 'function') ? window.getAllOrders() : [];
        const orders = allOrders.filter(o => stts.includes(o.SessionIndex));
        if (orders.length === 0) { alert('Không tìm thấy đơn nào với STT đã nhập.'); return; }

        for (const order of orders) {
            await assignTTagToOrder(order.Id, tagId);
        }

        if (input) input.value = '';
        console.log(`${PTAG_LOG} Added tag ${tagId} to ${orders.length} orders by STT`);
        _ttagRenderManagerList();
        renderPanelContent();
    }

    async function _ptagRemoveSTTsFromTag(tagId) {
        const input = document.getElementById(`ptag-ttag-remove-stt-${tagId}`);
        const sttText = input?.value || '';
        const stts = _ptagParseSTT(sttText);
        if (stts.length === 0) { alert('STT không hợp lệ.'); return; }

        const allOrders = (typeof window.getAllOrders === 'function') ? window.getAllOrders() : [];
        const orders = allOrders.filter(o => stts.includes(o.SessionIndex));
        let removed = 0;
        for (const order of orders) {
            const data = ProcessingTagState.getOrderData(order.Id);
            if (data?.tTags?.includes(tagId)) {
                await removeTTagFromOrder(order.Id, tagId);
                removed++;
            }
        }

        if (input) input.value = '';
        console.log(`${PTAG_LOG} Removed tag ${tagId} from ${removed} orders by STT`);
        _ttagRenderManagerList();
        renderPanelContent();
    }

    async function _ptagRemoveAllFromTag(tagId) {
        const orders = _ttagGetOrdersForTag(tagId);
        if (orders.length === 0) return;
        const tagName = ProcessingTagState.getTTagName(tagId) || tagId;
        if (!confirm(`Gỡ tag "${tagName}" khỏi tất cả ${orders.length} đơn? (Hàng đã về)`)) return;

        for (const o of orders) {
            await removeTTagFromOrder(o.orderId, tagId);
        }

        console.log(`${PTAG_LOG} Removed tag ${tagId} from ALL ${orders.length} orders`);
        _ttagRenderManagerList();
        renderPanelContent();
    }

    async function _ptagRemoveTTagBySTT(tagId, orderId) {
        await removeTTagFromOrder(orderId, tagId);
        _ttagRenderManagerList();
        renderPanelContent();
    }

    function _ptagCloseTTagManager() {
        const modal = document.getElementById('ptag-ttag-manager');
        if (modal) modal.remove();
        _ttagManagerExpanded = null;
    }

    async function _ptagDeleteTTagDefAndOrders(tagId) {
        const defs = ProcessingTagState.getTTagDefinitions();
        const tagName = ProcessingTagState.getTTagName(tagId) || tagId;
        const orders = _ttagGetOrdersForTag(tagId);
        const count = orders.length;

        const msg = count > 0
            ? `Xóa tag "${tagName}" và gỡ khỏi ${count} đơn hàng?`
            : `Xóa tag "${tagName}"?`;
        if (!confirm(msg)) return;

        // Remove tag from all orders first
        for (const o of orders) {
            await removeTTagFromOrder(o.orderId, tagId);
        }

        // Remove tag definition
        const idx = defs.findIndex(d => d.id === tagId);
        if (idx >= 0) {
            defs.splice(idx, 1);
            ProcessingTagState.setTTagDefinitions(defs);
            saveTTagDefinitions();
        }

        console.log(`${PTAG_LOG} Deleted tag ${tagId} definition + removed from ${count} orders`);
        renderPanelContent();
        if (document.getElementById('ptag-ttag-manager')) {
            _ttagRenderManagerList();
        }
    }

    function _ptagDeleteTTagDef(tagId) {
        const defs = ProcessingTagState.getTTagDefinitions();
        let count = 0;
        for (const [, data] of ProcessingTagState.getAllOrders()) {
            if (data.tTags && data.tTags.includes(tagId)) count++;
        }

        const tagName = ProcessingTagState.getTTagName(tagId) || tagId;
        if (count > 0 && !confirm(`Tag "${tagName}" đang được dùng cho ${count} đơn. Xóa definition sẽ không xóa tag khỏi các đơn. Tiếp tục?`)) {
            return;
        }

        const idx = defs.findIndex(d => d.id === tagId);
        if (idx >= 0) {
            defs.splice(idx, 1);
            ProcessingTagState.setTTagDefinitions(defs);
            saveTTagDefinitions();
            renderPanelContent();
            // Re-render manager if open
            if (document.getElementById('ptag-ttag-manager')) {
                _ttagRenderManagerList();
            }
        }
    }

    // =====================================================
    // SECTION 9: FILTER INTEGRATION
    // =====================================================

    function getActiveProcessingTagFilter() {
        return ProcessingTagState._activeFilter;
    }

    function hasActiveProcessingTagFilters() {
        return ProcessingTagState._activeFilter !== null || ProcessingTagState._activeFlagFilters.size > 0;
    }

    function orderPassesProcessingTagFilter(orderId) {
        const filter = ProcessingTagState._activeFilter;
        const flagFilters = ProcessingTagState._activeFlagFilters;
        const hasBaseFilter = filter !== null;
        const hasFlagFilter = flagFilters.size > 0;

        // No filters active — show all
        if (!hasBaseFilter && !hasFlagFilter) return true;

        const data = ProcessingTagState.getOrderData(orderId);

        // --- Evaluate flag filter independently ---
        let passesFlag = true; // default: no flag filter = pass
        if (hasFlagFilter) {
            if (!data) {
                passesFlag = false;
            } else {
                const orderFlags = data.flags || [];
                passesFlag = [...flagFilters].some(f => orderFlags.includes(f));
            }
        }

        // --- Evaluate base filter independently ---
        let passesBase = true; // default: no base filter = pass
        if (hasBaseFilter) {
            if (filter === '__no_tag__') {
                passesBase = !data;
            } else if (!data) {
                passesBase = false;
            } else if (filter.startsWith('cat_')) {
                passesBase = data.category === parseInt(filter.replace('cat_', ''));
            }
            // Sub-state filter (cat 1) — use tTags as source of truth
            else if (filter.startsWith('sub_')) {
                const subKey = filter.replace('sub_', '');
                if (data.category !== PTAG_CATEGORIES.CHO_DI_DON) {
                    passesBase = false;
                } else if (subKey === 'CHO_HANG') {
                    passesBase = (data.tTags || []).length > 0;
                } else {
                    passesBase = (data.tTags || []).length === 0;
                }
            }
            // Flag filter — works across all categories
            else if (filter.startsWith('flag_')) {
                passesBase = (data.flags || []).includes(filter.replace('flag_', ''));
            }
            // Sub-tag filter (cat 2,3,4)
            else if (filter.startsWith('subtag_')) {
                passesBase = data.subTag === filter.replace('subtag_', '');
            }
            // T-tag filter (from internal tTags, not TPOS)
            else if (filter.startsWith('ttag_')) {
                const tagId = filter.replace('ttag_', '');
                passesBase = (data.tTags || []).includes(tagId);
            }
        }

        // Both filters must pass independently (AND logic)
        // Flag-only: passesBase=true, must pass flag
        // Base-only: passesFlag=true, must pass base
        // Both: must pass both
        return passesBase && passesFlag;
    }

    // =====================================================
    // SECTION 10: HISTORY / AUDIT LOG
    // =====================================================

    function _ptagGetCurrentUser() {
        const auth = window.authManager?.getAuthState?.();
        return {
            user: auth?.username || auth?.name || 'Unknown',
            userId: auth?.userId || auth?.id || null
        };
    }

    function _ptagAddHistory(orderId, action, value, userName) {
        const data = ProcessingTagState.getOrderData(orderId);
        if (!data) return;
        if (!data.history) data.history = [];
        const userInfo = userName ? { user: userName, userId: null } : _ptagGetCurrentUser();
        data.history.push({
            action,
            value: value || '',
            user: userInfo.user,
            userId: userInfo.userId,
            timestamp: Date.now()
        });
        // Keep max 50 entries per order to avoid data bloat
        if (data.history.length > 50) data.history = data.history.slice(-50);
    }

    function _ptagGetHistory(orderId) {
        const data = ProcessingTagState.getOrderData(orderId);
        return (data?.history || []).slice().reverse(); // newest first
    }

    function _ptagRenderHistoryPopover(orderId, anchorEl) {
        // Remove existing popover
        document.querySelectorAll('.ptag-history-popover').forEach(p => p.remove());

        const history = _ptagGetHistory(orderId);
        if (history.length === 0) return;

        const popover = document.createElement('div');
        popover.className = 'ptag-history-popover';

        let html = '<div class="ptag-history-title">Lịch sử tag</div>';
        html += '<div class="ptag-history-list">';

        const ACTION_LABELS = {
            SET_CATEGORY: '+',
            REMOVE_CATEGORY: '-',
            ADD_FLAG: '+',
            REMOVE_FLAG: '-',
            ADD_TTAG: '+',
            REMOVE_TTAG: '-',
            AUTO_HOAN_TAT: '→',
            AUTO_ROLLBACK: '←'
        };

        history.slice(0, 20).forEach(h => {
            const date = new Date(h.timestamp);
            const dateStr = `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
            const sign = ACTION_LABELS[h.action] || '·';
            const signClass = sign === '+' || sign === '→' ? 'add' : sign === '-' || sign === '←' ? 'remove' : '';

            // Resolve display label
            let label = h.value;
            if (h.action === 'SET_CATEGORY') {
                const cat = parseInt(h.value?.split(':')[0]);
                const subTag = h.value?.split(':')[1];
                if (subTag && PTAG_SUBTAGS[subTag]) label = PTAG_SUBTAGS[subTag].label;
                else if (PTAG_CATEGORY_META[cat]) label = PTAG_CATEGORY_META[cat].short;
                else label = h.value;
            } else if (h.action === 'ADD_FLAG' || h.action === 'REMOVE_FLAG') {
                label = PTAG_FLAGS[h.value]?.label || h.value;
            } else if (h.action === 'ADD_TTAG' || h.action === 'REMOVE_TTAG') {
                label = ProcessingTagState.getTTagName(h.value);
            } else if (h.action === 'AUTO_HOAN_TAT') {
                label = 'Hoàn tất (auto)';
            } else if (h.action === 'AUTO_ROLLBACK') {
                label = 'Rollback (auto)';
            }

            html += `<div class="ptag-history-item">
                <span class="ptag-history-date">${dateStr}</span>
                <span class="ptag-history-user">${h.user || ''}</span>
                <span class="ptag-history-sign ${signClass}">${sign}</span>
                <span class="ptag-history-label">${label}</span>
            </div>`;
        });

        html += '</div>';
        popover.innerHTML = html;
        document.body.appendChild(popover);

        // Position near anchor
        const rect = anchorEl.getBoundingClientRect();
        let top = rect.bottom + 4;
        let left = rect.left;
        if (top + 250 > window.innerHeight) top = rect.top - 250;
        if (left + 280 > window.innerWidth) left = window.innerWidth - 288;
        popover.style.top = Math.max(4, top) + 'px';
        popover.style.left = Math.max(4, left) + 'px';

        // Close on outside click
        setTimeout(() => {
            const closeHandler = (e) => {
                if (!popover.contains(e.target)) {
                    popover.remove();
                    document.removeEventListener('click', closeHandler);
                }
            };
            document.addEventListener('click', closeHandler);
        }, 10);
    }

    // =====================================================
    // SECTION 10B: UTILITIES
    // =====================================================

    function _ptagNormalize(str) {
        return (str || '').toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd').replace(/Đ/g, 'D')
            .replace(/[^a-z0-9\s]/g, '').trim();
    }

    // =====================================================
    // SECTION 11: WINDOW EXPORTS
    // =====================================================

    // Core functions
    window.loadProcessingTags = loadProcessingTags;
    window.setupProcessingTagSSE = setupProcessingTagSSE;
    window.initProcessingTagPanel = initProcessingTagPanel;
    window.assignOrderCategory = assignOrderCategory;
    window.toggleOrderFlag = toggleOrderFlag;
    window.clearProcessingTag = clearProcessingTag;
    window.renderProcessingTagCell = renderProcessingTagCell;
    window.renderPanelContent = renderPanelContent;

    // Hooks (called from other files)
    window.onPtagBillCreated = onPtagBillCreated;
    window.onPtagBillCancelled = onPtagBillCancelled;
    window.onPtagOrderTagsChanged = onPtagOrderTagsChanged;

    // Filter (called from tab1-search.js)
    window.getActiveProcessingTagFilter = getActiveProcessingTagFilter;
    window.hasActiveProcessingTagFilters = hasActiveProcessingTagFilters;
    window.orderPassesProcessingTagFilter = orderPassesProcessingTagFilter;

    // UI internal (called from onclick)
    window._ptagOpenDropdown = _ptagOpenDropdown;
    window._ptagCloseDropdown = _ptagCloseDropdown;
    window._ptagFilterDropdown = _ptagFilterDropdown;
    window._ptagAssign = _ptagAssign;
    window._ptagToggleFlag = _ptagToggleFlag;
    window._ptagClear = _ptagClear;
    window._ptagDdRemovePill = _ptagDdRemovePill;
    window._ptagDdSelectTag = _ptagDdSelectTag;
    window._ptagTogglePanel = _ptagTogglePanel;
    window._ptagTogglePin = _ptagTogglePin;
    window._ptagSetFilter = _ptagSetFilter;
    window._ptagFilterPanel = _ptagFilterPanel;
    window._ptagToggleFlagFilter = _ptagToggleFlagFilter;
    window._ptagQuickAssign = _ptagQuickAssign;
    window._ptagOpenBulkModal = _ptagOpenBulkModal;
    window._ptagCloseBulkModal = _ptagCloseBulkModal;
    window._ptagConfirmBulk = _ptagConfirmBulk;

    // T-tag modal (called from onclick)
    window._ptagOpenTTagModal = _ptagOpenTTagModal;
    window._ptagCloseTTagModal = _ptagCloseTTagModal;
    window._ptagHandleTTagKeydown = _ptagHandleTTagKeydown;
    window._ptagFilterTTags = _ptagFilterTTags;
    window._ptagToggleTTagSelection = _ptagToggleTTagSelection;
    window._ptagRemoveTTagAtIndex = _ptagRemoveTTagAtIndex;
    window._ptagSaveTTags = _ptagSaveTTags;

    // T-tag manager (called from onclick)
    window._ptagOpenTTagManager = _ptagOpenTTagManager;
    window._ptagCloseTTagManager = _ptagCloseTTagManager;
    window._ptagDeleteTTagDef = _ptagDeleteTTagDef;
    window._ptagDeleteTTagDefAndOrders = _ptagDeleteTTagDefAndOrders;
    window._ptagToggleTTagCard = _ptagToggleTTagCard;
    window._ptagToggleCreateForm = _ptagToggleCreateForm;
    window._ptagCancelCreateForm = _ptagCancelCreateForm;
    window._ptagConfirmCreateTag = _ptagConfirmCreateTag;
    window._ptagFindByProductCode = _ptagFindByProductCode;
    window._ptagToggleAllSearchResults = _ptagToggleAllSearchResults;
    window._ptagCancelSearchResults = _ptagCancelSearchResults;
    window._ptagConfirmSearchResults = _ptagConfirmSearchResults;
    window._ptagAddSTTsToTag = _ptagAddSTTsToTag;
    window._ptagRemoveSTTsFromTag = _ptagRemoveSTTsFromTag;
    window._ptagRemoveAllFromTag = _ptagRemoveAllFromTag;
    window._ptagRemoveTTagBySTT = _ptagRemoveTTagBySTT;

    // T-tag business logic
    window.assignTTagToOrder = assignTTagToOrder;
    window.removeTTagFromOrder = removeTTagFromOrder;

    // History
    window._ptagShowHistory = _ptagRenderHistoryPopover;

    // State (for debugging)
    window.ProcessingTagState = ProcessingTagState;

    console.log(`${PTAG_LOG} Module loaded`);

})();
