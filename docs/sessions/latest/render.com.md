# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-143446-f2a0f40`
**Session file**: [`./20260622-143446-f2a0f40.md`](../20260622-143446-f2a0f40.md)
**Commit**: `f2a0f40` — feat(web2-zalo) Phase1: login watchdog — auto-reconnect + keepalive + proactive re-login (không bị văng nick)
**Last updated**: 2026-06-22 14:34:46 +07
**Summary**: Zalo rebuild Phase1: login watchdog auto-reconnect+keepalive+proactive relogin (không bị văng nick)

## Files changed in this commit (`render.com/`)

- `render.com/routes/web2-zalo.js`
- `render.com/services/web2-zalo-zca.js`

## Last 5 commits touching `render.com/`

- `f2a0f4031` feat(web2-zalo) Phase1: login watchdog — auto-reconnect + keepalive + proactive re-login (không bị văng nick) _(2026-06-22)_
- `03fa29405` auto: session update _(2026-06-22)_
- `0bad2960d` feat(web2-admin) data-wipe execute: optional dropBackups (_*bak*_) + clearRecords _(2026-06-22)_
- `0bbe8df96` feat(web2-admin) selective data-wipe endpoint + script (audit→execute) _(2026-06-22)_
- `e3c7e1315` fix(web2) native-orders: add mobile shell pack to base.css (hamburger desktop-hide + drawer) _(2026-06-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-143446-f2a0f40` cho Claude walk chain theo CLAUDE.md protocol.
