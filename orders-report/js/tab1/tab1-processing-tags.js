/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                    TAB1 PROCESSING TAGS (Tag Xử Lý)                         ║
 * ║          Hệ thống phân luồng quy trình chốt đơn với khách                   ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  [A] CONSTANTS & DEFAULTS                                                   ║
 * ║  [B] STATE MANAGEMENT                                                        ║
 * ║  [C] FIREBASE CRUD                                                           ║
 * ║  [D] PANEL RENDERING                                                         ║
 * ║  [E] TABLE CELL RENDERING                                                    ║
 * ║  [F] TAG ASSIGN DROPDOWN                                                     ║
 * ║  [G] TAG MANAGEMENT MODAL                                                    ║
 * ║  [H] BULK ASSIGNMENT                                                         ║
 * ║  [I] FILTER INTEGRATION                                                      ║
 * ║  [J] UTILITIES                                                               ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

// =====================================================
// [A] CONSTANTS & DEFAULTS
// =====================================================

const PTAG_PRESET_COLORS = [
    '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
    '#ec4899', '#f97316', '#14b8a6', '#6366f1', '#a855f7',
    '#e11d48', '#84cc16', '#06b6d4', '#7c3aed', '#db2777'
];

const PTAG_CATEGORY_COLORS = {
    1: { bg: 'rgba(16,185,129,0.08)', border: '#10b981', text: '#065f46', tagDefault: '#10b981' },
    2: { bg: 'rgba(245,158,11,0.08)', border: '#f59e0b', text: '#92400e', tagDefault: '#f59e0b' },
    3: { bg: 'rgba(107,114,128,0.08)', border: '#6b7280', text: '#374151', tagDefault: '#6b7280' },
    4: { bg: 'rgba(239,68,68,0.08)', border: '#ef4444', text: '#991b1b', tagDefault: '#ef4444' },
};

const PTAG_CATEGORY_NAMES = {
    1: 'MỤC OKE',
    2: 'MỤC XỬ LÝ',
    3: 'MỤC KHÔNG CẦN CHỐT',
    4: 'MỤC KHÁCH XÃ SAU CHỐT',
};

const DEFAULT_PROCESSING_TAGS = [
    // Category 1 - MỤC OKE
    { key: 'DI_DON', label: 'ĐI ĐƠN', color: '#10b981', category: 1 },
    { key: 'CHO_HANG', label: 'CHỜ HÀNG', color: '#34d399', category: 1 },
    { key: 'KHACH_CKHOAN', label: 'KHÁCH CKHOAN', color: '#6ee7b7', category: 1 },
    { key: 'BAN_HANG', label: 'BÁN HÀNG', color: '#059669', category: 1 },
    { key: 'CHO_LIVE_GIU_DON', label: 'CHỜ LIVE + GIỮ ĐƠN', color: '#047857', category: 1 },
    { key: 'QUA_LAY', label: 'QUA LẤY', color: '#065f46', category: 1 },
    { key: 'TRU_CONG_NO', label: 'TRỪ CÔNG NỢ', color: '#14b8a6', category: 1 },
    { key: 'GIAM_GIA', label: 'GIẢM GIÁ', color: '#0d9488', category: 1 },
    { key: 'DA_DI_DON_GAP', label: 'ĐÃ ĐI ĐƠN GẤP', color: '#0f766e', category: 1 },
    { key: 'OKE_KHAC', label: 'KHÁC (OKE)', color: '#115e59', category: 1 },
    // Category 2 - MỤC XỬ LÝ
    { key: 'CHUA_PHAN_HOI', label: 'ĐƠN CHƯA PHẢN HỒI', color: '#f59e0b', category: 2 },
    { key: 'CHUA_DUNG_SP', label: 'ĐƠN CHƯA ĐÚNG SP', color: '#d97706', category: 2 },
    { key: 'KHACH_MUON_XA', label: 'ĐƠN KHÁCH MUỐN XÃ', color: '#b45309', category: 2 },
    { key: 'NCC_HET_HANG', label: 'NCC HẾT HÀNG', color: '#f97316', category: 2 },
    { key: 'XU_LY_KHAC', label: 'KHÁC (XỬ LÝ)', color: '#ea580c', category: 2 },
    // Category 3 - MỤC KHÔNG CẦN CHỐT
    { key: 'DA_GOP_KHONG_CHOT', label: 'ĐÃ GỘP KHÔNG CHỐT', color: '#6b7280', category: 3 },
    { key: 'GIO_TRONG', label: 'GIỎ TRỐNG', color: '#9ca3af', category: 3 },
    // Category 4 - MỤC KHÁCH XÃ SAU CHỐT
    { key: 'KHACH_HUY_DON', label: 'KHÁCH HỦY NGUYÊN ĐƠN', color: '#ef4444', category: 4 },
    { key: 'KHACH_KO_LIEN_LAC', label: 'KHÁCH KHÔNG LIÊN LẠC ĐƯỢC', color: '#dc2626', category: 4 },
];

// =====================================================
// [B] STATE MANAGEMENT
// =====================================================

const ProcessingTagState = {
    _orderTags: new Map(),      // orderId -> [{ key, category, note, assignedAt }]
    _tagDefinitions: [],        // Custom tag list (loaded from Firebase or defaults)
    _panelOpen: false,
    _panelPinned: false,
    _activeFilter: null,        // null | tagKey | '__no_tag__'
    _activeCategory: null,      // null | categoryId
    _campaignId: null,
    _listeners: [],             // Firebase listener refs for cleanup
};

const PTAG_PIN_KEY = 'ptagPanelPinned';

// =====================================================
// [C] FIREBASE CRUD
// =====================================================

function _ptagDbRef() {
    if (!ProcessingTagState._campaignId) return null;
    try {
        return firebase.database().ref(`processing_tags/${ProcessingTagState._campaignId}`);
    } catch (e) {
        console.error('[PTAG] Firebase ref error:', e);
        return null;
    }
}

/**
 * Load all processing tags for a campaign
 */
async function loadProcessingTags(campaignId) {
    ProcessingTagState._campaignId = campaignId;
    ProcessingTagState._orderTags.clear();

    const ref = _ptagDbRef();
    if (!ref) return;

    try {
        const snap = await ref.child('orders').once('value');
        const data = snap.val();
        if (data) {
            Object.keys(data).forEach(orderId => {
                const entry = data[orderId];
                if (entry && entry.tags) {
                    ProcessingTagState._orderTags.set(orderId, entry.tags);
                }
            });
        }
        console.log(`[PTAG] Loaded processing tags for ${ProcessingTagState._orderTags.size} orders`);
    } catch (e) {
        console.error('[PTAG] Error loading processing tags:', e);
    }
}

/**
 * Load custom tag definitions (or use defaults)
 */
async function loadTagDefinitions(campaignId) {
    ProcessingTagState._campaignId = campaignId;

    const ref = _ptagDbRef();
    if (!ref) {
        ProcessingTagState._tagDefinitions = [...DEFAULT_PROCESSING_TAGS];
        return;
    }

    try {
        const snap = await ref.child('config/tags').once('value');
        const data = snap.val();
        if (data && Array.isArray(data) && data.length > 0) {
            ProcessingTagState._tagDefinitions = data;
        } else {
            ProcessingTagState._tagDefinitions = [...DEFAULT_PROCESSING_TAGS];
        }
        console.log(`[PTAG] Loaded ${ProcessingTagState._tagDefinitions.length} tag definitions`);
    } catch (e) {
        console.error('[PTAG] Error loading tag definitions:', e);
        ProcessingTagState._tagDefinitions = [...DEFAULT_PROCESSING_TAGS];
    }
}

/**
 * Assign a processing tag to an order
 */
async function assignProcessingTag(orderId, tagKey, note) {
    const tagDef = ProcessingTagState._tagDefinitions.find(t => t.key === tagKey);
    if (!tagDef) return;

    const existing = ProcessingTagState._orderTags.get(orderId) || [];
    // Check duplicate
    if (existing.some(t => t.key === tagKey)) return;

    const newTag = {
        key: tagKey,
        category: tagDef.category,
        note: note || '',
        assignedAt: Date.now(),
    };

    const updatedTags = [...existing, newTag];
    ProcessingTagState._orderTags.set(orderId, updatedTags);

    // Update UI immediately (optimistic)
    _ptagUpdateCellDOM(orderId);
    _ptagRenderPanelCards();

    // Save to Firebase
    const ref = _ptagDbRef();
    if (ref) {
        try {
            await ref.child(`orders/${orderId}`).set({
                tags: updatedTags,
                updatedBy: _ptagGetCurrentUser(),
                updatedAt: firebase.database.ServerValue.TIMESTAMP,
            });
        } catch (e) {
            console.error('[PTAG] Error saving tag:', e);
        }
    }
}

/**
 * Remove a processing tag from an order
 */
async function removeProcessingTag(orderId, tagKey) {
    const existing = ProcessingTagState._orderTags.get(orderId) || [];
    const updatedTags = existing.filter(t => t.key !== tagKey);

    if (updatedTags.length === 0) {
        ProcessingTagState._orderTags.delete(orderId);
    } else {
        ProcessingTagState._orderTags.set(orderId, updatedTags);
    }

    // Update UI immediately
    _ptagUpdateCellDOM(orderId);
    _ptagRenderPanelCards();

    // Save to Firebase
    const ref = _ptagDbRef();
    if (ref) {
        try {
            if (updatedTags.length === 0) {
                await ref.child(`orders/${orderId}`).remove();
            } else {
                await ref.child(`orders/${orderId}`).set({
                    tags: updatedTags,
                    updatedBy: _ptagGetCurrentUser(),
                    updatedAt: firebase.database.ServerValue.TIMESTAMP,
                });
            }
        } catch (e) {
            console.error('[PTAG] Error removing tag:', e);
        }
    }
}

/**
 * Clear all processing tags from an order
 */
async function clearProcessingTags(orderId) {
    ProcessingTagState._orderTags.delete(orderId);
    _ptagUpdateCellDOM(orderId);
    _ptagRenderPanelCards();

    const ref = _ptagDbRef();
    if (ref) {
        try {
            await ref.child(`orders/${orderId}`).remove();
        } catch (e) {
            console.error('[PTAG] Error clearing tags:', e);
        }
    }
}

/**
 * Setup Firebase realtime listeners
 */
function setupProcessingTagRealtimeListeners(campaignId) {
    // Cleanup old listeners
    _ptagCleanupListeners();

    ProcessingTagState._campaignId = campaignId;
    const ref = _ptagDbRef();
    if (!ref) return;

    const ordersRef = ref.child('orders');

    const onChildChanged = ordersRef.on('child_changed', snap => {
        const orderId = snap.key;
        const data = snap.val();
        if (data && data.tags) {
            ProcessingTagState._orderTags.set(orderId, data.tags);
        } else {
            ProcessingTagState._orderTags.delete(orderId);
        }
        _ptagUpdateCellDOM(orderId);
        _ptagRenderPanelCards();
    });

    const onChildAdded = ordersRef.on('child_added', snap => {
        const orderId = snap.key;
        const data = snap.val();
        if (data && data.tags) {
            ProcessingTagState._orderTags.set(orderId, data.tags);
            _ptagUpdateCellDOM(orderId);
            _ptagRenderPanelCards();
        }
    });

    const onChildRemoved = ordersRef.on('child_removed', snap => {
        const orderId = snap.key;
        ProcessingTagState._orderTags.delete(orderId);
        _ptagUpdateCellDOM(orderId);
        _ptagRenderPanelCards();
    });

    // Also listen for tag definition changes
    const configRef = ref.child('config/tags');
    const onConfigChanged = configRef.on('value', snap => {
        const data = snap.val();
        if (data && Array.isArray(data) && data.length > 0) {
            ProcessingTagState._tagDefinitions = data;
        }
    });

    ProcessingTagState._listeners = [
        { ref: ordersRef, event: 'child_changed', callback: onChildChanged },
        { ref: ordersRef, event: 'child_added', callback: onChildAdded },
        { ref: ordersRef, event: 'child_removed', callback: onChildRemoved },
        { ref: configRef, event: 'value', callback: onConfigChanged },
    ];
}

function _ptagCleanupListeners() {
    ProcessingTagState._listeners.forEach(l => {
        try { l.ref.off(l.event, l.callback); } catch (e) { /* ignore */ }
    });
    ProcessingTagState._listeners = [];
}

/**
 * Save tag definitions to Firebase
 */
async function saveTagDefinitions() {
    const ref = _ptagDbRef();
    if (!ref) return;

    try {
        await ref.child('config/tags').set(ProcessingTagState._tagDefinitions);
        console.log('[PTAG] Tag definitions saved');
    } catch (e) {
        console.error('[PTAG] Error saving tag definitions:', e);
    }
}

// =====================================================
// [D] PANEL RENDERING
// =====================================================

function initProcessingTagPanel() {
    const pinned = localStorage.getItem(PTAG_PIN_KEY);
    ProcessingTagState._panelPinned = pinned === 'true';

    if (ProcessingTagState._panelPinned) {
        openProcessingTagPanel();
    }
}

function toggleProcessingTagPanel() {
    if (ProcessingTagState._panelOpen) {
        closeProcessingTagPanel();
    } else {
        openProcessingTagPanel();
    }
}

function openProcessingTagPanel() {
    const panel = document.getElementById('ptagPanel');
    if (!panel) return;

    panel.classList.add('open');
    ProcessingTagState._panelOpen = true;

    const toggleBtn = document.getElementById('ptagToggleBtn');
    if (toggleBtn) toggleBtn.classList.add('active');

    _ptagUpdatePinBtnUI();
    _ptagRenderPanelCards();

    // Mobile overlay
    const overlay = document.getElementById('ptagPanelOverlay');
    if (overlay && window.innerWidth <= 1024) {
        overlay.classList.add('show');
    }
}

function closeProcessingTagPanel(force) {
    if (ProcessingTagState._panelPinned && !force) return;

    const panel = document.getElementById('ptagPanel');
    if (!panel) return;

    panel.classList.remove('open');
    ProcessingTagState._panelOpen = false;

    // Unpin if force closing
    if (force && ProcessingTagState._panelPinned) {
        ProcessingTagState._panelPinned = false;
        localStorage.setItem(PTAG_PIN_KEY, 'false');
    }

    const toggleBtn = document.getElementById('ptagToggleBtn');
    if (toggleBtn) toggleBtn.classList.remove('active');

    const overlay = document.getElementById('ptagPanelOverlay');
    if (overlay) overlay.classList.remove('show');
}

function togglePinProcessingTagPanel() {
    ProcessingTagState._panelPinned = !ProcessingTagState._panelPinned;
    localStorage.setItem(PTAG_PIN_KEY, String(ProcessingTagState._panelPinned));
    _ptagUpdatePinBtnUI();
}

function _ptagUpdatePinBtnUI() {
    const btn = document.getElementById('ptagPinBtn');
    if (!btn) return;
    if (ProcessingTagState._panelPinned) {
        btn.classList.add('pinned');
        btn.title = 'Bỏ ghim panel';
    } else {
        btn.classList.remove('pinned');
        btn.title = 'Ghim panel';
    }
}

function _ptagRenderPanelCards() {
    const body = document.getElementById('ptagPanelBody');
    if (!body) return;

    const searchInput = document.getElementById('ptagPanelSearch');
    const searchTerm = _ptagRemoveDiacritics((searchInput?.value || '').trim().toLowerCase());

    // Count tags across all orders (use allData for total context)
    const counts = _ptagGetCounts();
    const totalOrders = (typeof allData !== 'undefined' ? allData.length : 0);
    const noTagCount = totalOrders - ProcessingTagState._orderTags.size;

    let html = '';

    // TẤT CẢ card
    if (!searchTerm || _ptagRemoveDiacritics('tất cả').includes(searchTerm)) {
        html += `
            <div class="ptag-card ${ProcessingTagState._activeFilter === null && ProcessingTagState._activeCategory === null ? 'active' : ''}"
                 onclick="ptagFilterByTag(null)">
                <div class="ptag-card-icon" style="background: #6b7280;">
                    <i class="fas fa-globe"></i>
                </div>
                <div class="ptag-card-info">
                    <div class="ptag-card-name">TẤT CẢ</div>
                    <div class="ptag-card-count">${totalOrders} đơn hàng</div>
                </div>
            </div>`;
    }

    // CHƯA GÁN card
    if (!searchTerm || _ptagRemoveDiacritics('chưa gán').includes(searchTerm)) {
        html += `
            <div class="ptag-card ${ProcessingTagState._activeFilter === '__no_tag__' ? 'active' : ''}"
                 onclick="ptagFilterByTag('__no_tag__')">
                <div class="ptag-card-icon" style="background: #d1d5db;">
                    <i class="fas fa-tag" style="color: #6b7280;"></i>
                </div>
                <div class="ptag-card-info">
                    <div class="ptag-card-name">CHƯA GÁN TAG XỬ LÝ</div>
                    <div class="ptag-card-count">${noTagCount < 0 ? 0 : noTagCount} đơn hàng</div>
                </div>
            </div>`;
    }

    // Render by category
    const tagsByCategory = {};
    ProcessingTagState._tagDefinitions.forEach(t => {
        if (!tagsByCategory[t.category]) tagsByCategory[t.category] = [];
        tagsByCategory[t.category].push(t);
    });

    [1, 2, 3, 4].forEach(catId => {
        const catTags = tagsByCategory[catId] || [];
        const catName = PTAG_CATEGORY_NAMES[catId] || `MỤC ${catId}`;
        const catColors = PTAG_CATEGORY_COLORS[catId];

        // Filter tags by search
        const filteredTags = searchTerm
            ? catTags.filter(t => _ptagRemoveDiacritics(t.label.toLowerCase()).includes(searchTerm))
            : catTags;

        if (filteredTags.length === 0 && searchTerm) return;

        // Category total count
        const catCount = catTags.reduce((sum, t) => sum + (counts[t.key] || 0), 0);

        html += `
            <div class="ptag-category-header ptag-category-${catId} ${ProcessingTagState._activeCategory === catId ? 'active' : ''}"
                 onclick="ptagFilterByCategory(${catId})">
                <span class="ptag-category-header-name">${catName}</span>
                <span class="ptag-category-header-count">${catCount}</span>
            </div>`;

        filteredTags.forEach(tag => {
            const count = counts[tag.key] || 0;
            html += `
                <div class="ptag-card ${ProcessingTagState._activeFilter === tag.key ? 'active' : ''}"
                     onclick="ptagFilterByTag('${tag.key}')">
                    <div class="ptag-card-icon" style="background: ${tag.color};">
                        <i class="fas fa-tag"></i>
                    </div>
                    <div class="ptag-card-info">
                        <div class="ptag-card-name">${tag.label}</div>
                        <div class="ptag-card-count">${count} đơn hàng</div>
                    </div>
                </div>`;
        });
    });

    if (!html) {
        html = '<div style="text-align:center; padding:20px; color:#9ca3af; font-size:13px;">Không tìm thấy tag</div>';
    }

    body.innerHTML = html;
}

function _ptagGetCounts() {
    const counts = {};
    ProcessingTagState._tagDefinitions.forEach(t => { counts[t.key] = 0; });

    ProcessingTagState._orderTags.forEach(tags => {
        tags.forEach(t => {
            if (counts[t.key] !== undefined) counts[t.key]++;
        });
    });

    return counts;
}

// ===== PANEL FILTER ACTIONS =====

function ptagFilterByTag(tagKey) {
    ProcessingTagState._activeFilter = tagKey;
    ProcessingTagState._activeCategory = null;
    _ptagRenderPanelCards();

    if (typeof performTableSearch === 'function') {
        performTableSearch();
    }
}

function ptagFilterByCategory(catId) {
    if (ProcessingTagState._activeCategory === catId) {
        // Toggle off
        ProcessingTagState._activeCategory = null;
        ProcessingTagState._activeFilter = null;
    } else {
        ProcessingTagState._activeCategory = catId;
        ProcessingTagState._activeFilter = null;
    }
    _ptagRenderPanelCards();

    if (typeof performTableSearch === 'function') {
        performTableSearch();
    }
}

function ptagFilterPanelSearch() {
    _ptagRenderPanelCards();
}

// =====================================================
// [E] TABLE CELL RENDERING
// =====================================================

/**
 * Render processing tag cell HTML for a given order
 * Called from createRowHTML() in tab1-table.js
 */
function renderProcessingTagCell(orderId, orderCode) {
    const tags = ProcessingTagState._orderTags.get(orderId) || [];

    let badgesHTML = '';
    tags.forEach(tag => {
        const def = ProcessingTagState._tagDefinitions.find(d => d.key === tag.key);
        const color = def ? def.color : '#6b7280';
        const label = def ? def.label : tag.key;
        badgesHTML += `<span class="ptag-badge" style="background:${color};" title="${tag.note || label}">
            ${label}
            <span class="ptag-badge-remove" onclick="removeProcessingTag('${orderId}','${tag.key}'); event.stopPropagation();">×</span>
        </span>`;
    });

    return `<div class="ptag-cell">
        <div class="ptag-cell-actions">
            <button class="ptag-cell-btn" onclick="openPtagDropdown('${orderId}', event); event.stopPropagation();" title="Gán Tag Xử Lý">
                <i class="fas fa-tasks"></i>
            </button>
        </div>
        <div class="ptag-badges" id="ptagBadges_${orderId}">${badgesHTML}</div>
    </div>`;
}

/**
 * Update only the badges DOM for a specific order (no full re-render)
 */
function _ptagUpdateCellDOM(orderId) {
    const container = document.getElementById(`ptagBadges_${orderId}`);
    if (!container) return;

    const tags = ProcessingTagState._orderTags.get(orderId) || [];
    let html = '';
    tags.forEach(tag => {
        const def = ProcessingTagState._tagDefinitions.find(d => d.key === tag.key);
        const color = def ? def.color : '#6b7280';
        const label = def ? def.label : tag.key;
        html += `<span class="ptag-badge" style="background:${color};" title="${tag.note || label}">
            ${label}
            <span class="ptag-badge-remove" onclick="removeProcessingTag('${orderId}','${tag.key}'); event.stopPropagation();">×</span>
        </span>`;
    });
    container.innerHTML = html;
}

// =====================================================
// [F] TAG ASSIGN DROPDOWN
// =====================================================

let _ptagDropdownOrderId = null;

function openPtagDropdown(orderId, event) {
    closePtagDropdown();
    _ptagDropdownOrderId = orderId;

    const rect = event.target.closest('button').getBoundingClientRect();
    const existingTags = ProcessingTagState._orderTags.get(orderId) || [];
    const existingKeys = new Set(existingTags.map(t => t.key));

    // Build dropdown HTML
    let itemsHTML = '';
    const tagsByCategory = {};
    ProcessingTagState._tagDefinitions.forEach(t => {
        if (!tagsByCategory[t.category]) tagsByCategory[t.category] = [];
        tagsByCategory[t.category].push(t);
    });

    [1, 2, 3, 4].forEach(catId => {
        const catTags = tagsByCategory[catId] || [];
        const catName = PTAG_CATEGORY_NAMES[catId] || `MỤC ${catId}`;
        itemsHTML += `<div class="ptag-dropdown-category">${catName}</div>`;
        catTags.forEach(tag => {
            const selected = existingKeys.has(tag.key);
            itemsHTML += `
                <div class="ptag-dropdown-item ${selected ? 'selected' : ''}"
                     onclick="_ptagDropdownToggle('${orderId}', '${tag.key}')" data-ptag-key="${tag.key}">
                    <span class="ptag-dropdown-item-dot" style="background:${tag.color};"></span>
                    <span>${tag.label}</span>
                    ${selected ? '<span class="ptag-dropdown-item-check"><i class="fas fa-check"></i></span>' : ''}
                </div>`;
        });
    });

    // Position dropdown
    let top = rect.bottom + 4;
    let left = rect.left;
    if (top + 420 > window.innerHeight) top = rect.top - 420;
    if (left + 280 > window.innerWidth) left = window.innerWidth - 290;

    const overlayEl = document.createElement('div');
    overlayEl.className = 'ptag-dropdown-overlay';
    overlayEl.onclick = closePtagDropdown;
    overlayEl.id = 'ptagDropdownOverlay';

    const dropdownEl = document.createElement('div');
    dropdownEl.className = 'ptag-dropdown';
    dropdownEl.id = 'ptagDropdown';
    dropdownEl.style.top = `${top}px`;
    dropdownEl.style.left = `${left}px`;
    dropdownEl.innerHTML = `
        <div class="ptag-dropdown-header">
            <span>Tag Xử Lý</span>
            <span style="font-size:11px; color:#9ca3af; cursor:pointer;" onclick="clearProcessingTags('${orderId}'); closePtagDropdown();">Xóa hết</span>
        </div>
        <div class="ptag-dropdown-search">
            <input type="text" placeholder="Tìm tag..." oninput="_ptagDropdownFilter(this.value)" />
        </div>
        <div class="ptag-dropdown-body">${itemsHTML}</div>`;

    document.body.appendChild(overlayEl);
    document.body.appendChild(dropdownEl);

    // Focus search
    setTimeout(() => {
        const searchInput = dropdownEl.querySelector('input');
        if (searchInput) searchInput.focus();
    }, 50);
}

function closePtagDropdown() {
    const overlay = document.getElementById('ptagDropdownOverlay');
    const dropdown = document.getElementById('ptagDropdown');
    if (overlay) overlay.remove();
    if (dropdown) dropdown.remove();
    _ptagDropdownOrderId = null;
}

function _ptagDropdownToggle(orderId, tagKey) {
    const existing = ProcessingTagState._orderTags.get(orderId) || [];
    const has = existing.some(t => t.key === tagKey);

    if (has) {
        removeProcessingTag(orderId, tagKey);
    } else {
        // Check if this is a KHAC tag that needs a note
        const tagDef = ProcessingTagState._tagDefinitions.find(t => t.key === tagKey);
        if (tagDef && (tagKey === 'OKE_KHAC' || tagKey === 'XU_LY_KHAC')) {
            const note = prompt(`Ghi chú cho "${tagDef.label}":`);
            if (note === null) return; // Cancelled
            assignProcessingTag(orderId, tagKey, note);
        } else {
            assignProcessingTag(orderId, tagKey, '');
        }
    }

    // Refresh dropdown to show updated state
    closePtagDropdown();
}

function _ptagDropdownFilter(searchText) {
    const dropdown = document.getElementById('ptagDropdown');
    if (!dropdown) return;

    const term = _ptagRemoveDiacritics(searchText.trim().toLowerCase());
    const items = dropdown.querySelectorAll('.ptag-dropdown-item');
    const categories = dropdown.querySelectorAll('.ptag-dropdown-category');

    items.forEach(item => {
        const label = _ptagRemoveDiacritics(item.textContent.trim().toLowerCase());
        item.style.display = (!term || label.includes(term)) ? '' : 'none';
    });

    // Hide empty category headers
    categories.forEach(catEl => {
        let next = catEl.nextElementSibling;
        let hasVisible = false;
        while (next && !next.classList.contains('ptag-dropdown-category')) {
            if (next.style.display !== 'none') hasVisible = true;
            next = next.nextElementSibling;
        }
        catEl.style.display = hasVisible ? '' : 'none';
    });
}

// =====================================================
// [G] TAG MANAGEMENT MODAL
// =====================================================

function openPtagManageModal() {
    let modal = document.getElementById('ptagManageModal');
    if (!modal) return;

    modal.classList.add('show');
    _ptagRenderManageList();
}

function closePtagManageModal() {
    const modal = document.getElementById('ptagManageModal');
    if (modal) modal.classList.remove('show');

    // Close any open color picker
    document.querySelectorAll('.ptag-color-picker.show').forEach(el => el.classList.remove('show'));
}

function _ptagRenderManageList() {
    const body = document.getElementById('ptagManageBody');
    if (!body) return;

    const tagsByCategory = {};
    ProcessingTagState._tagDefinitions.forEach(t => {
        if (!tagsByCategory[t.category]) tagsByCategory[t.category] = [];
        tagsByCategory[t.category].push(t);
    });

    let html = '';
    [1, 2, 3, 4].forEach(catId => {
        const catTags = tagsByCategory[catId] || [];
        const catName = PTAG_CATEGORY_NAMES[catId];
        const catColors = PTAG_CATEGORY_COLORS[catId];

        html += `<div class="ptag-manage-category-section">
            <div class="ptag-manage-category-title" style="background:${catColors.bg}; color:${catColors.text}; border-left: 3px solid ${catColors.border};">
                ${catName}
            </div>`;

        catTags.forEach(tag => {
            html += `
            <div class="ptag-manage-item" data-ptag-key="${tag.key}">
                <div class="ptag-manage-item-color" style="background:${tag.color};"
                     onclick="_ptagOpenColorPicker(this, '${tag.key}')" title="Đổi màu"></div>
                <input class="ptag-manage-item-name" value="${_ptagEscapeHtml(tag.label)}"
                       onchange="_ptagUpdateTagLabel('${tag.key}', this.value)" />
                <div class="ptag-manage-item-actions">
                    <button class="delete" onclick="_ptagDeleteTag('${tag.key}')" title="Xóa tag">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>`;
        });

        // Add new tag form for this category
        html += `
            <div class="ptag-manage-add-form">
                <input type="text" placeholder="Tên tag mới..." id="ptagNewTag_${catId}" />
                <button onclick="_ptagAddTag(${catId})">
                    <i class="fas fa-plus"></i> Thêm
                </button>
            </div>
        </div>`;
    });

    body.innerHTML = html;
}

function _ptagAddTag(categoryId) {
    const input = document.getElementById(`ptagNewTag_${categoryId}`);
    if (!input) return;

    const name = input.value.trim();
    if (!name) return;

    // Generate key from name
    const key = 'CUSTOM_' + name.toUpperCase()
        .replace(/[^A-Z0-9\u00C0-\u024F]/g, '_')
        .replace(/_+/g, '_')
        .substring(0, 30) + '_' + Date.now().toString(36);

    const catColors = PTAG_CATEGORY_COLORS[categoryId];
    const newTag = {
        key: key,
        label: name,
        color: catColors.tagDefault,
        category: categoryId,
    };

    ProcessingTagState._tagDefinitions.push(newTag);
    saveTagDefinitions();
    _ptagRenderManageList();
    _ptagRenderPanelCards();

    input.value = '';
}

function _ptagUpdateTagLabel(tagKey, newLabel) {
    const tag = ProcessingTagState._tagDefinitions.find(t => t.key === tagKey);
    if (tag) {
        tag.label = newLabel.trim();
        saveTagDefinitions();
        _ptagRenderPanelCards();
    }
}

function _ptagDeleteTag(tagKey) {
    const tag = ProcessingTagState._tagDefinitions.find(t => t.key === tagKey);
    if (!tag) return;

    if (!confirm(`Xóa tag "${tag.label}"? Tag sẽ bị xóa khỏi tất cả đơn hàng.`)) return;

    // Remove from definitions
    ProcessingTagState._tagDefinitions = ProcessingTagState._tagDefinitions.filter(t => t.key !== tagKey);
    saveTagDefinitions();

    // Remove from all orders
    ProcessingTagState._orderTags.forEach((tags, orderId) => {
        const filtered = tags.filter(t => t.key !== tagKey);
        if (filtered.length !== tags.length) {
            if (filtered.length === 0) {
                ProcessingTagState._orderTags.delete(orderId);
            } else {
                ProcessingTagState._orderTags.set(orderId, filtered);
            }
            // Update Firebase for this order
            const ref = _ptagDbRef();
            if (ref) {
                if (filtered.length === 0) {
                    ref.child(`orders/${orderId}`).remove();
                } else {
                    ref.child(`orders/${orderId}`).set({
                        tags: filtered,
                        updatedBy: _ptagGetCurrentUser(),
                        updatedAt: firebase.database.ServerValue.TIMESTAMP,
                    });
                }
            }
            _ptagUpdateCellDOM(orderId);
        }
    });

    // Reset filter if deleted tag was active
    if (ProcessingTagState._activeFilter === tagKey) {
        ProcessingTagState._activeFilter = null;
        if (typeof performTableSearch === 'function') performTableSearch();
    }

    _ptagRenderManageList();
    _ptagRenderPanelCards();
}

function _ptagOpenColorPicker(element, tagKey) {
    // Close any existing
    document.querySelectorAll('.ptag-color-picker.show').forEach(el => el.classList.remove('show'));

    let picker = element.parentElement.querySelector('.ptag-color-picker');
    if (!picker) {
        picker = document.createElement('div');
        picker.className = 'ptag-color-picker';
        picker.innerHTML = PTAG_PRESET_COLORS.map(c =>
            `<div class="ptag-color-picker-item" style="background:${c};" onclick="_ptagSetColor('${tagKey}','${c}', this)"></div>`
        ).join('');
        element.parentElement.style.position = 'relative';
        element.parentElement.appendChild(picker);
    }

    picker.classList.add('show');

    // Close on outside click
    setTimeout(() => {
        const close = (e) => {
            if (!picker.contains(e.target) && e.target !== element) {
                picker.classList.remove('show');
                document.removeEventListener('click', close);
            }
        };
        document.addEventListener('click', close);
    }, 10);
}

function _ptagSetColor(tagKey, color, pickerItem) {
    const tag = ProcessingTagState._tagDefinitions.find(t => t.key === tagKey);
    if (tag) {
        tag.color = color;
        saveTagDefinitions();
        _ptagRenderManageList();
        _ptagRenderPanelCards();

        // Update all visible cells that have this tag
        ProcessingTagState._orderTags.forEach((tags, orderId) => {
            if (tags.some(t => t.key === tagKey)) {
                _ptagUpdateCellDOM(orderId);
            }
        });
    }
}

// =====================================================
// [H] BULK ASSIGNMENT
// =====================================================

function openPtagBulkModal() {
    const modal = document.getElementById('ptagBulkModal');
    if (!modal) return;
    modal.classList.add('show');
    _ptagRenderBulkTagList();
}

function closePtagBulkModal() {
    const modal = document.getElementById('ptagBulkModal');
    if (modal) modal.classList.remove('show');
}

function _ptagRenderBulkTagList() {
    const container = document.getElementById('ptagBulkTagList');
    if (!container) return;

    const tagsByCategory = {};
    ProcessingTagState._tagDefinitions.forEach(t => {
        if (!tagsByCategory[t.category]) tagsByCategory[t.category] = [];
        tagsByCategory[t.category].push(t);
    });

    let html = '';
    [1, 2, 3, 4].forEach(catId => {
        const catTags = tagsByCategory[catId] || [];
        const catName = PTAG_CATEGORY_NAMES[catId];
        const catColors = PTAG_CATEGORY_COLORS[catId];

        html += `<div style="font-size:11px; font-weight:700; text-transform:uppercase; color:${catColors.text}; padding:6px 0 2px; border-bottom:2px solid ${catColors.border}; margin-top:8px;">${catName}</div>`;

        catTags.forEach(tag => {
            html += `
                <label style="display:flex; align-items:center; gap:8px; padding:5px 4px; cursor:pointer; font-size:12px;">
                    <input type="checkbox" value="${tag.key}" class="ptag-bulk-checkbox" />
                    <span class="ptag-dropdown-item-dot" style="background:${tag.color};"></span>
                    <span>${tag.label}</span>
                </label>`;
        });
    });

    container.innerHTML = html;
}

async function savePtagBulk() {
    const sttInput = document.getElementById('ptagBulkSTT');
    if (!sttInput) return;

    const sttText = sttInput.value.trim();
    if (!sttText) {
        alert('Vui lòng nhập STT');
        return;
    }

    // Parse STT input (supports: "1, 5-10, 15")
    const sttSet = new Set();
    sttText.split(',').forEach(part => {
        part = part.trim();
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(Number);
            if (!isNaN(start) && !isNaN(end)) {
                for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
                    sttSet.add(i);
                }
            }
        } else {
            const num = parseInt(part);
            if (!isNaN(num)) sttSet.add(num);
        }
    });

    // Get selected tags
    const selectedKeys = [];
    document.querySelectorAll('.ptag-bulk-checkbox:checked').forEach(cb => {
        selectedKeys.push(cb.value);
    });

    if (selectedKeys.length === 0) {
        alert('Vui lòng chọn ít nhất 1 tag');
        return;
    }

    // Find orders matching STT
    const matchingOrders = (typeof allData !== 'undefined' ? allData : []).filter(o => {
        const stt = parseInt(o.SessionIndex);
        return !isNaN(stt) && sttSet.has(stt);
    });

    if (matchingOrders.length === 0) {
        alert('Không tìm thấy đơn nào với STT đã nhập');
        return;
    }

    // Assign tags
    let assignedCount = 0;
    for (const order of matchingOrders) {
        for (const tagKey of selectedKeys) {
            const existing = ProcessingTagState._orderTags.get(order.Id) || [];
            if (!existing.some(t => t.key === tagKey)) {
                await assignProcessingTag(order.Id, tagKey, '');
                assignedCount++;
            }
        }
    }

    closePtagBulkModal();
    alert(`Đã gán ${selectedKeys.length} tag cho ${matchingOrders.length} đơn (${assignedCount} thao tác mới)`);

    _ptagRenderPanelCards();
}

// =====================================================
// [I] FILTER INTEGRATION
// =====================================================

/**
 * Get active processing tag filter for performTableSearch()
 * Returns: { type: 'tag'|'category'|'no_tag'|null, value: string|number|null }
 */
window.getActiveProcessingTagFilter = function () {
    if (ProcessingTagState._activeFilter === '__no_tag__') {
        return { type: 'no_tag', value: null };
    }
    if (ProcessingTagState._activeFilter) {
        return { type: 'tag', value: ProcessingTagState._activeFilter };
    }
    if (ProcessingTagState._activeCategory) {
        return { type: 'category', value: ProcessingTagState._activeCategory };
    }
    return null;
};

/**
 * Check if an order passes the processing tag filter
 */
window.orderPassesProcessingTagFilter = function (orderId) {
    const filter = window.getActiveProcessingTagFilter();
    if (!filter) return true;

    const orderTags = ProcessingTagState._orderTags.get(orderId) || [];

    switch (filter.type) {
        case 'no_tag':
            return orderTags.length === 0;
        case 'tag':
            return orderTags.some(t => t.key === filter.value);
        case 'category': {
            const catTagKeys = ProcessingTagState._tagDefinitions
                .filter(d => d.category === filter.value)
                .map(d => d.key);
            return orderTags.some(t => catTagKeys.includes(t.key));
        }
        default:
            return true;
    }
};

// =====================================================
// [J] UTILITIES
// =====================================================

function _ptagGetCurrentUser() {
    try {
        const auth = window.authManager ? window.authManager.getAuthState() : null;
        return auth?.displayName || auth?.id || 'unknown';
    } catch (e) {
        return 'unknown';
    }
}

function _ptagRemoveDiacritics(str) {
    if (!str) return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

function _ptagEscapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Expose key functions to window
window.renderProcessingTagCell = renderProcessingTagCell;
window.assignProcessingTag = assignProcessingTag;
window.removeProcessingTag = removeProcessingTag;
window.clearProcessingTags = clearProcessingTags;
window.openPtagDropdown = openPtagDropdown;
window.closePtagDropdown = closePtagDropdown;
window.ptagFilterByTag = ptagFilterByTag;
window.ptagFilterByCategory = ptagFilterByCategory;
window.ptagFilterPanelSearch = ptagFilterPanelSearch;
window.toggleProcessingTagPanel = toggleProcessingTagPanel;
window.openProcessingTagPanel = openProcessingTagPanel;
window.closeProcessingTagPanel = closeProcessingTagPanel;
window.togglePinProcessingTagPanel = togglePinProcessingTagPanel;
window.openPtagManageModal = openPtagManageModal;
window.closePtagManageModal = closePtagManageModal;
window.openPtagBulkModal = openPtagBulkModal;
window.closePtagBulkModal = closePtagBulkModal;
window.savePtagBulk = savePtagBulk;
window.loadProcessingTags = loadProcessingTags;
window.loadTagDefinitions = loadTagDefinitions;
window.setupProcessingTagRealtimeListeners = setupProcessingTagRealtimeListeners;
window.initProcessingTagPanel = initProcessingTagPanel;
window.ProcessingTagState = ProcessingTagState;
