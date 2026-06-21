# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-022249-8d6abe3`
**Session file**: [`./20260622-022249-8d6abe3.md`](../20260622-022249-8d6abe3.md)
**Commit**: `8d6abe3` — fix(web2) SSE R4 (live-test): server-side wildcard delivery in \_localNotify — exact web2:wallet:<phone> now reaches web2:wallet:\* (6 ví pages)
**Last updated**: 2026-06-22 02:22:49 +07
**Summary**: fix(web2) SSE R4 (live-test): server-side wildcard delivery in \_localNotify — exact web2:wallet:<phone> now reaches...

## Files changed in this commit (`so-order/`)

- `so-order/index.html`

## Last 5 commits touching `so-order/`

- `8d6abe393` fix(web2) SSE R4 (live-test): server-side wildcard delivery in _localNotify — exact web2:wallet:<phone> now reaches web2:wallet:\* (6 ví pages) _(2026-06-22)\_
- `b07144f98` fix(web2) SSE R2: live-snap resync no-op (MED) + resync coalesce + poolDropped stat + load-bearing comment _(2026-06-22)_
- `0ce6293e3` fix(web2) SSE re-audit (39-agent): KEEP SSE + 8 fix (oversized fan-out, LISTEN-reconnect resync, wallet :\* prefix-match, heartbeat reopen-storm, pgNotify fallback+cap) _(2026-06-22)_
- `bde0e54ae` fix(web2-shell): GLOBAL ≤900px main full-width trên mọi trang (sửa flex-direction no-op) _(2026-06-21)_
- `db41242b1` fix(web2) audit-r7: 11 bug across cron/native-orders/so-order/auth/sepay/migrations _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-022249-8d6abe3` cho Claude walk chain theo CLAUDE.md protocol.
