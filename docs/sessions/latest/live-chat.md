# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260618-190051-6a90f3b`
**Session file**: [`./20260618-190051-6a90f3b.md`](../20260618-190051-6a90f3b.md)
**Commit**: `6a90f3b` — fix(web2-chat): guard Enter-to-send against Vietnamese IME composition (gửi nhầm 2 tin)
**Last updated**: 2026-06-18 19:00:51 +07
**Summary**: fix(web2-chat): guard Enter-to-send against Vietnamese IME composition (gửi nhầm 2 tin)

## Files changed in this commit (`live-chat/`)

- `live-chat/js/live/live-comment-list.js`

## Last 5 commits touching `live-chat/`

- `6a90f3b83` fix(web2-chat): guard Enter-to-send against Vietnamese IME composition (gửi nhầm 2 tin) _(2026-06-18)_
- `d68cf952d` feat(web2): Popup dùng chung — alert/confirm/popup nhiều loại + hiệu ứng custom + migrate toàn cục _(2026-06-17)_
- `e39b3b51f` feat(web2/live-chat): POST /snapshots/purge (scope today _(all) + client clear-cache on purge|2026-06-16)_
- `f3883fa77` auto: session update _(2026-06-16)_
- `eabd0af09` fix(web2/live-chat): comments-mobile hiện SĐT cùng lúc với địa chỉ (fallback kho như desktop) _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260618-190051-6a90f3b` cho Claude walk chain theo CLAUDE.md protocol.
