# Latest Snapshot — `shared/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-111550-4b253d0`
**Session file**: [`./20260616-111550-4b253d0.md`](../20260616-111550-4b253d0.md)
**Commit**: `4b253d0` — docs(realtime): n2store-realtime HARD-DELETE hoàn tất (service 404 + folder + refs). −$7/mo, data chatDb giữ nguyên.
**Last updated**: 2026-06-16 11:15:50 +07
**Summary**: docs(realtime): n2store-realtime HARD-DELETE hoàn tất (service 404 + folder + refs). −$7/mo, data chatDb giữ n...

## Files changed in this commit (`shared/`)

- `shared/universal/api-endpoints.js`

## Last 5 commits touching `shared/`

- `b64200cc9` chore(realtime): HARD-DELETE n2store-realtime — xóa service Render + folder + refs (api-endpoints/service-costs/nginx). −$7/mo _(2026-06-16)_
- `274721baf` chore: gỡ HẲN autofb.pro khỏi toàn project (shop không xài nữa) _(2026-06-16)_
- `15cd722a6` fix(web2/live-chat): SĐT bị fb*id ghi đè (normPhone slice) + health-monitor 404 spam + dọn TPOS leftover *(2026-06-15)\_
- `08ec99809` auto: session update _(2026-06-14)_
- `63446c668` auto: session update _(2026-06-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-111550-4b253d0` cho Claude walk chain theo CLAUDE.md protocol.
