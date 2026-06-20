# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-203226-309caf6`
**Session file**: [`./20260620-203226-309caf6.md`](../20260620-203226-309caf6.md)
**Commit**: `309caf6` — fix(web2/livestream-poller): bỏ double-load notification-system (NOTIFICATION_CONFIG redeclare) + 401 /stats,/poller-pages thiếu x-web2-token
**Last updated**: 2026-06-20 20:32:26 +07
**Summary**: fix livestream-poller 2 bugs + audit necessity

## Files changed in this commit (`web2/`)

- `web2/livestream-poller/index.html`

## Last 5 commits touching `web2/`

- `309caf6e3` fix(web2/livestream-poller): bỏ double-load notification-system (NOTIFICATION*CONFIG redeclare) + 401 /stats,/poller-pages thiếu x-web2-token *(2026-06-20)\_
- `3e3021e45` feat(native-orders): Đơn Inbox 'Gán FB khác' — gán lại Facebook đúng nếu auto-dò nhầm _(2026-06-20)_
- `b16d82b83` auto: session update _(2026-06-20)_
- `784b6d0e7` fix(web2): cache tu nap Web2ProductsApi (shared) -> picker load SP khong can vao Kho SP truoc _(2026-06-20)_
- `3f8e516a5` auto: session update _(2026-06-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-203226-309caf6` cho Claude walk chain theo CLAUDE.md protocol.
