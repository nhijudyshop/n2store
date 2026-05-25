# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260525-120021-dbb7c2d`
**Session file**: [`./20260525-120021-dbb7c2d.md`](../20260525-120021-dbb7c2d.md)
**Commit**: `dbb7c2d` — feat(tpos-pancake): hover zoom full ảnh (không crop) + Auto chip luôn ON
**Last updated**: 2026-05-25 12:00:21 +07
**Summary**: feat(tpos-pancake): hover zoom full ảnh (không crop) + Auto chip luôn ON

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/js/tpos/tpos-livestream-snap.js`

## Last 5 commits touching `tpos-pancake/`

- `dbb7c2d46` feat(tpos-pancake): hover zoom full ảnh (không crop) + Auto chip luôn ON _(2026-05-25)_
- `9e3355fbb` feat(tpos-pancake): ẩn chip "Bắt đầu chụp live" trên index.html _(2026-05-25)_
- `bb754ddf8` feat(tpos-pancake): nút "Mở thẻ KH" + fallback enrich theo phone _(2026-05-25)_
- `7e651e003` fix(snap): fallback redirect popup thẳng tới FB plugin — autoplay work _(2026-05-25)_
- `53df9c235` fix(snap): fallback iframe direct khi FB SDK xfbml.ready stuck _(2026-05-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260525-120021-dbb7c2d` cho Claude walk chain theo CLAUDE.md protocol.
