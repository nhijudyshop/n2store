# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260626-180442-8bdee06`
**Session file**: [`./20260626-180442-8bdee06.md`](../20260626-180442-8bdee06.md)
**Commit**: `8bdee06` — docs: flow audit round 2 (13 findings, 8 HIGH/MEDIUM fixed + integration-tested, 5 LOW documented)
**Last updated**: 2026-06-26 18:04:42 +07
**Summary**: Audit vòng 2 web2 (7 luồng) → fix 8 bug HIGH/MEDIUM money/stock (ví thu hộ over-mint, create-time race, KPI revoke gộp, dashboard net revenue, delivery sync, from-pbh dedupe, Sửa COD, split guard) verify integration test Postgres thật

## Files changed in this commit (`render.com/`)

- `render.com/routes/delivery-invoices.js`
- `render.com/routes/fast-sale-orders.js`
- `render.com/routes/v2/dashboard-kpi.js`
- `render.com/routes/web2-returns.js`

## Last 5 commits touching `render.com/`

- `28e6cfab8` fix(web2 flow R2b): create-time ví race lock (#1) + merged-PBH KPI revoke (#2) + dashboard net revenue (#3) + split merged guard (#4) _(2026-06-26)_
- `a5a0dfe42` fix(web2 flow R2 MEDIUM): delivery sync on PBH cancel + from-pbh dedupe + Sửa COD 2nd-time reject _(2026-06-26)_
- `e3fe90c2c` fix(fast-sale-orders): ví thu hộ PBH áp-lại không bị dedupe nuốt → hết over-mint (audit R2 HIGH) _(2026-06-26)_
- `198e5305d` fix(purchase-refund): cap trả NCC theo SL nhận + cost + ghi returned*row_ids (#3/#4/#5) *(2026-06-26)\_
- `6b14a5faa` fix(web2-returns): KNH net-restock (#2/#7) + native partial returned*line_qty (#6) *(2026-06-26)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260626-180442-8bdee06` cho Claude walk chain theo CLAUDE.md protocol.
