# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260525-090453-8de24da`
**Session file**: [`./20260525-090453-8de24da.md`](../20260525-090453-8de24da.md)
**Commit**: `8de24da` — ui(snap): mở FB plugin player trong popup window 820×520 (không stretch fullscreen)
**Last updated**: 2026-05-25 09:04:53 +07
**Summary**: ui(snap): mở FB plugin player trong popup window 820×520 (không stretch fullscreen)

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`
- `tpos-pancake/js/tpos/tpos-livestream-snap.js`

## Last 5 commits touching `tpos-pancake/`

- `8de24da08` ui(snap): mở FB plugin player trong popup window 820×520 (không stretch fullscreen) _(2026-05-25)_
- `0db506a4a` ui(tpos): comment time hiển thị HH:MM thay vì CN/T2..T7 _(2026-05-25)_
- `641725674` fix(snap): tách liveActive khỏi failed + log lastErrors để debug _(2026-05-24)_
- `ed9272651` feat(snap): Force extract — parallel workers + progress UI _(2026-05-24)_
- `50156e2b4` ui(snap): ẩn chip Backfill — auto-snap + Force extract đã cover flow chính _(2026-05-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260525-090453-8de24da` cho Claude walk chain theo CLAUDE.md protocol.
