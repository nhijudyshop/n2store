# Migration Plan: localStorage → IndexedDB

## Mục tiêu

Chuyển dữ liệu lớn từ localStorage (giới hạn ~5MB) sang IndexedDB (hàng trăm MB+) để:
- Xóa lỗi `QuotaExceededError`
- Giảm tải localStorage cho Firestore SDK persistence
- Tăng khả năng cache dữ liệu lớn (orders, invoices, chat data)

---

## Phase 0: Tạo shared IndexedDB wrapper

### File: `shared/js/indexed-db-store.js`

Tạo wrapper đơn giản cho IndexedDB, API giống localStorage để dễ migrate:

```js
class N2IndexedDB {
    constructor(dbName = 'n2store', version = 1) { ... }

    async getItem(key)                    // thay localStorage.getItem
    async setItem(key, value)             // thay localStorage.setItem
    async removeItem(key)                 // thay localStorage.removeItem
    async clear()                         // xóa toàn bộ
    async getAllKeys()                     // liệt kê keys
    async getMultiple(keys)               // batch get
    async setMultiple(entries)            // batch set
}
```

**Yêu cầu:**
- API trả về Promise (async/await)
- Tự serialize/deserialize JSON
- Fallback về localStorage nếu IndexedDB không available
- Hỗ trợ TTL (time-to-live) cho cache data
- Singleton pattern: `window.n2db = new N2IndexedDB()`

**Database schema:**

```
Database: n2store (version 1)
├── Store: "settings"     → UI preferences, small config
├── Store: "auth"         → Login, tokens
├── Store: "cache"        → API cache, pages, orders data
├── Store: "filters"      → Filter states, column visibility
└── Store: "chat"         → Messages, emojis, quick replies
```

---

## Phase 1: Auth & Tokens (Ưu tiên cao - dữ liệu nhạy cảm & lớn)

### Keys cần chuyển sang IndexedDB store `auth`:

| Key | Modules sử dụng | Kích thước ước tính |
|-----|-----------------|---------------------|
| `loginindex_auth` | 40+ files (login, navigation, orders-report, user-management...) | 1-5 KB |
| `bearer_token_data_1` | shared/token-manager, purchase-orders, tpos-pancake | 0.5-1 KB |
| `bearer_token_data_2` | shared/token-manager | 0.5-1 KB |
| `bearerToken` | order-management, soluong-live, orders-report | 0.5 KB |
| `tokenExpiry` | order-management, soluong-live | 50 B |
| `bill_tpos_credentials_1` | orders-report/bill-token-manager | 0.5 KB |
| `bill_tpos_token` / `bill_tpos_token_1` | orders-report/bill-token-manager | 0.5 KB |
| `pancake_jwt_token` | tpos-pancake, orders-report | 1-2 KB |
| `pancake_jwt_token_expiry` | tpos-pancake, orders-report | 50 B |
| `pancake_all_accounts` | tpos-pancake, orders-report | 2-10 KB |
| `pancake_page_access_tokens` | tpos-pancake, orders-report | 2-10 KB |
| `tpos_pancake_active_account_id` | tpos-pancake, orders-report, shared | 50 B |
| `firebaseConfig` | user-management | 0.5 KB |

### Files cần sửa:

1. **`shared/js/token-manager.js`** - Trung tâm token management
   - Đổi tất cả `localStorage.getItem/setItem` → `await n2db.getItem/setItem`
   - Cần chuyển các method sang async

2. **`shared/js/shared-auth-manager.js`** - Auth manager
   - Đổi auth read/write sang IndexedDB

3. **`index/login.js`** - Login flow
   - `loginindex_auth` write → IndexedDB
   - `isLoggedIn` giữ localStorage (cần sync read khi load trang)

4. **`shared/js/navigation-modern.js`** + navigation-*.js - Đọc auth data
   - Đổi sang async read từ IndexedDB

5. **`orders-report/js/core/bill-token-manager.js`** - Bill tokens
   - Chuyển bill credentials sang IndexedDB

6. **`tpos-pancake/js/pancake-token-manager.js`** - Pancake tokens
   - Chuyển pancake tokens sang IndexedDB

7. **`shared/js/pancake-token-manager.js`** - Shared pancake tokens
   - Sync với tpos-pancake version

8. **`order-management/js/main.js`**, **`order-management/js/order-list.js`** - bearerToken
   - Chuyển sang async read

9. **`soluong-live/js/main.js`** - bearerToken
   - Chuyển sang async read

### Lưu ý đặc biệt:
- `loginindex_auth` được dùng ở 40+ files → cần wrapper function trong shared
- Một số nơi dùng `sessionStorage` cho auth (khi không "Remember me") → giữ nguyên sessionStorage cho trường hợp này
- Migration: đọc từ localStorage cũ → ghi vào IndexedDB → xóa localStorage key cũ

---

## Phase 2: Cache Data (Ưu tiên cao - chiếm nhiều dung lượng nhất)

### Keys cần chuyển sang IndexedDB store `cache`:

| Key | Modules sử dụng | Kích thước ước tính |
|-----|-----------------|---------------------|
| `socialOrders` | orders-report | 10-100 KB |
| `socialOrderTags` | orders-report | 1-5 KB |
| `invoiceStatusDelete_v2` | orders-report | 5-50 KB |
| `invoiceStatusStore_v2` | orders-report | 5-50 KB |
| `tpos_pancake_pages_cache` | orders-report | 2-10 KB |
| `inbox_orders` | inbox | 5-50 KB |
| `inbox_conv_labels` | inbox | 1-5 KB |
| `inbox_groups` | inbox | 1-5 KB |
| `quickReplies` | orders-report, shared | 2-10 KB |
| `orders_productAssignments` | orders-report/tab3 | 5-20 KB |
| `orders_productRemovals` | orders-report/tab3 | 5-20 KB |
| `social_debt_cache` | orders-report/tab-social | 1-5 KB |
| `sent_message_orders` | orders-report/chat | 1-10 KB |
| `failed_message_orders` | orders-report/chat | 1-5 KB |
| `supplierDebt_webNotes` | supplier-debt | 1-5 KB |
| `n2shop_custom_menu_names` | shared/navigation | 1-2 KB |
| `n2shop_menu_layout` | shared/navigation | 1-5 KB |
| `tposSettings` | tpos-pancake | 1-2 KB |
| `orders_held_cleanup_pending` | orders-report | 0.5 KB |

### Files cần sửa:

1. **`orders-report/js/tab-social/tab-social-sale.js`** - socialOrders, socialOrderTags, social_debt_cache
2. **`orders-report/js/tab1/tab1-order-history.js`** - invoiceStatusStore_v2
3. **`orders-report/js/managers/pancake-data-manager.js`** - tpos_pancake_pages_cache
4. **`orders-report/js/tab3/tab3-core.js`** - orders_productAssignments
5. **`orders-report/js/tab3/tab3-removal.js`** - orders_productRemovals
6. **`orders-report/js/chat/message-template-manager.js`** - sent/failed message orders
7. **`inbox/js/inbox-data.js`** - inbox_conv_labels, inbox_groups
8. **`inbox/js/inbox-orders.js`** - inbox_orders
9. **`shared/js/quick-reply-manager.js`** - quickReplies
10. **`shared/js/navigation-modern.js`** - menu names, menu layout
11. **`supplier-debt/js/main.js`** - supplierDebt_webNotes
12. **`orders-report/js/managers/held-products-manager.js`** - orders_held_cleanup_pending

---

## Phase 3: Filter & Display Settings (Ưu tiên trung bình)

### Keys cần chuyển sang IndexedDB store `filters`:

| Key | Modules sử dụng |
|-----|-----------------|
| `tab1_filter_data` | orders-report |
| `orders_tab1_filter_data` | orders-report |
| `soquy_filters` | soquy |
| `soquy_report_filters` | soquy |
| `soquy_column_visibility` | soquy |
| `orderDisplaySettings` | order-management |
| `soluongDisplaySettings` | soluong-live |
| `orders_billTemplateSettings` | orders-report |
| `orders_discount_stats_thresholds` | orders-report |
| `orders_discount_opportunity_cost_settings` | orders-report |
| `orders_discount_livestream_costs` | orders-report |
| `pageCompanyIdMapping` | orders-report |

### Files cần sửa:

1. **`orders-report/main.html`** (inline JS) - tab1_filter_data
2. **`orders-report/js/tab1/tab1-table.js`** - orders_tab1_filter_data
3. **`orders-report/js/tab1/tab1-fast-sale.js`** - orders_billTemplateSettings
4. **`orders-report/js/stats/discount-stats-*.js`** - discount settings
5. **`soquy/js/soquy-ui.js`** - soquy_filters, soquy_column_visibility
6. **`soquy/js/soquy-report.js`** - soquy_report_filters
7. **`order-management/js/order-list.js`** - orderDisplaySettings
8. **`soluong-live/js/soluong-list.js`** - soluongDisplaySettings

---

## Phase 4: Chat & Messaging Data (Ưu tiên trung bình)

### Keys cần chuyển sang IndexedDB store `chat`:

| Key | Modules sử dụng |
|-----|-----------------|
| `tpos_pk_recent_emojis` | tpos-pancake |
| `inbox_recent_emojis` | inbox |
| `tpos_pancake_selected_page` | tpos-pancake |
| `tpos_selected_page` | tpos-pancake |
| `tpos_pancake_server_mode` | tpos-pancake |
| `inbox_current_filter` | inbox |

### Files cần sửa:

1. **`tpos-pancake/js/pancake-chat.js`** - emojis, selected page, server mode
2. **`tpos-pancake/js/tpos-chat.js`** - tpos_selected_page
3. **`inbox/js/inbox-chat.js`** - inbox emojis, filter

---

## Phase 5: Keys GIỮ LẠI ở localStorage (KHÔNG chuyển)

Những key nhỏ, cần đọc **đồng bộ (sync)** khi trang load, hoặc cần trước khi IndexedDB sẵn sàng:

| Key | Lý do giữ |
|-----|-----------|
| `isLoggedIn` | Check nhanh khi load trang, trước khi IndexedDB init |
| `userType` | Cần sync read cho permission check |
| `remember_login_preference` | Boolean nhỏ, cần trước login flow |
| `sidebarCollapsed` | UI state nhỏ, cần render ngay |
| `appFontSize` | Cần apply CSS trước khi render |
| `appTheme` / `theme` | Cần apply theme trước first paint (tránh flash) |
| `ordersTableFontSize` | CSS setting nhỏ |
| `currentTab` / `bh_main_tab` | Tab state nhỏ |
| `bh_view_mode` | View mode nhỏ |
| `inventory_lang_mode` | Nhỏ, cần sync |
| `gemini_selected_model` | Nhỏ |
| `currentUser` | String nhỏ |
| `n2store_selected_shop` | String nhỏ, cần sync cho token lookup |
| `checkLogin` | Timestamp nhỏ |
| `last_realtime_check` | Timestamp nhỏ |
| `po_image_cleanup_last_run` | Date string nhỏ |
| `orderIsMergeVariants` | Boolean nhỏ |
| `orderIsHideEditControls` | Boolean nhỏ |
| `soluongIsMergeVariants` | Boolean nhỏ |
| `soluongIsHideEditControls` | Boolean nhỏ |
| `cartHistoryExpanded` | Boolean nhỏ |
| `om_current_campaign_id` | String nhỏ |
| `saleBillTypePreference` | String nhỏ |
| `fastSaleBillTypePreference` | String nhỏ |
| `balanceHistory_livemode_show_confirmed` | Boolean nhỏ |
| `quy-trinh-notes-visible` | Boolean nhỏ |
| `tpos_realtime_enabled` | Boolean nhỏ |
| `tpos_realtime_room` | String nhỏ |
| `tpos_chat_realtime_*` | Debug flags nhỏ |
| `orders_chat_realtime_*` | Debug flags nhỏ |
| `orders_campaign_user_id` | String nhỏ |
| `orders_table_name` | String nhỏ |

---

## Chi tiết Implementation

### Bước 1: Tạo `shared/js/indexed-db-store.js`

```js
// API Design
const n2db = new N2IndexedDB('n2store', 1);

// Object stores
const STORES = {
    AUTH: 'auth',
    CACHE: 'cache',
    FILTERS: 'filters',
    CHAT: 'chat',
    SETTINGS: 'settings'
};

// Sử dụng
await n2db.setItem('auth', 'loginindex_auth', userData);
const user = await n2db.getItem('auth', 'loginindex_auth');

// Với TTL (auto-expire)
await n2db.setItem('cache', 'socialOrders', data, { ttl: 24 * 60 * 60 * 1000 }); // 24h

// Batch operations
await n2db.setMultiple('cache', {
    'socialOrders': ordersData,
    'socialOrderTags': tagsData
});
```

### Bước 2: Tạo `shared/js/storage-migration.js` (hoặc mở rộng file hiện có)

Script migration tự động chạy 1 lần khi user mở app:

```js
async function migrateLocalStorageToIndexedDB() {
    const MIGRATION_KEY = 'n2store_idb_migrated_v1';
    if (localStorage.getItem(MIGRATION_KEY)) return; // đã migrate

    // Map: localStorage key → { store, key }
    const MIGRATION_MAP = {
        'loginindex_auth': { store: 'auth' },
        'bearer_token_data_1': { store: 'auth' },
        'bearer_token_data_2': { store: 'auth' },
        'socialOrders': { store: 'cache' },
        // ... tất cả keys cần migrate
    };

    for (const [lsKey, config] of Object.entries(MIGRATION_MAP)) {
        const value = localStorage.getItem(lsKey);
        if (value !== null) {
            await n2db.setItem(config.store, lsKey, value);
            localStorage.removeItem(lsKey);
        }
    }

    localStorage.setItem(MIGRATION_KEY, Date.now().toString());
}
```

### Bước 3: Tạo helper functions cho từng module

```js
// shared/js/auth-storage.js - Helper cho auth data
const AuthStorage = {
    async getLoginAuth() {
        return await n2db.getItem('auth', 'loginindex_auth');
    },
    async setLoginAuth(data) {
        await n2db.setItem('auth', 'loginindex_auth', data);
    },
    async getToken(companyId) {
        return await n2db.getItem('auth', `bearer_token_data_${companyId}`);
    },
    async setToken(companyId, data) {
        await n2db.setItem('auth', `bearer_token_data_${companyId}`, data);
    }
};
```

### Bước 4: Update từng module theo phase

Mỗi file cần sửa theo pattern:

```js
// TRƯỚC (sync)
const data = JSON.parse(localStorage.getItem('socialOrders') || '[]');

// SAU (async)
const data = await n2db.getItem('cache', 'socialOrders') || [];
```

**Lưu ý quan trọng:** Chuyển từ sync → async có thể yêu cầu refactor function chứa nó sang `async function`. Cần cẩn thận với:
- Event handlers: `onclick = async () => { ... }`
- Init functions: `async function init() { ... }`
- Module load order: đảm bảo IndexedDB wrapper load trước tất cả modules khác

---

## Thứ tự thực hiện chi tiết

### Sprint 1: Foundation (Phase 0)
- [ ] Tạo `shared/js/indexed-db-store.js` - IndexedDB wrapper class
- [ ] Tạo `shared/js/storage-migration.js` - Migration script
- [ ] Tạo `shared/js/auth-storage.js` - Auth helper
- [ ] Unit test wrapper trên browser
- [ ] Thêm `<script>` tags vào tất cả HTML files (trước các script khác)

### Sprint 2: Auth & Tokens (Phase 1)
- [ ] Migrate `shared/js/token-manager.js`
- [ ] Migrate `shared/js/shared-auth-manager.js`
- [ ] Migrate `index/login.js`
- [ ] Migrate `shared/js/navigation-modern.js` + navigation-*.js
- [ ] Migrate `orders-report/js/core/bill-token-manager.js`
- [ ] Migrate `tpos-pancake/js/pancake-token-manager.js`
- [ ] Migrate `shared/js/pancake-token-manager.js`
- [ ] Migrate `order-management/js/main.js` + order-list.js
- [ ] Migrate `soluong-live/js/main.js`
- [ ] Test toàn bộ login flow + token refresh
- [ ] Test multi-company switching

### Sprint 3: Cache Data (Phase 2)
- [ ] Migrate `orders-report/js/tab-social/tab-social-sale.js`
- [ ] Migrate `orders-report/js/tab1/tab1-order-history.js`
- [ ] Migrate `orders-report/js/managers/pancake-data-manager.js`
- [ ] Migrate `orders-report/js/tab3/tab3-core.js` + tab3-removal.js
- [ ] Migrate `orders-report/js/chat/message-template-manager.js`
- [ ] Migrate `inbox/js/inbox-data.js` + inbox-orders.js
- [ ] Migrate `shared/js/quick-reply-manager.js`
- [ ] Migrate `shared/js/navigation-modern.js` (menu data)
- [ ] Migrate `supplier-debt/js/main.js`
- [ ] Test tất cả data loading/saving

### Sprint 4: Filters & Chat (Phase 3 + 4)
- [ ] Migrate orders-report filter files
- [ ] Migrate soquy filter/column files
- [ ] Migrate order-management/soluong-live display settings
- [ ] Migrate tpos-pancake chat settings
- [ ] Migrate inbox chat settings
- [ ] Test filter persistence
- [ ] Test chat functionality

### Sprint 5: Cleanup & Optimization
- [ ] Xóa tất cả Firestore persistence keys cũ (cleanup script)
- [ ] Thêm TTL cho cache entries
- [ ] Thêm storage size monitoring (debug tool)
- [ ] Kiểm tra localStorage usage giảm xuống < 1MB
- [ ] Test toàn bộ hệ thống end-to-end
- [ ] Cleanup: xóa migration code sau khi tất cả users đã migrate

---

## Tổng kết

| Metric | Trước | Sau |
|--------|-------|-----|
| localStorage usage | ~5MB (FULL) | < 500KB |
| IndexedDB usage | 0 | ~2-5MB |
| Giới hạn storage | 5MB | Hàng trăm MB |
| QuotaExceededError | Thường xuyên | Không còn |
| Keys trong localStorage | 88+ | ~30 (chỉ small flags) |
| Keys trong IndexedDB | 0 | ~58 |

**Tổng files cần sửa: ~40 files**
**Tổng keys cần migrate: ~58 keys**
**Keys giữ localStorage: ~30 keys**
