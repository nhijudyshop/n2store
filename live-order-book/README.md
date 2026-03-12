# Live Order Book — Quản lý Order theo Đợt Live

Module quản lý sổ order sản phẩm cho nhà cung cấp, tổ chức theo từng đợt live. Hỗ trợ thêm sản phẩm từ TPOS, quản lý số lượng (soldQty / orderedQty), ẩn/hiện sản phẩm, lưu/khôi phục lịch sử giỏ hàng, và hiển thị dạng grid phóng to trên màn hình lớn.

## Chức năng chính

- **Quản lý đợt live (Session)**: Tạo, xóa, đổi tên — mỗi đợt live có danh sách sản phẩm riêng biệt
- **Thêm sản phẩm từ TPOS**: Tìm kiếm qua API, chọn variant, tự động lấy thông tin (tên, ảnh, giá, mã SP)
- **Quản lý số lượng**: soldQty (+/- nhanh), orderedQty (nhập trực tiếp) — đồng bộ realtime
- **Ẩn/Hiện sản phẩm**: Ẩn SP không cần hiển thị, xem và khôi phục tại trang SP ẩn
- **Đổi ảnh sản phẩm**: Paste clipboard, upload file, chụp camera, nhập URL
- **Lịch sử giỏ hàng**: Lưu snapshot, khôi phục, auto-save trước khi restore
- **Hiển thị phóng to (Display)**: Grid toàn màn hình, cài đặt cột/hàng/gap/fontSize từ Admin
- **Đồng bộ realtime**: Mọi thay đổi cập nhật ngay trên tất cả thiết bị đang mở

## Cấu trúc thư mục

```
live-order-book/
├── index.html                  # Trang Admin — quản lý session, sản phẩm, cài đặt
├── order-list.html             # Trang Display — grid phóng to
├── hidden-products.html        # Trang SP ẩn
├── firebase-helpers.js         # Core Firebase CRUD (ES Module)
├── firebase-helpers-global.js  # Wrapper expose ra window.LiveOrderHelpers
├── js/
│   ├── main.js                 # Logic trang Admin
│   ├── order-list.js           # Logic trang Display
│   └── hidden-products.js      # Logic trang SP ẩn
├── css/
│   └── main.css                # Styles chung
└── README.md
```

## Firebase Paths

| Path | Mô tả |
|---|---|
| `liveOrderSessions/{sessionId}` | Thông tin session (name, date, createdAt, productCount) |
| `liveOrderProducts/{sessionId}/{productKey}` | Dữ liệu sản phẩm đầy đủ (info + qty) |
| `liveOrderProductsQty/{sessionId}/{productKey}` | Chỉ soldQty + orderedQty (source of truth cho qty) |
| `liveOrderProductsMeta/{sessionId}` | Metadata: sortedIds, count, lastUpdated |
| `liveOrderDisplaySettings/{sessionId}` | Cài đặt hiển thị: gridColumns, gridRows, gridGap, fontSize |
| `liveOrderCartHistory/{sessionId}/{snapshotId}` | Lịch sử giỏ hàng (snapshots) |

## Kiến trúc Dual-Node

Module sử dụng kiến trúc tách riêng qty ra node riêng (tương tự `soluong-live`):

- **Products node** (`liveOrderProducts`): Chứa toàn bộ thông tin SP (~2-5KB/product)
- **Qty node** (`liveOrderProductsQty`): Chỉ chứa soldQty + orderedQty (~60 bytes/product)

Khi cập nhật qty → ghi vào CẢ HAI nodes. Khi load → merge với qty node là source of truth. Listener qty riêng giúp giảm bandwidth khi chỉ thay đổi số lượng.

## Dependencies

- Firebase Realtime Database (compat SDK)
- `shared/js/firebase-config.js` — Firebase config
- `shared/js/shared-auth-manager.js` — Auth management
- `shared/js/tpos-config.js` — TPOS API config
- `shared/js/permissions-helper.js` — Permission check
- `shared/js/navigation-modern.js` — Navigation bar
- TPOS Excel API (qua Cloudflare proxy) — Tìm kiếm sản phẩm

## Phân quyền

Module đã đăng ký trong `PAGES_REGISTRY` (`user-management/js/permissions-registry.js`) với key `live-order-book`. Auth check sử dụng shared AuthManager trên cả 3 trang.
