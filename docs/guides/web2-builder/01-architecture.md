<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. -->

# 01 — Kiến trúc tổng quan

## 4 lớp

```
┌──────────────────────────────────────────────┐
│  Browser (GitHub Pages — nhijudyshop.github.io)
│  ─ web2/<slug>/index.html
│  ─ Web2Page.mount(...) → fetch → Web2Api.forEntity(slug)
└──────────────────────┬───────────────────────┘
                       │ fetch https://chatomni-proxy.nhijudyshop.workers.dev/api/web2/...
                       ▼
┌──────────────────────────────────────────────┐
│  Cloudflare Worker  (cloudflare-worker/worker.js)
│  ─ matchRoute() → 'WEB2_GENERIC' (pattern /api/web2/*)
│  ─ handleCustomer360Proxy → forward to Render
└──────────────────────┬───────────────────────┘
                       │ fetch https://n2store-fallback.onrender.com/api/web2/...
                       ▼
┌──────────────────────────────────────────────┐
│  Render API (render.com/server.js)
│  ─ app.use('/api/web2', web2GenericRoutes)
│  ─ routes/web2-generic.js → CRUD on web2_records
└──────────────────────┬───────────────────────┘
                       │ pg pool (chatDb)
                       ▼
┌──────────────────────────────────────────────┐
│  PostgreSQL (render.com chat_db)
│  ─ web2_entities  (slug PRIMARY KEY)
│  ─ web2_records   (entity_slug, code, name, data JSONB, ...)
└──────────────────────────────────────────────┘
```

## Vì sao 1 schema dùng cho 87 trang

TPOS có 87 trang dạng list (CRUD đơn giản): nhóm sản phẩm, đơn vị tính, khách hàng, nhà cung cấp, kênh bán, hãng vận chuyển, ...

Thay vì tạo 87 bảng riêng, ta dùng **Entity-Attribute-Value pattern** rút gọn:

- **`web2_entities(slug, label, schema)`** — danh mục các loại entity
- **`web2_records(entity_slug, code, name, data JSONB, is_active, ...)`** — tất cả bản ghi của tất cả entity, phân biệt bằng `entity_slug`

Field cố định (`code`, `name`, `is_active`, `created_at`) ở cột riêng để index nhanh. Field tùy entity (parentCode, parentId, taxRate, address, ...) gom hết vào JSONB `data`.

Lợi ích:
- 1 lần migrate, 1 lần wire route → 87 trang chạy được.
- Search/filter generic: ILIKE trên `code` + `name`.
- Thêm trang mới = tạo file HTML, không cần migration / không cần restart server.

## Trade-off

| Ưu | Nhược |
|----|-------|
| Triển khai cực nhanh | Không enforce schema field tùy ý ở DB layer |
| Schema-less, dễ thêm field | Search trên `data.X` phải dùng JSONB operator (chưa tối ưu) |
| 1 codebase backend = 87 trang | Nếu trang cần logic phức tạp (kho, đơn hàng) → vẫn phải tạo bảng riêng (vd. `native_orders`, `web2_products`) |

> Quy ước: **trang nào logic đơn giản (chỉ list/CRUD)** → dùng generic. **Trang nào có business rule** (đơn hàng, kho, hóa đơn) → tạo bảng + route riêng (đã có sẵn `native_orders`, `web2_products`).
