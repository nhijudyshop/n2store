<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. -->

# 02 — Backend Generic Entity

## Schema

File: `render.com/migrations/068_web2_generic_entities.sql`

```sql
CREATE TABLE IF NOT EXISTS web2_entities (
    slug        VARCHAR(60)  PRIMARY KEY,
    label       VARCHAR(100) NOT NULL,
    schema      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  BIGINT NOT NULL,
    updated_at  BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS web2_records (
    id            BIGSERIAL PRIMARY KEY,
    entity_slug   VARCHAR(60) NOT NULL REFERENCES web2_entities(slug) ON DELETE CASCADE,
    code          VARCHAR(100),
    name          VARCHAR(255),
    data          JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active     BOOLEAN NOT NULL DEFAULT true,
    created_by    VARCHAR(100),
    created_at    BIGINT NOT NULL,
    updated_at    BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_web2_records_entity   ON web2_records(entity_slug);
CREATE INDEX IF NOT EXISTS idx_web2_records_name     ON web2_records(name);
CREATE INDEX IF NOT EXISTS idx_web2_records_code     ON web2_records(code);
CREATE INDEX IF NOT EXISTS idx_web2_records_active   ON web2_records(is_active);
CREATE INDEX IF NOT EXISTS idx_web2_records_created  ON web2_records(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_web2_records_entity_code
    ON web2_records(entity_slug, code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_web2_records_entity_active_updated
    ON web2_records(entity_slug, is_active DESC, updated_at DESC);
```

> **Lưu ý:** Bảng tự auto-create lần đầu route được gọi (xem `ensureTables()` trong route file). Không cần chạy migration thủ công.

## REST endpoints

File: `render.com/routes/web2-generic.js`. Mount trong `server.js`:
```js
const web2GenericRoutes = require('./routes/web2-generic');
app.use('/api/web2', web2GenericRoutes);
```

| Method | Path | Mô tả |
|--------|------|------|
| GET | `/api/web2/:entity/health` | Health check + đếm record |
| GET | `/api/web2/:entity/list?search=&activeOnly=&page=&limit=` | List có search + paging |
| GET | `/api/web2/:entity/get/:code` | Lấy 1 bản ghi theo code |
| POST | `/api/web2/:entity/create` | Tạo mới (body: `{code?, name, data?, isActive?, createdBy?}`) |
| PATCH | `/api/web2/:entity/update/:code` | Update (body: `{name?, data?, isActive?}`) |
| DELETE | `/api/web2/:entity/delete/:code` | Xóa cứng |

### Validate `:entity`

```js
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;
function validSlug(s) { return typeof s === 'string' && SLUG_RE.test(s); }
```

Lý do: tránh SQL injection / path traversal vì `:entity` đi thẳng vào `WHERE entity_slug = $1`. Đã prepared-statement nhưng vẫn whitelist regex để chặn ký tự lạ.

### Response shape (chuẩn envelope)

```json
{
  "success": true,
  "entity": "productcategory",
  "records": [
    {
      "id": 12,
      "entitySlug": "productcategory",
      "code": "SP001",
      "name": "Áo nam",
      "data": { "parentCode": "ROOT", "note": "..." },
      "isActive": true,
      "createdBy": null,
      "createdAt": 1735689600000,
      "updatedAt": 1735689600000
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 200,
  "hasMore": false
}
```

### Lỗi mã trùng

`POST create` với `code` đã tồn tại → 409:
```json
{ "error": "Mã \"SP001\" đã tồn tại trong \"productcategory\"" }
```

(PostgreSQL error `23505` từ unique index `uq_web2_records_entity_code`.)

## Khi nào KHÔNG dùng generic

Nếu trang cần:
- Quan hệ N–N phức tạp (đơn hàng có nhiều dòng sản phẩm)
- Aggregate (báo cáo doanh thu, công nợ)
- Workflow status có business rule

→ Tạo bảng + route riêng. Ví dụ đã có:
- `native_orders` + `routes/native-orders.js`
- `web2_products` + `routes/web2-products.js`

## Test endpoint sau deploy

```bash
curl -s https://chatomni-proxy.nhijudyshop.workers.dev/api/web2/productcategory/health
# → {"ok":true,"entity":"productcategory","count":0}

curl -s -X POST https://chatomni-proxy.nhijudyshop.workers.dev/api/web2/productcategory/create \
  -H 'Content-Type: application/json' \
  -d '{"code":"SP001","name":"Áo nam","data":{"note":"demo"}}'
# → {"success":true,"record":{...}}
```
