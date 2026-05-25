# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260525-095422-7e651e0`
**Session file**: [`./20260525-095422-7e651e0.md`](../20260525-095422-7e651e0.md)
**Commit**: `7e651e0` — fix(snap): fallback redirect popup thẳng tới FB plugin — autoplay work
**Last updated**: 2026-05-25 09:54:22 +07
**Summary**: fix(snap): fallback redirect popup thẳng tới FB plugin — autoplay work

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/fb-video-player.html`

## Last 5 commits touching `tpos-pancake/`

- `7e651e003` fix(snap): fallback redirect popup thẳng tới FB plugin — autoplay work _(2026-05-25)_
- `53df9c235` fix(snap): fallback iframe direct khi FB SDK xfbml.ready stuck _(2026-05-25)_
- `621caabb8` fix(snap): fit FB Live player popup cho video portrait 9:16 _(2026-05-25)_
- `ac13b163d` fix(snap): bỏ Path 2 captureVisibleTab — silence permission warning spam _(2026-05-25)_
- `425a5828d` feat(snap): FB JS SDK player.seek() API — reliable seek (FB official method) _(2026-05-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260525-095422-7e651e0` cho Claude walk chain theo CLAUDE.md protocol.
