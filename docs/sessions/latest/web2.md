# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-142333-ad9ef3f`
**Session file**: [`./20260605-142333-ad9ef3f.md`](../20260605-142333-ad9ef3f.md)
**Commit**: `ad9ef3f` — auto: session update
**Last updated**: 2026-06-05 14:23:33 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/shared/tpos-sidebar.js`

## Last 5 commits touching `web2/`

- `ad9ef3fe5` auto: session update _(2026-06-05)_
- `397deda52` feat(web2 bill): don ban tai shop ghi tieu de 'PBH SHOP' (thay 'Phieu Ban Hang (SHOP)') + sub 'BAN TAI SHOP' _(2026-06-05)_
- `91e84e986` auto: session update _(2026-06-05)_
- `e48a7e7cf` fix(web2-msg-send): mount /api/web2/msg-send (CF worker forward /api/web2/\*) thay /api/web2-msg-send (chua trong allowlist -> roi ve TPOS 404) _(2026-06-05)_
- `a6f0e3e7d` feat(native-orders): gửi tin nhắn template qua JOB server-side đa-account Pancake + extension fallback (refresh-safe, SSE progress) _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-142333-ad9ef3f` cho Claude walk chain theo CLAUDE.md protocol.
