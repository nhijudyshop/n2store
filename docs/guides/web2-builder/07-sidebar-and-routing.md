<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. -->

# 07 — Sidebar và Routing

## Files

| File | Vai trò |
|------|--------|
| `web2-shared/tpos-menu.json` | Source of truth: 87 link TPOS (label, href, group, slug) |
| `web2-shared/tpos-sidebar.js` | `Web2Sidebar.mount(rootSel, opts)` |
| `web2-shared/tpos-sidebar.css` | Style dark rail, group, hover, active |
| `shared/js/navigation-modern.js` | Sidebar chính của project (orders-report, ...) — chứa group "Web 2.0" link đến các trang Web2 |

## tpos-menu.json shape

```json
[
    {
        "group": "Sản phẩm",
        "icon": "package",
        "items": [
            {
                "label": "Nhóm sản phẩm",
                "href":  "https://tomato.tpos.vn/#/app/productcategory/list",
                "slug":  "productcategory",
                "our":   "../web2/product-category/index.html"
            },
            {
                "label": "Đơn vị tính",
                "href":  "https://tomato.tpos.vn/#/app/productuom/list",
                "slug":  "productuom",
                "our":   ""
            }
        ]
    }
]
```

| Field | Mô tả |
|-------|------|
| `group` | Tên group (12 nhóm) |
| `icon` | Lucide icon name |
| `items[].label` | Label hiển thị |
| `items[].href` | URL TPOS gốc (fallback nếu chưa có Web2 page) |
| `items[].slug` | Match với `?active=` query string để highlight |
| `items[].our` | Đường dẫn nội bộ (rỗng = mở TPOS) |

## Web2Sidebar.mount API

```js
Web2Sidebar.mount('#sidebar', {
    active: 'productcategory',     // slug của trang hiện tại → highlight
    expand: ['Sản phẩm'],          // group nào mở mặc định
});
```

Behavior:
- Render 12 group, mỗi group collapsible.
- Click item có `our` → window.location = our.
- Click item không có `our` → window.open(href, '_blank').
- Highlight item nếu `item.slug === opts.active`.
- Auto-expand group chứa active item.

## Active state — quy ước truyền

Có 2 cách:

### A. Truyền explicit qua opts
```js
Web2Sidebar.mount('#root', { active: 'productcategory' });
```

### B. Auto-detect từ URL
Sidebar tự đọc `?active=` hoặc parse pathname (vd. `/web2/product-category/` → slug `productcategory`).

Hiện tại dùng cách A (explicit) cho rõ ràng.

## Group "Web 2.0" trong navigation-modern (sidebar chính)

`shared/js/navigation-modern.js` có thêm group "Web 2.0" chứa link đến:
- TPOS-Pancake live tool (`/tpos-pancake/`)
- Native Orders (`/native-orders/`)
- Kho SP (`/web2-products/`)
- Các trang TPOS-clone (`/web2/<slug>/`) — sẽ thêm dần khi có

Khi tạo trang mới, thêm vào cả 2:
1. `web2-shared/tpos-menu.json` → set `our` field (sidebar trong page)
2. `shared/js/navigation-modern.js` → group "Web 2.0" (sidebar chính)

> Để giảm trùng lặp, có thể đọc tpos-menu.json từ navigation-modern.js trong tương lai (chưa làm).

## URL convention

| Page | Path |
|------|------|
| Native orders | `/native-orders/` |
| Product warehouse | `/web2-products/` |
| Generic TPOS-clone | `/web2/<page-slug>/` (vd. `web2/product-category/`) |
| TPOS-Pancake live | `/tpos-pancake/` |

Slug folder dùng kebab-case (`product-category`), entity slug dùng lowercase no-dash (`productcategory`) — match với TPOS URL.

## Khi sửa tpos-menu.json

Hiện tại sidebar JS có thể inline data hoặc fetch từ JSON file. Nếu fetch:
- Cache busting: `?v=${Date.now()}` khi develop.
- Sau push: GitHub Pages cache có thể giữ JSON cũ ~5 phút.
