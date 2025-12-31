# Employee Ranges Migration to Firestore - README

## 📋 Tổng Quan

Migration này chuyển **chỉ phần Employee Ranges** từ Realtime Database sang Firestore, giữ nguyên phần orders data ở RTDB.

**Trạng thái:** ✅ Code đã sẵn sàng, chờ chạy migration script

---

## 🚀 Bước 1: Tạo Firestore Indexes (BẮT BUỘC)

Trước khi chạy migration, bạn **PHẢI** tạo composite indexes trong Firebase Console:

### Cách tạo Indexes:

1. Vào [Firebase Console](https://console.firebase.google.com/)
2. Chọn project của bạn
3. Cloud Firestore → Indexes → Composite
4. Tạo 2 indexes sau:

#### Index 1: Query by campaignId
```
Collection ID: employeeRanges
Fields:
  - campaignId (Ascending)
  - start (Ascending)
Query scope: Collection
```

#### Index 2: Query by isGeneral
```
Collection ID: employeeRanges
Fields:
  - isGeneral (Ascending)
  - start (Ascending)
Query scope: Collection
```

**Lưu ý:** Indexes có thể mất 5-10 phút để build xong.

---

## 🔄 Bước 2: Chạy Migration Script

### Cách chạy:

1. Mở file `main.html` trong browser
2. Đăng nhập với tài khoản admin
3. Mở Console (F12)
4. Copy toàn bộ nội dung file `migrate-employee-ranges.js`
5. Paste vào Console và Enter
6. Chạy lệnh:

```javascript
await migrateEmployeeRanges()
```

### Output mong đợi:

```
[MIGRATION] 🚀 Starting Employee Ranges migration...
[MIGRATION] 📋 Step 1: Migrating general employee ranges...
[MIGRATION] Found 3 general ranges
[MIGRATION] ✅ Migrated 3 general ranges
[MIGRATION] 📋 Step 2: Migrating campaign-specific employee ranges...
[MIGRATION] Found 5 campaigns
[MIGRATION] Processing campaign "Live_Sale_25_12_2024" (3 ranges)
[MIGRATION]   ✅ Migrated 3 ranges for "Live_Sale_25_12_2024"
...
============================================================
[MIGRATION] 🎉 MIGRATION COMPLETED
============================================================
✅ Total documents migrated: 18
✅ No errors
📊 Total documents in Firestore: 18
```

### Verify Migration:

Chạy lệnh verify để kiểm tra:

```javascript
await verifyMigration()
```

Output:
```
[VERIFY] RTDB: 18 records (3 general + 15 campaign)
[VERIFY] Firestore: 18 documents
[VERIFY] ✅ Record counts match!
```

---

## ✅ Bước 3: Test Chức Năng

Sau khi migration xong, test các chức năng:

### Test 1: Load General Employee Ranges
1. Vào tab "Quản Lý Đơn Hàng"
2. Click nút "Phân Chia Nhân Viên"
3. Để dropdown là "Cấu hình chung"
4. Kiểm tra danh sách nhân viên hiển thị đúng với ranges đã save

### Test 2: Load Campaign-Specific Ranges
1. Vào tab "Quản Lý Đơn Hàng"
2. Chọn một campaign từ dropdown
3. Click "Phân Chia Nhân Viên"
4. Chọn campaign tương ứng trong dropdown
5. Kiểm tra ranges hiển thị đúng

### Test 3: Save New Ranges
1. Sửa ranges cho một nhân viên
2. Click "Áp dụng"
3. Kiểm tra message thành công
4. Reload page và verify ranges đã lưu

### Test 4: Statistics Calculation
1. Vào tab "Thống Kê"
2. Chọn một campaign
3. Kiểm tra "Thống Kê Theo Nhân Viên" hiển thị đúng
4. Verify số liệu match với employee ranges

---

## 🔥 Các Thay Đổi Chính

### 1. **Schema Changes**

**OLD (RTDB):**
```javascript
{
  id: "user_1",
  name: "Nhân viên A",
  start: 1,
  end: 50
}
```

**NEW (Firestore):**
```javascript
{
  employeeId: "user_1",
  employeeName: "Nhân viên A",
  start: 1,
  end: 50,
  campaignId: "Live_Sale_25_12_2024" | null,
  campaignName: "Live Sale 25/12/2024" | null,
  isGeneral: false | true,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### 2. **Không Cần Sanitization Nữa**

**OLD:**
```javascript
const safeName = campaignName.replace(/[.$#\[\]\/]/g, '_');
```

**NEW:**
```javascript
// Firestore cho phép special characters, không cần sanitize
const campaignId = campaignName;
```

### 3. **Không Cần normalizeEmployeeRanges() Nữa**

**OLD:**
```javascript
const data = snapshot.val();
const ranges = normalizeEmployeeRanges(data); // Convert object to array
```

**NEW:**
```javascript
const snapshot = await query.get();
const ranges = snapshot.docs.map(doc => doc.data()); // Already array
```

---

## 🛡️ Rollback Plan

Nếu gặp vấn đề, rollback ngay lập tức:

### Cách Rollback:

1. Mở Console (F12)
2. Chạy script rollback:

```javascript
await rollbackMigration()
```

Output:
```
[ROLLBACK] ⚠️  Rolling back migration...
[ROLLBACK] Found 18 documents to delete
[ROLLBACK] ✅ All Firestore documents deleted
[ROLLBACK] RTDB data remains intact
```

3. Revert code về commit trước:

```bash
git revert HEAD
```

**Lưu ý:** RTDB data vẫn giữ nguyên, không bị mất.

---

## 📊 Performance Comparison

### RTDB (Before)
- Read: Đọc toàn bộ node, sau đó normalize
- Write: Overwrite toàn bộ node
- Query: Không có compound queries
- Sanitization: Cần sanitize campaign names

### Firestore (After)
- Read: Query trực tiếp với filters, có index
- Write: Atomic batch operations
- Query: Compound queries, multi-field filters
- Sanitization: Không cần, support special characters

---

## 🐛 Troubleshooting

### Lỗi: "Missing index"
**Nguyên nhân:** Chưa tạo Firestore indexes
**Giải pháp:** Follow Bước 1 để tạo indexes, đợi 5-10 phút

### Lỗi: "Permission denied"
**Nguyên nhân:** Firestore rules chưa allow
**Giải pháp:** Update Firestore rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /employeeRanges/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### Data không khớp giữa RTDB và Firestore
**Nguyên nhân:** Migration incomplete
**Giải pháp:**
1. Chạy `await verifyMigration()` để check
2. Nếu không khớp, rollback và chạy lại migration

### Employee ranges không load
**Nguyên nhân:** Campaign ID không khớp
**Giải pháp:**
1. Check console logs
2. Verify campaign ID trong Firestore
3. Check field `campaignId` có match với `currentTableName` không

---

## 📚 Files Đã Thay Đổi

| File | Changes |
|------|---------|
| `tab1-orders.js` | ✅ Refactored to use Firestore |
| `tab-overview.html` | ✅ Refactored to use Firestore |
| `migrate-employee-ranges.js` | ✅ NEW: Migration script |
| `EMPLOYEE_RANGE_FIRESTORE_MIGRATION.md` | ✅ NEW: Migration plan |
| `FIRESTORE_MIGRATION_README.md` | ✅ NEW: This file |

---

## ✨ Benefits After Migration

✅ No more sanitization issues with campaign names
✅ No more object-to-array normalization
✅ Better query performance with indexes
✅ Auto-generated document IDs (no conflicts)
✅ Atomic batch operations
✅ Timestamps auto-managed
✅ Support for special characters in campaign names
✅ Easier to extend (can add more filters later)

---

## 📞 Support

Nếu gặp vấn đề:
1. Check console logs
2. Run verify script
3. Check Firebase Console
4. Rollback if critical

---

**Migration Date:** 2025-12-31
**Migrated By:** Claude AI
**Status:** ✅ Ready for deployment
