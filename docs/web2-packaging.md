# Web 2.0 — Packaging & deployment

> Mọi thứ thuộc về Web 2.0 đang nằm ở **5 thư mục top-level** của repo. Có sẵn script đóng gói thành **1 folder duy nhất** (`dist/web2-bundle/`) để copy / deploy thành site riêng. Doc này liệt kê đầy đủ inventory + shared deps + cách deploy.

## TL;DR

```bash
bash scripts/pack-web2.sh                    # → dist/web2-bundle/  (249 files, 3.9 MB)
cd dist/web2-bundle && python3 -m http.server 8090
# Open http://localhost:8090/ — chuyển tới native-orders/, mọi tính năng chạy độc lập
```

Sau đó `cp -R dist/web2-bundle/ ~/my-new-site/` rồi deploy lên bất kỳ static host.

## 5 thư mục thuộc Web 2.0

| Folder           | Size   | Mô tả                                                                                                                                                                                 |
| ---------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web2/`          | 504 KB | TPOS-clone module pages (~80 sub-route: fastsaleorder-invoice, fastsaleorder-refund, fastsaleorder-delivery, product-category, account-payment-thu, …)                                |
| `web2-products/` | 36 KB  | Kho sản phẩm (CRUD, search, paging)                                                                                                                                                   |
| `web2-shared/`   | 136 KB | Shared library: `tpos-sidebar.{css,js}`, `popup.js`, `delivery-method-picker.js`, `page-builder.{css,js}`, `page-builder-tpos.css`, `page-shell.js`, `pbh-realtime.js`, `web2-api.js` |
| `native-orders/` | 176 KB | "Đơn Web" list page + Tạo PBH form + bulk PBH modal + column toggle                                                                                                                   |
| `tpos-pancake/`  | 1.3 MB | TPOS × Pancake comments page (chat window, Tạo đơn từ comment, Tikreel parity)                                                                                                        |

**Tổng**: ~2.1 MB (mã nguồn). Sau khi gói kèm `shared/` thành bundle → ~3.9 MB.

## Shared deps (từ `/shared/` — bundled vào `web2-bundle/shared/`)

| File                                | Dùng cho                                          |
| ----------------------------------- | ------------------------------------------------- |
| `shared/js/firebase-config.js`      | Firebase init (Firestore + Realtime DB + Storage) |
| `shared/js/shared-auth-manager.js`  | Login + session                                   |
| `shared/js/shared-cache-manager.js` | IndexedDB cache                                   |
| `shared/js/notification-system.js`  | Toast notifications                               |
| `shared/js/navigation-modern.js`    | Top-bar (SePay banner)                            |
| `shared/js/api-config.js`           | Worker URL constant                               |
| `shared/js/pancake-data-manager.js` | Pancake API client                                |
| `shared/js/shop-config.js`          | Shop metadata                                     |
| `shared/js/storage-migration.js`    | localStorage version migration                    |
| `shared/esm/compat.js`              | ESM compatibility shim                            |
| `shared/css/typography.css`         | Font Inter + heading styles                       |
| `shared/images/`                    | Logo + brand assets                               |

`shared/browser/`, `shared/universal/` cũng được gói kèm vì là source-of-truth cho ES module imports (xem [CLAUDE.md](../CLAUDE.md) → "Shared Library Structure").

`shared/node/` **KHÔNG** bundled (server-side Node code, không cần ở browser).

## External (không bundled — pinned CDN)

| Dep                          | URL                                                                   | Lý do                                             |
| ---------------------------- | --------------------------------------------------------------------- | ------------------------------------------------- |
| Firebase SDK v10.14.1        | `https://www.gstatic.com/firebasejs/10.14.1/firebase-*-compat.js`     | Pinned version, dùng `<script src="...">` từ HTML |
| Lucide icons v0.294.0        | `https://unpkg.com/lucide@0.294.0/dist/umd/lucide.min.js`             | Icon library                                      |
| Google Fonts Inter + Manrope | `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700` | Web font                                          |

Mọi browser có internet đều resolve được — không cần thay đổi.

## Backend (deployment-specific)

Web 2.0 frontend gọi 1 backend duy nhất: **Cloudflare Worker** `chatomni-proxy.nhijudyshop.workers.dev` — Worker này proxy tới Render API server `n2store-fallback.onrender.com`.

```
[Browser]  ──► CF Worker (chatomni-proxy)  ──► Render Express API + Postgres
                                          └─►  TPOS API + Pancake API + Bunny CDN
```

Để deploy với backend riêng:

1. **Fork + deploy Render**:
    - Copy `render.com/` folder lên 1 repo riêng
    - Render → New Web Service → connect repo → deploy
    - Note URL mới (vd `https://my-api.onrender.com`)
2. **Fork + deploy Cloudflare Worker**:
    - Copy `cloudflare-worker/` folder
    - `wrangler deploy` lên CF
    - Đổi `RENDER_BASE_URL` trong worker env vars
    - Note Worker URL mới (vd `https://my-proxy.workers.dev`)
3. **Update bundle**:
    - `cd dist/web2-bundle`
    - `grep -rl chatomni-proxy.nhijudyshop.workers.dev | xargs sed -i '' 's|chatomni-proxy.nhijudyshop.workers.dev|my-proxy.workers.dev|g'`

## File inventory

```
$ find dist/web2-bundle -type f | wc -l
249

$ tree -L 2 dist/web2-bundle
web2-bundle/
├── README.md
├── index.html                    → redirects to native-orders/
├── native-orders/                → 13 files
│   ├── css/                      (3 stylesheets)
│   ├── js/                       (2 scripts: api + app)
│   └── index.html
├── tpos-pancake/                 → 67 files
│   ├── css/                      (sidebar, comments, tags)
│   ├── js/                       (12 modules: chat, comment-list, init, …)
│   └── index.html
├── web2/                         → 80+ module pages
│   ├── fastsaleorder-invoice/    → PBH list (custom JS)
│   ├── fastsaleorder-refund/     → Phiếu trả
│   ├── fastsaleorder-delivery/   → Phiếu giao
│   ├── report-revenue/           → Dashboard
│   ├── report-order/             → Báo cáo đơn
│   ├── product-category/         → Danh mục SP
│   └── …
├── web2-products/                → Kho SP
├── web2-shared/                  → 9 shared modules
│   ├── tpos-sidebar.{css,js}    → Sidebar 87-route
│   ├── popup.js                 → Custom alert/confirm/prompt + .w2p-* utility classes
│   ├── delivery-method-picker.js → VN address-aware delivery picker
│   ├── page-builder.{css,js}    → Generic CRUD page generator
│   ├── page-builder-tpos.css
│   ├── page-shell.js            → Auto-inject sidebar shell
│   ├── pbh-realtime.js          → WebSocket realtime sync
│   └── web2-api.js              → API client
└── shared/                       → Common library
    ├── js/ (48 files)
    ├── browser/ (ESM source of truth)
    ├── universal/ (cross-env modules)
    ├── css/typography.css
    ├── esm/compat.js
    └── images/
```

## Customisation hooks

| Customise                       | File / Pattern                                            |
| ------------------------------- | --------------------------------------------------------- |
| Brand text "N2 Store" / "N2"    | `grep -r "N2 Store\|N2\b" web2-shared/ web2/`             |
| Worker URL                      | `grep -r "chatomni-proxy"`                                |
| Firebase project                | `shared/js/firebase-config.js`                            |
| Default delivery zones + prices | `web2-shared/delivery-method-picker.js` → `OPTIONS` array |
| Sidebar route list              | `web2-shared/tpos-sidebar.js` → `NAV` array               |
| Popup theme colors              | `web2-shared/popup.js` → `TYPE_COLORS` object             |
| PBH STT/numbering               | Backend `render.com/routes/fast-sale-orders.js`           |

## Test cục bộ trước khi deploy

```bash
bash scripts/pack-web2.sh                                   # build bundle
cd dist/web2-bundle && python3 -m http.server 8090 &        # serve
open http://localhost:8090/native-orders/index.html
```

Mọi tính năng (popup, dropdown PT giao hàng, bulk PBH, column toggle) đều test được offline khỏi monorepo gốc.

## Tại sao không rename thành `web2-*` suffix?

User gợi ý option khác là rename mọi file/folder với suffix `web2`. Đã không chọn vì:

- 92 HTML × hard-coded `src="../shared/..."` + cache version params → phải sửa hết
- GitHub Pages URL hiện tại đã được share với khách → đổi path = 404 cho mọi link cũ
- 5 folder + `web2-` prefix vẫn không gom thành 1 folder copy-able

→ Cách hiện tại (script pack) **đạt cùng mục đích** mà không touch cấu trúc đang chạy.

## CI hook (tùy chọn)

Có thể thêm vào GitHub Actions:

```yaml
- name: Pack Web 2.0 bundle
  run: bash scripts/pack-web2.sh
- name: Upload bundle artifact
  uses: actions/upload-artifact@v4
  with:
      name: web2-bundle
      path: dist/web2-bundle
```

Mỗi PR sẽ có 1 bundle artifact ready-to-deploy.
