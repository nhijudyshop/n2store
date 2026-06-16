# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-105334-07b759a`
**Session file**: [`./20260616-105334-07b759a.md`](../20260616-105334-07b759a.md)
**Commit**: `07b759a` — feat(web2-jt): tìm đơn theo tên KH + SĐT (thêm src_message vào /list search)
**Last updated**: 2026-06-16 10:53:34 +07
**Summary**: feat(web2-jt): tìm đơn theo tên KH + SĐT (thêm src_message vào /list search)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `07b759ab7` feat(web2-jt): tìm đơn theo tên KH + SĐT (thêm src*message vào /list search) *(2026-06-16)\_
- `c256793b4` chore(session): RESUME:20260616-103854-9292343 _(2026-06-16)_
- `9292343e8` feat(web2-zalo): @mention — gõ @ lên danh sách thành viên nhóm để tag _(2026-06-16)_
- `328d5b4d3` chore(session): RESUME:20260616-103544-043bf77 _(2026-06-16)_
- `205b91df4` fix(delivery-report): auto-retry Telegram khi group nâng cấp supergroup (migrate*to_chat_id) *(2026-06-16)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-105334-07b759a` cho Claude walk chain theo CLAUDE.md protocol.
