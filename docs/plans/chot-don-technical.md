# Đặc Tả Kỹ Thuật — Redesign Tag Xử Lý Chốt Đơn (Tab 1)

> Chi tiết database, cấu trúc dữ liệu, hàm, code, integration points

---

## 1. Data Structure

### Processing Tag per order (PostgreSQL via Realtime API)

```
Cũ:
{
    key: 'DI_DON',           // Tag key (flat)
    category: 1,             // Category ID
    note: '',                // Optional note
    assignedAt: timestamp
}

Mới:
{
    category: number,         // 0=Hoàn tất, 1=Chờ đi đơn, 2=Xử lý, 3=Ko cần chốt, 4=Khách xã
    subTag: string|null,      // Sub-tag key cho cat 2,3,4 (VD: 'CHUA_PHAN_HOI', 'GIO_TRONG')
    subState: string|null,    // Chỉ cho cat 1: 'OKIE_CHO_DI_DON' | 'CHO_HANG' (auto từ tag T)
    flags: string[],          // Chỉ cho cat 1: ['CHUYEN_KHOAN', 'QUA_LAY', ...]
    note: string,             // Ghi chú tự do
    assignedAt: number,       // Timestamp gắn tag
    previousPosition: {       // Snapshot cho rollback khi hủy bill
        category: number,
        subTag: string|null,
        subState: string|null,
        flags: string[],
        note: string
    } | null
}
```

---

## 2. Constants

```javascript
// ===== CATEGORIES =====
const PTAG_CATEGORIES = {
    HOAN_TAT: 0,        // 0.A
    CHO_DI_DON: 1,      // 0.C
    XU_LY: 2,           // 2
    KHONG_CAN_CHOT: 3,  // 3
    KHACH_XA: 4          // 4
};

const PTAG_CATEGORY_NAMES = {
    0: 'HOÀN TẤT — ĐÃ RA ĐƠN',
    1: 'CHỜ ĐI ĐƠN (OKE)',
    2: 'MỤC XỬ LÝ',
    3: 'MỤC KHÔNG CẦN CHỐT',
    4: 'MỤC KHÁCH XÃ SAU CHỐT'
};

const PTAG_CATEGORY_COLORS = {
    0: { bg: 'rgba(16,185,129,0.12)', border: '#10b981', text: '#065f46' },  // Green
    1: { bg: 'rgba(59,130,246,0.08)', border: '#3b82f6', text: '#1e40af' },  // Blue
    2: { bg: 'rgba(245,158,11,0.08)', border: '#f59e0b', text: '#92400e' },  // Orange
    3: { bg: 'rgba(107,114,128,0.08)', border: '#6b7280', text: '#374151' }, // Gray
    4: { bg: 'rgba(239,68,68,0.08)', border: '#ef4444', text: '#991b1b' }    // Red
};

// ===== SUB-STATES cho Category 1 (0.C) =====
const PTAG_SUBSTATES = {
    OKIE_CHO_DI_DON: { key: 'OKIE_CHO_DI_DON', label: 'Okie Chờ Đi Đơn', color: '#3b82f6' },
    CHO_HANG:        { key: 'CHO_HANG',         label: 'Chờ Hàng',         color: '#f59e0b' }
};

// ===== FLAGS cho Category 1 (0.C) =====
const PTAG_FLAGS = {
    TRU_CONG_NO:  { key: 'TRU_CONG_NO',  label: 'Trừ công nợ', auto: true,  icon: '💰' },
    CHUYEN_KHOAN: { key: 'CHUYEN_KHOAN', label: 'CK',          auto: true,  icon: '💳' },
    GIAM_GIA:     { key: 'GIAM_GIA',     label: 'Giảm giá',    auto: true,  icon: '🏷️' },
    CHO_LIVE:     { key: 'CHO_LIVE',     label: 'Chờ live',    auto: false, icon: '📺' },
    GIU_DON:      { key: 'GIU_DON',      label: 'Giữ đơn',     auto: false, icon: '⏳' },
    QUA_LAY:      { key: 'QUA_LAY',      label: 'Qua lấy',     auto: false, icon: '🏠' },
    KHAC:         { key: 'KHAC',         label: 'Khác',        auto: false, icon: '📋', hasNote: true }
};

// ===== SUB-TAGS cho Categories 2, 3, 4 =====
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
```

---

## 3. Các hàm chính

### 3.1 Auto-detect flags (tab1-processing-tags.js)

```javascript
/**
 * Auto-detect flags khi seller gắn đơn vào 0.C
 * - Check ví khách → CK, Công nợ
 * - Check order data → Giảm giá
 * - Không đánh trùng: nếu flag đã có rồi → bỏ qua
 * - User vẫn đánh tay được bất kỳ flag nào
 *
 * @param {string} orderId
 * @param {string} phone - SĐT khách hàng
 * @returns {string[]} - Danh sách flag keys MỚI cần thêm
 *
 * Dùng lại:
 *   - getWallet(phone) từ orders-report/js/utils/wallet-integration.js
 *   - Phone debt cache từ orders-report/js/tab1/tab1-qr-debt.js
 */
async function autoDetectFlags(orderId, phone) {
    const existingFlags = ProcessingTagState.getOrderFlags(orderId) || [];
    const newFlags = [];

    // 1. Check wallet → CK + Công nợ
    try {
        const wallet = await getWallet(phone);
        if (wallet?.balance > 0 && !existingFlags.includes('CHUYEN_KHOAN')) {
            newFlags.push('CHUYEN_KHOAN');
        }
        if (wallet?.virtual_balance > 0 && !existingFlags.includes('TRU_CONG_NO')) {
            newFlags.push('TRU_CONG_NO');
        }
    } catch (e) {
        console.warn('autoDetectFlags: wallet check failed', e);
    }

    // 2. Check order data → Giảm giá
    try {
        const order = getOrderById(orderId);
        if (order?.Discount > 0 && !existingFlags.includes('GIAM_GIA')) {
            newFlags.push('GIAM_GIA');
        }
    } catch (e) {
        console.warn('autoDetectFlags: order check failed', e);
    }

    return newFlags;
}
```

### 3.2 Auto sub-state từ tag T (tab1-processing-tags.js)

```javascript
/**
 * Watch TPOS tag changes → auto chuyển sub-state trong 0.C
 * - Có tag T (match /^T\d/) → sub-state "CHO_HANG"
 * - Không có tag T → sub-state "OKIE_CHO_DI_DON"
 * - Chỉ xử lý đơn đang ở category 1 (0.C)
 *
 * @param {string} orderId
 * @param {Array} newTags - TPOS tags mới của order
 *
 * Dùng lại:
 *   - Tag realtime listener từ orders-report/js/tab1/tab1-tags.js
 */
function onOrderTagsChanged(orderId, newTags) {
    const orderData = ProcessingTagState.getOrderData(orderId);
    if (!orderData || orderData.category !== PTAG_CATEGORIES.CHO_DI_DON) return;

    const hasTTag = Array.isArray(newTags) && newTags.some(t => /^T\d/.test(t.Name));
    const currentSubState = orderData.subState;

    if (hasTTag && currentSubState !== 'CHO_HANG') {
        ProcessingTagState.updateOrder(orderId, { subState: 'CHO_HANG' });
    } else if (!hasTTag && currentSubState !== 'OKIE_CHO_DI_DON') {
        ProcessingTagState.updateOrder(orderId, { subState: 'OKIE_CHO_DI_DON' });
    }
}
```

### 3.3 Assign category (tab1-processing-tags.js)

```javascript
/**
 * Gắn đơn vào category + tự động detect flags
 * Thay thế hàm assignProcessingTag cũ
 *
 * @param {string} orderId
 * @param {number} category - Category ID (0-4)
 * @param {object} options - { subTag, flags, note }
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
        const orderTags = getOrderTags(orderId);
        const hasTTag = orderTags?.some(t => /^T\d/.test(t.Name));
        data.subState = hasTTag ? 'CHO_HANG' : 'OKIE_CHO_DI_DON';

        // Auto-detect flags (merge, no duplicates)
        const phone = getOrderPhone(orderId);
        if (phone) {
            const autoFlags = await autoDetectFlags(orderId, phone);
            data.flags = [...new Set([...data.flags, ...autoFlags])];
        }
    }

    ProcessingTagState.setOrderData(orderId, data);
    await saveProcessingTagToAPI(orderId, data);
}
```

### 3.4 Auto-transition bill (tab1-fast-sale-workflow.js)

```javascript
/**
 * Hook: bill tạo thành công → auto chuyển sang 0.A HOÀN TẤT
 * Lưu snapshot vị trí cũ để rollback
 *
 * Dùng lại:
 *   - InvoiceStatusStore từ orders-report/js/tab1/tab1-fast-sale-invoice-status.js
 *   - ProcessingTagState từ orders-report/js/tab1/tab1-processing-tags.js
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

    ProcessingTagState.setOrderData(saleOnlineId, {
        category: PTAG_CATEGORIES.HOAN_TAT,
        subTag: null,
        subState: null,
        flags: [],
        note: '',
        assignedAt: Date.now(),
        previousPosition: snapshot
    });
}

/**
 * Hook: bill bị hủy → auto trả về vị trí cũ kèm flags cũ
 */
function onBillCancelled(saleOnlineId) {
    const currentData = ProcessingTagState.getOrderData(saleOnlineId);
    if (!currentData?.previousPosition) return;

    const prev = currentData.previousPosition;
    ProcessingTagState.setOrderData(saleOnlineId, {
        category: prev.category,
        subTag: prev.subTag,
        subState: prev.subState,
        flags: prev.flags,
        note: prev.note,
        assignedAt: Date.now(),
        previousPosition: null
    });
}
```

### 3.5 Render cell tag xử lý (tab1-table.js)

```javascript
/**
 * Render cell tag xử lý mới:
 * - Category 0: badge "Hoàn tất" xanh lá
 * - Category 1: sub-state badge + flag icons
 * - Category 2,3,4: sub-tag label + category color
 */
function renderProcessingTagCell(orderId, orderCode) {
    const data = ProcessingTagState.getOrderData(orderId);
    if (!data) return renderEmptyTagCell(orderId, orderCode);

    const catColor = PTAG_CATEGORY_COLORS[data.category];

    // 0.A — HOÀN TẤT
    if (data.category === 0) {
        return `<span class="ptag-badge ptag-hoan-tat">Hoàn tất</span>`;
    }

    // 0.C — CHỜ ĐI ĐƠN
    if (data.category === 1) {
        const subStateLabel = PTAG_SUBSTATES[data.subState]?.label || 'Okie Chờ Đi Đơn';
        const subStateColor = PTAG_SUBSTATES[data.subState]?.color || '#3b82f6';
        const flagIcons = (data.flags || [])
            .map(f => PTAG_FLAGS[f]?.icon || '')
            .filter(Boolean)
            .join(' ');
        return `
            <span class="ptag-badge" style="border-color:${subStateColor}">${subStateLabel}</span>
            ${flagIcons ? `<span class="ptag-flags">${flagIcons}</span>` : ''}
        `;
    }

    // 2,3,4 — Sub-tag
    const subTagDef = PTAG_SUBTAGS[data.subTag];
    return `<span class="ptag-badge" style="border-color:${catColor.border}">${subTagDef?.label || ''}</span>`;
}
```

### 3.6 Tag T section trong panel (tab1-processing-tags.js)

```javascript
/**
 * Render section Tag T chờ hàng trong panel bên phải
 * - Hiện danh sách tag T với số đơn đang chờ mỗi tag
 * - Duyên: thêm/sửa/xóa tag T (qua bulk-tag system hiện có)
 * - Seller: chỉ xem, click filter đơn theo tag T
 *
 * Dùng lại:
 *   - loadAvailableTags() từ orders-report/js/tab1/tab1-tags.js
 *   - setActiveFilter() từ orders-report/js/tab1/tab1-processing-tags.js
 */
function renderTTagSection() {
    // 1. Lọc TPOS tags match /^T\d/
    // 2. Group by tag name
    // 3. Count orders per tag
    // 4. Render cards: tag name + count + click to filter
}
```

---

## 4. Integration Points (Hook vào code hiện tại)

| Hook point | File | Vị trí | Gọi hàm |
|---|---|---|---|
| Bill tạo thành công | `tab1-fast-sale-invoice-status.js` | `InvoiceStatusStore.set()` | `onBillCreated(saleOnlineId, data)` |
| Bill bị hủy | `tab1-fast-sale-workflow.js` | `showCancelOrderModal` → confirm callback | `onBillCancelled(saleOnlineId)` |
| TPOS tag thay đổi | `tab1-tags.js` | `setupTagRealtimeListeners` | `onOrderTagsChanged(orderId, newTags)` |
| Seller gắn vào 0.C | `tab1-processing-tags.js` | `assignProcessingTag` (đổi thành `assignOrderCategory`) | Auto-detect flags |

---

## 5. File cần sửa

| # | File | Scope |
|---|---|---|
| 1 | `orders-report/js/tab1/tab1-processing-tags.js` | **Major**: Constants, state, UI panel, flag system, auto-detect, tag T section |
| 2 | `orders-report/css/tab1-processing-tags.css` | **Medium**: Style flags, sub-state, 0.A badge, tag T section |
| 3 | `orders-report/js/tab1/tab1-fast-sale-workflow.js` | **Medium**: Hook onBillCreated/onBillCancelled |
| 4 | `orders-report/js/tab1/tab1-fast-sale-invoice-status.js` | **Small**: Hook call khi set() |
| 5 | `orders-report/js/tab1/tab1-table.js` | **Medium**: renderProcessingTagCell mới |
| 6 | `orders-report/js/tab1/tab1-tags.js` | **Small**: Hook onOrderTagsChanged |

## 6. Existing code to reuse

| Cần dùng | File | Hàm/Object |
|---|---|---|
| Wallet data | `orders-report/js/utils/wallet-integration.js` | `getWallet(phone)` |
| Debt cache | `orders-report/js/tab1/tab1-qr-debt.js` | Phone debt cache |
| Invoice store | `orders-report/js/tab1/tab1-fast-sale-invoice-status.js` | `InvoiceStatusStore` |
| Processing tag API | Backend (giữ nguyên) | PostgreSQL + SSE endpoints |
| Bulk tag | `orders-report/js/tab1/tab1-bulk-tags.js` | Tag T bulk assignment |
| Tag realtime | `orders-report/js/tab1/tab1-tags.js` | `setupTagRealtimeListeners` |

---

## 7. API Backend

Backend **giữ nguyên endpoints**, chỉ data shape thay đổi:

```
GET    /api/realtime/processing-tags/{campaignId}              → data mới
PUT    /api/realtime/processing-tags/{campaignId}/{orderId}     → nhận data mới
DELETE /api/realtime/processing-tags/{campaignId}/{orderId}     → giữ nguyên
SSE    /api/realtime/sse                                        → giữ nguyên
```

Backend lưu JSON, không validate business logic → **không cần sửa backend**.

---

## 8. Migration data cũ → mới

```javascript
const MIGRATION_MAP = {
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

function migrateOldProcessingTag(oldData) {
    if (!oldData?.key) return oldData; // Already new format
    const mapped = MIGRATION_MAP[oldData.key];
    if (!mapped) return oldData;

    return {
        category: mapped.category,
        subTag: mapped.subTag || null,
        subState: mapped.subState || null,
        flags: mapped.flags || [],
        note: oldData.note || '',
        assignedAt: oldData.assignedAt || Date.now(),
        previousPosition: null
    };
}
```

---

## 9. Verification Checklist

1. **Test flow seller**: Đơn mới (chưa có tag) → seller liên hệ khách → gắn đúng category/sub-tag
2. **Test auto-detect flags**: Gắn vào 0.C → CK/CN auto từ wallet, không trùng, user đánh tay OK
3. **Test tag T auto sub-state**: Duyên gắn tag T → "Chờ Hàng", tháo hết T → "Okie Chờ Đi Đơn"
4. **Test auto-transition**: Ra bill → auto 0.A, hủy bill → rollback 0.C kèm flags cũ
5. **Test filter**: Filter theo category, sub-state, flag, tag T
6. **Test realtime**: 2 seller cùng thao tác → SSE sync đúng
7. **Test migration**: Data cũ load lên → tự convert sang format mới
