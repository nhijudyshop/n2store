# KPI Attribution System — Detailed Plan

> **Trạng thái:** DRAFT — chờ user duyệt trước khi implement
> **Created:** 2026-05-31
> **Owner:** TBD
> **Stakeholder:** Shop manager (chấm KPI nhân viên)

---

## 0. Mục tiêu kinh doanh

Tính KPI cho từng nhân viên dựa trên SP họ thêm vào đơn khách qua **kênh thủ công** (native-orders modal picker), với rate **5,000 VNĐ × số lượng SP**. SP đến từ **kênh tự động** (livestream cart drag-drop ở tpos-pancake) **không** tính KPI vì đó là việc của team chốt live, không phải nỗ lực cá nhân.

Hệ thống PHẢI:

1. Đúng (không double-count, không miss legitimate work)
2. Forgiving — bỏ qua honest mistakes (delete-readd do lỗi thao tác)
3. Auditable — manager xem được mọi event tính KPI
4. Defensible — nhân viên có quyền dispute, có log để verify

---

## 1. Kết quả research

### 1.1 Audit gaps hiện tại (BLOCKER cần fix trước khi tính KPI)

| Gap                                                                | Severity        | File:Line                                                                        |
| ------------------------------------------------------------------ | --------------- | -------------------------------------------------------------------------------- |
| Picker `addLineFromPicker` không set `addedBy` / `addedById`       | **CRITICAL**    | `native-orders/js/native-orders-app.js:1303-1330`                                |
| PATCH `/api/native-orders/:code` không record editor identity      | **CRITICAL**    | `render.com/routes/native-orders.js:1116-1235`                                   |
| `saveEdit` không gửi user context trong PATCH body                 | **CRITICAL**    | `native-orders/js/native-orders-app.js:1456-1493` + `native-orders-api.js:89-95` |
| `addedBy` bị overwrite khi re-add (mất original attribution)       | HIGH            | `render.com/routes/v2/cart.js:317`                                               |
| Không có audit table cho mutations của `native_orders.products[]`  | HIGH            | — (cần tạo mới)                                                                  |
| Backend trust `user.id` từ client body, không verify session token | HIGH (security) | `render.com/routes/v2/cart.js:347`                                               |

### 1.2 Audit infrastructure đã có (TÁI SỬ DỤNG)

- **`web2_cart_history`** — đầy đủ log livestream cart: `(id, comment_id, product_code, action, qty_before, qty_after, user_id, user_name, source_page, created_at)`. Source: [render.com/routes/v2/cart.js:34-56](../../render.com/routes/v2/cart.js).
- **`web2_users` + `web2_user_sessions`** — server-validated employee table với BIGSERIAL ids, token sessions ([render.com/routes/web2-users.js:254](../../render.com/routes/web2-users.js)). API `/api/web2-users/me?token=` trả về user info validated.
- **`Web2UserInfo.get()`** ([web2/shared/web2-user-info.js:73](../../web2/shared/web2-user-info.js)) — client helper trả `{userId, userName, sourcePage}` từ Web2Auth token. CÓ SẴN nhưng `saveEdit` chưa dùng.

### 1.3 Algorithm chọn — First-Touch + Append-Only Ledger

So sánh 3 option (research [§5](#)):

| Option                                    | Mô tả                                                                                              | Cover case A                      | Cover case B | Cover case C   | Verdict           |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------- | ------------ | -------------- | ----------------- |
| A: source-field only                      | KPI = count(`source='native'`)                                                                     | ❌ (delete-readd ghi nhầm native) | ❌           | ❌             | Quá đơn giản      |
| B: subtract-baseline                      | `max(0, native_qty - livestream_qty)` per tuple                                                    | ✅                                | ✅           | ❌ (vẫn count) | Tốt nhưng thiếu C |
| **C: First-touch + ledger + manual flag** | First event's source quyết định attribution per `(customer, sku, day)`; case C dùng "Backlog" flag | ✅                                | ✅           | ✅ (manual)    | **WINNER**        |

**Rationale Option C:**

- Industry standard cho commission/attribution (Stripe, Salesforce, Commission Factory, impact.com)
- Idempotency key = `sha1(employee|customer|product_code|YYYY-MM-DD)` → re-emit cùng event là no-op → wash-trade tự động bị neutralize
- Ledger append-only → KPI là **derived projection**, không phải in-place counter → replayable, auditable
- Case C cần human-in-loop (không thể auto-detect "SP đáng lẽ là livestream") → giải quyết bằng UI button "Thêm SP từ Backlog Live" set `source='livestream'` ngay từ picker

**Sources cited:** Everstage clawback guide, Salesforce sales blog, Commission Factory dedup best practice, CockroachLabs idempotency, Blnk Ledger architecture, DP6/Marketing-Attribution-Models (GitHub), eeghor/mta (GitHub).

---

## 2. Architecture

```
┌────────────────────────────────────────────────────────────┐
│  WRITE PATH — append-only ledger                          │
├────────────────────────────────────────────────────────────┤
│  tpos-pancake drag-drop ─┐                                 │
│  native-orders picker ───┼──→ web2_kpi_events  (immutable) │
│  native-orders qty/del ──┘    (every action = 1 row)       │
└────────────────────────────────────────────────────────────┘
              ↓ (read-only projection job, idempotent)
┌────────────────────────────────────────────────────────────┐
│  READ PATH — daily KPI projection                          │
├────────────────────────────────────────────────────────────┤
│  web2_kpi_daily  (employee × day)                          │
│    ├─ kpi_qty                                              │
│    ├─ kpi_amount = kpi_qty × 5000                          │
│    └─ breakdown_jsonb (per-customer, per-sku)              │
└────────────────────────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────────────────────────┐
│  UI                                                        │
│   • /web2/kpi/index.html — dashboard per-employee daily   │
│   • /web2/kpi/audit.html — ledger viewer (manager + emp)  │
│   • native-orders modal: "Backlog Live" button           │
└────────────────────────────────────────────────────────────┘
```

**Key invariants:**

- `web2_kpi_events` is **append-only** — no UPDATE, no DELETE. Corrections = compensating events.
- `web2_kpi_daily` is **derived** — can be rebuilt from events at any time. Caches result.
- Idempotency key prevents duplicate accounting even if write path is retried.

---

## 3. Schema

### 3.1 `web2_kpi_events` (new — append-only ledger)

```sql
CREATE TABLE web2_kpi_events (
    id              BIGSERIAL PRIMARY KEY,
    event_time      TIMESTAMPTZ NOT NULL DEFAULT now(),
    event_type      VARCHAR(20)  NOT NULL,  -- 'add' | 'remove' | 'qty_change' | 'reattribute'
    -- WHO
    actor_user_id   BIGINT       NOT NULL,  -- FK web2_users.id (server-verified)
    actor_name      VARCHAR(120) NOT NULL,
    -- WHAT
    order_code      VARCHAR(64)  NOT NULL,  -- native_orders.code
    customer_id     VARCHAR(128) NOT NULL,  -- = fb_user_id thường
    product_code    VARCHAR(64)  NOT NULL,
    qty_delta       INTEGER      NOT NULL,  -- +N for add, -N for remove
    source          VARCHAR(20)  NOT NULL,  -- 'livestream' | 'native' | 'backlog'
    -- WHERE / WHY
    source_page     VARCHAR(64),            -- 'tpos-pancake' | 'native-orders' | …
    idempotency_key VARCHAR(64)  UNIQUE,    -- sha1(actor|customer|sku|day|event_type|delta) — prevents wash trade
    business_day    DATE         NOT NULL,  -- Asia/Bangkok timezone
    -- AUDIT
    raw_payload     JSONB,                  -- snapshot full request body (debug)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_kpi_events_actor_day ON web2_kpi_events(actor_user_id, business_day);
CREATE INDEX idx_kpi_events_order ON web2_kpi_events(order_code);
CREATE INDEX idx_kpi_events_customer_sku_day ON web2_kpi_events(customer_id, product_code, business_day);
CREATE INDEX idx_kpi_events_time ON web2_kpi_events(event_time DESC);
```

**Idempotency key composition:**

```
key = sha1(actor_user_id || '|' || customer_id || '|' || product_code || '|' ||
           business_day || '|' || event_type || '|' || qty_delta)
```

Re-add cùng SP cho cùng KH cùng ngày từ cùng employee với cùng delta → UNIQUE violation → backend swallow → 0 double-count.

### 3.2 `web2_kpi_daily` (new — derived projection cache)

```sql
CREATE TABLE web2_kpi_daily (
    actor_user_id   BIGINT       NOT NULL,
    business_day    DATE         NOT NULL,
    kpi_qty         INTEGER      NOT NULL DEFAULT 0,
    kpi_amount      BIGINT       NOT NULL DEFAULT 0,  -- VND
    livestream_qty  INTEGER      NOT NULL DEFAULT 0,  -- info only (not paid)
    breakdown       JSONB        NOT NULL DEFAULT '[]'::jsonb,  -- per-customer × sku detail
    last_recalc_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (actor_user_id, business_day)
);
CREATE INDEX idx_kpi_daily_day ON web2_kpi_daily(business_day DESC);
```

### 3.3 Migration on `native_orders.products` (additive)

Mỗi item trong `products[]` JSONB nay phải có:

- `source: 'livestream' | 'native' | 'backlog'`
- `addedBy: string` — display name
- `addedById: number` — `web2_users.id` (server-verified)
- `addedAt: number` — epoch ms

Existing rows: backfill `source` từ `web2_cart_history` (action='add') khi possible, default `'unknown'` → không tính KPI.

---

## 4. Write path — instrumentation

### Phase 0 — Fix audit gaps (PRECONDITION)

**0.1** `native-orders/js/native-orders-app.js:1303-1330` — `addLineFromPicker`:

```js
const userInfo = window.Web2UserInfo?.get('native-orders') || {};
EDIT_LINES.push({
    productCode: code,
    name,
    price,
    quantity: 1,
    imageUrl,
    note: '',
    total: price,
    addedAt: Date.now(),
    source: 'native', // already exists
    addedBy: userInfo.userName || null, // NEW
    addedById: userInfo.userId || null, // NEW
});
```

**0.2** `native-orders-api.js:89-95` — `update(code, fields)`:

```js
const userInfo = window.Web2UserInfo?.get('native-orders') || {};
return fetch(`${BASE}/${code}`, {
    method: 'PATCH',
    headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userInfo.userId,
        'X-User-Name': userInfo.userName,
        'X-User-Token': userInfo.token, // server verifies
    },
    body: JSON.stringify(fields),
});
```

**0.3** `render.com/routes/native-orders.js` — PATCH `/:code`:

- Middleware `verifyWeb2User(req, res, next)` đọc `X-User-Token`, query `web2_user_sessions` để lấy `actor_user_id` + `actor_name`. Reject nếu invalid.
- Trong handler: **diff `products[]` cũ vs mới** → emit `web2_kpi_events` cho mỗi delta (xem §4.3).

### Phase 1 — Ledger write từ livestream cart

`render.com/routes/v2/cart.js`:

**1.1** `_logHistory` đã có → **giữ nguyên** (audit purpose).

**1.2** Thêm function `_emitKpiEvent({eventType, actorId, actorName, orderCode, customerId, productCode, qtyDelta, source, sourcePage, rawPayload})`:

- Compute `business_day = (event_time AT TIME ZONE 'Asia/Bangkok')::date`
- Compute `idempotency_key = sha1(...)` như §3.1
- `INSERT INTO web2_kpi_events ON CONFLICT (idempotency_key) DO NOTHING`
- Async, không block main flow (log error nếu fail).

**1.3** Call sites:

- POST `/cart/:commentId/add` → emit `{eventType:'add', qtyDelta:+qtyAdd, source:'livestream'}`
- POST `/cart/:commentId/:productCode/remove` → emit `{eventType:'remove', qtyDelta:-qtyRemoved}`
- POST `/cart/:commentId/clear` → emit batch remove cho mọi line.

### Phase 2 — Ledger write từ native-orders PATCH

`render.com/routes/native-orders.js` PATCH `/:code`:

**2.1** Lấy `productsOld = current.products`, `productsNew = body.products`.

**2.2** Diff bằng `productCode` (composite key):

- Item mới (có trong New, không có trong Old) → emit `add` với delta = new.quantity
- Item bị xóa → emit `remove` với delta = -old.quantity
- Qty thay đổi → emit `qty_change` với delta = new.quantity - old.quantity

**2.3** `source` của event = `productNew.source` (preserve, không override):

- Nếu picker default `'native'` → KPI count
- Nếu user click "Backlog Live" button → `'backlog'` → KPI không count

**2.4** Khi diff không match (vd item cũ có source='livestream' nhưng item mới không có source) → preserve old source (đã làm ở §4.2 commit hôm qua).

### Phase 3 — UI: Backlog Live button (case C handler)

Trong native-orders edit modal, **bên cạnh** product picker, thêm toggle:

```html
<label class="picker-source-toggle">
    <input type="radio" name="picker-source" value="native" checked />
    <span>Thêm SP — tính KPI (5,000đ)</span>
</label>
<label class="picker-source-toggle">
    <input type="radio" name="picker-source" value="backlog" />
    <span>Thêm SP từ Backlog Live — không tính KPI</span>
</label>
```

Khi user chọn "Backlog Live", `addLineFromPicker` set `source: 'backlog'` thay vì `'native'`. UI hiển thị badge cam "Backlog Live" thay vì xanh "Trực tiếp".

**Why this works for case C:** Nhân viên TỰ KHAI báo rằng SP này là missed-from-livestream → honest declaration. Manager có thể audit ledger để verify (xem có comment FB matching SP đó trong livestream session không).

---

## 5. KPI computation algorithm

### 5.1 Realtime: ledger là source of truth

Khi cần biết KPI của nhân viên X ngày D:

```sql
SELECT
    COALESCE(SUM(qty_delta) FILTER (WHERE source = 'native'), 0) AS net_native_qty,
    COALESCE(SUM(qty_delta) FILTER (WHERE source = 'livestream'), 0) AS net_live_qty,
    COALESCE(SUM(qty_delta) FILTER (WHERE source = 'backlog'), 0) AS net_backlog_qty
FROM web2_kpi_events
WHERE actor_user_id = $1
  AND business_day = $2;
```

**KPI formula:**

```
kpi_qty = GREATEST(0, net_native_qty)
kpi_amount = kpi_qty × 5000
```

Lý do `GREATEST(0, ...)` — nếu nhân viên add 3 SP rồi remove 5 SP (vd correcting cũ), net âm → set 0 thay vì âm KPI.

### 5.2 Per-tuple first-touch (anti-double-credit cho case B)

Khi cùng `(customer_id, product_code, business_day)` có cả livestream + native events:

```sql
WITH first_touch AS (
    SELECT customer_id, product_code, business_day,
           (SELECT source FROM web2_kpi_events e2
            WHERE e2.customer_id = e.customer_id
              AND e2.product_code = e.product_code
              AND e2.business_day = e.business_day
              AND e2.event_type = 'add'
            ORDER BY event_time ASC LIMIT 1) AS first_source
    FROM web2_kpi_events e
    GROUP BY customer_id, product_code, business_day
),
totals AS (
    SELECT e.actor_user_id, e.customer_id, e.product_code, e.business_day,
           SUM(e.qty_delta) FILTER (WHERE e.source = 'native') AS native_qty,
           SUM(e.qty_delta) FILTER (WHERE e.source = 'livestream') AS live_qty
    FROM web2_kpi_events e
    GROUP BY e.actor_user_id, e.customer_id, e.product_code, e.business_day
)
SELECT t.actor_user_id, t.business_day,
       SUM(
         CASE
           WHEN ft.first_source = 'native' THEN GREATEST(0, COALESCE(t.native_qty, 0))
           WHEN ft.first_source = 'livestream' THEN GREATEST(0, COALESCE(t.native_qty, 0))  -- delta only
           ELSE 0  -- backlog or unknown
         END
       ) AS kpi_qty
FROM totals t
JOIN first_touch ft USING (customer_id, product_code, business_day)
GROUP BY t.actor_user_id, t.business_day;
```

**Giải thích:**

- `first_source='native'` (case "SP mới hoàn toàn từ kênh native") → tính full `net_native_qty`
- `first_source='livestream'` (case B: livestream trước, native add thêm sau) → vẫn tính `net_native_qty` (= delta sau livestream). Nếu nhân viên chỉ re-add (xóa rồi thêm lại — case A) thì `net_native_qty = 0` → không phát sinh KPI sai.
- `source='backlog'` (case C) → không đóng góp vào KPI

### 5.3 Cron projection job

Endpoint `POST /api/v2/kpi/recalc?day=YYYY-MM-DD` (manager-only):

- Idempotent: rebuild `web2_kpi_daily` từ `web2_kpi_events` cho ngày D
- Cron tự động chạy mỗi 5 phút cho `business_day = today` + 1 lần lúc 23:55 lock ngày cũ
- Manual rebuild khi có dispute

---

## 6. Edge case walkthroughs

### Case A — Delete then re-add (honest mistake)

**Scenario:** Nhân viên Hoa add SP "AO-001" cho KH X via picker (lúc 14:00). Realize đặt sai size, xóa (14:01), thêm lại (14:02).

**Ledger events:**
| time | type | qty_delta | source | idempotency_key |
|------|------|-----------|--------|-----------------|
| 14:00 | add | +1 | native | sha1(Hoa\|X\|AO-001\|2026-05-31\|add\|+1) |
| 14:01 | remove | -1 | native | sha1(Hoa\|X\|AO-001\|2026-05-31\|remove\|-1) |
| 14:02 | add | +1 | native | sha1(Hoa\|X\|AO-001\|2026-05-31\|add\|+1) ← **SAME KEY as 14:00 → INSERT bị skip** |

**Outcome:** Net native_qty = +1 - 1 = 0 (event 14:02 không insert). Hmm, đây là problem — net=0 nghĩa là Hoa không nhận KPI cho SP này!

**Fix:** Idempotency key cần include `attempt_seq` hoặc `client_event_id` (UUID generate client-side mỗi action). Update key:

```
key = sha1(actor || customer || sku || day || event_type || client_event_id)
```

- `client_event_id` mỗi lần action user khác nhau → 3 events đều insert được
- Trick: cả 3 events vẫn được dedup nếu **server retry** (network failure) — dùng `client_event_id` để dedup network retry, còn user thao tác lại là sự kiện logic mới

Re-walk case A:
| time | type | qty_delta | client_event_id | inserted? |
|------|------|-----------|------------------|-----------|
| 14:00 | add | +1 | evt-aaa | ✅ |
| 14:01 | remove | -1 | evt-bbb | ✅ |
| 14:02 | add | +1 | evt-ccc | ✅ |

Net = +1 - 1 + 1 = +1 → KPI tính 5000đ cho SP cuối. **Correct.**

### Case B — Livestream rồi native thêm

**Scenario:** Livestream chốt 1 SP "AO-002" cho KH Y lúc 09:00. Lan add thêm 2 SP "AO-002" cho cùng KH Y qua native picker lúc 11:00.

**Ledger:**
| time | actor | type | qty_delta | source |
|------|-------|------|-----------|--------|
| 09:00 | (drag-drop system) | add | +1 | livestream |
| 11:00 | Lan | add | +2 | native |

Tuple `(KH_Y, AO-002, 2026-05-31)`:

- first_source = livestream
- net_native_qty = +2 → Lan nhận `2 × 5000 = 10,000đ`. **Correct.**

### Case C — Missed livestream, added native after

**Scenario:** Livestream xong lúc 10:00. KH Z comment "Cho 1 SP AO-003" lúc 09:55 nhưng nhân viên Bình không kịp drag. Lúc 10:15 Bình mở native-orders modal cho KH Z, click toggle **"Thêm SP từ Backlog Live — không tính KPI"** rồi thêm AO-003.

**Ledger:**
| time | actor | type | qty_delta | source |
|------|-------|------|-----------|--------|
| 10:15 | Bình | add | +1 | backlog |

KPI Bình += 0 (backlog không count). **Correct — không gian lận, không thiệt SP cho khách.**

**Variant C1 — Bình quên click toggle:**

- Event ghi `source='native'` → Bình nhận 5000đ sai
- Manager review ledger thấy có FB comment matching SP đó trong session livestream → flag để clawback
- Future: detection rule — nếu KH có livestream cart cùng ngày AND native add trong ±30min sau livestream end → auto-flag review

---

## 7. UI surfaces

### 7.1 `/web2/kpi/index.html` — Dashboard per-employee

- Tab: "Hôm nay" | "Tuần này" | "Tháng" | "Custom range"
- Table columns: `Nhân viên | SP livestream (info) | SP native (KPI) | SP backlog (info) | Tiền KPI`
- Row click → drill down per-customer × per-sku breakdown
- Top 3 cards: tổng team KPI tháng, top performer, "cần review" count

### 7.2 `/web2/kpi/audit.html` — Ledger viewer

- Filter: nhân viên, ngày, customer, SKU, source
- Show: raw events từ `web2_kpi_events` (mỗi event 1 row)
- Manager có thể click "Flag for review" lên 1 event → tạo entry trong `kpi_review_queue`
- Export CSV cho payroll

### 7.3 native-orders modal — Backlog toggle

Đã spec ở §4 Phase 3.

### 7.4 Sidebar entry

Thêm vào `web2/shared/sidebar.js` route `/web2/kpi/` group "Quản lý" — chỉ hiển thị cho role manager/admin.

---

## 8. Implementation phases

### Sprint 0 — Audit Gaps (1 day, BLOCKER)

- [ ] T0.1 `addLineFromPicker` set `addedBy + addedById` từ `Web2UserInfo`
- [ ] T0.2 `saveEdit` PATCH gửi `X-User-Token` header
- [ ] T0.3 Middleware `verifyWeb2User` trên native-orders PATCH
- [ ] T0.4 Test: smoke với test customer Huỳnh Thành Đạt + 2 SP picker → verify `addedBy` ghi đúng

### Sprint 1 — Ledger Schema + Write (2 days)

- [ ] T1.1 Migration: `web2_kpi_events` + `web2_kpi_daily` (boot block trong server.js)
- [ ] T1.2 `_emitKpiEvent` helper trong shared util
- [ ] T1.3 cart.js call sites: add / remove / clear
- [ ] T1.4 native-orders.js PATCH: diff products → emit events
- [ ] T1.5 Idempotency với `client_event_id` (UUID generate client-side)
- [ ] T1.6 Test: case A walkthrough — 3 actions ledger có 3 rows đúng

### Sprint 2 — Projection + Dashboard (2 days)

- [ ] T2.1 `POST /api/v2/kpi/recalc` endpoint + cron 5min
- [ ] T2.2 `GET /api/v2/kpi/daily?actor=&from=&to=` API
- [ ] T2.3 `/web2/kpi/index.html` skeleton + dashboard
- [ ] T2.4 SSE subscribe `web2:kpi:<actorId>` → live update count khi nhân viên thao tác
- [ ] T2.5 Test: case B walkthrough — KPI = 10,000đ cho Lan

### Sprint 3 — Backlog Flag + Review (1 day)

- [ ] T3.1 Toggle radio "Native" / "Backlog Live" trong native-orders picker UI
- [ ] T3.2 Badge "Backlog Live" màu cam trong expand row + edit modal
- [ ] T3.3 Detection rule: native add ≤30min after livestream end + customer có live cart → row có `needs_review=true`
- [ ] T3.4 Manager flag-for-review queue

### Sprint 4 — Audit Viewer + Backfill (1 day)

- [ ] T4.1 `/web2/kpi/audit.html` ledger viewer
- [ ] T4.2 Backfill script: parse `web2_cart_history` cũ → seed `web2_kpi_events` retroactively
- [ ] T4.3 CSV export cho payroll
- [ ] T4.4 Docs: dev-log + user guide cho manager

---

## 9. Open questions (cần user confirm trước Sprint 0)

| #   | Question                                                      | Default proposal                                                                                                                 |
| --- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Business day boundary là gì?                                  | 00:00 Asia/Bangkok (VN timezone)                                                                                                 |
| Q2  | KPI tính trên `draft` đơn hay chỉ khi confirmed (PBH)?        | Khi `add` event xảy ra (kể cả draft) — nếu sau đó cancel thì compensating event neutralize                                       |
| Q3  | Khi đơn bị cancel sau khi PBH, KPI có clawback không?         | Lookback = cuối ngày. Cancel trước 23:59 cùng ngày → emit `remove` event tự động → KPI giảm. Cancel ngày sau → giữ KPI (đã chốt) |
| Q4  | Khi merge 2 đơn, attribution của products giữ nguyên không?   | Yes, source + addedBy preserve per-item (đã pattern saveEdit)                                                                    |
| Q5  | Rate 5000đ có khác theo SP/role không (vd manager 10000đ/SP)? | Currently uniform. Mở config table `web2_kpi_rates(role, rate_per_sp)` cho future                                                |
| Q6  | "Backlog Live" có cần manager approve không?                  | No, self-declare honest mistake. Audit log đủ để review                                                                          |
| Q7  | Khi nhân viên A xóa SP của nhân viên B add → KPI ai?          | KPI của B giảm (remove event mang actor=A nhưng tuple gốc add by B) → cần thêm column `affects_actor_user_id` để track           |

---

## 10. Risks & mitigations

| Risk                                                              | Probability | Mitigation                                                                          |
| ----------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------- |
| Ledger insert fail (DB down) nhưng products đã update             | Medium      | Best-effort async emit; reconcile job mỗi đêm so sánh products timestamps vs ledger |
| Manager sửa products trực tiếp qua SQL không qua API              | Low         | Add trigger `web2_kpi_events_audit_trigger` ON `native_orders` UPDATE for safety    |
| Spoofed `X-User-Token` (employee impersonation)                   | Low         | Token verify against `web2_user_sessions.expires_at`, log IP per session            |
| Idempotency key collision (sha1 birthday)                         | Negligible  | sha1 collision space 2^160 — irrelevant at our scale                                |
| Time-of-day misattribution (event lúc 23:59:59 ghi nhầm ngày sau) | Medium      | Server-side compute business_day at INSERT time, not from client clock              |

---

## 11. Success criteria

- [ ] Bất kỳ event nào trên products của native_orders đều có 1 row tương ứng trong `web2_kpi_events` trong ≤5 giây
- [ ] Replay ledger → dashboard match exact (deterministic projection)
- [ ] Nhân viên thử case A 10 lần → KPI đúng = 1 (last add) × 5000đ
- [ ] Case B: livestream 1 + native +2 → KPI = 10,000đ
- [ ] Case C: backlog flag → KPI = 0 dù thêm bao nhiêu SP
- [ ] Manager dispute resolution: từ Ledger Audit Viewer trace được mọi event của mọi đơn trong ≤3 click

---

## 12. References

- DP6/Marketing-Attribution-Models (Python, MIT) — first-touch / last-touch / Markov implementation
- eeghor/mta (Python) — multi-touch attribution toolkit
- Everstage clawback guide — commission revoke patterns
- Commission Factory dedup — affiliate sale dedup
- CockroachLabs idempotency in event-driven systems
- Blnk Ledger — fintech double-entry ledger architecture
- `render.com/routes/v2/audit-log.js` (in-repo) — pattern cho union audit views
- `web2/shared/web2-user-info.js` (in-repo) — user identity helper đã có sẵn
