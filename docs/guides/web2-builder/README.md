<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. -->

# Web 2.0 Page Builder — Hướng dẫn dựng trang TPOS-clone

> Mục tiêu: Đọc xong tài liệu này, có thể code lại từ đầu **toàn bộ hệ thống "Web 2.0"** (clone giao diện TPOS, dùng backend riêng PostgreSQL trên Render, proxy qua Cloudflare Worker).
>
> Triết lý: **1 schema generic (web2_entities + web2_records)** + **1 framework client (Web2Page.mount)** → dựng nhanh 87+ trang CRUD giống TPOS.

## Mục lục

1. [01-architecture.md](01-architecture.md) — Tổng quan kiến trúc 4 lớp (DB ↔ Render ↔ CF Worker ↔ Browser)
2. [02-backend-generic-entity.md](02-backend-generic-entity.md) — Schema PostgreSQL + REST endpoints
3. [03-cloudflare-routing.md](03-cloudflare-routing.md) — Cách thêm route qua Cloudflare Worker
4. [04-frontend-page-builder.md](04-frontend-page-builder.md) — `Web2Page.mount(rootSel, config)` + config schema
5. [05-tpos-theme.md](05-tpos-theme.md) — CSS classes TPOS-clone (label/btn/cell/status)
6. [06-create-new-page.md](06-create-new-page.md) — **Cookbook: tạo 1 trang mới trong < 5 phút**
7. [07-sidebar-and-routing.md](07-sidebar-and-routing.md) — Đăng ký page vào sidebar nhóm Web 2.0
8. [08-visual-diff-loop.md](08-visual-diff-loop.md) — Quy trình diff vs TPOS bằng Playwright
9. [99-appendix.md](99-appendix.md) — Tham chiếu nhanh: paths, slugs, URLs, troubleshooting

## File quan trọng (root references)

| Layer | File | Vai trò |
|------|------|--------|
| DB schema | `render.com/migrations/068_web2_generic_entities.sql` | 2 bảng dùng chung cho 87 trang |
| Backend | `render.com/routes/web2-generic.js` | REST `/api/web2/:entity/*` |
| Server mount | `render.com/server.js` | `app.use('/api/web2', web2GenericRoutes)` |
| Worker route | `cloudflare-worker/modules/config/routes.js` | Pattern `WEB2_GENERIC: '/api/web2/*'` |
| Worker dispatch | `cloudflare-worker/worker.js` | `case 'WEB2_GENERIC': handleCustomer360Proxy(...)` |
| Client API | `web2-shared/web2-api.js` | `Web2Api.forEntity(slug)` → `{list,get,create,update,remove}` |
| Page builder | `web2-shared/page-builder.js` | `Web2Page.mount(rootSel, config)` factory |
| Sidebar | `web2-shared/tpos-sidebar.js` | 12 group, 87 link với `data-our` |
| Theme | `native-orders/css/tpos-theme.css` | Class TPOS-clone dùng chung |

## Quick start (tạo trang `productcategory`)

```bash
# 1. Tạo trang HTML mới
mkdir -p web2/product-category
```

```html
<!-- web2/product-category/index.html -->
<!DOCTYPE html>
<html lang="vi">
<head>
    <link rel="stylesheet" href="../../web2-shared/tpos-sidebar.css">
    <link rel="stylesheet" href="../../native-orders/css/tpos-theme.css">
</head>
<body>
    <div id="web2-sidebar-root"></div>
    <main id="main"></main>

    <script src="https://unpkg.com/lucide@latest"></script>
    <script src="../../web2-shared/tpos-sidebar.js"></script>
    <script src="../../web2-shared/web2-api.js"></script>
    <script src="../../web2-shared/page-builder.js"></script>
    <script>
        Web2Sidebar.mount('#web2-sidebar-root');
        Web2Page.mount('#main', {
            slug: 'productcategory',
            title: 'Nhóm sản phẩm',
            breadcrumb: ['App', 'Sản phẩm'],
            columns: [
                { key: 'code', label: 'Mã', width: 140, align: 'center' },
                { key: 'name', label: 'Tên nhóm', align: 'left' },
                { key: 'data.parentCode', label: 'Nhóm cha', width: 160 },
                { key: 'data.note', label: 'Ghi chú' },
            ],
            fields: [
                { key: 'code', label: 'Mã', type: 'text', required: true },
                { key: 'name', label: 'Tên nhóm', type: 'text', required: true },
                { key: 'data.parentCode', label: 'Nhóm cha (code)', type: 'text' },
                { key: 'data.note', label: 'Ghi chú', type: 'textarea' },
            ],
        });
    </script>
</body>
</html>
```

Đó là toàn bộ. Backend tự auto-create bảng, sidebar tự render group/link.

## Workflow theo phase

| Phase | Mục đích | Trạng thái |
|-------|----------|----------|
| **A. Crawl** | Crawl 87 URL TPOS lấy spec (filter/columns) → `/tmp/tpos-pages-spec/*.json` | done |
| **B. Framework** | DB schema + routes + Worker + page-builder + theme | done |
| **C. Pages** | Tạo từng trang theo plan (~24 batch) | đang làm |
| **D. Diff loop** | Playwright dual-tab so sánh với TPOS, sửa CSS đến `< 5 entries` | sau mỗi batch C |

Xem [docs/dev-log.md](../../dev-log.md) để theo dõi tiến độ thực tế.
