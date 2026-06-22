# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-143446-f2a0f40`
**Session file**: [`./20260622-143446-f2a0f40.md`](../20260622-143446-f2a0f40.md)
**Commit**: `f2a0f40` — feat(web2-zalo) Phase1: login watchdog — auto-reconnect + keepalive + proactive re-login (không bị văng nick)
**Last updated**: 2026-06-22 14:34:46 +07
**Summary**: Zalo rebuild Phase1: login watchdog auto-reconnect+keepalive+proactive relogin (không bị văng nick)

## Files changed in this commit (`web2/`)

- `web2/zalo/css/web2-zalo.css`
- `web2/zalo/js/web2-zalo-accounts.js`
- `web2/zalo/js/web2-zalo-utils.js`

## Last 5 commits touching `web2/`

- `f2a0f4031` feat(web2-zalo) Phase1: login watchdog — auto-reconnect + keepalive + proactive re-login (không bị văng nick) _(2026-06-22)_
- `774110b93` feat(live-chat): layout 3 cột (comment hẹp _( Kho SP to | video+thống kê livestream)|2026-06-22)_
- `aee1cd462` fix(web2) hide ElevenLabs/VieNeu brand from UI → neutral labels _(2026-06-22)_
- `9acdcbbed` fix(web2-video-maker): dock preview as grid column — hết PiP nổi đè card, bố cục cân đối _(2026-06-22)_
- `2a7725294` feat(web2) sidebar: collapsed icon click expands group + un-collapses; dedup Sổ Order _(2026-06-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-143446-f2a0f40` cho Claude walk chain theo CLAUDE.md protocol.
