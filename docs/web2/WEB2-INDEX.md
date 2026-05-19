# Web 2.0 — Index quick-lookup

> Dùng làm bản đồ phân biệt code/data Web 2.0 vs Legacy N2Store.
> Khi tạo mới: thêm vào đây + đánh marker `// WEB2.0 MODULE` ở đầu file.
> Khi tìm code: tra section bên dưới trước khi grep cả repo.

## Frontend folders

| Folder                                                 | Vai trò                                            | URL pattern                        |
| ------------------------------------------------------ | -------------------------------------------------- | ---------------------------------- |
| [`so-order/`](../../so-order/)                         | Sổ Order — shop mua từ NCC                         | `/so-order/index.html`             |
| [`native-orders/`](../../native-orders/)               | Đơn Web — tạo PBH                                  | `/native-orders/index.html`        |
| [`tpos-pancake/`](../../tpos-pancake/)                 | Đối soát TPOS × Pancake                            | `/tpos-pancake/index.html`         |
| [`web2/products/`](../../web2/products/)               | Kho SP riêng                                       | `/web2/products/index.html`        |
| [`web2/variants/`](../../web2/variants/)               | Kho Biến Thể                                       | `/web2/variants/index.html`        |
| [`web2/supplier-wallet/`](../../web2/supplier-wallet/) | Ví NCC (công nợ)                                   | `/web2/supplier-wallet/index.html` |
| [`web2/customer-wallet/`](../../web2/customer-wallet/) | Ví KH (công nợ)                                    | `/web2/customer-wallet/index.html` |
| [`web2/`](../../web2/)                                 | TPOS-clone pages khác (placeholder Web2Shell)      | `/web2/<slug>/index.html`          |
| [`web2/shared/`](../../web2/shared/)                   | Sidebar, page-shell, api client, caches dùng chung | —                                  |

## Backend routes (Render)

| Mount path                | File                                                                                   | Mục đích                               |
| ------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------- |
| `/api/web2/products/*`    | [`render.com/routes/web2-products.js`](../../render.com/routes/web2-products.js)       | Kho SP CRUD + adjust-stock             |
| `/api/web2/variants/*`    | [`render.com/routes/web2-variants.js`](../../render.com/routes/web2-variants.js)       | Kho Biến Thể CRUD                      |
| `/api/web2/:entity/*`     | [`render.com/routes/web2-generic.js`](../../render.com/routes/web2-generic.js)         | Generic CRUD cho 80+ TPOS-clone pages  |
| `/api/native-orders/*`    | [`render.com/routes/native-orders.js`](../../render.com/routes/native-orders.js)       | Đơn Web (Web 2.0 dù không prefix web2) |
| `/api/fast-sale-orders/*` | [`render.com/routes/fast-sale-orders.js`](../../render.com/routes/fast-sale-orders.js) | PBH — Phiếu Bán Hàng                   |
| `/api/wallet-deposits/*`  | [`render.com/routes/wallet-deposits.js`](../../render.com/routes/wallet-deposits.js)   | Query SePay deposits cho ví NCC + KH   |

Cloudflare Worker proxy: `https://chatomni-proxy.nhijudyshop.workers.dev` forward tới Render.

## Postgres tables (Web 2.0)

| Table                           | Mục đích                                                     | Schema file           |
| ------------------------------- | ------------------------------------------------------------ | --------------------- |
| `web2_products`                 | Kho SP                                                       | web2-products.js      |
| `web2_variants`                 | Kho Biến Thể                                                 | web2-variants.js      |
| `web2_entities`, `web2_records` | Generic TPOS-clone storage                                   | web2-generic.js       |
| `native_orders`                 | Đơn Web (legacy name)                                        | native-orders.js      |
| `fast_sale_orders`              | PBH                                                          | fast-sale-orders.js   |
| `balance_history`               | SePay bank transfers (shared infra, used by wallet-deposits) | sepay-webhook-core.js |

## Firestore collections (Web 2.0)

| Collection           | Doc    | Mục đích                               |
| -------------------- | ------ | -------------------------------------- |
| `so_order_v2`        | `main` | Sổ Order state (tabs, shipments, rows) |
| `supplier_wallet_v1` | `main` | Ví NCC ledger (wallets + transactions) |
| `customer_wallet_v1` | `main` | Ví KH ledger                           |

## Shared client libs

| Lib                 | File                                                                                   | Vai trò                                                                        |
| ------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `Web2Sidebar`       | [`web2/shared/tpos-sidebar.js`](../../web2/shared/tpos-sidebar.js)                     | Sidebar NAV mount                                                              |
| `Web2Shell`         | [`web2/shared/page-shell.js`](../../web2/shared/page-shell.js)                         | Bootstrap cho TPOS-clone pages                                                 |
| `Web2Api`           | [`web2/shared/web2-api.js`](../../web2/shared/web2-api.js)                             | Generic API client (`/api/web2/:entity`)                                       |
| `Web2ProductsApi`   | [`web2/products/js/web2-products-api.js`](../../web2/products/js/web2-products-api.js) | Kho SP API client                                                              |
| `Web2ProductsCache` | [`web2/shared/web2-products-cache.js`](../../web2/shared/web2-products-cache.js)       | Realtime cache kho SP                                                          |
| `Web2VariantsCache` | [`web2/shared/web2-variants-cache.js`](../../web2/shared/web2-variants-cache.js)       | Realtime cache biến thể                                                        |
| `Web2SSE`           | [`web2/shared/web2-sse-bridge.js`](../../web2/shared/web2-sse-bridge.js)               | SSE pub/sub bridge (subscribe topic, multiplex multi-topics qua 1 EventSource) |

## Realtime pattern

> **BẮT BUỘC đọc trước khi code realtime/data-sync**: [`docs/web2/SSE-REALTIME.md`](SSE-REALTIME.md).

Web 2.0 dùng **SSE pub/sub trên Render** (`realtime-sse.js`) thay vì Firebase Firestore listener. Topic convention `web2:<entity>` (CRUD entity) hoặc `wallet:<phone>` / `wallet:*` (SePay events). 7 topics + 78 generic auto đã wire — xem section 9 của SSE-REALTIME.md.

## Data flow (xem dev-log 2026-05-18 audit)

```
Sổ Order ──► Web2 Products (auto +stock khi mua)
     │
     ▼
Ví NCC ──► adjust-stock (-stock khi trả NCC)

Đơn Web ──► PBH ──► Web2 Products (auto -stock khi tạo PBH)
                          │
                          ▼
                    Ví KH ──► adjust-stock (+stock khi KH trả)

SePay webhook ──► balance_history ──► wallet-deposits load endpoint
                                            │
                                            ▼ poll on wallet load
                                  Ví NCC + Ví KH → auto-apply matching deposits
```

## Marker convention

File mới Web 2.0 → token `WEB2.0` trong #Note header:

```js
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
```

Grep `WEB2.0` để tìm nhanh tất cả file thuộc Web 2.0.

## Legacy KHÔNG phải Web 2.0

`orders-report/`, `inbox/`, `chat/`, `library/`, `home/`, `auth/`, `account/`, `shared/` (auth/cache/notification chung cả 2 layer), `cloudflare-worker/` (proxy chung).
