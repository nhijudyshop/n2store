# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-192358-3d11612`
**Session file**: [`./20260625-192358-3d11612.md`](../20260625-192358-3d11612.md)
**Commit**: `3d11612` — auto: session update
**Last updated**: 2026-06-25 19:23:58 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/customers/index.html`
- `web2/jt-tracking/index.html`
- `web2/live-control/js/live-control.js`
- `web2/live-tv/js/live-tv.js`
- `web2/shared/web2-customer-chat-core.js`
- `web2/shared/web2-customer-chat-modal.js`
- `web2/shared/web2-customer-chat.js`
- `web2/shared/web2-variant-group.js`
- `web2/shared/web2-zalo-api.js`
- `web2/shared/web2-zalo-presence.js`
- `web2/zalo/index.html`
- `web2/zalo/js/web2-zalo-accounts.js`
- `web2/zalo/js/web2-zalo-utils.js`

## Last 5 commits touching `web2/`

- `3d1161297` auto: session update _(2026-06-25)_
- `927c3e8a3` fix(web2/zalo): focus-lease phiên Zalo — hết spam 'Đổi thiết bị' trên chat.zalo.me _(2026-06-25)_
- `a75e147fd` feat(web2/customer-chat): realtime như live-chat — subscribe SSE web2:messages _(2026-06-25)_
- `03107ca6f` fix(web2): SSE audit — KPI employee-ranges publish + assignments/returns PII/zalo debounce _(2026-06-25)_
- `c9495a30a` auto: session update _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-192358-3d11612` cho Claude walk chain theo CLAUDE.md protocol.
