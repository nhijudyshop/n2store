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
                const cf = window.ProcessingTagState?._customFlags?.get(mapping.flagKey);
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
        const customFlags = window.ProcessingTagState?._customFlags;
        if (customFlags && customFlags.size > 0) {
            for (const [key, cf] of customFlags) {
                html += `
                    <div class="ts-dropdown-item" onclick="window._tsSelectTarget('${rowId}', 'flag', null, null, '${_escAttr(key)}', null)">
                        <span>🏷️ ${_escHtml(cf.label)}</span>
                    </div>
                `;
            }
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

        // 2. Check prerequisites
        if (!window.ProcessingTagState || !window.ProcessingTagState._campaignId) {
            if (window.notificationManager) {
                window.notificationManager.error('Chưa chọn chiến dịch. Vui lòng chọn chiến dịch trước!', 3000);
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
                            const existing = window.ProcessingTagState.getOrderData(String(order.Id));
                            if (existing && (existing.flags || []).includes(customFlagKey)) continue;
                            tasks.push({
                                orderId: String(order.Id),
                                orderCode: order.Code || order.Id,
                                action: 'flag',
                                flagKey: customFlagKey
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

                    const oid = String(order.Id);

                    if (mapping.targetType === 'category') {
                        const existing = window.ProcessingTagState.getOrderData(oid);
                        if (existing && existing.category === mapping.ptagCategory) {
                            if (!mapping.ptagSubTag || existing.subTag === mapping.ptagSubTag) continue;
                        }
                        tasks.push({
                            orderId: oid,
                            orderCode: order.Code || order.Id,
                            action: 'category',
                            category: mapping.ptagCategory,
                            subTag: mapping.ptagSubTag
                        });
                    } else if (mapping.targetType === 'flag') {
                        const existing = window.ProcessingTagState.getOrderData(oid);
                        if (existing && (existing.flags || []).includes(mapping.flagKey)) continue;
                        tasks.push({
                            orderId: oid,
                            orderCode: order.Code || order.Id,
                            action: 'flag',
                            flagKey: mapping.flagKey
                        });
                    } else if (mapping.targetType === 'ttag') {
                        const existing = window.ProcessingTagState.getOrderData(oid);
                        if (existing && (existing.tTags || []).includes(mapping.ttagId)) continue;
                        tasks.push({
                            orderId: oid,
                            orderCode: order.Code || order.Id,
                            action: 'ttag',
                            ttagId: mapping.ttagId
                        });
                    }
                }
            }
        }

        // Deduplicate: keep last task per orderId+action+key combo
        const taskMap = new Map();
        for (const t of tasks) {
            const key = `${t.orderId}|${t.action}|${t.flagKey || t.ttagId || t.category}`;
            taskMap.set(key, t);
        }
        const uniqueTasks = [...taskMap.values()];

        if (uniqueTasks.length === 0) {
            if (window.notificationManager) {
                window.notificationManager.info('Không tìm thấy đơn nào cần đồng bộ (tất cả đã có Tag XL tương ứng).', 3000);
            }
            return;
        }

        // 4. Confirm
        if (!confirm(`Sẽ đồng bộ Tag XL cho ${uniqueTasks.length} thao tác trên các đơn hàng. Tiếp tục?`)) return;

        // 5. Execute with progress
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
                    const opts = {};
                    if (task.subTag) opts.subTag = task.subTag;
                    await window.assignOrderCategory(task.orderId, task.category, opts);
                } else if (task.action === 'flag') {
                    await window.toggleOrderFlag(task.orderId, task.flagKey);
                } else if (task.action === 'ttag') {
                    await window.assignTTagToOrder(task.orderId, task.ttagId);
                }
                success++;
            } catch (err) {
                console.error(SYNC_LOG, 'Failed for order', task.orderId, err);
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

        // 7. Save mappings
        saveMappingsToStorage();
        console.log(SYNC_LOG, msg);
    }

    // =====================================================
    // PREFIX: Custom flag creation
    // =====================================================

    function _getOrCreateCustomFlag(label) {
        // Check if custom flag with this label already exists
        const customFlags = window.ProcessingTagState?._customFlags;
        if (customFlags) {
            for (const [key, cf] of customFlags) {
                if (cf.label === label) return key;
            }
        }
        // Create new custom flag
        const key = 'CUSTOM_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        if (!window.ProcessingTagState._customFlags) {
            window.ProcessingTagState._customFlags = new Map();
        }
        window.ProcessingTagState._customFlags.set(key, { label, color: '#7c3aed' });
        // Save custom flags config to API
        _saveCustomFlagsToAPI();
        return key;
    }

    async function _saveCustomFlagsToAPI() {
        try {
            const customFlags = window.ProcessingTagState._customFlags;
            if (!customFlags) return;
            const data = { customFlags: Object.fromEntries(customFlags) };
            const campaignId = window.ProcessingTagState._campaignId;
            if (!campaignId) return;
            const url = `https://n2store-fallback.onrender.com/api/realtime/processing-tags/${campaignId}/__ptag_custom_flags__`;
            await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data, updatedBy: window.currentUserName || 'system' })
            });
        } catch (e) {
            console.warn(SYNC_LOG, 'Failed to save custom flags:', e);
        }
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

})();
