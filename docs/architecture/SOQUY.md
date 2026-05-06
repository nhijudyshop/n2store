# Sổ Quỹ — Kiến trúc & Flow chi tiết

> **Module**: `/soquy/`
> **Mục đích**: Quản lý thu/chi tiền mặt · ngân hàng · ví điện tử, báo cáo dòng tiền, audit log đầy đủ
> **Status**: ~85% hoàn thiện (theo [`docs/PROJECT-TRACKER.md`](../PROJECT-TRACKER.md))
> **Đọc cùng**: [DATA-SYNCHRONIZATION.md](DATA-SYNCHRONIZATION.md), [SHARED_AUTH.md](SHARED_AUTH.md)

---

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Kiến trúc tổng thể](#2-kiến-trúc-tổng-thể)
3. [File Map](#3-file-map)
4. [Database Schema](#4-database-schema)
5. [Voucher Code Generation](#5-voucher-code-generation-auto-increment)
6. [Business Logic Flows](#6-business-logic-flows)
7. [State Management](#7-state-management)
8. [Permission Model](#8-permission-model)
9. [UI Structure (4 Tabs)](#9-ui-structure-4-tabs)
10. [Modal Forms](#10-modal-forms)
11. [Image Handling](#11-image-handling)
12. [Integration Points](#12-integration-points)
13. [Edit History — Audit Log](#13-edit-history--audit-log)
14. [Category & Source Management](#14-category--source-management-dynamic)
15. [Known Issues & Future Work](#15-known-issues--future-work)

---

## 1. Tổng quan

Module **Sổ Quỹ** là hệ thống quản lý dòng tiền độc lập của N2Store, **không** trực tiếp phụ thuộc đơn hàng TPOS/Pancake. Nó ghi nhận mọi phiếu thu/chi phát sinh thực tế (tiền mặt, chuyển khoản ngân hàng, ví điện tử) cùng với chứng từ (ảnh), audit đầy đủ, phân quyền theo vai trò.

Tổng thể có **4 tab**:

| Tab | Slug hash | Ai thấy | Mô tả |
|-----|-----------|---------|-------|
| Nhân viên | `#employee` | Admin | Chấm công, duyệt ca — do [`attendance.js`](../../soquy/js/attendance.js) quản lý |
| Sổ Quỹ | `#cashbook` | All (có quyền) | Tab chính — danh sách phiếu thu/chi, filter, CRUD |
| Báo cáo | `#report` | Admin | Overview / Payment CN / Payment KD / Receipt — trend, top 5 |
| Lịch sử chỉnh sửa | `#editHistory` | Admin | Audit log toàn bộ hành động |

**Stack**:
- Frontend: JS thuần (không framework), modular pattern (`config` → `database` → `ui` → `main`), Firebase SDK, Lucide icons.
- Storage: **Firestore** (primary, source of truth) + **Firebase Storage** (ảnh) + **PostgreSQL mirror** trên render.com (backup/analytics, sync thủ công qua script).
- Auth/Permissions: [`shared/js/permissions-helper.js`](../../shared/js/permissions-helper.js) + [`shared/js/shared-auth-manager.js`](../../shared/js/shared-auth-manager.js).

---

## 2. Kiến trúc tổng thể

```
┌─────────────────── Browser (soquy/index.html) ───────────────────┐
│  UI Layer  ─ soquy-ui.js, soquy-report.js, soquy-edit-history.js │
│  State/Config ─ soquy-config.js (window.SoquyState)              │
│  Permissions ─ soquy-permissions.js + shared PermissionHelper    │
│  Data Layer ─ soquy-database.js (Firestore CRUD + transactions)  │
└──────────────────┬──────────────────────────┬────────────────────┘
                   │                          │
           ┌───────▼──────┐          ┌────────▼────────┐
           │  Firestore   │          │ Firebase Storage│
           │ (source of   │          │ (ảnh chứng từ)  │
           │   truth)     │          └─────────────────┘
           └───────┬──────┘
                   │  (backup + analytics, sync manual)
           ┌───────▼──────┐
           │ PostgreSQL   │  migrations/041_create_soquy_tables.sql
           │ (render.com) │  scripts: backup-soquy-firestore.js,
           └──────────────┘           migrate-soquy-firestore-to-pg.js
```

**Nguyên tắc luồng dữ liệu**:

- Firestore là **source of truth**. Không có real-time `onSnapshot` listener (điểm khác biệt với pattern chuẩn — xem [mục 15](#15-known-issues--future-work)); fetch on-demand khi filter thay đổi.
- PostgreSQL chỉ là **mirror** cho backup/analytics, đồng bộ thủ công qua 2 script Node trong `render.com/scripts/`.
- Voucher code (`TTM000001`, `CCN000025`…) được tạo qua **Firestore Transaction** để đảm bảo atomic auto-increment trên collection `soquy_counters`.

---

## 3. File Map

| File | Dòng | Vai trò |
|------|------|---------|
| [soquy/index.html](../../soquy/index.html) | 2,330 | Markup 4 tab + 3 modal (receipt/payment/detail/cancel) |
| [soquy/js/soquy-config.js](../../soquy/js/soquy-config.js) | 378 | Constants, `window.SoquyState`, `window.SoquyElements`, collection refs |
| [soquy/js/soquy-database.js](../../soquy/js/soquy-database.js) | 1,509 | Firestore CRUD, transactions, import Excel, dynamic meta |
| [soquy/js/soquy-ui.js](../../soquy/js/soquy-ui.js) | 3,311 | Render bảng, filter cục bộ, modal forms, image compression |
| [soquy/js/soquy-main.js](../../soquy/js/soquy-main.js) | 1,018 | Entry point, init flow, event listeners |
| [soquy/js/soquy-report.js](../../soquy/js/soquy-report.js) | 1,258 | Báo cáo tab 3 |
| [soquy/js/soquy-edit-history.js](../../soquy/js/soquy-edit-history.js) | 913 | Audit log tab 4 |
| [soquy/js/soquy-permissions.js](../../soquy/js/soquy-permissions.js) | 263 | Role gate + tab/action visibility |
| [soquy/js/attendance.js](../../soquy/js/attendance.js) | 4,273 | Tab 1 — chấm công/timesheet |
| [soquy/css/soquy.css](../../soquy/css/soquy.css) | — | Styling |
| [render.com/migrations/041_create_soquy_tables.sql](../../render.com/migrations/041_create_soquy_tables.sql) | 57 | Schema PG mirror Firestore |
| [render.com/scripts/backup-soquy-firestore.js](../../render.com/scripts/backup-soquy-firestore.js) | — | Export Firestore → JSON |
| [render.com/scripts/migrate-soquy-firestore-to-pg.js](../../render.com/scripts/migrate-soquy-firestore-to-pg.js) | — | Import JSON → PG (idempotent `ON CONFLICT`) |

---

## 4. Database Schema

### 4.1 Firestore Collections

Khởi tạo ref tại [soquy-config.js:7-13, 117](../../soquy/js/soquy-config.js#L7-L13):

```javascript
const db = getFirestore();

// Firestore collection reference
const soquyCollectionRef = db.collection('soquy_vouchers');
const soquyCountersRef = db.collection('soquy_counters');
const storageRef = firebase.storage().ref();

// Firestore collection reference for dynamic metadata (categories, creators)
const soquyMetaRef = db.collection('soquy_meta');
```

#### Collection `soquy_vouchers` (chính)

Doc ID tự sinh bởi Firestore. Object shape chuẩn (xem đoạn `createVoucher` dưới):

| Nhóm | Field | Kiểu | Mô tả |
|------|-------|------|-------|
| Định danh | `code` | string | Mã phiếu `PREFIX + 6 digit` (VD `TTM000001`) |
| | `type` | string | `receipt` \| `payment_cn` \| `payment_kd` |
| | `fundType` | string | `cash` \| `bank` \| `ewallet` |
| | `businessAccounting` | bool | `true` nếu `type === 'payment_kd'` |
| Giao dịch | `category` | string | Loại thu/chi (có thể là predefined hoặc dynamic) |
| | `collector` | string | Tên nhân viên thu/chi |
| | `objectType` | string | `Khác` \| `Khách hàng` \| `Nhà cung cấp` \| `Nhân viên` |
| | `amount` | number | **Luôn dương** (`Math.abs` khi lưu) |
| | `note` | string | Ghi chú |
| | `source` / `sourceCode` | string | Nguồn (VD `AA - Bán hàng`) |
| | `branch` | string | Chi nhánh |
| Đối tác | `personName`, `personCode`, `phone`, `address` | string | Thông tin người nộp/nhận |
| Ngân hàng | `accountName`, `accountNumber`, `transferContent` | string | Với phiếu qua bank/ewallet |
| Ảnh | `imageData` | string | Base64 ảnh chứng từ (đã nén) |
| Trạng thái | `status` | string | `paid` (default) \| `cancelled` |
| | `cancelledAt`, `cancelReason` | ts/string | Chỉ set khi hủy |
| Audit | `voucherDateTime` | Timestamp | Thời điểm giao dịch (user chọn) |
| | `createdAt`, `updatedAt` | Timestamp | Server timestamp |
| | `createdBy` | string | `displayName` của user tạo |

Legacy compat: phiếu cũ có `type === 'payment'` được normalize on-read thành `payment_cn`/`payment_kd` dựa trên `businessAccounting` ([soquy-database.js:155-161](../../soquy/js/soquy-database.js#L155-L161)).

#### Collection `soquy_counters`

Bộ đếm auto-increment cho voucher code. Doc ID = `${PREFIX}_counter`:

```
soquy_counters/
├── TTM_counter     → { lastNumber: 47, prefix: 'TTM', updatedAt }
├── TNH_counter     → { lastNumber: 12, prefix: 'TNH', updatedAt }
├── TVD_counter     → { lastNumber:  3, prefix: 'TVD', updatedAt }
├── CCN_counter     → { lastNumber: 89, prefix: 'CCN', updatedAt }
└── CKD_counter     → { lastNumber:156, prefix: 'CKD', updatedAt }
```

#### Collection `soquy_meta`

Metadata động (categories / sources / creators / removed lists):

```
soquy_meta/
├── receipt_categories         → { items: [string, ...], updatedAt }
├── payment_cn_categories      → { items: [string, ...], updatedAt }
├── payment_kd_categories      → { items: [{name, sourceCode}, ...], updatedAt }
├── removed_receipt_categories → { items: [string, ...] }  (predefined bị ẩn)
├── removed_payment_cn_categories
├── removed_payment_kd_categories
├── sources                    → { items: [{code, name}, ...], updatedAt }
└── creators                   → { items: [string, ...], updatedAt }
```

Lý do có cả `receipt_categories` (dynamic additions) lẫn `removed_receipt_categories`: các category predefined trong JS source không xóa được khỏi code, nên khi user muốn ẩn 1 predefined → push vào `removed_*` list để UI lọc ra.

#### Collection `soquy_edit_history`

Audit log — xem chi tiết ở [mục 13](#13-edit-history--audit-log).

### 4.2 PostgreSQL mirror (render.com)

Schema đầy đủ tại [041_create_soquy_tables.sql](../../render.com/migrations/041_create_soquy_tables.sql):

```sql
-- Migration 041: create Soquy tables (mirror of Firestore collections)
-- Source collections: soquy_vouchers, soquy_counters, soquy_meta
-- Strategy: keep key fields as proper columns for querying, plus full doc in `raw` jsonb
-- so nothing is lost during the Firestore → Postgres migration.

CREATE TABLE IF NOT EXISTS soquy_vouchers (
    id                  TEXT PRIMARY KEY,         -- Firestore doc id
    code                TEXT,
    type                TEXT,                     -- 'receipt' | 'payment_cn' | 'payment_kd'
    fund_type           TEXT,
    category            TEXT,
    collector           TEXT,
    object_type         TEXT,
    person_name         TEXT,
    person_code         TEXT,
    phone               TEXT,
    address             TEXT,
    amount              NUMERIC(18, 2) DEFAULT 0,
    note                TEXT,
    image_data          TEXT,
    transfer_content    TEXT,
    account_name        TEXT,
    account_number      TEXT,
    branch              TEXT,
    source              TEXT,
    source_code         TEXT,
    business_accounting BOOLEAN DEFAULT FALSE,
    status              TEXT,
    voucher_date_time   TIMESTAMPTZ,
    created_at          TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ,
    created_by          TEXT,
    cancelled_at        TIMESTAMPTZ,
    cancel_reason       TEXT,
    raw                 JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_soquy_vouchers_voucher_date_time ON soquy_vouchers (voucher_date_time DESC);
CREATE INDEX IF NOT EXISTS idx_soquy_vouchers_type             ON soquy_vouchers (type);
CREATE INDEX IF NOT EXISTS idx_soquy_vouchers_fund_type        ON soquy_vouchers (fund_type);
CREATE INDEX IF NOT EXISTS idx_soquy_vouchers_status           ON soquy_vouchers (status);
CREATE INDEX IF NOT EXISTS idx_soquy_vouchers_code             ON soquy_vouchers (code);
CREATE INDEX IF NOT EXISTS idx_soquy_vouchers_source_code      ON soquy_vouchers (source_code);

CREATE TABLE IF NOT EXISTS soquy_counters (
    id      TEXT PRIMARY KEY,    -- e.g. 'TM_payment_kd'
    value   BIGINT DEFAULT 0,
    raw     JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS soquy_meta (
    id          TEXT PRIMARY KEY,    -- e.g. 'payment_kd_categories', 'sources', 'creators'
    items       JSONB,               -- the `items` array if present
    raw         JSONB NOT NULL,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

**Ghi chú quan trọng**:

- Cột `raw JSONB` giữ nguyên toàn bộ doc Firestore → **không mất thông tin** khi migrate, kể cả field mới chưa có cột riêng.
- Indexes được chọn theo use-case thực tế: time-range report, filter by type/fund/status, lookup by code/source.
- Không có foreign key — đây là **mirror, không phải system of record**.

---

## 5. Voucher Code Generation (Auto-increment)

### 5.1 Prefix map

Từ [soquy-config.js:46-62](../../soquy/js/soquy-config.js#L46-L62):

```javascript
// Voucher code prefixes per fund type
const VOUCHER_CODE_PREFIX = {
    receipt: {
        cash: 'TTM',
        bank: 'TNH',
        ewallet: 'TVD'
    },
    payment_cn: {
        cash: 'CCN',
        bank: 'CCN',
        ewallet: 'CCN'
    },
    payment_kd: {
        cash: 'CKD',
        bank: 'CKD',
        ewallet: 'CKD'
    }
};
```

| Type × Fund | cash | bank | ewallet |
|-------------|------|------|---------|
| receipt     | TTM  | TNH  | TVD     |
| payment_cn  | CCN  | CCN  | CCN     |
| payment_kd  | CKD  | CKD  | CKD     |

Format: `PREFIX + 6 chữ số padded` — VD `TTM000001`, `CKD000157`.

Lưu ý: phiếu chi (CCN/CKD) **không phân biệt** fund type trong prefix — ý nghĩa fund vẫn có trong field `fundType` nhưng mã phiếu chung cho cả 3 loại quỹ.

### 5.2 Thuật toán sinh mã (Firestore Transaction)

Nguồn: [soquy-database.js:19-52](../../soquy/js/soquy-database.js#L19-L52).

```javascript
/**
 * Get next voucher code for a given type and fund
 * Format: PREFIX + 6-digit number (e.g., CTM003068, TTM000001)
 */
async function getNextVoucherCode(voucherType, fundType) {
    const prefix = config.VOUCHER_CODE_PREFIX[voucherType][fundType];
    if (!prefix) throw new Error('Invalid voucher type or fund type');

    const counterDocId = `${prefix}_counter`;

    try {
        // Use Firestore transaction for atomic increment
        const counterRef = config.soquyCountersRef.doc(counterDocId);
        const newCode = await config.db.runTransaction(async (transaction) => {
            const counterDoc = await transaction.get(counterRef);

            let nextNumber = 1;
            if (counterDoc.exists) {
                nextNumber = (counterDoc.data().lastNumber || 0) + 1;
            }

            transaction.set(counterRef, {
                lastNumber: nextNumber,
                prefix: prefix,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            return `${prefix}${String(nextNumber).padStart(6, '0')}`;
        });

        return newCode;
    } catch (error) {
        console.error('[SoquyDB] Error generating voucher code:', error);
        // Fallback: use timestamp-based code
        const timestamp = Date.now().toString().slice(-6);
        return `${prefix}${timestamp}`;
    }
}
```

**Điểm quan trọng**:

- `db.runTransaction` đảm bảo read-then-write atomic → 2 user tạo phiếu đồng thời không bao giờ trùng mã.
- Nếu transaction fail (network, permission) → fallback dùng timestamp 6 chữ số cuối của `Date.now()` để tránh block user. Nhược điểm: có thể trùng trong trường hợp cực hiếm, nhưng ưu tiên UX.
- Mỗi cặp (type, fund) có counter riêng → có thể reset từng loại mà không ảnh hưởng loại khác.

---

## 6. Business Logic Flows

### 6.1 Page Load Flow

Entry point là [soquy-main.js:7-1018](../../soquy/js/soquy-main.js). Đoạn quan trọng tại [soquy-main.js:958-999](../../soquy/js/soquy-main.js#L958-L999):

```javascript
async function init() {
    console.log('[SoquyMain] Initializing...');

    // Initialize DOM references
    initElements();

    // Initialize image upload handlers (after DOM elements are bound)
    ui.initImageHandlers();

    // Render Lucide icons for image upload placeholders (image-plus, x)
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Load column visibility from localStorage
    ui.loadColumnVisibility();

    // Load filter state from localStorage (Nhóm 7)
    ui.loadFilterState();

    // Load dynamic categories/creators/sources and users from Firestore
    await Promise.all([db.loadDynamicMeta(), db.fetchAllUsers()]);

    // Populate dropdowns (including dynamic categories and user selects)
    ui.populateCategoryDropdowns();
    ui.populateCollectorDropdowns();

    // Render dynamic table header based on column visibility
    ui.renderTableHeader();

    // Bind events
    bindEvents();

    // Restore filter UI from saved state (Nhóm 7)
    ui.restoreFilterUI();

    // Update sidebar title
    ui.updateSidebarTitle();

    // Load initial data
    await ui.refreshData();

    console.log('[SoquyMain] Initialization complete');
}
```

Trước `init()`, hàm `DOMContentLoaded` chạy `SoquyPermissions.init()` để check quyền — nếu user không có quyền vào page thì redirect ngay, không vào init ([soquy-main.js:11-13](../../soquy/js/soquy-main.js#L11-L13)):

```javascript
if (typeof SoquyPermissions !== 'undefined') {
    if (!SoquyPermissions.init()) return;
}
```

### 6.2 Flow tạo phiếu thu/chi

Core logic tại [soquy-database.js:61-120](../../soquy/js/soquy-database.js#L61-L120):

```javascript
/**
 * Create a new voucher (receipt or payment)
 */
async function createVoucher(voucherData) {
    try {
        const fundType = state.fundType === config.FUND_TYPES.ALL
            ? config.FUND_TYPES.CASH
            : state.fundType;

        const voucherCode = await getNextVoucherCode(voucherData.type, fundType);

        const now = new Date();
        const voucher = {
            code: voucherCode,
            type: voucherData.type, // 'receipt', 'payment_cn', or 'payment_kd'
            fundType: fundType,
            category: voucherData.category || '',
            collector: voucherData.collector || '',
            objectType: voucherData.objectType || 'Khác',
            personName: voucherData.personName || '',
            personCode: voucherData.personCode || '',
            phone: voucherData.phone || '',
            address: voucherData.address || '',
            amount: Math.abs(Number(voucherData.amount) || 0),
            note: voucherData.note || '',
            imageData: voucherData.imageData || '',
            transferContent: voucherData.transferContent || '',
            accountName: voucherData.accountName || '',
            accountNumber: voucherData.accountNumber || '',
            branch: voucherData.branch || '',
            source: voucherData.source || '', // backward compat
            sourceCode: voucherData.sourceCode || '',
            businessAccounting: voucherData.type === config.VOUCHER_TYPES.PAYMENT_KD,
            status: config.VOUCHER_STATUS.PAID,
            voucherDateTime: voucherData.dateTime
                ? parseVoucherDateTime(voucherData.dateTime)
                : firebase.firestore.Timestamp.fromDate(now),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: voucherData.createdBy || getCurrentUserName(),
            cancelledAt: null,
            cancelReason: ''
        };

        const docRef = await config.soquyCollectionRef.add(voucher);
        console.log('[SoquyDB] Voucher created:', voucherCode);

        // Log edit history (fire and forget)
        const typeLabel = config.VOUCHER_TYPE_LABELS[voucher.type] || voucher.type;
        if (window.SoquyEditHistory) {
            SoquyEditHistory.logEditHistory('create', {
                voucherCode: voucherCode,
                voucherType: voucher.type,
                description: `Tạo ${typeLabel} ${voucherCode} - ${formatCurrency(voucher.amount)}đ`
            });
        }

        return { id: docRef.id, ...voucher };
    } catch (error) {
        console.error('[SoquyDB] Error creating voucher:', error);
        throw error;
    }
}
```

**Flow đầy đủ từ user click đến DB**:

```
User click "Tạo phiếu thu" / "Tạo phiếu chi CN|KD"
  → SoquyPermissions.checkAction('create_receipt'|'create_payment')
      └─ Nếu không có quyền → alert + return
  → Mở modal, auto-fill datetime = now
  → User điền form + chọn/thêm category + upload ảnh
  → Save click:
     ├─ validate client-side (amount > 0, category, ...)
     ├─ compress ảnh → base64 (mobile 1024px@0.5 / desktop 1920px@0.7, max 15MB)
     ├─ db.createVoucher(data)
     │    ├─ getNextVoucherCode(type, fund)  [Firestore transaction]
     │    ├─ build voucher object
     │    │   • amount = Math.abs (luôn dương, dấu ±  determined by type)
     │    │   • status = 'paid'
     │    │   • businessAccounting = (type === PAYMENT_KD)
     │    ├─ soquyCollectionRef.add(voucher)
     │    └─ SoquyEditHistory.logEditHistory('create', {...})   [fire-and-forget]
     ├─ autoAddCategory nếu category mới → update soquy_meta
     ├─ autoAddCreator nếu createdBy mới
     └─ notify user + reload list + reset form
```

### 6.3 Fetch + Filter Vouchers

Logic tại [soquy-database.js:129-189](../../soquy/js/soquy-database.js#L129-L189):

```javascript
/**
 * Fetch vouchers with filters applied
 */
async function fetchVouchers() {
    try {
        // Build query with server-side filters to minimize data transfer
        let query = config.soquyCollectionRef;

        // Server-side date range filter (same field as orderBy → no composite index needed)
        const { startDate, endDate } = getDateRange();
        if (startDate && endDate) {
            const startTimestamp = firebase.firestore.Timestamp.fromDate(startDate);
            const endTimestamp = firebase.firestore.Timestamp.fromDate(endDate);
            query = query
                .where('voucherDateTime', '>=', startTimestamp)
                .where('voucherDateTime', '<=', endTimestamp);
        }

        query = query.orderBy('voucherDateTime', 'desc');

        const snapshot = await query.get();

        let vouchers = [];
        snapshot.forEach(doc => {
            vouchers.push({ id: doc.id, ...doc.data() });
        });

        // Normalize legacy 'payment' type to payment_cn or payment_kd
        vouchers = vouchers.map(v => {
            if (v.type === 'payment') {
                v.type = v.businessAccounting ? 'payment_kd' : 'payment_cn';
            }
            return v;
        });

        // Fund type filter (client-side to avoid composite index)
        if (state.fundType !== config.FUND_TYPES.ALL) {
            vouchers = vouchers.filter(v => v.fundType === state.fundType);
        }

        // Status filter (client-side to avoid composite index)
        if (state.statusFilter.length > 0) {
            vouchers = vouchers.filter(v => state.statusFilter.includes(v.status));
        }

        // Voucher type filter (supports multiple selections)
        if (state.voucherTypeFilter.length > 0) {
            vouchers = vouchers.filter(v => state.voucherTypeFilter.includes(v.type));
        }

        // NOTE: Search, category, creator, employee filters are applied locally
        // in applyLocalFilters() (soquy-ui.js) to avoid re-fetching on every keystroke.

        return vouchers;
    } catch (error) {
        console.error('[SoquyDB] Error fetching vouchers:', error);
        return [];
    }
}
```

**Phân chia filter** — quan trọng để hiểu vì sao có lớp server-side / client-side / local:

| Filter | Nơi chạy | Lý do |
|--------|---------|-------|
| Date range | **Server-side** (Firestore `where`) | Giới hạn data về, nhỏ nhất có thể |
| `orderBy voucherDateTime desc` | Server-side | Cùng field với `where` → không cần composite index |
| `fundType`, `status`, `voucherTypeFilter` | **Client-side** (sau fetch) | Tránh tạo composite index (Firestore limit) |
| `searchQuery`, `category`, `creator`, `employee`, `source` | **Local** (`applyLocalFilters` trong [soquy-ui.js](../../soquy/js/soquy-ui.js)) | Không re-fetch khi user gõ từng ký tự |
| `createdBy === currentUser` (nếu thiếu `view_all_transactions`) | Client-side | Permission-based, xem [mục 8](#8-permission-model) |

**Date range logic** ([soquy-database.js:197-230](../../soquy/js/soquy-database.js#L197-L230)):

```javascript
function getDateRange() {
    const now = new Date();
    let startDate, endDate;

    switch (state.timeFilter) {
        case config.TIME_FILTERS.THIS_MONTH:
            startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            break;
        case config.TIME_FILTERS.LAST_MONTH:
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
            endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
            break;
        case config.TIME_FILTERS.THIS_QUARTER: {
            const quarter = Math.floor(now.getMonth() / 3);
            startDate = new Date(now.getFullYear(), quarter * 3, 1, 0, 0, 0);
            endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59);
            break;
        }
        case config.TIME_FILTERS.THIS_YEAR:
            startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
            endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
            break;
        case config.TIME_FILTERS.CUSTOM:
            startDate = state.customStartDate ? new Date(state.customStartDate + 'T00:00:00') : null;
            endDate = state.customEndDate ? new Date(state.customEndDate + 'T23:59:59') : null;
            break;
        default:
            startDate = null;
            endDate = null;
    }

    return { startDate, endDate };
}
```

### 6.4 Tính số dư (Balance Calculation)

**Opening balance** = số dư tại đầu kỳ = tổng dòng tiền từ khi bắt đầu dùng hệ thống đến hết kỳ trước. Logic tại [soquy-database.js:251-294](../../soquy/js/soquy-database.js#L251-L294):

```javascript
/**
 * Calculate opening balance (all vouchers BEFORE the start date)
 */
async function calculateOpeningBalance(fundType) {
    try {
        const { startDate } = getDateRange();
        if (!startDate) return 0;

        // Permission-based creator filter: non-admin only sees own transactions
        const canViewAll = typeof SoquyPermissions !== 'undefined'
            ? SoquyPermissions.canViewAllTransactions()
            : true;
        const currentUser = !canViewAll ? getCurrentUserName() : '';

        // Server-side filter: only fetch vouchers BEFORE startDate
        const startTimestamp = firebase.firestore.Timestamp.fromDate(startDate);
        let query = config.soquyCollectionRef
            .where('voucherDateTime', '<', startTimestamp);

        const snapshot = await query.get();
        let balance = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            // Skip cancelled vouchers
            if (data.status !== config.VOUCHER_STATUS.PAID) return;
            // Fund type filter
            if (fundType !== config.FUND_TYPES.ALL && data.fundType !== fundType) return;
            // Creator filter: non-admin only counts own transactions
            if (!canViewAll && data.createdBy !== currentUser) return;
            // Normalize legacy type
            const type = data.type === 'payment'
                ? (data.businessAccounting ? 'payment_kd' : 'payment_cn')
                : data.type;
            if (type === config.VOUCHER_TYPES.RECEIPT) {
                balance += Math.abs(data.amount || 0);
            } else {
                balance -= Math.abs(data.amount || 0);
            }
        });

        return balance;
    } catch (error) {
        console.error('[SoquyDB] Error calculating opening balance:', error);
        return 0;
    }
}
```

**Số dư hiển thị** — tính client-side sau khi đã có vouchers của kỳ hiện tại:

```
totalReceipts   = Σ receipt.amount      (status=paid)
totalPaymentsCN = Σ payment_cn.amount
totalPaymentsKD = Σ payment_kd.amount
totalPayments   = totalPaymentsCN + totalPaymentsKD
closingBalance  = openingBalance + totalReceipts − totalPayments
```

**Chú ý về performance**: `calculateOpeningBalance` fetch TẤT CẢ phiếu trước `startDate` → với dataset lớn qua vài năm có thể chậm. Hiện chưa có tối ưu hóa (VD: snapshot số dư cuối tháng). Khi dataset lớn lên nên xem xét.

### 6.5 Edit / Cancel / Delete

#### Update voucher

Từ [soquy-database.js:303-361](../../soquy/js/soquy-database.js#L303-L361) — điểm đặc biệt là **đọc old data trước** để tính diff cho audit log:

```javascript
async function updateVoucher(docId, updateData) {
    try {
        // Save old data BEFORE update for change tracking
        let oldData = null;
        let voucherCode = '';
        let voucherType = '';
        try {
            const oldDoc = await config.soquyCollectionRef.doc(docId).get();
            if (oldDoc.exists) {
                oldData = oldDoc.data();
                voucherCode = oldData.code || '';
                voucherType = oldData.type || '';
            }
        } catch (e) {
            console.error('[SoquyDB] Error fetching old data for edit log:', e);
        }

        const cleanData = {
            ...updateData,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        // Don't allow changing code
        delete cleanData.code;
        delete cleanData.id;

        if (cleanData.amount !== undefined) {
            cleanData.amount = Math.abs(Number(cleanData.amount) || 0);
        }

        if (cleanData.dateTime) {
            cleanData.voucherDateTime = parseVoucherDateTime(cleanData.dateTime);
            delete cleanData.dateTime;
        }

        await config.soquyCollectionRef.doc(docId).update(cleanData);

        // Log edit history with changes (fire and forget)
        if (window.SoquyEditHistory && oldData) {
            const changes = SoquyEditHistory.computeChanges(oldData, cleanData);
            // Remove internal fields from changes
            delete changes.updatedAt;
            if (Object.keys(changes).length > 0) {
                SoquyEditHistory.logEditHistory('edit', {
                    voucherCode: voucherCode,
                    voucherType: voucherType,
                    changes: changes,
                    description: `Sửa phiếu ${voucherCode}`
                });
            }
        }

        return true;
    } catch (error) {
        console.error('[SoquyDB] Error updating voucher:', error);
        throw error;
    }
}
```

#### Cancel voucher (soft delete)

Từ [soquy-database.js:366-403](../../soquy/js/soquy-database.js#L366-L403):

```javascript
async function cancelVoucher(docId, reason) {
    try {
        // Get voucher info for logging
        let voucherCode = '';
        let voucherType = '';
        try {
            const doc = await config.soquyCollectionRef.doc(docId).get();
            if (doc.exists) {
                voucherCode = doc.data().code || '';
                voucherType = doc.data().type || '';
            }
        } catch (e) { /* ignore */ }

        await config.soquyCollectionRef.doc(docId).update({
            status: config.VOUCHER_STATUS.CANCELLED,
            cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
            cancelReason: reason || '',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Log edit history (fire and forget)
        if (window.SoquyEditHistory) {
            const reasonText = reason ? ` - Lý do: ${reason}` : '';
            SoquyEditHistory.logEditHistory('cancel', {
                voucherCode: voucherCode,
                voucherType: voucherType,
                extra: { cancelReason: reason || '' },
                description: `Hủy phiếu ${voucherCode}${reasonText}`
            });
        }

        return true;
    } catch (error) {
        console.error('[SoquyDB] Error cancelling voucher:', error);
        throw error;
    }
}
```

**Lý do soft delete (status = 'cancelled')**: giữ lại phiếu để audit, không mất mã phiếu, counter không bị "hổng". Phiếu cancelled vẫn show trong UI nếu user tick checkbox "Đã hủy" trong filter status.

#### Hard delete + deleteAll (admin only)

- `deleteVoucher(docId)` → `doc.delete()` + log `'delete'` action.
- `deleteAllVouchers()` → xóa toàn bộ theo batch 500/lần (Firestore limit) + **reset counters** để mã phiếu lại bắt đầu từ 000001:

```javascript
// Delete in batches of 500 (Firestore batch limit)
const batchSize = 500;
let deleted = 0;
const docs = snapshot.docs;

for (let i = 0; i < docs.length; i += batchSize) {
    const batch = config.soquyCollectionRef.firestore.batch();
    const chunk = docs.slice(i, i + batchSize);
    chunk.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    deleted += chunk.length;
}

// Reset counters
const countersSnapshot = await config.soquyCountersRef.get();
if (countersSnapshot.size > 0) {
    const counterBatch = config.soquyCountersRef.firestore.batch();
    countersSnapshot.forEach(doc => counterBatch.delete(doc.ref));
    await counterBatch.commit();
}
```

### 6.6 Import Excel

Flow tại [soquy-database.js:501-608](../../soquy/js/soquy-database.js#L501-L608). Pre-fetch toàn bộ code hiện có để check duplicate, rồi duyệt từng row:

```javascript
async function importVouchers(rows) {
    const results = { success: 0, skipped: [], errors: [] };

    // Pre-fetch all existing voucher codes to check for duplicates
    const existingCodes = new Set();
    try {
        const snapshot = await config.soquyCollectionRef.get();
        snapshot.forEach(doc => {
            const code = (doc.data().code || '').trim();
            if (code) existingCodes.add(code);
        });
    } catch (error) {
        console.error('[SoquyDB] Error fetching existing codes:', error);
    }

    for (let i = 0; i < rows.length; i++) {
        try {
            const row = rows[i];
            const voucherType = detectVoucherType(row);
            const detectedFund = detectFundType(row);
            const fundType = detectedFund || state.fundType;
            const effectiveFund = fundType === config.FUND_TYPES.ALL
                ? config.FUND_TYPES.CASH : fundType;

            // Use Excel code if provided, otherwise generate new one
            const excelCode = String(row['Mã phiếu'] || row['code'] || '').trim();
            const voucherCode = excelCode || await getNextVoucherCode(voucherType, effectiveFund);

            // Skip if voucher code already exists
            if (existingCodes.has(voucherCode)) {
                results.skipped.push({ row: i + 1, code: voucherCode });
                continue;
            }

            // ... build voucher object (như createVoucher) ...
            await config.soquyCollectionRef.add(voucher);
            existingCodes.add(voucherCode);

            // Auto-add category if not in predefined list
            if (voucher.category) await autoAddCategory(voucher.category, voucherType);
            if (voucher.createdBy && voucher.createdBy !== 'Admin') await autoAddCreator(voucher.createdBy);

            results.success++;
        } catch (error) {
            results.errors.push({ row: i + 1, error: error.message });
        }
    }

    if (window.SoquyEditHistory && results.success > 0) {
        SoquyEditHistory.logEditHistory('import', {
            extra: { importCount: results.success },
            description: `Import ${results.success} phiếu từ Excel`
        });
    }

    return results;
}
```

**Thuật toán detect** ([soquy-database.js:610-645](../../soquy/js/soquy-database.js#L610-L645)):

```javascript
function detectVoucherType(row) {
    // 1. Check explicit type column
    const type = String(row['Loại'] || row['type'] || '').toLowerCase();
    if (type.includes('thu') || type === 'receipt') return config.VOUCHER_TYPES.RECEIPT;
    if (type.includes('chi kd') || type === 'payment_kd') return config.VOUCHER_TYPES.PAYMENT_KD;
    if (type.includes('chi cn') || type === 'payment_cn') return config.VOUCHER_TYPES.PAYMENT_CN;
    if (type.includes('chi') || type === 'payment') return config.VOUCHER_TYPES.PAYMENT_KD;

    // 2. Detect from voucher code prefix
    const code = String(row['Mã phiếu'] || row['code'] || '').toUpperCase();
    if (code.startsWith('CKD')) return config.VOUCHER_TYPES.PAYMENT_KD;
    if (code.startsWith('CCN')) return config.VOUCHER_TYPES.PAYMENT_CN;
    if (code.startsWith('C')) return config.VOUCHER_TYPES.PAYMENT_KD; // legacy CTM/CNH/CVD
    if (code.startsWith('T')) return config.VOUCHER_TYPES.RECEIPT;

    // 3. Detect by amount sign
    const amount = parseFloat(String(row['Giá trị'] || row['amount'] || '0').replace(/[.,\s]/g, ''));
    return amount < 0 ? config.VOUCHER_TYPES.PAYMENT_KD : config.VOUCHER_TYPES.RECEIPT;
}

function detectFundType(row) {
    // 1. Check explicit fund type column
    const fund = String(row['Loại sổ quỹ'] || row['Quỹ'] || row['fundType'] || '').toLowerCase();
    if (fund.includes('mặt') || fund === 'cash') return config.FUND_TYPES.CASH;
    if (fund.includes('ngân') || fund === 'bank') return config.FUND_TYPES.BANK;
    if (fund.includes('ví') || fund === 'ewallet') return config.FUND_TYPES.EWALLET;

    // 2. Detect from voucher code prefix
    const code = String(row['Mã phiếu'] || row['code'] || '').toUpperCase();
    if (code.startsWith('CTM') || code.startsWith('TTM')) return config.FUND_TYPES.CASH;
    if (code.startsWith('CNH') || code.startsWith('TNH')) return config.FUND_TYPES.BANK;
    if (code.startsWith('CVD') || code.startsWith('TVD')) return config.FUND_TYPES.EWALLET;
    // CCN/CKD prefixes don't carry fund type info, fall through to null

    return null;
}
```

**Thứ tự ưu tiên detect**: cột explicit > prefix code > dấu amount (fallback). Cho phép import từ nhiều nguồn Excel khác nhau (cả cột tiếng Việt và cột snake_case).

---

## 7. State Management

### 7.1 `window.SoquyState`

Single source of client state. Định nghĩa đầy đủ tại [soquy-config.js:168-235](../../soquy/js/soquy-config.js#L168-L235):

```javascript
window.SoquyState = {
    // Current filters
    fundType: FUND_TYPES.CASH,
    timeFilter: TIME_FILTERS.THIS_MONTH,
    customStartDate: null,
    customEndDate: null,
    voucherTypeFilter: [], // empty = all, ['receipt'], ['payment_cn'], ['payment_kd'], or combinations
    categoryFilter: '',
    statusFilter: [VOUCHER_STATUS.PAID], // default: show paid only
    creatorFilter: '',
    employeeFilter: '',
    searchQuery: '',

    // Pagination
    currentPage: 1,
    pageSize: DEFAULT_PAGE_SIZE,  // 100
    totalItems: 0,
    totalPages: 0,

    // Data
    vouchers: [],
    filteredVouchers: [],
    displayedVouchers: [],

    // Summary
    openingBalance: 0,
    totalReceipts: 0,
    totalPaymentsCN: 0,
    totalPaymentsKD: 0,
    totalPayments: 0,
    closingBalance: 0,

    // Payment sub-type for current modal
    paymentSubType: 'cn',

    // Editing
    editingVoucherId: null,
    viewingVoucherId: null,

    // Loading
    isLoading: false,

    // Creators list (for filter dropdown)
    creators: [],
    employees: [],

    // Column visibility (key -> boolean)
    columnVisibility: COLUMN_DEFINITIONS.reduce((acc, col) => {
        acc[col.key] = col.defaultVisible;
        return acc;
    }, {}),

    // Source filter (Nguồn)
    sourceFilter: '',

    // Dynamic categories, creators & sources (auto-added from imports/entries)
    dynamicReceiptCategories: [],
    dynamicPaymentCNCategories: [],
    dynamicPaymentKDCategories: [],
    dynamicCreators: [],
    dynamicSources: [], // Array of { code: 'AA', name: 'Bán hàng' }

    // All users from Firestore (for collector/creator dropdowns)
    allUsers: [],

    // Edit history tab loaded flag
    editHistoryLoaded: false
};
```

### 7.2 Column Definitions

18 cột bảng — flag `defaultVisible` để chọn cột hiển thị mặc định ([soquy-config.js:120-141](../../soquy/js/soquy-config.js#L120-L141)):

```javascript
const COLUMN_DEFINITIONS = [
    { key: 'code', label: 'Mã phiếu', defaultVisible: false },
    { key: 'voucherDateTime', label: 'Thời gian', defaultVisible: true },
    { key: 'createdAt', label: 'Thời gian tạo', defaultVisible: false },
    { key: 'createdBy', label: 'Người tạo', defaultVisible: true },
    { key: 'collector', label: 'Nhân viên', defaultVisible: false },
    { key: 'branch', label: 'Chi nhánh', defaultVisible: false },
    { key: 'source', label: 'Nguồn', defaultVisible: true },
    { key: 'category', label: 'Loại thu chi', defaultVisible: true },
    { key: 'accountName', label: 'Tên tài khoản', defaultVisible: false },
    { key: 'accountNumber', label: 'Số tài khoản', defaultVisible: false },
    { key: 'personCode', label: 'Mã người nộp/nhận', defaultVisible: false },
    { key: 'personName', label: 'Người nộp/nhận', defaultVisible: false },
    { key: 'phone', label: 'Số điện thoại', defaultVisible: false },
    { key: 'address', label: 'Địa chỉ', defaultVisible: false },
    { key: 'amount', label: 'Giá trị', defaultVisible: true },
    { key: 'transferContent', label: 'Nội dung chuyển khoản', defaultVisible: false },
    { key: 'image', label: 'Hình ảnh', defaultVisible: true },
    { key: 'note', label: 'Ghi chú', defaultVisible: true },
    { key: 'fundType', label: 'Loại sổ quỹ', defaultVisible: false },
    { key: 'status', label: 'Trạng thái', defaultVisible: false }
];
```

### 7.3 localStorage persistence

- `soquy_columnVisibility` → object `{ columnKey: boolean }` — lưu cột user chọn hiển thị.
- `soquy_filterState` → object chứa filter state → restore khi reload page.

Không persist `vouchers[]` — mọi lần load đều fetch mới từ Firestore.

### 7.4 Vì sao KHÔNG dùng `onSnapshot`?

Module này **không** dùng Firestore real-time listener như pattern chuẩn mô tả trong [DATA-SYNCHRONIZATION.md](DATA-SYNCHRONIZATION.md) (`InvoiceStatusStore`, `InvoiceStatusDeleteStore`…). Lý do lịch sử:
- Dataset sổ quỹ có thể lớn (vài chục nghìn phiếu qua nhiều năm) → listener liên tục stream sẽ tốn cost + bandwidth.
- User thường thao tác một mình trên page; conflict 2-người-edit hiếm.

Hệ quả: nếu 2 admin cùng sửa 1 phiếu cùng lúc, người save sau sẽ overwrite người save trước. Đây là **known limit** (xem [mục 15](#15-known-issues--future-work)).

---

## 8. Permission Model

### 8.1 Permission keys

Tất cả key có prefix `soquy.`. Được check qua shared `PermissionHelper`:

| Key | Tác dụng |
|-----|---------|
| `tab_soquy` | Cho phép user thường truy cập tab Sổ Quỹ (admin bypass) |
| `create_receipt` | Hiện/enable nút "Tạo phiếu thu" |
| `create_payment` | Hiện/enable nút "Tạo phiếu chi CN/KD" |
| `edit_voucher` | Hiện nút Sửa trong bảng |
| `cancel_voucher` | Hiện nút Hủy trong modal detail |
| `manage_categories` | Hiện nút "+" quản lý loại thu/chi |
| `manage_sources` | Hiện nút thêm nguồn |
| `view_all_transactions` | Nếu **thiếu** → user chỉ thấy phiếu do mình tạo |

### 8.2 Tab visibility

Logic tại [soquy-permissions.js:55-97](../../soquy/js/soquy-permissions.js#L55-L97):

```javascript
applyTabVisibility() {
    const isAdmin = PermissionHelper.isAdmin();

    const tabEmployeeBtn = document.getElementById('tabEmployeeBtn');
    const tabReportBtn = document.getElementById('tabReportBtn');
    const tabEditHistoryBtn = document.getElementById('tabEditHistoryBtn');

    if (isAdmin) {
        // Admin: ensure all tabs are visible
        if (tabEmployeeBtn) {
            const wrapper = tabEmployeeBtn.closest('.nav-dropdown-wrapper');
            if (wrapper) wrapper.style.display = '';
            tabEmployeeBtn.style.display = '';
        }
        if (tabReportBtn) tabReportBtn.style.display = '';
        if (tabEditHistoryBtn) tabEditHistoryBtn.style.display = '';
    } else {
        // Regular user: hide admin-only tabs
        if (tabEmployeeBtn) {
            const wrapper = tabEmployeeBtn.closest('.nav-dropdown-wrapper');
            if (wrapper) wrapper.style.display = 'none';
            else tabEmployeeBtn.style.display = 'none';
        }
        if (tabReportBtn) tabReportBtn.style.display = 'none';
        if (tabEditHistoryBtn) tabEditHistoryBtn.style.display = 'none';

        // If user has tab_soquy permission, auto-switch to Sổ Quỹ tab
        if (PermissionHelper.hasPermission(this.PAGE_ID, 'tab_soquy')) {
            const cashbookBtn = document.getElementById('tabCashBookBtn');
            if (cashbookBtn) {
                document.querySelectorAll('.tab-header-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.tab === 'cashbook');
                });
                document.querySelectorAll('.tab-content').forEach(c => {
                    c.classList.toggle('active', c.id === 'cashbookTabContent');
                });
                location.hash = 'cashbook';
            }
        }
    }
}
```

Ngoài hide UI, còn có **hashchange enforce** để chặn user gõ URL trực tiếp:

```javascript
ADMIN_ONLY_TABS: ['employee', 'report', 'editHistory'],

enforceTabAccess() {
    const self = this;
    window.addEventListener('hashchange', function () {
        if (PermissionHelper.isAdmin()) return;
        const hash = location.hash.replace('#', '');
        if (self.ADMIN_ONLY_TABS.includes(hash)) {
            // Non-admin trying to access admin-only tab → redirect to cashbook
            location.hash = 'cashbook';
            // Also update tab UI
            document.querySelectorAll('.tab-header-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.tab === 'cashbook');
            });
            document.querySelectorAll('.tab-content').forEach(c => {
                c.classList.toggle('active', c.id === 'cashbookTabContent');
            });
        }
    });
}
```

### 8.3 Action gating

Tại [soquy-permissions.js:106-171](../../soquy/js/soquy-permissions.js#L106-L171) — visibility tự động áp dụng khi init:

```javascript
applyActionPermissions() {
    if (PermissionHelper.isAdmin()) return; // Admin has full access

    // Receipt button
    if (!PermissionHelper.hasPermission(this.PAGE_ID, 'create_receipt')) {
        const btnReceipt = document.getElementById('btnShowCreateReceipt');
        if (btnReceipt) {
            btnReceipt.disabled = true;
            btnReceipt.style.opacity = '0.5';
            btnReceipt.style.cursor = 'not-allowed';
            btnReceipt.title = 'Bạn không có quyền tạo phiếu thu';
        }
        // Mobile FAB receipt button
        const fabReceipt = document.getElementById('fabCreateReceipt');
        if (fabReceipt) {
            fabReceipt.disabled = true;
            fabReceipt.style.opacity = '0.5';
            fabReceipt.style.cursor = 'not-allowed';
        }
    }

    // Payment CN/KD buttons
    if (!PermissionHelper.hasPermission(this.PAGE_ID, 'create_payment')) {
        const btnPaymentCN = document.getElementById('btnShowCreatePaymentCN');
        const btnPaymentKD = document.getElementById('btnShowCreatePaymentKD');
        if (btnPaymentCN) { btnPaymentCN.disabled = true; btnPaymentCN.style.opacity = '0.5'; }
        if (btnPaymentKD) { btnPaymentKD.disabled = true; btnPaymentKD.style.opacity = '0.5'; }
    }

    // Category management "+" buttons
    if (!PermissionHelper.hasPermission(this.PAGE_ID, 'manage_categories')) {
        const btnManageReceipt = document.getElementById('btnManageReceiptCategory');
        const btnManagePayment = document.getElementById('btnManagePaymentCategory');
        if (btnManageReceipt) btnManageReceipt.style.display = 'none';
        if (btnManagePayment) btnManagePayment.style.display = 'none';
    }

    // Source management button
    if (!PermissionHelper.hasPermission(this.PAGE_ID, 'manage_sources')) {
        const btnCreateSourceInline = document.getElementById('btnCreateSourceInline');
        if (btnCreateSourceInline) btnCreateSourceInline.style.display = 'none';
    }
}
```

### 8.4 Permission-based data filter

Khi user thiếu `view_all_transactions`, filter cả trong fetch vouchers list **và** trong `calculateOpeningBalance` (xem code ở [mục 6.4](#64-tính-số-dư-balance-calculation)). Helper:

```javascript
filterByCreator(vouchers) {
    if (!Array.isArray(vouchers)) return [];
    if (this.canViewAllTransactions()) return vouchers;

    const auth = PermissionHelper.getAuth();
    const displayName = auth?.displayName || '';

    return vouchers.filter(v => v.createdBy === displayName);
}
```

**Quan trọng**: đây là filter **client-side**. User có kỹ thuật có thể bypass bằng devtools. Cần có Firestore Security Rules phía server để đảm bảo an toàn thực sự (hiện chưa được document).

---

## 9. UI Structure (4 Tabs)

### 9.1 Header nav (4 tab button)

Từ [soquy/index.html:86-102](../../soquy/index.html#L86-L102):

```html
<div class="tab-header-navigation">
    <button class="tab-header-btn" data-tab="employee" id="tabEmployeeBtn">
        <i data-lucide="users"></i>
        <span>Nhân viên</span>
    </button>
    <button class="tab-header-btn active" data-tab="cashbook" id="tabCashBookBtn">
        <i data-lucide="wallet"></i>
        <span>Sổ Quỹ</span>
    </button>
    <button class="tab-header-btn" data-tab="report" id="tabReportBtn">
        <i data-lucide="bar-chart-3"></i>
        <span>Báo cáo</span>
    </button>
    <button class="tab-header-btn" data-tab="editHistory" id="tabEditHistoryBtn">
        <i data-lucide="history"></i>
        <span>Lịch sử chỉnh sửa</span>
    </button>
</div>
```

### 9.2 Tab 1 — Nhân viên

- File: [soquy/js/attendance.js](../../soquy/js/attendance.js).
- Backend: Cloudflare Worker `chatomni-proxy.nhijudyshop.workers.dev/api/attendance`.
- Sub-views: "Bảng chấm công" (grid ca × ngày), "Duyệt chấm công" modal.
- Không share state với sổ quỹ — độc lập hoàn toàn.

### 9.3 Tab 2 — Sổ Quỹ (chính)

Layout 3 khu vực:

1. **Radio chọn quỹ** (Tiền mặt / Ngân hàng / Ví điện tử / Tổng quỹ) — đổi `state.fundType` + re-fetch.
2. **Filter panel**: time range dropdown + voucher type checkboxes + category dropdown + status checkboxes + creator/employee filter + search input.
3. **Summary stats** (5 ô): Opening / Receipts / Payments CN / Payments KD / Closing.
4. **Transaction table**: 18 cột (toggle visibility), pagination (15/30/50/100/trang).
5. **Action buttons**: Tạo phiếu thu · Tạo phiếu chi CN · Tạo phiếu chi KD · Xuất CSV. Desktop ở top-bar, mobile có FAB tròn nổi.

### 9.4 Tab 3 — Báo cáo

- File: [soquy/js/soquy-report.js](../../soquy/js/soquy-report.js).
- Các loại: Overview / Payment CN / Payment KD / Receipt.
- Components: Trend chart (so sánh kỳ trước), Top 5 giao dịch, breakdown theo category / source.
- Độc lập filter riêng (không chia sẻ với tab 2).

### 9.5 Tab 4 — Lịch sử chỉnh sửa

- File: [soquy/js/soquy-edit-history.js](../../soquy/js/soquy-edit-history.js).
- Xem chi tiết ở [mục 13](#13-edit-history--audit-log).

---

## 10. Modal Forms

Có 4 modal dùng chung pattern (overlay + content panel, close bằng Escape / click overlay / nút X):

### 10.1 `#soquyCreateReceiptModal` — Tạo phiếu thu

**Fields**: datetime, category (với button "+" add mới), collector (employee select), amount, personName/Code/phone/address, source, image upload, note.
**Actions**: Save / Save+Print / Cancel.

### 10.2 `#soquyCreatePaymentModal` — Tạo phiếu chi (CN hoặc KD)

Như Receipt + thêm **accountName, accountNumber, transferContent, branch**.
Quyết định CN hay KD qua `state.paymentSubType` — được set trước khi mở modal.
Backend tự set `businessAccounting = true` nếu `type === PAYMENT_KD`.

### 10.3 `#soquyDetailModal` — Xem chi tiết phiếu

Read-only view. Hiện tất cả field với định dạng đẹp, ảnh zoom-able. Có nút:
- **Sửa** — mở lại modal Create ở chế độ edit (set `state.editingVoucherId`).
- **Hủy phiếu** — mở `#soquyCancelModal`.

### 10.4 `#soquyCancelModal` — Nhập lý do hủy

Textarea bắt buộc nhập lý do. Click "Xác nhận hủy" → `cancelVoucher(docId, reason)`.

---

## 11. Image Handling

Logic nén ảnh tại [soquy-ui.js](../../soquy/js/soquy-ui.js) (hàm `initImageHandlers`, `compressImage`).

**Pipeline**:
```
User chọn file ảnh
  → check size ≤ 15MB (raw) → nếu > 15MB báo lỗi
  → Detect device: window.innerWidth ≤ 768 → mobile profile
  → Canvas resize:
      mobile:  maxDim = 1024px, quality = 0.5
      desktop: maxDim = 1920px, quality = 0.7
  → toDataURL('image/jpeg', quality) → base64
  → Hiển thị preview
  → Khi save voucher: lưu base64 vào field imageData của Firestore
```

**Lưu ý**:
- Base64 lưu trực tiếp trong Firestore doc — kích thước doc Firestore giới hạn **1MB**, nên nén phải đủ nhỏ.
- `config.storageRef` cũng được expose, có thể upload lên Firebase Storage trong tương lai nếu cần ảnh lớn hơn.

---

## 12. Integration Points

| Module / Service | Tương tác | Ghi chú |
|------------------|----------|---------|
| Shared auth | `shared/js/shared-auth-manager.js` | Login, `sessionStorage/localStorage['loginindex_auth']` |
| Shared permissions | `shared/js/permissions-helper.js` | Role + permission keys (`soquy.*`) |
| Shared Firebase | `shared/js/firebase-config.js` | `getFirestore()`, `firebase.storage()` |
| Shared navigation | `shared/js/navigation-modern.js` | Sidebar (page title, menu) |
| Attendance Worker | `chatomni-proxy.nhijudyshop.workers.dev/api/attendance` | Tab 1 — chấm công |
| render.com PG | Migration + 2 script backup/migrate | **Manual sync**, không real-time |
| TPOS / Pancake | **KHÔNG** tích hợp trực tiếp | Sổ quỹ độc lập, không pull từ đơn hàng tự động |

Hiện tại không có flow nào từ TPOS/Pancake đẩy phiếu thu tự động khi đơn chốt. Nếu cần thêm trong tương lai, điểm vào hợp lý nhất là tạo API Render gọi `createVoucher` với role service account.

---

## 13. Edit History — Audit Log

### 13.1 Collection `soquy_edit_history`

Mỗi action ghi 1 document. Shape record tại [soquy-edit-history.js:141-168](../../soquy/js/soquy-edit-history.js#L141-L168):

```javascript
function buildHistoryRecord(actionType, details) {
    if (!VALID_ACTION_TYPES.includes(actionType)) {
        console.error('[EditHistory] Invalid actionType:', actionType);
        return null;
    }

    const record = {
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        actionType: actionType,
        userId: getCurrentUserId(),
        userName: getCurrentUserName(),
        voucherCode: details.voucherCode || null,
        voucherType: details.voucherType || null,
        description: details.description || '',
        details: details.changes || details.extra || {}
    };

    // Ensure voucherCode/voucherType have values for voucher-related actions
    if (VOUCHER_ACTION_TYPES.includes(actionType)) {
        if (!record.voucherCode) record.voucherCode = details.voucherCode || '';
        if (!record.voucherType) record.voucherType = details.voucherType || '';
    }

    return record;
}
```

### 13.2 Action types

Từ [soquy-edit-history.js:34-55](../../soquy/js/soquy-edit-history.js#L34-L55):

```javascript
const VALID_ACTION_TYPES = [
    'create', 'edit', 'cancel', 'delete',
    'import', 'delete_all',
    'category_add', 'category_delete',
    'source_add', 'source_delete'
];

// Action types that relate to a specific voucher
const VOUCHER_ACTION_TYPES = ['create', 'edit', 'cancel', 'delete'];

const ACTION_BADGE_MAP = {
    create:          { label: 'Tạo phiếu',        color: '#52c41a' },
    edit:            { label: 'Sửa phiếu',        color: '#1890ff' },
    cancel:          { label: 'Hủy phiếu',        color: '#fa8c16' },
    delete:          { label: 'Xóa phiếu',        color: '#ff4d4f' },
    delete_all:      { label: 'Xóa toàn bộ',      color: '#ff4d4f' },
    import:          { label: 'Import',            color: '#722ed1' },
    category_add:    { label: 'Quản lý danh mục',  color: '#8c8c8c' },
    category_delete: { label: 'Quản lý danh mục',  color: '#8c8c8c' },
    source_add:      { label: 'Quản lý nguồn',     color: '#8c8c8c' },
    source_delete:   { label: 'Quản lý nguồn',     color: '#8c8c8c' }
};
```

### 13.3 Compute diff (cho action `edit`)

Thuật toán so sánh field-by-field tại [soquy-edit-history.js:104-129](../../soquy/js/soquy-edit-history.js#L104-L129):

```javascript
/**
 * Compare two objects field-by-field and return changed fields.
 * @param {Object} oldData
 * @param {Object} newData
 * @returns {Object} { fieldName: { old: value, new: value } }
 */
function computeChanges(oldData, newData) {
    const changes = {};
    if (!oldData || !newData) return changes;

    // Collect all keys from both objects
    const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

    for (const key of allKeys) {
        const oldVal = oldData[key];
        const newVal = newData[key];

        // Skip if both are strictly equal
        if (oldVal === newVal) continue;

        // Handle both undefined/null as equivalent to no change
        if ((oldVal === undefined || oldVal === null) && (newVal === undefined || newVal === null)) continue;

        // Values differ
        changes[key] = {
            old: oldVal !== undefined ? oldVal : null,
            new: newVal !== undefined ? newVal : null
        };
    }

    return changes;
}
```

### 13.4 Log action (fire-and-forget)

Từ [soquy-edit-history.js:182-192](../../soquy/js/soquy-edit-history.js#L182-L192):

```javascript
async function logEditHistory(actionType, details) {
    try {
        const record = buildHistoryRecord(actionType, details || {});
        if (!record) return;

        await config.db.collection('soquy_edit_history').add(record);
    } catch (error) {
        console.error('[EditHistory] Error logging:', error);
        // Do NOT throw — main operation must continue
    }
}
```

**Fire-and-forget** nghĩa là: log fail **không block** thao tác chính (tạo phiếu, sửa…). User vẫn thấy thành công; chỉ có audit log thiếu mục đó.

### 13.5 UI hiển thị

Tab 4 fetch `soquy_edit_history` collection, apply filter client-side (actionType / userName / timeRange / keyword), render dạng list với:
- Badge màu theo action type.
- Description (VD: "Sửa phiếu TTM000047").
- Diff viewer cho action `edit` — hiển thị field thay đổi: `amount: 500,000đ → 550,000đ`.

---

## 14. Category & Source Management (Dynamic)

### 14.1 Predefined lists

Tại [soquy-config.js:74-106](../../soquy/js/soquy-config.js#L74-L106):

```javascript
// Receipt categories (Loại thu)
const RECEIPT_CATEGORIES = [
    'Thu tiền khách hàng',
    'Thu hoàn tiền NCC',
    'Thu từ đối tác giao hàng',
    'Rút tiền ngân hàng',
    'Thu nhập khác',
    'Thu nội bộ',
    'Chuyển/Nạp'
];

// Payment CN categories (Loại chi cá nhân)
const PAYMENT_CN_CATEGORIES = [
    'Chi CC CHỊ NHI',
    'Chi CC A TRƯỜNG',
    'Chi BB ĂN UỐNG+ĐÃM TIỆC+ĐI CHƠI',
    'Chi BB TỪ THIỆN+PHỎNG SANH+CÚNG DƯỜNG',
    'Chi BB ĐI CHỢ HÀNG NGÀY + GIA VỊ',
    'Chi DD KHOẢN CHI XÂY+SỬA NHÀ',
    'Chi phí khác',
    'Chuyển/Rút'
];

// Payment KD categories (Loại chi kinh doanh)
const PAYMENT_KD_CATEGORIES = [
    'Chi trả tiền NCC',
    'Chi phí vận chuyển',
    'Chi phí mặt bằng',
    'Chi lương nhân viên',
    'Chi nội bộ',
    'Chi phí khác',
    'Chuyển/Rút'
];
```

Predefined **hardcode trong JS**, không xóa được. Muốn "ẩn" khỏi UI → push vào `removed_*_categories` doc.

### 14.2 Dynamic categories

Khi tạo phiếu / import Excel với category **chưa có** trong predefined + dynamic → auto-add vào `soquy_meta/{receipt|payment_cn|payment_kd}_categories`. Logic tại [soquy-database.js:740-797](../../soquy/js/soquy-database.js#L740-L797):

```javascript
async function autoAddCategory(category, voucherType, sourceCode) {
    category = String(category || '').trim();
    if (!category) return;
    sourceCode = String(sourceCode || '').trim();

    const predefined = getCategoryPredefined(voucherType);
    const dynamicList = getCategoryDynamicList(voucherType);

    // Check if already exists
    const allNames = [
        ...predefined.map(c => String(c).toLowerCase()),
        ...dynamicList.map(c => getCategoryName(c).toLowerCase())
    ];
    if (allNames.includes(category.toLowerCase())) return;

    const useSourceLinked = isSourceLinkedType(voucherType);
    const newItem = useSourceLinked ? { name: category, sourceCode } : category;

    try {
        const docId = getCategoryDocId(voucherType);
        const docRef = config.soquyMetaRef.doc(docId);
        const doc = await docRef.get();

        let items = [];
        if (doc.exists) items = doc.data().items || [];

        // Migrate old string items for source-linked types
        if (useSourceLinked) {
            items = items.map(c => typeof c === 'string' ? { name: c, sourceCode: '' } : c);
        }

        const itemNames = items.map(c => getCategoryName(c).toLowerCase());
        if (!itemNames.includes(category.toLowerCase())) {
            items.push(newItem);
            await docRef.set({ items, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        }

        // Update local state
        const existsInLocal = dynamicList.some(c => getCategoryName(c).toLowerCase() === category.toLowerCase());
        if (!existsInLocal) dynamicList.push(newItem);

        // Log edit history (fire and forget)
        if (window.SoquyEditHistory) {
            SoquyEditHistory.logEditHistory('category_add', {
                extra: { categoryName: category, categoryType: voucherType },
                description: `Thêm danh mục ${category}`
            });
        }
    } catch (error) {
        console.error('[SoquyDB] Error auto-adding category:', error);
    }
}
```

**Điểm lưu ý**:
- **Source-linked types** (receipt + payment_kd): category lưu dạng object `{ name, sourceCode }` để link với source mặc định.
- **Payment CN**: category chỉ lưu string.
- Có đoạn **migrate on-the-fly**: nếu gặp item kiểu string trong list source-linked → convert thành `{ name, sourceCode: '' }` khi save lần kế tiếp.

### 14.3 Delete dynamic category

Khi user có `manage_categories` xóa dynamic entry:

```javascript
async function deleteDynamicCategories(categories, voucherType) {
    if (!categories || categories.length === 0) return;
    const docId = getCategoryDocId(voucherType);
    const deleteLower = categories.map(c => String(c).toLowerCase());

    const docRef = config.soquyMetaRef.doc(docId);
    const doc = await docRef.get();
    if (!doc.exists) return;

    let items = doc.data().items || [];
    items = items.filter(item => !deleteLower.includes(getCategoryName(item).toLowerCase()));

    await docRef.set({ items, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });

    // ... cleanup old payment_categories doc nếu có ...

    // Update local state
    const dynamicList = getCategoryDynamicList(voucherType);
    const filtered = dynamicList.filter(c => !deleteLower.includes(getCategoryName(c).toLowerCase()));
    setCategoryDynamicList(voucherType, filtered);

    // Log edit history
    if (window.SoquyEditHistory) {
        SoquyEditHistory.logEditHistory('category_delete', {
            extra: { categoryNames: categories },
            description: `Xóa danh mục ${categories.join(', ')}`
        });
    }
}
```

### 14.4 Sources

Shape `{ code, name }` — VD `{ code: 'AA', name: 'Bán hàng' }`. Lưu tại `soquy_meta/sources`. Add logic tại [soquy-database.js:911-950](../../soquy/js/soquy-database.js#L911-L950):

```javascript
async function addSource(sourceObj) {
    if (!sourceObj || !sourceObj.code || !sourceObj.name) return;
    const code = String(sourceObj.code).trim().toUpperCase();
    const name = String(sourceObj.name).trim();
    if (!code || !name) return;

    const dynamicList = state.dynamicSources;
    if (dynamicList.some(s => s.code === code)) return;

    const docRef = config.soquyMetaRef.doc('sources');
    const doc = await docRef.get();

    let items = [];
    if (doc.exists) items = doc.data().items || [];

    // Migrate: convert old string items to {code, name} objects
    items = items.map(s => typeof s === 'string' ? { code: s, name: s } : s);

    if (!items.some(s => s.code === code)) {
        items.push({ code, name });
        await docRef.set({ items, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    }

    if (!state.dynamicSources.some(s => s.code === code)) {
        state.dynamicSources.push({ code, name });
    }

    // Log edit history
    if (window.SoquyEditHistory) {
        SoquyEditHistory.logEditHistory('source_add', {
            extra: { sourceCode: code, sourceName: name },
            description: `Thêm nguồn ${name} (${code})`
        });
    }
}
```

Code source luôn UPPERCASE → tránh duplicate do case-sensitive.

---

## 15. Known Issues & Future Work

### Issues hiện tại

1. **Không có real-time listener**: 2 user sửa cùng 1 phiếu cùng lúc → người save sau overwrite. Cần dùng `onSnapshot` + optimistic locking (compare `updatedAt`) nếu cần đảm bảo consistency.
2. **`calculateOpeningBalance` fetch full history**: với dataset vài chục nghìn phiếu qua nhiều năm, query `voucherDateTime < startDate` có thể chậm. Nên làm snapshot số dư cuối tháng/quý để lookup nhanh.
3. **Permission filter chỉ client-side**: không có Firestore Security Rules mô tả trong repo → user kỹ thuật có thể bypass qua devtools. Cần document + enforce rules phía Firestore.
4. **Image stored as base64 trong Firestore**: doc Firestore giới hạn 1MB. Nếu ảnh nén vẫn lớn → fail silently. Nên migrate sang Firebase Storage (đã có `storageRef` expose) và lưu URL thay vì base64.
5. **PG mirror manual sync**: không có cron/webhook tự chạy. Dữ liệu PG có thể lệch so với Firestore bất cứ lúc nào nếu quên chạy script.

### Future work gợi ý

- Tích hợp TPOS/Pancake → auto-tạo phiếu thu khi đơn chốt (có thể làm qua Render API + service account).
- Báo cáo (tab 3) complete nốt 15% còn lại — biểu đồ trend, Top 5, filter nâng cao.
- Dashboard overview tổng hợp 3 quỹ (cash + bank + ewallet) + so sánh với budget.
- Export PDF cho từng phiếu (hiện chỉ có "Save+Print" mở window print).
- Cron job tự động backup Firestore → PG hàng đêm.

---

## Verification — làm sao biết doc này vẫn đúng?

Chạy các command sau để đối chiếu (nếu doc lệch code thật → update doc ngay):

```bash
# 1. Verify constants match
grep -n "VOUCHER_CODE_PREFIX\|FUND_TYPES\|VOUCHER_STATUS" soquy/js/soquy-config.js

# 2. Verify collection names
grep -rn "soquy_vouchers\|soquy_counters\|soquy_meta\|soquy_edit_history" soquy/js/

# 3. Verify PG schema
cat render.com/migrations/041_create_soquy_tables.sql

# 4. Verify permission keys used
grep -rn "hasPermission.*soquy\|PAGE_ID" soquy/js/soquy-permissions.js

# 5. Verify action types
grep -n "VALID_ACTION_TYPES\|ACTION_BADGE_MAP" soquy/js/soquy-edit-history.js
```

Cuối cùng: mở `/soquy/index.html` trong browser → tạo thử 1 phiếu thu → check Firestore Console → collection `soquy_vouchers` phải có doc mới, `soquy_counters/TTM_counter` phải có `lastNumber` tăng lên 1, `soquy_edit_history` phải có 1 record `create`.
