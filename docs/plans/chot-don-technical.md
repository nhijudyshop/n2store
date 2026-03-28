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
    } | null,
    tTags: string[],             // Tag T IDs gắn vào đơn: ['T1', 'T2']
    history: [                   // Lịch sử thao tác tag (max 50 entries)
        {
            action: string,      // SET_CATEGORY | REMOVE_CATEGORY | ADD_FLAG | REMOVE_FLAG | ADD_TTAG | REMOVE_TTAG | AUTO_HOAN_TAT | AUTO_ROLLBACK
            value: string,       // Giá trị liên quan (category key, flag key, tag T id)
            user: string,        // Tên user thao tác (hoặc "Hệ thống" cho auto)
            userId: number|null, // ID user (null cho hệ thống)
            timestamp: number    // Timestamp thao tác
        }
    ]
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
    GOI_BAO_KHACH_HH: { key: 'GOI_BAO_KHACH_HH', label: 'Gọi báo khách HH', auto: false, icon: '📞' },
    KHAC:         { key: 'KHAC',         label: 'Khác',        auto: false, icon: '📋', hasNote: true }
};

// ===== SUB-TAGS cho Categories 2, 3, 4 =====
const PTAG_SUBTAGS = {
    // Category 2 — MỤC XỬ LÝ
    CHUA_PHAN_HOI:  { key: 'CHUA_PHAN_HOI',  label: 'Đơn chưa phản hồi', category: 2 },
    CHUA_DUNG_SP:   { key: 'CHUA_DUNG_SP',   label: 'Đơn chưa đúng SP',  category: 2 },
    KHACH_MUON_XA:  { key: 'KHACH_MUON_XA',  label: 'Đơn khách muốn xã', category: 2 },
    BAN_HANG:       { key: 'BAN_HANG',       label: 'Bán hàng',          category: 2 },
    XU_LY_KHAC:    { key: 'XU_LY_KHAC',    label: 'Khác (ghi chú)',    category: 2, hasNote: true },

    // Category 3 — MỤC KHÔNG CẦN CHỐT
    DA_GOP_KHONG_CHOT: { key: 'DA_GOP_KHONG_CHOT', label: 'Đã gộp không chốt', category: 3 },
    GIO_TRONG:         { key: 'GIO_TRONG',         label: 'Giỏ trống',         category: 3 },

    // Category 4 — MỤC KHÁCH XÃ SAU CHỐT
    NCC_HET_HANG:      { key: 'NCC_HET_HANG',      label: 'NCC hết hàng',              category: 4 },
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
    'NCC_HET_HANG':     { category: 4, subTag: 'NCC_HET_HANG' },
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

## 9. Tag T Chờ Hàng — Data & UI Spec

### 9.1 Tag T Definition (lưu trong processing tag API dưới key `__ttag_config__`)

```javascript
{
  tTagDefinitions: [
    {
      id: 'T1',                    // Auto-increment: T1, T2, T3...
      productCode: 'B16',          // Mã SP tham chiếu
      name: 'Áo nâu ngắn tay',    // Tên gợi nhớ
      createdAt: 1711612800000
    }
  ]
}
```

### 9.1b Default T-tag Definition (hardcoded, always injected)

```javascript
// Default T-tags — always present, cannot be deleted, hidden from manager modal
const DEFAULT_TTAG_DEFS = [
    { id: 'T_MY', name: 'MY THÊM CHỜ VỀ', productCode: '', createdAt: 0, isDefault: true }
];
```

**Behavior**:
- `setTTagDefinitions()` auto-injects defaults if missing (unshift to beginning)
- `_ttagRenderManagerList()` filters out default tags (hidden from manager modal)
- `_ptagDeleteTTagDefAndOrders()` / `_ptagDeleteTTagDef()` block deletion of defaults
- Panel: default tags show normally but without delete (×) button
- Dropdown: default tags appear at bottom as direct toggle items (key: `dtag:T_MY`)

**Dropdown integration**:
- `_ptagBuildAllTags()` appends default T-tags at the end with `type: 'tag'`, `isDefaultTTag: true`
- `_ptagDdSelectTag()` handles `dtag:` prefix — toggles tag directly (assign/remove)
- `_ptagGetSelectedTags()` includes active default T-tags as pills with `isDefaultTTag: true`
- `_ptagDdRemovePill()` handles `dtag:` prefix for removal

### 9.2 Auto-increment ID logic

```javascript
// Tìm max number trong existing definitions → +1
const nums = defs.map(d => parseInt(d.id.replace('T',''))).filter(n => !isNaN(n));
const next = nums.length ? Math.max(...nums) + 1 : 1;
const newId = 'T' + next;
```

### 9.3 UI Architecture: Hybrid (Panel Section + Modal)

**Panel Section** — luôn hiện trong side panel:
- Header: "TAG T CHỜ HÀNG (N đơn)" + nút [⚙] mở modal
- Card per tag: `T1 · Áo nâu ngắn tay` + mã SP + count + arrow
- Click card → filter bảng theo tag T đó
- Nút 🗑 hiện khi tag có 0 đơn (xóa definition)

**Modal Quản Lý** — mở từ [⚙]:
- Summary: tổng tag + tổng đơn chờ
- [+ TẠO TAG T MỚI] → inline form
- Expandable cards per tag với:
  - STT pills (click × gỡ từng đơn)
  - THÊM ĐƠN: nhập STT hoặc tìm theo mã SP
  - GỠ ĐƠN: gỡ theo STT hoặc "HÀNG ĐÃ VỀ — Gỡ tất cả"

### 9.4 Tạo Tag T — 2 assign modes

| Mode | Flow |
|---|---|
| Tìm theo mã SP | Scan `allData` → match `Details[].ProductCode` → checkbox list → chọn → gắn |
| Nhập STT thủ công | Nhập STT cách dấu phẩy → validate → gắn |

### 9.5 Gỡ Tag T — 3 cách

| Cách | Thao tác |
|---|---|
| Gỡ tất cả | Click "HÀNG ĐÃ VỀ" → confirm → gỡ all đơn khỏi tag |
| Gỡ theo STT | Nhập STT cần gỡ → [Gỡ chọn] |
| Gỡ từng đơn | Click × trên STT pill hoặc × trên badge trong table cell |

### 9.6 Badge hiển thị trong table cell

Tất cả badge đều có nút × xóa nhanh:

```
[Okie Chờ Đi Đơn          ×]    ← category badge
[💳 CK ×] [🏠 Qua lấy ×]        ← flag badges
[🔖 T1 · B16 · Áo nâu ngắn tay  ×]  ← tag T badge (full, purple)
```

- **Category ×**: Xóa processing tag → đơn về "chưa gắn"
- **Flag ×**: Xóa flag đó (giữ category + flags khác)
- **Tag T ×**: Gỡ tag T khỏi đơn (gỡ hết → auto "Okie Chờ Đi Đơn")

### 9.7 Key functions

| Function | File | Mô tả |
|---|---|---|
| `_ptagOpenTTagManager()` | tab1-processing-tags.js | Mở modal quản lý |
| `_ptagToggleCreateForm()` | tab1-processing-tags.js | Toggle form tạo tag mới |
| `_ptagConfirmCreateTag()` | tab1-processing-tags.js | Xác nhận tạo + auto assign |
| `_ptagFindByProductCode(tagId)` | tab1-processing-tags.js | Scan allData tìm đơn chứa SP |
| `_ptagShowSearchResults()` | tab1-processing-tags.js | Hiển thị kết quả tìm SP |
| `_ptagConfirmSearchResults()` | tab1-processing-tags.js | Gắn tag T cho đơn đã chọn |
| `_ptagAddSTTsToTag()` | tab1-processing-tags.js | Thêm STT vào tag |
| `_ptagRemoveSTTsFromTag()` | tab1-processing-tags.js | Gỡ STT khỏi tag |
| `_ptagRemoveAllFromTag()` | tab1-processing-tags.js | Gỡ tất cả ("Hàng đã về") |
| `_ptagRemoveTTagBySTT()` | tab1-processing-tags.js | Gỡ 1 đơn qua STT pill × |

---

## 10. History / Audit Log

### 10.1 Mục đích

Ghi log cho TẤT CẢ thao tác gắn/xóa trên processing tag, flag, và tag T. Giúp track ai làm gì, khi nào.

### 10.2 Action types

| Action | Mô tả | Ví dụ value |
|---|---|---|
| `SET_CATEGORY` | Gắn/chuyển category (kèm subTag) | `'CHO_DI_DON'`, `'CHUA_PHAN_HOI'` |
| `REMOVE_CATEGORY` | Xóa category | `'CHO_DI_DON'` |
| `ADD_FLAG` | Thêm flag | `'CHUYEN_KHOAN'` |
| `REMOVE_FLAG` | Xóa flag | `'QUA_LAY'` |
| `ADD_TTAG` | Gắn tag T | `'T1'` |
| `REMOVE_TTAG` | Gỡ tag T | `'T2'` |
| `AUTO_HOAN_TAT` | Auto chuyển Hoàn Tất khi bill tạo | `'HOAN_TAT'` |
| `AUTO_ROLLBACK` | Auto rollback khi bill hủy | `'CHO_DI_DON'` |

### 10.3 Ghi log

```javascript
function _ptagAddHistory(orderId, action, value, userName) {
    const data = ProcessingTagState.getOrderData(orderId);
    if (!data) return;
    if (!data.history) data.history = [];
    const userInfo = userName
        ? { user: userName, userId: null }
        : _ptagGetCurrentUser();    // Lấy từ auth
    data.history.push({
        action, value,
        user: userInfo.user,
        userId: userInfo.userId,
        timestamp: Date.now()
    });
    if (data.history.length > 50) data.history = data.history.slice(-50);
}
```

- Auto-detect (CK, CN, giảm giá): `user = "Hệ thống"`
- Max 50 entries per order (cắt entries cũ nhất)

### 10.4 UI xem lịch sử

- Nút 🕐 nhỏ kế badge trong table cell (hiện khi có history)
- Click → popover hiển thị 20 entries gần nhất
- Format: `ngày giờ | user | +/- action label`

```
28/03 14:30  Duyên      + Gắn T1·B16
28/03 14:25  Hệ thống   + Auto CK (từ ví)
28/03 14:20  Nguyễn A   + Okie Chờ Đi Đơn
28/03 10:00  Trần B     + Đơn chưa phản hồi
28/03 09:55  Trần B     - Xóa Bán hàng
```

### 10.5 History tích hợp vào các hàm

| Hàm | Action ghi |
|---|---|
| `assignOrderCategory()` | SET_CATEGORY |
| `clearProcessingTag()` | REMOVE_CATEGORY |
| `toggleOrderFlag()` | ADD_FLAG / REMOVE_FLAG |
| `assignTTagToOrder()` | ADD_TTAG |
| `removeTTagFromOrder()` | REMOVE_TTAG |
| `onPtagBillCreated()` | AUTO_HOAN_TAT |
| `onPtagBillCancelled()` | AUTO_ROLLBACK |

---

## 11. Verification Checklist

1. **Test flow seller**: Đơn mới (chưa có tag) → seller liên hệ khách → gắn đúng category/sub-tag
2. **Test auto-detect flags**: Gắn vào 0.C → CK/CN auto từ wallet, không trùng, user đánh tay OK
3. **Test tag T auto sub-state**: Duyên gắn tag T → "Chờ Hàng", tháo hết T → "Okie Chờ Đi Đơn"
4. **Test auto-transition**: Ra bill → auto 0.A, hủy bill → rollback 0.C kèm flags cũ
5. **Test filter**: Filter theo category, sub-state, flag, tag T
6. **Test realtime**: 2 seller cùng thao tác → SSE sync đúng
7. **Test migration**: Data cũ load lên → tự convert sang format mới
8. **Test Tag T tạo**: Tạo tag mới (mã SP + tên) → hiện panel + modal
9. **Test Tag T tìm SP**: Nhập mã SP → tìm đúng đơn chứa SP → gắn tag T
10. **Test Tag T nhập STT**: Nhập STT thủ công → gắn → đơn chuyển "Chờ Hàng"
11. **Test Tag T gỡ hàng loạt**: "Hàng đã về" → tất cả đơn gỡ tag → chuyển "Okie Chờ Đi Đơn"
12. **Test Tag T gỡ từng đơn**: Click × trên pill/badge → gỡ đúng 1 đơn
13. **Test badge ×**: Xóa category, flag, tag T qua × button trên badge
14. **Test history**: Gắn/xóa tag → history ghi đúng action, user, timestamp
15. **Test history popover**: Click 🕐 → popover hiện entries đúng format
16. **Test NCC hết hàng**: Tag nằm trong mục KHÁCH XÃ SAU CHỐT (category 4), không còn trong MỤC XỬ LÝ
17. **Test flag Gọi báo khách HH**: Hiện trong dropdown đặc điểm đơn hàng, toggle on/off, hiện badge
18. **Test default T-tag MY THÊM CHỜ VỀ**: Luôn có sẵn, hiện ở cuối dropdown, toggle trực tiếp, ẩn khỏi modal quản lý, không xóa được
