# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260525-091821-ac13b16`
**Session file**: [`./20260525-091821-ac13b16.md`](../20260525-091821-ac13b16.md)
**Commit**: `ac13b16` — fix(snap): bỏ Path 2 captureVisibleTab — silence permission warning spam
**Last updated**: 2026-05-25 09:18:21 +07
**Summary**: fix(snap): bỏ Path 2 captureVisibleTab — silence permission warning spam

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`
- `tpos-pancake/js/tpos/tpos-livestream-snap.js`

## Last 5 commits touching `tpos-pancake/`

- `ac13b163d` fix(snap): bỏ Path 2 captureVisibleTab — silence permission warning spam _(2026-05-25)_
- `425a5828d` feat(snap): FB JS SDK player.seek() API — reliable seek (FB official method) _(2026-05-25)_
- `8de24da08` ui(snap): mở FB plugin player trong popup window 820×520 (không stretch fullscreen) _(2026-05-25)_
- `0db506a4a` ui(tpos): comment time hiển thị HH:MM thay vì CN/T2..T7 _(2026-05-25)_
- `641725674` fix(snap): tách liveActive khỏi failed + log lastErrors để debug _(2026-05-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260525-091821-ac13b16` cho Claude walk chain theo CLAUDE.md protocol.
