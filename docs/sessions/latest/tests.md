# Latest Snapshot — `tests/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260606-185212-4c06d93`
**Session file**: [`./20260606-185212-4c06d93.md`](../20260606-185212-4c06d93.md)
**Commit**: `4c06d93` — merge origin/main: barcode crisp fix + CK ví; KPI NET + edit-modal (dev-log both)
**Last updated**: 2026-06-06 18:52:12 +07
**Summary**: merge origin/main: barcode crisp fix + CK ví; KPI NET + edit-modal (dev-log both)

## Files changed in this commit (`tests/`)

- `tests/unit/kpi-reconciled-net.test.js`

## Last 5 commits touching `tests/`

- `4c06d93ae` merge origin/main: barcode crisp fix + CK ví; KPI NET + edit-modal (dev-log both) _(2026-06-06)_
- `b99877c8f` fix(orders/KPI): tính NET theo ĐƠN THẬT TPOS (final − BASE), hết lệch do audit log drift _(2026-06-06)_
- `887b5c528` fix(kpi): tính KPI theo người thực sự upsell (per-user audit-based) _(2026-04-20)_
- `ea059fd13` feat(docs): add #Note AI-instruction header to all HTML+JS files + module overview in dev-log _(2026-04-04)_
- `8d28a1d9d` Revert "feat: add Live Order Book module - sổ đặt hàng NCC theo đợt live" _(2026-03-12)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260606-185212-4c06d93` cho Claude walk chain theo CLAUDE.md protocol.
