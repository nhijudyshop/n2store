# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260522-160745-781e50f`
**Session file**: [`./20260522-160745-781e50f.md`](../20260522-160745-781e50f.md)
**Commit**: `781e50f` — feat(tpos-pancake/inv): drop target sang TPOS comments (left column) — phương án C
**Last updated**: 2026-05-22 16:07:45 +07
**Summary**: feat(tpos-pancake/inv): drop target sang TPOS comments (left column) — phương án C

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`
- `tpos-pancake/js/pancake/inventory-panel.js`

## Last 5 commits touching `tpos-pancake/`

- `781e50f86` feat(tpos-pancake/inv): drop target sang TPOS comments (left column) — phương án C _(2026-05-22)_
- `29e200478` fix(tpos-pancake/inv): drag không fire do inner elements bắt mousedown + lọc SL=0 _(2026-05-22)_
- `eba99ec9e` fix(tpos-pancake/inv): popover không bị đóng ngay khi click badge mở (setTimeout outside listener) _(2026-05-22)_
- `d35fdf05c` fix(tpos-pancake/inv): poll DOM cho đến khi conv-list xuất hiện + lazy attach observer _(2026-05-22)_
- `b591fded7` fix(tpos-pancake/inv): bootstrap polling 30s để mark has-order rows khi Pancake conv load async _(2026-05-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260522-160745-781e50f` cho Claude walk chain theo CLAUDE.md protocol.
