# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-111550-4b253d0`
**Session file**: [`./20260616-111550-4b253d0.md`](../20260616-111550-4b253d0.md)
**Commit**: `4b253d0` — docs(realtime): n2store-realtime HARD-DELETE hoàn tất (service 404 + folder + refs). −$7/mo, data chatDb giữ nguyên.
**Last updated**: 2026-06-16 11:15:50 +07
**Summary**: docs(realtime): n2store-realtime HARD-DELETE hoàn tất (service 404 + folder + refs). −$7/mo, data chatDb giữ n...

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/customers/index.html`
- `web2/jt-tracking/index.html`
- `web2/shared/web2-zalo.js`
- `web2/shared/zalo-chat/chat-bubbles.css`
- `web2/shared/zalo-chat/chat-view.js`
- `web2/zalo/index.html`

## Last 5 commits touching `web2/`

- `b64200cc9` chore(realtime): HARD-DELETE n2store-realtime — xóa service Render + folder + refs (api-endpoints/service-costs/nginx). −$7/mo _(2026-06-16)_
- `aaa52661c` auto: session update _(2026-06-16)_
- `07b759ab7` feat(web2-jt): tìm đơn theo tên KH + SĐT (thêm src*message vào /list search) *(2026-06-16)\_
- `79afdb96a` auto: session update _(2026-06-16)_
- `043bf7763` auto: session update _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-111550-4b253d0` cho Claude walk chain theo CLAUDE.md protocol.
