// =====================================================
// TAB1 TAG SYNC — Đồng bộ Tag TPOS → Tag XL
// Maps TPOS tags to Processing Tag categories
// =====================================================

(function() {
    'use strict';

    const SYNC_LOG = '[TAG-SYNC]';
    const SYNC_STORAGE_KEY = 'tagSyncMappings_v1';
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

    // =====================================================
    // STATE
    // =====================================================

    let syncMappings = [];
    let _rowIdCounter = 0;

    function _genRowId() {
        return 'tsync_' + (++_rowIdCounter) + '_' + Date.now();
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
                ptagCategory: m.ptagCategory,
                ptagSubTag: m.ptagSubTag
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
                ptagCategory: d.ptagCategory != null ? d.ptagCategory : null,
                ptagSubTag: d.ptagSubTag || null
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
        // Load saved mappings or create defaults
        const saved = loadMappingsFromStorage();
        if (saved && saved.length > 0) {
            syncMappings = saved;
        } else {
            syncMappings = [];
            for (let i = 0; i < DEFAULT_ROW_COUNT; i++) {
                syncMappings.push({
                    id: _genRowId(),
                    tposTagId: null,
                    tposTagName: '',
                    tposTagColor: '#6b7280',
                    ptagCategory: null,
                    ptagSubTag: null
                });
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
        // Close any open dropdowns
        document.querySelectorAll('.ts-dropdown.show').forEach(d => d.classList.remove('show'));
    }

    // =====================================================
    // RENDERING
    // =====================================================

    function renderMappingRows() {
        const body = document.getElementById('tagSyncTableBody');
        if (!body) return;

        body.innerHTML = syncMappings.map((mapping, index) => {
            const tposDisplay = mapping.tposTagId
                ? `<span class="ts-tag-pill" style="background:${mapping.tposTagColor || '#6b7280'}">${_escHtml(mapping.tposTagName)}</span>`
                : '<span class="ts-placeholder">Chọn tag TPOS...</span>';

            const ptagDisplay = mapping.ptagCategory != null
                ? _getPTagDisplayText(mapping.ptagCategory, mapping.ptagSubTag)
                : '<span class="ts-placeholder">Chọn Tag XL...</span>';

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

    function _getPTagDisplayText(category, subTag) {
        const cat = CATEGORY_OPTIONS.find(c => c.value === category);
        if (!cat) return '<span class="ts-placeholder">Chọn Tag XL...</span>';
        let text = `${cat.emoji} ${cat.label}`;
        if (subTag && SUBTAG_OPTIONS[category]) {
            const sub = SUBTAG_OPTIONS[category].find(s => s.key === subTag);
            if (sub) text += ` → ${sub.label}`;
        }
        return `<span class="ts-ptag-display">${text}</span>`;
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
        _closeAllDropdowns();
        renderMappingRows();
        saveMappingsToStorage();
    }

    // =====================================================
    // PTAG CATEGORY DROPDOWN
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
        for (const cat of CATEGORY_OPTIONS) {
            html += `
                <div class="ts-dropdown-item ts-dropdown-category" onclick="window._tsSelectPtagCategory('${rowId}', ${cat.value}, null)">
                    <span>${cat.emoji} ${cat.label}</span>
                </div>
            `;
            // Show subtags for categories 2, 3, 4
            if (SUBTAG_OPTIONS[cat.value]) {
                for (const sub of SUBTAG_OPTIONS[cat.value]) {
                    html += `
                        <div class="ts-dropdown-item ts-dropdown-subtag" onclick="window._tsSelectPtagCategory('${rowId}', ${cat.value}, '${sub.key}')">
                            <span>↳ ${sub.label}</span>
                        </div>
                    `;
                }
            }
        }
        list.innerHTML = html;
    }

    function _tsSelectPtagCategory(rowId, category, subTag) {
        const mapping = syncMappings.find(m => m.id === rowId);
        if (!mapping) return;
        mapping.ptagCategory = category;
        mapping.ptagSubTag = subTag;
        _closeAllDropdowns();
        renderMappingRows();
        saveMappingsToStorage();
    }

    // =====================================================
    // ROW MANAGEMENT
    // =====================================================

    function _tsAddRow() {
        syncMappings.push({
            id: _genRowId(),
            tposTagId: null,
            tposTagName: '',
            tposTagColor: '#6b7280',
            ptagCategory: null,
            ptagSubTag: null
        });
        renderMappingRows();
    }

    function _tsRemoveRow(rowId) {
        syncMappings = syncMappings.filter(m => m.id !== rowId);
        if (syncMappings.length === 0) {
            // Keep at least 1 row
            syncMappings.push({
                id: _genRowId(),
                tposTagId: null,
                tposTagName: '',
                tposTagColor: '#6b7280',
                ptagCategory: null,
                ptagSubTag: null
            });
        }
        renderMappingRows();
        saveMappingsToStorage();
    }

    // =====================================================
    // SYNC EXECUTION
    // =====================================================

    async function executeTagSync() {
        // 1. Validate mappings
        const validMappings = syncMappings.filter(m => m.tposTagId && m.ptagCategory != null);
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

        // 3. Build assignments map
        const assignments = new Map(); // orderId → {category, subTag, orderCode}
        for (const mapping of validMappings) {
            for (const order of allOrders) {
                let orderTags = [];
                try {
                    orderTags = JSON.parse(order.Tags || '[]');
                } catch (e) { continue; }
                if (!Array.isArray(orderTags)) continue;

                const hasTag = orderTags.some(t => t.Id === mapping.tposTagId);
                if (hasTag) {
                    // Check if order already has this category — skip if same
                    const existing = window.ProcessingTagState.getOrderData(String(order.Id));
                    if (existing && existing.category === mapping.ptagCategory) {
                        if (!mapping.ptagSubTag || existing.subTag === mapping.ptagSubTag) {
                            continue; // Already assigned, skip
                        }
                    }
                    assignments.set(String(order.Id), {
                        category: mapping.ptagCategory,
                        subTag: mapping.ptagSubTag,
                        orderCode: order.Code || order.Id
                    });
                }
            }
        }

        if (assignments.size === 0) {
            if (window.notificationManager) {
                window.notificationManager.info('Không tìm thấy đơn nào cần đồng bộ (tất cả đã có Tag XL tương ứng).', 3000);
            }
            return;
        }

        // 4. Confirm
        if (!confirm(`Sẽ đồng bộ Tag XL cho ${assignments.size} đơn hàng. Tiếp tục?`)) return;

        // 5. Execute with progress
        const syncBtn = document.getElementById('tagSyncExecuteBtn');
        if (syncBtn) {
            syncBtn.disabled = true;
            syncBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang đồng bộ...';
        }
        _showProgress(0, assignments.size);

        let success = 0, failed = 0;
        const total = assignments.size;

        for (const [orderId, { category, subTag }] of assignments) {
            try {
                const opts = {};
                if (subTag) opts.subTag = subTag;
                await window.assignOrderCategory(orderId, category, opts);
                success++;
            } catch (err) {
                console.error(SYNC_LOG, 'Failed for order', orderId, err);
                failed++;
            }
            _showProgress(success + failed, total);
            // Small delay to avoid flooding API
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
    // PROGRESS
    // =====================================================

    function _showProgress(current, total) {
        const bar = document.getElementById('tagSyncProgressBar');
        const text = document.getElementById('tagSyncProgressText');
        const container = document.getElementById('tagSyncProgress');
        if (container) container.style.display = 'block';
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
    window._tsSelectPtagCategory = _tsSelectPtagCategory;
    window._tsAddRow = _tsAddRow;
    window._tsRemoveRow = _tsRemoveRow;
    window.executeTagSync = executeTagSync;

})();
