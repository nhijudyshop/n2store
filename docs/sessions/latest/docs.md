# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-143446-f2a0f40`
**Session file**: [`./20260622-143446-f2a0f40.md`](../20260622-143446-f2a0f40.md)
**Commit**: `f2a0f40` — feat(web2-zalo) Phase1: login watchdog — auto-reconnect + keepalive + proactive re-login (không bị văng nick)
**Last updated**: 2026-06-22 14:34:46 +07
**Summary**: Zalo rebuild Phase1: login watchdog auto-reconnect+keepalive+proactive relogin (không bị văng nick)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`
- `docs/web2/ZALO-REBUILD-PLAN.md`

## Last 5 commits touching `docs/`

- `f2a0f4031` feat(web2-zalo) Phase1: login watchdog — auto-reconnect + keepalive + proactive re-login (không bị văng nick) _(2026-06-22)_
- `1f4f04615` chore(session): RESUME:20260622-142852-03fa294 _(2026-06-22)_
- `f2243be4b` chore(session): RESUME:20260622-134153-6cd7e74 _(2026-06-22)_
- `6cd7e74e2` docs(session): fill RESUME 20260622-134026-774110b (live-chat 3-col) _(2026-06-22)_
- `4647664f3` chore(session): RESUME:20260622-134026-774110b _(2026-06-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-143446-f2a0f40` cho Claude walk chain theo CLAUDE.md protocol.
