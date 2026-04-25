<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. -->

# 04 — Frontend Page Builder

## 2 module client

### `web2-shared/web2-api.js`

API client thin wrapper quanh `fetch`:

```js
const api = Web2Api.forEntity('productcategory');

await api.health();                          // → {ok, count}
await api.list({ search:'X', activeOnly:true, page:1, limit:200 });
await api.get('SP001');
await api.create({ code:'SP001', name:'Áo', data:{ note:'…' } });
await api.update('SP001', { name:'Áo mới' });
await api.remove('SP001');
```

Base URL hard-code: `https://chatomni-proxy.nhijudyshop.workers.dev`.

### `web2-shared/page-builder.js`

Factory tạo full page CRUD: header + filter bar + table + pagination + modal.

```js
Web2Page.mount(rootSel, config);
```

## Config schema

```js
{
    slug:       'productcategory',          // bắt buộc — entity slug đi thẳng vào /api/web2/:slug/*
    title:      'Nhóm sản phẩm',            // bắt buộc — H1 + breadcrumb cuối
    breadcrumb: ['App', 'Sản phẩm'],        // tùy chọn — crumb cha (không bao gồm title)

    columns: [                              // bảng list
        {
            key:    'code',                 // 'code'/'name' = cột cố định, 'data.X' = nested JSONB
            label:  'Mã',
            width:  140,                    // px hoặc null (auto)
            align:  'center',               // 'left' | 'center' | 'right'
            mono:   false,                  // monospace font cho mã/số
        },
        // ...
    ],

    fields: [                               // form modal create/edit
        {
            key:        'code',             // dot-path: 'data.parentCode' set vào data.parentCode
            label:      'Mã',
            type:       'text',             // 'text' | 'textarea' | 'select' | 'checkbox' | 'number' | 'email' | 'tel'
            required:   true,
            placeholder:'VD: SP001',
            options:    [{value, label}],   // chỉ cho type='select'
        },
        // ...
    ],

    defaults: { isActive: true },           // (chưa dùng — placeholder cho future)
}
```

## Field key convention

| Key | Behavior |
|-----|----------|
| `'code'` | Map vào cột `web2_records.code` |
| `'name'` | Map vào cột `web2_records.name` |
| `'data.X'` | Map vào `web2_records.data.X` (JSONB) |
| `'data.X.Y'` | Nested: `data.X.Y` |

Page-builder dùng `getPath(obj, 'data.X')` / `setPath(obj, 'data.X', val)` để xử lý dot-path.

## Render flow

```
mount(rootSel, config)
    ↓ inject HTML skeleton (header, search, table, modal)
    ↓ wire event listeners
    ↓ load() → api.list({...STATE}) → renderRows() + renderPagination() + renderCounters()
    ↓
[user click "Thêm mới"]
    ↓ openCreate() → renderForm({}) → modal open
    ↓ saveModal() → build payload → api.create(payload) → load()
[user click pencil row]
    ↓ openEdit(code) → renderForm(record, editing=true) → modal open
    ↓ saveModal() → api.update(code, {name, data}) → load()
[user click trash row]
    ↓ removeRecord(code) → confirm() → api.remove(code) → load()
```

## State (closure)

```js
{
    records: Record[],   // current page
    total:   number,     // total matching filter
    page:    number,     // 1-indexed
    limit:   number,     // 100/200/500/1000
    search:  string,
    activeOnly: boolean,
    loading: boolean,
    editingCode: string | null,
}
```

State không expose ra ngoài (ngoại trừ qua return value `mount()` để debug).

## Custom rendering (advanced)

Nếu cần custom cell render (vd. status pill, link), tạm thời chỉ có 2 option:
1. Sửa trực tiếp `page-builder.js` — thêm `column.render: (value, row) => string` callback.
2. Wrap data sau khi nhận từ API → set vào `STATE.records` thủ công (cần expose method).

Hiện chưa làm. **Cookbook trang nâng cao** sẽ ở `06-create-new-page.md` mục "advanced".

## Tại sao dùng vanilla JS thay vì React/Vue

- Không build step — push GitHub Pages là chạy.
- Mỗi page tự bundle script tag, không cần webpack/vite.
- Lib nặng nhất: `lucide` cho icon.
- Mục tiêu là clone TPOS UI, không phải SPA performance — vanilla quá đủ.
