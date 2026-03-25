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

    // =====================================================
    // SECTION 2: STATE MANAGEMENT
    // =====================================================

    const ProcessingTagState = {
        _orderData: new Map(),
        _panelOpen: false,
        _panelPinned: JSON.parse(localStorage.getItem('ptag_panel_pinned') || 'false'),
        _activeFilter: null,
        _campaignId: null,
        _sseSource: null,
        _pollInterval: null,

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
        const order = (window.allData || []).find(o => o.Id === orderId);
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
            const order = (window.allData || []).find(o => o.Id === orderId);
            cell.innerHTML = renderProcessingTagCell(orderId, order?.Code || '');
        });
    }

    // =====================================================
    // SECTION 4: CORE BUSINESS LOGIC
    // =====================================================

    async function assignOrderCategory(orderId, category, options = {}) {
        const data = {
            category,
            subTag: options.subTag || null,
            subState: null,
            flags: options.flags || [],
            note: options.note || '',
            assignedAt: Date.now(),
            previousPosition: null
        };

        // Category 1 (CHỜ ĐI ĐƠN): auto-detect sub-state + flags
        if (category === PTAG_CATEGORIES.CHO_DI_DON) {
            // Auto sub-state from T-tags
            const orderTags = _ptagGetOrderTPOSTags(orderId);
            const hasTTag = orderTags.some(t => /^T\d/.test(t.Name || t.name || ''));
            data.subState = hasTTag ? 'CHO_HANG' : 'OKIE_CHO_DI_DON';

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
            const order = (window.allData || []).find(o => o.Id === orderId);
            if (order && parseFloat(order.Discount || 0) > 0 && !existingFlags.includes('GIAM_GIA')) {
                newFlags.push('GIAM_GIA');
            }
        } catch (e) {
            console.warn(`${PTAG_LOG} Discount check failed:`, e);
        }

        return newFlags;
    }

    async function toggleOrderFlag(orderId, flagKey) {
        const data = ProcessingTagState.getOrderData(orderId);
        if (!data || data.category !== PTAG_CATEGORIES.CHO_DI_DON) return;

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

    // Auto sub-state from T-tag changes
    function onPtagOrderTagsChanged(orderId, newTags) {
        const data = ProcessingTagState.getOrderData(orderId);
        if (!data || data.category !== PTAG_CATEGORIES.CHO_DI_DON) return;

        const tags = Array.isArray(newTags) ? newTags : [];
        const hasTTag = tags.some(t => /^T\d/.test(t.Name || t.name || ''));
        const newSubState = hasTTag ? 'CHO_HANG' : 'OKIE_CHO_DI_DON';

        if (data.subState !== newSubState) {
            data.subState = newSubState;
            ProcessingTagState.setOrderData(orderId, data);
            _ptagRefreshRow(orderId);
            renderPanelContent();
            saveProcessingTagToAPI(orderId, data);
        }
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
            note: data.note
        };

        const newData = {
            category: PTAG_CATEGORIES.HOAN_TAT,
            subTag: null,
            subState: null,
            flags: [],
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
    function _ptagGetOrderTPOSTags(orderId) {
        try {
            const order = (window.allData || []).find(o => o.Id === orderId);
            if (!order?.Tags) return [];
            const tags = typeof order.Tags === 'string' ? JSON.parse(order.Tags) : order.Tags;
            return Array.isArray(tags) ? tags : [];
        } catch { return []; }
    }

    function _ptagGetOrderPhone(orderId) {
        const order = (window.allData || []).find(o => o.Id === orderId);
        return order?.Telephone || order?.Phone || '';
    }

    // =====================================================
    // SECTION 5: UI — TABLE CELL RENDERING
    // =====================================================

    function renderProcessingTagCell(orderId, orderCode) {
        const data = ProcessingTagState.getOrderData(orderId);

        if (!data) {
            return `<div class="ptag-cell">
                <button class="ptag-assign-btn" onclick="window._ptagOpenDropdown('${orderId}', '${orderCode}', this); event.stopPropagation();" title="Gán tag xử lý">
                    <i class="fas fa-tasks" style="font-size:11px;color:#9ca3af;"></i>
                </button>
            </div>`;
        }

        const catColor = PTAG_CATEGORY_COLORS[data.category];

        // Cat 0 — HOÀN TẤT
        if (data.category === PTAG_CATEGORIES.HOAN_TAT) {
            return `<div class="ptag-cell">
                <span class="ptag-badge ptag-cat-0" title="Hoàn tất — Đã ra đơn">Hoàn tất</span>
                <button class="ptag-clear-btn" onclick="window._ptagClear('${orderId}'); event.stopPropagation();" title="Xóa tag">&times;</button>
            </div>`;
        }

        // Cat 1 — CHỜ ĐI ĐƠN
        if (data.category === PTAG_CATEGORIES.CHO_DI_DON) {
            const ss = PTAG_SUBSTATES[data.subState] || PTAG_SUBSTATES.OKIE_CHO_DI_DON;
            const flagIcons = (data.flags || []).map(f => PTAG_FLAGS[f]?.icon || '').filter(Boolean).join('');
            return `<div class="ptag-cell">
                <span class="ptag-badge" style="border-color:${ss.color};color:${ss.color};" title="${ss.label}">${ss.label}</span>
                ${flagIcons ? `<span class="ptag-flags" title="${(data.flags||[]).map(f=>PTAG_FLAGS[f]?.label||f).join(', ')}">${flagIcons}</span>` : ''}
                <button class="ptag-assign-btn" onclick="window._ptagOpenDropdown('${orderId}', '${orderCode}', this); event.stopPropagation();" title="Sửa tag">
                    <i class="fas fa-pen" style="font-size:9px;color:#9ca3af;"></i>
                </button>
                <button class="ptag-clear-btn" onclick="window._ptagClear('${orderId}'); event.stopPropagation();" title="Xóa tag">&times;</button>
            </div>`;
        }

        // Cat 2,3,4 — Sub-tag
        const subTagDef = PTAG_SUBTAGS[data.subTag];
        const label = subTagDef?.label || PTAG_CATEGORY_META[data.category]?.short || '';
        return `<div class="ptag-cell">
            <span class="ptag-badge" style="border-color:${catColor.border};color:${catColor.text};background:${catColor.bg};" title="${PTAG_CATEGORY_META[data.category]?.name || ''}">${label}</span>
            <button class="ptag-assign-btn" onclick="window._ptagOpenDropdown('${orderId}', '${orderCode}', this); event.stopPropagation();" title="Sửa tag">
                <i class="fas fa-pen" style="font-size:9px;color:#9ca3af;"></i>
            </button>
            <button class="ptag-clear-btn" onclick="window._ptagClear('${orderId}'); event.stopPropagation();" title="Xóa tag">&times;</button>
        </div>`;
    }

    // =====================================================
    // SECTION 6: UI — DROPDOWN
    // =====================================================

    let _currentDropdown = null;

    function _ptagOpenDropdown(orderId, orderCode, anchorEl) {
        _ptagCloseDropdown();

        const rect = anchorEl.getBoundingClientRect();
        const data = ProcessingTagState.getOrderData(orderId);

        let html = `<div class="ptag-dropdown" id="ptag-dropdown">
            <div class="ptag-dd-header">
                <span style="font-weight:600;font-size:12px;">Chọn trạng thái</span>
                ${data ? `<button class="ptag-dd-clear" onclick="window._ptagClear('${orderId}'); window._ptagCloseDropdown();">Xóa</button>` : ''}
            </div>
            <input type="text" class="ptag-dd-search" placeholder="Tìm..." oninput="window._ptagFilterDropdown(this.value)" />
            <div class="ptag-dd-list">`;

        // Cat 1 — CHỜ ĐI ĐƠN
        const isCat1 = data?.category === PTAG_CATEGORIES.CHO_DI_DON;
        html += `<div class="ptag-dd-group" data-search="cho di don oke okie">
            <div class="ptag-dd-cat-header" style="border-left:3px solid ${PTAG_CATEGORY_COLORS[1].border};">
                ${PTAG_CATEGORY_META[1].emoji} ${PTAG_CATEGORY_META[1].name}
            </div>
            <div class="ptag-dd-item ${isCat1 ? 'active' : ''}" onclick="window._ptagAssign('${orderId}', 1, null); window._ptagCloseDropdown();" data-search="okie cho di don">
                Okie Chờ Đi Đơn
            </div>`;

        // Flags (chỉ hiện khi đang ở cat 1)
        if (isCat1) {
            html += `<div class="ptag-dd-flags">`;
            for (const [key, flag] of Object.entries(PTAG_FLAGS)) {
                const checked = (data.flags || []).includes(key);
                html += `<label class="ptag-dd-flag ${checked ? 'checked' : ''}" data-search="${_ptagNormalize(flag.label)}">
                    <input type="checkbox" ${checked ? 'checked' : ''} onchange="window._ptagToggleFlag('${orderId}', '${key}'); event.stopPropagation();" />
                    ${flag.icon} ${flag.label}${flag.auto ? ' <span class="ptag-auto-badge">auto</span>' : ''}
                </label>`;
            }
            html += `</div>`;
        }
        html += `</div>`;

        // Cat 2 — XỬ LÝ
        html += `<div class="ptag-dd-group" data-search="xu ly">
            <div class="ptag-dd-cat-header" style="border-left:3px solid ${PTAG_CATEGORY_COLORS[2].border};">
                ${PTAG_CATEGORY_META[2].emoji} ${PTAG_CATEGORY_META[2].name}
            </div>`;
        for (const [key, st] of Object.entries(PTAG_SUBTAGS)) {
            if (st.category !== 2) continue;
            const active = data?.category === 2 && data?.subTag === key;
            html += `<div class="ptag-dd-item ${active ? 'active' : ''}" onclick="window._ptagAssign('${orderId}', 2, '${key}'); window._ptagCloseDropdown();" data-search="${_ptagNormalize(st.label)}">
                ${st.label}
            </div>`;
        }
        html += `</div>`;

        // Cat 3 — KHÔNG CẦN CHỐT
        html += `<div class="ptag-dd-group" data-search="khong can chot">
            <div class="ptag-dd-cat-header" style="border-left:3px solid ${PTAG_CATEGORY_COLORS[3].border};">
                ${PTAG_CATEGORY_META[3].emoji} ${PTAG_CATEGORY_META[3].name}
            </div>`;
        for (const [key, st] of Object.entries(PTAG_SUBTAGS)) {
            if (st.category !== 3) continue;
            const active = data?.category === 3 && data?.subTag === key;
            html += `<div class="ptag-dd-item ${active ? 'active' : ''}" onclick="window._ptagAssign('${orderId}', 3, '${key}'); window._ptagCloseDropdown();" data-search="${_ptagNormalize(st.label)}">
                ${st.label}
            </div>`;
        }
        html += `</div>`;

        // Cat 4 — KHÁCH XÃ
        html += `<div class="ptag-dd-group" data-search="khach xa">
            <div class="ptag-dd-cat-header" style="border-left:3px solid ${PTAG_CATEGORY_COLORS[4].border};">
                ${PTAG_CATEGORY_META[4].emoji} ${PTAG_CATEGORY_META[4].name}
            </div>`;
        for (const [key, st] of Object.entries(PTAG_SUBTAGS)) {
            if (st.category !== 4) continue;
            const active = data?.category === 4 && data?.subTag === key;
            html += `<div class="ptag-dd-item ${active ? 'active' : ''}" onclick="window._ptagAssign('${orderId}', 4, '${key}'); window._ptagCloseDropdown();" data-search="${_ptagNormalize(st.label)}">
                ${st.label}
            </div>`;
        }
        html += `</div>`;

        html += `</div></div>`;

        // Insert dropdown
        const dropdown = document.createElement('div');
        dropdown.innerHTML = html;
        const ddEl = dropdown.firstElementChild;
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

        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', _ptagCloseOnOutside);
            document.addEventListener('keydown', _ptagCloseOnEsc);
        }, 10);
    }

    function _ptagCloseDropdown() {
        if (_currentDropdown) {
            _currentDropdown.remove();
            _currentDropdown = null;
        }
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
        dd.querySelectorAll('.ptag-dd-group').forEach(group => {
            const groupMatch = (group.dataset.search || '').includes(norm);
            let anyItemVisible = false;
            group.querySelectorAll('.ptag-dd-item, .ptag-dd-flag').forEach(item => {
                const match = groupMatch || (item.dataset.search || '').includes(norm);
                item.style.display = match ? '' : 'none';
                if (match) anyItemVisible = true;
            });
            group.style.display = (groupMatch || anyItemVisible) ? '' : 'none';
        });
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

    function renderPanelContent() {
        const body = document.getElementById('ptag-panel-body');
        if (!body) return;

        const allOrders = window.allData || [];
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
                const ss = data.subState || 'OKIE_CHO_DI_DON';
                subStateCounts[ss] = (subStateCounts[ss] || 0) + 1;
                (data.flags || []).forEach(f => {
                    flagCounts[f] = (flagCounts[f] || 0) + 1;
                });
            }
            if (data.subTag) {
                subTagCounts[data.subTag] = (subTagCounts[data.subTag] || 0) + 1;
            }
        }

        // Count T-tags from TPOS data
        for (const order of allOrders) {
            try {
                const tags = typeof order.Tags === 'string' ? JSON.parse(order.Tags) : (order.Tags || []);
                if (Array.isArray(tags)) {
                    tags.filter(t => /^T\d/.test(t.Name || '')).forEach(t => {
                        tTagCounts[t.Name] = (tTagCounts[t.Name] || 0) + 1;
                    });
                }
            } catch {}
        }

        const activeFilter = ProcessingTagState._activeFilter;

        let html = '';

        // Special filters
        html += `<div class="ptag-panel-item ${activeFilter === null ? 'active' : ''}" onclick="window._ptagSetFilter(null)" data-search="tat ca">
            <span>TẤT CẢ</span><span class="ptag-count">${totalOrders}</span>
        </div>`;
        html += `<div class="ptag-panel-item ${activeFilter === '__no_tag__' ? 'active' : ''}" onclick="window._ptagSetFilter('__no_tag__')" data-search="chua gan tag">
            <span>CHƯA GÁN TAG</span><span class="ptag-count">${untaggedCount}</span>
        </div>`;

        // Category 0 — HOÀN TẤT
        html += _renderPanelCategory(0, catCounts[0], activeFilter);

        // Category 1 — CHỜ ĐI ĐƠN + sub-states + flags
        html += `<div class="ptag-panel-group" data-search="cho di don oke">
            <div class="ptag-panel-item ptag-cat-header ${activeFilter === 'cat_1' ? 'active' : ''}" style="border-left:3px solid ${PTAG_CATEGORY_COLORS[1].border};" onclick="window._ptagSetFilter('cat_1')">
                <span>${PTAG_CATEGORY_META[1].emoji} ${PTAG_CATEGORY_META[1].name}</span>
                <span class="ptag-count">${catCounts[1]}</span>
            </div>`;
        // Sub-states
        for (const [key, ss] of Object.entries(PTAG_SUBSTATES)) {
            const fk = 'sub_' + key;
            html += `<div class="ptag-panel-item ptag-sub-item ${activeFilter === fk ? 'active' : ''}" onclick="window._ptagSetFilter('${fk}')" data-search="${_ptagNormalize(ss.label)}">
                <span style="color:${ss.color};">${ss.label}</span>
                <span class="ptag-count">${subStateCounts[key] || 0}</span>
            </div>`;
        }
        // Flags
        for (const [key, flag] of Object.entries(PTAG_FLAGS)) {
            const fk = 'flag_' + key;
            html += `<div class="ptag-panel-item ptag-sub-item ${activeFilter === fk ? 'active' : ''}" onclick="window._ptagSetFilter('${fk}')" data-search="${_ptagNormalize(flag.label)}">
                <span>${flag.icon} ${flag.label}</span>
                <span class="ptag-count">${flagCounts[key] || 0}</span>
            </div>`;
        }
        html += `</div>`;

        // Categories 2,3,4
        for (const cat of [2, 3, 4]) {
            const subtags = Object.entries(PTAG_SUBTAGS).filter(([, v]) => v.category === cat);
            html += `<div class="ptag-panel-group" data-search="${_ptagNormalize(PTAG_CATEGORY_META[cat].name)}">
                <div class="ptag-panel-item ptag-cat-header ${activeFilter === 'cat_' + cat ? 'active' : ''}" style="border-left:3px solid ${PTAG_CATEGORY_COLORS[cat].border};" onclick="window._ptagSetFilter('cat_${cat}')">
                    <span>${PTAG_CATEGORY_META[cat].emoji} ${PTAG_CATEGORY_META[cat].name}</span>
                    <span class="ptag-count">${catCounts[cat]}</span>
                </div>`;
            for (const [key, st] of subtags) {
                const fk = 'subtag_' + key;
                html += `<div class="ptag-panel-item ptag-sub-item ${activeFilter === fk ? 'active' : ''}" onclick="window._ptagSetFilter('${fk}')" data-search="${_ptagNormalize(st.label)}">
                    <span>${st.label}</span>
                    <span class="ptag-count">${subTagCounts[key] || 0}</span>
                </div>`;
            }
            html += `</div>`;
        }

        // Tag T section
        const tTagNames = Object.keys(tTagCounts).sort();
        if (tTagNames.length > 0) {
            html += `<div class="ptag-panel-group ptag-ttag-section" data-search="tag t cho hang">
                <div class="ptag-panel-item ptag-cat-header" style="border-left:3px solid #8b5cf6;">
                    <span>TAG T CHỜ HÀNG</span>
                    <span class="ptag-count">${tTagNames.length}</span>
                </div>`;
            for (const name of tTagNames) {
                const fk = 'ttag_' + name;
                html += `<div class="ptag-panel-item ptag-sub-item ${activeFilter === fk ? 'active' : ''}" onclick="window._ptagSetFilter('${fk}')" data-search="${_ptagNormalize(name)}">
                    <span>${name}</span>
                    <span class="ptag-count">${tTagCounts[name]}</span>
                </div>`;
            }
            html += `</div>`;
        }

        body.innerHTML = html;
    }

    function _renderPanelCategory(cat, count, activeFilter) {
        const fk = 'cat_' + cat;
        return `<div class="ptag-panel-item ptag-cat-header ${activeFilter === fk ? 'active' : ''}" style="border-left:3px solid ${PTAG_CATEGORY_COLORS[cat].border};" onclick="window._ptagSetFilter('${fk}')" data-search="${_ptagNormalize(PTAG_CATEGORY_META[cat].name)}">
            <span>${PTAG_CATEGORY_META[cat].emoji} ${PTAG_CATEGORY_META[cat].name}</span>
            <span class="ptag-count">${count}</span>
        </div>`;
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

    function _ptagSetFilter(filterKey) {
        ProcessingTagState._activeFilter = filterKey;
        renderPanelContent();
        // Trigger table re-render
        if (typeof window.performTableSearch === 'function') {
            window.performTableSearch();
        }
    }

    function _ptagFilterPanel(query) {
        const norm = _ptagNormalize(query);
        const body = document.getElementById('ptag-panel-body');
        if (!body) return;
        body.querySelectorAll('.ptag-panel-item, .ptag-panel-group').forEach(el => {
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
        const orders = (window.allData || []).filter(o => stts.includes(o.SessionIndex));

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
    // SECTION 9: FILTER INTEGRATION
    // =====================================================

    function getActiveProcessingTagFilter() {
        return ProcessingTagState._activeFilter;
    }

    function orderPassesProcessingTagFilter(orderId) {
        const filter = ProcessingTagState._activeFilter;
        if (filter === null) return true;

        const data = ProcessingTagState.getOrderData(orderId);

        if (filter === '__no_tag__') return !data;

        if (!data) return false;

        // Category filter
        if (filter.startsWith('cat_')) {
            return data.category === parseInt(filter.replace('cat_', ''));
        }

        // Sub-state filter (cat 1)
        if (filter.startsWith('sub_')) {
            return data.category === PTAG_CATEGORIES.CHO_DI_DON && data.subState === filter.replace('sub_', '');
        }

        // Flag filter (cat 1)
        if (filter.startsWith('flag_')) {
            return data.category === PTAG_CATEGORIES.CHO_DI_DON && (data.flags || []).includes(filter.replace('flag_', ''));
        }

        // Sub-tag filter (cat 2,3,4)
        if (filter.startsWith('subtag_')) {
            return data.subTag === filter.replace('subtag_', '');
        }

        // T-tag filter
        if (filter.startsWith('ttag_')) {
            const tagName = filter.replace('ttag_', '');
            const tags = _ptagGetOrderTPOSTags(orderId);
            return tags.some(t => (t.Name || '') === tagName);
        }

        return true;
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
    window.orderPassesProcessingTagFilter = orderPassesProcessingTagFilter;

    // UI internal (called from onclick)
    window._ptagOpenDropdown = _ptagOpenDropdown;
    window._ptagCloseDropdown = _ptagCloseDropdown;
    window._ptagFilterDropdown = _ptagFilterDropdown;
    window._ptagAssign = _ptagAssign;
    window._ptagToggleFlag = _ptagToggleFlag;
    window._ptagClear = _ptagClear;
    window._ptagTogglePanel = _ptagTogglePanel;
    window._ptagTogglePin = _ptagTogglePin;
    window._ptagSetFilter = _ptagSetFilter;
    window._ptagFilterPanel = _ptagFilterPanel;
    window._ptagOpenBulkModal = _ptagOpenBulkModal;
    window._ptagCloseBulkModal = _ptagCloseBulkModal;
    window._ptagConfirmBulk = _ptagConfirmBulk;

    // State (for debugging)
    window.ProcessingTagState = ProcessingTagState;

    console.log(`${PTAG_LOG} Module loaded`);

})();
