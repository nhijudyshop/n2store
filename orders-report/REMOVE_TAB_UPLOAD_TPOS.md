# Hướng Dẫn Xóa Tab Upload TPOS

> **Ngày tạo:** 2025-12-15  
> **Mục đích:** Xóa tab "Upload Đơn Hàng Lên TPOS" vì chức năng đã được tích hợp vào `tab3-product-assignment.html`

---

## 📋 Tổng Quan

Tab `tab-upload-tpos` có các chức năng:
- Hiển thị danh sách sản phẩm đã gán STT
- Upload sản phẩm lên TPOS API
- Chốt đợt live (Finalize Session)
- Lịch sử upload / Lịch sử chốt đợt

**Lý do xóa:** Chức năng upload đã được tích hợp vào `tab3-product-assignment.html` (section "Upload Sản Phẩm Lên TPOS", dòng 105-193).

> [!CAUTION]
> **Chức năng "Chốt đợt live" sẽ bị mất** nếu xóa tab này mà không migrate sang tab3!

---

## 🗂️ Files Cần Xóa

| File | Đường dẫn | Ghi chú |
|------|-----------|---------|
| HTML | `/Users/mac/Downloads/n2store/orders-report/tab-upload-tpos.html` | 381 dòng |
| CSS | `/Users/mac/Downloads/n2store/orders-report/tab-upload-tpos.css` | Styling |
| JavaScript | `/Users/mac/Downloads/n2store/orders-report/tab-upload-tpos.js` | ~6500+ dòng |

---

## 🔧 Files Cần Sửa

### 1. `main.html` (Dòng 207-209 và 235-237)

**Xóa tab button:**
```html
<!-- XÓA DÒNG 207-209 -->
<button class="tab-button" onclick="switchTab('upload')" data-tab="upload">
    <i data-lucide="upload" class="tab-icon"></i>
    Upload Đơn Hàng Lên TPOS
</button>
```

**Xóa iframe:**
```html
<!-- XÓA DÒNG 235-237 -->
<div id="uploadTab" class="tab-content">
    <iframe id="uploadFrame" src="tab-upload-tpos.html"></iframe>
</div>
```

**Xóa switch case:** (Dòng 298-301)
```javascript
// XÓA TRONG switchTab function:
} else if (tabName === "upload") {
    document
        .getElementById("uploadTab")
        .classList.add("active");
```

**Cập nhật savedTab check:** (Dòng 476)
```javascript
// XÓA "upload" từ array:
if (savedTab && ["orders", "statistics", "product-assignment", "overview", "report-online"].includes(savedTab)) {
```

---

## 🔥 Firebase Realtime Database - Collections Cần Xóa

### Collections của tab-upload-tpos:

| Collection Path | Mô tả | Có thể xóa? |
|-----------------|-------|-------------|
| `uploadSessionFinalize` | Lưu thống kê các đợt chốt live | ✅ **XÓA ĐƯỢC** |
| `productAssignments_history` | Lịch sử upload (tab-upload-tpos) | ✅ **XÓA ĐƯỢC** |

> [!NOTE]
> Tab3 sử dụng collection riêng: `productAssignments_v2_history` nên không bị ảnh hưởng!

### Cách xóa trên Firebase Console:

1. Truy cập: https://console.firebase.google.com/
2. Chọn project của bạn
3. Vào **Realtime Database**
4. Tìm và xóa các nodes sau:

```
Firebase Realtime Database
├── uploadSessionFinalize        ← XÓA NODE NÀY
│   ├── 1702600000000
│   └── ...
│
└── productAssignments_history   ← XÓA NODE NÀY
    ├── user_xxx
    │   ├── upload_xxx
    │   └── ...
    └── ...
```

> [!TIP]
> **Giữ lại `productAssignments_v2_history`** - Đây là lịch sử upload của tab3!

---

## ✅ Checklist Xóa

- [ ] Backup các file trước khi xóa
- [ ] Xóa `tab-upload-tpos.html`
- [ ] Xóa `tab-upload-tpos.css`
- [ ] Xóa `tab-upload-tpos.js`
- [ ] Sửa `main.html`:
  - [ ] Xóa tab button (dòng 207-209)
  - [ ] Xóa iframe container (dòng 235-237)
  - [ ] Xóa switch case trong `switchTab()` (dòng 298-301)
  - [ ] Cập nhật savedTab array (dòng 476)
- [ ] Xóa collection `uploadSessionFinalize` trên Firebase
- [ ] Test lại ứng dụng

---

## 🔍 Xác Nhận Không Có Dependencies Khác

Đã kiểm tra:
- `tab3-product-assignment.js` - Chỉ có **comments** đề cập đến `tab-upload-tpos` (không phải code gọi)
- Không có file JS nào khác import/require `tab-upload-tpos.js`
- Không có cross-iframe communication đến `uploadFrame` (ngoại trừ `main.html`)

---

## ⚡ Tính Năng Bị Mất (Cần Migrate Nếu Cần)

| Tính năng | Có trong tab3? | Ghi chú |
|-----------|----------------|---------|
| Hiển thị SP đã gán | ✅ Có | Section "Upload Sản Phẩm Lên TPOS" |
| Upload lên TPOS | ✅ Có | Nút "Upload TPOS" |
| Lịch sử Upload | ✅ Có | "Upload History V2" |
| So sánh giỏ hàng | ✅ Có | Modal so sánh |
| **Chốt đợt live** | ❌ **KHÔNG** | Cần migrate nếu muốn giữ |
| **Lịch sử chốt đợt** | ❌ **KHÔNG** | Cần migrate nếu muốn giữ |
| Hard Refresh Firebase | ❌ **KHÔNG** | Có thể add vào tab3 nếu cần |

---

## 📝 Lệnh Terminal Xóa Files

```bash
# Backup trước
cp /Users/mac/Downloads/n2store/orders-report/tab-upload-tpos.html /Users/mac/Downloads/n2store/orders-report/backup/
cp /Users/mac/Downloads/n2store/orders-report/tab-upload-tpos.css /Users/mac/Downloads/n2store/orders-report/backup/
cp /Users/mac/Downloads/n2store/orders-report/tab-upload-tpos.js /Users/mac/Downloads/n2store/orders-report/backup/

# Xóa files
rm /Users/mac/Downloads/n2store/orders-report/tab-upload-tpos.html
rm /Users/mac/Downloads/n2store/orders-report/tab-upload-tpos.css
rm /Users/mac/Downloads/n2store/orders-report/tab-upload-tpos.js
```

---

*Được tạo bởi hệ thống tự động - Vui lòng kiểm tra kỹ trước khi thực hiện xóa.*
