# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-183528-6cc2749`
**Session file**: [`./20260615-183528-6cc2749.md`](../20260615-183528-6cc2749.md)
**Commit**: `6cc2749` — auto: session update
**Last updated**: 2026-06-15 18:35:28 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/customers/index.html`
- `web2/jt-tracking/index.html`
- `web2/multi-tool/index.html`
- `web2/shared/web2-chat-client.js`
- `web2/shared/web2-zalo-api.js`
- `web2/shared/web2-zalo.js`
- `web2/shared/zalo-chat/chat-view.js`
- `web2/zalo/index.html`

## Last 5 commits touching `web2/`

- `6cc274995` auto: session update _(2026-06-15)_
- `fda649a55` feat(web2-zalo): 'Tải tin cũ hơn' backfill lịch sử nhóm từ Zalo về DB _(2026-06-15)_
- `667ad2684` fix(web2/multi-tool): giãn nhịp tối thiểu 0.5s (min input + clamp run/hint) _(2026-06-15)_
- `6c84cead9` fix(web2/multi-tool): ô Giãn nhịp đổi sang GIÂY (thập phân) — 0.5/0.1s có tác dụng thật _(2026-06-15)_
- `d14d1fecc` feat(web2/multi-tool): tăng comment ĐA NHIỆM theo nhiều account Pancake (1 worker/account) _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-183528-6cc2749` cho Claude walk chain theo CLAUDE.md protocol.
