# KPI Attribution System — Detailed Plan v2

> **Trạng thái:** DRAFT v2 (chờ user duyệt before Sprint 0)
> **v1 → v2 changes:** Campaign-scoped (not day-scoped); Forecast vs Actual split; Beneficiary-based attribution (assignee not actor); STT range visibility filter
> **Created:** 2026-05-31
> **Stakeholder:** Shop manager + nhân viên team chốt đơn

---

## 0. Mục tiêu kinh doanh (REVISED)

Tính KPI cho từng nhân viên theo **từng chiến dịch livestream campaign**, với 2 metric song song:

- **KPI dự báo (Forecast)** — count khi SP được add vào đơn (status không liên quan). Mục đích: encourage real-time effort.
- **KPI thực (Actual)** — count khi đơn convert thành PBH (status = `confirmed`). Cancel PBH → Actual revoke về 0 cho SP đó; **Forecast giữ nguyên**.

Cố định **5,000 VNĐ × số lượng SP**, không phân theo role/SP.

**Attribution mới (đảo logic v1):** Admin chia khoảng STT đơn cho từng nhân viên trong campaign. KPI tính cho **người được assigned khoảng STT chứa đơn đó**, KHÔNG phải người bấm add SP. Đơn không nằm trong khoảng nào → fallback = actor (người bấm add).

Visibility: nhân viên được assigned khoảng → chỉ thấy đơn STT trong khoảng (trong campaign đó). Không có assignment → thấy tất cả đơn của campaign.

---

## 1. User answers cho 10 questions

| #   | Question                             | Answer                                               | Plan impact                                                                              |
| --- | ------------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | Business day boundary                | **Theo livestream campaign**                         | Scope = `campaign_id`, không phải `date`. `web2_kpi_events.business_day` → `campaign_id` |
| 2   | Forecast vs Actual?                  | **Cả 2**                                             | Tách 2 derived view: `forecast` count on add, `actual` count on confirm                  |
| 3   | Cancel KPI?                          | **Actual revert về 0, Forecast giữ**                 | Cancel event chỉ ảnh hưởng Actual projection                                             |
| 4   | Merge                                | Không liên quan                                      | Per-product attribution, merge không affect                                              |
| 5   | Rate                                 | Cố định 5,000đ                                       | No config table needed                                                                   |
| 6   | Backlog approve                      | **Admin xem queue review**                           | Không gate trước, có dashboard review                                                    |
| 7   | Attribution                          | **Người được assigned khoảng STT, không phải actor** | Major change — beneficiary computed at emit time                                         |
| 8   | Assignment UI                        | Trong `/web2/users/` (modal "Phân công KPI")         | Tạo `web2_kpi_assignments` table + history                                               |
| 9   | fastsaleorder-invoice                | Review trang này luôn                                | Add KPI source column + filter                                                           |
| 10  | Tất cả trang native-orders liên quan | Review để chính xác                                  | 9 pages need updates (xem §9)                                                            |

---

## 2. Critical research findings (vs v1)

### 2.1 ❗ `display_stt` is GLOBAL — không reset per campaign

Hiện tại: `native_orders_display_stt_seq` shared cho toàn project. Campaign A có thể được STT 1-150, Campaign B có 151-450 ngẫu nhiên theo `created_at`.

**Solution:** Thêm column `campaign_stt INTEGER` riêng (per-campaign sequence). Implementation:

```sql
-- Per-campaign sequence — auto-create on first order of campaign
CREATE OR REPLACE FUNCTION next_campaign_stt(p_campaign_id TEXT)
RETURNS INTEGER AS $$
DECLARE
    next_stt INTEGER;
BEGIN
    SELECT COALESCE(MAX(campaign_stt), 0) + 1 INTO next_stt
    FROM native_orders
    WHERE live_campaign_id = p_campaign_id;
    RETURN next_stt;
END;
$$ LANGUAGE plpgsql;

-- New column
ALTER TABLE native_orders ADD COLUMN campaign_stt INTEGER;
CREATE INDEX idx_native_orders_campaign_stt
  ON native_orders(live_campaign_id, campaign_stt);
```

**Backfill existing**: per campaign, ORDER BY `created_at ASC`, assign 1..N.

**`display_stt` giữ nguyên** cho backward compat (global view không filter campaign).

### 2.2 ✅ `campaigns` table đã có

`render.com/routes/campaigns.js:18-27` — primary key VARCHAR(100), name + dates. Reuse cho assignment FK.

### 2.3 ✅ `web2_users.id SERIAL` — stable PK

Web2Auth token-based session đã exist. Trust gap v1 vẫn cần fix (server-verify token, không trust client `user.id`).

### 2.4 ✅ PBH lifecycle confirmed

- Native `draft` → `confirmed` khi `POST /api/fast-sale-orders/from-native-order` succeed → **emit `actual_confirmed`** at `fast-sale-orders.js:1286`
- Native `confirmed` → `cancelled` (qua `POST /api/native-orders/:code/cancel`) → PBH state → `cancel`, restock idempotent (guard `wasNotCancelled`, `fast-sale-orders.js:1563`) → **emit `actual_revoked`**
- PBH `done` → `cancel` (qua `POST /api/fast-sale-orders/:number/cancel`) → cùng emit `actual_revoked`

### 2.5 ⚠ Products `source` field chỉ ở native side

`fast_sale_orders.order_lines` (JSONB) là copy snapshot từ `native_orders.products` lúc create PBH, **không copy `source` field**. KPI events phải emit từ native side. PBH chỉ là trigger để promote forecast → actual.

### 2.6 ⚠ 9 pages access native_orders data — đều cần STT filter

Backend (4):

- `render.com/routes/native-orders.js` GET `/load`, `/campaigns`, `/by-user`
- `render.com/routes/fast-sale-orders.js` sync endpoint
- `render.com/routes/pbh-reports.js` `top-customers-360`
- `render.com/routes/web2-products.js` (backfill — không user-facing, skip)

Frontend (5):

- `native-orders/js/native-orders-api.js:list()`
- `tpos-pancake/js/tpos/tpos-native-orders-api.js`
- `web2/customer-wallet/js/customer-wallet-app.js`
- `web2/products/js/web2-products-app.js` (cross-ref badge — skip)
- `web2/fastsaleorder-invoice/index.html` + js

---

## 3. Architecture v2

```
┌─────────────────────────────────────────────────────────────────────────┐
│ WRITE PATH                                                              │
├─────────────────────────────────────────────────────────────────────────┤
│  livestream drag-drop ─┐                                                │
│  native picker add ────┼─→ resolve beneficiary  ─→ web2_kpi_events     │
│  native picker remove ─┤   (lookup assignments)    [forecast events]   │
│  native qty change ────┘                                                │
│                                                                         │
│  PBH create ─────────────→ web2_kpi_events [actual_confirmed]           │
│  PBH cancel / native cancel → web2_kpi_events [actual_revoked]          │
└─────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ DERIVED PROJECTIONS                                                     │
├─────────────────────────────────────────────────────────────────────────┤
│  web2_kpi_forecast (beneficiary × campaign)                             │
│    qty + amount = qty × 5000                                            │
│                                                                         │
│  web2_kpi_actual (beneficiary × campaign)                               │
│    qty = forecast_qty - revoked_qty                                     │
└─────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ ASSIGNMENT (admin side)                                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  web2_kpi_assignments (campaign × user × stt_range)                     │
│  web2_kpi_assignment_history (audit changes)                            │
│                                                                         │
│  Visibility filter on list/load endpoints:                              │
│    - User has assignment → WHERE campaign_stt BETWEEN range            │
│    - User has no assignment → all rows in campaign                     │
│    - Admin → see all                                                    │
└─────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ UI                                                                      │
│  • /web2/kpi/index.html — forecast vs actual dashboard per campaign    │
│  • /web2/kpi/audit.html — ledger viewer + backlog review queue        │
│  • /web2/kpi/assignments.html — admin assign STT ranges               │
│  • /web2/users/ — link to assignments modal                           │
│  • native-orders + fastsaleorder-invoice — auto STT filter applied   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Invariants:**

- Ledger append-only; corrections = compensating events.
- Projections derived; can rebuild from ledger.
- Beneficiary = lookup at emit time; cached on event row (immutable post-emit).
- Reassigning STT range AFTER events emitted does NOT retroactively change beneficiary. New events use new mapping.

---

## 4. Schema v2

### 4.1 `native_orders` additive columns

```sql
ALTER TABLE native_orders
    ADD COLUMN campaign_stt INTEGER,
    ADD COLUMN actual_confirmed_at BIGINT,
    ADD COLUMN actual_revoked_at BIGINT;

CREATE INDEX idx_native_orders_campaign_stt
    ON native_orders(live_campaign_id, campaign_stt);

-- Backfill: per campaign, ORDER BY created_at ASC, assign 1..N
-- Done once in boot migration block.
```

### 4.2 `web2_kpi_assignments` (new)

```sql
CREATE TABLE web2_kpi_assignments (
    id              BIGSERIAL PRIMARY KEY,
    campaign_id     VARCHAR(100) NOT NULL,
    campaign_name   VARCHAR(255),                     -- denormalized for UI
    user_id         INTEGER NOT NULL REFERENCES web2_users(id) ON DELETE CASCADE,
    user_name       VARCHAR(120),                     -- denormalized
    stt_from        INTEGER NOT NULL,
    stt_to          INTEGER NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_by      VARCHAR(120),
    created_at      BIGINT NOT NULL,
    updated_at      BIGINT NOT NULL,
    CONSTRAINT range_valid CHECK (stt_from <= stt_to),
    CONSTRAINT range_unique UNIQUE (campaign_id, user_id, stt_from, stt_to)
);
CREATE INDEX idx_kpi_assign_campaign_user ON web2_kpi_assignments(campaign_id, user_id) WHERE is_active;
CREATE INDEX idx_kpi_assign_lookup ON web2_kpi_assignments(campaign_id, stt_from, stt_to) WHERE is_active;
```

**Overlap policy (admin error guard):** Application-level check before INSERT — query existing ranges for campaign, reject if `[new.stt_from, new.stt_to]` overlap any active range of OTHER user. Allow same-user multi-range (vd `A.1-50, A.150-200`).

### 4.3 `web2_kpi_assignment_history` (new — audit)

```sql
CREATE TABLE web2_kpi_assignment_history (
    id              BIGSERIAL PRIMARY KEY,
    assignment_id   BIGINT,           -- nullable for delete events
    campaign_id     VARCHAR(100) NOT NULL,
    user_id         INTEGER,
    action          VARCHAR(20) NOT NULL,  -- 'create' | 'update' | 'delete' | 'deactivate'
    before_jsonb    JSONB,
    after_jsonb     JSONB,
    changed_by      VARCHAR(120),
    changed_at      BIGINT NOT NULL,
    note            TEXT
);
CREATE INDEX idx_assign_hist_campaign ON web2_kpi_assignment_history(campaign_id, changed_at DESC);
```

### 4.4 `web2_kpi_events` (new — append-only ledger)

```sql
CREATE TABLE web2_kpi_events (
    id                BIGSERIAL PRIMARY KEY,
    event_time        BIGINT NOT NULL,        -- epoch ms
    event_type        VARCHAR(30) NOT NULL,   -- forecast_add | forecast_remove | forecast_qty_change
                                              -- | actual_confirmed | actual_revoked
    -- WHO
    actor_user_id     INTEGER NOT NULL,       -- ai bấm thực sự
    actor_name        VARCHAR(120),
    beneficiary_user_id INTEGER NOT NULL,     -- ai nhận KPI (= assignment lookup hoặc fallback actor)
    beneficiary_name  VARCHAR(120),
    beneficiary_source VARCHAR(20),           -- 'assignment' | 'fallback_actor'
    -- WHAT
    order_code        VARCHAR(64) NOT NULL,
    order_campaign_stt INTEGER,               -- snapshot at emit time
    customer_id       VARCHAR(128) NOT NULL,
    product_code      VARCHAR(64) NOT NULL,
    qty_delta         INTEGER NOT NULL,
    source            VARCHAR(20) NOT NULL,   -- 'livestream' | 'native' | 'backlog' | 'system'
    -- WHERE
    campaign_id       VARCHAR(100) NOT NULL,  -- = native_orders.live_campaign_id (required)
    source_page       VARCHAR(64),
    -- DEDUP
    client_event_id   VARCHAR(64),            -- UUID generated client-side per user action
    idempotency_key   VARCHAR(80) UNIQUE,     -- sha1(actor|customer|sku|campaign_id|event_type|client_event_id)
    -- AUDIT
    raw_payload       JSONB,                  -- snapshot for debug
    created_at        BIGINT NOT NULL DEFAULT (extract(epoch FROM now())*1000)::BIGINT,

    -- For actual_revoked → link back to original add for clawback math
    revokes_event_id  BIGINT REFERENCES web2_kpi_events(id)
);
CREATE INDEX idx_kpi_events_beneficiary ON web2_kpi_events(beneficiary_user_id, campaign_id);
CREATE INDEX idx_kpi_events_campaign ON web2_kpi_events(campaign_id, event_time DESC);
CREATE INDEX idx_kpi_events_order ON web2_kpi_events(order_code);
CREATE INDEX idx_kpi_events_tuple ON web2_kpi_events(customer_id, product_code, campaign_id);
CREATE INDEX idx_kpi_events_dedup ON web2_kpi_events(idempotency_key);
```

**`campaign_id` REQUIRED:** Đơn không có campaign (pure native, vd manual create) sẽ dùng synthetic id `'NO_CAMPAIGN'` để KPI vẫn track được. Admin có thể assign khoảng STT cho campaign này như bình thường.

### 4.5 `web2_kpi_forecast` + `web2_kpi_actual` (derived caches)

```sql
CREATE TABLE web2_kpi_forecast (
    beneficiary_user_id INTEGER NOT NULL,
    campaign_id     VARCHAR(100) NOT NULL,
    kpi_qty         INTEGER NOT NULL DEFAULT 0,
    kpi_amount      BIGINT NOT NULL DEFAULT 0,
    breakdown       JSONB NOT NULL DEFAULT '[]'::jsonb,
    last_recalc_at  BIGINT NOT NULL,
    PRIMARY KEY (beneficiary_user_id, campaign_id)
);

CREATE TABLE web2_kpi_actual (
    beneficiary_user_id INTEGER NOT NULL,
    campaign_id     VARCHAR(100) NOT NULL,
    kpi_qty         INTEGER NOT NULL DEFAULT 0,
    kpi_amount      BIGINT NOT NULL DEFAULT 0,
    revoked_qty     INTEGER NOT NULL DEFAULT 0,        -- info: how much cancelled
    breakdown       JSONB NOT NULL DEFAULT '[]'::jsonb,
    last_recalc_at  BIGINT NOT NULL,
    PRIMARY KEY (beneficiary_user_id, campaign_id)
);
```

---

## 5. Write path

### 5.1 Beneficiary resolution algorithm

```js
async function resolveBeneficiary({ campaign_id, campaign_stt, actor_user_id, actor_name }) {
    const r = await pool.query(
        `SELECT user_id, user_name FROM web2_kpi_assignments
         WHERE campaign_id = $1
           AND $2 BETWEEN stt_from AND stt_to
           AND is_active = TRUE
         LIMIT 1`,
        [campaign_id, campaign_stt]
    );
    if (r.rows.length) {
        return {
            beneficiary_user_id: r.rows[0].user_id,
            beneficiary_name: r.rows[0].user_name,
            beneficiary_source: 'assignment',
        };
    }
    return {
        beneficiary_user_id: actor_user_id,
        beneficiary_name: actor_name,
        beneficiary_source: 'fallback_actor',
    };
}
```

### 5.2 Emit `forecast_add` from cart.js (livestream)

[render.com/routes/v2/cart.js:267-356](../../render.com/routes/v2/cart.js) — sau khi UPDATE products thành công:

```js
const order = await pool.query(
    'SELECT campaign_stt, live_campaign_id FROM native_orders WHERE code = $1',
    [draft.code]
);
const { campaign_stt, live_campaign_id } = order.rows[0];
const campaign_id = live_campaign_id || 'NO_CAMPAIGN';
const beneficiary = await resolveBeneficiary({
    campaign_id,
    campaign_stt,
    actor_user_id: user.id,
    actor_name: user.name,
});

await _emitKpiEvent({
    event_type: 'forecast_add',
    actor_user_id: user.id,
    actor_name: user.name,
    ...beneficiary,
    order_code: draft.code,
    order_campaign_stt: campaign_stt,
    customer_id: customerId,
    product_code: p.code,
    qty_delta: qtyAdd,
    source: 'livestream',
    campaign_id,
    source_page: 'tpos-pancake',
    client_event_id: b.client_event_id, // generate client-side
    raw_payload: b,
});
```

Same pattern for `forecast_remove` (in remove endpoint).

### 5.3 Emit `forecast_*` from native-orders PATCH

[render.com/routes/native-orders.js:1116-1235](../../render.com/routes/native-orders.js):

After diff old vs new products:

- Item added → `forecast_add` (qty_delta = +new.quantity)
- Item removed → `forecast_remove` (qty_delta = -old.quantity)
- Qty changed → `forecast_qty_change` (qty_delta = new - old)

`source` lấy từ `productNew.source` (preserve from existing badge logic): `native`, `backlog`, hoặc `livestream` (legacy).

### 5.4 Emit `actual_confirmed` from PBH create

[render.com/routes/fast-sale-orders.js:1286](../../render.com/routes/fast-sale-orders.js) — sau khi native_orders → 'confirmed':

For each product trong native_order.products[]:

```js
await _emitKpiEvent({
    event_type: 'actual_confirmed',
    actor_user_id: req.user.id,
    beneficiary_user_id: <lookup again from assignments>,  // important: re-lookup at confirm time
    order_code, customer_id, product_code: p.productCode,
    qty_delta: p.quantity,
    source: p.source || 'unknown',
    campaign_id, order_campaign_stt,
    source_page: 'fastsaleorder-invoice',
    client_event_id: 'pbh_' + pbh_number + '_' + p.productCode,  // deterministic
});
```

Note: `client_event_id` deterministic theo PBH number — re-confirm cùng PBH sẽ dedup tự nhiên qua unique idempotency_key.

### 5.5 Emit `actual_revoked` from cancel

Khi `native_orders` cancel hoặc `fast_sale_orders` cancel (guard `wasNotCancelled`):

```js
// Tìm tất cả actual_confirmed events cho order này
const events = await pool.query(
    `SELECT id, product_code, qty_delta, beneficiary_user_id, customer_id, source
     FROM web2_kpi_events
     WHERE order_code = $1 AND event_type = 'actual_confirmed'`,
    [order_code]
);
for (const e of events.rows) {
    await _emitKpiEvent({
        event_type: 'actual_revoked',
        actor_user_id: req.user.id,
        beneficiary_user_id: e.beneficiary_user_id, // revoke vào cùng beneficiary
        order_code,
        customer_id: e.customer_id,
        product_code: e.product_code,
        qty_delta: -e.qty_delta,
        source: e.source,
        campaign_id,
        client_event_id: 'revoke_' + e.id, // deterministic
        revokes_event_id: e.id,
    });
}
```

### 5.6 Idempotency contract

- Client tạo `client_event_id` (UUID v4) mỗi lần user thao tác → mỗi action = 1 unique key
- Server-side retry không tạo client_event_id mới → cùng key → INSERT ON CONFLICT DO NOTHING
- Deterministic events (PBH confirm/cancel) dùng prefix `pbh_<number>_<sku>` để cancel→reissue PBH cũng dedup

---

## 6. KPI computation

### 6.1 Forecast (ledger query)

```sql
SELECT
    beneficiary_user_id,
    campaign_id,
    SUM(qty_delta) FILTER (WHERE event_type IN ('forecast_add', 'forecast_qty_change') AND source = 'native') AS native_qty,
    SUM(qty_delta) FILTER (WHERE event_type = 'forecast_remove' AND source = 'native') AS native_removed,
    GREATEST(0,
        COALESCE(SUM(qty_delta) FILTER (
            WHERE source = 'native' AND event_type LIKE 'forecast_%'
        ), 0)
    ) AS forecast_qty,
    GREATEST(0, COALESCE(...)) * 5000 AS forecast_amount
FROM web2_kpi_events
WHERE campaign_id = $1
GROUP BY beneficiary_user_id, campaign_id;
```

Note: `source = 'livestream'` và `'backlog'` đều **không** đóng góp forecast. Chỉ `source = 'native'` tính.

### 6.2 Actual (forecast - revoked + only on confirmed orders)

```sql
SELECT
    beneficiary_user_id,
    campaign_id,
    COALESCE(SUM(qty_delta) FILTER (
        WHERE event_type = 'actual_confirmed' AND source = 'native'
    ), 0) AS confirmed_qty,
    COALESCE(SUM(qty_delta) FILTER (
        WHERE event_type = 'actual_revoked' AND source = 'native'
    ), 0) AS revoked_qty,  -- negative
    GREATEST(0,
        COALESCE(SUM(qty_delta) FILTER (
            WHERE event_type IN ('actual_confirmed', 'actual_revoked') AND source = 'native'
        ), 0)
    ) AS actual_qty
FROM web2_kpi_events
WHERE campaign_id = $1
GROUP BY beneficiary_user_id, campaign_id;
```

### 6.3 Walkthrough cho các case

**Case A (delete-readd by mistake), beneficiary = A, campaign = X, sku = AO-001:**

| event  | type            | qty_delta | source | client_event_id |
| ------ | --------------- | --------- | ------ | --------------- |
| add    | forecast_add    | +1        | native | evt-aaa         |
| remove | forecast_remove | -1        | native | evt-bbb         |
| add    | forecast_add    | +1        | native | evt-ccc         |

Forecast(A, X) = +1 -1 +1 = +1 → 5,000đ. ✅

Nếu sau đó PBH tạo:
| confirm | actual_confirmed | +1 | native | pbh_HD123_AO-001 |

Actual(A, X) = +1 → 5,000đ. ✅

Nếu PBH cancel:
| revoke | actual*revoked | -1 | native | revoke*<event_id> |

Actual(A, X) = +1 -1 = 0 → 0đ. Forecast vẫn +1. ✅ (đúng spec #3)

**Case B (livestream + native add thêm), KH Y, AO-002, beneficiary B (assigned khoảng 50-100, đơn STT 75):**

| time  | type         | qty_delta | source     | actor                | beneficiary    |
| ----- | ------------ | --------- | ---------- | -------------------- | -------------- |
| 09:00 | forecast_add | +1        | livestream | Drag-system (user H) | B (assignment) |
| 11:00 | forecast_add | +2        | native     | B                    | B (assignment) |

Forecast(B, X) = filter source='native' → +2 → 10,000đ ✅
Forecast contribution của livestream = 0 (đúng spec).

Lưu ý: even though beneficiary là B cho event livestream, source='livestream' bị filter out trong forecast formula.

**Case C (backlog by Bình, beneficiary C — assigned đơn STT của KH Z):**

| time  | type         | qty_delta | source  | actor | beneficiary |
| ----- | ------------ | --------- | ------- | ----- | ----------- |
| 10:15 | forecast_add | +1        | backlog | Bình  | C           |

Forecast(C, X) = filter source='native' → 0 ✅. Bình ghi nhận thao tác (actor), nhưng C không nhận KPI vì backlog.

**Case D (đơn không thuộc khoảng assign, fallback actor):**

User Hoa add SP cho đơn STT 999, campaign Y có assignments A.1-100, B.101-200, C.201-500 — không cover 999.

→ beneficiary = Hoa (fallback_actor), forecast tăng cho Hoa.

### 6.4 Cron projection

`POST /api/v2/kpi/recalc?campaign_id=...` — rebuild `web2_kpi_forecast` + `web2_kpi_actual` cho campaign. Idempotent. Cron 5 min cho campaign đang active, 1 lần khi campaign end để lock.

---

## 7. Visibility filter

### 7.1 Frontend behavior

User logs in → page native-orders/index.html load:

1. Fetch `GET /api/v2/kpi/assignments/visible?user_id=ME` → trả assignments hoặc empty.
2. Nếu empty → load tất cả như cũ.
3. Nếu có assignments → filter UI:
    - Multi-campaign: chỉ show campaigns user được assign
    - Per campaign: show orders có `campaign_stt BETWEEN stt_from AND stt_to`
4. UI hiển thị banner "Bạn được phân khoảng STT 101-200 của campaign 'Live 30/5'" — gợi nhớ scope.

### 7.2 Backend enforcement (security)

PHẢI enforce ở backend, không trust frontend (vd Postman call):

Middleware `applyKpiScope(req, res, next)`:

- Extract `user_id` từ verified token
- Nếu user role = admin → skip scope
- Else: query `web2_kpi_assignments WHERE user_id = $1 AND is_active`
- Inject `req.kpiScope = [{campaign_id, stt_from, stt_to}, ...]`

Routes affected (xem §9):

- `native-orders.js:548` GET `/load` → add WHERE clause
- `native-orders.js:411` GET `/by-user` → add WHERE
- `fast-sale-orders.js` PBH list → add WHERE (PBH inherits source_code → native_orders → STT)
- `pbh-reports.js top-customers-360` → ⚠ aggregate report. Admin-only? Hoặc filter by scope?

### 7.3 SQL clause helper

```js
function buildScopeWhere(kpiScope, paramOffset) {
    if (!kpiScope || kpiScope.length === 0) return { clause: '', params: [] };
    const conds = [];
    const params = [];
    let i = paramOffset;
    for (const s of kpiScope) {
        conds.push(`(live_campaign_id = $${i} AND campaign_stt BETWEEN $${i + 1} AND $${i + 2})`);
        params.push(s.campaign_id, s.stt_from, s.stt_to);
        i += 3;
    }
    return { clause: '(' + conds.join(' OR ') + ')', params };
}
```

---

## 8. UI surfaces

### 8.1 `/web2/kpi/index.html` — Dashboard

Filter top: Campaign dropdown (default = current/last active).

Sub-tabs:

- **Forecast** — bảng nhân viên × forecast_qty × forecast_amount, sorted DESC
- **Actual** — bảng tương tự + cột `revoked_qty` info
- **So sánh** — side-by-side forecast vs actual, hiển thị gap = forecast - actual (số đơn bị cancel)

Row click → drill down: per-customer × per-sku breakdown của user trong campaign đó.

### 8.2 `/web2/kpi/audit.html` — Ledger viewer

- Filter: campaign, beneficiary, actor, customer, sku, source, event_type, date range
- Mỗi row = 1 event từ `web2_kpi_events`
- Cột: time | event_type | actor | beneficiary (+ source: assignment/fallback) | order STT | product | qty | source badge
- Export CSV cho payroll

### 8.3 `/web2/kpi/backlog-review.html` — Admin queue (Q6)

Filter `event_type IN ('forecast_add') AND source='backlog'` → admin review:

- Nếu admin xác nhận đúng livestream backlog → giữ nguyên, no action
- Nếu admin reject (suspicious) → button "Reclassify to native" → emit compensating: `forecast_remove` (source=backlog) + `forecast_add` (source=native) → KPI cho beneficiary đó tăng. Lưu lý do.

### 8.4 `/web2/kpi/assignments.html` — Admin assignment UI

Layout:

```
+--------------------------------------------------------+
| Chiến dịch: [Dropdown campaigns]                        |
+--------------------------------------------------------+
| Tổng đơn campaign: 487 (STT 1 → 487)                    |
+--------------------------------------------------------+
| Phân công:                                              |
|  Nhân viên   STT từ - STT đến    Số đơn    Action      |
|  A (Hoa)     1 - 100              100      [Sửa] [Xóa] |
|  B (Lan)     101 - 200            100      [Sửa] [Xóa] |
|  C (Bình)    201 - 487            287      [Sửa] [Xóa] |
|  + Thêm nhân viên                                       |
+--------------------------------------------------------+
| Chưa phân công: 0 đơn                                   |
| Lịch sử thay đổi: [Xem audit log]                       |
+--------------------------------------------------------+
```

Validation client-side:

- `stt_from <= stt_to`
- Không overlap khoảng của nhân viên khác (cùng user OK)
- Cảnh báo nếu để gap ("Khoảng 201-300 chưa phân — đơn STT trong khoảng này sẽ fallback về actor")

Save → POST `/api/v2/kpi/assignments` (bulk replace cho campaign) → write `web2_kpi_assignment_history` row cho mỗi delta.

### 8.5 `/web2/users/` — link entry point

Thêm column "Phân công KPI" trong table users với button "Phân công cho [user]" → mở modal: hiển thị tất cả campaigns + STT ranges của user đó.

### 8.6 native-orders + fastsaleorder-invoice — auto filter

- Khi load page, frontend tự apply scope từ assignments → user không phải làm gì
- Sidebar campaign dropdown chỉ show campaigns user có quyền xem
- Banner top hiển thị scope hiện tại

### 8.7 native-orders modal picker — Backlog toggle (giữ từ v1)

Toggle radio bên cạnh search:

- ◉ Thêm SP — tính KPI (5,000đ)
- ○ Thêm SP từ Backlog Live — admin sẽ check

Click "Backlog Live" → `source = 'backlog'` khi push line.

---

## 9. Pages affected — comprehensive update list

Từ audit của agent 4, đây là full list:

### Backend (must add KPI scope WHERE clause)

| File                                         | Route                     | Change                                              |
| -------------------------------------------- | ------------------------- | --------------------------------------------------- |
| `render.com/routes/native-orders.js:548`     | GET `/load`               | Apply `buildScopeWhere(req.kpiScope)`               |
| `render.com/routes/native-orders.js:411`     | GET `/by-user`            | Apply scope                                         |
| `render.com/routes/native-orders.js:850`     | GET `/campaigns`          | Filter campaigns user có assignment                 |
| `render.com/routes/fast-sale-orders.js`      | GET PBH list              | JOIN native_orders to get campaign_stt, apply scope |
| `render.com/routes/pbh-reports.js`           | `top-customers-360`       | Admin-only OR apply scope (decide w/ user)          |
| `render.com/routes/v2/cart.js:267`           | POST `/cart/.../add`      | Emit `forecast_add` event                           |
| `render.com/routes/v2/cart.js:361`           | POST `/cart/.../remove`   | Emit `forecast_remove` event                        |
| `render.com/routes/native-orders.js:1116`    | PATCH `/:code`            | Diff products, emit events                          |
| `render.com/routes/native-orders.js:1302`    | POST `/:code/cancel`      | Emit `actual_revoked` events                        |
| `render.com/routes/fast-sale-orders.js:1286` | POST `/from-native-order` | Emit `actual_confirmed` events                      |
| `render.com/routes/fast-sale-orders.js:1596` | POST `/:number/cancel`    | Emit `actual_revoked` events                        |

### Frontend (must respect scope or update UI)

| File                                             | Change                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| `native-orders/js/native-orders-api.js:48-67`    | List() — backend already filters; FE shows banner                        |
| `native-orders/js/native-orders-app.js:1303`     | `addLineFromPicker` set `addedBy + addedById + source`                   |
| `native-orders/js/native-orders-app.js:saveEdit` | Send `X-User-Token` header                                               |
| `native-orders/js/native-orders-app.js`          | Add Backlog toggle radio                                                 |
| `native-orders/js/native-orders-app.js`          | Render `campaign_stt` column (separate from `display_stt`)               |
| `tpos-pancake/js/tpos/tpos-native-orders-api.js` | Inherit scope if frontend lists native orders                            |
| `tpos-pancake/js/pancake/inventory-panel.js`     | Generate `client_event_id` per drag                                      |
| `web2/customer-wallet/js/customer-wallet-app.js` | Aggregate respects scope (admin-only?)                                   |
| `web2/products/js/web2-products-app.js`          | Cross-ref badge — admin-only or scope filter                             |
| `web2/fastsaleorder-invoice/index.html` + js     | Add columns: campaign STT, KPI source; filter by campaign; respect scope |
| `web2/users/js/users-app.js`                     | Add "Phân công KPI" button per row                                       |
| `web2/shared/sidebar.js`                         | Add `/web2/kpi/*` group entries (admin only)                             |

### New pages

| Path                            | Purpose                              |
| ------------------------------- | ------------------------------------ |
| `/web2/kpi/index.html`          | Forecast vs Actual dashboard         |
| `/web2/kpi/audit.html`          | Ledger viewer                        |
| `/web2/kpi/backlog-review.html` | Admin backlog review queue           |
| `/web2/kpi/assignments.html`    | Admin assign STT ranges per campaign |
| `/web2/kpi/css/` + `js/`        | Module styles + logic                |

---

## 10. Sprints (revised)

### Sprint 0 — Audit Gaps + Schema (2 days)

- [ ] T0.1 Migration: add `campaign_stt` column + backfill per campaign
- [ ] T0.2 Migration: `web2_kpi_assignments`, `web2_kpi_assignment_history`, `web2_kpi_events`, `web2_kpi_forecast`, `web2_kpi_actual`
- [ ] T0.3 Fix audit gaps from v1 §0.1-0.3 (addedBy + token verify)
- [ ] T0.4 Test: migrate local DB (DROP + recreate), verify campaign_stt assigned correctly per campaign

### Sprint 1 — Ledger Write Path (3 days)

- [ ] T1.1 `_emitKpiEvent` shared helper + `resolveBeneficiary`
- [ ] T1.2 Wire cart.js: add/remove → `forecast_*` events
- [ ] T1.3 Wire native-orders PATCH: diff → events
- [ ] T1.4 Wire from-native-order: `actual_confirmed` per product
- [ ] T1.5 Wire native cancel + PBH cancel: `actual_revoked`
- [ ] T1.6 Client-side: generate `client_event_id` UUID per user action
- [ ] T1.7 Test scenarios A/B/C/D từ §6.3 → ledger có đủ rows, idempotency hold

### Sprint 2 — Assignment System (2 days)

- [ ] T2.1 `/api/v2/kpi/assignments` CRUD endpoints + history audit
- [ ] T2.2 `/web2/kpi/assignments.html` UI: select campaign + edit ranges + overlap validation
- [ ] T2.3 Add "Phân công KPI" button vào `/web2/users/` row actions
- [ ] T2.4 Test: assign A.1-100 + B.101-200, drag SP cho đơn STT 50 → ledger ghi beneficiary=A

### Sprint 3 — Visibility Filter (2 days)

- [ ] T3.1 Middleware `applyKpiScope` + `buildScopeWhere` helper
- [ ] T3.2 Apply scope ở 11 routes liệt kê §9
- [ ] T3.3 Frontend: native-orders banner "Bạn được phân khoảng X-Y" + dropdown campaigns lọc theo assignment
- [ ] T3.4 Apply scope cho fastsaleorder-invoice
- [ ] T3.5 Test: login user A → chỉ thấy 100 đơn; user D unassigned → thấy tất cả

### Sprint 4 — Dashboard + Backlog Review (3 days)

- [ ] T4.1 `POST /api/v2/kpi/recalc?campaign_id=` + cron 5min
- [ ] T4.2 `GET /api/v2/kpi/dashboard?campaign_id=&user_id=` API
- [ ] T4.3 `/web2/kpi/index.html` Forecast / Actual / So sánh tabs
- [ ] T4.4 `/web2/kpi/audit.html` ledger viewer + CSV export
- [ ] T4.5 `/web2/kpi/backlog-review.html` admin queue + reclassify action
- [ ] T4.6 SSE topic `web2:kpi:<userId>` → realtime update

### Sprint 5 — fastsaleorder-invoice + Polish (1-2 days)

- [ ] T5.1 Add campaign STT column + filter
- [ ] T5.2 Respect scope (PBH inherit native scope via source_code JOIN)
- [ ] T5.3 KPI source column (giống native-orders badge)
- [ ] T5.4 Sidebar entries (admin-only)
- [ ] T5.5 Docs: user guide cho admin + nhân viên

**Total estimate:** 13-14 days với 1 dev, hoặc ~7 days với 2 devs parallel.

---

## 11. Risks + open questions remaining

| #   | Risk / Question                                                                                                 | Severity | Mitigation / Decision needed                                                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `campaign_stt` backfill cho 50K+ orders cũ chạy lâu                                                             | M        | Run migration off-peak; index sau khi backfill xong                                                                                                                                                                  |
| R2  | User reassign khoảng STT giữa campaign — events emitted trước có bị change beneficiary không?                   | H        | Decision: **immutable** — events giữ beneficiary cũ. Mới apply cho events sau. Confirmed §3 invariants.                                                                                                              |
| R3  | Đơn không có `live_campaign_id` (pure native) — đếm vào "NO_CAMPAIGN" group                                     | M        | Default OK. Admin có thể assign khoảng STT cho synthetic campaign này.                                                                                                                                               |
| R4  | Cancel PBH rồi tạo lại PBH mới (split=true) — KPI thực được tính lại không?                                     | M        | `actual_revoked` event dùng `revokes_event_id` link → khi tạo PBH mới, emit `actual_confirmed` mới với `client_event_id` deterministic theo PBH number → tự nhiên dedup. ✅                                          |
| R5  | Nhân viên Hoa thao tác trên đơn của KH X campaign Y nhưng X chưa nằm trong campaign Y nào (assignment chưa tạo) | M        | Fallback to actor → Hoa nhận. Admin tạo assignment sau → events cũ giữ beneficiary cũ (Hoa), events mới chuyển sang assignee mới.                                                                                    |
| R6  | Đơn STT bị split (split_index=2) → STT bị duplicate                                                             | M        | Index khoảng STT: query bằng cả `campaign_stt` AND `split_index = 0` (chỉ original count). Hoặc: split_index > 0 inherit beneficiary của parent. **Quyết định:** inherit parent (split là copy, không phải đơn mới). |
| R7  | Performance: query forecast/actual real-time scan 100K events                                                   | L        | Cache trong `web2_kpi_forecast/actual` tables, recalc cron + on-demand. SSE notify khi event mới.                                                                                                                    |
| Q8  | Backlog event có nên ảnh hưởng Actual không (vd PBH với SP backlog → KPI thực có count?)                        | **❓**   | Cần user confirm. Đề xuất: **không count** (cả forecast lẫn actual filter source='native' only)                                                                                                                      |
| Q9  | Nhân viên xóa SP của nhân viên khác (vd Hoa xóa SP do Bình add) — KPI của ai giảm?                              | **❓**   | Đề xuất: KPI của **beneficiary của event add gốc** giảm. actor = Hoa nhưng beneficiary_user_id từ original add event được copy sang event remove.                                                                    |
| Q10 | Forecast lifetime — campaign closed có lock không?                                                              | **❓**   | Đề xuất: lock khi `campaigns.custom_end_date < now`. Sau lock, ledger events vẫn cho phép (audit, backlog review), nhưng projection numbers không thay đổi unless admin manual recalc.                               |

---

## 12. Glossary

| Term                   | Meaning                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Forecast KPI**       | Dự báo — count khi SP add (source=native), status đơn không liên quan                                         |
| **Actual KPI**         | Thực tế — count khi đơn convert thành PBH; cancel PBH → revoke                                                |
| **Actor**              | Người thực sự bấm thao tác (UI user)                                                                          |
| **Beneficiary**        | Người nhận KPI = assignment lookup theo (campaign, STT)                                                       |
| **STT**                | Số thứ tự đơn — `campaign_stt` per-campaign, `display_stt` global                                             |
| **Campaign**           | 1 phiên livestream (live_campaign_id from TPOS)                                                               |
| **Backlog**            | SP đáng lẽ thuộc livestream nhưng nhân viên thêm post-live qua native — không tính KPI, admin có queue review |
| **Assignment**         | Khoảng STT (stt_from, stt_to) trong campaign gán cho nhân viên                                                |
| **Scope**              | List active assignments của user → filter visibility data                                                     |
| **Clawback**           | Revoke KPI thực khi cancel — không revoke Forecast                                                            |
| **Idempotency key**    | Hash duy nhất per event → INSERT ON CONFLICT DO NOTHING → ngăn double-count                                   |
| **Compensating event** | Event ngược chiều (vd `actual_revoked`) để correct ledger thay vì UPDATE/DELETE                               |
| **PBH**                | Phiếu bán hàng = `fast_sale_orders` row                                                                       |

---

## 13. References (giữ từ v1)

- DP6/Marketing-Attribution-Models, eeghor/mta — touchpoint attribution
- Everstage clawback guide, Salesforce sales blog — commission revoke patterns
- Commission Factory dedup — affiliate sale dedup
- CockroachLabs idempotency, Blnk Ledger — fintech double-entry pattern
- `render.com/routes/v2/audit-log.js` — union audit pattern
- `web2/shared/web2-user-info.js` — user identity helper
- `render.com/routes/v2/delivery-assignments.js` — assignment table pattern reference
