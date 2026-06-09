# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260609-162412-100ef03`
**Session file**: [`./20260609-162412-100ef03.md`](../20260609-162412-100ef03.md)
**Commit**: `100ef03` — fix(native-orders): icon 🖨 → XEM bill (preview) thay vì in; thêm Web2Bill.openPreview
**Last updated**: 2026-06-09 16:24:12 +07
**Summary**: fix(native-orders): icon 🖨 → XEM bill (preview) thay vì in; thêm Web2Bill.openPreview

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `100ef0323` fix(native-orders): icon 🖨 → XEM bill (preview) thay vì in; thêm Web2Bill.openPreview _(2026-06-09)_
- `1b7809e44` chore(session): RESUME:20260609-161026-68aff9e _(2026-06-09)_
- `68aff9eed` feat(harvester): lưu cả mật khẩu Pancake → bật auto-renew (trước chỉ lưu token) _(2026-06-09)_
- `60dcdd2c5` fix(kpi): refetch TPOS snapshot khi lỗi thời — sửa NET đếm thiếu SP (race chốt nhiều SP liên tiếp) _(2026-06-09)_
- `b4763e767` chore(session): RESUME:20260609-155123-e11a5c9 _(2026-06-09)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260609-162412-100ef03` cho Claude walk chain theo CLAUDE.md protocol.
