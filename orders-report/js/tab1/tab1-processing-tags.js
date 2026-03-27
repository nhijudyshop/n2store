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
            return this._orderData.get(orderId) || null;
        },
        setOrderData(orderId, data) {
            this._orderData.set(orderId, data);
        },
        updateOrder(orderId, updates) {
            const current = this._orderData.get(orderId);
            if (current) {
                Object.assign(current, updates);
            }
        },
        getOrderFlags(orderId) {
            return this._orderData.get(orderId)?.flags || [];
        },
        removeOrder(orderId) {
            this._orderData.delete(orderId);
        },
        hasOrder(orderId) {
            return this._orderData.has(orderId);
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
            return tagId;
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
            renderPanelContent();
            _ptagRefreshAllRows();
        } catch (e) {
            console.error(`${PTAG_LOG} Failed to load tags:`, e);
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

        ProcessingTagState.setOrderData(orderId, data);
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
        if (idx >= 0) {
            flags.splice(idx, 1);
        } else {
            flags.push(flagKey);
        }
        data.flags = flags;

        ProcessingTagState.setOrderData(orderId, data);
        _ptagRefreshRow(orderId);
        renderPanelContent();
        await saveProcessingTagToAPI(orderId, data);
    }

    async function clearProcessingTag(orderId) {
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
        ProcessingTagState.setOrderData(orderId, data);
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
        ProcessingTagState.setOrderData(orderId, data);
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
            previousPosition: snapshot
        };

        ProcessingTagState.setOrderData(saleOnlineId, newData);
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
            previousPosition: null
        };

        ProcessingTagState.setOrderData(saleOnlineId, restored);
        _ptagRefreshRow(saleOnlineId);
        renderPanelContent();
        saveProcessingTagToAPI(saleOnlineId, restored);
    }

    // Helpers
    function _ptagGetOrderPhone(orderId) {
        const order = ((typeof window.getAllOrders === 'function') ? window.getAllOrders() : []).find(o => o.Id === orderId);
        return order?.Telephone || order?.Phone || '';
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
        let badges = '';

        // 1. Category badge (tag xử lý) — FIRST
        if (data.category !== null && data.category !== undefined) {
            const catColor = PTAG_CATEGORY_COLORS[data.category];
            if (data.category === PTAG_CATEGORIES.HOAN_TAT) {
                badges += `<span class="ptag-badge ptag-cat-0" onclick="window._ptagOpenDropdown('${orderId}', '${orderCode}', this); event.stopPropagation();">🟢 Hoàn tất</span>`;
            } else if (data.category === PTAG_CATEGORIES.CHO_DI_DON) {
                const ss = PTAG_SUBSTATES[data.subState] || PTAG_SUBSTATES.OKIE_CHO_DI_DON;
                badges += `<span class="ptag-badge" style="border-color:${ss.color};color:${ss.color};background:${ss.color}12;" onclick="window._ptagOpenDropdown('${orderId}', '${orderCode}', this); event.stopPropagation();">${ss.label}</span>`;
            } else {
                const subTagDef = PTAG_SUBTAGS[data.subTag];
                const label = subTagDef?.label || PTAG_CATEGORY_META[data.category]?.short || '';
                badges += `<span class="ptag-badge" style="border-color:${catColor.border};color:${catColor.text};background:${catColor.bg};" onclick="window._ptagOpenDropdown('${orderId}', '${orderCode}', this); event.stopPropagation();">${label}</span>`;
            }
        }

        // 2. Flag badges (đặc điểm) — SECOND
        (data.flags || []).forEach(f => {
            const fl = PTAG_FLAGS[f];
            if (fl) {
                badges += `<span class="ptag-flag-badge">${fl.label}</span>`;
            } else {
                // Custom flag
                const cf = ProcessingTagState._customFlags?.get(f);
                if (cf) badges += `<span class="ptag-flag-badge">${cf.label}</span>`;
            }
        });

        // 3. T-tag badges — LAST
        const _tTags = data.tTags || [];
        if (_tTags.length > 0) {
            badges += `<div class="ptag-ttag-badges" onclick="window._ptagOpenTTagModal('${orderId}'); event.stopPropagation();">${_tTags.map(t => `<span class="ptag-ttag-badge">${t}</span>`).join('')}</div>`;
        }

        const badgesRow = badges ? `<div class="ptag-cell-badges">${badges}</div>` : '';
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
        const taggedCount = taggedOrders.size;
        const untaggedCount = totalOrders - taggedCount;

        // Count per category
        const catCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
        const subStateCounts = {};
        const flagCounts = {};
        const subTagCounts = {};
        const tTagCounts = {};

        for (const [orderId, data] of taggedOrders) {
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

        // Count T-tags from internal processing tag data
        for (const [orderId, data] of taggedOrders) {
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
        {
            html += `<div class="ptag-panel-group ptag-ttag-section" data-search="tag t cho hang">
                <div class="ptag-panel-cat-header-v2" style="border-left-color:#8b5cf6;background:rgba(139,92,246,0.08);">
                    <span class="ptag-cat-name" style="color:#5b21b6;">\u{1F4E6} TAG T CHỜ HÀNG</span>
                    <span class="ptag-cat-count">${tTagDefs.length}</span>
                    <button class="ptag-panel-btn" style="display:inline-flex;width:20px;height:20px;font-size:10px;margin-left:4px;background:none;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;align-items:center;justify-content:center;" onclick="window._ptagOpenTTagManager(); event.stopPropagation();" title="Quản lý Tag T">
                        <i class="fas fa-cog" style="font-size:9px;color:#6b7280;"></i>
                    </button>
                </div>`;
            for (const def of tTagDefs) {
                const fk = 'ttag_' + def.id;
                const escapedFk = fk.replace(/'/g, "\\'");
                const count = tTagCounts[def.id] || 0;
                html += `<div class="ptag-panel-card ${activeFilter === fk ? 'active' : ''}" onclick="window._ptagSetFilter('${escapedFk}')" data-search="${_ptagNormalize(def.name)}">
                    <div class="ptag-panel-card-icon ptag-panel-card-icon--sm" style="background:#8b5cf6;">
                        <span style="font-size:12px;">\u{1F3F7}\uFE0F</span>
                    </div>
                    <div class="ptag-panel-card-info">
                        <div class="ptag-panel-card-name" style="color:#7c3aed;">${def.name}</div>
                        <div class="ptag-panel-card-count">${count} đơn hàng</div>
                    </div>
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
        body.querySelectorAll('.ptag-panel-card, .ptag-panel-cat-header-v2, .ptag-panel-flag-item, .ptag-panel-group').forEach(el => {
            if (!el.dataset.search) return;
            const match = el.dataset.search.includes(norm);
            el.style.display = match ? '' : 'none';
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
            return `<span class="ptag-ttag-pill ${isPending ? 'deletion-pending' : ''}" style="background-color:${bg};">
                ${tagId}
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

    function _ptagAutoCreateTTag(name) {
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

        // Create new definition: id = name (UPPERCASE)
        const newDef = { id: upperName, name: upperName };
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

        ProcessingTagState.setOrderData(orderId, data);
        _ptagRefreshRow(orderId);
        renderPanelContent();
        await saveProcessingTagToAPI(orderId, data);

        _ptagCloseTTagModal();
        console.log(`${PTAG_LOG} Saved ${data.tTags.length} T-tags for order ${orderId}`);
    }

    // =====================================================
    // SECTION 8C: T-TAG MANAGER (quản lý definitions)
    // =====================================================

    function _ptagOpenTTagManager() {
        const existing = document.getElementById('ptag-ttag-manager');
        if (existing) existing.remove();

        const defs = ProcessingTagState.getTTagDefinitions();

        // Count orders per tag
        const counts = {};
        for (const [, data] of ProcessingTagState.getAllOrders()) {
            if (data.tTags) {
                for (const tagId of data.tTags) {
                    counts[tagId] = (counts[tagId] || 0) + 1;
                }
            }
        }

        let listHtml = '';
        if (defs.length === 0) {
            listHtml = '<div style="text-align:center;padding:20px;color:#9ca3af;">Chưa có tag T nào.<br>Tạo từ dropdown khi gán cho đơn.</div>';
        } else {
            listHtml = defs.map(def => {
                const count = counts[def.id] || 0;
                const escapedId = def.id.replace(/'/g, "\\'");
                return `<div class="ptag-ttag-def-item">
                    <span style="color:#7c3aed;font-weight:600;flex:1;">${def.name}</span>
                    <span class="ptag-count" style="margin-right:8px;">${count}</span>
                    <button class="ptag-ttag-def-delete" onclick="window._ptagDeleteTTagDef('${escapedId}')" title="Xóa tag ${def.name}">&times;</button>
                </div>`;
            }).join('');
        }

        const modal = document.createElement('div');
        modal.id = 'ptag-ttag-manager';
        modal.className = 'ptag-ttag-modal';
        modal.innerHTML = `
            <div class="ptag-ttag-modal-content" style="max-width:450px;">
                <div class="ptag-ttag-header">
                    <span style="font-weight:600;font-size:14px;">\u{1F4E6} Quản lý Tag T Chờ Hàng</span>
                    <span style="flex:1;"></span>
                    <button class="ptag-ttag-close-btn" onclick="window._ptagCloseTTagManager()">&times;</button>
                </div>
                <div style="padding:12px;max-height:400px;overflow-y:auto;" id="ptag-ttag-manager-list">
                    ${listHtml}
                </div>
            </div>`;
        document.body.appendChild(modal);
    }

    function _ptagCloseTTagManager() {
        const modal = document.getElementById('ptag-ttag-manager');
        if (modal) modal.remove();
    }

    function _ptagDeleteTTagDef(tagId) {
        const defs = ProcessingTagState.getTTagDefinitions();
        // Count how many orders use this tag
        let count = 0;
        for (const [, data] of ProcessingTagState.getAllOrders()) {
            if (data.tTags && data.tTags.includes(tagId)) count++;
        }

        if (count > 0 && !confirm(`Tag ${tagId} đang được dùng cho ${count} đơn. Xóa definition sẽ không xóa tag khỏi các đơn. Tiếp tục?`)) {
            return;
        }

        const idx = defs.findIndex(d => d.id === tagId);
        if (idx >= 0) {
            defs.splice(idx, 1);
            ProcessingTagState.setTTagDefinitions(defs);
            saveTTagDefinitions();
            renderPanelContent();
            // Re-render manager list
            _ptagCloseTTagManager();
            _ptagOpenTTagManager();
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
    // SECTION 10: UTILITIES
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

    // T-tag business logic
    window.assignTTagToOrder = assignTTagToOrder;
    window.removeTTagFromOrder = removeTTagFromOrder;

    // State (for debugging)
    window.ProcessingTagState = ProcessingTagState;

    console.log(`${PTAG_LOG} Module loaded`);

})();
