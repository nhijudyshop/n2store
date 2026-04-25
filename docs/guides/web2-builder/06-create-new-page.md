<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. -->

# 06 — Cookbook: Tạo trang mới trong < 5 phút

> Mục tiêu: thêm 1 trang TPOS-clone từ A-Z. Ví dụ: trang "Đơn vị tính" (`productuom`).

## Bước 1 — Crawl spec từ TPOS (tùy chọn)

Mở `https://tomato.tpos.vn/#/app/productuom/list`. Ghi lại:
- Title bar / breadcrumb cha
- Cột bảng (header thứ tự + width approx)
- Filter bar (search box, dropdown nào)
- Toolbar buttons (Tải lại, Thêm mới, Xuất, ...)

Hoặc đọc spec đã crawl sẵn ở `/tmp/tpos-pages-spec/<slug>.json` (nếu có).

> Nếu spec thiếu, dùng default sensible: Mã / Tên / Ghi chú / Ngày tạo / Trạng thái.

## Bước 2 — Tạo file HTML

```bash
mkdir -p web2/product-uom
```

```html
<!-- web2/product-uom/index.html -->
<!DOCTYPE html>
<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. -->
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <title>Đơn vị tính — Web 2.0</title>
    <link rel="stylesheet" href="../../web2-shared/tpos-sidebar.css">
    <link rel="stylesheet" href="../../native-orders/css/tpos-theme.css">
    <link rel="stylesheet" href="../../native-orders/css/native-orders.css">
    <style>
        body { margin: 0; display: flex; min-height: 100vh; background: #ecf0f5; }
        #web2-sidebar-root { flex-shrink: 0; }
        main#main { flex: 1; padding: 12px 16px; overflow: auto; }
    </style>
</head>
<body class="has-web2-shell">
    <div id="web2-sidebar-root"></div>
    <main id="main"></main>

    <script src="https://unpkg.com/lucide@latest"></script>
    <script src="../../web2-shared/tpos-sidebar.js"></script>
    <script src="../../web2-shared/web2-api.js"></script>
    <script src="../../web2-shared/page-builder.js"></script>
    <script>
        Web2Sidebar.mount('#web2-sidebar-root', { active: 'productuom' });
        Web2Page.mount('#main', {
            slug: 'productuom',
            title: 'Đơn vị tính',
            breadcrumb: ['App', 'Sản phẩm'],
            columns: [
                { key: 'code',          label: 'Mã',          width: 120, align: 'center' },
                { key: 'name',          label: 'Tên đơn vị',  align: 'left' },
                { key: 'data.factor',   label: 'Hệ số',       width: 100, align: 'right' },
                { key: 'data.uomCateg', label: 'Nhóm ĐVT',    width: 160 },
                { key: 'data.note',     label: 'Ghi chú' },
            ],
            fields: [
                { key: 'code',          label: 'Mã',         type: 'text',     required: true,  placeholder: 'Cái, Hộp, Chai...' },
                { key: 'name',          label: 'Tên đơn vị', type: 'text',     required: true },
                { key: 'data.factor',   label: 'Hệ số',      type: 'number',   placeholder: '1' },
                { key: 'data.uomCateg', label: 'Nhóm ĐVT',   type: 'text' },
                { key: 'data.note',     label: 'Ghi chú',    type: 'textarea' },
            ],
        });
    </script>
</body>
</html>
```

## Bước 3 — Đăng ký vào sidebar

Mở `web2-shared/tpos-sidebar.js`, tìm group "Sản phẩm" → set `our` field cho item:

```js
{
    label: 'Đơn vị tính',
    href:  'https://tomato.tpos.vn/#/app/productuom/list',
    our:   '../web2/product-uom/index.html',   // ← path tương đối từ tpos-pancake/
    slug:  'productuom',                        // ← match active param
}
```

> Khi `our` có giá trị, sidebar sẽ render link → trang nội bộ. Nếu để trống, link mở thẳng TPOS.

## Bước 4 — Test cục bộ

```bash
# serve folder root
python3 -m http.server 5500
# mở http://localhost:5500/web2/product-uom/index.html
```

Kiểm tra:
- ✅ Sidebar render, item "Đơn vị tính" highlight active
- ✅ Bảng hiện loading rồi "Chưa có dữ liệu"
- ✅ Bấm "Thêm mới" → modal mở, điền form, lưu → row xuất hiện
- ✅ Bấm pencil → edit, trash → xóa
- ✅ Search "abc" → filter
- ✅ Pagination chạy nếu > 200 records

## Bước 5 — Commit + push

```bash
git add web2/product-uom/ web2-shared/tpos-sidebar.js
git commit -m "feat(web2): add product-uom page (Phase C.2)"
git push
```

GitHub Pages tự deploy trong 30s.

## Bước 6 — Visual diff vs TPOS (Phase D)

Xem [08-visual-diff-loop.md](08-visual-diff-loop.md). Tóm tắt:

```bash
# 1. Mở Playwright headed với 2 tab
node /tmp/tpos-crawl-manual/watch.js productuom

# 2. So sánh class/computedStyle hai bên
node /tmp/tpos-crawl-manual/compare.js productuom

# 3. Sửa CSS đến khi diff < 5 entries
```

## Trang phức tạp (advanced)

Nếu page cần:

### Custom column render
Tạm thời clone `page-builder.js` → tạo `page-builder-custom.js` riêng cho trang đó. Hoặc thêm prop `column.render` (todo).

### Bảng chính có liên quan tới bảng phụ (vd. invoice → invoice_line)
→ KHÔNG dùng generic. Tạo bảng riêng + route riêng (xem `native-orders` làm mẫu).

### Logic workflow (vd. duyệt đơn, hủy đơn)
→ Tạo route action riêng: `POST /api/web2/:entity/action/approve/:code` (mở rộng `web2-generic.js`).

## Checklist khi thêm page

- [ ] Tạo folder `web2/<page-slug>/index.html`
- [ ] Add `#Note` comment ở dòng 1
- [ ] Link đúng 3 file: tpos-sidebar.css, tpos-theme.css, native-orders.css
- [ ] Load 3 script: tpos-sidebar.js, web2-api.js, page-builder.js
- [ ] Slug khớp regex `/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/`
- [ ] Update sidebar item `.our = '../web2/<slug>/index.html'`
- [ ] Test create/edit/delete/search/pagination
- [ ] Update `docs/dev-log.md` ở đầu file
