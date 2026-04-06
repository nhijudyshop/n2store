// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// TAB1 TAG SYNC — Đồng bộ Tag TPOS → Tag XL
// Maps TPOS tags to Processing Tag categories/flags/tTags
// =====================================================

(function() {
    'use strict';

    const SYNC_LOG = '[TAG-SYNC]';
    const SYNC_STORAGE_KEY = 'tagSyncMappings_v2';
    const DEFAULT_ROW_COUNT = 5;

    // Processing tag category metadata (mirror from tab1-processing-tags.js)
    const CATEGORY_OPTIONS = [
        { value: 0, emoji: '🟢', label: 'ĐÃ RA ĐƠN' },
        { value: 1, emoji: '🔵', label: 'CHỜ ĐI ĐƠN (OKE)' },
        { value: 2, emoji: '🟠', label: 'MỤC XỬ LÝ' },
        { value: 3, emoji: '⚪', label: 'KHÔNG CẦN CHỐT' },
        { value: 4, emoji: '🔴', label: 'KHÁCH XÃ SAU CHỐT' },
        { value: 5, emoji: '📋', label: 'PHIẾU SOẠN HÀNG' }
    ];

    const SUBTAG_OPTIONS = {
        2: [
            { key: 'CHUA_PHAN_HOI', label: 'Đơn chưa phản hồi' },
            { key: 'CHUA_DUNG_SP', label: 'Đơn chưa đúng SP' },
            { key: 'KHACH_MUON_XA', label: 'Đơn khách muốn xã' },
            { key: 'BAN_HANG', label: 'Bán hàng' },
            { key: 'XU_LY_KHAC', label: 'Khác (ghi chú)' }
        ],
        3: [
            { key: 'DA_GOP_KHONG_CHOT', label: 'Đã gộp không chốt' },
            { key: 'GIO_TRONG', label: 'Giỏ trống' }
        ],
        4: [
            { key: 'NCC_HET_HANG', label: 'NCC hết hàng' },
            { key: 'KHACH_HUY_DON', label: 'Khách hủy nguyên đơn' },
            { key: 'KHACH_KO_LIEN_LAC', label: 'Khách không liên lạc được' }
        ]
    };

    // Built-in flags (mirror from tab1-processing-tags.js)
    const FLAG_OPTIONS = [
        { key: 'TRU_CONG_NO', label: 'Trừ công nợ', icon: '💰' },
        { key: 'CHUYEN_KHOAN', label: 'CK', icon: '💳' },
        { key: 'GIAM_GIA', label: 'Giảm giá', icon: '🏷️' },
        { key: 'CHO_LIVE', label: 'Chờ live', icon: '📺' },
        { key: 'GIU_DON', label: 'Giữ đơn', icon: '⌛' },
        { key: 'QUA_LAY', label: 'Qua lấy', icon: '🏠' },
        { key: 'GOI_BAO_KHACH_HH', label: 'Gọi báo khách HH', icon: '📞' },
        { key: 'KHACH_BOOM', label: 'Khách boom', icon: '💥' },
        { key: 'THE_KHACH_LA', label: 'Thẻ khách lạ', icon: '🪪' },
        { key: 'DA_DI_DON_GAP', label: 'Đã đi đơn gấp', icon: '⚡' },
        { key: 'KHAC', label: 'Khác', icon: '📋' }
    ];

    // =====================================================
    // TAG XL TARGET TYPES
    // =====================================================
    // type: 'category' → assign category (+ optional subTag)
    // type: 'flag'     → toggle flag on order
    // type: 'ttag'     → assign T-tag to order
    // type: 'prefix'   → match TPOS tag by prefix, create custom flag with same name

    // =====================================================
    // STATE
    // =====================================================

    let syncMappings = [];
    let _rowIdCounter = 0;

    function _genRowId() {
        return 'tsync_' + (++_rowIdCounter) + '_' + Date.now();
    }

    function _createEmptyMapping() {
        return {
            id: _genRowId(),
            tposTagId: null,
            tposTagName: '',
            tposTagColor: '#6b7280',
            targetType: null,       // 'category', 'flag', 'ttag', 'prefix'
            ptagCategory: null,
            ptagSubTag: null,
            flagKey: null,
            ttagId: null,
            ttagName: '',
            prefix: ''
        };
    }

    // =====================================================
    // LOCALSTORAGE
    // =====================================================

    function saveMappingsToStorage() {
        try {
            const data = syncMappings.map(m => ({
                tposTagId: m.tposTagId,
                tposTagName: m.tposTagName,
                tposTagColor: m.tposTagColor,
                targetType: m.targetType,
                ptagCategory: m.ptagCategory,
                ptagSubTag: m.ptagSubTag,
                flagKey: m.flagKey,
                ttagId: m.ttagId,
                ttagName: m.ttagName,
                prefix: m.prefix
            }));
            localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn(SYNC_LOG, 'Failed to save mappings:', e);
        }
    }

    function loadMappingsFromStorage() {
        try {
            const raw = localStorage.getItem(SYNC_STORAGE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (!Array.isArray(data)) return null;
            return data.map(d => ({
                id: _genRowId(),
                tposTagId: d.tposTagId || null,
                tposTagName: d.tposTagName || '',
                tposTagColor: d.tposTagColor || '#6b7280',
                targetType: d.targetType || (d.ptagCategory != null ? 'category' : null),
                ptagCategory: d.ptagCategory != null ? d.ptagCategory : null,
                ptagSubTag: d.ptagSubTag || null,
                flagKey: d.flagKey || null,
                ttagId: d.ttagId || null,
                ttagName: d.ttagName || '',
                prefix: d.prefix || ''
            }));
        } catch (e) {
            console.warn(SYNC_LOG, 'Failed to load mappings:', e);
            return null;
        }
    }

    // =====================================================
    // MODAL LIFECYCLE
    // =====================================================

    function showTagSyncModal() {
        const saved = loadMappingsFromStorage();
        if (saved && saved.length > 0) {
            syncMappings = saved;
        } else {
            syncMappings = [];
            for (let i = 0; i < DEFAULT_ROW_COUNT; i++) {
                syncMappings.push(_createEmptyMapping());
            }
        }

        const modal = document.getElementById('tagSyncModal');
        if (modal) {
            modal.classList.add('show');
            renderMappingRows();
            _hideProgress();
        }
    }

    function closeTagSyncModal() {
        const modal = document.getElementById('tagSyncModal');
        if (modal) {
            modal.classList.remove('show');
        }
        document.querySelectorAll('.ts-dropdown.show').forEach(d => d.classList.remove('show'));
    }

    // =====================================================
    // RENDERING
    // =====================================================

    function renderMappingRows() {
        const body = document.getElementById('tagSyncTableBody');
        if (!body) return;

        body.innerHTML = syncMappings.map((mapping, index) => {
            // TPOS tag display (left side)
            let tposDisplay;
            if (mapping.targetType === 'prefix') {
                tposDisplay = mapping.prefix
                    ? `<span class="ts-prefix-display">🔤 Prefix: <b>${_escHtml(mapping.prefix)}</b>...</span>`
                    : '<span class="ts-placeholder">Chọn tag TPOS...</span>';
            } else {
                tposDisplay = mapping.tposTagId
                    ? `<span class="ts-tag-pill" style="background:${mapping.tposTagColor || '#6b7280'}">${_escHtml(mapping.tposTagName)}</span>`
                    : '<span class="ts-placeholder">Chọn tag TPOS...</span>';
            }

            // Tag XL display (right side)
            const ptagDisplay = _getTargetDisplayText(mapping);

            return `
                <div class="ts-row" data-row-id="${mapping.id}">
                    <div class="ts-cell ts-cell-index">${index + 1}</div>
                    <div class="ts-cell ts-cell-tpos">
                        <div class="ts-select" onclick="window._tsToggleTposDropdown('${mapping.id}', event)">
                            ${tposDisplay}
                            <i class="fas fa-chevron-down ts-chevron"></i>
                        </div>
                        <div class="ts-dropdown" id="tsDdTpos_${mapping.id}">
                            <input type="text" class="ts-search-input" placeholder="Tìm tag..."
                                oninput="window._tsFilterTposTags('${mapping.id}', this.value)"
                                onclick="event.stopPropagation()">
                            <div class="ts-dropdown-list" id="tsDdTposList_${mapping.id}"></div>
                        </div>
                    </div>
                    <div class="ts-cell ts-cell-arrow">→</div>
                    <div class="ts-cell ts-cell-ptag">
                        <div class="ts-select" onclick="window._tsTogglePtagDropdown('${mapping.id}', event)">
                            ${ptagDisplay}
                            <i class="fas fa-chevron-down ts-chevron"></i>
                        </div>
                        <div class="ts-dropdown ts-dropdown-ptag" id="tsDdPtag_${mapping.id}">
                            <div class="ts-dropdown-list" id="tsDdPtagList_${mapping.id}"></div>
                        </div>
                    </div>
                    <div class="ts-cell ts-cell-action">
                        <button class="ts-remove-btn" onclick="window._tsRemoveRow('${mapping.id}')" title="Xóa dòng">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function _getTargetDisplayText(mapping) {
        if (!mapping.targetType) return '<span class="ts-placeholder">Chọn Tag XL...</span>';

        switch (mapping.targetType) {
            case 'category': {
                const cat = CATEGORY_OPTIONS.find(c => c.value === mapping.ptagCategory);
                if (!cat) return '<span class="ts-placeholder">Chọn Tag XL...</span>';
                let text = `${cat.emoji} ${cat.label}`;
                if (mapping.ptagSubTag && SUBTAG_OPTIONS[mapping.ptagCategory]) {
                    const sub = SUBTAG_OPTIONS[mapping.ptagCategory].find(s => s.key === mapping.ptagSubTag);
                    if (sub) text += ` → ${sub.label}`;
                }
                return `<span class="ts-ptag-display">${text}</span>`;
            }
            case 'flag': {
                const fl = FLAG_OPTIONS.find(f => f.key === mapping.flagKey);
                if (fl) return `<span class="ts-ptag-display ts-flag-display">${fl.icon} ${fl.label}</span>`;
                // Custom flag
                const cf = window.ProcessingTagState?.getCustomFlagDef(mapping.flagKey);
                if (cf) return `<span class="ts-ptag-display ts-flag-display">🏷️ ${cf.label}</span>`;
                return `<span class="ts-ptag-display ts-flag-display">🏷️ ${mapping.flagKey}</span>`;
            }
            case 'ttag': {
                const name = mapping.ttagName || window.ProcessingTagState?.getTTagName(mapping.ttagId) || mapping.ttagId;
                return `<span class="ts-ptag-display ts-ttag-display">📦 ${name}</span>`;
            }
            case 'prefix':
                return `<span class="ts-ptag-display ts-prefix-target">🏷️ Gán flag = tên tag TPOS</span>`;
            default:
                return '<span class="ts-placeholder">Chọn Tag XL...</span>';
        }
    }

    function _escHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // =====================================================
    // TPOS TAG DROPDOWN
    // =====================================================

    function _tsToggleTposDropdown(rowId, event) {
        event.stopPropagation();
        _closeAllDropdowns();
        const dd = document.getElementById('tsDdTpos_' + rowId);
        if (!dd) return;
        dd.classList.add('show');
        const input = dd.querySelector('.ts-search-input');
        if (input) {
            input.value = '';
            input.focus();
        }
        _renderTposTagList(rowId, '');
    }

    function _tsFilterTposTags(rowId, query) {
        _renderTposTagList(rowId, query);
    }

    function _renderTposTagList(rowId, query) {
        const list = document.getElementById('tsDdTposList_' + rowId);
        if (!list) return;

        const tags = window.availableTags || [];
        const q = (query || '').toLowerCase().trim();
        const filtered = tags.filter(tag => {
            if (!q) return true;
            return (tag.Name || '').toLowerCase().includes(q) ||
                   (tag.NameNosign || '').toLowerCase().includes(q);
        });

        if (filtered.length === 0) {
            list.innerHTML = '<div class="ts-dropdown-empty">Không tìm thấy tag</div>';
            return;
        }

        list.innerHTML = filtered.slice(0, 50).map(tag => `
            <div class="ts-dropdown-item" onclick="window._tsSelectTposTag('${rowId}', ${tag.Id}, '${_escAttr(tag.Name)}', '${tag.Color || '#6b7280'}')">
                <span class="ts-color-dot" style="background:${tag.Color || '#6b7280'}"></span>
                <span>${_escHtml(tag.Name)}</span>
            </div>
        `).join('');
    }

    function _tsSelectTposTag(rowId, tagId, tagName, tagColor) {
        const mapping = syncMappings.find(m => m.id === rowId);
        if (!mapping) return;
        mapping.tposTagId = tagId;
        mapping.tposTagName = tagName;
        mapping.tposTagColor = tagColor;
        // If prefix mode was on, switch back to normal
        if (mapping.targetType === 'prefix') {
            mapping.targetType = null;
            mapping.prefix = '';
        }
        _closeAllDropdowns();
        renderMappingRows();
        saveMappingsToStorage();
    }

    // =====================================================
    // PTAG TARGET DROPDOWN (categories + flags + tTags + prefix)
    // =====================================================

    function _tsTogglePtagDropdown(rowId, event) {
        event.stopPropagation();
        _closeAllDropdowns();
        const dd = document.getElementById('tsDdPtag_' + rowId);
        if (!dd) return;
        dd.classList.add('show');
        _renderPtagList(rowId);
    }

    function _renderPtagList(rowId) {
        const list = document.getElementById('tsDdPtagList_' + rowId);
        if (!list) return;

        let html = '';

        // === PREFIX OPTION ===
        html += `<div class="ts-dropdown-section-label">🔤 TỰ ĐỘNG THEO PREFIX</div>`;
        html += `
            <div class="ts-dropdown-item ts-dropdown-prefix" onclick="window._tsSelectPrefix('${rowId}')">
                <span>🔤 Prefix → Gán flag cùng tên tag TPOS</span>
            </div>
        `;

        // === CATEGORIES ===
        html += `<div class="ts-dropdown-section-label">📂 PHÂN LOẠI ĐƠN</div>`;
        for (const cat of CATEGORY_OPTIONS) {
            html += `
                <div class="ts-dropdown-item ts-dropdown-category" onclick="window._tsSelectTarget('${rowId}', 'category', ${cat.value}, null, null, null)">
                    <span>${cat.emoji} ${cat.label}</span>
                </div>
            `;
            if (SUBTAG_OPTIONS[cat.value]) {
                for (const sub of SUBTAG_OPTIONS[cat.value]) {
                    html += `
                        <div class="ts-dropdown-item ts-dropdown-subtag" onclick="window._tsSelectTarget('${rowId}', 'category', ${cat.value}, '${sub.key}', null, null)">
                            <span>↳ ${sub.label}</span>
                        </div>
                    `;
                }
            }
        }

        // === FLAGS (ĐẶC ĐIỂM) ===
        html += `<div class="ts-dropdown-section-label">🏷️ ĐẶC ĐIỂM ĐƠN HÀNG</div>`;
        for (const flag of FLAG_OPTIONS) {
            html += `
                <div class="ts-dropdown-item" onclick="window._tsSelectTarget('${rowId}', 'flag', null, null, '${flag.key}', null)">
                    <span>${flag.icon} ${flag.label}</span>
                </div>
            `;
        }
        // Custom flags
        const customFlagDefs = window.ProcessingTagState?.getCustomFlagDefs() || [];
        for (const cf of customFlagDefs) {
            html += `
                <div class="ts-dropdown-item" onclick="window._tsSelectTarget('${rowId}', 'flag', null, null, '${_escAttr(cf.id)}', null)">
                    <span>🏷️ ${_escHtml(cf.label)}</span>
                </div>
            `;
        }

        // === T-TAGS ===
        const tTagDefs = window.ProcessingTagState?.getTTagDefinitions() || [];
        if (tTagDefs.length > 0) {
            html += `<div class="ts-dropdown-section-label">📦 TAG T (CHỜ HÀNG)</div>`;
            for (const def of tTagDefs) {
                html += `
                    <div class="ts-dropdown-item" onclick="window._tsSelectTarget('${rowId}', 'ttag', null, null, null, '${_escAttr(def.id)}')">
                        <span>📦 ${_escHtml(def.name)}${def.productCode ? ' · ' + _escHtml(def.productCode) : ''}</span>
                    </div>
                `;
            }
        }

        list.innerHTML = html;
    }

    function _tsSelectTarget(rowId, type, category, subTag, flagKey, ttagId) {
        const mapping = syncMappings.find(m => m.id === rowId);
        if (!mapping) return;
        mapping.targetType = type;
        mapping.ptagCategory = category;
        mapping.ptagSubTag = subTag;
        mapping.flagKey = flagKey;
        mapping.ttagId = ttagId;
        if (ttagId) {
            mapping.ttagName = window.ProcessingTagState?.getTTagName(ttagId) || ttagId;
        }
        _closeAllDropdowns();
        renderMappingRows();
        saveMappingsToStorage();
    }

    function _tsSelectPrefix(rowId) {
        const mapping = syncMappings.find(m => m.id === rowId);
        if (!mapping) return;

        _closeAllDropdowns();

        // Prompt for prefix
        const prefix = prompt('Nhập prefix tag TPOS (VD: "Gộp").\nĐơn có tag TPOS bắt đầu bằng prefix sẽ được gán flag cùng tên:', mapping.prefix || '');
        if (prefix === null) return; // cancelled
        if (!prefix.trim()) {
            if (window.notificationManager) {
                window.notificationManager.warning('Prefix không được để trống!', 2000);
            }
            return;
        }

        mapping.targetType = 'prefix';
        mapping.prefix = prefix.trim();
        // Clear specific tag selection since prefix mode scans all tags
        mapping.tposTagId = null;
        mapping.tposTagName = '';
        mapping.tposTagColor = '#6b7280';
        mapping.ptagCategory = null;
        mapping.ptagSubTag = null;
        mapping.flagKey = null;
        mapping.ttagId = null;

        renderMappingRows();
        saveMappingsToStorage();
    }

    // =====================================================
    // ROW MANAGEMENT
    // =====================================================

    function _tsAddRow() {
        syncMappings.push(_createEmptyMapping());
        renderMappingRows();
    }

    function _tsRemoveRow(rowId) {
        syncMappings = syncMappings.filter(m => m.id !== rowId);
        if (syncMappings.length === 0) {
            syncMappings.push(_createEmptyMapping());
        }
        renderMappingRows();
        saveMappingsToStorage();
    }

    // =====================================================
    // SYNC EXECUTION
    // =====================================================

    async function executeTagSync() {
        // 1. Validate mappings
        const validMappings = syncMappings.filter(m => {
            if (m.targetType === 'prefix') return !!m.prefix;
            if (m.targetType === 'category') return m.tposTagId && m.ptagCategory != null;
            if (m.targetType === 'flag') return m.tposTagId && m.flagKey;
            if (m.targetType === 'ttag') return m.tposTagId && m.ttagId;
            return false;
        });

        if (validMappings.length === 0) {
            if (window.notificationManager) {
                window.notificationManager.warning('Vui lòng chọn ít nhất 1 cặp tag TPOS → Tag XL!', 3000);
            }
            return;
        }

        // 2. Check prerequisites — cần có dữ liệu đơn hàng
        if (!window.ProcessingTagState || window.ProcessingTagState._orderData.size === 0) {
            if (window.notificationManager) {
                window.notificationManager.error('Chưa tải dữ liệu đơn hàng. Vui lòng tải đơn trước!', 3000);
            }
            return;
        }

        const allOrders = (typeof window.getAllOrders === 'function') ? window.getAllOrders() : [];
        if (allOrders.length === 0) {
            if (window.notificationManager) {
                window.notificationManager.warning('Không có đơn hàng nào để đồng bộ!', 3000);
            }
            return;
        }

        // 3. Build tasks list
        // Each task: { orderId, action: 'category'|'flag'|'ttag', data: {...} }
        const tasks = [];

        for (const mapping of validMappings) {
            if (mapping.targetType === 'prefix') {
                // PREFIX MODE: scan all orders for tags starting with prefix
                for (const order of allOrders) {
                    let orderTags = [];
                    try { orderTags = JSON.parse(order.Tags || '[]'); } catch (e) { continue; }
                    if (!Array.isArray(orderTags)) continue;

                    for (const tag of orderTags) {
                        if ((tag.Name || '').toLowerCase().startsWith(mapping.prefix.toLowerCase())) {
                            const customFlagKey = _getOrCreateCustomFlag(tag.Name);
                            // Check if order already has this flag
                            const existing = window.ProcessingTagState.getOrderData(String(order.Code));
                            if (existing && (existing.flags || []).some(f => (typeof f === 'object' ? f.id : f) === customFlagKey)) continue;
                            tasks.push({
                                orderCode: String(order.Code),
                                action: 'flag',
                                flagKey: customFlagKey,
                                _flagLabel: tag.Name
                            });
                        }
                    }
                }
            } else {
                // NORMAL MODE: find orders with specific TPOS tag
                for (const order of allOrders) {
                    let orderTags = [];
                    try { orderTags = JSON.parse(order.Tags || '[]'); } catch (e) { continue; }
                    if (!Array.isArray(orderTags)) continue;

                    const hasTag = orderTags.some(t => t.Id === mapping.tposTagId);
                    if (!hasTag) continue;

                    const oc = String(order.Code);

                    if (mapping.targetType === 'category') {
                        const existing = window.ProcessingTagState.getOrderData(oc);
                        if (existing && existing.category === mapping.ptagCategory) {
                            if (!mapping.ptagSubTag || existing.subTag === mapping.ptagSubTag) continue;
                        }
                        tasks.push({
                            orderCode: oc,
                            action: 'category',
                            category: mapping.ptagCategory,
                            subTag: mapping.ptagSubTag
                        });
                    } else if (mapping.targetType === 'flag') {
                        const existing = window.ProcessingTagState.getOrderData(oc);
                        if (existing && (existing.flags || []).some(f => (typeof f === 'object' ? f.id : f) === mapping.flagKey)) continue;
                        tasks.push({
                            orderCode: oc,
                            action: 'flag',
                            flagKey: mapping.flagKey
                        });
                    } else if (mapping.targetType === 'ttag') {
                        const existing = window.ProcessingTagState.getOrderData(oc);
                        if (existing && (existing.tTags || []).some(t => (typeof t === 'object' ? t.id : t) === mapping.ttagId)) continue;
                        tasks.push({
                            orderCode: oc,
                            action: 'ttag',
                            ttagId: mapping.ttagId
                        });
                    }
                }
            }
        }

        // Deduplicate: keep last task per orderCode+action+key combo
        const taskMap = new Map();
        for (const t of tasks) {
            const key = `${t.orderCode}|${t.action}|${t.flagKey || t.ttagId || t.category}`;
            taskMap.set(key, t);
        }
        const uniqueTasks = [...taskMap.values()];

        if (uniqueTasks.length === 0) {
            if (window.notificationManager) {
                window.notificationManager.info('Không tìm thấy đơn nào cần đồng bộ (tất cả đã có Tag XL tương ứng).', 3000);
            }
            return;
        }

        // 4. Custom flags are now persisted immediately via mergeConfigDefs in _getOrCreateCustomFlag.
        //    No pre-save needed — atomic merge prevents race conditions.
        const newCustomFlagKeys = new Set();
        for (const task of uniqueTasks) {
            if (task.action === 'flag' && task.flagKey.startsWith('CUSTOM_')) {
                newCustomFlagKeys.add(task.flagKey);
            }
        }

        // 5. Confirm
        if (!confirm(`Sẽ đồng bộ Tag XL cho ${uniqueTasks.length} thao tác trên các đơn hàng. Tiếp tục?`)) return;

        // 6. Execute with progress
        const syncBtn = document.getElementById('tagSyncExecuteBtn');
        if (syncBtn) {
            syncBtn.disabled = true;
            syncBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang đồng bộ...';
        }
        _showProgress(0, uniqueTasks.length);

        let success = 0, failed = 0;
        const total = uniqueTasks.length;

        for (const task of uniqueTasks) {
            try {
                if (task.action === 'category') {
                    const opts = { source: 'Đồng bộ Tag' };
                    if (task.subTag) opts.subTag = task.subTag;
                    await window.assignOrderCategory(task.orderCode, task.category, opts);
                } else if (task.action === 'flag') {
                    await window.toggleOrderFlag(task.orderCode, task.flagKey, 'Đồng bộ Tag');
                } else if (task.action === 'ttag') {
                    await window.assignTTagToOrder(task.orderCode, task.ttagId, 'Đồng bộ Tag');
                }
                success++;
            } catch (err) {
                console.error(SYNC_LOG, 'Failed for order', task.orderCode, err);
                failed++;
            }
            _showProgress(success + failed, total);
            await new Promise(r => setTimeout(r, 50));
        }

        // 6. Show results
        if (syncBtn) {
            syncBtn.disabled = false;
            syncBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Đồng bộ';
        }

        const msg = `Đồng bộ hoàn tất: ${success} thành công` + (failed > 0 ? `, ${failed} thất bại` : '');
        if (window.notificationManager) {
            if (failed > 0) {
                window.notificationManager.warning(msg, 5000);
            } else {
                window.notificationManager.success(msg, 3000);
            }
        }

        // 7. Re-ensure custom flags in state (SSE may have wiped them) — use atomic merge
        if (newCustomFlagKeys.size > 0) {
            const defs = window.ProcessingTagState.getCustomFlagDefs();
            const missingDefs = [];
            for (const task of uniqueTasks) {
                if (task.action === 'flag' && task.flagKey.startsWith('CUSTOM_') && task._flagLabel) {
                    if (!defs.some(d => d.id === task.flagKey)) {
                        const _palette = ['#ef4444','#f97316','#f59e0b','#22c55e','#14b8a6','#3b82f6','#6366f1','#8b5cf6','#ec4899','#06b6d4'];
                        const _randColor = _palette[Math.floor(Math.random() * _palette.length)];
                        const newDef = { id: task.flagKey, label: (task._flagLabel || '').toUpperCase(), color: _randColor, createdAt: Date.now() };
                        defs.push(newDef);
                        missingDefs.push(newDef);
                    }
                }
            }
            if (missingDefs.length > 0) {
                window.ProcessingTagState.setCustomFlagDefs(defs);
                if (typeof window.mergeConfigDefs === 'function') {
                    await window.mergeConfigDefs('__ptag_custom_flags__', missingDefs);
                }
            }
            // Refresh all visible rows to show correct labels
            if (typeof window.renderPanelContent === 'function') window.renderPanelContent();
            document.querySelectorAll('td[data-column="processing-tag"]').forEach(cell => {
                const row = cell.closest('tr');
                if (!row) return;
                const orderId = row.getAttribute('data-order-id');
                if (!orderId) return;
                const allOrds = (typeof window.getAllOrders === 'function') ? window.getAllOrders() : [];
                const order = allOrds.find(o => String(o.Id) === String(orderId));
                if (order && typeof window.renderProcessingTagCell === 'function') {
                    cell.innerHTML = window.renderProcessingTagCell(String(order.Code));
                }
            });
        }

        // 8. Save mappings
        saveMappingsToStorage();
        console.log(SYNC_LOG, msg);
    }

    // =====================================================
    // PREFIX: Custom flag creation
    // =====================================================

    function _getOrCreateCustomFlag(label) {
        // Check if custom flag with this label already exists (case-insensitive)
        const defs = window.ProcessingTagState?.getCustomFlagDefs() || [];
        for (const cf of defs) {
            if ((cf.label || '').toLowerCase() === label.toLowerCase()) return cf.id;
        }
        // Create new custom flag
        const key = 'CUSTOM_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        const _palette = ['#ef4444','#f97316','#f59e0b','#22c55e','#14b8a6','#3b82f6','#6366f1','#8b5cf6','#ec4899','#06b6d4'];
        const _randColor = _palette[Math.floor(Math.random() * _palette.length)];
        const newDef = { id: key, label: (label || '').toUpperCase(), color: _randColor, createdAt: Date.now() };
        defs.push(newDef);
        window.ProcessingTagState.setCustomFlagDefs(defs);
        // Immediately persist via atomic merge to prevent SSE overwrite race condition
        if (typeof window.mergeConfigDefs === 'function') {
            window.mergeConfigDefs('__ptag_custom_flags__', [newDef]);
        }
        return key;
    }

    // =====================================================
    // PROGRESS
    // =====================================================

    function _showProgress(current, total) {
        const bar = document.getElementById('tagSyncProgressBar');
        const text = document.getElementById('tagSyncProgressText');
        const container = document.getElementById('tagSyncProgress');
        if (container) container.style.display = 'flex';
        if (bar) bar.style.width = Math.round((current / total) * 100) + '%';
        if (text) text.textContent = `${current} / ${total}`;
    }

    function _hideProgress() {
        const container = document.getElementById('tagSyncProgress');
        if (container) container.style.display = 'none';
    }

    // =====================================================
    // UTILITIES
    // =====================================================

    function _closeAllDropdowns() {
        document.querySelectorAll('.ts-dropdown.show').forEach(d => d.classList.remove('show'));
    }

    function _escAttr(str) {
        return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    }

    // Close dropdowns on outside click
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.ts-dropdown') && !e.target.closest('.ts-select')) {
            _closeAllDropdowns();
        }
    });

    // =====================================================
    // TAG XL → TPOS AUTO SYNC
    // Khi gán TAG XL, tự động gán/xóa TPOS tag tương ứng
    // =====================================================

    const PTAG_TO_TPOS_MAP = {
        // Subtags → TPOS tag name
        'subtag:GIO_TRONG': 'GIỎ TRỐNG',
        'subtag:DA_GOP_KHONG_CHOT': 'ĐÃ GỘP KO CHỐT',
        'subtag:NCC_HET_HANG': 'NCC HẾT HÀNG',
        // Built-in flags → TPOS tag name
        'flag:TRU_CONG_NO': 'TRỪ CÔNG NỢ',
        'flag:KHACH_BOOM': 'KHÁCH BOOM',
        'flag:THE_KHACH_LA': 'THẺ KHÁCH LẠ',
        'flag:DA_DI_DON_GAP': 'ĐÃ ĐI ĐƠN GẤP',
        'flag:GIAM_GIA': 'GIẢM GIÁ',
        'flag:CHUYEN_KHOAN': 'CHUYỂN KHOẢN',
        'flag:QUA_LAY': 'QUA LẤY',
        'flag:CHO_LIVE': 'CHỜ LIVE',
        'flag:GIU_DON': 'GIỮ ĐƠN',
        // T-tags → TPOS tag name
        'ttag:T_MY': 'MY THÊM CHỜ VỀ',
    };

    /**
     * Resolve TAG XL key → TPOS tag name
     * @param {string} tagXLKey - e.g. 'flag:KHACH_BOOM', 'subtag:GIO_TRONG', 'ttag:T_MY', 'custom:CUSTOM_xxx'
     * @returns {string|null} TPOS tag name or null if no mapping
     */
    function _resolvePtagToTPOSName(tagXLKey) {
        // 1. Check static mapping
        if (PTAG_TO_TPOS_MAP[tagXLKey]) return PTAG_TO_TPOS_MAP[tagXLKey];

        // 2. T-tags → use definition name as TPOS tag name
        if (tagXLKey.startsWith('ttag:')) {
            const tagId = tagXLKey.replace('ttag:', '');
            const def = window.ProcessingTagState?.getTTagDef(tagId);
            if (def && def.name) return def.name;
        }

        // 3. Custom flags → use label as TPOS tag name
        if (tagXLKey.startsWith('custom:')) {
            const flagId = tagXLKey.replace('custom:', '');
            const label = window.ProcessingTagState?.getCustomFlagLabel(flagId);
            if (label && !label.startsWith('⚠')) return label;
        }

        return null;
    }

    /**
     * Find TPOS tag by name in availableTags, with fallback: reload → create
     * @param {string} tposName - TPOS tag name to find
     * @returns {Object|null} TPOS tag object { Id, Name, Color }
     */
    async function _findOrCreateTPOSTag(tposName) {
        const tags = window.availableTags || [];

        // 1. Search in cached tags (case-insensitive)
        let tag = tags.find(t => t.Name?.toUpperCase() === tposName.toUpperCase());
        if (tag) return tag;

        // 2. FALLBACK 1: Reload all tags from API
        console.log(`${SYNC_LOG} [TPOS-SYNC] Tag "${tposName}" not in cache, reloading...`);
        try {
            if (typeof loadAvailableTags === 'function') {
                await loadAvailableTags();
            }
            const reloaded = window.availableTags || [];
            tag = reloaded.find(t => t.Name?.toUpperCase() === tposName.toUpperCase());
            if (tag) return tag;
        } catch (e) {
            console.warn(`${SYNC_LOG} [TPOS-SYNC] Reload failed:`, e.message);
        }

        // 3. FALLBACK 2: Create new TPOS tag
        console.log(`${SYNC_LOG} [TPOS-SYNC] Creating new TPOS tag "${tposName}"...`);
        try {
            const headers = await window.tokenManager.getAuthHeader();
            const color = typeof generateRandomColor === 'function' ? generateRandomColor() : '#6b7280';
            const response = await API_CONFIG.smartFetch(
                'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Tag',
                {
                    method: 'POST',
                    headers: { ...headers, 'accept': 'application/json', 'content-type': 'application/json;charset=UTF-8' },
                    body: JSON.stringify({ Name: tposName, Color: color })
                }
            );
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const newTag = await response.json();
            if (newTag['@odata.context']) delete newTag['@odata.context'];

            // Update local cache
            if (window.availableTags) {
                window.availableTags.push(newTag);
                if (window.cacheManager) window.cacheManager.set('tags', window.availableTags, 'tags');
            }
            console.log(`${SYNC_LOG} [TPOS-SYNC] Created TPOS tag: ${newTag.Name} (ID: ${newTag.Id})`);
            return newTag;
        } catch (e) {
            console.error(`${SYNC_LOG} [TPOS-SYNC] Failed to create tag "${tposName}":`, e.message);
            return null;
        }
    }

    /**
     * Sync TAG XL change → TPOS tag
     * @param {string} orderCode - Order code
     * @param {'add'|'remove'} action - Add or remove TPOS tag
     * @param {string} tagXLKey - TAG XL key (e.g. 'flag:KHACH_BOOM', 'subtag:GIO_TRONG')
     */
    // Guard flags to prevent infinite sync loops
    let _isSyncingFromTPOS = false; // skip TAG XL → TPOS when reverse sync is in progress
    let _isSyncingToTPOS = false;   // skip TPOS → TAG XL when forward sync is in progress

    async function syncPtagToTPOS(orderCode, action, tagXLKey) {
        try {
            // Skip if triggered by TPOS → TAG XL reverse sync
            if (_isSyncingFromTPOS) return;

            // 1. Resolve TPOS tag name
            const tposName = _resolvePtagToTPOSName(tagXLKey);
            if (!tposName) return; // No mapping → skip

            // 2. Resolve orderId from orderCode
            const resolveId = window._ptagResolveId || (function(code) {
                const allOrders = (typeof window.getAllOrders === 'function') ? window.getAllOrders() : [];
                const order = allOrders.find(o => String(o.Code) === String(code));
                return order?.Id ? String(order.Id) : null;
            });
            const orderId = resolveId(orderCode);
            if (!orderId) {
                console.warn(`${SYNC_LOG} [TPOS-SYNC] Cannot resolve orderId for ${orderCode}`);
                return;
            }

            // 3. Get current TPOS tags for order
            const order = window.OrderStore?.get(orderId) || (
                (typeof window.getAllOrders === 'function') ? window.getAllOrders().find(o => String(o.Id) === String(orderId)) : null
            );
            if (!order) {
                console.warn(`${SYNC_LOG} [TPOS-SYNC] Order not found: ${orderId}`);
                return;
            }

            let currentTags = [];
            try {
                if (order.Tags) {
                    currentTags = JSON.parse(order.Tags);
                    if (!Array.isArray(currentTags)) currentTags = [];
                }
            } catch (e) { currentTags = []; }

            // 4. Find or create TPOS tag
            const tposTag = await _findOrCreateTPOSTag(tposName);
            if (!tposTag) return;

            // 5. Add or remove
            const alreadyHas = currentTags.some(t => t.Id === tposTag.Id);

            if (action === 'add' && alreadyHas) return; // Already has tag
            if (action === 'remove' && !alreadyHas) return; // Doesn't have tag

            if (action === 'add') {
                currentTags.push({ Id: tposTag.Id, Name: tposTag.Name, Color: tposTag.Color });
            } else {
                currentTags = currentTags.filter(t => t.Id !== tposTag.Id);
            }

            // 6. Call AssignTag API — set guard to prevent reverse sync loop
            _isSyncingToTPOS = true;
            try {
                const headers = await window.tokenManager.getAuthHeader();
                const payload = {
                    Tags: currentTags.map(t => ({ Id: t.Id, Color: t.Color, Name: t.Name })),
                    OrderId: orderId
                };
                const response = await API_CONFIG.smartFetch(
                    'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/TagSaleOnlineOrder/ODataService.AssignTag',
                    {
                        method: 'POST',
                        headers: { ...headers, 'Content-Type': 'application/json', 'Accept': 'application/json' },
                        body: JSON.stringify(payload)
                    }
                );
                if (!response.ok) throw new Error(`AssignTag HTTP ${response.status}`);

                // 7. Update local table data + Firebase
                const tagsJson = JSON.stringify(currentTags);
                if (typeof updateOrderInTable === 'function') {
                    updateOrderInTable(orderId, { Tags: tagsJson });
                }
                if (typeof updateRowTagsOnly === 'function') {
                    updateRowTagsOnly(orderId, tagsJson, orderCode);
                }
                if (typeof emitTagUpdateToFirebase === 'function') {
                    emitTagUpdateToFirebase(orderId, currentTags);
                }
            } finally {
                _isSyncingToTPOS = false;
            }

            console.log(`${SYNC_LOG} [TPOS-SYNC] ${action.toUpperCase()} "${tposName}" → order ${orderCode} (TPOS ID: ${tposTag.Id})`);
        } catch (e) {
            console.warn(`${SYNC_LOG} [TPOS-SYNC] Failed: ${e.message}`);
        }
    }

    // =====================================================
    // WINDOW EXPORTS
    // =====================================================

    window.showTagSyncModal = showTagSyncModal;
    window.closeTagSyncModal = closeTagSyncModal;
    window._tsToggleTposDropdown = _tsToggleTposDropdown;
    window._tsFilterTposTags = _tsFilterTposTags;
    window._tsSelectTposTag = _tsSelectTposTag;
    window._tsTogglePtagDropdown = _tsTogglePtagDropdown;
    window._tsSelectTarget = _tsSelectTarget;
    window._tsSelectPrefix = _tsSelectPrefix;
    window._tsAddRow = _tsAddRow;
    window._tsRemoveRow = _tsRemoveRow;
    window.executeTagSync = executeTagSync;
    window.syncPtagToTPOS = syncPtagToTPOS;

    // =====================================================
    // TPOS → TAG XL AUTO SYNC (REVERSE DIRECTION)
    // Khi gán/xóa TPOS tag, tự động gán/xóa TAG XL tương ứng
    // =====================================================

    // Build reverse mapping: TPOS name (uppercase) → TAG XL key
    const TPOS_TO_PTAG_MAP = {};
    for (const [xlKey, tposName] of Object.entries(PTAG_TO_TPOS_MAP)) {
        TPOS_TO_PTAG_MAP[tposName.toUpperCase()] = xlKey;
    }

    // Aliases: multiple TPOS tag names → same TAG XL key (reverse-only)
    const TPOS_ALIAS_MAP = {
        'TRỪ THU VỀ': 'flag:TRU_CONG_NO',
        'KHÁCH CK': 'flag:CHUYEN_KHOAN',
    };
    for (const [tposName, xlKey] of Object.entries(TPOS_ALIAS_MAP)) {
        TPOS_TO_PTAG_MAP[tposName.toUpperCase()] = xlKey;
    }

    /**
     * Called when TPOS tags change (from tab1-tags.js saveOrderTags/quickAssignTag)
     * Compares new TPOS tags against reverse mapping and syncs TAG XL accordingly
     * @param {string} orderId - Order GUID
     * @param {Array} newTags - Array of {Id, Name, Color} TPOS tags
     */
    async function syncTPOSToPtag(orderId, newTags) {
        // Skip if this change was triggered by our own TAG XL → TPOS sync
        if (_isSyncingToTPOS) {
            console.log(`${SYNC_LOG} [TPOS→XL] Skip reverse sync — triggered by TAG XL → TPOS`);
            return;
        }

        // Set guard to prevent TAG XL → TPOS loop when we call toggleOrderFlag etc.
        _isSyncingFromTPOS = true;
        try {
            // Resolve orderId → orderCode
            const resolveCode = window._ptagResolveCode || (function(id) {
                const allOrders = (typeof window.getAllOrders === 'function') ? window.getAllOrders() : [];
                const order = allOrders.find(o => String(o.Id) === String(id));
                return order?.Code ? String(order.Code) : null;
            });
            const orderCode = resolveCode(orderId);
            if (!orderCode) {
                console.warn(`${SYNC_LOG} [TPOS→XL] Cannot resolve orderCode for ${orderId}`);
                return;
            }

            // Get current TAG XL data
            const data = window.ProcessingTagState?.getOrderData(orderCode);
            const currentFlags = (data?.flags || []).map(f => f.id || f);
            const currentTTags = (data?.tTags || []).map(t => t.id || t);
            const currentSubTag = data?.subTag || null;

            // Build set of TPOS tag names (uppercase) for fast lookup
            // Defensive: coerce Name to string in case realtime sends malformed data
            const tposNames = new Set((newTags || []).map(t => String(t.Name || '').toUpperCase()));

            let changed = false;

            // Check each mapping entry: should TAG XL have it?
            for (const [tposNameUpper, xlKey] of Object.entries(TPOS_TO_PTAG_MAP)) {
                const hasTPOS = tposNames.has(tposNameUpper);
                const [type, key] = xlKey.split(':');

                if (type === 'flag') {
                    const hasXL = currentFlags.includes(key);
                    if (hasTPOS && !hasXL) {
                        // TPOS has it, TAG XL doesn't → add flag
                        console.log(`${SYNC_LOG} [TPOS→XL] ADD flag ${key} for ${orderCode}`);
                        await window.toggleOrderFlag(orderCode, key, 'TPOS-SYNC');
                        changed = true;
                    } else if (!hasTPOS && hasXL) {
                        // TPOS removed it, TAG XL still has it → remove flag
                        console.log(`${SYNC_LOG} [TPOS→XL] REMOVE flag ${key} for ${orderCode}`);
                        await window.toggleOrderFlag(orderCode, key, 'TPOS-SYNC');
                        changed = true;
                    }
                } else if (type === 'ttag') {
                    const hasTTag = currentTTags.includes(key);
                    if (hasTPOS && !hasTTag) {
                        console.log(`${SYNC_LOG} [TPOS→XL] ADD ttag ${key} for ${orderCode}`);
                        await window.assignTTagToOrder(orderCode, key, 'TPOS-SYNC');
                        changed = true;
                    } else if (!hasTPOS && hasTTag) {
                        console.log(`${SYNC_LOG} [TPOS→XL] REMOVE ttag ${key} for ${orderCode}`);
                        await window.removeTTagFromOrder(orderCode, key);
                        changed = true;
                    }
                } else if (type === 'subtag') {
                    // ✅ Đồng bộ ADD subtag từ TPOS → TAG XL (gán cat tương ứng)
                    // ⛔ KHÔNG đồng bộ REMOVE: khi TPOS xóa GIỎ TRỐNG/ĐÃ GỘP KO CHỐT/NCC HẾT HÀNG
                    //    → giữ nguyên subtag XL (category là phân loại cốt lõi, không tự động revert).
                    if (hasTPOS && currentSubTag !== key) {
                        // Tìm category cho subtag key này từ SUBTAG_OPTIONS local
                        let cat = null;
                        for (const [c, subs] of Object.entries(SUBTAG_OPTIONS)) {
                            if (subs.some(s => s.key === key)) { cat = parseInt(c); break; }
                        }
                        if (cat != null) {
                            console.log(`${SYNC_LOG} [TPOS→XL] ADD subtag ${key} (cat ${cat}) for ${orderCode}`);
                            await window.assignOrderCategory(orderCode, cat, { subTag: key, source: 'TPOS-SYNC' });
                            changed = true;
                        }
                    }
                }
            }

            // Also check custom flags: TPOS tags that match custom flag labels
            const customDefs = window.ProcessingTagState?.getCustomFlagDefs?.() || [];
            for (const def of customDefs) {
                const customLabel = (def.label || '').toUpperCase();
                if (!customLabel) continue;
                const hasTPOS = tposNames.has(customLabel);
                const hasXL = currentFlags.includes(def.id);
                if (hasTPOS && !hasXL) {
                    console.log(`${SYNC_LOG} [TPOS→XL] ADD custom flag ${def.id} for ${orderCode}`);
                    await window.toggleOrderFlag(orderCode, def.id, 'TPOS-SYNC');
                    changed = true;
                } else if (!hasTPOS && hasXL) {
                    console.log(`${SYNC_LOG} [TPOS→XL] REMOVE custom flag ${def.id} for ${orderCode}`);
                    await window.toggleOrderFlag(orderCode, def.id, 'TPOS-SYNC');
                    changed = true;
                }
            }

            // ── Pattern: T[number] [description] → Tag T Chờ Hàng ──
            for (const tag of (newTags || [])) {
                const tagName = String(tag.Name || '').trim();
                if (!/^T\d+\s+/i.test(tagName)) continue;
                const nameUpper = tagName.toUpperCase();
                if (TPOS_TO_PTAG_MAP[nameUpper]) continue; // already handled by static map

                const defs = window.ProcessingTagState?.getTTagDefinitions() || [];
                let matchDef = defs.find(d => (d.name || '').toUpperCase() === nameUpper);

                if (!matchDef) {
                    // Auto-create T-tag definition
                    let nextNum = 1;
                    for (const d of defs) {
                        const m = (d.id || '').match(/^T(\d+)/);
                        if (m) nextNum = Math.max(nextNum, parseInt(m[1]) + 1);
                    }
                    matchDef = { id: `T${nextNum}`, name: nameUpper, productCode: '', createdAt: Date.now() };
                    defs.push(matchDef);
                    window.ProcessingTagState?.setTTagDefinitions(defs);
                    if (window.mergeConfigDefs) window.mergeConfigDefs('__ttag_config__', [matchDef]);
                    console.log(`${SYNC_LOG} [TPOS→XL] Auto-created T-tag: ${matchDef.id} "${matchDef.name}"`);
                }

                if (!currentTTags.includes(matchDef.id)) {
                    console.log(`${SYNC_LOG} [TPOS→XL] ADD ttag ${matchDef.id} "${matchDef.name}" for ${orderCode}`);
                    await window.assignTTagToOrder(orderCode, matchDef.id, 'TPOS-SYNC');
                    changed = true;
                }
            }

            // T-tag removal: if TAG XL has T-number tag but TPOS doesn't
            for (const ttagId of currentTTags) {
                if (ttagId === 'T_MY') continue; // T_MY handled by static map
                const def = window.ProcessingTagState?.getTTagDef(ttagId);
                if (!def) continue;
                const defNameUpper = (def.name || '').toUpperCase();
                if (!/^T\d+\s+/.test(defNameUpper)) continue;
                if (!tposNames.has(defNameUpper)) {
                    console.log(`${SYNC_LOG} [TPOS→XL] REMOVE ttag ${ttagId} "${def.name}" for ${orderCode}`);
                    await window.removeTTagFromOrder(orderCode, ttagId);
                    changed = true;
                }
            }

            // ── Fallback: Bất kỳ TPOS tag nào không match mapping nào → flag KHAC (add-only) ──
            // Bao gồm: OK/XỬ LÝ/XÃ ĐƠN [seller], Gộp xxx yyy, K\d+ xxx, CỌC xxxK, hoặc bất kỳ tag lạ.
            // Không auto-remove (nhiều TPOS tags có thể trigger KHAC, không biết khi nào nên gỡ).
            let hasUnknownTag = false;
            for (const tag of (newTags || [])) {
                const name = String(tag.Name || '').trim();
                if (!name) continue;
                const upper = name.toUpperCase();

                // Skip nếu match static mapping (kể cả subtags — coi như "known but skipped")
                if (TPOS_TO_PTAG_MAP[upper]) continue;

                // Skip nếu match T-number pattern (đã handle ở trên)
                if (/^T\d+\s+/i.test(name)) continue;

                // Skip nếu match custom flag label
                const isCustom = customDefs.some(d => (d.label || '').toUpperCase() === upper);
                if (isCustom) continue;

                // Otherwise → unknown → trigger KHAC
                hasUnknownTag = true;
                break;
            }

            if (hasUnknownTag && !currentFlags.includes('KHAC')) {
                console.log(`${SYNC_LOG} [TPOS→XL] ADD flag KHAC (unknown/fallback) for ${orderCode}`);
                await window.toggleOrderFlag(orderCode, 'KHAC', 'TPOS-SYNC');
                changed = true;
            }

            if (changed) {
                console.log(`${SYNC_LOG} [TPOS→XL] Sync completed for ${orderCode}`);
            }
        } catch (e) {
            console.warn(`${SYNC_LOG} [TPOS→XL] Failed:`, e.message);
        } finally {
            _isSyncingFromTPOS = false;
        }
    }

    window.syncTPOSToPtag = syncTPOSToPtag;

})();
