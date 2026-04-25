<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. -->

# 03 — Cloudflare Worker routing

CF Worker (`chatomni-proxy.nhijudyshop.workers.dev`) là proxy duy nhất giữa browser và backend. Lý do:
- CORS không cần cấu hình ở Render (Worker echo `Access-Control-Allow-Origin`).
- 1 endpoint duy nhất cho mọi backend (TPOS, Pancake, Render, Facebook, ...).
- Edge cache (cho ảnh).

## Thêm route generic web2

### 1. Pattern (file `cloudflare-worker/modules/config/routes.js`)

```js
export const ROUTES = {
    // ... các route khác
    WEB2_GENERIC: { pattern: '/api/web2/*' },
};
```

### 2. Match function

```js
export function matchRoute(pathname) {
    // ...
    if (pathname.startsWith('/api/web2/')) return 'WEB2_GENERIC';
    // ...
}
```

> **Thứ tự rất quan trọng**: phải đặt `'/api/web2/'` TRƯỚC `'/api/web2-products/'` vì cả 2 đều prefix-match. Hiện tại `web2-products` được check trước (specific) → ổn.

### 3. Dispatch (file `cloudflare-worker/worker.js`)

```js
case 'WEB2_GENERIC':
    return handleCustomer360Proxy(request, url, pathname);
```

`handleCustomer360Proxy` đã có sẵn — forward thẳng request đến Render với pathname không đổi. Render mount `/api/web2` → match.

### 4. Deploy

```bash
cd cloudflare-worker
wrangler deploy
```

Mỗi lần sửa worker phải deploy thủ công. CI không tự deploy CF Worker.

## Test sau deploy

```bash
curl -i https://chatomni-proxy.nhijudyshop.workers.dev/api/web2/productcategory/health
```

Status mong đợi:
- `200` + JSON `{ok:true, ...}` → OK
- `404` + `Invalid API route` → routes.js chưa update
- `500` + `DB unavailable` → Render server chưa deploy code mới

## Trigger deploy (commit empty cho CF)

Đôi khi cần force deploy CF Worker mà không sửa file:
```js
// cuối worker.js
// Trigger deploy 20260115153551
```

Đổi timestamp → commit → deploy. (Pattern đã có sẵn.)
