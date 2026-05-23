# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260523-105722-dcae338`
**Session file**: [`./20260523-105722-dcae338.md`](../20260523-105722-dcae338.md)
**Commit**: `dcae338` — feat(snap): Feature 2 offline batch + 30d auto-cleanup
**Last updated**: 2026-05-23 10:57:22 +07
**Summary**: feat(snap): Feature 2 offline batch + 30d auto-cleanup

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`
- `tpos-pancake/js/tpos/tpos-livestream-snap.js`

## Last 5 commits touching `tpos-pancake/`

- `dcae33867` feat(snap): Feature 2 offline batch + 30d auto-cleanup _(2026-05-23)_
- `0858bac37` feat(snap): auto-mode — KH mới comment tự snap (Feature 1) _(2026-05-23)_
- `d39d7c7a9` feat(snap): offset chính xác via TPOS /facebook/livevideo channelCreatedTime _(2026-05-23)_
- `69012efa3` feat(snap): detect & display offset 'giây thứ N của video livestream' _(2026-05-23)_
- `671a4be12` feat(snap): thêm vanity 'NhiJudyStore' cho pageId 270136663390370 _(2026-05-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260523-105722-dcae338` cho Claude walk chain theo CLAUDE.md protocol.
