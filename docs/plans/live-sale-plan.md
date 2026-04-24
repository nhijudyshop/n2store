# Live-Sale Plan — TPOS-Independent Clone of tpos-pancake

**Created:** 2026-04-24
**Source page:** `tpos-pancake/` (https://nhijudyshop.github.io/n2store/tpos-pancake/index.html)
**New page:** `live-sale/`
**Goal:** 100% feature parity with `tpos-pancake` but the TPOS column becomes a self-hosted implementation (web-native). Pancake side stays 100% unchanged.

---

## 1. Scope

### Keep 100% (no behavior change)
- Pancake column (conversation list, chat window, realtime, token mgr, page selector, context menu)
- Shared: event-bus, cache-manager, debt-manager, utils
- Layout: column-manager, settings-manager, app-init
- Pancake ↔ TPOS integration events (`tpos:commentSelected`, `pancake:savedListUpdated`, `tposSavedListUpdated`)
- Settings modals (Pancake accounts, column layout)

### Replace
- `js/tpos/*` (7 files) → `js/live-sale/*`
- TPOS OData endpoints → new `/api/v2/live-sale/*` on Render
- TPOS bearer token auth → N2Store JWT (from shared-auth-manager)
- TPOS Partner/Order/SaleOnline_Order → Postgres `customers` (existing) + new `orders`, `order_lines`, `products`

### Data sources that stay external
- **Facebook Graph API** (comments, live videos) → proxied via CF Worker + Render (already exists for `/facebook/*`)
- **SePay** (bank) — unchanged
- **Pancake API** — unchanged

---

## 2. TPOS → LiveSale feature mapping

| TPOS feature | LiveSale replacement | Backing service |
| --- | --- | --- |
| Load CRM teams + pages | FB Page list from authenticated user | Render: `/api/v2/live-sale/pages` (wraps stored page_access_tokens) |
| Load live campaigns | Live videos per page (FB Graph `/{page}/live_videos`) | Render: `/api/v2/live-sale/live-videos` |
| Comment stream (SSE) | FB Graph comment polling + SSE | CF Worker `/facebook/comments/stream` (already exists) |
| Comment → order badges (SessionIndex) | Local mapping in `comment_order_map` | Render: `/api/v2/live-sale/comment-orders` |
| Create order from comment | Insert into `orders` + `order_lines` | Render: `POST /api/v2/live-sale/orders` |
| Confirm / Cancel order | Update `orders.status` + log | Render: `POST /api/v2/live-sale/orders/:id/confirm|cancel` |
| Partner (customer) status | `customers.status` (existing `/api/v2/customers/*`) | Reuse existing customer-360 endpoints |
| Update phone/address | `customers` update | Reuse existing |
| Customer info modal | Customer 360 panel | Reuse existing `/api/v2/customers/:id` + `/activity` |
| Debt badge | Shared wallet lookup | Reuse `/api/v2/wallets/batch-summary` |
| Reply to FB comment | FB Graph `/{comment}/comments` | CF Worker `/api/rest/v2.0/facebook-graph/comment/reply` (already) |
| Hide/show comment | FB Graph `PATCH /{comment}` is_hidden | CF Worker `/api/rest/v2.0/facebook-graph/comment/hide` (already) |

---

## 3. Postgres schema additions

```sql
-- Products master (independent from TPOS)
CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  default_price NUMERIC(14,2) DEFAULT 0,
  image_url TEXT,
  tpos_product_id BIGINT,           -- optional backref for import
  attributes JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_products_name_trgm ON products USING GIN (name gin_trgm_ops);

-- Orders header (replacing TPOS SaleOnline_Order)
CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,                -- e.g. "LS-20260424-0001"
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  session_index INT,                        -- per-live sequence number
  live_session_id BIGINT REFERENCES live_sessions(id),
  fb_user_id TEXT,                          -- ASUID from comment
  fb_user_name TEXT,
  fb_post_id TEXT,
  fb_comment_id TEXT,
  note TEXT,
  status TEXT DEFAULT 'draft',              -- draft|confirmed|cancelled|shipped|done
  total NUMERIC(14,2) DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_orders_fb_user ON orders(fb_user_id);
CREATE INDEX idx_orders_post ON orders(fb_post_id);
CREATE INDEX idx_orders_status ON orders(status);

-- Order lines
CREATE TABLE IF NOT EXISTS order_lines (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES products(id),
  product_name TEXT NOT NULL,               -- snapshot at order time
  quantity NUMERIC(10,2) NOT NULL,
  unit_price NUMERIC(14,2) NOT NULL,
  subtotal NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Live sessions (replacing TPOS live campaign)
CREATE TABLE IF NOT EXISTS live_sessions (
  id BIGSERIAL PRIMARY KEY,
  fb_page_id TEXT NOT NULL,
  fb_post_id TEXT,                          -- live video / post id
  fb_live_id TEXT,
  title TEXT,
  status TEXT DEFAULT 'live',               -- live|ended
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_live_sessions_page ON live_sessions(fb_page_id);

-- Comment → order mapping (SessionIndex equivalent)
CREATE TABLE IF NOT EXISTS comment_order_map (
  id BIGSERIAL PRIMARY KEY,
  fb_post_id TEXT NOT NULL,
  fb_user_id TEXT NOT NULL,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  session_index INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (fb_post_id, fb_user_id)
);
```

---

## 4. Render API (new routes)

Base: `/api/v2/live-sale/`

### Pages & live-videos
- `GET /pages` → list FB pages user has access to (from stored page_access_tokens)
- `GET /live-videos?page_id=...` → current/recent live videos for a page
- `POST /live-sessions` → create/resume a live session record
- `GET /live-sessions?page_id=...` → list sessions

### Comments (read-through proxy + map)
- `GET /comment-orders?post_id=...` → `{ asuid: { session_index, order_code } }` (for badges)
- SSE stream continues to use existing CF Worker `/facebook/comments/stream`

### Orders
- `POST /orders` — create from comment `{ fb_user_id, fb_user_name, fb_post_id, fb_comment_id, note?, lines?: [{product_id,name,qty,price}] }`
- `GET /orders?fb_user_id=...&top=1&orderby=created_at:desc` → latest order
- `GET /orders/:id` → detail with lines
- `PATCH /orders/:id` → update fields (status, note, customer_id, lines)
- `POST /orders/:id/confirm` → set status=confirmed
- `POST /orders/:id/cancel` → set status=cancelled

### Products
- `GET /products?q=...&top=50` → search (trigram)
- `POST /products` → create
- `POST /products/import-tpos` → one-time bulk import from TPOS (admin only)

### Customer (existing, reused)
- Reuse `/api/v2/customers/:id`, `/search?phone=...`, `/activity`, `/rfm`

### Auth
- All routes require `Authorization: Bearer <n2store-jwt>` (shared-auth-manager)
- No TPOS bearer anywhere

---

## 5. Frontend module plan (`js/live-sale/`)

Mirror the TPOS contract so `app-init.js` wiring still works:

| New file | Replaces | Responsibility |
| --- | --- | --- |
| `live-sale-init.js` | `tpos/tpos-init.js` | `LiveSaleInit.initialize(containerId)` + `.refresh()` |
| `live-sale-state.js` | `tpos-state.js` | page/live-video/filter state |
| `live-sale-api.js` | `tpos-api.js` | fetch wrapper to Render `/api/v2/live-sale/*` |
| `live-sale-token.js` | `tpos-token-manager.js` | thin wrapper around shared-auth-manager (N2Store JWT) |
| `live-sale-comment-list.js` | `tpos-comment-list.js` | comment card UI (badges, phone, address, actions) |
| `live-sale-customer-panel.js` | `tpos-customer-panel.js` | Customer-360 modal |
| `live-sale-realtime.js` | `tpos-realtime.js` | SSE to CF Worker for live comments |

Events kept identical:
- emit `tpos:commentSelected` (keep namespace so Pancake wiring unchanged)
- listen `pancake:savedListUpdated`
- listen `layout:settingsChanged`

To keep Pancake event wiring zero-change, we keep the `tpos:` event namespace and expose `window.TposInit = window.LiveSaleInit` as an alias in `app-init.js`.

---

## 6. Phased rollout

| Phase | Output | Status |
| --- | --- | --- |
| **1** | live-sale/ folder + copied shared/Pancake + stubbed live-sale modules + plan doc | 🔄 in progress |
| **2** | Postgres migrations + Render routes + minimal product seed | pending |
| **3** | FB live-videos proxy (CF Worker route or Render) + SSE verified | pending |
| **4** | Frontend LiveSale UI fully wired — can load page/live, see comments, create order, update customer | pending |
| **5** | Full loop: commit → push → manual check → fix → repeat until no errors | pending |

---

## 7. Risk register

| Risk | Mitigation |
| --- | --- |
| FB page_access_tokens expired | Reuse Pancake token mgr pattern; Firestore-backed multi-account |
| FB Graph rate-limit on live comments | CF Worker edge cache + backoff (already in place) |
| Pancake breaks due to contract drift | Keep `tpos:` event names, no changes to `js/pancake/*` or `js/layout/*` |
| Live & tpos-pancake diverge over time | Store only shared infra in `shared/`, accept code duplication for column-specific UI |
| Data migration from TPOS | Optional `products/import-tpos` endpoint + one-time script, no runtime coupling |

---

## 8. Open decisions (document as we go)

- [ ] Order code format — propose `LS-YYYYMMDD-NNNN` (per-day sequence)
- [ ] Where to store `products` master initially — seed with TPOS import? Start empty?
- [ ] FB page_access_token storage — reuse `pancake_tokens` collection? new `fb_page_tokens`?
- [ ] How to identify "today's live" without TPOS campaign list — use `live_videos` FB Graph + local `live_sessions` cache

---

## 9. Progress log

- 2026-04-24 — Phase 1 started, plan doc created.
