# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260626-181830-dea1909`
**Session file**: [`./20260626-181830-dea1909.md`](../20260626-181830-dea1909.md)
**Commit**: `dea1909` — docs: flow audit R2 — 13/13 FIXED (8 HIGH/MEDIUM + 5 LOW + SAVEPOINT regression fix)
**Last updated**: 2026-06-26 18:18:30 +07
**Summary**: Hoàn tất 13/13 bug audit R2 web2 (8 HIGH/MEDIUM + 5 LOW): ví thu hộ over-mint/race, KPI revoke gộp, dashboard net revenue, delivery sync (SAVEPOINT), from-pbh dedupe, Sửa COD, split guard, processWithdraw 23505, pollDeposits lookback, matchSupplier ambiguity — verify 39 assertions integration test Postgres

## Files changed in this commit (`render.com/`)

- `render.com/routes/fast-sale-orders.js`
- `render.com/routes/web2-returns.js`
- `render.com/services/web2-wallet-service.js`

## Last 5 commits touching `render.com/`

- `246ad6f40` fix(web2 flow R2 LOW): 5 LOW findings + SAVEPOINT chống poison tx khi sync delivery _(2026-06-26)_
- `28e6cfab8` fix(web2 flow R2b): create-time ví race lock (#1) + merged-PBH KPI revoke (#2) + dashboard net revenue (#3) + split merged guard (#4) _(2026-06-26)_
- `a5a0dfe42` fix(web2 flow R2 MEDIUM): delivery sync on PBH cancel + from-pbh dedupe + Sửa COD 2nd-time reject _(2026-06-26)_
- `e3fe90c2c` fix(fast-sale-orders): ví thu hộ PBH áp-lại không bị dedupe nuốt → hết over-mint (audit R2 HIGH) _(2026-06-26)_
- `198e5305d` fix(purchase-refund): cap trả NCC theo SL nhận + cost + ghi returned*row_ids (#3/#4/#5) *(2026-06-26)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260626-181830-dea1909` cho Claude walk chain theo CLAUDE.md protocol.
