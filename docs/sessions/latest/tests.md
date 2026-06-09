# Latest Snapshot — `tests/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260609-161026-68aff9e`
**Session file**: [`./20260609-161026-68aff9e.md`](../20260609-161026-68aff9e.md)
**Commit**: `68aff9e` — feat(harvester): lưu cả mật khẩu Pancake → bật auto-renew (trước chỉ lưu token)
**Last updated**: 2026-06-09 16:10:26 +07
**Summary**: feat(harvester): lưu cả mật khẩu Pancake → bật auto-renew (trước chỉ lưu token)

## Files changed in this commit (`tests/`)

- `tests/unit/kpi-reconciled-net.test.js`

## Last 5 commits touching `tests/`

- `60dcdd2c5` fix(kpi): refetch TPOS snapshot khi lỗi thời — sửa NET đếm thiếu SP (race chốt nhiều SP liên tiếp) _(2026-06-09)_
- `4c06d93ae` merge origin/main: barcode crisp fix + CK ví; KPI NET + edit-modal (dev-log both) _(2026-06-06)_
- `b99877c8f` fix(orders/KPI): tính NET theo ĐƠN THẬT TPOS (final − BASE), hết lệch do audit log drift _(2026-06-06)_
- `887b5c528` fix(kpi): tính KPI theo người thực sự upsell (per-user audit-based) _(2026-04-20)_
- `ea059fd13` feat(docs): add #Note AI-instruction header to all HTML+JS files + module overview in dev-log _(2026-04-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260609-161026-68aff9e` cho Claude walk chain theo CLAUDE.md protocol.
