<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. -->

# 05 — TPOS Theme CSS

File: `native-orders/css/tpos-theme.css` — class dùng chung cho mọi trang Web 2.0.

## Naming convention

Tất cả class TPOS-clone prefix `tpos-` để không đụng class khác trong project.

## Button classes

```html
<button class="tpos-btn tpos-btn-primary tpos-btn-sm">Áp dụng</button>
<button class="tpos-btn tpos-btn-success tpos-btn-sm">Thêm mới</button>
<button class="tpos-btn tpos-btn-danger tpos-btn-xs">Xóa</button>
<button class="tpos-btn tpos-btn-default tpos-btn-sm">Tải lại</button>
```

| Class | Màu | Dùng cho |
|-------|-----|---------|
| `tpos-btn-primary` | xanh #3c8dbc | Lưu / Áp dụng |
| `tpos-btn-success` | xanh lá #43a047 | Thêm mới / Tạo |
| `tpos-btn-danger` | đỏ #f05050 | Xóa |
| `tpos-btn-warning` | cam | Sửa quan trọng |
| `tpos-btn-default` | trắng viền xám | Tải lại / Hủy / Filter |

Size: `tpos-btn-xs` (24px), `tpos-btn-sm` (28px), default (32px).

## Status text (TPOS dùng plain text, KHÔNG pill)

```html
<span class="tpos-status-text confirmed">Đã xác nhận</span>
<span class="tpos-status-text cancelled">Tạm dừng</span>
<span class="tpos-status-text draft">Nháp</span>
```

> ⚠ TPOS render status là plain text màu (không có background pill). Đã verify qua diff iter 4. Đừng wrap pill.

## Cell helpers

```html
<td class="tpos-cell-center">12/01/2026 14:30</td>
<td class="tpos-cell-right">1.250.000</td>
```

## Table

Dùng class chuẩn của project (không cần TPOS-specific):
- `.data-table` (header xám, border 1px)
- `.table-scroll` (overflow-x scroll)
- `.search-section`, `.filter-row`, `.search-wrapper`, `.search-input`
- `.modal-overlay`, `.modal-content`, `.modal-header`, `.modal-body`, `.modal-footer`
- `.spinner`, `.empty-row`, `.loading-row`

Các class này có sẵn trong `native-orders/css/native-orders.css` + `web2-products/css/web2-products.css`. Chuẩn hóa sang shared trong tương lai.

## Sidebar (Web 2.0 group)

File: `web2-shared/tpos-sidebar.css` — dark rail #1c2b36, collapsible groups.

12 groups:
1. App / Dashboard
2. Sản phẩm (productcategory, productuom, attributes, ...)
3. Đối tác (customer, supplier, partnercategory)
4. Bán hàng (fastsaleorder, salequotation, saleorder)
5. Mua hàng (fastpurchaseorder)
6. Kho (stockpicking, stockmove, stockinventory)
7. POS
8. Live (liveCampaign)
9. Tài chính (account*, payment*)
10. Khuyến mãi (promotion, coupon, loyalty)
11. Báo cáo (report/*)
12. Cấu hình (configs/*, applicationuser, company, ...)

Total 87 link (chuẩn TPOS sidebar).

## Tham khảo nhanh — palette TPOS

```css
:root {
    --tpos-bg-rail:        #1c2b36;
    --tpos-bg-rail-hover:  #2c3b46;
    --tpos-bg-page:        #ecf0f5;
    --tpos-bg-card:        #ffffff;
    --tpos-text-primary:   #444444;
    --tpos-text-muted:     #777777;
    --tpos-border:         #d2d6de;

    --tpos-primary:        #3c8dbc;
    --tpos-primary-hover:  #357ca5;
    --tpos-success:        #43a047;
    --tpos-success-hover:  #388e3c;
    --tpos-danger:         #f05050;
    --tpos-warning:        #f39c12;

    --tpos-status-confirmed: #00a65a;
    --tpos-status-draft:     #f39c12;
    --tpos-status-cancelled: #dd4b39;
}
```
