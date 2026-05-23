# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260523-121047-4e2163d`
**Session file**: [`./20260523-121047-4e2163d.md`](../20260523-121047-4e2163d.md)
**Commit**: `4e2163d` — auto: session update
**Last updated**: 2026-05-23 12:10:47 +07
**Summary**: auto: session update

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`
- `tpos-pancake/js/tpos/tpos-livestream-snap.js`

## Last 5 commits touching `tpos-pancake/`

- `4e045b7bb` fix(snap): parse channelCreatedTime ISO + all-pages top-2 campaigns resolve _(2026-05-23)_
- `e809f3fed` feat(snap): auto-mode default ON + offline path fallback (không cần FB tab share) _(2026-05-23)_
- `dcae33867` feat(snap): Feature 2 offline batch + 30d auto-cleanup _(2026-05-23)_
- `0858bac37` feat(snap): auto-mode — KH mới comment tự snap (Feature 1) _(2026-05-23)_
- `d39d7c7a9` feat(snap): offset chính xác via TPOS /facebook/livevideo channelCreatedTime _(2026-05-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260523-121047-4e2163d` cho Claude walk chain theo CLAUDE.md protocol.
