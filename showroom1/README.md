# Showroom — NHI JUDY

Trang demo showroom mobile (lưới sản phẩm hàng mới về).

## Tính năng
- Lưới sản phẩm 2 cột, ảnh tỷ lệ 3:4
- Vuốt ngang xem nhiều ảnh mỗi sản phẩm (chấm tròn chỉ vị trí)
- Hàng bộ lọc kéo trượt: Tất cả · Quần · Áo · Set · Đầm · Phụ kiện · Sale
- Chạm ảnh để thêm vào giỏ, chạm tim để lưu yêu thích (toast thông báo)
- Trên điện thoại thật: hiển thị toàn màn hình; trên desktop: hiển thị trong khung phone

## Cấu trúc
```
showroom/
├── index.html      # toàn bộ trang (HTML + CSS + JS)
├── assets/         # ảnh sản phẩm demo (thay bằng ảnh thật của shop)
└── README.md
```

## Thay ảnh thật
Thay các file trong `assets/` (giữ nguyên tên file, tỷ lệ 3:4 ~600×800) hoặc sửa `src` của các thẻ `<img class="pimg">` trong `index.html`.

Phụ thuộc ngoài: Google Fonts (Be Vietnam Pro, Cormorant Garamond) và Lucide icons qua CDN.
