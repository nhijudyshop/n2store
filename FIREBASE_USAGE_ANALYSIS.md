# Phân Tích Sử Dụng Firebase Realtime Database

> **Ngày tạo:** 26/12/2024
> **Cập nhật lần cuối:** 26/12/2024
> **Firebase Project:** `n2shop-69e37`
> **Database URL:** `https://n2shop-69e37-default-rtdb.asia-southeast1.firebasedatabase.app`

---

## ✅ ĐÃ TỐI ƯU (26/12/2024)

**Tối ưu localStorage caching cho displaySettings:**
- `product-search/product-list.html` - localStorage cache + Firebase sync
- `product-search/index.html` - localStorage cache + Firebase sync
- `order-management/order-list.html` - localStorage cache + Firebase sync
- `soluong-live/soluong-list.html` - localStorage cache + Firebase sync

**Pattern được áp dụng:**
1. Load từ localStorage trước (instant load)
2. Sync từ Firebase (source of truth)
3. Cache vào localStorage khi Firebase cập nhật

**Lợi ích:** Trang load nhanh hơn mà vẫn giữ được tính năng multi-device sync.

---

## ⚠️ CẢNH BÁO QUAN TRỌNG

**KHÔNG ĐƯỢC di chuyển các collections sau sang localStorage:**

1. **Sync State Collections** (`syncCurrentPage`, `orderSyncCurrentPage`, `soluongSyncCurrentPage`, `syncSearchKeyword`, etc.)
   - Đây là tính năng đồng bộ realtime giữa nhiều users/devices
   - Khi bật "sync mode", tất cả users cùng nhìn thấy trang giống nhau
   - Di chuyển sang localStorage sẽ **PHÁ VỠ** tính năng này

2. **Settings Collections** (`displaySettings`, `isMergeVariants`, etc.)
   - Đây là tính năng đồng bộ cài đặt giữa các máy tính
   - **ĐÃ TỐI ƯU:** Dùng localStorage làm cache, Firebase vẫn là source of truth

---

## 📊 TỔNG QUAN: 45+ Collections

Dựa trên Firebase Console, có **45+ collections** đang active. Phân loại như sau:

---

## 🔴 CẦN GIỮ LẠI (Realtime Critical) - 8 collections

Những collections này **BẮT BUỘC** phải dùng Realtime Database:

| Collection | Module | Lý do |
|------------|--------|-------|
| `dropped_products` | orders-report | Multi-user realtime sync |
| `tag_updates` | orders-report | Realtime tag sync |
| `kpi_base` | orders-report | Quick lookup + realtime |
| `pancake_jwt_tokens` | orders-report | Token sync multi-device |
| `tpos_bearer_token` | orders-report | Token sync |
| `tpos_token` | orders-report | Token sync |
| `liveOrderTracking` | order-live-tracking | Realtime tracking |
| `syncCurrentPage` | nhiều modules | State sync |

---

## 🟡 CÓ THỂ CHUYỂN FIRESTORE - 15 collections

### History & Logs (Append-only, không cần realtime)

| Collection | Đề xuất | Tiết kiệm |
|------------|---------|-----------|
| `dropped_products_history` | ✅ Firestore | 25-30% |
| `bulkTagHistory` | ✅ Firestore | 5% |
| `bulkTagDeleteHistory` | ✅ Firestore | 5% |
| `cartHistory` | ✅ Firestore | 5% |
| `cartHistoryMeta` | ✅ Firestore | 2% |
| `soluongCartHistory` | ✅ Firestore | 5% |
| `soluongCartHistoryMeta` | ✅ Firestore | 2% |
| `productAssignments_v2_history` | ✅ Firestore | 5% |
| `uploadSessionFinalize` | ✅ Firestore | 3% |

### Static/Cache Data

| Collection | Đề xuất | Tiết kiệm |
|------------|---------|-----------|
| `pancake_images` | ✅ Firestore | 10% |
| `report_order_details` | ✅ Firestore | 10% |
| `savedProductsMeta` | ✅ Firestore | 3% |
| `savedProducts_backup_*` | 🗑️ XÓA | 5% |

---

## 🟢 CÓ THỂ XÓA/DỌN DẸP - 5 collections

Những collections này có thể **không còn sử dụng** hoặc là backup:

| Collection | Lý do | Hành động |
|------------|-------|-----------|
| `savedProducts_backup_1763059438681` | Backup cũ | 🗑️ XÓA |
| `orderProducts` vs `order_products` | Duplicate? | 🔍 Kiểm tra |
| `orderProductsMeta` vs `soluongProductsMeta` | Duplicate? | 🔍 Kiểm tra |

**⚠️ KHÔNG XÓA (Tính năng multi-user sync):**

| Collection | Lý do GIỮ LẠI |
|------------|---------------|
| `orderSyncCurrentPage` | Multi-user page sync feature |
| `orderSyncSearchData` | Multi-user search sync feature |
| `soluongSyncCurrentPage` | Multi-user page sync feature |
| `soluongSyncSearchData` | Multi-user search sync feature |
| `syncSearchKeyword` | Multi-user search sync feature |
| `syncCurrentPage` | Multi-user page sync feature |

---

## 🔵 SETTINGS (Multi-device sync) - 10 collections

**Lưu ý:** Các settings này sync giữa các máy tính. Không chuyển hoàn toàn sang localStorage!

| Collection | Hiện tại | Trạng thái | Ghi chú |
|------------|----------|------------|---------|
| `displaySettings` | RTDB | ✅ ĐÃ TỐI ƯU | localStorage cache + Firebase sync |
| `orderDisplaySettings` | RTDB | ✅ ĐÃ TỐI ƯU | localStorage cache + Firebase sync |
| `soluongDisplaySettings` | RTDB | ✅ ĐÃ TỐI ƯU | localStorage cache + Firebase sync |
| `hiddenProductsDisplaySettings` | RTDB | 📋 Chưa tối ưu | Có thể áp dụng pattern tương tự |
| `isHideEditControls` | RTDB | 📋 Chưa tối ưu | Có thể áp dụng pattern tương tự |
| `isMergeVariants` | RTDB | ✅ ĐÃ CÓ | Đã có localStorage cache |
| `orderIsMergeVariants` | RTDB | ✅ ĐÃ CÓ | Đã có localStorage cache |
| `soluongIsMergeVariants` | RTDB | ✅ ĐÃ CÓ | Đã có localStorage cache |
| `settings` | RTDB | 🟡 Giữ nguyên | Shared settings across users |
| `user_preferences` | RTDB | 🟡 Có thể Firestore | Per-user data |
| `user_campaigns` | RTDB | 🟡 Có thể Firestore | Per-user data |

---

## 📈 ƯỚC TÍNH TIẾT KIỆM (Đã cập nhật)

| Hành động | Collections | Tiết kiệm | Trạng thái |
|-----------|-------------|-----------|------------|
| localStorage caching cho Settings | 4 | 5-10% reads | ✅ ĐÃ LÀM |
| Chuyển History → Firestore | 9 | 40-50% | 📋 Cần thực hiện |
| Chuyển Cache/Static → Firestore | 4 | 15-20% | 📋 Cần thực hiện |
| Xóa backup | 3 | 5% | 📋 Cần thực hiện |
| **TỔNG THỰC TẾ** | | **65-85%** | |

**Lưu ý:** Ước tính 80-100% trước đó không chính xác vì:
- Sync collections phải giữ lại (tính năng multi-user)
- Settings cần Firebase sync (tính năng multi-device)

---

## 📋 KẾ HOẠCH HÀNH ĐỘNG

### ✅ Đã hoàn thành (26/12/2024)
- [x] Thêm localStorage caching cho `displaySettings` (4 files)
- [x] Cập nhật document phân tích với các cảnh báo quan trọng

### Giai đoạn 1: Dọn dẹp
- [ ] Xóa `savedProducts_backup_*`
- [ ] Kiểm tra duplicate: `orderProducts` vs `order_products`
- [ ] Export backup toàn bộ database

### Giai đoạn 2: Migrate History (Tùy chọn)
- [ ] `dropped_products_history` → Firestore
- [ ] `bulkTagHistory` + `bulkTagDeleteHistory` → Firestore
- [ ] `cartHistory` + `soluongCartHistory` → Firestore

### Giai đoạn 3: Migrate Cache (Tùy chọn)
- [ ] `pancake_images` → Firestore
- [ ] `report_order_details` → Firestore

### Giai đoạn 4: Tối ưu thêm (Tùy chọn)
- [ ] Áp dụng localStorage caching pattern cho `hiddenProductsDisplaySettings`
- [ ] Áp dụng localStorage caching pattern cho `isHideEditControls`

---

## 📝 Ghi Chú

- **QUAN TRỌNG:** Backup data trước khi xóa/migrate
- Test kỹ multi-user features sau migration
- Monitor Firebase usage sau 1 tuần để đánh giá hiệu quả
