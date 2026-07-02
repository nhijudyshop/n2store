# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260702-094210-2e643ba`
**Session file**: [`./20260702-094210-2e643ba.md`](../20260702-094210-2e643ba.md)
**Commit**: `2e643ba` — feat(cham-cong): bảng lương bấm ô mở modal kiểu TPOS (bỏ nút Sửa) + chấm đủ = trọn lương ngày
**Last updated**: 2026-07-02 09:42:10 +07
**Summary**: feat(cham-cong): bảng lương bấm ô mở modal kiểu TPOS (bỏ nút Sửa) + chấm đủ = trọn lương ngày

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/balance-history/js/web2-bh-core.js`
- `web2/balance-history/js/web2-link-customer-modal.js`
- `web2/balance-history/js/web2-manual-deposit.js`
- `web2/balance-history/js/web2-pm-core.js`
- `web2/cham-cong/css/cham-cong.css`
- `web2/cham-cong/index.html`
- `web2/cham-cong/js/cham-cong-payroll.js`
- `web2/cham-cong/js/cham-cong-salary.js`
- `web2/customer-wallet/js/web2-customer-wallet-api.js`
- `web2/customers/js/customers-api.js`
- `web2/dashboard/index.html`
- `web2/fastsaleorder-invoice/print.html`
- `web2/notifications/index.html`
- `web2/photo-studio/photo-studio-state.js`
- `web2/report-delivery/index.html`
- `web2/report-revenue/index.html`
- `web2/system/data/web2-dedup-audit.json`
- `web2/system/data/web2-modules.json`
- `web2/users-permissions/index.html`

## Last 5 commits touching `web2/`

- `2e643bab5` feat(cham-cong): bảng lương bấm ô mở modal kiểu TPOS (bỏ nút Sửa) + chấm đủ = trọn lương ngày _(2026-07-02)_
- `573db79f5` refactor(web2): worker-base dedup hoàn tất — 18 file config-first, 0 primary-literal còn _(2026-07-02)_
- `441e548c2` refactor(web2-shared): dedup worker-base — config-first 5 file primary-literal (re-scope group) _(2026-07-02)_
- `4a9b59257` refactor(web2-shared): dedup fetch-json → delegate Web2ApiFetch.json (6 wrapper) _(2026-07-02)_
- `440ad6852` refactor(web2-shared): dedup pagination → Web2Pagination (3 file canonical migrated) _(2026-07-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260702-094210-2e643ba` cho Claude walk chain theo CLAUDE.md protocol.
