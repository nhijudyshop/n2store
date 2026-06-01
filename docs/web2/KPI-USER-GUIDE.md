# KPI Attribution — User Guide

> **Audience:** Admin (manager) + Nhân viên team chốt đơn
> **Pages liên quan:** `/web2/kpi/`, `/web2/users/`, `/native-orders/`, `/web2/fastsaleorder-invoice/`
> **Plan đầy đủ:** [docs/plans/kpi-attribution-system.md](../plans/kpi-attribution-system.md)

---

## 1. Quick start (Admin)

### Bước 1 — Vào trang Phân công

Sidebar → **Tính năng mới** → **KPI Nhân viên** → button **"Phân công khoảng STT"**.
Hoặc trực tiếp: `/web2/kpi/assignments.html`.

### Bước 2 — Chọn chiến dịch

Dropdown trên cùng — list các livestream campaign đã có đơn. Số đơn hiển thị trong dropdown.

### Bước 3 — Phân khoảng STT cho nhân viên

Bấm **"+ Thêm nhân viên vào khoảng"** → row mới:

- **Nhân viên** — dropdown chọn từ `web2_users.list`
- **STT từ** + **STT đến** — số đơn trong campaign (vd 1-100 cho A, 101-200 cho B)
- **Số đơn** — auto count

Validation: backend reject overlap khác user (cùng NV vẫn được multi-range).

### Bước 4 — Save

Bấm **"Lưu phân công"**. History entry tự ghi vào `campaign_employee_ranges_history`.

Sau khi save, **scope cache** invalidate ngay — NV reload trang sẽ thấy filter mới.

---

## 2. Quick start (Nhân viên)

### Login

Login bình thường qua `/web2/auth/login.html`. Token Web2Auth sẽ được tự inject vào header `x-web2-token` cho mọi request.

### Native-orders page

Nếu được admin gán khoảng STT → trên đầu trang hiện **banner xanh**:

> 🔍 **Bạn chỉ thấy đơn trong khoảng được phân công:** _Live 1/6_ STT 1-100

Bảng đơn chỉ list orders nằm trong khoảng. Đơn khác bị ẩn (server-side filter).

Nếu không có assignment → thấy toàn bộ đơn của campaign (giống admin).

### Thêm SP — KPI cộng tự động

- Drag SP từ TPOS-Pancake → `source='livestream'` → **không tính KPI**
- Click "Thêm SP" trong modal native-orders → `source='native'` → **tính KPI** (5,000đ × qty cho beneficiary)

**Beneficiary KPI = nhân viên được assigned khoảng STT chứa đơn**, KHÔNG phải người bấm. Vd: Hoa thêm SP cho đơn STT 50 (trong khoảng A.1-100) → KPI vào A.

### Tag "Backlog Live" — SP missed livestream

Trong modal "Thêm SP", có toggle:

- ◉ **Native** (default) — tính KPI
- ◯ **Backlog Live** — SP đáng lẽ đã add khi livestream, NV add sau qua picker → KPI không count, admin review queue

---

## 3. KPI Dashboard

`/web2/kpi/index.html` — 3 tabs:

### Tab "Dự báo" (Forecast)

- Leaderboard theo `beneficiary × campaign`
- Count khi SP `source='native'` được add
- Cancel đơn → forecast giữ nguyên (không revoke)

### Tab "Thực tế" (Actual)

- Count khi đơn → confirmed (PBH created)
- Cancel PBH → revoke (`actual_qty` giảm)
- Cột "SP bị revoke" hiển thị cancel info

### Tab "Audit log"

- 100 events gần nhất
- Cột: time / event_type / actor / beneficiary / order STT / sku / Δqty / source
- Button **Export CSV** → download

**Realtime**: SSE subscribe `web2:kpi:<userId>` → dashboard auto refresh khi có event mới (debounce 600ms).

---

## 4. Backlog Review (Admin only)

`/web2/kpi/backlog-review.html` — queue mọi `forecast_add source='backlog'` chưa được review.

### Workflow

1. NV add SP via picker chọn "Backlog Live" → event ghi ledger với `source='backlog'`
2. Admin vào queue → click **"Review"** trên row → modal hiện full details
3. Admin có 2 lựa chọn:
    - **"Đồng ý backlog"** — OK, đúng là missed livestream → KPI không count
    - **"Reclassify → Native"** — NV claim sai → emit `forecast_add source='native'` → KPI cộng cho beneficiary

4. Event được mark reviewed qua compensating `reclassify_backlog` event → biến mất khỏi queue.

### Khi nào dùng?

- Audit weekly hoặc end-of-campaign
- Nếu nghi ngờ NV abuse backlog flag → check số lượng + so sánh với FB comments

---

## 5. Cách KPI được tính (formula)

### Forecast

```
forecast_qty(beneficiary, campaign) = GREATEST(0, SUM(qty_delta WHERE source='native'))
forecast_amount = forecast_qty × 5,000đ
```

### Actual

```
actual_qty(beneficiary, campaign) = GREATEST(0, SUM(
    qty_delta WHERE source='native' AND event_type IN ('actual_confirmed', 'actual_revoked')
))
actual_amount = actual_qty × 5,000đ
revoked_qty = SUM(-qty_delta WHERE event_type='actual_revoked')  -- info only
```

### Idempotency key

```
sha1(actor|customer|sku|campaign|event_type|client_event_id)
```

- Network retry → same key → INSERT ON CONFLICT DO NOTHING (no double count)
- User delete-readd → different UUID per action → all events insert
- PBH cancel/reissue → deterministic key `pbh_<number>_<sku>` → tự nhiên dedup

---

## 6. Edge cases

### Case: NV xóa SP của NV khác

KPI vẫn cộng cho **beneficiary của khoảng STT**, không phụ thuộc actor. Audit log giữ actor info để trace.

### Case: Cancel đơn

- Native cancel → emit `actual_revoked` events cho từng SP đã confirmed → actual giảm
- Forecast KHÔNG bị revoke → giữ nguyên (dự báo công sức ban đầu)

### Case: Reissue PBH (split=true)

Deterministic `client_event_id = pbh_<new-number>_<sku>` → events mới insert OK, không conflict.

### Case: Đơn không có campaign

Mặc định campaign_id = `'NO_CAMPAIGN'` synthetic. Admin có thể assign khoảng STT cho nhóm này như campaign thường.

---

## 7. Troubleshooting

### "Không thấy đơn"

- Check banner xanh hiện không? Nếu có → đơn nằm ngoài khoảng phân công
- Hỏi admin update assignment cho khoảng đơn mới

### "KPI không tăng sau khi add SP"

- Check `source` field — nếu `livestream` hoặc `backlog` → đúng spec không tính
- Check assignments có cover STT đơn không → nếu không → fallback actor

### "KPI giảm đột ngột"

- Check tab "Thực tế" → cột `revoked_qty` → đơn nào bị cancel
- Audit log filter `event_type=actual_revoked` để trace

### Manager dispute resolution

1. Mở Audit log tab → filter campaign + beneficiary
2. Export CSV → so sánh với raw orders
3. Backend recalc: `POST /api/v2/kpi/recalc?campaign_id=X` (admin only)

---

## 8. Permissions

| Page                            | Role                                    |
| ------------------------------- | --------------------------------------- |
| `/native-orders/`               | All (scope auto-applied per assignment) |
| `/web2/fastsaleorder-invoice/`  | All (scope auto-applied)                |
| `/web2/kpi/index.html`          | All (xem KPI mình)                      |
| `/web2/kpi/assignments.html`    | Admin                                   |
| `/web2/kpi/backlog-review.html` | Admin                                   |

---

## 9. Sprint history

| Sprint | Date       | Deliverable                                                                 |
| ------ | ---------- | --------------------------------------------------------------------------- |
| 0      | 2026-05-31 | Schema migrations + audit gaps (`campaign_stt`, ledger tables, addedBy fix) |
| 1      | 2026-05-31 | Wire ledger write path (forecast + actual + revoked) — 4 chokepoints        |
| 2      | 2026-05-31 | Admin assignment UI + KPI dashboard (3 tabs)                                |
| 3      | 2026-05-31 | Visibility filter (scope middleware + frontend banner)                      |
| 4      | 2026-06-01 | Backlog review queue + recalc + SSE realtime + CSV export                   |
| 5      | 2026-06-01 | fastsaleorder-invoice integration + user docs                               |

---

## 10. References

- Plan: [docs/plans/kpi-attribution-system.md](../plans/kpi-attribution-system.md)
- API: `/api/v2/kpi/*` (events, scope, assignments, forecast, actual, backlog, recalc)
- Schema: `web2_kpi_events`, `web2_kpi_forecast`, `web2_kpi_actual`, `campaign_employee_ranges` (reused)
- Idempotency pattern: CockroachLabs event-driven, Blnk Ledger
- Attribution: industry standard First-Touch with beneficiary projection
