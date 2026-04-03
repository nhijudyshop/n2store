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
        0: { name: 'ĐÃ RA ĐƠN', short: 'ĐÃ RA ĐƠN', icon: 'fa-check-circle', emoji: '🟢' },
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
        OKIE_CHO_DI_DON: { key: 'OKIE_CHO_DI_DON', label: 'OKIE CHỜ ĐI ĐƠN', color: '#3b82f6' },
        CHO_HANG:        { key: 'CHO_HANG',         label: 'CHỜ HÀNG',         color: '#f59e0b' }
    };

    const PTAG_FLAGS = {
        TRU_CONG_NO:  { key: 'TRU_CONG_NO',  label: 'TRỪ CÔNG NỢ', auto: true,  icon: '\u{1F4B0}' },
        CHUYEN_KHOAN: { key: 'CHUYEN_KHOAN', label: 'CK',           auto: true,  icon: '\u{1F4B3}' },
        GIAM_GIA:     { key: 'GIAM_GIA',     label: 'GIẢM GIÁ',    auto: true,  icon: '\u{1F3F7}\uFE0F' },
        CHO_LIVE:     { key: 'CHO_LIVE',     label: 'CHỜ LIVE',     auto: false, icon: '\u{1F4FA}' },
        GIU_DON:      { key: 'GIU_DON',      label: 'GIỮ ĐƠN',     auto: false, icon: '\u{231B}' },
        QUA_LAY:      { key: 'QUA_LAY',      label: 'QUA LẤY',     auto: false, icon: '\u{1F3E0}' },
        GOI_BAO_KHACH_HH: { key: 'GOI_BAO_KHACH_HH', label: 'GỌI BÁO KHÁCH HH', auto: false, icon: '\u{1F4DE}' },
        KHAC:         { key: 'KHAC',         label: 'KHÁC',        auto: false, icon: '\u{1F4CB}', hasNote: true }
    };

    const PTAG_SUBTAGS = {
        // Category 2 — MỤC XỬ LÝ
        CHUA_PHAN_HOI:  { key: 'CHUA_PHAN_HOI',  label: 'ĐƠN CHƯA PHẢN HỒI', category: 2 },
        CHUA_DUNG_SP:   { key: 'CHUA_DUNG_SP',   label: 'ĐƠN CHƯA ĐÚNG SP',  category: 2 },
        KHACH_MUON_XA:  { key: 'KHACH_MUON_XA',  label: 'ĐƠN KHÁCH MUỐN XÃ', category: 2 },
        BAN_HANG:       { key: 'BAN_HANG',        label: 'BÁN HÀNG',           category: 2 },
        XU_LY_KHAC:     { key: 'XU_LY_KHAC',     label: 'KHÁC (GHI CHÚ)',     category: 2, hasNote: true },
        // Category 3 — KHÔNG CẦN CHỐT
        DA_GOP_KHONG_CHOT: { key: 'DA_GOP_KHONG_CHOT', label: 'ĐÃ GỘP KHÔNG CHỐT', category: 3 },
        GIO_TRONG:          { key: 'GIO_TRONG',         label: 'GIỎ TRỐNG',         category: 3 },
        // Category 4 — KHÁCH XÃ
        NCC_HET_HANG:       { key: 'NCC_HET_HANG',      label: 'NCC HẾT HÀNG',              category: 4 },
        KHACH_HUY_DON:      { key: 'KHACH_HUY_DON',     label: 'KHÁCH HỦY NGUYÊN ĐƠN',      category: 4 },
        KHACH_KO_LIEN_LAC:  { key: 'KHACH_KO_LIEN_LAC', label: 'KHÁCH KHÔNG LIÊN LẠC ĐƯỢC', category: 4 }
    };

    const PTAG_TOOLTIPS = {
        // Categories
        cat_0: 'Đơn đã tạo phiếu bán hàng thành công. Tự động khi tạo đơn.',
        cat_1: 'Khách đã xác nhận OK, đơn chờ đủ điều kiện để ra bill.',
        cat_2: 'Đơn cần seller xử lý vấn đề trước khi có thể ra bill.',
        cat_3: 'Đơn không cần xử lý chốt đơn.',
        cat_4: 'Khách hủy hoặc không liên lạc được sau chốt đơn.',
        // Sub-states
        sub_OKIE_CHO_DI_DON: 'Đủ hàng, sẵn sàng ra bill. Không có tag T nào.',
        sub_CHO_HANG: 'Thiếu hàng, chờ hàng về. Có ít nhất 1 tag T.',
        sub_CHO_HANG_DA_IN: 'Đơn chờ hàng đã in phiếu soạn hoặc chỉ có 1 mã SP.',
        sub_CHO_HANG_CHUA_IN: 'Đơn chờ hàng chưa in phiếu soạn.',
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
        subtag_BAN_HANG: 'Khách đang mua thêm, seller đang chào hàng.',
        subtag_XU_LY_KHAC: 'Ghi chú — VD: xử lý bưu cục, khách yêu cầu thêm deal.',
        // Sub-tags cat 3
        subtag_DA_GOP_KHONG_CHOT: 'Đơn khách mua 2 page đã gộp vào 1 đơn khác.',
        subtag_GIO_TRONG: 'Đơn không có SP, đã xử lý trước đó.',
        // Sub-tags cat 4
        subtag_NCC_HET_HANG: 'Báo khách hết hàng hoặc đổi qua mẫu khác.',
        subtag_KHACH_HUY_DON: 'Khách báo lý do không nhận: đi công tác, không có tiền, đổi ý.',
        subtag_KHACH_KO_LIEN_LAC: 'Sau buổi chốt đơn vẫn không liên lạc được, bắt buộc xã.',
        // Flags
        flag_GOI_BAO_KHACH_HH: 'Gọi báo khách hàng hết hàng, chờ phản hồi.'
    };

    const PTAG_SUBTAG_ICONS = {
        CHUA_PHAN_HOI: '💬', CHUA_DUNG_SP: '📦', KHACH_MUON_XA: '🙏',
        NCC_HET_HANG: '🚫', BAN_HANG: '🛒', XU_LY_KHAC: '📋',
        DA_GOP_KHONG_CHOT: '🔗', GIO_TRONG: '🛒',
        KHACH_HUY_DON: '❌', KHACH_KO_LIEN_LAC: '📵'
    };

    // Default T-tags — always present, cannot be deleted, hidden from manager modal
    const DEFAULT_TTAG_DEFS = [
        { id: 'T_MY', name: 'MY THÊM CHỜ VỀ', productCode: '', createdAt: 0, isDefault: true }
    ];

    // ── Flag color palette (for đặc điểm tags) ──
    const PTAG_FLAG_COLOR_PALETTE = [
        '#ef4444', '#f97316', '#f59e0b', '#22c55e', '#14b8a6',
        '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#06b6d4',
        '#84cc16', '#d946ef', '#0ea5e9', '#e11d48', '#7c3aed',
        '#059669', '#dc2626', '#2563eb', '#9333ea', '#c026d3'
    ];

    // T-tag color constants
    const PTAG_TTAG_COLOR_BLUE = '#3b82f6';
    const PTAG_TTAG_COLOR_YELLOW = '#d97706';
    const PTAG_TTAG_YELLOW_NAMES = ['CHỜ HÀNG', 'MY THÊM CHỜ VỀ'];

    function _ptagGetFlagColor(flagKey) {
        const saved = JSON.parse(localStorage.getItem('ptag_flag_colors') || '{}');
        if (saved[flagKey]) return saved[flagKey];
        // For custom flags, check stored color
        const cf = ProcessingTagState.getCustomFlagDef(flagKey);
        if (cf?.color && cf.color !== '#7c3aed') {
            saved[flagKey] = cf.color;
            localStorage.setItem('ptag_flag_colors', JSON.stringify(saved));
            return cf.color;
        }
        // Assign deterministic color based on index in palette
        const builtinKeys = Object.keys(PTAG_FLAGS);
        const idx = builtinKeys.indexOf(flagKey);
        if (idx >= 0) {
            const color = PTAG_FLAG_COLOR_PALETTE[idx % PTAG_FLAG_COLOR_PALETTE.length];
            saved[flagKey] = color;
            localStorage.setItem('ptag_flag_colors', JSON.stringify(saved));
            return color;
        }
        // Random for custom flags without saved color
        const color = PTAG_FLAG_COLOR_PALETTE[Math.floor(Math.random() * PTAG_FLAG_COLOR_PALETTE.length)];
        saved[flagKey] = color;
        localStorage.setItem('ptag_flag_colors', JSON.stringify(saved));
        return color;
    }

    function _ptagSetFlagColor(flagKey, color) {
        const saved = JSON.parse(localStorage.getItem('ptag_flag_colors') || '{}');
        saved[flagKey] = color;
        localStorage.setItem('ptag_flag_colors', JSON.stringify(saved));
        const cf = ProcessingTagState.getCustomFlagDef(flagKey);
        if (cf) {
            cf.color = color;
            saveCustomFlagDefinitions();
        }
    }

    function _ptagGetTTagColor(tagId) {
        const def = ProcessingTagState.getTTagDef(tagId);
        if (!def) return PTAG_TTAG_COLOR_BLUE;
        const nameUpper = (def.name || '').toUpperCase().trim();
        if (PTAG_TTAG_YELLOW_NAMES.includes(nameUpper)) return PTAG_TTAG_COLOR_YELLOW;
        return PTAG_TTAG_COLOR_BLUE;
    }

    // =====================================================
    // SECTION 2: STATE MANAGEMENT
    // =====================================================

    const ProcessingTagState = {
        _orderData: new Map(),         // Key = orderCode (hoặc orderId cho dữ liệu cũ)
        _idToCodeIndex: new Map(),     // orderId → orderCode mapping (lookup ngược)
        _panelOpen: false,
        _panelPinned: JSON.parse(localStorage.getItem('ptag_panel_pinned') || 'false'),
        _activeFilter: null,
        _activeFlagFilters: new Set(),
        _sseSource: null,
        _pollInterval: null,
        _tTagDefinitions: [],
        _customFlagDefs: [],
        _flagsSectionExpanded: false,
        _historyStore: new Map(),  // Key = orderCode, Value = history[] — TÁCH RIÊNG, không bị removeOrder() xóa

        getHistory(orderCode) {
            return this._historyStore.get(String(orderCode)) || [];
        },
        addHistoryEntry(orderCode, entry) {
            const key = String(orderCode);
            if (!this._historyStore.has(key)) this._historyStore.set(key, []);
            const history = this._historyStore.get(key);
            history.push(entry);
            if (history.length > 50) this._historyStore.set(key, history.slice(-50));
        },
        getAllHistoryOrders() {
            return this._historyStore;
        },

        // Primary lookup: bằng orderCode (key chính)
        getOrderData(orderCode) {
            return this._orderData.get(String(orderCode)) || null;
        },
        // Fallback lookup: bằng orderId cho dữ liệu cũ
        getOrderDataByIdFallback(orderId) {
            const code = this._idToCodeIndex.get(String(orderId));
            if (code) return this._orderData.get(code);
            // Dữ liệu cũ không có orderCode: key trong Map chính là orderId
            return this._orderData.get(String(orderId)) || null;
        },
        setOrderData(key, data) {
            this._orderData.set(String(key), data);
            // Xây index ngược: nếu data có orderId, map nó về key
            if (data?.orderId) {
                this._idToCodeIndex.set(String(data.orderId), String(key));
            }
        },
        updateOrder(orderCode, updates) {
            const current = this._orderData.get(String(orderCode));
            if (current) {
                Object.assign(current, updates);
            }
        },
        getOrderFlags(orderCode) {
            return this._orderData.get(String(orderCode))?.flags || [];
        },
        removeOrder(orderCode) {
            this._orderData.delete(String(orderCode));
        },
        hasOrder(orderCode) {
            return this._orderData.has(String(orderCode));
        },
        getAllOrders() {
            return this._orderData;
        },
        clear() {
            this._orderData.clear();
            this._idToCodeIndex.clear();
            this._historyStore.clear();
        },
        getTTagDefinitions() {
            return this._tTagDefinitions;
        },
        setTTagDefinitions(defs) {
            const arr = Array.isArray(defs) ? defs : [];
            // Ensure default T-tags are always present
            for (const def of DEFAULT_TTAG_DEFS) {
                if (!arr.some(d => d.id === def.id)) {
                    arr.unshift({ ...def });
                }
            }
            this._tTagDefinitions = arr;
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
            const pc = def.productCode ? ` · ${def.productCode.toUpperCase()}` : '';
            return `${(def.name || '').toUpperCase()}${pc}`;
        },
        getCustomFlagDefs() {
            return this._customFlagDefs;
        },
        setCustomFlagDefs(defs) {
            this._customFlagDefs = Array.isArray(defs) ? defs : [];
        },
        getCustomFlagDef(flagId) {
            return this._customFlagDefs.find(d => d.id === flagId) || null;
        },
        getCustomFlagLabel(flagId) {
            const def = this._customFlagDefs.find(d => d.id === flagId);
            return def ? (def.label || '').toUpperCase() : flagId;
        }
    };

    // Helper: resolve orderId → orderCode
    function _ptagResolveCode(orderId) {
        // 1. Check index cache trước
        const cached = ProcessingTagState._idToCodeIndex.get(String(orderId));
        if (cached) return cached;
        // 2. Tìm trong allOrders
        const allOrders = (typeof window.getAllOrders === 'function') ? window.getAllOrders() : [];
        const order = allOrders.find(o => String(o.Id) === String(orderId));
        return order?.Code ? String(order.Code) : null;
    }

    // Helper: resolve orderCode → orderId
    function _ptagResolveId(orderCode) {
        const allOrders = (typeof window.getAllOrders === 'function') ? window.getAllOrders() : [];
        const order = allOrders.find(o => String(o.Code) === String(orderCode));
        return order?.Id ? String(order.Id) : null;
    }

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

    async function loadProcessingTags() {
        ProcessingTagState._activeFilter = null;
        try {
            // 1. Load config (T-tag definitions, custom flags) từ endpoint riêng
            const backupCustomFlagDefs = [...ProcessingTagState._customFlagDefs];
            ProcessingTagState.clear();
            let loadedCustomFlags = false;
            try {
                const configResult = await _ptagFetch(`${PTAG_API_BASE}/config`);
                if (configResult.data) {
                    if (configResult.data.__ttag_config__) {
                        ProcessingTagState.setTTagDefinitions(configResult.data.__ttag_config__.tTagDefinitions || []);
                    }
                    if (configResult.data.__ptag_custom_flags__?.customFlagDefs) {
                        ProcessingTagState.setCustomFlagDefs(configResult.data.__ptag_custom_flags__.customFlagDefs);
                        loadedCustomFlags = true;
                    }
                }
            } catch (e) {
                console.warn(`${PTAG_LOG} Failed to load config:`, e);
            }
            if (!loadedCustomFlags && backupCustomFlagDefs.length > 0) {
                ProcessingTagState._customFlagDefs = backupCustomFlagDefs;
                console.log(`${PTAG_LOG} Restored ${backupCustomFlagDefs.length} custom flag defs from backup`);
            }

            // 2. Load ALL order tags bằng batch endpoint (orderCode only)
            const allOrders = (typeof window.getAllOrders === 'function') ? window.getAllOrders() : [];
            const orderCodes = allOrders.map(o => String(o.Code)).filter(Boolean);
            if (orderCodes.length > 0) {
                await loadProcessingTagsByCodes(orderCodes);
            }

            _ptagReconcileIds();
            _ptagCleanupOldHistory();
            renderPanelContent();
            _ptagRefreshAllRows();
            console.log(`${PTAG_LOG} Loaded tags for ${orderCodes.length} orders`);
        } catch (e) {
            console.error(`${PTAG_LOG} Failed to load tags:`, e);
        }
    }

    /**
     * Reconcile dữ liệu cũ (key = orderId) → chuyển sang key = orderCode.
     * Chỉ xử lý entries có key là orderId (UUID dài), không phải orderCode (số ngắn).
     * Dữ liệu mới đã dùng orderCode làm key nên không cần reconcile.
     */
    function _ptagReconcileIds() {
        const allOrders = (typeof window.getAllOrders === 'function') ? window.getAllOrders() : [];
        if (allOrders.length === 0) return;

        const codeToOrder = new Map();
        allOrders.forEach(o => {
            if (o.Code) codeToOrder.set(String(o.Code), o);
        });
        const idToOrder = new Map();
        allOrders.forEach(o => {
            if (o.Id) idToOrder.set(String(o.Id), o);
        });

        const remaps = [];
        for (const [key, data] of ProcessingTagState.getAllOrders()) {
            // Nếu key đã là orderCode (có trong codeToOrder) → đã OK
            if (codeToOrder.has(key)) continue;
            // Nếu key là orderId → cần remap sang orderCode
            const order = idToOrder.get(key);
            if (order?.Code) {
                const newKey = String(order.Code);
                if (newKey !== key) {
                    remaps.push({ oldKey: key, newKey, data });
                }
            } else {
                // Key không match orderId lẫn orderCode → có thể là record từ code cũ
                const code = String(data.code || '');
                if (code && codeToOrder.has(code) && !ProcessingTagState.hasOrder(code)) {
                    remaps.push({ oldKey: key, newKey: code, data });
                }
            }
        }

        for (const { oldKey, newKey, data } of remaps) {
            if (ProcessingTagState.hasOrder(newKey)) continue;
            ProcessingTagState.removeOrder(oldKey);
            data.code = newKey; // Đảm bảo data.code = orderCode
            ProcessingTagState.setOrderData(newKey, data);
            // Save lại bằng orderCode endpoint mới
            saveProcessingTagToAPI(newKey, data);
            console.log(`${PTAG_LOG} Reconciled: ${oldKey} → ${newKey} (orderCode)`);
        }

        if (remaps.length > 0) {
            console.log(`${PTAG_LOG} Reconciled ${remaps.length} legacy entry(ies) to orderCode keys`);
        }
    }

    /**
     * Load processing tags by order codes (cross-campaign, for date mode)
     * @param {string[]} orderCodes - Array of order.Code values
     */
    async function loadProcessingTagsByCodes(orderCodes) {
        if (!orderCodes || orderCodes.length === 0) return;

        // Chunk codes (max 500 per request)
        const CHUNK = 500;
        for (let i = 0; i < orderCodes.length; i += CHUNK) {
            const chunk = orderCodes.slice(i, i + CHUNK);
            try {
                const result = await _ptagFetch(`${PTAG_API_BASE}/batch`, {
                    method: 'POST',
                    body: JSON.stringify({ codes: chunk })
                });
                if (result.data) {
                    for (const [code, tagData] of Object.entries(result.data)) {
                        // Migrate legacy category 5 → CHO_DI_DON + CHO_HANG + pickingSlipPrinted
                        if (tagData.category === 5) {
                            tagData.category = PTAG_CATEGORIES.CHO_DI_DON;
                            tagData.subState = 'CHO_HANG';
                            tagData.pickingSlipPrinted = true;
                        }
                        // Normalize subState
                        if (tagData.category === PTAG_CATEGORIES.CHO_DI_DON) {
                            tagData.subState = (tagData.tTags || []).length > 0 ? 'CHO_HANG' : 'OKIE_CHO_DI_DON';
                        }
                        // Store trực tiếp bằng orderCode
                        ProcessingTagState.setOrderData(code, tagData);
                        // Extract history vào _historyStore (tách riêng khỏi tag data)
                        if (tagData.history && tagData.history.length > 0) {
                            ProcessingTagState._historyStore.set(code, tagData.history);
                        }
                    }
                }
            } catch (e) {
                console.error(`${PTAG_LOG} Batch load chunk failed:`, e);
            }
        }
        console.log(`${PTAG_LOG} Loaded tags by code for ${orderCodes.length} orders`);
    }



    async function saveProcessingTagToAPI(orderCode, data) {
        try {
            const userName = window.authManager?.getAuthState()?.username || '';
            // Gắn history từ _historyStore vào data trước khi gửi lên server
            const dataWithHistory = { ...data, history: ProcessingTagState.getHistory(orderCode) };
            await _ptagFetch(
                `${PTAG_API_BASE}/by-code/${encodeURIComponent(orderCode)}`,
                { method: 'PUT', body: JSON.stringify({ data: dataWithHistory, updatedBy: userName }) }
            );
        } catch (e) {
            console.error(`${PTAG_LOG} Failed to save tag for ${orderCode}:`, e);
        }
    }

    async function saveTTagDefinitions() {
        const data = { tTagDefinitions: ProcessingTagState.getTTagDefinitions() };
        await saveProcessingTagToAPI('__ttag_config__', data);
    }

    async function saveCustomFlagDefinitions() {
        const data = { customFlagDefs: ProcessingTagState.getCustomFlagDefs() };
        await saveProcessingTagToAPI('__ptag_custom_flags__', data);
    }

    async function clearProcessingTagAPI(orderCode) {
        try {
            await _ptagFetch(
                `${PTAG_API_BASE}/by-code/${encodeURIComponent(orderCode)}`,
                { method: 'DELETE' }
            );
        } catch (e) {
            console.error(`${PTAG_LOG} Failed to clear tag for ${orderCode}:`, e);
        }
    }

    // SSE realtime listener
    function setupProcessingTagSSE() {
        // Cleanup previous
        if (ProcessingTagState._sseSource) {
            ProcessingTagState._sseSource.close();
            ProcessingTagState._sseSource = null;
        }
        if (ProcessingTagState._pollInterval) {
            clearInterval(ProcessingTagState._pollInterval);
            ProcessingTagState._pollInterval = null;
        }

        const sseKey = 'processing_tags_global';
        const sseUrl = `https://n2store-fallback.onrender.com/api/realtime/sse?keys=${encodeURIComponent(sseKey)}`;

        try {
            const source = new EventSource(sseUrl);
            ProcessingTagState._sseSource = source;

            source.addEventListener('update', (e) => {
                try {
                    const payload = JSON.parse(e.data);
                    const eventData = payload.data || payload;
                    const { orderCode, data } = eventData;
                    if (!orderCode || !data) return;
                    // Config records
                    if (orderCode === '__ttag_config__') {
                        ProcessingTagState.setTTagDefinitions(data.tTagDefinitions || []);
                        renderPanelContent();
                        return;
                    }
                    if (orderCode === '__ptag_custom_flags__') {
                        if (data.customFlagDefs) {
                            ProcessingTagState.setCustomFlagDefs(data.customFlagDefs);
                        }
                        renderPanelContent();
                        return;
                    }
                    // Order tag update
                    ProcessingTagState.setOrderData(orderCode, data);
                    // Extract history vào _historyStore (tách riêng)
                    if (data.history) {
                        ProcessingTagState._historyStore.set(orderCode, data.history);
                    }
                    _ptagRefreshRow(orderCode);
                    renderPanelContent();
                } catch (err) {
                    console.warn(`${PTAG_LOG} SSE parse error:`, err);
                }
            });

            source.addEventListener('deleted', (e) => {
                try {
                    const payload = JSON.parse(e.data);
                    const { orderCode } = payload.data || payload;
                    if (orderCode) {
                        ProcessingTagState.removeOrder(orderCode);
                        _ptagRefreshRow(orderCode);
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
                _ptagStartPolling();
            };

            console.log(`${PTAG_LOG} SSE connected for ${sseKey}`);
        } catch (e) {
            console.warn(`${PTAG_LOG} SSE failed, using polling:`, e);
            _ptagStartPolling();
        }
    }

    function _ptagStartPolling() {
        if (ProcessingTagState._pollInterval) return;
        ProcessingTagState._pollInterval = setInterval(() => {
            loadProcessingTags();
        }, 15000);
        console.log(`${PTAG_LOG} Polling started (15s interval)`);
    }

    function _ptagRefreshRow(orderCode) {
        // Resolve orderCode → orderId cho DOM query (data-order-id vẫn dùng orderId)
        const orderId = _ptagResolveId(orderCode);
        const row = orderId ? document.querySelector(`tr[data-order-id="${orderId}"]`) : null;
        if (!row) return;
        const cell = row.querySelector('td[data-column="processing-tag"]');
        if (!cell) return;
        cell.innerHTML = renderProcessingTagCell(orderCode);

        // Re-filter table if any processing tag filter is active
        if (hasActiveProcessingTagFilters() && typeof window.performTableSearch === 'function') {
            clearTimeout(_ptagRefreshFilterTimer);
            _ptagRefreshFilterTimer = setTimeout(() => window.performTableSearch(), 50);
        }
    }
    let _ptagRefreshFilterTimer = null;

    function _ptagRefreshAllRows() {
        // Re-render all visible processing tag cells after bulk load
        const cells = document.querySelectorAll('td[data-column="processing-tag"]');
        cells.forEach(cell => {
            const row = cell.closest('tr');
            if (!row) return;
            const orderId = row.getAttribute('data-order-id');
            if (!orderId) return;
            const orderCode = _ptagResolveCode(orderId);
            if (!orderCode) return;
            cell.innerHTML = renderProcessingTagCell(orderCode);
        });
    }

    // =====================================================
    // SECTION 4: CORE BUSINESS LOGIC
    // =====================================================

    async function assignOrderCategory(orderCode, category, options = {}) {
        const existingData = ProcessingTagState.getOrderData(orderCode);
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

            // Auto picking slip for single-SKU CHO_HANG orders
            if (data.subState === 'CHO_HANG') {
                data.pickingSlipPrinted = await _ptagIsSingleSkuOrder(orderCode);
            }

            // Auto-detect flags from wallet
            const phone = _ptagGetOrderPhone(orderCode);
            if (phone) {
                const autoFlags = await autoDetectFlags(orderCode, phone);
                data.flags = [...new Set([...data.flags, ...autoFlags])];
            }
        }

        _ptagEnsureCode(orderCode, data);
        ProcessingTagState.setOrderData(orderCode, data);

        // Log history
        const catValue = `${category}:${options.subTag || ''}`;
        _ptagAddHistory(orderCode, 'SET_CATEGORY', catValue);
        // Log auto-detected flags
        if (category === PTAG_CATEGORIES.CHO_DI_DON) {
            const autoFlags = data.flags.filter(f => !existingFlags.includes(f) && !newFlags.includes(f));
            autoFlags.forEach(f => _ptagAddHistory(orderCode, 'ADD_FLAG', f, 'Hệ thống'));
        }

        _ptagRefreshRow(orderCode);
        renderPanelContent();
        await saveProcessingTagToAPI(orderCode, data);
    }

    async function autoDetectFlags(orderCode, phone) {
        const existingFlags = ProcessingTagState.getOrderFlags(orderCode);
        const newFlags = [];

        // Wallet CK + Công nợ: đã chuyển sang tab1-qr-debt.js (auto khi badge hiển thị)

        // Order Discount → Giảm giá
        try {
            const order = ((typeof window.getAllOrders === 'function') ? window.getAllOrders() : []).find(o => String(o.Code) === String(orderCode));
            if (order && parseFloat(order.Discount || 0) > 0 && !existingFlags.includes('GIAM_GIA')) {
                newFlags.push('GIAM_GIA');
            }
        } catch (e) {
            console.warn(`${PTAG_LOG} Discount check failed:`, e);
        }

        return newFlags;
    }

    async function toggleOrderFlag(orderCode, flagKey) {
        let data = ProcessingTagState.getOrderData(orderCode);
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

        _ptagEnsureCode(orderCode, data);
        ProcessingTagState.setOrderData(orderCode, data);
        _ptagAddHistory(orderCode, isAdding ? 'ADD_FLAG' : 'REMOVE_FLAG', flagKey);
        _ptagRefreshRow(orderCode);
        renderPanelContent();
        await saveProcessingTagToAPI(orderCode, data);
    }

    async function clearProcessingTag(orderCode) {
        const data = ProcessingTagState.getOrderData(orderCode);
        const removedValue = data ? `${data.category}:${data.subTag || ''}` : '';
        _ptagAddHistory(orderCode, 'REMOVE_CATEGORY', removedValue);
        if (data) {
            const hasFlags = (data.flags || []).length > 0;
            const hasTTags = (data.tTags || []).length > 0;
            if (hasFlags || hasTTags) {
                // Keep flags + tTags, only clear category/subTag/subState
                data.category = null;
                data.subTag = null;
                data.subState = null;
                ProcessingTagState.setOrderData(orderCode, data);
                _ptagRefreshRow(orderCode);
                renderPanelContent();
                await saveProcessingTagToAPI(orderCode, data);
                return;
            }
        }
        // Nothing left → xóa tag data local, nhưng giữ history trên server
        const history = ProcessingTagState.getHistory(orderCode);
        ProcessingTagState.removeOrder(orderCode);
        _ptagRefreshRow(orderCode);
        renderPanelContent();
        if (history.length > 0) {
            // PUT history-only để server giữ history (không gọi DELETE)
            const userName = window.authManager?.getAuthState()?.username || '';
            await _ptagFetch(
                `${PTAG_API_BASE}/by-code/${encodeURIComponent(orderCode)}`,
                { method: 'PUT', body: JSON.stringify({ data: { history }, updatedBy: userName }) }
            );
        } else {
            await clearProcessingTagAPI(orderCode);
        }
    }

    // T-tag assignment functions — works for ANY order state
    async function assignTTagToOrder(orderCode, tagId) {
        let data = ProcessingTagState.getOrderData(orderCode);
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
            // Auto picking slip for single-SKU orders
            if (await _ptagIsSingleSkuOrder(orderCode)) {
                data.pickingSlipPrinted = true;
            }
        }
        _ptagEnsureCode(orderCode, data);
        ProcessingTagState.setOrderData(orderCode, data);
        _ptagAddHistory(orderCode, 'ADD_TTAG', tagId);
        _ptagRefreshRow(orderCode);
        renderPanelContent();
        await saveProcessingTagToAPI(orderCode, data);
    }

    async function removeTTagFromOrder(orderCode, tagId) {
        const data = ProcessingTagState.getOrderData(orderCode);
        if (!data) return;
        data.tTags = (data.tTags || []).filter(t => t !== tagId);
        // Auto sub-state ONLY when at Cat 1 "Chờ Hàng" and all T-tags removed
        if (data.category === PTAG_CATEGORIES.CHO_DI_DON && data.subState === 'CHO_HANG' && data.tTags.length === 0) {
            data.subState = 'OKIE_CHO_DI_DON';
        }
        _ptagEnsureCode(orderCode, data);
        ProcessingTagState.setOrderData(orderCode, data);
        _ptagAddHistory(orderCode, 'REMOVE_TTAG', tagId);
        _ptagRefreshRow(orderCode);
        renderPanelContent();
        await saveProcessingTagToAPI(orderCode, data);
    }

    // Transfer processing tags (flags + tTags) from source order to target order
    // Used when redirecting from "ĐÃ GỘP KO CHỐT" order to replacement order
    // Only merges flags + tTags, does NOT touch category/subTag of target
    async function transferProcessingTags(sourceOrderCode, targetOrderCode) {
        const sourceData = ProcessingTagState.getOrderData(sourceOrderCode);
        if (!sourceData) return { transferred: false, reason: 'no_source_data' };

        const sourceFlags = sourceData.flags || [];
        const sourceTTags = sourceData.tTags || [];
        if (sourceFlags.length === 0 && sourceTTags.length === 0) {
            return { transferred: false, reason: 'nothing_to_transfer' };
        }

        console.log(`${PTAG_LOG} Transferring processing tags from ${sourceOrderCode} to ${targetOrderCode} (flags: ${sourceFlags.length}, tTags: ${sourceTTags.length})`);

        // Get or create target data
        let targetData = ProcessingTagState.getOrderData(targetOrderCode) || {
            category: null, subTag: null, subState: null,
            flags: [], tTags: [], note: '', assignedAt: Date.now()
        };

        // Union merge flags (add flags from source that target doesn't have)
        const targetFlags = targetData.flags || [];
        const newFlags = sourceFlags.filter(f => !targetFlags.includes(f));
        targetData.flags = [...targetFlags, ...newFlags];

        // Union merge tTags
        const targetTTags = targetData.tTags || [];
        const newTTags = sourceTTags.filter(t => !targetTTags.includes(t));
        targetData.tTags = [...targetTTags, ...newTTags];

        // Auto subState for category 1 CHO_DI_DON when tTags added
        if (targetData.category === PTAG_CATEGORIES.CHO_DI_DON && targetData.tTags.length > 0) {
            targetData.subState = 'CHO_HANG';
        }

        _ptagEnsureCode(targetOrderCode, targetData);
        ProcessingTagState.setOrderData(targetOrderCode, targetData);

        // History
        _ptagAddHistory(targetOrderCode, 'TRANSFER_IN', sourceOrderCode);
        _ptagAddHistory(sourceOrderCode, 'TRANSFER_OUT', targetOrderCode);

        // Clear source flags + tTags (keep category untouched)
        sourceData.flags = [];
        sourceData.tTags = [];
        ProcessingTagState.setOrderData(sourceOrderCode, sourceData);

        // Save both to API
        await saveProcessingTagToAPI(targetOrderCode, targetData);
        await saveProcessingTagToAPI(sourceOrderCode, sourceData);

        // Refresh UI
        _ptagRefreshRow(targetOrderCode);
        _ptagRefreshRow(sourceOrderCode);
        renderPanelContent();

        console.log(`${PTAG_LOG} Transfer complete: ${newFlags.length} flags, ${newTTags.length} tTags added to ${targetOrderCode}`);
        return {
            transferred: true,
            flagsAdded: newFlags,
            tTagsAdded: newTTags
        };
    }

    // DEPRECATED — T-tags now managed internally, not from TPOS
    // Kept as no-op to avoid breaking call sites in tab1-tags.js
    function onPtagOrderTagsChanged(orderId, newTags) {
        // no-op
    }

    // Auto transition: bill created → ĐÃ RA ĐƠN
    // saleOnlineId = orderId từ TPOS, cần resolve sang orderCode
    function onPtagBillCreated(saleOnlineId) {
        const orderCode = _ptagResolveCode(saleOnlineId) || saleOnlineId;
        let data = ProcessingTagState.getOrderData(orderCode) || ProcessingTagState.getOrderDataByIdFallback(saleOnlineId);

        if (!data) {
            data = { category: null, subTag: null, subState: null, flags: [], tTags: [], note: '', assignedAt: Date.now() };
        }

        // Already in ĐÃ RA ĐƠN → skip
        if (data.category === PTAG_CATEGORIES.HOAN_TAT) return;

        const snapshot = {
            category: data.category,
            subTag: data.subTag,
            subState: data.subState,
            flags: [...(data.flags || [])],
            tTags: [...(data.tTags || [])],
            note: data.note
        };

        // Keep flags + tTags, only change category
        data.category = PTAG_CATEGORIES.HOAN_TAT;
        data.subTag = null;
        data.subState = null;
        data.assignedAt = Date.now();
        data.previousPosition = snapshot;

        _ptagEnsureCode(orderCode, data);
        ProcessingTagState.setOrderData(orderCode, data);
        _ptagAddHistory(orderCode, 'AUTO_HOAN_TAT', '', 'Hệ thống');
        _ptagRefreshRow(orderCode);
        renderPanelContent();
        saveProcessingTagToAPI(orderCode, data);
    }

    // Auto transition: packing slip printed → mark pickingSlipPrinted
    // saleOnlineId = orderId từ TPOS, cần resolve sang orderCode
    function onPtagPackingSlipPrinted(saleOnlineId) {
        const orderCode = _ptagResolveCode(saleOnlineId) || saleOnlineId;
        let data = ProcessingTagState.getOrderData(orderCode) || ProcessingTagState.getOrderDataByIdFallback(saleOnlineId);

        if (!data) {
            data = { category: null, subTag: null, subState: null, flags: [], tTags: [], note: '', assignedAt: Date.now() };
        }

        // Already printed → skip
        if (data.pickingSlipPrinted) return;

        data.pickingSlipPrinted = true;

        // Nếu chưa có category → set CHO_DI_DON + CHO_HANG
        if (data.category === null || data.category === undefined) {
            data.category = PTAG_CATEGORIES.CHO_DI_DON;
            data.subState = 'CHO_HANG';
            data.assignedAt = Date.now();
        }

        _ptagEnsureCode(orderCode, data);
        ProcessingTagState.setOrderData(orderCode, data);
        _ptagAddHistory(orderCode, 'AUTO_PHIEU_SOAN', '', 'Hệ thống');
        _ptagRefreshRow(orderCode);
        renderPanelContent();
        saveProcessingTagToAPI(orderCode, data);
    }

    // Auto rollback: bill cancelled → restore previous position
    // saleOnlineId = orderId từ TPOS, cần resolve sang orderCode
    function onPtagBillCancelled(saleOnlineId) {
        const orderCode = _ptagResolveCode(saleOnlineId) || saleOnlineId;
        const data = ProcessingTagState.getOrderData(orderCode) || ProcessingTagState.getOrderDataByIdFallback(saleOnlineId);
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

        // Migrate legacy category 5 in restored data
        if (restored.category === 5) {
            restored.category = PTAG_CATEGORIES.CHO_DI_DON;
            restored.subState = (restored.tTags || []).length > 0 ? 'CHO_HANG' : 'OKIE_CHO_DI_DON';
            restored.pickingSlipPrinted = true;
        }

        _ptagEnsureCode(orderCode, restored);
        ProcessingTagState.setOrderData(orderCode, restored);
        _ptagAddHistory(orderCode, 'AUTO_ROLLBACK', '', 'Hệ thống');
        _ptagRefreshRow(orderCode);
        renderPanelContent();
        saveProcessingTagToAPI(orderCode, restored);
    }

    // Helpers
    function _ptagGetOrderPhone(orderCode) {
        const order = ((typeof window.getAllOrders === 'function') ? window.getAllOrders() : []).find(o => String(o.Code) === String(orderCode));
        return order?.Telephone || order?.Phone || '';
    }

    /** Check if order has only 1 unique product code (for auto picking slip) */
    async function _ptagIsSingleSkuOrder(orderCode) {
        try {
            if (!window.tokenManager) return false;
            // OData API cần orderId, resolve từ orderCode
            const orderId = _ptagResolveId(orderCode);
            if (!orderId) return false;
            const resp = await window.tokenManager.authenticatedFetch(
                `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})?$expand=Details`,
                { headers: { 'accept': 'application/json', 'content-type': 'application/json' } }
            );
            if (!resp.ok) return false;
            const data = await resp.json();
            const details = data.Details || [];
            if (details.length === 0) return false;
            const uniqueCodes = new Set(details.map(d => (d.ProductCode || '').toUpperCase()).filter(c => c));
            return uniqueCodes.size === 1;
        } catch (e) {
            console.warn(`${PTAG_LOG} Failed to fetch order details for single-SKU check:`, e);
            return false;
        }
    }

    /** Ensure data.code = orderCode (for cross-referencing) */
    function _ptagEnsureCode(orderCode, data) {
        if (!data.code) {
            data.code = orderCode;
        }
    }

    // =====================================================
    // SECTION 5: UI — TABLE CELL RENDERING
    // =====================================================

    function renderProcessingTagCell(orderCode) {
        const data = ProcessingTagState.getOrderData(orderCode);

        // Buttons row: [🏷 tags] [⏰ wait] [✓ ok] — identical to TPOS tag column
        const btns = `<div class="ptag-cell-buttons">` +
            `<button class="ptag-tag-btn" onclick="window._ptagOpenDropdown('${orderCode}', this); event.stopPropagation();" title="Chọn trạng thái"><i class="fas fa-tags"></i></button>` +
            `<button class="ptag-quick-btn ptag-quick-btn--wait" onclick="window._ptagQuickAssign('${orderCode}', 'wait'); event.stopPropagation();" title="Đơn chưa phản hồi"><i class="fas fa-clock"></i></button>` +
            `<button class="ptag-quick-btn ptag-quick-btn--ok" onclick="window._ptagQuickAssign('${orderCode}', 'ok'); event.stopPropagation();" title="Okie Chờ Đi Đơn"><i class="fas fa-check"></i></button>` +
            `</div>`;

        if (!data) {
            return `<div class="ptag-cell">${btns}</div>`;
        }

        // Build badges: tag xử lý → flags → tTags (display priority order)
        // All badges have × button for quick removal
        let badges = '';
        const oc = orderCode; // shorthand for onclick

        // 1. Category badge (tag xử lý) — FIRST — with × to remove
        if (data.category !== null && data.category !== undefined) {
            const catColor = PTAG_CATEGORY_COLORS[data.category];
            const removeBtn = `<button class="ptag-badge-remove" onclick="window._ptagClear('${oc}'); event.stopPropagation();" title="Xóa tag">&times;</button>`;
            if (data.category === PTAG_CATEGORIES.HOAN_TAT) {
                badges += `<span class="ptag-badge ptag-cat-0">🟢 ĐÃ RA ĐƠN</span>`;
            } else if (data.category === PTAG_CATEGORIES.CHO_DI_DON) {
                const ss = PTAG_SUBSTATES[data.subState] || PTAG_SUBSTATES.OKIE_CHO_DI_DON;
                let label = ss.label;
                let badgeColor = ss.color;
                const printIcon = (data.subState === 'CHO_HANG' && data.pickingSlipPrinted)
                    ? ' <i class="fas fa-print" style="font-size:10px;color:#10b981;margin-left:3px;"></i>' : '';
                badges += `<span class="ptag-badge ptag-badge-removable" style="border-color:${badgeColor};color:${badgeColor};background:${badgeColor}12;">${label}${printIcon}${removeBtn}</span>`;
            } else {
                const subTagDef = PTAG_SUBTAGS[data.subTag];
                const label = subTagDef?.label || PTAG_CATEGORY_META[data.category]?.short || '';
                badges += `<span class="ptag-badge ptag-badge-removable" style="border-color:${catColor.border};color:${catColor.text};background:${catColor.bg};">${label}${removeBtn}</span>`;
            }
        }

        // 2. Flag badges (đặc điểm) — inline row
        let flagBadges = '';
        (data.flags || []).forEach(f => {
            const fl = PTAG_FLAGS[f];
            const label = fl ? fl.label : ProcessingTagState.getCustomFlagLabel(f);
            const bgColor = _ptagGetFlagColor(f);
            const removeBtn = `<button class="ptag-badge-remove" onclick="window._ptagToggleFlag('${oc}', '${f}'); event.stopPropagation();" title="Xóa flag">&times;</button>`;
            flagBadges += `<span class="ptag-flag-badge ptag-badge-removable" style="background:${bgColor};">${label}${removeBtn}</span>`;
        });

        // 3. T-tag badges — each on its own line
        let ttagBadges = '';
        const _tTags = data.tTags || [];
        _tTags.forEach(t => {
            const tLabel = ProcessingTagState.getTTagLabel(t);
            const bgColor = _ptagGetTTagColor(t);
            const removeBtn = `<button class="ptag-badge-remove" onclick="window.removeTTagFromOrder('${oc}', '${t.replace(/'/g, "\\'")}'); event.stopPropagation();" title="Gỡ tag T">&times;</button>`;
            ttagBadges += `<span class="ptag-ttag-badge ptag-badge-removable" style="background:${bgColor};">${tLabel}${removeBtn}</span>`;
        });

        // History button (only when there's history)
        const hasHistory = (data.history || []).length > 0;
        const historyBtn = hasHistory ? `<button class="ptag-history-btn" onclick="window._ptagShowHistory('${oc}', this); event.stopPropagation();" title="Xem lịch sử tag"><i class="fas fa-history"></i></button>` : '';

        let badgesContent = badges;
        if (flagBadges) badgesContent += `<div class="ptag-cell-flags-row">${flagBadges}</div>`;
        if (ttagBadges) badgesContent += `<div class="ptag-cell-ttag-row">${ttagBadges}</div>`;
        const badgesRow = badgesContent ? `<div class="ptag-cell-badges">${badgesContent}${historyBtn}</div>` : '';
        return `<div class="ptag-cell">${btns}${badgesRow}</div>`;
    }

    // =====================================================
    // SECTION 6: UI — DROPDOWN
    // =====================================================

    let _currentDropdown = null;
    let _ddOrderCode = null;

    // Build the full list of all tags for the dropdown (flat, grouped by category)
    function _ptagBuildAllTags() {
        const tags = [];
        // Cat 1 — CHỜ ĐI ĐƠN
        tags.push({ type: 'cat-label', label: `${PTAG_CATEGORY_META[1].emoji} CHỜ ĐI ĐƠN` });
        tags.push({ type: 'tag', key: 'cat:1:null', label: 'OKIE CHỜ ĐI ĐƠN', isCat: true, cat: 1, subTag: null, color: PTAG_CATEGORY_COLORS[1].border });
        // T-tag button
        tags.push({ type: 'tag', key: 'ttag-btn', label: '📦 Tag T Chờ Hàng', isTTagBtn: true, color: '#8b5cf6' });
        // Cat 2 — XỬ LÝ
        tags.push({ type: 'cat-label', label: `${PTAG_CATEGORY_META[2].emoji} MỤC XỬ LÝ` });
        for (const [key, st] of Object.entries(PTAG_SUBTAGS)) {
            if (st.category !== 2) continue;
            tags.push({ type: 'tag', key: `cat:2:${key}`, label: st.label, isCat: true, cat: 2, subTag: key, color: PTAG_CATEGORY_COLORS[2].border });
        }
        // Đã in phiếu soạn — toggle pickingSlipPrinted on CHO_HANG orders
        tags.push({ type: 'tag', key: 'picking-slip', label: '📋 Đã in phiếu soạn', isPickingSlip: true, color: '#10b981' });
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
        tags.push({ type: 'tag', key: 'cat:0:null', label: 'ĐÃ RA ĐƠN', isCat: true, cat: 0, subTag: null, color: PTAG_CATEGORY_COLORS[0].border });
        // Flags — ĐẶC ĐIỂM ĐƠN HÀNG
        tags.push({ type: 'cat-label', label: '🏷️ ĐẶC ĐIỂM ĐƠN HÀNG' });
        for (const [key, flag] of Object.entries(PTAG_FLAGS)) {
            tags.push({ type: 'tag', key: `flag:${key}`, label: `${flag.icon} ${flag.label}`, isFlag: true, flagKey: key, color: _ptagGetFlagColor(key), auto: flag.auto });
        }
        // Custom flags
        const customFlagDefs = ProcessingTagState.getCustomFlagDefs();
        for (const cf of customFlagDefs) {
            tags.push({ type: 'tag', key: `flag:${cf.id}`, label: (cf.label || '').toUpperCase(), isFlag: true, flagKey: cf.id, color: _ptagGetFlagColor(cf.id) });
        }
        // All T-tag definitions — shown at bottom of dropdown as direct toggle
        tags.push({ type: 'cat-label', label: '📦 TAG T CHỜ HÀNG' });
        const allTTagDefs = ProcessingTagState.getTTagDefinitions();
        for (const def of allTTagDefs) {
            tags.push({ type: 'tag', key: `dtag:${def.id}`, label: def.name, isTTag: true, ttagId: def.id, color: _ptagGetTTagColor(def.id) });
        }
        return tags;
    }

    // Get pill color for a selected tag
    function _ptagPillColor(tagInfo) {
        if (tagInfo.isPickingSlip) return '#10b981';
        if (tagInfo.isCat) return tagInfo.color;
        if (tagInfo.isFlag) return _ptagGetFlagColor(tagInfo.flagKey);
        if (tagInfo.isDefaultTTag || tagInfo.isTTag) return _ptagGetTTagColor(tagInfo.ttagId);
        return '#6b7280';
    }

    // Get all currently selected tags for an order as tag-info objects
    function _ptagGetSelectedTags(orderCode) {
        const data = ProcessingTagState.getOrderData(orderCode);
        if (!data) return [];
        const selected = [];
        // Category tag
        if (data.category !== null && data.category !== undefined) {
            const catColor = PTAG_CATEGORY_COLORS[data.category];
            if (data.category === PTAG_CATEGORIES.CHO_DI_DON) {
                selected.push({ key: 'cat:1:null', label: 'OKIE CHỜ ĐI ĐƠN', isCat: true, cat: 1, subTag: null, color: catColor.border });
            } else if (data.category === PTAG_CATEGORIES.HOAN_TAT) {
                selected.push({ key: 'cat:0:null', label: 'ĐÃ RA ĐƠN', isCat: true, cat: 0, subTag: null, color: catColor.border });
            } else {
                const st = PTAG_SUBTAGS[data.subTag];
                const label = st?.label || PTAG_CATEGORY_META[data.category]?.short || '';
                selected.push({ key: `cat:${data.category}:${data.subTag}`, label, isCat: true, cat: data.category, subTag: data.subTag, color: catColor.border });
            }
        }
        // Picking slip status
        if (data.pickingSlipPrinted) {
            selected.push({ key: 'picking-slip', label: '📋 Đã in phiếu soạn', isPickingSlip: true, color: '#10b981' });
        }
        // Flags
        (data.flags || []).forEach(f => {
            const fl = PTAG_FLAGS[f];
            if (fl) {
                selected.push({ key: `flag:${f}`, label: `${fl.icon} ${fl.label}`, isFlag: true, flagKey: f, color: _ptagGetFlagColor(f) });
            } else {
                const cf = ProcessingTagState.getCustomFlagDef(f);
                if (cf) selected.push({ key: `flag:${f}`, label: (cf.label || '').toUpperCase(), isFlag: true, flagKey: f, color: _ptagGetFlagColor(f) });
            }
        });
        // All assigned T-tags
        (data.tTags || []).forEach(t => {
            const def = ProcessingTagState.getTTagDef(t);
            if (def) {
                selected.push({ key: `dtag:${t}`, label: def.name, isTTag: true, ttagId: t, color: _ptagGetTTagColor(t) });
            }
        });
        return selected;
    }

    function _ptagOpenDropdown(orderCode, anchorEl) {
        _ptagCloseDropdown();

        const rect = anchorEl.getBoundingClientRect();
        _ddOrderCode = orderCode;
        const allTags = _ptagBuildAllTags();
        const selectedTags = _ptagGetSelectedTags(orderCode);
        const selectedKeys = new Set(selectedTags.map(t => t.key));

        // Build HTML
        let html = `<div class="ptag-dropdown" id="ptag-dropdown" data-order-code="${orderCode}">`;

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
        const orderCode = _ddOrderCode;
        if (!orderCode) return;

        if (key === 'ttag-btn') {
            _ptagCloseDropdown();
            _ptagOpenTTagModal(orderCode);
            return;
        }

        if (key === 'picking-slip') {
            // Toggle pickingSlipPrinted on current order
            let data = ProcessingTagState.getOrderData(orderCode);
            if (data) {
                data.pickingSlipPrinted = !data.pickingSlipPrinted;
                _ptagAddHistory(orderCode, data.pickingSlipPrinted ? 'SET_PHIEU_SOAN' : 'UNSET_PHIEU_SOAN', '', '');
                ProcessingTagState.setOrderData(orderCode, data);
                _ptagRefreshRow(orderCode);
                renderPanelContent();
                _ptagEnsureCode(orderCode, data);
                saveProcessingTagToAPI(orderCode, data);
            }
            _ptagRefreshDropdownState();
            return;
        }

        if (key.startsWith('dtag:')) {
            // Default T-tag — toggle directly
            const ttagId = key.replace('dtag:', '');
            const data = ProcessingTagState.getOrderData(orderCode);
            const hasTTag = data?.tTags?.includes(ttagId);
            if (hasTTag) {
                removeTTagFromOrder(orderCode, ttagId);
            } else {
                assignTTagToOrder(orderCode, ttagId);
            }
        } else if (key.startsWith('cat:')) {
            // Processing tag — parse cat:N:subTag
            const parts = key.split(':');
            const cat = parseInt(parts[1]);
            const subTag = parts[2] === 'null' ? null : parts[2];
            // This replaces any existing processing tag (implicit rule)
            assignOrderCategory(orderCode, cat, { subTag });
        } else if (key.startsWith('flag:')) {
            const flagKey = key.replace('flag:', '');
            toggleOrderFlag(orderCode, flagKey);
        }

        // Refresh dropdown pills and selected state (don't close — TPOS style)
        _ptagRefreshDropdownState();
    }

    // Remove a pill from dropdown
    function _ptagDdRemovePill(key) {
        const orderCode = _ddOrderCode;
        if (!orderCode) return;

        if (key === 'picking-slip') {
            // Remove picking slip status
            const data = ProcessingTagState.getOrderData(orderCode);
            if (data) {
                data.pickingSlipPrinted = false;
                _ptagAddHistory(orderCode, 'UNSET_PHIEU_SOAN', '', '');
                ProcessingTagState.setOrderData(orderCode, data);
                _ptagRefreshRow(orderCode);
                renderPanelContent();
                _ptagEnsureCode(orderCode, data);
                saveProcessingTagToAPI(orderCode, data);
            }
        } else if (key.startsWith('dtag:')) {
            const ttagId = key.replace('dtag:', '');
            removeTTagFromOrder(orderCode, ttagId);
        } else if (key.startsWith('cat:')) {
            // Remove processing tag = clear category
            clearProcessingTag(orderCode);
        } else if (key.startsWith('flag:')) {
            const flagKey = key.replace('flag:', '');
            toggleOrderFlag(orderCode, flagKey);
        }

        _ptagRefreshDropdownState();
    }

    // Refresh pills and selected states in open dropdown
    function _ptagRefreshDropdownState() {
        const dd = _currentDropdown;
        if (!dd) return;
        const orderCode = _ddOrderCode;
        const selectedTags = _ptagGetSelectedTags(orderCode);
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
                const val = input.value.trim();
                // Detect T-tag pattern: "T<digits> <name>" → create Tag T chờ hàng
                if (/^T\d+\s+.+/i.test(val)) {
                    _ptagCreateTTagFromInput(val);
                } else {
                    // No match — create custom tag (tag đặc điểm)
                    _ptagCreateCustomTag(val);
                }
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
    async function _ptagCreateCustomTag(label) {
        const orderCode = _ddOrderCode;
        if (!orderCode) return;
        const key = 'CUSTOM_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        const assignedColor = PTAG_FLAG_COLOR_PALETTE[Math.floor(Math.random() * PTAG_FLAG_COLOR_PALETTE.length)];
        const defs = ProcessingTagState.getCustomFlagDefs();
        defs.push({ id: key, label: label.toUpperCase(), color: assignedColor, createdAt: Date.now() });
        // Save color to localStorage directly (avoid _ptagSetFlagColor which triggers duplicate saveCustomFlagDefinitions)
        const _savedColors = JSON.parse(localStorage.getItem('ptag_flag_colors') || '{}');
        _savedColors[key] = assignedColor;
        localStorage.setItem('ptag_flag_colors', JSON.stringify(_savedColors));
        ProcessingTagState.setCustomFlagDefs(defs);
        // Save definitions FIRST to ensure label is persisted
        await saveCustomFlagDefinitions();
        // THEN toggle flag on order
        await toggleOrderFlag(orderCode, key);
        _ptagRefreshDropdownState();
    }

    // Create Tag T chờ hàng from dropdown input (when name matches "Tx ..." pattern)
    async function _ptagCreateTTagFromInput(label) {
        const orderCode = _ddOrderCode;
        if (!orderCode) return;
        const name = label.toUpperCase();

        // Auto-generate next available ID (same logic as _ttagMgrConfirmCreate)
        const defs = ProcessingTagState.getTTagDefinitions();
        let nextNum = 1;
        for (const d of defs) {
            const match = d.id.match(/^T(\d+)/);
            if (match) nextNum = Math.max(nextNum, parseInt(match[1]) + 1);
        }
        const tagId = `T${nextNum}`;

        // Create T-tag definition
        const newDef = { id: tagId, name: name, productCode: '', createdAt: Date.now() };
        defs.push(newDef);
        ProcessingTagState.setTTagDefinitions(defs);
        await saveTTagDefinitions();

        // Assign to order
        await assignTTagToOrder(orderCode, tagId);

        console.log(`${PTAG_LOG} Created T-tag from dropdown: ${tagId} "${name}"`);

        // Rebuild dropdown to include new tag & refresh state
        _ptagRebuildDropdownList();
        _ptagRefreshDropdownState();
    }

    // Rebuild the tag list inside an open dropdown (after adding new T-tag)
    function _ptagRebuildDropdownList() {
        const dd = _currentDropdown;
        if (!dd) return;
        const orderCode = _ddOrderCode;
        const allTags = _ptagBuildAllTags();
        const selectedTags = _ptagGetSelectedTags(orderCode);
        const selectedKeys = new Set(selectedTags.map(t => t.key));

        const listEl = dd.querySelector('.ptag-dd-list');
        if (!listEl) return;

        let html = '';
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
        listEl.innerHTML = html;

        // Re-attach click handlers
        listEl.querySelectorAll('.ptag-dd-tag-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                _ptagDdSelectTag(item.dataset.key);
            });
        });
    }

    function _ptagCloseDropdown() {
        if (_currentDropdown) {
            _currentDropdown.remove();
            _currentDropdown = null;
        }
        _ddOrderCode = null;
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
                const match = !norm || _ptagMatchTokens(search, norm);
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

    function _ptagAssign(orderCode, category, subTag) {
        assignOrderCategory(orderCode, category, { subTag });
    }

    function _ptagToggleFlag(orderCode, flagKey) {
        toggleOrderFlag(orderCode, flagKey);
    }

    function _ptagClear(orderCode) {
        clearProcessingTag(orderCode);
    }

    // =====================================================
    // SECTION 7: UI — PANEL (SIDEBAR)
    // =====================================================

    function _ptagQuickAssign(orderCode, type) {
        if (type === 'ok') {
            assignOrderCategory(orderCode, PTAG_CATEGORIES.CHO_DI_DON, { subTag: null });
        } else if (type === 'wait') {
            assignOrderCategory(orderCode, PTAG_CATEGORIES.XU_LY, { subTag: 'CHUA_PHAN_HOI' });
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
                    <button class="ptag-panel-btn" title="Lịch sử Tag" onclick="window._ptagOpenGlobalHistory()" style="color:#3b82f6;">
                        <i class="fas fa-clock-rotate-left"></i>
                    </button>
                    <button class="ptag-panel-btn" id="ptag-cleanup-btn" title="Xóa Tag Đặc Điểm và Tag T chờ hàng không còn đơn" onclick="window._ptagCleanupEmptyTags()">
                        <i class="fas fa-trash"></i>
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

        const allOrders = (typeof window.getEmployeeFilteredOrders === 'function')
            ? window.getEmployeeFilteredOrders()
            : ((typeof window.getAllOrders === 'function') ? window.getAllOrders() : []);
        const taggedOrders = ProcessingTagState.getAllOrders();
        const totalOrders = allOrders.length;

        // Only count tagged orders that exist in current allData (key = orderCode)
        const allDataCodes = new Set(allOrders.map(o => String(o.Code)).filter(Boolean));
        let taggedCount = 0;
        let hasCategoryCount = 0;
        const catCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
        const subStateCounts = {};
        const flagCounts = {};
        const subTagCounts = {};
        const tTagCounts = {};

        for (const [key, data] of taggedOrders) {
            if (!allDataCodes.has(key)) continue; // Skip stale/mismatched keys
            taggedCount++;
            if (data.category !== null && data.category !== undefined) {
                hasCategoryCount++;
            }

            catCounts[data.category] = (catCounts[data.category] || 0) + 1;

            if (data.category === PTAG_CATEGORIES.CHO_DI_DON) {
                // Derive subState from tTags (source of truth) for accurate counting
                const ss = (data.tTags || []).length > 0 ? 'CHO_HANG' : 'OKIE_CHO_DI_DON';
                subStateCounts[ss] = (subStateCounts[ss] || 0) + 1;
                // Sub-sub count for CHO_HANG: đã in phiếu / chưa in phiếu
                if (ss === 'CHO_HANG') {
                    if (data.pickingSlipPrinted) {
                        subStateCounts['CHO_HANG_DA_IN'] = (subStateCounts['CHO_HANG_DA_IN'] || 0) + 1;
                    } else {
                        subStateCounts['CHO_HANG_CHUA_IN'] = (subStateCounts['CHO_HANG_CHUA_IN'] || 0) + 1;
                    }
                }
            }
            // Count flags for ALL orders (flags are independent of category)
            // Custom flags (CUSTOM_xxx) count under KHAC as well
            let hasCustomFlag = false;
            (data.flags || []).forEach(f => {
                flagCounts[f] = (flagCounts[f] || 0) + 1;
                if (f.startsWith('CUSTOM_')) hasCustomFlag = true;
            });
            if (hasCustomFlag && !(data.flags || []).includes('KHAC')) {
                flagCounts['KHAC'] = (flagCounts['KHAC'] || 0) + 1;
            }
            if (data.subTag) {
                subTagCounts[data.subTag] = (subTagCounts[data.subTag] || 0) + 1;
            }
        }

        const untaggedCount = totalOrders - hasCategoryCount;

        // Count T-tags from internal processing tag data
        for (const [key, data] of taggedOrders) {
            if (!allDataCodes.has(key)) continue;
            if (data.tTags) {
                for (const tagId of data.tTags) {
                    tTagCounts[tagId] = (tTagCounts[tagId] || 0) + 1;
                }
            }
        }

        // Note: Do NOT auto-cleanup custom flags - they should persist
        // even when no orders reference them (user may re-sync later).
        // Custom flags are only removed when user manually deletes them.

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
        html += `<div class="ptag-panel-card ${activeFilter === '__no_tag__' ? 'active' : ''}" onclick="window._ptagSetFilter('__no_tag__')" data-search="chua gan tag xl">
            <div class="ptag-panel-card-icon" style="background:#d1d5db;">
                <i class="fas fa-tag" style="color:#6b7280;font-size:14px;"></i>
            </div>
            <div class="ptag-panel-card-info">
                <div class="ptag-panel-card-name">CHƯA GÁN TAG XL</div>
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
            // CHO_HANG: inline filter icons for Đã in phiếu / Chưa in phiếu
            const inlineIcons = key === 'CHO_HANG' ? `<div style="display:flex;gap:4px;margin-left:auto;flex-shrink:0;">
                <button class="ptag-panel-inline-icon ${activeFilter === 'sub_CHO_HANG_DA_IN' ? 'active' : ''}" onclick="window._ptagSetFilter('sub_CHO_HANG_DA_IN'); event.stopPropagation();" title="Đã in phiếu (${subStateCounts['CHO_HANG_DA_IN'] || 0})" style="position:relative;width:28px;height:28px;border:2px solid ${activeFilter === 'sub_CHO_HANG_DA_IN' ? '#10b981' : '#d1d5db'};border-radius:6px;background:${activeFilter === 'sub_CHO_HANG_DA_IN' ? 'rgba(16,185,129,0.12)' : '#fff'};cursor:pointer;display:flex;align-items:center;justify-content:center;">
                    <i class="fas fa-print" style="font-size:12px;color:#10b981;"></i>
                    <span style="position:absolute;top:-6px;right:-6px;background:#10b981;color:#fff;font-size:9px;min-width:14px;height:14px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-weight:600;">${subStateCounts['CHO_HANG_DA_IN'] || 0}</span>
                </button>
                <button class="ptag-panel-inline-icon ${activeFilter === 'sub_CHO_HANG_CHUA_IN' ? 'active' : ''}" onclick="window._ptagSetFilter('sub_CHO_HANG_CHUA_IN'); event.stopPropagation();" title="Chưa in phiếu (${subStateCounts['CHO_HANG_CHUA_IN'] || 0})" style="position:relative;width:28px;height:28px;border:2px solid ${activeFilter === 'sub_CHO_HANG_CHUA_IN' ? '#ef4444' : '#d1d5db'};border-radius:6px;background:${activeFilter === 'sub_CHO_HANG_CHUA_IN' ? 'rgba(239,68,68,0.08)' : '#fff'};cursor:pointer;display:flex;align-items:center;justify-content:center;">
                    <i class="fas fa-print" style="font-size:12px;color:#ef4444;"></i>
                    <i class="fas fa-times" style="position:absolute;font-size:8px;color:#ef4444;top:2px;right:2px;"></i>
                    <span style="position:absolute;top:-6px;right:-6px;background:#ef4444;color:#fff;font-size:9px;min-width:14px;height:14px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-weight:600;">${subStateCounts['CHO_HANG_CHUA_IN'] || 0}</span>
                </button>
            </div>` : '';
            html += `<div class="ptag-panel-card ${activeFilter === fk ? 'active' : ''}" onclick="window._ptagSetFilter('${fk}')" data-search="${_ptagNormalize(ss.label)} da in phieu chua in phieu">
                <div class="ptag-panel-card-icon" style="background:${ss.color};">
                    <i class="fas ${ssIcon}" style="color:#fff;font-size:13px;"></i>
                </div>
                <div class="ptag-panel-card-info" style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
                    <div style="min-width:0;">
                        <div class="ptag-panel-card-name">${ss.label}</div>
                        <div class="ptag-panel-card-count">${subStateCounts[key] || 0} đơn hàng</div>
                    </div>
                    ${inlineIcons}
                </div>
                ${_tooltipHtml(fk)}
            </div>`;
        }
        html += `</div>`;

        // --- ĐẶC ĐIỂM ĐƠN HÀNG (Flags) — Independent section (collapsible) ---
        const flagsExpanded = ProcessingTagState._flagsSectionExpanded || false;
        html += `<div class="ptag-panel-group" data-search="dac diem don hang tru cong no ck giam gia cho live giu don qua lay khac">
            <div class="ptag-panel-cat-header-v2 ptag-flags-header" style="border-left-color:#7c3aed;background:rgba(124,58,237,0.06);cursor:pointer;" onclick="window._ptagToggleFlagsSection()">
                <span class="ptag-cat-name" style="color:#5b21b6;">🏷️ ĐẶC ĐIỂM ĐƠN HÀNG</span>
                <span class="ptag-flags-chevron${flagsExpanded ? ' expanded' : ''}">▶</span>
            </div>
            <div class="ptag-flags-body" style="${flagsExpanded ? '' : 'display:none;'}">`;
        for (const [key, flag] of Object.entries(PTAG_FLAGS)) {
            const fk = 'flag_' + key;
            const checked = activeFlagFilters.has(key) ? 'checked' : '';
            const count = flagCounts[key] || 0;
            const flagColor = _ptagGetFlagColor(key);
            html += `<div class="ptag-panel-flag-item" data-search="${_ptagNormalize(flag.label)}">
                <label class="ptag-flag-checkbox">
                    <input type="checkbox" ${checked} onchange="window._ptagToggleFlagFilter('${key}'); event.stopPropagation();" />
                    <span style="width:10px;height:10px;border-radius:50%;background:${flagColor};display:inline-block;flex-shrink:0;"></span>
                    <span class="ptag-flag-label">${flag.label}</span>
                </label>
                <span class="ptag-panel-card-count">${count}</span>
                ${_tooltipHtml(fk)}
                <button class="ptag-color-edit-btn" onclick="window._ptagOpenFlagColorPicker('${key}', this); event.stopPropagation();" title="Đổi màu"><i class="fas fa-pen" style="font-size:10px;"></i></button>
            </div>`;
            // Show custom tags list under "Khác" — show all custom flags
            if (key === 'KHAC') {
                const customFlagDefs = ProcessingTagState.getCustomFlagDefs();
                if (customFlagDefs.length > 0) {
                    // Only show custom flags that have orders assigned
                    const visibleCustom = customFlagDefs.filter(cf => (flagCounts[cf.id] || 0) > 0);
                    if (visibleCustom.length > 0) {
                    const expanded = activeFlagFilters.has('KHAC') ||
                        [...activeFlagFilters].some(f => f.startsWith('CUSTOM_'));
                    html += `<div class="ptag-custom-flags-list" style="margin-left:28px;${expanded ? '' : 'display:none;'}">`;
                    for (const cf of visibleCustom) {
                        const cfChecked = activeFlagFilters.has(cf.id) ? 'checked' : '';
                        const cfCount = flagCounts[cf.id] || 0;
                        const cfColor = _ptagGetFlagColor(cf.id);
                        html += `<div class="ptag-panel-flag-item" style="padding:3px 8px;font-size:13px;" data-search="${_ptagNormalize(cf.label)}">
                            <label class="ptag-flag-checkbox">
                                <input type="checkbox" ${cfChecked} onchange="window._ptagToggleFlagFilter('${cf.id}'); event.stopPropagation();" />
                                <span style="width:10px;height:10px;border-radius:50%;background:${cfColor};display:inline-block;flex-shrink:0;"></span>
                                <span class="ptag-flag-label" style="font-size:13px;">${(cf.label || '').toUpperCase()}</span>
                            </label>
                            <span class="ptag-panel-card-count" style="font-size:12px;">${cfCount}</span>
                            <button class="ptag-color-edit-btn" onclick="window._ptagOpenFlagColorPicker('${cf.id}', this); event.stopPropagation();" title="Đổi màu"><i class="fas fa-pen" style="font-size:10px;"></i></button>
                        </div>`;
                    }
                    html += `</div>`;
                    } // end if visibleCustom.length > 0
                }
            }
        }
        html += `</div></div>`;

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
                <div class="ptag-panel-cat-header-v2" style="border-left-color:${PTAG_TTAG_COLOR_BLUE};background:rgba(59,130,246,0.08);">
                    <span class="ptag-cat-name" style="color:${PTAG_TTAG_COLOR_BLUE};">\u{1F4E6} TAG T CHỜ HÀNG (${totalTTagOrders} đơn)</span>
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
                const isDefaultTag = DEFAULT_TTAG_DEFS.some(d => d.id === def.id);
                // Hide non-default T-tags with 0 orders
                if (count === 0 && !isDefaultTag) continue;
                const deleteBtn = isDefaultTag ? '' : `<button class="ptag-ttag-panel-delete-v2" onclick="window._ptagDeleteTTagDefAndOrders('${escapedFk.replace('ttag_', '')}'); event.stopPropagation();" title="Xóa tag và gỡ khỏi tất cả đơn">&times;</button>`;
                const ttagColor = _ptagGetTTagColor(def.id);
                html += `<div class="ptag-panel-card ${activeFilter === fk ? 'active' : ''}" onclick="window._ptagSetFilter('${escapedFk}')" data-search="${_ptagNormalize(def.name + ' ' + (def.productCode || ''))}">
                    <div class="ptag-panel-card-icon ptag-panel-card-icon--sm" style="background:${ttagColor};">
                        <span style="font-size:12px;">\u{1F3F7}\uFE0F</span>
                    </div>
                    <div class="ptag-panel-card-info">
                        <div class="ptag-panel-card-name" style="color:${ttagColor};">${(def.name || '').toUpperCase()}${pcLabel}</div>
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

    let _ptagSetFilterLock = false;
    function _ptagSetFilter(filterKey) {
        // Debounce double-click
        if (_ptagSetFilterLock) return;
        _ptagSetFilterLock = true;
        setTimeout(() => { _ptagSetFilterLock = false; }, 300);

        // Toggle: click same filter again → deselect (back to TẤT CẢ)
        if (ProcessingTagState._activeFilter === filterKey && filterKey !== null) {
            ProcessingTagState._activeFilter = null;
            ProcessingTagState._activeFlagFilters.clear();
        } else {
            ProcessingTagState._activeFilter = filterKey;
            // Only clear flag filters when resetting to "TẤT CẢ" (null)
            if (filterKey === null) {
                ProcessingTagState._activeFlagFilters.clear();
            }
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

    function _ptagToggleFlagsSection() {
        ProcessingTagState._flagsSectionExpanded = !ProcessingTagState._flagsSectionExpanded;
        const body = document.querySelector('.ptag-flags-body');
        const chevron = document.querySelector('.ptag-flags-chevron');
        if (body) body.style.display = ProcessingTagState._flagsSectionExpanded ? '' : 'none';
        if (chevron) chevron.classList.toggle('expanded', ProcessingTagState._flagsSectionExpanded);
    }

    let _ptagFlagFilterLock = false;
    function _ptagToggleFlagFilter(flagKey) {
        // Debounce double-click
        if (_ptagFlagFilterLock) return;
        _ptagFlagFilterLock = true;
        setTimeout(() => { _ptagFlagFilterLock = false; }, 300);

        const set = ProcessingTagState._activeFlagFilters;
        if (set.has(flagKey)) {
            set.delete(flagKey);
            // Unchecking KHAC also clears all individual custom flag filters
            if (flagKey === 'KHAC') {
                for (const cf of ProcessingTagState.getCustomFlagDefs()) {
                    set.delete(cf.id);
                }
            }
        } else {
            set.add(flagKey);
            // Selecting individual custom flag → remove KHAC catch-all so specific filter works
            if (flagKey.startsWith('CUSTOM_')) {
                set.delete('KHAC');
            }
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
            el.style.display = _ptagMatchTokens(el.dataset.search, norm) ? '' : 'none';
        });

        // Show/hide custom flags container based on search
        body.querySelectorAll('.ptag-custom-flags-list').forEach(container => {
            if (norm) {
                const hasVisibleFlag = container.querySelector('.ptag-panel-flag-item:not([style*="display: none"]):not([style*="display:none"])');
                container.style.display = hasVisibleFlag ? '' : 'none';
            } else {
                // Restore original collapsed/expanded state based on active filters
                const flags = ProcessingTagState._activeFlagFilters;
                const expanded = flags.has('KHAC') ||
                    [...flags].some(f => f.startsWith('CUSTOM_'));
                container.style.display = expanded ? '' : 'none';
            }
        });

        // Then: show/hide groups — visible if group itself matches OR any child is visible
        body.querySelectorAll('.ptag-panel-group').forEach(group => {
            const groupMatch = group.dataset.search && _ptagMatchTokens(group.dataset.search, norm);
            const hasVisibleChild = group.querySelector(
                '.ptag-panel-card:not([style*="display: none"]):not([style*="display:none"]), ' +
                '.ptag-panel-flag-item:not([style*="display: none"]):not([style*="display:none"])'
            );
            if (groupMatch) {
                // Group matches → show group + all children
                group.style.display = '';
                group.querySelectorAll('.ptag-panel-card, .ptag-panel-cat-header-v2, .ptag-panel-flag-item').forEach(c => c.style.display = '');
                group.querySelectorAll('.ptag-custom-flags-list').forEach(c => c.style.display = '');
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
            <label><input type="radio" name="ptag-bulk-choice" value="1:null" /> OKIE CHỜ ĐI ĐƠN</label>
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
            await assignOrderCategory(String(order.Code), category, { subTag: subTag === 'null' ? null : subTag });
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

    let _ttagModalOrderCode = null;
    let _ttagSelectedTags = [];
    let _ttagPendingDeleteIndex = -1;

    async function _ptagOpenTTagModal(orderCode) {
        const data = ProcessingTagState.getOrderData(orderCode);

        _ttagModalOrderCode = orderCode;
        _ttagSelectedTags = [...(data?.tTags || [])];
        _ttagPendingDeleteIndex = -1;

        // Remove existing modal
        const existing = document.getElementById('ptag-ttag-modal');
        if (existing) existing.remove();

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
        _ttagModalOrderCode = null;
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
            return _ptagMatchTokens(_ptagNormalize(def.name), q);
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
                <span style="color:#7c3aed;font-weight:600;">${(def.name || '').toUpperCase()}</span>
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
        if (!_ttagModalOrderCode) return;
        const orderCode = _ttagModalOrderCode;
        let data = ProcessingTagState.getOrderData(orderCode);

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

        _ptagEnsureCode(orderCode, data);
        ProcessingTagState.setOrderData(orderCode, data);
        _ptagRefreshRow(orderCode);
        renderPanelContent();
        await saveProcessingTagToAPI(orderCode, data);

        _ptagCloseTTagModal();
        console.log(`${PTAG_LOG} Saved ${data.tTags.length} T-tags for order ${orderCode}`);
    }

    // =====================================================
    // SECTION 8C: T-TAG MANAGER v2 (bulk-tag-modal style)
    // =====================================================

    // State variables for T-Tag Manager v2
    let _ttagMgrData = [];                // [{tagId, tagName, productCode, sttList: number[], errorMessage?}]
    let _ttagMgrSelectedRows = new Set(); // Selected tag IDs for batch operation
    let _ttagMgrActiveTab = 'assign';     // 'assign' | 'remove'
    let _ttagMgrDropdownIndex = -1;       // Highlighted dropdown index
    let _ttagMgrCreatingInline = false;   // Whether inline create form is showing

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
        for (const [orderCode, data] of ProcessingTagState.getAllOrders()) {
            if (data.tTags && data.tTags.includes(tagId)) {
                const order = allOrders.find(o => String(o.Code) === String(orderCode));
                orders.push({ orderId: order?.Id, orderCode, stt: order?.SessionIndex || '?', name: order?.PartnerName || order?.Name || '', phone: order?.Telephone || '' });
            }
        }
        return orders.sort((a, b) => (a.stt || 0) - (b.stt || 0));
    }

    function _ptagOpenTTagManager() {
        const existing = document.getElementById('ptag-ttag-manager');
        if (existing) existing.remove();

        // Reset state
        _ttagMgrData = [];
        _ttagMgrSelectedRows.clear();
        _ttagMgrActiveTab = 'assign';
        _ttagMgrDropdownIndex = -1;
        _ttagMgrCreatingInline = false;

        const counts = _ttagGetCounts();
        const allDefs = ProcessingTagState.getTTagDefinitions();
        const defaultIds = new Set(DEFAULT_TTAG_DEFS.map(d => d.id));
        const defs = allDefs.filter(d => !defaultIds.has(d.id));
        const totalOrders = Object.values(counts).reduce((s, c) => s + c, 0);

        const modal = document.createElement('div');
        modal.id = 'ptag-ttag-manager';
        modal.className = 'bulk-tag-modal show';
        modal.onclick = (e) => { if (e.target === modal) _ptagCloseTTagManager(); };
        modal.innerHTML = `
            <div class="bulk-tag-modal-content" style="max-width:700px;">
                <!-- Header -->
                <div class="bulk-tag-modal-header" style="background:linear-gradient(135deg,#7c3aed 0%,#a855f7 100%);">
                    <div class="bulk-tag-header-info">
                        <h3><i class="fas fa-tags"></i> Quản Lý Tag T Chờ Hàng</h3>
                        <p id="ttagMgrSubtitle">Tổng: ${defs.length} tag · ${totalOrders} đơn chờ hàng</p>
                    </div>
                    <div class="bulk-tag-header-actions">
                        <button class="bulk-tag-history-btn" onclick="window._ttagMgrShowHistory()" title="Xem lịch sử">
                            <i class="fas fa-history"></i> Lịch sử
                        </button>
                        <button class="bulk-tag-history-btn" onclick="window._ttagMgrShowSettings()" title="Cài đặt Tag T" style="background:rgba(255,255,255,0.15);">
                            <i class="fas fa-cog"></i>
                        </button>
                        <button class="bulk-tag-modal-close" onclick="window._ptagCloseTTagManager()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>

                <!-- Tabs -->
                <div class="ttag-mgr-tabs">
                    <div class="ttag-mgr-tab active-assign" id="ttagMgrTabAssign" onclick="window._ttagMgrSwitchTab('assign')">
                        <i class="fas fa-plus-circle"></i> Gán Tag
                    </div>
                    <div class="ttag-mgr-tab" id="ttagMgrTabRemove" onclick="window._ttagMgrSwitchTab('remove')">
                        <i class="fas fa-minus-circle"></i> Gỡ Tag
                    </div>
                </div>

                <!-- Search Section -->
                <div class="bulk-tag-search-section" style="position:relative;">
                    <div class="bulk-tag-search-wrapper" style="position:relative;">
                        <i class="fas fa-search"></i>
                        <input type="text" id="ttagMgrSearchInput" placeholder="Tìm kiếm tag T (nhập tên tag)..."
                            oninput="window._ttagMgrFilterDropdown()"
                            onfocus="window._ttagMgrShowDropdown()"
                            onkeydown="window._ttagMgrHandleSearchKeydown(event)">
                        <div class="bulk-tag-search-dropdown" id="ttagMgrSearchDropdown" style="display:none;"></div>
                    </div>
                    <button class="bulk-tag-clear-all-btn" onclick="window._ttagMgrClearAll()" title="Xóa tất cả">
                        <i class="fas fa-trash-alt"></i> Xóa tất cả
                    </button>
                </div>

                <!-- Inline Create Form (hidden by default) -->
                <div id="ttagMgrCreateForm" style="display:none;padding:10px 16px;border-bottom:1px solid #e5e7eb;background:#faf5ff;"></div>

                <!-- Select All Row -->
                <div class="bulk-tag-select-all-row">
                    <label class="bulk-tag-select-all-label">
                        <input type="checkbox" id="ttagMgrSelectAllCheckbox" onchange="window._ttagMgrToggleSelectAll(this.checked)">
                        <span>Chọn tất cả</span>
                    </label>
                    <span class="bulk-tag-count" id="ttagMgrRowCount">0 tag đã thêm</span>
                </div>

                <!-- Body - Tag Table -->
                <div class="bulk-tag-modal-body" id="ttagMgrModalBody">
                    <div class="bulk-tag-table">
                        <div class="bulk-tag-table-header">
                            <div class="bulk-tag-col-tag" id="ttagMgrColLabel">Tag cần gán</div>
                            <div class="bulk-tag-col-stt">STT Đơn Hàng</div>
                            <div class="bulk-tag-col-action">Thao tác</div>
                        </div>
                        <div class="bulk-tag-table-body" id="ttagMgrTableBody">
                            <div class="bulk-tag-empty-state">
                                <i class="fas fa-inbox"></i>
                                <p>Chưa có tag nào được thêm. Hãy tìm kiếm và thêm tag.</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div class="bulk-tag-modal-footer">
                    <button class="bulk-tag-btn-cancel" onclick="window._ptagCloseTTagManager()">
                        <i class="fas fa-times"></i> Hủy
                    </button>
                    <button class="bulk-tag-btn-confirm" id="ttagMgrConfirmBtn" onclick="window._ttagMgrExecute()">
                        <i class="fas fa-check"></i> Gán Tag Đã Chọn
                    </button>
                </div>
            </div>`;
        document.body.appendChild(modal);

        // Close dropdown on outside click
        document.addEventListener('click', _ttagMgrDocClickHandler);
        _ttagMgrUpdateTable();
        _ttagMgrUpdateRowCount();
    }

    function _ttagMgrDocClickHandler(e) {
        const dropdown = document.getElementById('ttagMgrSearchDropdown');
        const searchInput = document.getElementById('ttagMgrSearchInput');
        if (dropdown && searchInput && !dropdown.contains(e.target) && e.target !== searchInput) {
            dropdown.style.display = 'none';
        }
    }

    // ===== SEARCH / DROPDOWN =====

    function _ttagMgrShowDropdown() {
        _ttagMgrFilterDropdown();
        const dd = document.getElementById('ttagMgrSearchDropdown');
        if (dd) dd.style.display = 'block';
    }

    function _ttagMgrFilterDropdown() {
        const dd = document.getElementById('ttagMgrSearchDropdown');
        const input = document.getElementById('ttagMgrSearchInput');
        if (!dd || !input) return;

        const searchText = (input.value || '').trim().toLowerCase();
        const allDefs = ProcessingTagState.getTTagDefinitions();
        const defaultIds = new Set(DEFAULT_TTAG_DEFS.map(d => d.id));
        const addedIds = new Set(_ttagMgrData.map(d => d.tagId));

        // Filter definitions
        let filtered = allDefs.filter(d => !defaultIds.has(d.id) && !addedIds.has(d.id));
        if (searchText) {
            filtered = filtered.filter(d =>
                d.name.toLowerCase().includes(searchText) ||
                (d.productCode || '').toLowerCase().includes(searchText) ||
                d.id.toLowerCase().includes(searchText)
            );
        }

        _ttagMgrDropdownIndex = -1;
        let html = '';

        if (filtered.length === 0 && searchText) {
            html = `<div class="bulk-tag-dropdown-item" style="color:#7c3aed;font-weight:600;" onclick="window._ttagMgrShowCreateForm()">
                <i class="fas fa-plus" style="margin-right:6px;"></i>
                Không tìm thấy "${searchText}" - <b>Nhấn Enter để tạo</b>
            </div>`;
        } else {
            filtered.forEach((def, i) => {
                const count = _ttagGetCounts()[def.id] || 0;
                const pcLabel = def.productCode ? ` · <span style="color:#6b7280;">${def.productCode}</span>` : '';
                html += `<div class="bulk-tag-dropdown-item ${i === _ttagMgrDropdownIndex ? 'highlighted' : ''}"
                    data-index="${i}" data-tag-id="${def.id}"
                    onclick="window._ttagMgrAddTag('${def.id.replace(/'/g, "\\'")}')"
                    onmouseenter="this.classList.add('highlighted')" onmouseleave="this.classList.remove('highlighted')">
                    <span style="color:#7c3aed;font-weight:600;">${(def.name || '').toUpperCase()}${pcLabel}</span>
                    <span style="color:#9ca3af;font-size:12px;margin-left:auto;">${count} đơn</span>
                </div>`;
            });
        }

        dd.innerHTML = html;
        dd.style.display = html ? 'block' : 'none';
        dd._filteredDefs = filtered;
    }

    function _ttagMgrHandleSearchKeydown(event) {
        const dd = document.getElementById('ttagMgrSearchDropdown');
        const filteredDefs = dd?._filteredDefs || [];
        const input = document.getElementById('ttagMgrSearchInput');

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            _ttagMgrDropdownIndex = Math.min(_ttagMgrDropdownIndex + 1, filteredDefs.length - 1);
            _ttagMgrHighlightDropdownItem();
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            _ttagMgrDropdownIndex = Math.max(_ttagMgrDropdownIndex - 1, 0);
            _ttagMgrHighlightDropdownItem();
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (_ttagMgrDropdownIndex >= 0 && _ttagMgrDropdownIndex < filteredDefs.length) {
                _ttagMgrAddTag(filteredDefs[_ttagMgrDropdownIndex].id);
            } else if ((input?.value || '').trim()) {
                _ttagMgrShowCreateForm();
            }
        } else if (event.key === 'Escape') {
            if (dd) dd.style.display = 'none';
        }
    }

    function _ttagMgrHighlightDropdownItem() {
        const dd = document.getElementById('ttagMgrSearchDropdown');
        if (!dd) return;
        dd.querySelectorAll('.bulk-tag-dropdown-item').forEach((el, i) => {
            el.classList.toggle('highlighted', i === _ttagMgrDropdownIndex);
        });
    }

    // ===== INLINE CREATE FORM =====

    function _ttagMgrShowCreateForm() {
        const input = document.getElementById('ttagMgrSearchInput');
        const searchText = (input?.value || '').trim();
        const dd = document.getElementById('ttagMgrSearchDropdown');
        if (dd) dd.style.display = 'none';

        const form = document.getElementById('ttagMgrCreateForm');
        if (!form) return;
        _ttagMgrCreatingInline = true;
        form.style.display = 'block';
        form.innerHTML = `
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <span style="font-size:13px;font-weight:600;color:#7c3aed;white-space:nowrap;">Tạo Tag T mới:</span>
                <input type="text" id="ttagMgrNewName" placeholder="Tên tag" value="${searchText}" style="flex:1;min-width:120px;padding:8px 10px;font-size:13px;border:1.5px solid #c4b5fd;border-radius:6px;outline:none;" />
                <input type="text" id="ttagMgrNewPC" placeholder="Mã SP (tùy chọn)" style="width:130px;padding:8px 10px;font-size:13px;border:1.5px solid #c4b5fd;border-radius:6px;outline:none;text-transform:uppercase;" />
                <button onclick="window._ttagMgrConfirmCreate()" style="padding:8px 16px;font-size:13px;font-weight:600;background:#7c3aed;color:#fff;border:none;border-radius:6px;cursor:pointer;white-space:nowrap;">Tạo</button>
                <button onclick="window._ttagMgrCancelCreate()" style="padding:8px 12px;font-size:13px;font-weight:500;background:#f3f4f6;color:#374151;border:none;border-radius:6px;cursor:pointer;">Hủy</button>
            </div>`;
        setTimeout(() => document.getElementById('ttagMgrNewName')?.focus(), 50);
    }

    function _ttagMgrCancelCreate() {
        const form = document.getElementById('ttagMgrCreateForm');
        if (form) { form.style.display = 'none'; form.innerHTML = ''; }
        _ttagMgrCreatingInline = false;
    }

    function _ttagMgrConfirmCreate() {
        const nameInput = document.getElementById('ttagMgrNewName');
        const pcInput = document.getElementById('ttagMgrNewPC');
        const name = (nameInput?.value || '').trim();
        const productCode = (pcInput?.value || '').trim().toUpperCase();

        if (!name) { alert('Vui lòng nhập tên tag.'); return; }

        // Generate ID
        const defs = ProcessingTagState.getTTagDefinitions();
        let nextNum = 1;
        for (const d of defs) {
            const match = d.id.match(/^T(\d+)/);
            if (match) nextNum = Math.max(nextNum, parseInt(match[1]) + 1);
        }
        const tagId = `T${nextNum}`;

        // Create definition
        const newDef = { id: tagId, name: name.toUpperCase(), productCode, createdAt: Date.now() };
        defs.push(newDef);
        ProcessingTagState.setTTagDefinitions(defs);
        saveTTagDefinitions();

        console.log(`${PTAG_LOG} Created T-tag: ${tagId} (${productCode || 'no PC'} - ${name})`);

        // Add to table
        _ttagMgrCancelCreate();
        const searchInput = document.getElementById('ttagMgrSearchInput');
        if (searchInput) searchInput.value = '';
        _ttagMgrAddTag(tagId);
        _ttagMgrUpdateSummary();
        renderPanelContent();
    }

    // ===== ADD/REMOVE TAG TO TABLE =====

    function _ttagMgrAddTag(tagId) {
        if (_ttagMgrData.some(d => d.tagId === tagId)) return;
        const def = ProcessingTagState.getTTagDef(tagId);
        if (!def) return;

        const entry = {
            tagId: def.id,
            tagName: def.name,
            productCode: def.productCode || '',
            sttList: [],
            errorMessage: null
        };

        // In "remove" tab, auto-load existing orders with this tag
        if (_ttagMgrActiveTab === 'remove') {
            const orders = _ttagGetOrdersForTag(tagId);
            entry.sttList = orders.map(o => o.stt).filter(s => s !== '?');
        }

        _ttagMgrData.push(entry);

        // Auto-select if has STTs
        if (entry.sttList.length > 0) {
            _ttagMgrSelectedRows.add(tagId);
        }

        // Clear search
        const input = document.getElementById('ttagMgrSearchInput');
        if (input) input.value = '';
        const dd = document.getElementById('ttagMgrSearchDropdown');
        if (dd) dd.style.display = 'none';

        _ttagMgrUpdateTable();
        _ttagMgrUpdateRowCount();
        _ttagMgrUpdateSelectAllCheckbox();
    }

    function _ttagMgrRemoveTagRow(tagId) {
        _ttagMgrData = _ttagMgrData.filter(d => d.tagId !== tagId);
        _ttagMgrSelectedRows.delete(tagId);
        _ttagMgrUpdateTable();
        _ttagMgrUpdateRowCount();
        _ttagMgrUpdateSelectAllCheckbox();
    }

    function _ttagMgrClearAll() {
        _ttagMgrData = [];
        _ttagMgrSelectedRows.clear();
        _ttagMgrUpdateTable();
        _ttagMgrUpdateRowCount();
        _ttagMgrUpdateSelectAllCheckbox();
    }

    // ===== TABLE RENDERING =====

    function _ttagMgrUpdateTable() {
        const tableBody = document.getElementById('ttagMgrTableBody');
        if (!tableBody) return;

        if (_ttagMgrData.length === 0) {
            tableBody.innerHTML = `
                <div class="bulk-tag-empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>Chưa có tag nào được thêm. Hãy tìm kiếm và thêm tag.</p>
                </div>`;
            return;
        }

        const allOrders = (typeof window.getAllOrders === 'function') ? window.getAllOrders() : [];

        tableBody.innerHTML = _ttagMgrData.map(tagData => {
            const isSelected = _ttagMgrSelectedRows.has(tagData.tagId);
            const sttArray = tagData.sttList || [];
            const sttCount = sttArray.length;
            const hasError = tagData.errorMessage && tagData.errorMessage.length > 0;
            const escapedId = tagData.tagId.replace(/'/g, "\\'");

            // STT pills with customer names
            const sttPillsHtml = sttArray.map(stt => {
                const order = window.OrderStore?.getBySTT(stt) || allOrders.find(o => o.SessionIndex === stt);
                const customerName = order ? (order.Name || order.PartnerName || 'N/A') : 'N/A';
                return `<div class="bulk-tag-stt-pill">
                    <span class="stt-number">STT ${stt}</span>
                    <span class="customer-name">${customerName}</span>
                    <button class="remove-stt" onclick="window._ttagMgrRemoveSTT('${escapedId}', ${stt})" title="Xóa STT">
                        <i class="fas fa-times"></i>
                    </button>
                </div>`;
            }).join('');

            const errorHtml = hasError ? `<div class="bulk-tag-row-error">${tagData.errorMessage}</div>` : '';

            // Product code + Tìm Đơn button
            const pcHtml = tagData.productCode
                ? `<div class="ttag-mgr-product-code">
                    <b>${tagData.productCode}</b>
                    <button class="ttag-mgr-find-btn" onclick="window._ttagMgrFindByProductCode('${escapedId}')">
                        <i class="fas fa-search" style="font-size:10px;"></i> Tìm Đơn
                    </button>
                   </div>`
                : '';

            return `
                <div class="bulk-tag-row ${isSelected ? 'selected' : ''} ${hasError ? 'has-error' : ''}" data-tag-id="${tagData.tagId}">
                    <div class="bulk-tag-row-tag">
                        <input type="checkbox"
                            ${isSelected ? 'checked' : ''}
                            ${sttCount === 0 ? 'disabled' : ''}
                            onchange="window._ttagMgrToggleRowSelection('${escapedId}')"
                            title="${sttCount === 0 ? 'Thêm STT trước khi chọn' : 'Chọn để thao tác'}">
                        <div class="bulk-tag-row-tag-info">
                            <span class="tag-color-dot" style="background-color:#7c3aed;"></span>
                            <span class="tag-name">${tagData.tagName}</span>
                        </div>
                        ${pcHtml}
                        ${errorHtml}
                    </div>
                    <div class="bulk-tag-row-stt">
                        <div class="bulk-tag-stt-pills">
                            ${sttPillsHtml || '<span style="color:#9ca3af;font-size:13px;">Chưa có STT nào</span>'}
                        </div>
                        <div class="bulk-tag-stt-input-wrapper">
                            <input type="number" class="bulk-tag-stt-input" placeholder="Nhập STT và Enter"
                                onkeydown="window._ttagMgrHandleSTTKeydown(event, '${escapedId}')">
                            <span class="bulk-tag-stt-counter">(${sttCount})</span>
                        </div>
                    </div>
                    <div class="bulk-tag-row-action">
                        <button class="bulk-tag-remove-row-btn" onclick="window._ttagMgrRemoveTagRow('${escapedId}')" title="Xóa tag này">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>`;
        }).join('');
    }

    function _ttagMgrUpdateRowCount() {
        const el = document.getElementById('ttagMgrRowCount');
        if (el) el.textContent = `${_ttagMgrData.length} tag đã thêm`;
    }

    function _ttagMgrUpdateSelectAllCheckbox() {
        const cb = document.getElementById('ttagMgrSelectAllCheckbox');
        if (!cb) return;
        const selectableRows = _ttagMgrData.filter(d => d.sttList.length > 0);
        cb.checked = selectableRows.length > 0 && selectableRows.every(d => _ttagMgrSelectedRows.has(d.tagId));
        cb.disabled = selectableRows.length === 0;
    }

    function _ttagMgrToggleSelectAll(checked) {
        _ttagMgrData.forEach(d => {
            if (d.sttList.length > 0) {
                if (checked) _ttagMgrSelectedRows.add(d.tagId);
                else _ttagMgrSelectedRows.delete(d.tagId);
            }
        });
        _ttagMgrUpdateTable();
    }

    function _ttagMgrToggleRowSelection(tagId) {
        if (_ttagMgrSelectedRows.has(tagId)) _ttagMgrSelectedRows.delete(tagId);
        else _ttagMgrSelectedRows.add(tagId);
        _ttagMgrUpdateTable();
        _ttagMgrUpdateSelectAllCheckbox();
    }

    // ===== STT MANAGEMENT =====

    function _ttagMgrHandleSTTKeydown(event, tagId) {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const input = event.target;
        const stt = parseInt(input.value);
        if (isNaN(stt)) return;

        const allOrders = (typeof window.getAllOrders === 'function') ? window.getAllOrders() : [];
        const order = window.OrderStore?.getBySTT(stt) || allOrders.find(o => o.SessionIndex === stt);
        if (!order) {
            if (window.notificationManager) window.notificationManager.warning(`Không tìm thấy đơn STT ${stt}`, 2000);
            return;
        }

        const tagEntry = _ttagMgrData.find(d => d.tagId === tagId);
        if (!tagEntry) return;
        if (tagEntry.sttList.includes(stt)) {
            if (window.notificationManager) window.notificationManager.warning(`STT ${stt} đã có trong danh sách`, 2000);
            input.value = '';
            return;
        }

        tagEntry.sttList.push(stt);
        _ttagMgrSelectedRows.add(tagId); // Auto-select when has STTs
        input.value = '';
        _ttagMgrUpdateTable();
        _ttagMgrUpdateSelectAllCheckbox();

        // Re-focus the input after re-render
        setTimeout(() => {
            const row = document.querySelector(`[data-tag-id="${tagId}"] .bulk-tag-stt-input`);
            if (row) row.focus();
        }, 50);
    }

    function _ttagMgrRemoveSTT(tagId, stt) {
        const tagEntry = _ttagMgrData.find(d => d.tagId === tagId);
        if (!tagEntry) return;
        tagEntry.sttList = tagEntry.sttList.filter(s => s !== stt);
        if (tagEntry.sttList.length === 0) _ttagMgrSelectedRows.delete(tagId);
        _ttagMgrUpdateTable();
        _ttagMgrUpdateSelectAllCheckbox();
    }

    async function _ttagMgrFindByProductCode(tagId) {
        const tagEntry = _ttagMgrData.find(d => d.tagId === tagId);
        if (!tagEntry) return;
        const def = ProcessingTagState.getTTagDef(tagId);
        const productCode = (def?.productCode || tagId).toUpperCase();
        const allOrders = (typeof window.getAllOrders === 'function') ? window.getAllOrders() : [];

        const orderByCode = new Map();
        const orderById = new Map();
        for (const o of allOrders) {
            if (o.Code) orderByCode.set(String(o.Code), o);
            orderById.set(String(o.Id), o);
        }

        let hasDetails = allOrders.some(o => Array.isArray(o.Details) && o.Details.length > 0);
        let searchSource = allOrders;

        if (!hasDetails) {
            if (window.notificationManager) window.notificationManager.info('Đang tải chi tiết SP...', 2000);
            const reportOrders = await _ptagLoadReportOrderDetails();
            if (!reportOrders || reportOrders.length === 0) {
                alert('Chưa có dữ liệu chi tiết đơn hàng.\n\nVui lòng vào Tab "Báo Cáo Tổng Hợp" → nhấn "Lấy chi tiết đơn hàng" trước.');
                return;
            }
            searchSource = reportOrders;
        }

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

        const matchingOrders = [];
        const seenIds = new Set();
        for (const code of matchedCodes) {
            const order = orderByCode.get(code);
            if (order && !seenIds.has(String(order.Id))) {
                matchingOrders.push(order);
                seenIds.add(String(order.Id));
            }
        }
        for (const oid of matchedIds) {
            const order = orderById.get(oid);
            if (order && !seenIds.has(oid)) {
                matchingOrders.push(order);
                seenIds.add(oid);
            }
        }

        if (matchingOrders.length === 0) {
            if (window.notificationManager) window.notificationManager.warning(`Không tìm thấy đơn nào chứa SP "${productCode}"`, 3000);
            return;
        }

        // Add found STTs to the tag row (skip duplicates)
        let added = 0;
        for (const o of matchingOrders) {
            const stt = o.SessionIndex;
            if (stt && !tagEntry.sttList.includes(stt)) {
                tagEntry.sttList.push(stt);
                added++;
            }
        }

        if (added > 0) {
            _ttagMgrSelectedRows.add(tagId);
            _ttagMgrUpdateTable();
            _ttagMgrUpdateSelectAllCheckbox();
            if (window.notificationManager) window.notificationManager.success(`Đã thêm ${added} đơn chứa SP "${productCode}"`, 3000);
        } else {
            if (window.notificationManager) window.notificationManager.warning(`Tất cả ${matchingOrders.length} đơn chứa SP "${productCode}" đã có trong danh sách`, 3000);
        }

        console.log(`${PTAG_LOG} FindByPC in manager: ${productCode} → ${added} new STTs added`);
    }

    // ===== TAB SWITCHING =====

    function _ttagMgrSwitchTab(tab) {
        if (_ttagMgrActiveTab === tab) return;
        _ttagMgrActiveTab = tab;
        _ttagMgrData = [];
        _ttagMgrSelectedRows.clear();

        // Update tab UI
        const tabAssign = document.getElementById('ttagMgrTabAssign');
        const tabRemove = document.getElementById('ttagMgrTabRemove');
        const confirmBtn = document.getElementById('ttagMgrConfirmBtn');
        const colLabel = document.getElementById('ttagMgrColLabel');

        if (tabAssign) {
            tabAssign.className = `ttag-mgr-tab ${tab === 'assign' ? 'active-assign' : ''}`;
        }
        if (tabRemove) {
            tabRemove.className = `ttag-mgr-tab ${tab === 'remove' ? 'active-remove' : ''}`;
        }
        if (confirmBtn) {
            if (tab === 'assign') {
                confirmBtn.className = 'bulk-tag-btn-confirm';
                confirmBtn.innerHTML = '<i class="fas fa-check"></i> Gán Tag Đã Chọn';
            } else {
                confirmBtn.className = 'bulk-tag-btn-confirm bulk-tag-btn-delete';
                confirmBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Gỡ Tag Đã Chọn';
            }
        }
        if (colLabel) colLabel.textContent = tab === 'assign' ? 'Tag cần gán' : 'Tag cần gỡ';

        _ttagMgrUpdateTable();
        _ttagMgrUpdateRowCount();
        _ttagMgrUpdateSelectAllCheckbox();
    }

    // ===== EXECUTE =====

    async function _ttagMgrExecute() {
        if (_ttagMgrActiveTab === 'assign') {
            await _ttagMgrExecuteAssign();
        } else {
            await _ttagMgrExecuteRemove();
        }
    }

    function _ttagMgrNormalizePhone(phone) {
        if (!phone) return '';
        let cleaned = phone.replace(/\D/g, '');
        if (cleaned.startsWith('84')) cleaned = '0' + cleaned.substring(2);
        return cleaned;
    }

    async function _ttagMgrExecuteAssign() {
        const selectedTags = _ttagMgrData.filter(t => _ttagMgrSelectedRows.has(t.tagId) && t.sttList.length > 0);
        if (selectedTags.length === 0) {
            if (window.notificationManager) window.notificationManager.warning('Vui lòng chọn ít nhất một tag có STT để gán', 3000);
            return;
        }

        const allOrders = (typeof window.getAllOrders === 'function') ? window.getAllOrders() : [];
        const successResults = [];
        const failedResults = [];

        for (const tagEntry of selectedTags) {
            const successSTT = [];
            const failedSTT = [];
            const redirectedSTT = [];

            for (const stt of tagEntry.sttList) {
                const order = window.OrderStore?.getBySTT(stt) || allOrders.find(o => o.SessionIndex === stt);
                if (!order) { failedSTT.push(stt); continue; }

                // Check for "ĐÃ GỘP KO CHỐT" TPOS tag → redirect to replacement order
                const rawTags = order.Tags ? JSON.parse(order.Tags) : [];
                const hasBlockedTag = rawTags.some(t => t.Name === "ĐÃ GỘP KO CHỐT");

                if (hasBlockedTag) {
                    const originalSTT = order.SessionIndex;
                    const normalizedPhone = _ttagMgrNormalizePhone(order.Telephone);

                    if (!normalizedPhone) {
                        console.warn(`${PTAG_LOG} Order ${order.Code} has "ĐÃ GỘP KO CHỐT" but no phone number`);
                        failedSTT.push(stt);
                        continue;
                    }

                    const samePhoneOrders = allOrders.filter(o =>
                        o.Id !== order.Id && _ttagMgrNormalizePhone(o.Telephone) === normalizedPhone
                    );

                    if (samePhoneOrders.length === 0) {
                        console.warn(`${PTAG_LOG} No replacement order found for phone ${normalizedPhone}`);
                        failedSTT.push(stt);
                        continue;
                    }

                    const replacementOrder = samePhoneOrders.sort((a, b) => b.SessionIndex - a.SessionIndex)[0];
                    console.log(`${PTAG_LOG} Redirecting T-tag from STT ${originalSTT} (${order.Code}) → STT ${replacementOrder.SessionIndex} (${replacementOrder.Code})`);

                    try {
                        await assignTTagToOrder(String(replacementOrder.Code), tagEntry.tagId);
                        // Transfer processing tags (flags + tTags) from blocked order to replacement
                        try {
                            await transferProcessingTags(String(order.Code), String(replacementOrder.Code));
                        } catch (e) { console.warn(`${PTAG_LOG} Transfer processing tags failed:`, e); }
                        redirectedSTT.push({ original: originalSTT, redirectTo: replacementOrder.SessionIndex });
                    } catch (e) {
                        console.error(`${PTAG_LOG} Failed to assign ${tagEntry.tagId} to replacement STT ${replacementOrder.SessionIndex}:`, e);
                        failedSTT.push(stt);
                    }
                    continue;
                }

                // Normal flow (no blocked tag)
                try {
                    await assignTTagToOrder(String(order.Code), tagEntry.tagId);
                    successSTT.push(stt);
                } catch (e) {
                    console.error(`${PTAG_LOG} Failed to assign ${tagEntry.tagId} to STT ${stt}:`, e);
                    failedSTT.push(stt);
                }
            }

            if (successSTT.length > 0 || redirectedSTT.length > 0) {
                successResults.push({ tagName: tagEntry.tagName, productCode: tagEntry.productCode, sttList: successSTT, redirectedList: redirectedSTT });
            }
            if (failedSTT.length > 0) {
                failedResults.push({ tagName: tagEntry.tagName, sttList: failedSTT, reason: 'Không tìm thấy đơn hoặc lỗi API' });
            }
        }

        // Remove successful rows/STTs from table (including redirected ones)
        for (const success of successResults) {
            const tagEntry = _ttagMgrData.find(d => d.tagName === success.tagName);
            if (tagEntry) {
                const allSuccessSTT = [...success.sttList, ...(success.redirectedList || []).map(r => r.original)];
                tagEntry.sttList = tagEntry.sttList.filter(s => !allSuccessSTT.includes(s));
                if (tagEntry.sttList.length === 0) {
                    _ttagMgrData = _ttagMgrData.filter(d => d.tagId !== tagEntry.tagId);
                    _ttagMgrSelectedRows.delete(tagEntry.tagId);
                }
            }
        }

        _ttagMgrUpdateTable();
        _ttagMgrUpdateRowCount();
        _ttagMgrUpdateSelectAllCheckbox();
        _ttagMgrUpdateSummary();

        // Save history
        const results = { success: successResults, failed: failedResults };
        await _ttagMgrSaveHistory('assign', results);

        // Show result
        _ttagMgrShowResult(successResults, failedResults, 'Gán Tag');
    }

    async function _ttagMgrExecuteRemove() {
        const selectedTags = _ttagMgrData.filter(t => _ttagMgrSelectedRows.has(t.tagId) && t.sttList.length > 0);
        if (selectedTags.length === 0) {
            if (window.notificationManager) window.notificationManager.warning('Vui lòng chọn ít nhất một tag có STT để gỡ', 3000);
            return;
        }

        const allOrders = (typeof window.getAllOrders === 'function') ? window.getAllOrders() : [];
        const successResults = [];
        const failedResults = [];

        for (const tagEntry of selectedTags) {
            const successSTT = [];
            const failedSTT = [];

            for (const stt of tagEntry.sttList) {
                const order = window.OrderStore?.getBySTT(stt) || allOrders.find(o => o.SessionIndex === stt);
                if (!order) { failedSTT.push(stt); continue; }

                try {
                    await removeTTagFromOrder(String(order.Code), tagEntry.tagId);
                    successSTT.push(stt);
                } catch (e) {
                    console.error(`${PTAG_LOG} Failed to remove ${tagEntry.tagId} from STT ${stt}:`, e);
                    failedSTT.push(stt);
                }
            }

            if (successSTT.length > 0) {
                successResults.push({ tagName: tagEntry.tagName, productCode: tagEntry.productCode, sttList: successSTT });
            }
            if (failedSTT.length > 0) {
                failedResults.push({ tagName: tagEntry.tagName, sttList: failedSTT, reason: 'Không tìm thấy đơn hoặc lỗi API' });
            }
        }

        // Remove successful rows/STTs from table
        for (const success of successResults) {
            const tagEntry = _ttagMgrData.find(d => d.tagName === success.tagName);
            if (tagEntry) {
                tagEntry.sttList = tagEntry.sttList.filter(s => !success.sttList.includes(s));
                if (tagEntry.sttList.length === 0) {
                    _ttagMgrData = _ttagMgrData.filter(d => d.tagId !== tagEntry.tagId);
                    _ttagMgrSelectedRows.delete(tagEntry.tagId);
                }
            }
        }

        _ttagMgrUpdateTable();
        _ttagMgrUpdateRowCount();
        _ttagMgrUpdateSelectAllCheckbox();
        _ttagMgrUpdateSummary();

        const results = { success: successResults, failed: failedResults };
        await _ttagMgrSaveHistory('remove', results);
        _ttagMgrShowResult(successResults, failedResults, 'Gỡ Tag');
    }

    function _ttagMgrShowResult(successResults, failedResults, actionLabel) {
        const totalSuccess = successResults.reduce((sum, r) => sum + r.sttList.length + (r.redirectedList || []).length, 0);
        const totalFailed = failedResults.reduce((sum, r) => sum + r.sttList.length, 0);

        // Notification
        if (totalSuccess > 0 && totalFailed === 0) {
            if (window.notificationManager) window.notificationManager.success(`${actionLabel} thành công: ${totalSuccess} đơn`, 4000);
        } else if (totalSuccess > 0 && totalFailed > 0) {
            if (window.notificationManager) window.notificationManager.warning(`${actionLabel}: ${totalSuccess} thành công, ${totalFailed} thất bại`, 5000);
        } else if (totalFailed > 0) {
            if (window.notificationManager) window.notificationManager.error(`${actionLabel} thất bại: ${totalFailed} đơn`, 5000);
        }

        // Build result modal
        let successHtml = '';
        if (successResults.length > 0) {
            successHtml = `<div style="margin-bottom:12px;">
                <div style="font-weight:600;color:#10b981;margin-bottom:6px;"><i class="fas fa-check-circle"></i> Thành công (${totalSuccess} đơn)</div>
                ${successResults.map(r => {
                    let html = `<div style="padding:4px 0;font-size:13px;">
                        <span style="color:#7c3aed;font-weight:600;">${r.tagName}:</span>
                        <span style="color:#374151;">${r.sttList.length > 0 ? 'STT ' + r.sttList.join(', ') : ''}</span>
                    </div>`;
                    if (r.redirectedList && r.redirectedList.length > 0) {
                        html += r.redirectedList.map(rd =>
                            `<div style="padding:2px 0 2px 12px;font-size:12px;color:#6b7280;">
                                ↳ STT ${rd.original} → chuyển sang STT ${rd.redirectTo} (đơn gộp)
                            </div>`
                        ).join('');
                    }
                    return html;
                }).join('')}
            </div>`;
        }

        let failedHtml = '';
        if (failedResults.length > 0) {
            failedHtml = `<div>
                <div style="font-weight:600;color:#ef4444;margin-bottom:6px;"><i class="fas fa-times-circle"></i> Thất bại (${totalFailed} đơn)</div>
                ${failedResults.map(r => `<div style="padding:4px 0;font-size:13px;">
                    <span style="color:#7c3aed;font-weight:600;">${r.tagName}:</span>
                    <span style="color:#374151;">STT ${r.sttList.join(', ')}</span>
                    <div style="font-size:11px;color:#6b7280;">→ ${r.reason}</div>
                </div>`).join('')}
            </div>`;
        }

        if (totalSuccess > 0 || totalFailed > 0) {
            const existingResult = document.getElementById('ttagMgrResultModal');
            if (existingResult) existingResult.remove();

            const resultModal = document.createElement('div');
            resultModal.id = 'ttagMgrResultModal';
            resultModal.className = 'bulk-tag-modal show';
            resultModal.style.zIndex = '10003';
            resultModal.onclick = (e) => { if (e.target === resultModal) resultModal.remove(); };
            resultModal.innerHTML = `
                <div class="bulk-tag-modal-content" style="max-width:500px;">
                    <div class="bulk-tag-modal-header" style="background:linear-gradient(135deg,#7c3aed 0%,#a855f7 100%);">
                        <div class="bulk-tag-header-info"><h3><i class="fas fa-clipboard-list"></i> Kết Quả ${actionLabel}</h3></div>
                        <div class="bulk-tag-header-actions">
                            <button class="bulk-tag-modal-close" onclick="this.closest('.bulk-tag-modal').remove()"><i class="fas fa-times"></i></button>
                        </div>
                    </div>
                    <div style="padding:16px;max-height:400px;overflow-y:auto;">
                        ${successHtml}${failedHtml}
                        ${totalSuccess === 0 && totalFailed === 0 ? '<p style="text-align:center;color:#9ca3af;">Không có kết quả nào</p>' : ''}
                    </div>
                    <div class="bulk-tag-modal-footer">
                        <button class="bulk-tag-btn-confirm" onclick="this.closest('.bulk-tag-modal').remove()"><i class="fas fa-check"></i> Đóng</button>
                    </div>
                </div>`;
            document.body.appendChild(resultModal);
        }
    }

    function _ttagMgrUpdateSummary() {
        const el = document.getElementById('ttagMgrSubtitle');
        if (!el) return;
        const allDefs = ProcessingTagState.getTTagDefinitions();
        const defaultIds = new Set(DEFAULT_TTAG_DEFS.map(d => d.id));
        const defs = allDefs.filter(d => !defaultIds.has(d.id));
        const counts = _ttagGetCounts();
        const totalOrders = Object.values(counts).reduce((s, c) => s + c, 0);
        el.textContent = `Tổng: ${defs.length} tag · ${totalOrders} đơn chờ hàng`;
    }

    // ===== HISTORY =====

    async function _ttagMgrSaveHistory(type, results) {
        try {
            const timestamp = Date.now();
            const dateFormatted = new Date(timestamp).toLocaleString('vi-VN');
            let username = 'Unknown';
            try {
                if (typeof currentUserIdentifier !== 'undefined' && currentUserIdentifier) {
                    username = currentUserIdentifier;
                } else {
                    const tokenData = window.tokenManager?.getTokenData?.();
                    username = tokenData?.DisplayName || tokenData?.name || 'Unknown';
                }
            } catch (e) { /* ignore */ }

            const historyEntry = {
                timestamp, dateFormatted, username, type,
                results,
                summary: {
                    totalSuccess: results.success.reduce((sum, r) => sum + r.sttList.length, 0),
                    totalFailed: results.failed.reduce((sum, r) => sum + r.sttList.length, 0)
                }
            };

            if (typeof database !== 'undefined') {
                const historyRef = database.ref(`tTagHistory/${timestamp}`);
                await historyRef.set(historyEntry);
                console.log(`${PTAG_LOG} T-Tag history saved:`, historyEntry);
            }
        } catch (error) {
            console.error(`${PTAG_LOG} Error saving T-Tag history:`, error);
        }
    }

    async function _ttagMgrShowHistory() {
        const existingHistory = document.getElementById('ttagMgrHistoryModal');
        if (existingHistory) existingHistory.remove();

        const historyModal = document.createElement('div');
        historyModal.id = 'ttagMgrHistoryModal';
        historyModal.className = 'bulk-tag-modal show';
        historyModal.style.zIndex = '10002';
        historyModal.onclick = (e) => { if (e.target === historyModal) historyModal.remove(); };
        historyModal.innerHTML = `
            <div class="bulk-tag-modal-content" style="max-width:800px;">
                <div class="bulk-tag-modal-header" style="background:linear-gradient(135deg,#3b82f6 0%,#1d4ed8 100%);">
                    <div class="bulk-tag-header-info">
                        <h3><i class="fas fa-history"></i> Lịch Sử Tag T Chờ Hàng</h3>
                        <p>Xem lại các lần gán/gỡ tag trước đây</p>
                    </div>
                    <div class="bulk-tag-header-actions">
                        <button class="bulk-tag-modal-close" onclick="window._ttagMgrCloseHistory()"><i class="fas fa-times"></i></button>
                    </div>
                </div>
                <div class="bulk-tag-modal-body" id="ttagMgrHistoryBody">
                    <div class="bulk-tag-loading"><i class="fas fa-spinner fa-spin"></i><p>Đang tải lịch sử...</p></div>
                </div>
                <div class="bulk-tag-modal-footer">
                    <button class="bulk-tag-btn-cancel" onclick="window._ttagMgrCloseHistory()"><i class="fas fa-times"></i> Đóng</button>
                </div>
            </div>`;
        document.body.appendChild(historyModal);

        try {
            if (typeof database === 'undefined') throw new Error('Firebase not available');
            const historyRef = database.ref('tTagHistory');
            const snapshot = await historyRef.orderByKey().limitToLast(50).once('value');
            const historyData = snapshot.val();
            const body = document.getElementById('ttagMgrHistoryBody');
            if (!body) return;

            if (!historyData) {
                body.innerHTML = `<div class="bulk-tag-history-empty"><i class="fas fa-history"></i><p>Chưa có lịch sử nào</p></div>`;
                return;
            }

            const historyArray = Object.values(historyData).sort((a, b) => b.timestamp - a.timestamp);
            body.innerHTML = `<div class="bulk-tag-history-list">
                ${historyArray.map((entry, i) => _ttagMgrRenderHistoryItem(entry, i)).join('')}
            </div>`;
        } catch (error) {
            console.error(`${PTAG_LOG} Error loading T-Tag history:`, error);
            const body = document.getElementById('ttagMgrHistoryBody');
            if (body) body.innerHTML = `<div class="bulk-tag-history-empty"><i class="fas fa-exclamation-triangle" style="color:#ef4444;"></i><p>Lỗi tải lịch sử: ${error.message}</p></div>`;
        }
    }

    function _ttagMgrRenderHistoryItem(entry, index) {
        const { dateFormatted, username, type, results, summary } = entry;
        const typeLabel = type === 'assign' ? '<span style="color:#10b981;">GÁN</span>' : '<span style="color:#ef4444;">GỠ</span>';

        let successHtml = '';
        if (results?.success?.length > 0) {
            successHtml = `<div style="margin-top:8px;">
                <div style="font-weight:600;color:#10b981;font-size:12px;margin-bottom:4px;"><i class="fas fa-check-circle"></i> Thành công (${summary.totalSuccess} đơn):</div>
                ${results.success.map(r => `<div style="padding:2px 0;font-size:12px;">
                    <span style="color:#7c3aed;font-weight:600;">${r.tagName}:</span> STT ${(r.sttList || []).join(', ')}
                </div>`).join('')}
            </div>`;
        }

        let failedHtml = '';
        if (results?.failed?.length > 0) {
            failedHtml = `<div style="margin-top:6px;">
                <div style="font-weight:600;color:#ef4444;font-size:12px;margin-bottom:4px;"><i class="fas fa-times-circle"></i> Thất bại (${summary.totalFailed} đơn):</div>
                ${results.failed.map(r => `<div style="padding:2px 0;font-size:12px;">
                    <span style="color:#7c3aed;font-weight:600;">${r.tagName}:</span> STT ${(r.sttList || []).join(', ')}
                    <span style="color:#6b7280;font-size:11px;">→ ${r.reason}</span>
                </div>`).join('')}
            </div>`;
        }

        return `<div class="bulk-tag-history-item" id="ttagHistoryItem${index}">
            <div class="bulk-tag-history-header" onclick="document.getElementById('ttagHistoryItem${index}').classList.toggle('expanded')">
                <div class="history-info">
                    <div class="history-time"><i class="fas fa-clock"></i> ${dateFormatted}</div>
                    <div class="history-user"><i class="fas fa-user"></i> ${username || 'Unknown'}</div>
                </div>
                <div class="history-summary">
                    ${typeLabel}
                    <span class="success-count"><i class="fas fa-check"></i> ${summary?.totalSuccess || 0}</span>
                    <span class="failed-count"><i class="fas fa-times"></i> ${summary?.totalFailed || 0}</span>
                    <i class="fas fa-chevron-down expand-icon"></i>
                </div>
            </div>
            <div class="bulk-tag-history-body">
                ${successHtml}${failedHtml}
            </div>
        </div>`;
    }

    function _ttagMgrCloseHistory() {
        const modal = document.getElementById('ttagMgrHistoryModal');
        if (modal) modal.remove();
    }

    // ===== SETTINGS MODAL =====

    function _ttagMgrShowSettings() {
        const existingSettings = document.getElementById('ttagMgrSettingsModal');
        if (existingSettings) existingSettings.remove();

        const allDefs = ProcessingTagState.getTTagDefinitions();
        const defaultIds = new Set(DEFAULT_TTAG_DEFS.map(d => d.id));
        const defs = allDefs.filter(d => !defaultIds.has(d.id));
        const counts = _ttagGetCounts();

        const settingsModal = document.createElement('div');
        settingsModal.id = 'ttagMgrSettingsModal';
        settingsModal.className = 'ttag-mgr-settings-overlay';
        settingsModal.onclick = (e) => { if (e.target === settingsModal) settingsModal.remove(); };
        settingsModal.innerHTML = `
            <div class="ttag-mgr-settings-content">
                <div style="background:linear-gradient(135deg,#7c3aed 0%,#a855f7 100%);color:#fff;padding:14px 16px;display:flex;align-items:center;gap:8px;">
                    <i class="fas fa-cog" style="font-size:16px;"></i>
                    <span style="font-weight:700;font-size:15px;flex:1;">Cài đặt Tag T</span>
                    <button onclick="window._ttagMgrCloseSettings()" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer;">&times;</button>
                </div>
                <div id="ttagMgrSettingsList" style="max-height:60vh;overflow-y:auto;">
                    ${defs.length === 0 ? '<div style="padding:30px;text-align:center;color:#6b7280;font-size:14px;">Chưa có tag T nào.</div>' :
                    defs.map(def => {
                        const count = counts[def.id] || 0;
                        const escapedId = def.id.replace(/'/g, "\\'");
                        return `<div class="ttag-mgr-settings-row" id="ttagSettingsRow_${def.id}">
                            <div style="flex:1;min-width:0;">
                                <div style="font-weight:600;color:#7c3aed;font-size:14px;" id="ttagSettingsName_${def.id}">${(def.name || '').toUpperCase()}</div>
                                <div style="font-size:12px;color:#6b7280;">
                                    ${def.productCode ? `Mã SP: <b>${def.productCode}</b> · ` : ''}${count} đơn · ID: ${def.id}
                                </div>
                            </div>
                            <button onclick="window._ttagMgrStartRename('${escapedId}')" style="padding:6px 10px;font-size:12px;background:#f5f3ff;color:#7c3aed;border:1px solid #c4b5fd;border-radius:4px;cursor:pointer;" title="Đổi tên">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="window._ptagDeleteTTagDefAndOrders('${escapedId}'); window._ttagMgrRefreshSettings();" style="padding:6px 10px;font-size:12px;background:#fef2f2;color:#ef4444;border:1px solid #fecaca;border-radius:4px;cursor:pointer;" title="Xóa">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>`;
                    }).join('')}
                </div>
                <div style="padding:12px 16px;border-top:1px solid #e5e7eb;text-align:right;">
                    <button onclick="window._ttagMgrCloseSettings()" style="padding:8px 20px;font-size:13px;font-weight:600;background:#7c3aed;color:#fff;border:none;border-radius:6px;cursor:pointer;">Đóng</button>
                </div>
            </div>`;
        document.body.appendChild(settingsModal);
    }

    function _ttagMgrCloseSettings() {
        const modal = document.getElementById('ttagMgrSettingsModal');
        if (modal) modal.remove();
        // Refresh manager summary
        _ttagMgrUpdateSummary();
    }

    function _ttagMgrRefreshSettings() {
        // Re-open settings to refresh list after delete
        _ttagMgrCloseSettings();
        setTimeout(() => _ttagMgrShowSettings(), 100);
    }

    function _ttagMgrStartRename(tagId) {
        const def = ProcessingTagState.getTTagDef(tagId);
        if (!def) return;
        const row = document.getElementById(`ttagSettingsRow_${tagId}`);
        if (!row) return;
        const nameEl = document.getElementById(`ttagSettingsName_${tagId}`);
        if (!nameEl) return;

        nameEl.innerHTML = `
            <div style="display:flex;gap:6px;align-items:center;">
                <input type="text" id="ttagRenameInput_${tagId}" value="${def.name}" style="flex:1;padding:5px 8px;font-size:13px;border:1.5px solid #c4b5fd;border-radius:4px;outline:none;" />
                <input type="text" id="ttagRenamePCInput_${tagId}" value="${def.productCode || ''}" placeholder="Mã SP" style="width:80px;padding:5px 8px;font-size:13px;border:1.5px solid #c4b5fd;border-radius:4px;outline:none;text-transform:uppercase;" />
                <button onclick="window._ttagMgrConfirmRename('${tagId.replace(/'/g, "\\'")}')" style="padding:5px 10px;font-size:12px;background:#7c3aed;color:#fff;border:none;border-radius:4px;cursor:pointer;">Lưu</button>
                <button onclick="window._ttagMgrRefreshSettings()" style="padding:5px 10px;font-size:12px;background:#f3f4f6;color:#374151;border:none;border-radius:4px;cursor:pointer;">Hủy</button>
            </div>`;
        setTimeout(() => document.getElementById(`ttagRenameInput_${tagId}`)?.focus(), 50);
    }

    function _ttagMgrConfirmRename(tagId) {
        const nameInput = document.getElementById(`ttagRenameInput_${tagId}`);
        const pcInput = document.getElementById(`ttagRenamePCInput_${tagId}`);
        const newName = (nameInput?.value || '').trim().toUpperCase();
        const newPC = (pcInput?.value || '').trim().toUpperCase();

        if (!newName) { alert('Tên tag không được trống.'); return; }

        const defs = ProcessingTagState.getTTagDefinitions();
        const def = defs.find(d => d.id === tagId);
        if (def) {
            def.name = newName;
            def.productCode = newPC;
            ProcessingTagState.setTTagDefinitions(defs);
            saveTTagDefinitions();
            renderPanelContent();

            // Refresh all table rows that have this tag to show the new name
            const ordersWithTag = _ttagGetOrdersForTag(tagId);
            for (const o of ordersWithTag) {
                _ptagRefreshRow(o.orderCode);
            }

            console.log(`${PTAG_LOG} Renamed tag ${tagId} to "${newName}" (PC: ${newPC}), refreshed ${ordersWithTag.length} rows`);
        }

        _ttagMgrRefreshSettings();
    }

    /**
     * Cache for order details loaded from Firestore (Báo Cáo Tổng Hợp).
     * Key: tableName, Value: array of orders with Details[].ProductCode
     */
    let _reportOrderDetailsCache = null; // { tableName, orders[], updatedAt }
    let _reportOrderDetailsLoading = null; // Promise if currently loading

    /** Convert Firestore timestamp to comparable number */
    function _tsToMillis(ts) {
        if (!ts) return 0;
        if (typeof ts.toMillis === 'function') return ts.toMillis();
        if (typeof ts.seconds === 'number') return ts.seconds * 1000;
        if (typeof ts === 'number') return ts;
        return 0;
    }

    /**
     * Load order details from Firestore collection 'report_order_details'.
     * Smart cache: checks updatedAt from main doc (1 read) before reloading chunks.
     */
    async function _ptagLoadReportOrderDetails() {
        const tableName = window.campaignManager?.activeCampaign?.name
            || localStorage.getItem('orders_table_name') || '';
        if (!tableName) return null;

        const db = window.firestoreDb || (typeof firebase !== 'undefined' && firebase.firestore());
        if (!db) {
            console.warn(`${PTAG_LOG} Firestore not available for loading report order details`);
            return null;
        }

        const safeTableName = tableName.replace(/[.$#\[\]\/]/g, '_');
        const FIREBASE_PATH = 'report_order_details';

        // If cache exists → check if data changed (1 lightweight Firestore read)
        if (_reportOrderDetailsCache && _reportOrderDetailsCache.tableName === tableName) {
            try {
                const docRef = db.collection(FIREBASE_PATH).doc(safeTableName);
                const doc = await docRef.get();
                if (doc.exists) {
                    const serverUpdatedAt = _tsToMillis(doc.data().updatedAt);
                    const cachedUpdatedAt = _tsToMillis(_reportOrderDetailsCache.updatedAt);
                    if (serverUpdatedAt > 0 && serverUpdatedAt === cachedUpdatedAt) {
                        console.log(`${PTAG_LOG} Report data unchanged, using cache (${_reportOrderDetailsCache.orders.length} orders)`);
                        return _reportOrderDetailsCache.orders;
                    }
                    console.log(`${PTAG_LOG} Report data updated on server, refreshing cache...`);
                }
            } catch (e) {
                // If check fails, still use cache as fallback
                console.warn(`${PTAG_LOG} Cache check failed, using existing cache`, e);
                return _reportOrderDetailsCache.orders;
            }
        }

        // Prevent duplicate concurrent loads
        if (_reportOrderDetailsLoading) return _reportOrderDetailsLoading;

        _reportOrderDetailsLoading = _ptagLoadReportOrderDetailsInner(tableName, db, safeTableName, FIREBASE_PATH);
        try {
            return await _reportOrderDetailsLoading;
        } finally {
            _reportOrderDetailsLoading = null;
        }
    }

    async function _ptagLoadReportOrderDetailsInner(tableName, db, safeTableName, FIREBASE_PATH) {
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

            _reportOrderDetailsCache = { tableName, orders, updatedAt: data.updatedAt };
            return orders;
        } catch (e) {
            console.error(`${PTAG_LOG} Error loading report order details:`, e);
            return null;
        }
    }

    // Keep _ptagFindByProductCode as a legacy entry point (delegates to manager version if open)
    async function _ptagFindByProductCode(tagId) {
        // If manager is open and tag is in the table, use manager version
        const mgrEntry = _ttagMgrData.find(d => d.tagId === tagId);
        if (mgrEntry && document.getElementById('ptag-ttag-manager')) {
            await _ttagMgrFindByProductCode(tagId);
            return;
        }
        // Fallback: direct assign (used from quick picker or other contexts)
        const def = ProcessingTagState.getTTagDef(tagId);
        const productCode = (def?.productCode || tagId).toUpperCase();
        const allOrders = (typeof window.getAllOrders === 'function') ? window.getAllOrders() : [];

        let hasDetails = allOrders.some(o => Array.isArray(o.Details) && o.Details.length > 0);
        let searchSource = allOrders;

        if (!hasDetails) {
            const reportOrders = await _ptagLoadReportOrderDetails();
            if (!reportOrders || reportOrders.length === 0) {
                alert('Chưa có dữ liệu chi tiết đơn hàng.\nVui lòng vào Tab "Báo Cáo Tổng Hợp" → nhấn "Lấy chi tiết đơn hàng" trước.');
                return;
            }
            searchSource = reportOrders;
        }

        const orderByCode = new Map();
        const orderById = new Map();
        for (const o of allOrders) {
            if (o.Code) orderByCode.set(String(o.Code), o);
            orderById.set(String(o.Id), o);
        }

        const matchedCodes = new Set();
        const matchedIds = new Set();
        for (const order of searchSource) {
            if (!Array.isArray(order.Details)) continue;
            if (order.Details.some(d => (d.ProductCode || '').toUpperCase() === productCode)) {
                if (order.Code) matchedCodes.add(String(order.Code));
                matchedIds.add(String(order.Id));
            }
        }

        const matchingOrders = [];
        const seenIds = new Set();
        for (const code of matchedCodes) {
            const order = orderByCode.get(code);
            if (order && !seenIds.has(String(order.Id))) { matchingOrders.push(order); seenIds.add(String(order.Id)); }
        }
        for (const oid of matchedIds) {
            const order = orderById.get(oid);
            if (order && !seenIds.has(oid)) { matchingOrders.push(order); seenIds.add(oid); }
        }

        const existingOrderCodes = new Set();
        for (const [key, data] of ProcessingTagState.getAllOrders()) {
            if (data.tTags && data.tTags.includes(tagId)) existingOrderCodes.add(String(key));
        }
        const newOrders = matchingOrders.filter(o => !existingOrderCodes.has(String(o.Code)));

        if (newOrders.length === 0) {
            alert(matchingOrders.length > 0
                ? `Tất cả ${matchingOrders.length} đơn chứa SP "${productCode}" đã có tag này.`
                : `Không tìm thấy đơn nào chứa SP "${productCode}".`);
            return;
        }

        for (const o of newOrders) {
            await assignTTagToOrder(String(o.Code), tagId);
        }
        console.log(`${PTAG_LOG} Assigned tag ${tagId} to ${newOrders.length} orders via SP search (legacy)`);
        renderPanelContent();
    }

    function _ptagCloseTTagManager() {
        const modal = document.getElementById('ptag-ttag-manager');
        if (modal) modal.remove();
        document.removeEventListener('click', _ttagMgrDocClickHandler);
        _ttagMgrData = [];
        _ttagMgrSelectedRows.clear();
    }

    async function _ptagDeleteTTagDefAndOrders(tagId) {
        if (DEFAULT_TTAG_DEFS.some(d => d.id === tagId)) {
            alert('Tag mặc định không thể xóa.');
            return;
        }
        const defs = ProcessingTagState.getTTagDefinitions();
        const tagName = ProcessingTagState.getTTagName(tagId) || tagId;
        const orders = _ttagGetOrdersForTag(tagId);
        const count = orders.length;

        const msg = count > 0
            ? `Xóa tag "${tagName}" và gỡ khỏi ${count} đơn hàng?`
            : `Xóa tag "${tagName}"?`;
        if (!confirm(msg)) return;

        for (const o of orders) {
            await removeTTagFromOrder(o.orderCode, tagId);
        }

        const idx = defs.findIndex(d => d.id === tagId);
        if (idx >= 0) {
            defs.splice(idx, 1);
            ProcessingTagState.setTTagDefinitions(defs);
            saveTTagDefinitions();
        }

        console.log(`${PTAG_LOG} Deleted tag ${tagId} definition + removed from ${count} orders`);
        renderPanelContent();
    }

    function _ptagDeleteTTagDef(tagId) {
        if (DEFAULT_TTAG_DEFS.some(d => d.id === tagId)) {
            alert('Tag mặc định không thể xóa.');
            return;
        }
        const defs = ProcessingTagState.getTTagDefinitions();
        const tagName = ProcessingTagState.getTTagName(tagId) || tagId;
        let count = 0;
        for (const [, data] of ProcessingTagState.getAllOrders()) {
            if (data.tTags && data.tTags.includes(tagId)) count++;
        }
        if (count > 0 && !confirm(`Tag "${tagName}" đang được dùng cho ${count} đơn. Xóa definition sẽ không xóa tag khỏi các đơn. Tiếp tục?`)) return;

        const idx = defs.findIndex(d => d.id === tagId);
        if (idx >= 0) {
            defs.splice(idx, 1);
            ProcessingTagState.setTTagDefinitions(defs);
            saveTTagDefinitions();
            renderPanelContent();
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

    // Accepts orderCode hoặc orderId (tự resolve)
    function orderPassesProcessingTagFilter(orderCodeOrId) {
        const filter = ProcessingTagState._activeFilter;
        const flagFilters = ProcessingTagState._activeFlagFilters;
        const hasBaseFilter = filter !== null;
        const hasFlagFilter = flagFilters.size > 0;

        // No filters active — show all
        if (!hasBaseFilter && !hasFlagFilter) return true;

        // Thử lookup bằng orderCode trước, fallback orderId
        const data = ProcessingTagState.getOrderData(orderCodeOrId)
            || ProcessingTagState.getOrderDataByIdFallback(orderCodeOrId);

        // --- Evaluate flag filter independently ---
        let passesFlag = true; // default: no flag filter = pass
        if (hasFlagFilter) {
            if (!data) {
                passesFlag = false;
            } else {
                const orderFlags = data.flags || [];
                passesFlag = [...flagFilters].some(f => {
                    if (orderFlags.includes(f)) return true;
                    // KHAC filter also matches orders with any CUSTOM_xxx flag
                    if (f === 'KHAC') return orderFlags.some(of => of.startsWith('CUSTOM_'));
                    return false;
                });
            }
        }

        // --- Evaluate base filter independently ---
        let passesBase = true; // default: no base filter = pass
        if (hasBaseFilter) {
            if (filter === '__no_tag__') {
                passesBase = !data || data.category === null || data.category === undefined;
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
                } else if (subKey === 'CHO_HANG_DA_IN') {
                    passesBase = (data.tTags || []).length > 0 && data.pickingSlipPrinted === true;
                } else if (subKey === 'CHO_HANG_CHUA_IN') {
                    passesBase = (data.tTags || []).length > 0 && !data.pickingSlipPrinted;
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

    function _ptagResolveDisplayName(action, value) {
        if (action === 'SET_CATEGORY' || action === 'REMOVE_CATEGORY') {
            const cat = parseInt(value?.split(':')[0]);
            const subTag = value?.split(':')[1];
            if (subTag && PTAG_SUBTAGS[subTag]) return PTAG_SUBTAGS[subTag].label;
            if (PTAG_CATEGORY_META[cat]) return PTAG_CATEGORY_META[cat].short;
            return value || '';
        }
        if (action === 'ADD_FLAG' || action === 'REMOVE_FLAG') {
            return PTAG_FLAGS[value]?.label || ProcessingTagState.getCustomFlagLabel(value) || value;
        }
        if (action === 'ADD_TTAG' || action === 'REMOVE_TTAG') {
            return ProcessingTagState.getTTagName(value) || value;
        }
        if (action === 'AUTO_HOAN_TAT') return 'ĐÃ RA ĐƠN (auto)';
        if (action === 'AUTO_ROLLBACK') return 'Rollback (auto)';
        if (action === 'SET_PHIEU_SOAN' || action === 'UNSET_PHIEU_SOAN') return 'Phiếu soạn hàng';
        if (action === 'AUTO_PHIEU_SOAN') return 'Phiếu soạn (auto)';
        if (action === 'TRANSFER_IN') return `Nhận tag XL từ đơn ${value}`;
        if (action === 'TRANSFER_OUT') return `Chuyển tag XL sang đơn ${value}`;
        return value || '';
    }

    function _ptagAddHistory(orderCode, action, value, userName) {
        const userInfo = userName ? { user: userName, userId: null } : _ptagGetCurrentUser();
        ProcessingTagState.addHistoryEntry(orderCode, {
            action,
            value: value || '',
            displayName: _ptagResolveDisplayName(action, value),
            user: userInfo.user,
            userId: userInfo.userId,
            timestamp: Date.now()
        });
    }

    function _ptagGetHistory(orderCode) {
        return ProcessingTagState.getHistory(orderCode).slice().reverse(); // newest first
    }

    function _ptagRenderHistoryPopover(orderCode, anchorEl) {
        // Remove existing popover
        document.querySelectorAll('.ptag-history-popover').forEach(p => p.remove());

        const history = _ptagGetHistory(orderCode);
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
            AUTO_ROLLBACK: '←',
            SET_PHIEU_SOAN: '+',
            UNSET_PHIEU_SOAN: '-',
            AUTO_PHIEU_SOAN: '+'
        };

        history.slice(0, 20).forEach(h => {
            const date = new Date(h.timestamp);
            const dateStr = `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
            const sign = ACTION_LABELS[h.action] || '·';
            const signClass = sign === '+' || sign === '→' ? 'add' : sign === '-' || sign === '←' ? 'remove' : '';

            // Resolve display label - ưu tiên displayName đã lưu sẵn, fallback resolve từ value (entries cũ)
            const label = h.displayName || _ptagResolveDisplayName(h.action, h.value);

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

    /** Xóa cuốn chiếu: entry nào tạo > 30 ngày thì xóa, entry < 30 ngày vẫn giữ */
    function _ptagCleanupOldHistory() {
        const SIXTY_DAYS = 60 * 24 * 60 * 60 * 1000;
        const cutoff = Date.now() - SIXTY_DAYS;
        for (const [key, history] of ProcessingTagState._historyStore) {
            if (!history || history.length === 0) continue;
            // Lấy timestamp của entry cuối cùng (mới nhất = lần update cuối)
            const lastTimestamp = Math.max(...history.map(h => h.timestamp || 0));
            if (lastTimestamp < cutoff) {
                // 60 ngày không có thay đổi → xóa nguyên row (tag data + history)
                ProcessingTagState._historyStore.delete(key);
                ProcessingTagState.removeOrder(key);
                clearProcessingTagAPI(key);
            }
        }
    }

    function _ptagNormalize(str) {
        return (str || '').toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd').replace(/Đ/g, 'D')
            .replace(/[^a-z0-9\s]/g, '').trim();
    }

    function _ptagMatchTokens(searchData, normalizedQuery) {
        if (!normalizedQuery) return true;
        const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
        return tokens.every(token => searchData.includes(token));
    }

    // =====================================================
    // SECTION 10C: GLOBAL TAG HISTORY MODAL
    // =====================================================

    const PTAG_ACTION_META = {
        SET_CATEGORY:    { sign: '+', cls: 'add', group: 'category', label: 'Gán phân loại' },
        REMOVE_CATEGORY: { sign: '-', cls: 'remove', group: 'category', label: 'Xóa phân loại' },
        ADD_FLAG:        { sign: '+', cls: 'add', group: 'flag', label: 'Thêm đặc điểm' },
        REMOVE_FLAG:     { sign: '-', cls: 'remove', group: 'flag', label: 'Xóa đặc điểm' },
        ADD_TTAG:        { sign: '+', cls: 'add', group: 'ttag', label: 'Thêm Tag T' },
        REMOVE_TTAG:     { sign: '-', cls: 'remove', group: 'ttag', label: 'Xóa Tag T' },
        AUTO_HOAN_TAT:   { sign: '→', cls: 'auto', group: 'auto', label: 'Auto hoàn tất' },
        AUTO_ROLLBACK:   { sign: '←', cls: 'auto', group: 'auto', label: 'Auto rollback' },
        SET_PHIEU_SOAN:  { sign: '+', cls: 'add', group: 'phieu', label: 'Đánh dấu phiếu soạn' },
        UNSET_PHIEU_SOAN:{ sign: '-', cls: 'remove', group: 'phieu', label: 'Bỏ phiếu soạn' },
        AUTO_PHIEU_SOAN: { sign: '+', cls: 'auto', group: 'phieu', label: 'Auto phiếu soạn' },
        TRANSFER_IN:     { sign: '←', cls: 'add', group: 'transfer', label: 'Nhận tag XL' },
        TRANSFER_OUT:    { sign: '→', cls: 'remove', group: 'transfer', label: 'Chuyển tag XL' }
    };

    let _globalHistoryCache = [];
    let _globalHistoryFiltered = [];
    let _globalHistoryPage = 0;
    const _globalHistoryPageSize = 50;

    function _ptagAggregateAllHistory() {
        const allOrders = (typeof window.getAllOrders === 'function') ? window.getAllOrders() : [];
        const orderLookup = new Map();
        allOrders.forEach(o => {
            if (o.Code) orderLookup.set(String(o.Code), { stt: o.STT || o.Stt || '', code: o.Code || '' });
        });

        const entries = [];
        for (const [key, history] of ProcessingTagState.getAllHistoryOrders()) {
            if (!history || history.length === 0) continue;
            const lookup = orderLookup.get(String(key)) || { stt: '', code: key };
            history.forEach(h => {
                entries.push({
                    ...h,
                    orderCode: lookup.code || key,
                    orderSTT: lookup.stt
                });
            });
        }
        entries.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        return entries;
    }

    function _ptagGHApplyFilters() {
        const orderInput = document.getElementById('ptag-gh-filter-order');
        const actionSelect = document.getElementById('ptag-gh-filter-action');
        const userInput = document.getElementById('ptag-gh-filter-user');

        const orderQuery = _ptagNormalize(orderInput?.value || '');
        const actionGroup = actionSelect?.value || '';
        const userQuery = _ptagNormalize(userInput?.value || '');

        _globalHistoryFiltered = _globalHistoryCache.filter(entry => {
            if (orderQuery) {
                const sttStr = String(entry.orderSTT || '');
                const codeStr = _ptagNormalize(entry.orderCode || '');
                if (!sttStr.includes(orderQuery) && !codeStr.includes(orderQuery)) return false;
            }
            if (actionGroup) {
                const meta = PTAG_ACTION_META[entry.action];
                if (!meta || meta.group !== actionGroup) return false;
            }
            if (userQuery) {
                const userName = _ptagNormalize(entry.user || '');
                if (!userName.includes(userQuery)) return false;
            }
            return true;
        });
        _globalHistoryPage = 0;
    }

    function _ptagRenderGlobalHistoryList() {
        const body = document.getElementById('ptag-gh-body');
        if (!body) return;

        const total = _globalHistoryFiltered.length;
        const totalPages = Math.max(1, Math.ceil(total / _globalHistoryPageSize));
        if (_globalHistoryPage >= totalPages) _globalHistoryPage = totalPages - 1;
        const start = _globalHistoryPage * _globalHistoryPageSize;
        const pageItems = _globalHistoryFiltered.slice(start, start + _globalHistoryPageSize);

        if (total === 0) {
            body.innerHTML = `<div class="ptag-gh-empty">
                <i class="fas fa-inbox" style="font-size:28px;color:#d1d5db;margin-bottom:8px;"></i>
                <div style="color:#9ca3af;font-size:13px;">Không có lịch sử nào</div>
            </div>`;
        } else {
            let html = '';
            pageItems.forEach(h => {
                const date = new Date(h.timestamp);
                const dateStr = `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
                const meta = PTAG_ACTION_META[h.action] || { sign: '·', cls: '' };
                const label = h.displayName || _ptagResolveDisplayName(h.action, h.value);
                const sttDisplay = h.orderSTT ? `STT ${h.orderSTT}` : (h.orderCode || '?');
                const actionLabel = meta.label || h.action;

                html += `<div class="ptag-gh-item">
                    <span class="ptag-gh-time">${dateStr}</span>
                    <span class="ptag-gh-order" title="${h.orderCode || ''}">${sttDisplay}</span>
                    <span class="ptag-gh-user" title="${h.user || ''}">${h.user || ''}</span>
                    <span class="ptag-gh-sign ${meta.cls}">${meta.sign}</span>
                    <span class="ptag-gh-action-type" title="${actionLabel}">${actionLabel}</span>
                    <span class="ptag-gh-label" title="${label}">${label}</span>
                </div>`;
            });
            body.innerHTML = html;
        }

        // Update pagination
        const pageInfo = document.getElementById('ptag-gh-page-info');
        if (pageInfo) pageInfo.textContent = `Trang ${_globalHistoryPage + 1} / ${totalPages} (${total} mục)`;
        const prevBtn = document.getElementById('ptag-gh-prev');
        const nextBtn = document.getElementById('ptag-gh-next');
        if (prevBtn) prevBtn.disabled = _globalHistoryPage <= 0;
        if (nextBtn) nextBtn.disabled = _globalHistoryPage >= totalPages - 1;
    }

    function _ptagOpenGlobalHistory() {
        // Remove existing modal
        const existing = document.getElementById('ptag-global-history-modal');
        if (existing) existing.remove();

        // Aggregate history from all orders
        _globalHistoryCache = _ptagAggregateAllHistory();
        _globalHistoryFiltered = [..._globalHistoryCache];
        _globalHistoryPage = 0;

        const modal = document.createElement('div');
        modal.id = 'ptag-global-history-modal';
        modal.className = 'ptag-gh-overlay';
        modal.innerHTML = `
            <div class="ptag-gh-modal">
                <div class="ptag-gh-header">
                    <div>
                        <div class="ptag-gh-title"><i class="fas fa-clock-rotate-left"></i> Lịch Sử Tag</div>
                        <div class="ptag-gh-subtitle">${_globalHistoryCache.length} thao tác</div>
                    </div>
                    <button class="ptag-gh-close-btn" onclick="window._ptagCloseGlobalHistory()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="ptag-gh-filters">
                    <input type="text" id="ptag-gh-filter-order" class="ptag-gh-filter-input" placeholder="Tìm đơn (STT/Mã)..." oninput="window._ptagGHFilterChanged()" />
                    <select id="ptag-gh-filter-action" class="ptag-gh-filter-select" onchange="window._ptagGHFilterChanged()">
                        <option value="">Tất cả loại</option>
                        <option value="category">Phân loại</option>
                        <option value="flag">Đặc điểm</option>
                        <option value="ttag">Tag T</option>
                        <option value="auto">Tự động</option>
                        <option value="phieu">Phiếu soạn</option>
                    </select>
                    <input type="text" id="ptag-gh-filter-user" class="ptag-gh-filter-input" placeholder="Tìm user..." oninput="window._ptagGHFilterChanged()" />
                    <button class="ptag-gh-clear-btn" onclick="window._ptagGHClearFilters()" title="Xóa bộ lọc">
                        <i class="fas fa-eraser"></i>
                    </button>
                </div>
                <div class="ptag-gh-body" id="ptag-gh-body"></div>
                <div class="ptag-gh-footer">
                    <span id="ptag-gh-page-info" class="ptag-gh-page-info"></span>
                    <div class="ptag-gh-page-btns">
                        <button id="ptag-gh-prev" class="ptag-gh-page-btn" onclick="window._ptagGHPrevPage()">← Trước</button>
                        <button id="ptag-gh-next" class="ptag-gh-page-btn" onclick="window._ptagGHNextPage()">Sau →</button>
                    </div>
                </div>
            </div>
        `;

        // Click overlay to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) _ptagCloseGlobalHistory();
        });

        document.body.appendChild(modal);
        _ptagRenderGlobalHistoryList();
    }

    function _ptagCloseGlobalHistory() {
        const modal = document.getElementById('ptag-global-history-modal');
        if (modal) modal.remove();
        _globalHistoryCache = [];
        _globalHistoryFiltered = [];
    }

    function _ptagGHFilterChanged() {
        _ptagGHApplyFilters();
        _ptagRenderGlobalHistoryList();
    }

    function _ptagGHNextPage() {
        const totalPages = Math.max(1, Math.ceil(_globalHistoryFiltered.length / _globalHistoryPageSize));
        if (_globalHistoryPage < totalPages - 1) {
            _globalHistoryPage++;
            _ptagRenderGlobalHistoryList();
            document.getElementById('ptag-gh-body')?.scrollTo(0, 0);
        }
    }

    function _ptagGHPrevPage() {
        if (_globalHistoryPage > 0) {
            _globalHistoryPage--;
            _ptagRenderGlobalHistoryList();
            document.getElementById('ptag-gh-body')?.scrollTo(0, 0);
        }
    }

    function _ptagGHClearFilters() {
        const orderInput = document.getElementById('ptag-gh-filter-order');
        const actionSelect = document.getElementById('ptag-gh-filter-action');
        const userInput = document.getElementById('ptag-gh-filter-user');
        if (orderInput) orderInput.value = '';
        if (actionSelect) actionSelect.value = '';
        if (userInput) userInput.value = '';
        _globalHistoryFiltered = [..._globalHistoryCache];
        _globalHistoryPage = 0;
        _ptagRenderGlobalHistoryList();
    }

    // =====================================================
    // SECTION 11: WINDOW EXPORTS
    // =====================================================

    // Helpers (exposed for external callers)
    window._ptagResolveCode = _ptagResolveCode;
    window._ptagResolveId = _ptagResolveId;

    // Core functions
    window.loadProcessingTags = loadProcessingTags;
    window.setupProcessingTagSSE = setupProcessingTagSSE;
    window.initProcessingTagPanel = initProcessingTagPanel;
    window.assignOrderCategory = assignOrderCategory;
    window.toggleOrderFlag = toggleOrderFlag;
    window.clearProcessingTag = clearProcessingTag;
    window.transferProcessingTags = transferProcessingTags;
    window.renderProcessingTagCell = renderProcessingTagCell;
    window.renderPanelContent = renderPanelContent;

    // Hooks (called from other files)
    window.onPtagBillCreated = onPtagBillCreated;
    window.onPtagBillCancelled = onPtagBillCancelled;
    window.onPtagPackingSlipPrinted = onPtagPackingSlipPrinted;
    window.onPtagOrderTagsChanged = onPtagOrderTagsChanged;

    // Filter (called from tab1-search.js)
    window.getActiveProcessingTagFilter = getActiveProcessingTagFilter;
    window.hasActiveProcessingTagFilters = hasActiveProcessingTagFilters;
    window.orderPassesProcessingTagFilter = orderPassesProcessingTagFilter;

    // --- Cleanup empty tags (custom flags + T-tags with 0 orders) ---
    async function _ptagCleanupEmptyTags() {
        // Compute flag & T-tag counts from ALL tagged orders (across all campaigns)
        const taggedOrders = ProcessingTagState.getAllOrders();
        const flagCounts = {};
        const tTagCounts = {};

        for (const [key, data] of taggedOrders) {
            (data.flags || []).forEach(f => { flagCounts[f] = (flagCounts[f] || 0) + 1; });
            (data.tTags || []).forEach(t => { tTagCounts[t] = (tTagCounts[t] || 0) + 1; });
        }

        // Find custom flags with 0 orders
        const customFlagDefs = ProcessingTagState.getCustomFlagDefs();
        const emptyCustomFlags = customFlagDefs.filter(cf => (flagCounts[cf.id] || 0) === 0);

        // Find non-default T-tags with 0 orders
        const tTagDefs = ProcessingTagState.getTTagDefinitions();
        const emptyTTags = tTagDefs.filter(def =>
            !DEFAULT_TTAG_DEFS.some(d => d.id === def.id) && (tTagCounts[def.id] || 0) === 0
        );

        if (emptyCustomFlags.length === 0 && emptyTTags.length === 0) {
            alert('Không có tag nào cần xóa (tất cả đều có đơn hàng).');
            return;
        }

        const lines = [];
        if (emptyCustomFlags.length > 0) {
            lines.push(`${emptyCustomFlags.length} Tag Đặc Điểm: ${emptyCustomFlags.map(f => f.label).join(', ')}`);
        }
        if (emptyTTags.length > 0) {
            lines.push(`${emptyTTags.length} Tag T: ${emptyTTags.map(t => t.name).join(', ')}`);
        }
        if (!confirm(`Xóa các tag không còn đơn hàng?\n\n${lines.join('\n')}`)) return;

        // Delete empty custom flags
        if (emptyCustomFlags.length > 0) {
            const emptyIds = new Set(emptyCustomFlags.map(cf => cf.id));
            const remaining = customFlagDefs.filter(cf => !emptyIds.has(cf.id));
            ProcessingTagState.setCustomFlagDefs(remaining);
            await saveCustomFlagDefinitions();
        }

        // Delete empty T-tag definitions
        if (emptyTTags.length > 0) {
            const emptyTTagIds = new Set(emptyTTags.map(t => t.id));
            const remaining = tTagDefs.filter(d => !emptyTTagIds.has(d.id));
            ProcessingTagState.setTTagDefinitions(remaining);
            await saveTTagDefinitions();
        }

        console.log(`${PTAG_LOG} Cleaned up ${emptyCustomFlags.length} empty custom flags + ${emptyTTags.length} empty T-tags`);
        renderPanelContent();
    }

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
    window._ptagToggleFlagsSection = _ptagToggleFlagsSection;
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

    // T-tag manager v2 (called from onclick)
    window._ptagOpenTTagManager = _ptagOpenTTagManager;
    window._ptagCloseTTagManager = _ptagCloseTTagManager;
    window._ptagDeleteTTagDef = _ptagDeleteTTagDef;
    window._ptagDeleteTTagDefAndOrders = _ptagDeleteTTagDefAndOrders;
    window._ptagFindByProductCode = _ptagFindByProductCode;
    // Manager v2 functions
    window._ttagMgrSwitchTab = _ttagMgrSwitchTab;
    window._ttagMgrAddTag = _ttagMgrAddTag;
    window._ttagMgrRemoveTagRow = _ttagMgrRemoveTagRow;
    window._ttagMgrClearAll = _ttagMgrClearAll;
    window._ttagMgrRemoveSTT = _ttagMgrRemoveSTT;
    window._ttagMgrHandleSTTKeydown = _ttagMgrHandleSTTKeydown;
    window._ttagMgrHandleSearchKeydown = _ttagMgrHandleSearchKeydown;
    window._ttagMgrFilterDropdown = _ttagMgrFilterDropdown;
    window._ttagMgrShowDropdown = _ttagMgrShowDropdown;
    window._ttagMgrFindByProductCode = _ttagMgrFindByProductCode;
    window._ttagMgrExecute = _ttagMgrExecute;
    window._ttagMgrToggleSelectAll = _ttagMgrToggleSelectAll;
    window._ttagMgrToggleRowSelection = _ttagMgrToggleRowSelection;
    window._ttagMgrShowHistory = _ttagMgrShowHistory;
    window._ttagMgrCloseHistory = _ttagMgrCloseHistory;
    window._ttagMgrShowSettings = _ttagMgrShowSettings;
    window._ttagMgrCloseSettings = _ttagMgrCloseSettings;
    window._ttagMgrRefreshSettings = _ttagMgrRefreshSettings;
    window._ttagMgrStartRename = _ttagMgrStartRename;
    window._ttagMgrConfirmRename = _ttagMgrConfirmRename;
    window._ttagMgrShowCreateForm = _ttagMgrShowCreateForm;
    window._ttagMgrCancelCreate = _ttagMgrCancelCreate;
    window._ttagMgrConfirmCreate = _ttagMgrConfirmCreate;

    // T-tag business logic
    window.assignTTagToOrder = assignTTagToOrder;
    window.removeTTagFromOrder = removeTTagFromOrder;
    window.saveTTagDefinitions = saveTTagDefinitions;
    window.saveCustomFlagDefinitions = saveCustomFlagDefinitions;

    // Cleanup empty tags
    window._ptagCleanupEmptyTags = _ptagCleanupEmptyTags;

    // History
    window._ptagShowHistory = _ptagRenderHistoryPopover;

    // Global tag history modal
    window._ptagOpenGlobalHistory = _ptagOpenGlobalHistory;
    window._ptagCloseGlobalHistory = _ptagCloseGlobalHistory;
    window._ptagGHFilterChanged = _ptagGHFilterChanged;
    window._ptagGHNextPage = _ptagGHNextPage;
    window._ptagGHPrevPage = _ptagGHPrevPage;
    window._ptagGHClearFilters = _ptagGHClearFilters;

    // Color picker for đặc điểm flags
    function _ptagOpenFlagColorPicker(flagKey, anchorEl) {
        document.querySelectorAll('.ptag-color-picker-popover').forEach(el => el.remove());
        const currentColor = _ptagGetFlagColor(flagKey);
        const rect = anchorEl.getBoundingClientRect();
        let html = `<div class="ptag-color-picker-popover" style="top:${rect.bottom + 4}px;left:${rect.left}px;">`;
        for (const c of PTAG_FLAG_COLOR_PALETTE) {
            const sel = c === currentColor ? ' selected' : '';
            html += `<div class="ptag-color-swatch${sel}" style="background:${c};" onclick="window._ptagApplyFlagColor('${flagKey}', '${c}'); event.stopPropagation();"></div>`;
        }
        html += `</div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        setTimeout(() => {
            document.addEventListener('click', function closer(e) {
                if (!e.target.closest('.ptag-color-picker-popover')) {
                    document.querySelectorAll('.ptag-color-picker-popover').forEach(el => el.remove());
                    document.removeEventListener('click', closer);
                }
            });
        }, 10);
    }

    function _ptagApplyFlagColor(flagKey, color) {
        _ptagSetFlagColor(flagKey, color);
        document.querySelectorAll('.ptag-color-picker-popover').forEach(el => el.remove());
        renderPanelContent();
        if (typeof window.refreshProcessingTagColumn === 'function') {
            window.refreshProcessingTagColumn();
        } else {
            // Re-render all visible tag cells
            const allData = ProcessingTagState._orderData;
            allData.forEach((_, key) => _ptagRefreshRow(key));
        }
    }

    window._ptagOpenFlagColorPicker = _ptagOpenFlagColorPicker;
    window._ptagApplyFlagColor = _ptagApplyFlagColor;

    // State (for debugging)
    window.ProcessingTagState = ProcessingTagState;


})();
