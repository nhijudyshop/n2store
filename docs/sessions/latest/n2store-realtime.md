# Latest Snapshot — `n2store-realtime/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-111550-4b253d0`
**Session file**: [`./20260616-111550-4b253d0.md`](../20260616-111550-4b253d0.md)
**Commit**: `4b253d0` — docs(realtime): n2store-realtime HARD-DELETE hoàn tất (service 404 + folder + refs). −$7/mo, data chatDb giữ nguyên.
**Last updated**: 2026-06-16 11:15:50 +07
**Summary**: docs(realtime): n2store-realtime HARD-DELETE hoàn tất (service 404 + folder + refs). −$7/mo, data chatDb giữ n...

## Files changed in this commit (`n2store-realtime/`)

- `n2store-realtime/.env.example`
- `n2store-realtime/.gitignore`
- `n2store-realtime/README.md`
- `n2store-realtime/package.json`
- `n2store-realtime/server.js`
- `n2store-realtime/utils/alert.js`

## Last 5 commits touching `n2store-realtime/`

- `b64200cc9` chore(realtime): HARD-DELETE n2store-realtime — xóa service Render + folder + refs (api-endpoints/service-costs/nginx). −$7/mo _(2026-06-16)_
- `163191b3d` fix(realtime): dùng token pool đúng cho page*access_token livestream + negative-cache; tắt log health-probe; cập nhật RENDER_SERVERS_GUIDE *(2026-06-14)\_
- `6e100ed17` auto: session update _(2026-06-14)_
- `93a88bf75` auto: session update _(2026-05-15)_
- `28303f652` fix(realtime): drop page-dedup in pool, broker dedups events instead; bypass worker proxy for start-multi _(2026-05-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-111550-4b253d0` cho Claude walk chain theo CLAUDE.md protocol.
