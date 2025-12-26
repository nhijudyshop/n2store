# Phân Tích Sử Dụng Firebase Realtime Database

> **Ngày tạo:** 26/12/2024  
> **Firebase Project:** `n2shop-69e37`  
> **Database URL:** `https://n2shop-69e37-default-rtdb.asia-southeast1.firebasedatabase.app`

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

## 🟢 CÓ THỂ XÓA/DỌN DẸP - 10+ collections

Những collections này có thể **không còn sử dụng** hoặc là backup:

| Collection | Lý do | Hành động |
|------------|-------|-----------|
| `savedProducts_backup_1763059438681` | Backup cũ | 🗑️ XÓA |
| `orderProducts` vs `order_products` | Duplicate? | 🔍 Kiểm tra |
| `orderProductsMeta` vs `soluongProductsMeta` | Duplicate? | 🔍 Kiểm tra |
| `orderSyncCurrentPage` | Có thể dùng localStorage | ⚡ Migrate |
| `orderSyncSearchData` | Có thể dùng localStorage | ⚡ Migrate |
| `soluongSyncCurrentPage` | Có thể dùng localStorage | ⚡ Migrate |
| `soluongSyncSearchData` | Có thể dùng localStorage | ⚡ Migrate |
| `syncSearchKeyword` | Có thể dùng localStorage | ⚡ Migrate |

---

## 🔵 SETTINGS (Có thể dùng Firestore hoặc localStorage) - 10 collections

| Collection | Hiện tại | Đề xuất |
|------------|----------|---------|
| `displaySettings` | RTDB | localStorage per-user |
| `orderDisplaySettings` | RTDB | localStorage per-user |
| `soluongDisplaySettings` | RTDB | localStorage per-user |
| `hiddenProductsDisplaySettings` | RTDB | localStorage per-user |
| `isHideEditControls` | RTDB | localStorage |
| `isMergeVariants` | RTDB | localStorage |
| `orderIsMergeVariants` | RTDB | localStorage |
| `soluongIsMergeVariants` | RTDB | localStorage |
| `settings` | RTDB | Firestore (nếu cần sync) |
| `user_preferences` | RTDB | Firestore (nếu cần sync) |
| `user_campaigns` | RTDB | Firestore |

---

## 📈 ƯỚC TÍNH TIẾT KIỆM

| Hành động | Collections | Tiết kiệm |
|-----------|-------------|-----------|
| Chuyển History → Firestore | 9 | 40-50% |
| Chuyển Cache/Static → Firestore | 4 | 15-20% |
| Xóa backup/unused | 5+ | 10% |
| Settings → localStorage | 10 | 15-20% |
| **TỔNG** | | **80-100%** |

---

## 📋 KẾ HOẠCH HÀNH ĐỘNG

### Giai đoạn 1: Dọn dẹp (1 ngày)
- [ ] Xóa `savedProducts_backup_*`
- [ ] Kiểm tra duplicate: `orderProducts` vs `order_products`
- [ ] Export backup toàn bộ database

### Giai đoạn 2: Migrate History (2-3 ngày)
- [ ] `dropped_products_history` → Firestore
- [ ] `bulkTagHistory` + `bulkTagDeleteHistory` → Firestore
- [ ] `cartHistory` + `soluongCartHistory` → Firestore

### Giai đoạn 3: Migrate Cache (1 ngày)
- [ ] `pancake_images` → Firestore
- [ ] `report_order_details` → Firestore

### Giai đoạn 4: Migrate Settings (1 ngày)
- [ ] Display settings → localStorage
- [ ] User preferences → Firestore

---

## 📝 Ghi Chú

- **QUAN TRỌNG:** Backup data trước khi xóa/migrate
- Test kỹ multi-user features sau migration
- Monitor Firebase usage sau 1 tuần để đánh giá hiệu quả
