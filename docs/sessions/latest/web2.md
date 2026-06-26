# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260626-181830-dea1909`
**Session file**: [`./20260626-181830-dea1909.md`](../20260626-181830-dea1909.md)
**Commit**: `dea1909` — docs: flow audit R2 — 13/13 FIXED (8 HIGH/MEDIUM + 5 LOW + SAVEPOINT regression fix)
**Last updated**: 2026-06-26 18:18:30 +07
**Summary**: Hoàn tất 13/13 bug audit R2 web2 (8 HIGH/MEDIUM + 5 LOW): ví thu hộ over-mint/race, KPI revoke gộp, dashboard net revenue, delivery sync (SAVEPOINT), from-pbh dedupe, Sửa COD, split guard, processWithdraw 23505, pollDeposits lookback, matchSupplier ambiguity — verify 39 assertions integration test Postgres

## Files changed in this commit (`web2/`)

- `web2/supplier-wallet/index.html`
- `web2/supplier-wallet/js/supplier-wallet-api.js`
- `web2/supplier-wallet/js/supplier-wallet-storage.js`

## Last 5 commits touching `web2/`

- `246ad6f40` fix(web2 flow R2 LOW): 5 LOW findings + SAVEPOINT chống poison tx khi sync delivery _(2026-06-26)_
- `a4f55ece1` feat(web2/system): modal chi tiết service+bảng DB (clickable) + bật AI widget cho trang _(2026-06-26)_
- `b91dee909` feat(web2/products): tự tạo TÊN SP từ loại + Màu/Size (sửa được) — Kho SP _(2026-06-26)_
- `a7866d391` feat(web2): Báo cáo kho thêm ĐỊA DANH (cha NCC+SP) + fix adversarial review _(2026-06-26)_
- `e64754570` auto: session update _(2026-06-26)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260626-181830-dea1909` cho Claude walk chain theo CLAUDE.md protocol.
