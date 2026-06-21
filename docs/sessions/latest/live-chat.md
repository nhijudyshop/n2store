# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-014719-0ce6293`
**Session file**: [`./20260622-014719-0ce6293.md`](../20260622-014719-0ce6293.md)
**Commit**: `0ce6293` — fix(web2) SSE re-audit (39-agent): KEEP SSE + 8 fix (oversized fan-out, LISTEN-reconnect resync, wallet :_ prefix-match, heartbeat reopen-storm, pgNotify fallback+cap)
**Last updated**: 2026-06-22 01:47:19 +07
**Summary**: fix(web2) SSE re-audit (39-agent): KEEP SSE + 8 fix (oversized fan-out, LISTEN-reconnect resync, wallet :_ prefix-mat...

## Files changed in this commit (`live-chat/`)

- `live-chat/chat.html`
- `live-chat/comments-mobile.html`
- `live-chat/index.html`

## Last 5 commits touching `live-chat/`

- `0ce6293e3` fix(web2) SSE re-audit (39-agent): KEEP SSE + 8 fix (oversized fan-out, LISTEN-reconnect resync, wallet :\* prefix-match, heartbeat reopen-storm, pgNotify fallback+cap) _(2026-06-22)_
- `80e96e30d` refactor(web2) live-tv Phase6: migrate 2 fork chiến dịch → Web2Campaign (1 nguồn) _(2026-06-21)_
- `bde0e54ae` fix(web2-shell): GLOBAL ≤900px main full-width trên mọi trang (sửa flex-direction no-op) _(2026-06-21)_
- `db41242b1` fix(web2) audit-r7: 11 bug across cron/native-orders/so-order/auth/sepay/migrations _(2026-06-21)_
- `c0cf94762` fix(web2) audit-r6: CRITICAL ví trừ không atomic (returns) + 8 fix (auth/worker/DoS/SSE/popup/history) _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-014719-0ce6293` cho Claude walk chain theo CLAUDE.md protocol.
