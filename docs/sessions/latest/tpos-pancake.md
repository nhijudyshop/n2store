# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260525-115342-85bd8c6`
**Session file**: [`./20260525-115342-85bd8c6.md`](../20260525-115342-85bd8c6.md)
**Commit**: `85bd8c6` — auto: session update
**Last updated**: 2026-05-25 11:53:42 +07
**Summary**: auto: session update

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`
- `tpos-pancake/js/tpos/tpos-comment-list.js`
- `tpos-pancake/js/tpos/tpos-livestream-snap.js`
- `tpos-pancake/js/tpos/tpos-partner-fallback.js`

## Last 5 commits touching `tpos-pancake/`

- `9e3355fbb` feat(tpos-pancake): ẩn chip "Bắt đầu chụp live" trên index.html _(2026-05-25)_
- `bb754ddf8` feat(tpos-pancake): nút "Mở thẻ KH" + fallback enrich theo phone _(2026-05-25)_
- `7e651e003` fix(snap): fallback redirect popup thẳng tới FB plugin — autoplay work _(2026-05-25)_
- `53df9c235` fix(snap): fallback iframe direct khi FB SDK xfbml.ready stuck _(2026-05-25)_
- `621caabb8` fix(snap): fit FB Live player popup cho video portrait 9:16 _(2026-05-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260525-115342-85bd8c6` cho Claude walk chain theo CLAUDE.md protocol.
