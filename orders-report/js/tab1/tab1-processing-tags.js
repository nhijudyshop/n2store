/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║              TAB1 PROCESSING TAGS v2 (Quy Trình Chốt Đơn Mới)             ║
 * ║     5 Category: Hoàn tất / Chờ đi đơn / Xử lý / Ko cần chốt / Khách xã   ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  [A] CONSTANTS & DATA STRUCTURES                                            ║
 * ║  [B] STATE MANAGEMENT (ProcessingTagState)                                  ║
 * ║  [C] API CRUD (PostgreSQL + SSE)                                            ║
 * ║  [D] AUTO-DETECT FLAGS & AUTO SUB-STATE                                     ║
 * ║  [E] MIGRATION (old flat tags → new category system)                        ║
 * ║  [F] PANEL RENDERING                                                        ║
 * ║  [G] TABLE CELL RENDERING                                                   ║
 * ║  [H] CATEGORY/FLAG ASSIGN DROPDOWN                                          ║
 * ║  [I] BULK ASSIGNMENT                                                        ║
 * ║  [J] FILTER INTEGRATION                                                     ║
 * ║  [K] UTILITIES                                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

// =====================================================
// [A] CONSTANTS & DATA STRUCTURES
// =====================================================

const PTAG_CATEGORIES = {
    HOAN_TAT: 0,        // 0.A — Hoàn tất (đã ra đơn)
    CHO_DI_DON: 1,      // 0.C — Chờ đi đơn (OKE)
    XU_LY: 2,           // 2 — Mục xử lý
    KHONG_CAN_CHOT: 3,  // 3 — Không cần chốt
    KHACH_XA: 4          // 4 — Khách xã sau chốt
};

const PTAG_CATEGORY_NAMES = {
    0: 'HOÀN TẤT — ĐÃ RA ĐƠN',
    1: 'CHỜ ĐI ĐƠN (OKE)',
    2: 'MỤC XỬ LÝ',
    3: 'MỤC KHÔNG CẦN CHỐT',
    4: 'MỤC KHÁCH XÃ SAU CHỐT'
};

const PTAG_CATEGORY_COLORS = {
    0: { bg: 'rgba(16,185,129,0.12)', border: '#10b981', text: '#065f46' },   // Green
    1: { bg: 'rgba(59,130,246,0.08)', border: '#3b82f6', text: '#1e40af' },   // Blue
    2: { bg: 'rgba(245,158,11,0.08)', border: '#f59e0b', text: '#92400e' },   // Orange
    3: { bg: 'rgba(107,114,128,0.08)', border: '#6b7280', text: '#374151' },  // Gray
    4: { bg: 'rgba(239,68,68,0.08)', border: '#ef4444', text: '#991b1b' }     // Red
};

const PTAG_CATEGORY_ICONS = {
    0: 'fa-check-circle',
    1: 'fa-shipping-fast',
    2: 'fa-exclamation-triangle',
    3: 'fa-ban',
    4: 'fa-times-circle'
};

// Sub-states chỉ cho Category 1 (0.C)
const PTAG_SUBSTATES = {
    OKIE_CHO_DI_DON: { key: 'OKIE_CHO_DI_DON', label: 'Okie Chờ Đi Đơn', color: '#3b82f6' },
    CHO_HANG:        { key: 'CHO_HANG',         label: 'Chờ Hàng',         color: '#f59e0b' }
};

// Flags chỉ cho Category 1 (0.C)
const PTAG_FLAGS = {
    TRU_CONG_NO:  { key: 'TRU_CONG_NO',  label: 'Trừ công nợ', auto: true,  icon: '💰' },
    CHUYEN_KHOAN: { key: 'CHUYEN_KHOAN', label: 'CK',          auto: true,  icon: '💳' },
    GIAM_GIA:     { key: 'GIAM_GIA',     label: 'Giảm giá',    auto: true,  icon: '🏷️' },
    CHO_LIVE:     { key: 'CHO_LIVE',     label: 'Chờ live',    auto: false, icon: '📺' },
    GIU_DON:      { key: 'GIU_DON',      label: 'Giữ đơn',     auto: false, icon: '⏳' },
    QUA_LAY:      { key: 'QUA_LAY',      label: 'Qua lấy',     auto: false, icon: '🏠' },
    KHAC:         { key: 'KHAC',         label: 'Khác',        auto: false, icon: '📋', hasNote: true }
};

const PTAG_FLAG_KEYS = Object.keys(PTAG_FLAGS);

// Sub-tags cho Categories 2, 3, 4
const PTAG_SUBTAGS = {
    // Category 2 — MỤC XỬ LÝ
    CHUA_PHAN_HOI:  { key: 'CHUA_PHAN_HOI',  label: 'Đơn chưa phản hồi', category: 2 },
    CHUA_DUNG_SP:   { key: 'CHUA_DUNG_SP',   label: 'Đơn chưa đúng SP',  category: 2 },
    KHACH_MUON_XA:  { key: 'KHACH_MUON_XA',  label: 'Đơn khách muốn xã', category: 2 },
    NCC_HET_HANG:   { key: 'NCC_HET_HANG',   label: 'NCC hết hàng',      category: 2 },
    BAN_HANG:       { key: 'BAN_HANG',       label: 'Bán hàng',          category: 2 },
    XU_LY_KHAC:    { key: 'XU_LY_KHAC',    label: 'Khác (ghi chú)',    category: 2, hasNote: true },

    // Category 3 — MỤC KHÔNG CẦN CHỐT
    DA_GOP_KHONG_CHOT: { key: 'DA_GOP_KHONG_CHOT', label: 'Đã gộp không chốt', category: 3 },
    GIO_TRONG:         { key: 'GIO_TRONG',         label: 'Giỏ trống',         category: 3 },

    // Category 4 — MỤC KHÁCH XÃ SAU CHỐT
    KHACH_HUY_DON:     { key: 'KHACH_HUY_DON',     label: 'Khách hủy nguyên đơn',       category: 4 },
    KHACH_KO_LIEN_LAC: { key: 'KHACH_KO_LIEN_LAC', label: 'Khách không liên lạc được',  category: 4 }
};

// Migration map: old flat tag keys → new category system
const PTAG_MIGRATION_MAP = {
    'DI_DON':           { category: 1, subState: 'OKIE_CHO_DI_DON', flags: [] },
    'CHO_HANG':         { category: 1, subState: 'CHO_HANG', flags: [] },
    'KHACH_CKHOAN':     { category: 1, subState: 'OKIE_CHO_DI_DON', flags: ['CHUYEN_KHOAN'] },
    'BAN_HANG':         { category: 2, subTag: 'BAN_HANG' },
    'CHO_LIVE_GIU_DON': { category: 1, subState: 'OKIE_CHO_DI_DON', flags: ['CHO_LIVE'] },
    'QUA_LAY':          { category: 1, subState: 'OKIE_CHO_DI_DON', flags: ['QUA_LAY'] },
    'TRU_CONG_NO':      { category: 1, subState: 'OKIE_CHO_DI_DON', flags: ['TRU_CONG_NO'] },
    'GIAM_GIA':         { category: 1, subState: 'OKIE_CHO_DI_DON', flags: ['GIAM_GIA'] },
    'DA_DI_DON_GAP':    { category: 0 },
    'OKE_KHAC':         { category: 1, subState: 'OKIE_CHO_DI_DON', flags: ['KHAC'] },
    'CHUA_PHAN_HOI':    { category: 2, subTag: 'CHUA_PHAN_HOI' },
    'CHUA_DUNG_SP':     { category: 2, subTag: 'CHUA_DUNG_SP' },
    'KHACH_MUON_XA':    { category: 2, subTag: 'KHACH_MUON_XA' },
    'NCC_HET_HANG':     { category: 2, subTag: 'NCC_HET_HANG' },
    'XU_LY_KHAC':      { category: 2, subTag: 'XU_LY_KHAC' },
    'DA_GOP_KHONG_CHOT':{ category: 3, subTag: 'DA_GOP_KHONG_CHOT' },
    'GIO_TRONG':        { category: 3, subTag: 'GIO_TRONG' },
    'KHACH_HUY_DON':    { category: 4, subTag: 'KHACH_HUY_DON' },
    'KHACH_KO_LIEN_LAC':{ category: 4, subTag: 'KHACH_KO_LIEN_LAC' }
};

// =====================================================
// [B] STATE MANAGEMENT
// =====================================================

var ProcessingTagState = {
    _orderData: new Map(),    // orderId → { category, subTag, subState, flags, note, assignedAt, previousPosition }
    _panelOpen: false,
    _panelPinned: false,
    _activeFilter: null,      // null | '__no_tag__' | 'cat_0' | 'cat_1' ... | 'sub_OKIE_CHO_DI_DON' | 'sub_CHO_HANG' | 'flag_CK' ...
    _campaignId: null,
    _sseSource: null,
    _pollInterval: null,

    // Get order data (returns null if not assigned)
    getOrderData(orderId) {
        return this._orderData.get(orderId) || null;
    },

    // Set order data (full replacement)
    setOrderData(orderId, data) {
        this._orderData.set(orderId, data);
    },

    // Update order data (partial merge)
    updateOrder(orderId, updates) {
        const existing = this._orderData.get(orderId);
        if (!existing) return;
        Object.assign(existing, updates);
    },

    // Get order flags (convenience)
    getOrderFlags(orderId) {
        const data = this._orderData.get(orderId);
        return data?.flags || [];
    },

    // Remove order data
    removeOrder(orderId) {
        this._orderData.delete(orderId);
    },

    // Check if order has data
    hasOrder(orderId) {
        return this._orderData.has(orderId);
    }
};

const PTAG_PIN_KEY = 'ptagPanelPinned';

// =====================================================
// [C] API CRUD (PostgreSQL + SSE)
// =====================================================

const PTAG_API_BASE = 'https://n2store-fallback.onrender.com/api/realtime';

function _ptagApiUrl(path) {
    return `${PTAG_API_BASE}/${path}`;
}

/**
 * Load all processing tags for a campaign
 * Handles migration from old format automatically
 */
async function loadProcessingTags(campaignId) {
    ProcessingTagState._campaignId = campaignId;
    ProcessingTagState._orderData.clear();

    try {
        const resp = await fetch(_ptagApiUrl(`processing-tags/${campaignId}`));
        const json = await resp.json();
        if (json.success && json.data) {
            Object.keys(json.data).forEach(orderId => {
                const raw = json.data[orderId];
                const migrated = _ptagMigrateIfNeeded(raw);
                ProcessingTagState._orderData.set(orderId, migrated);
            });
        }
        console.log(`[PTAG v2] Loaded processing tags for ${ProcessingTagState._orderData.size} orders`);
    } catch (e) {
        console.error('[PTAG v2] Error loading processing tags:', e);
    }
}

/**
 * Load tag definitions — no longer needed for custom tags in v2
 * Kept for backward compatibility with tab1-init.js call
 */
async function loadTagDefinitions(campaignId) {
    ProcessingTagState._campaignId = campaignId;
    console.log('[PTAG v2] Tag definitions are now built-in constants (no custom tags)');
}

/**
 * Assign order to a category (main entry point for seller actions)
 */
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

    // Category 1 (0.C): auto-detect sub-state + flags
    if (category === PTAG_CATEGORIES.CHO_DI_DON) {
        // Sub-state from tag T
        const orderTags = _ptagGetOrderTPOSTags(orderId);
        const hasTTag = orderTags?.some(t => /^T\d/.test(t.Name || t.name || ''));
        data.subState = hasTTag ? 'CHO_HANG' : 'OKIE_CHO_DI_DON';

        // Auto-detect flags (merge, no duplicates)
        const phone = _ptagGetOrderPhone(orderId);
        if (phone) {
            const autoFlags = await _ptagAutoDetectFlags(orderId, phone);
            data.flags = [...new Set([...data.flags, ...autoFlags])];
        }
    }

    ProcessingTagState.setOrderData(orderId, data);

    // Update UI immediately (optimistic)
    _ptagUpdateCellDOM(orderId);
    _ptagRenderPanelCards();

    // Save to API
    await _ptagSaveToApi(orderId, data);
}

/**
 * Toggle a flag on/off for an order in category 1
 */
async function toggleOrderFlag(orderId, flagKey) {
    const data = ProcessingTagState.getOrderData(orderId);
    if (!data || data.category !== PTAG_CATEGORIES.CHO_DI_DON) return;

    const flags = data.flags || [];
    const idx = flags.indexOf(flagKey);

    if (idx >= 0) {
        flags.splice(idx, 1);
    } else {
        // KHAC flag needs a note
        if (flagKey === 'KHAC') {
            const note = prompt('Ghi chú cho flag "Khác":');
            if (note === null) return;
            data.note = note;
        }
        flags.push(flagKey);
    }

    data.flags = flags;
    ProcessingTagState.setOrderData(orderId, data);

    _ptagUpdateCellDOM(orderId);
    _ptagRenderPanelCards();

    await _ptagSaveToApi(orderId, data);
}

/**
 * Clear processing tag from an order (reset to unassigned)
 */
async function clearProcessingTags(orderId) {
    ProcessingTagState.removeOrder(orderId);
    _ptagUpdateCellDOM(orderId);
    _ptagRenderPanelCards();

    try {
        await fetch(_ptagApiUrl(`processing-tags/${ProcessingTagState._campaignId}/${orderId}`), {
            method: 'DELETE',
        });
    } catch (e) {
        console.error('[PTAG v2] Error clearing tags:', e);
    }
}

/**
 * Save order data to API
 */
async function _ptagSaveToApi(orderId, data) {
    try {
        await fetch(_ptagApiUrl(`processing-tags/${ProcessingTagState._campaignId}/${orderId}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...data,
                assignedBy: _ptagGetCurrentUser(),
            }),
        });
    } catch (e) {
        console.error('[PTAG v2] Error saving to API:', e);
    }
}

/**
 * Setup realtime listeners: SSE + polling fallback
 */
function setupProcessingTagRealtimeListeners(campaignId) {
    _ptagCleanupListeners();
    ProcessingTagState._campaignId = campaignId;

    // SSE for instant updates
    try {
        const sseUrl = _ptagApiUrl(`sse?keys=processing_tags/${campaignId}`);
        const source = new EventSource(sseUrl);

        source.addEventListener('update', (event) => {
            try {
                const payload = JSON.parse(event.data);
                const key = payload.key || '';
                if (key.startsWith('processing_tags/')) {
                    _ptagReloadFromApi(campaignId);
                }
            } catch (e) {
                console.error('[PTAG v2] SSE parse error:', e);
            }
        });

        source.onerror = () => {
            console.warn('[PTAG v2] SSE connection error, will auto-reconnect');
        };

        ProcessingTagState._sseSource = source;
        console.log('[PTAG v2] SSE realtime listener connected');
    } catch (e) {
        console.error('[PTAG v2] SSE setup error:', e);
    }

    // Polling fallback every 15s
    ProcessingTagState._pollInterval = setInterval(() => {
        _ptagReloadFromApi(campaignId);
    }, 15000);
}

/**
 * Reload all processing tags from API
 */
async function _ptagReloadFromApi(campaignId) {
    try {
        const resp = await fetch(_ptagApiUrl(`processing-tags/${campaignId}`));
        const json = await resp.json();
        if (json.success) {
            const oldOrderIds = new Set(ProcessingTagState._orderData.keys());

            ProcessingTagState._orderData.clear();
            const newData = json.data || {};
            Object.keys(newData).forEach(orderId => {
                const migrated = _ptagMigrateIfNeeded(newData[orderId]);
                ProcessingTagState._orderData.set(orderId, migrated);
            });

            const newOrderIds = new Set(Object.keys(newData));
            const allAffected = new Set([...oldOrderIds, ...newOrderIds]);
            allAffected.forEach(orderId => _ptagUpdateCellDOM(orderId));

            _ptagRenderPanelCards();
        }
    } catch (e) {
        console.error('[PTAG v2] Error reloading from API:', e);
    }
}

function _ptagCleanupListeners() {
    if (ProcessingTagState._sseSource) {
        ProcessingTagState._sseSource.close();
        ProcessingTagState._sseSource = null;
    }
    if (ProcessingTagState._pollInterval) {
        clearInterval(ProcessingTagState._pollInterval);
        ProcessingTagState._pollInterval = null;
    }
}

// =====================================================
// [D] AUTO-DETECT FLAGS & AUTO SUB-STATE
// =====================================================

/**
 * Auto-detect flags khi seller gắn đơn vào 0.C
 * - Check ví khách → CK, Công nợ
 * - Check order data → Giảm giá
 * - Không đánh trùng: nếu flag đã có rồi → bỏ qua
 */
async function _ptagAutoDetectFlags(orderId, phone) {
    const existingFlags = ProcessingTagState.getOrderFlags(orderId);
    const newFlags = [];

    // 1. Check wallet → CK + Công nợ
    try {
        if (typeof getWallet === 'function') {
            const wallet = await getWallet(phone);
            if (wallet?.balance > 0 && !existingFlags.includes('CHUYEN_KHOAN')) {
                newFlags.push('CHUYEN_KHOAN');
            }
            if (wallet?.virtual_balance > 0 && !existingFlags.includes('TRU_CONG_NO')) {
                newFlags.push('TRU_CONG_NO');
            }
        }
    } catch (e) {
        console.warn('[PTAG v2] autoDetectFlags: wallet check failed', e);
    }

    // 2. Check order data → Giảm giá
    try {
        const order = _ptagGetOrderById(orderId);
        if (order?.Discount > 0 && !existingFlags.includes('GIAM_GIA')) {
            newFlags.push('GIAM_GIA');
        }
    } catch (e) {
        console.warn('[PTAG v2] autoDetectFlags: order check failed', e);
    }

    return newFlags;
}

/**
 * Watch TPOS tag changes → auto chuyển sub-state trong 0.C
 * Called from tab1-tags.js realtime listener
 */
function onOrderTagsChanged(orderId, newTags) {
    const orderData = ProcessingTagState.getOrderData(orderId);
    if (!orderData || orderData.category !== PTAG_CATEGORIES.CHO_DI_DON) return;

    const hasTTag = Array.isArray(newTags) && newTags.some(t => /^T\d/.test(t.Name || t.name || ''));
    const currentSubState = orderData.subState;

    if (hasTTag && currentSubState !== 'CHO_HANG') {
        ProcessingTagState.updateOrder(orderId, { subState: 'CHO_HANG' });
        _ptagUpdateCellDOM(orderId);
        _ptagRenderPanelCards();
        _ptagSaveToApi(orderId, ProcessingTagState.getOrderData(orderId));
    } else if (!hasTTag && currentSubState !== 'OKIE_CHO_DI_DON') {
        ProcessingTagState.updateOrder(orderId, { subState: 'OKIE_CHO_DI_DON' });
        _ptagUpdateCellDOM(orderId);
        _ptagRenderPanelCards();
        _ptagSaveToApi(orderId, ProcessingTagState.getOrderData(orderId));
    }
}

/**
 * Hook: bill tạo thành công → auto chuyển sang 0.A HOÀN TẤT
 * Lưu snapshot vị trí cũ để rollback
 */
function onBillCreated(saleOnlineId, invoiceData) {
    const currentData = ProcessingTagState.getOrderData(saleOnlineId);
    if (!currentData) return;

    const snapshot = {
        category: currentData.category,
        subTag: currentData.subTag,
        subState: currentData.subState,
        flags: [...(currentData.flags || [])],
        note: currentData.note
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
    _ptagUpdateCellDOM(saleOnlineId);
    _ptagRenderPanelCards();
    _ptagSaveToApi(saleOnlineId, newData);
}

/**
 * Hook: bill bị hủy → auto trả về vị trí cũ kèm flags cũ
 */
function onBillCancelled(saleOnlineId) {
    const currentData = ProcessingTagState.getOrderData(saleOnlineId);
    if (!currentData?.previousPosition) return;

    const prev = currentData.previousPosition;
    const restoredData = {
        category: prev.category,
        subTag: prev.subTag,
        subState: prev.subState,
        flags: prev.flags,
        note: prev.note,
        assignedAt: Date.now(),
        previousPosition: null
    };

    ProcessingTagState.setOrderData(saleOnlineId, restoredData);
    _ptagUpdateCellDOM(saleOnlineId);
    _ptagRenderPanelCards();
    _ptagSaveToApi(saleOnlineId, restoredData);
}

// =====================================================
// [E] MIGRATION (old flat tags → new category system)
// =====================================================

/**
 * Migrate old format data to new format if needed
 * Old format: [{ key, category, note, assignedAt }] (array of flat tags)
 * New format: { category, subTag, subState, flags, note, assignedAt, previousPosition }
 */
function _ptagMigrateIfNeeded(raw) {
    // Already new format — has 'category' as a direct number property
    if (raw && typeof raw.category === 'number' && !Array.isArray(raw)) {
        return raw;
    }

    // Old format: array of tags → pick first tag and map
    if (Array.isArray(raw) && raw.length > 0) {
        const firstTag = raw[0];
        const mapped = PTAG_MIGRATION_MAP[firstTag.key];
        if (mapped) {
            return {
                category: mapped.category,
                subTag: mapped.subTag || null,
                subState: mapped.subState || null,
                flags: mapped.flags || [],
                note: firstTag.note || '',
                assignedAt: firstTag.assignedAt || Date.now(),
                previousPosition: null
            };
        }
    }

    // Unknown format, return as-is or null
    return raw || null;
}

// =====================================================
// [F] PANEL RENDERING
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

/**
 * Render panel cards — 5 categories with counts
 */
function _ptagRenderPanelCards() {
    const body = document.getElementById('ptagPanelBody');
    if (!body) return;

    const searchInput = document.getElementById('ptagPanelSearch');
    const searchTerm = _ptagRemoveDiacritics((searchInput?.value || '').trim().toLowerCase());

    const counts = _ptagGetCounts();
    const totalOrders = (typeof allData !== 'undefined' ? allData.length : 0);
    const noTagCount = Math.max(0, totalOrders - ProcessingTagState._orderData.size);

    let html = '';

    // TẤT CẢ card
    if (!searchTerm || _ptagRemoveDiacritics('tất cả').includes(searchTerm)) {
        html += _ptagRenderSpecialCard(null, 'TẤT CẢ', totalOrders, '#6b7280', 'fa-globe',
            ProcessingTagState._activeFilter === null);
    }

    // CHƯA GÁN card
    if (!searchTerm || _ptagRemoveDiacritics('chưa gán').includes(searchTerm)) {
        html += _ptagRenderSpecialCard('__no_tag__', 'CHƯA GÁN TAG', noTagCount, '#d1d5db', 'fa-tag',
            ProcessingTagState._activeFilter === '__no_tag__');
    }

    // Render each category
    [0, 1, 2, 3, 4].forEach(catId => {
        const catName = PTAG_CATEGORY_NAMES[catId];
        const catColor = PTAG_CATEGORY_COLORS[catId];
        const catIcon = PTAG_CATEGORY_ICONS[catId];
        const catCount = counts.byCategory[catId] || 0;
        const filterKey = `cat_${catId}`;
        const isActive = ProcessingTagState._activeFilter === filterKey;

        if (searchTerm && !_ptagRemoveDiacritics(catName.toLowerCase()).includes(searchTerm)) {
            // Check if any sub-items match
            const subItems = _ptagGetSubItemsForCategory(catId);
            const anyMatch = subItems.some(s => _ptagRemoveDiacritics(s.label.toLowerCase()).includes(searchTerm));
            if (!anyMatch) return;
        }

        // Category header (clickable to filter)
        html += `
            <div class="ptag-category-header ptag-category-${catId} ${isActive ? 'active' : ''}"
                 onclick="ptagSetFilter('${filterKey}')">
                <i class="fas ${catIcon}" style="font-size:12px;"></i>
                <span class="ptag-category-header-name">${catName}</span>
                <span class="ptag-category-header-count">${catCount}</span>
            </div>`;

        // Sub-items for category 1: sub-states + flags
        if (catId === 1) {
            // Sub-states
            Object.values(PTAG_SUBSTATES).forEach(sub => {
                if (searchTerm && !_ptagRemoveDiacritics(sub.label.toLowerCase()).includes(searchTerm)) return;
                const subCount = counts.bySubState[sub.key] || 0;
                const subFilterKey = `sub_${sub.key}`;
                const subActive = ProcessingTagState._activeFilter === subFilterKey;
                html += `
                    <div class="ptag-card ptag-sub-item ${subActive ? 'active' : ''}"
                         onclick="ptagSetFilter('${subFilterKey}')">
                        <div class="ptag-card-icon" style="background: ${sub.color};">
                            <i class="fas fa-dot-circle" style="font-size:11px;"></i>
                        </div>
                        <div class="ptag-card-info">
                            <div class="ptag-card-name">${sub.label}</div>
                            <div class="ptag-card-count">${subCount} đơn</div>
                        </div>
                    </div>`;
            });

            // Flags
            Object.values(PTAG_FLAGS).forEach(flag => {
                if (searchTerm && !_ptagRemoveDiacritics(flag.label.toLowerCase()).includes(searchTerm)) return;
                const flagCount = counts.byFlag[flag.key] || 0;
                if (flagCount === 0 && searchTerm) return;
                const flagFilterKey = `flag_${flag.key}`;
                const flagActive = ProcessingTagState._activeFilter === flagFilterKey;
                html += `
                    <div class="ptag-card ptag-flag-item ${flagActive ? 'active' : ''}"
                         onclick="ptagSetFilter('${flagFilterKey}')">
                        <div class="ptag-card-icon ptag-flag-icon">
                            <span>${flag.icon}</span>
                        </div>
                        <div class="ptag-card-info">
                            <div class="ptag-card-name">${flag.icon} ${flag.label}</div>
                            <div class="ptag-card-count">${flagCount} đơn</div>
                        </div>
                    </div>`;
            });
        }

        // Sub-items for categories 2, 3, 4: sub-tags
        if (catId >= 2) {
            const subTags = Object.values(PTAG_SUBTAGS).filter(s => s.category === catId);
            subTags.forEach(sub => {
                if (searchTerm && !_ptagRemoveDiacritics(sub.label.toLowerCase()).includes(searchTerm)) return;
                const subCount = counts.bySubTag[sub.key] || 0;
                const subFilterKey = `subtag_${sub.key}`;
                const subActive = ProcessingTagState._activeFilter === subFilterKey;
                html += `
                    <div class="ptag-card ptag-sub-item ${subActive ? 'active' : ''}"
                         onclick="ptagSetFilter('${subFilterKey}')">
                        <div class="ptag-card-icon" style="background: ${catColor.border};">
                            <i class="fas fa-tag" style="font-size:11px;"></i>
                        </div>
                        <div class="ptag-card-info">
                            <div class="ptag-card-name">${sub.label}</div>
                            <div class="ptag-card-count">${subCount} đơn</div>
                        </div>
                    </div>`;
            });
        }
    });

    // Tag T section
    html += _ptagRenderTTagSection();

    if (!html) {
        html = '<div style="text-align:center; padding:20px; color:#9ca3af; font-size:13px;">Không tìm thấy</div>';
    }

    body.innerHTML = html;
}

function _ptagRenderSpecialCard(filterKey, label, count, bgColor, icon, isActive) {
    return `
        <div class="ptag-card ${isActive ? 'active' : ''}"
             onclick="ptagSetFilter(${filterKey === null ? 'null' : "'" + filterKey + "'"})">
            <div class="ptag-card-icon" style="background: ${bgColor};">
                <i class="fas ${icon}" style="${bgColor === '#d1d5db' ? 'color:#6b7280;' : ''}"></i>
            </div>
            <div class="ptag-card-info">
                <div class="ptag-card-name">${label}</div>
                <div class="ptag-card-count">${count} đơn hàng</div>
            </div>
        </div>`;
}

/**
 * Render Tag T section — shows TPOS tags matching /^T\d/
 */
function _ptagRenderTTagSection() {
    if (typeof allData === 'undefined' || !allData.length) return '';

    // Collect T tags from all orders
    const tTagCounts = {};
    allData.forEach(order => {
        const tags = _ptagGetOrderTPOSTags(order.Id);
        if (!tags) return;
        tags.forEach(t => {
            const name = t.Name || t.name || '';
            if (/^T\d/.test(name)) {
                tTagCounts[name] = (tTagCounts[name] || 0) + 1;
            }
        });
    });

    const tTagNames = Object.keys(tTagCounts).sort();
    if (tTagNames.length === 0) return '';

    let html = `
        <div class="ptag-category-header ptag-ttag-header" style="border-left-color:#8b5cf6; background:rgba(139,92,246,0.08); margin-top:12px;">
            <i class="fas fa-boxes" style="font-size:12px; color:#6d28d9;"></i>
            <span class="ptag-category-header-name" style="color:#6d28d9;">TAG T CHỜ HÀNG</span>
            <span class="ptag-category-header-count" style="color:#6d28d9;">${tTagNames.length}</span>
        </div>`;

    tTagNames.forEach(name => {
        const filterKey = `ttag_${name}`;
        const isActive = ProcessingTagState._activeFilter === filterKey;
        html += `
            <div class="ptag-card ptag-sub-item ${isActive ? 'active' : ''}"
                 onclick="ptagSetFilter('${_ptagEscapeHtml(filterKey)}')">
                <div class="ptag-card-icon" style="background: #8b5cf6;">
                    <i class="fas fa-box" style="font-size:11px;"></i>
                </div>
                <div class="ptag-card-info">
                    <div class="ptag-card-name">${_ptagEscapeHtml(name)}</div>
                    <div class="ptag-card-count">${tTagCounts[name]} đơn</div>
                </div>
            </div>`;
    });

    return html;
}

function _ptagGetSubItemsForCategory(catId) {
    if (catId === 0) return [{ label: 'Hoàn tất' }];
    if (catId === 1) {
        return [
            ...Object.values(PTAG_SUBSTATES).map(s => ({ label: s.label })),
            ...Object.values(PTAG_FLAGS).map(f => ({ label: f.label }))
        ];
    }
    return Object.values(PTAG_SUBTAGS).filter(s => s.category === catId);
}

/**
 * Count orders per category, sub-state, flag, sub-tag
 */
function _ptagGetCounts() {
    const counts = {
        byCategory: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 },
        bySubState: {},
        byFlag: {},
        bySubTag: {}
    };

    Object.keys(PTAG_SUBSTATES).forEach(k => { counts.bySubState[k] = 0; });
    PTAG_FLAG_KEYS.forEach(k => { counts.byFlag[k] = 0; });
    Object.keys(PTAG_SUBTAGS).forEach(k => { counts.bySubTag[k] = 0; });

    ProcessingTagState._orderData.forEach(data => {
        const cat = data.category;
        if (counts.byCategory[cat] !== undefined) counts.byCategory[cat]++;

        if (cat === 1 && data.subState) {
            if (counts.bySubState[data.subState] !== undefined) counts.bySubState[data.subState]++;
            (data.flags || []).forEach(f => {
                if (counts.byFlag[f] !== undefined) counts.byFlag[f]++;
            });
        }

        if (data.subTag && counts.bySubTag[data.subTag] !== undefined) {
            counts.bySubTag[data.subTag]++;
        }
    });

    return counts;
}

// ===== PANEL FILTER ACTIONS =====

function ptagSetFilter(filterKey) {
    if (ProcessingTagState._activeFilter === filterKey) {
        // Toggle off
        ProcessingTagState._activeFilter = null;
    } else {
        ProcessingTagState._activeFilter = filterKey;
    }
    _ptagRenderPanelCards();

    if (typeof performTableSearch === 'function') {
        performTableSearch();
    }
}

function ptagFilterPanelSearch() {
    _ptagRenderPanelCards();
}

// Legacy compatibility
function ptagFilterByTag(tagKey) {
    ptagSetFilter(tagKey);
}

function ptagFilterByCategory(catId) {
    ptagSetFilter(`cat_${catId}`);
}

// =====================================================
// [G] TABLE CELL RENDERING
// =====================================================

/**
 * Render processing tag cell HTML for a given order
 * Called from createRowHTML() in tab1-table.js
 */
function renderProcessingTagCell(orderId, orderCode) {
    const data = ProcessingTagState.getOrderData(orderId);

    let contentHTML = '';

    if (!data) {
        // No tag — show assign button only
        contentHTML = '';
    } else if (data.category === PTAG_CATEGORIES.HOAN_TAT) {
        // 0.A — HOÀN TẤT
        contentHTML = `<span class="ptag-badge ptag-badge-hoantat">✓ Hoàn tất</span>`;
    } else if (data.category === PTAG_CATEGORIES.CHO_DI_DON) {
        // 0.C — CHỜ ĐI ĐƠN
        const subState = PTAG_SUBSTATES[data.subState] || PTAG_SUBSTATES.OKIE_CHO_DI_DON;
        contentHTML = `<span class="ptag-badge" style="background:${subState.color};">${subState.label}</span>`;

        // Show flag icons
        const flags = data.flags || [];
        if (flags.length > 0) {
            const flagIcons = flags.map(f => PTAG_FLAGS[f]?.icon || '').filter(Boolean).join('');
            contentHTML += `<span class="ptag-flags" title="${flags.map(f => PTAG_FLAGS[f]?.label || f).join(', ')}">${flagIcons}</span>`;
        }
    } else {
        // 2, 3, 4 — Sub-tag
        const catColor = PTAG_CATEGORY_COLORS[data.category];
        const subTagDef = PTAG_SUBTAGS[data.subTag];
        const label = subTagDef?.label || PTAG_CATEGORY_NAMES[data.category] || '';
        contentHTML = `<span class="ptag-badge" style="background:${catColor.border};">${label}</span>`;
    }

    return `<div class="ptag-cell">
        <div class="ptag-cell-actions">
            <button class="ptag-cell-btn" onclick="openPtagDropdown('${orderId}', event); event.stopPropagation();" title="Gán Tag Xử Lý">
                <i class="fas fa-tasks"></i>
            </button>
            ${data ? `<button class="ptag-cell-btn ptag-cell-btn-clear" onclick="clearProcessingTags('${orderId}'); event.stopPropagation();" title="Xóa tag">
                <i class="fas fa-times" style="font-size:9px;"></i>
            </button>` : ''}
        </div>
        <div class="ptag-badges" id="ptagBadges_${orderId}">${contentHTML}</div>
    </div>`;
}

/**
 * Update only the badges DOM for a specific order (no full re-render)
 */
function _ptagUpdateCellDOM(orderId) {
    const container = document.getElementById(`ptagBadges_${orderId}`);
    if (!container) return;

    const data = ProcessingTagState.getOrderData(orderId);
    let html = '';

    if (!data) {
        html = '';
    } else if (data.category === PTAG_CATEGORIES.HOAN_TAT) {
        html = `<span class="ptag-badge ptag-badge-hoantat">✓ Hoàn tất</span>`;
    } else if (data.category === PTAG_CATEGORIES.CHO_DI_DON) {
        const subState = PTAG_SUBSTATES[data.subState] || PTAG_SUBSTATES.OKIE_CHO_DI_DON;
        html = `<span class="ptag-badge" style="background:${subState.color};">${subState.label}</span>`;
        const flags = data.flags || [];
        if (flags.length > 0) {
            const flagIcons = flags.map(f => PTAG_FLAGS[f]?.icon || '').filter(Boolean).join('');
            html += `<span class="ptag-flags" title="${flags.map(f => PTAG_FLAGS[f]?.label || f).join(', ')}">${flagIcons}</span>`;
        }
    } else {
        const catColor = PTAG_CATEGORY_COLORS[data.category];
        const subTagDef = PTAG_SUBTAGS[data.subTag];
        const label = subTagDef?.label || '';
        html = `<span class="ptag-badge" style="background:${catColor.border};">${label}</span>`;
    }

    container.innerHTML = html;

    // Update clear button visibility
    const cell = container.closest('.ptag-cell');
    if (cell) {
        const clearBtn = cell.querySelector('.ptag-cell-btn-clear');
        if (data && !clearBtn) {
            const actionsDiv = cell.querySelector('.ptag-cell-actions');
            if (actionsDiv) {
                const btn = document.createElement('button');
                btn.className = 'ptag-cell-btn ptag-cell-btn-clear';
                btn.title = 'Xóa tag';
                btn.onclick = (e) => { clearProcessingTags(orderId); e.stopPropagation(); };
                btn.innerHTML = '<i class="fas fa-times" style="font-size:9px;"></i>';
                actionsDiv.appendChild(btn);
            }
        } else if (!data && clearBtn) {
            clearBtn.remove();
        }
    }
}

// =====================================================
// [H] CATEGORY/FLAG ASSIGN DROPDOWN
// =====================================================

let _ptagDropdownOrderId = null;

function openPtagDropdown(orderId, event) {
    closePtagDropdown();
    _ptagDropdownOrderId = orderId;

    const rect = event.target.closest('button').getBoundingClientRect();
    const currentData = ProcessingTagState.getOrderData(orderId);

    // Build dropdown HTML — choose category first, then sub-tag/flags
    let html = `
        <div class="ptag-dropdown-header">
            <span>Chọn trạng thái đơn</span>
            <span style="font-size:11px; color:#9ca3af; cursor:pointer;" onclick="clearProcessingTags('${orderId}'); closePtagDropdown();">Xóa hết</span>
        </div>
        <div class="ptag-dropdown-search">
            <input type="text" placeholder="Tìm..." oninput="_ptagDropdownFilter(this.value)" />
        </div>
        <div class="ptag-dropdown-body">`;

    // Category 1 — CHỜ ĐI ĐƠN (OKE) → assign directly, flags shown separately
    const cat1Active = currentData?.category === 1;
    html += `<div class="ptag-dropdown-category">CHỜ ĐI ĐƠN (OKE)</div>`;
    html += `<div class="ptag-dropdown-item ${cat1Active ? 'selected' : ''}"
                 onclick="_ptagDropdownAssignCategory('${orderId}', 1)" data-ptag-label="Okie Chờ Đi Đơn">
                <span class="ptag-dropdown-item-dot" style="background:#3b82f6;"></span>
                <span>Okie Chờ Đi Đơn</span>
                ${cat1Active ? '<span class="ptag-dropdown-item-check"><i class="fas fa-check"></i></span>' : ''}
            </div>`;

    // If currently in cat 1, show flags section
    if (cat1Active) {
        html += `<div class="ptag-dropdown-category" style="color:#3b82f6;">── FLAGS ──</div>`;
        const currentFlags = currentData.flags || [];
        Object.values(PTAG_FLAGS).forEach(flag => {
            const hasFlag = currentFlags.includes(flag.key);
            html += `<div class="ptag-dropdown-item ${hasFlag ? 'selected' : ''}"
                         onclick="_ptagDropdownToggleFlag('${orderId}', '${flag.key}')" data-ptag-label="${flag.label}">
                        <span style="font-size:14px; width:18px; text-align:center;">${flag.icon}</span>
                        <span>${flag.label}${flag.auto ? ' <small style="color:#9ca3af;">(auto)</small>' : ''}</span>
                        ${hasFlag ? '<span class="ptag-dropdown-item-check"><i class="fas fa-check"></i></span>' : ''}
                    </div>`;
        });
    }

    // Category 2 — MỤC XỬ LÝ
    html += `<div class="ptag-dropdown-category">MỤC XỬ LÝ</div>`;
    Object.values(PTAG_SUBTAGS).filter(s => s.category === 2).forEach(sub => {
        const isActive = currentData?.category === 2 && currentData?.subTag === sub.key;
        html += `<div class="ptag-dropdown-item ${isActive ? 'selected' : ''}"
                     onclick="_ptagDropdownAssignSubTag('${orderId}', 2, '${sub.key}', ${sub.hasNote || false})" data-ptag-label="${sub.label}">
                    <span class="ptag-dropdown-item-dot" style="background:#f59e0b;"></span>
                    <span>${sub.label}</span>
                    ${isActive ? '<span class="ptag-dropdown-item-check"><i class="fas fa-check"></i></span>' : ''}
                </div>`;
    });

    // Category 3 — MỤC KHÔNG CẦN CHỐT
    html += `<div class="ptag-dropdown-category">KHÔNG CẦN CHỐT</div>`;
    Object.values(PTAG_SUBTAGS).filter(s => s.category === 3).forEach(sub => {
        const isActive = currentData?.category === 3 && currentData?.subTag === sub.key;
        html += `<div class="ptag-dropdown-item ${isActive ? 'selected' : ''}"
                     onclick="_ptagDropdownAssignSubTag('${orderId}', 3, '${sub.key}', false)" data-ptag-label="${sub.label}">
                    <span class="ptag-dropdown-item-dot" style="background:#6b7280;"></span>
                    <span>${sub.label}</span>
                    ${isActive ? '<span class="ptag-dropdown-item-check"><i class="fas fa-check"></i></span>' : ''}
                </div>`;
    });

    // Category 4 — MỤC KHÁCH XÃ
    html += `<div class="ptag-dropdown-category">KHÁCH XÃ SAU CHỐT</div>`;
    Object.values(PTAG_SUBTAGS).filter(s => s.category === 4).forEach(sub => {
        const isActive = currentData?.category === 4 && currentData?.subTag === sub.key;
        html += `<div class="ptag-dropdown-item ${isActive ? 'selected' : ''}"
                     onclick="_ptagDropdownAssignSubTag('${orderId}', 4, '${sub.key}', false)" data-ptag-label="${sub.label}">
                    <span class="ptag-dropdown-item-dot" style="background:#ef4444;"></span>
                    <span>${sub.label}</span>
                    ${isActive ? '<span class="ptag-dropdown-item-check"><i class="fas fa-check"></i></span>' : ''}
                </div>`;
    });

    html += `</div>`;

    // Position dropdown
    let top = rect.bottom + 4;
    let left = rect.left;
    if (top + 480 > window.innerHeight) top = rect.top - 480;
    if (top < 0) top = 4;
    if (left + 300 > window.innerWidth) left = window.innerWidth - 310;

    const overlayEl = document.createElement('div');
    overlayEl.className = 'ptag-dropdown-overlay';
    overlayEl.onclick = closePtagDropdown;
    overlayEl.id = 'ptagDropdownOverlay';

    const dropdownEl = document.createElement('div');
    dropdownEl.className = 'ptag-dropdown';
    dropdownEl.id = 'ptagDropdown';
    dropdownEl.style.top = `${top}px`;
    dropdownEl.style.left = `${left}px`;
    dropdownEl.innerHTML = html;

    document.body.appendChild(overlayEl);
    document.body.appendChild(dropdownEl);

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

function _ptagDropdownAssignCategory(orderId, category) {
    assignOrderCategory(orderId, category);
    // Reopen dropdown to show flags for category 1
    if (category === 1) {
        setTimeout(() => {
            const btn = document.querySelector(`#ptagBadges_${orderId}`)?.closest('.ptag-cell')?.querySelector('.ptag-cell-btn');
            if (btn) btn.click();
        }, 100);
    } else {
        closePtagDropdown();
    }
}

function _ptagDropdownAssignSubTag(orderId, category, subTag, needsNote) {
    let note = '';
    if (needsNote) {
        note = prompt('Ghi chú:');
        if (note === null) return;
    }
    assignOrderCategory(orderId, category, { subTag, note });
    closePtagDropdown();
}

function _ptagDropdownToggleFlag(orderId, flagKey) {
    toggleOrderFlag(orderId, flagKey);
    // Reopen to refresh flag checkmarks
    setTimeout(() => {
        const btn = document.querySelector(`#ptagBadges_${orderId}`)?.closest('.ptag-cell')?.querySelector('.ptag-cell-btn');
        if (btn) btn.click();
    }, 100);
}

function _ptagDropdownFilter(searchText) {
    const dropdown = document.getElementById('ptagDropdown');
    if (!dropdown) return;

    const term = _ptagRemoveDiacritics(searchText.trim().toLowerCase());
    const items = dropdown.querySelectorAll('.ptag-dropdown-item');
    const categories = dropdown.querySelectorAll('.ptag-dropdown-category');

    items.forEach(item => {
        const label = _ptagRemoveDiacritics((item.getAttribute('data-ptag-label') || item.textContent).trim().toLowerCase());
        item.style.display = (!term || label.includes(term)) ? '' : 'none';
    });

    categories.forEach(catEl => {
        let next = catEl.nextElementSibling;
        let hasVisible = false;
        while (next && !next.classList.contains('ptag-dropdown-category')) {
            if (next.style.display !== 'none' && next.classList.contains('ptag-dropdown-item')) hasVisible = true;
            next = next.nextElementSibling;
        }
        catEl.style.display = hasVisible ? '' : 'none';
    });
}

// =====================================================
// [I] BULK ASSIGNMENT
// =====================================================

function openPtagBulkModal() {
    const modal = document.getElementById('ptagBulkModal');
    if (!modal) return;
    modal.classList.add('show');
    _ptagRenderBulkOptions();
}

function closePtagBulkModal() {
    const modal = document.getElementById('ptagBulkModal');
    if (modal) modal.classList.remove('show');
}

function _ptagRenderBulkOptions() {
    const container = document.getElementById('ptagBulkTagList');
    if (!container) return;

    let html = '';

    // Category 1 — OKE
    html += `<div class="ptag-bulk-section-title" style="color:#1e40af; border-bottom:2px solid #3b82f6;">CHỜ ĐI ĐƠN (OKE)</div>`;
    html += `<label class="ptag-bulk-option"><input type="radio" name="ptagBulkCat" value="cat_1" /> Okie Chờ Đi Đơn</label>`;

    // Category 2 — XỬ LÝ
    html += `<div class="ptag-bulk-section-title" style="color:#92400e; border-bottom:2px solid #f59e0b;">MỤC XỬ LÝ</div>`;
    Object.values(PTAG_SUBTAGS).filter(s => s.category === 2).forEach(sub => {
        html += `<label class="ptag-bulk-option"><input type="radio" name="ptagBulkCat" value="subtag_${sub.key}" /> ${sub.label}</label>`;
    });

    // Category 3 — KHÔNG CẦN CHỐT
    html += `<div class="ptag-bulk-section-title" style="color:#374151; border-bottom:2px solid #6b7280;">KHÔNG CẦN CHỐT</div>`;
    Object.values(PTAG_SUBTAGS).filter(s => s.category === 3).forEach(sub => {
        html += `<label class="ptag-bulk-option"><input type="radio" name="ptagBulkCat" value="subtag_${sub.key}" /> ${sub.label}</label>`;
    });

    // Category 4 — KHÁCH XÃ
    html += `<div class="ptag-bulk-section-title" style="color:#991b1b; border-bottom:2px solid #ef4444;">KHÁCH XÃ SAU CHỐT</div>`;
    Object.values(PTAG_SUBTAGS).filter(s => s.category === 4).forEach(sub => {
        html += `<label class="ptag-bulk-option"><input type="radio" name="ptagBulkCat" value="subtag_${sub.key}" /> ${sub.label}</label>`;
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

    // Get selected option
    const selectedRadio = document.querySelector('input[name="ptagBulkCat"]:checked');
    if (!selectedRadio) {
        alert('Vui lòng chọn trạng thái');
        return;
    }

    const selectedValue = selectedRadio.value;

    // Find matching orders
    const matchingOrders = (typeof allData !== 'undefined' ? allData : []).filter(o => {
        const stt = parseInt(o.SessionIndex);
        return !isNaN(stt) && sttSet.has(stt);
    });

    if (matchingOrders.length === 0) {
        alert('Không tìm thấy đơn nào với STT đã nhập');
        return;
    }

    // Parse selected value
    let category, subTag = null;
    if (selectedValue === 'cat_1') {
        category = 1;
    } else if (selectedValue.startsWith('subtag_')) {
        const subTagKey = selectedValue.replace('subtag_', '');
        const subTagDef = PTAG_SUBTAGS[subTagKey];
        if (!subTagDef) return;
        category = subTagDef.category;
        subTag = subTagKey;
    }

    // Assign to all matching orders
    let assignCount = 0;
    for (const order of matchingOrders) {
        await assignOrderCategory(order.Id, category, { subTag });
        assignCount++;
    }

    closePtagBulkModal();
    alert(`Đã gán trạng thái cho ${assignCount} đơn hàng`);
}

// =====================================================
// [J] FILTER INTEGRATION
// =====================================================

/**
 * Get active processing tag filter
 */
window.getActiveProcessingTagFilter = function () {
    if (ProcessingTagState._activeFilter) {
        return { type: 'active', value: ProcessingTagState._activeFilter };
    }
    return null;
};

/**
 * Check if an order passes the processing tag filter
 */
window.orderPassesProcessingTagFilter = function (orderId) {
    const filter = ProcessingTagState._activeFilter;
    if (!filter) return true;

    const data = ProcessingTagState.getOrderData(orderId);

    // Special filters
    if (filter === '__no_tag__') return !data;

    // Category filter: cat_0, cat_1, cat_2, cat_3, cat_4
    if (filter.startsWith('cat_')) {
        const catId = parseInt(filter.replace('cat_', ''));
        return data?.category === catId;
    }

    // Sub-state filter: sub_OKIE_CHO_DI_DON, sub_CHO_HANG
    if (filter.startsWith('sub_')) {
        const subKey = filter.replace('sub_', '');
        return data?.category === 1 && data?.subState === subKey;
    }

    // Flag filter: flag_CHUYEN_KHOAN, flag_QUA_LAY, etc.
    if (filter.startsWith('flag_')) {
        const flagKey = filter.replace('flag_', '');
        return data?.category === 1 && (data?.flags || []).includes(flagKey);
    }

    // Sub-tag filter: subtag_CHUA_PHAN_HOI, etc.
    if (filter.startsWith('subtag_')) {
        const subTagKey = filter.replace('subtag_', '');
        return data?.subTag === subTagKey;
    }

    // Tag T filter: ttag_T1 Áo smi trắng, etc.
    if (filter.startsWith('ttag_')) {
        const tTagName = filter.replace('ttag_', '');
        const tags = _ptagGetOrderTPOSTags(orderId);
        return tags?.some(t => (t.Name || t.name || '') === tTagName);
    }

    return true;
};

// =====================================================
// [K] UTILITIES
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

/**
 * Get order phone from allData
 */
function _ptagGetOrderPhone(orderId) {
    if (typeof allData === 'undefined') return null;
    const order = allData.find(o => o.Id === orderId);
    return order?.Telephone || null;
}

/**
 * Get order by ID from allData
 */
function _ptagGetOrderById(orderId) {
    if (typeof allData === 'undefined') return null;
    return allData.find(o => o.Id === orderId) || null;
}

/**
 * Get TPOS tags for an order (from availableTags or tag realtime data)
 */
function _ptagGetOrderTPOSTags(orderId) {
    // Try to get from the global tag state if available
    if (typeof window.getOrderTagsData === 'function') {
        return window.getOrderTagsData(orderId);
    }
    // Fallback: try order data
    const order = _ptagGetOrderById(orderId);
    return order?.Tags || null;
}

// =====================================================
// BACKWARD COMPATIBILITY — expose old function names
// =====================================================

// Old assignProcessingTag → new assignOrderCategory with migration
async function assignProcessingTag(orderId, tagKey, note) {
    // Map old tag key to new category system
    const mapped = PTAG_MIGRATION_MAP[tagKey];
    if (mapped) {
        await assignOrderCategory(orderId, mapped.category, {
            subTag: mapped.subTag || null,
            flags: mapped.flags || [],
            note: note || ''
        });
    }
}

// Old removeProcessingTag → clear entire tag
async function removeProcessingTag(orderId, tagKey) {
    await clearProcessingTags(orderId);
}

// =====================================================
// EXPOSE TO WINDOW
// =====================================================

window.renderProcessingTagCell = renderProcessingTagCell;
window.assignProcessingTag = assignProcessingTag;
window.assignOrderCategory = assignOrderCategory;
window.toggleOrderFlag = toggleOrderFlag;
window.removeProcessingTag = removeProcessingTag;
window.clearProcessingTags = clearProcessingTags;
window.openPtagDropdown = openPtagDropdown;
window.closePtagDropdown = closePtagDropdown;
window.ptagSetFilter = ptagSetFilter;
window.ptagFilterByTag = ptagFilterByTag;
window.ptagFilterByCategory = ptagFilterByCategory;
window.ptagFilterPanelSearch = ptagFilterPanelSearch;
window.toggleProcessingTagPanel = toggleProcessingTagPanel;
window.openProcessingTagPanel = openProcessingTagPanel;
window.closeProcessingTagPanel = closeProcessingTagPanel;
window.togglePinProcessingTagPanel = togglePinProcessingTagPanel;
window.openPtagBulkModal = openPtagBulkModal;
window.closePtagBulkModal = closePtagBulkModal;
window.savePtagBulk = savePtagBulk;
window.loadProcessingTags = loadProcessingTags;
window.loadTagDefinitions = loadTagDefinitions;
window.setupProcessingTagRealtimeListeners = setupProcessingTagRealtimeListeners;
window.initProcessingTagPanel = initProcessingTagPanel;
window.onOrderTagsChanged = onOrderTagsChanged;
window.onBillCreated = onBillCreated;
window.onBillCancelled = onBillCancelled;
window.ProcessingTagState = ProcessingTagState;

// Expose dropdown internal functions for onclick handlers in HTML
window._ptagDropdownAssignCategory = _ptagDropdownAssignCategory;
window._ptagDropdownAssignSubTag = _ptagDropdownAssignSubTag;
window._ptagDropdownToggleFlag = _ptagDropdownToggleFlag;
window._ptagDropdownFilter = _ptagDropdownFilter;
