# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-104357-b27f50b`
**Session file**: [`./20260627-104357-b27f50b.md`](../20260627-104357-b27f50b.md)
**Commit**: `b27f50b` — auto: session update
**Last updated**: 2026-06-27 10:43:57 +07
**Summary**: auto: session update

## Files changed in this commit (`live-chat/`)

- `live-chat/index.html`
- `live-chat/js/live/live-campaign-manager.js`

## Last 5 commits touching `live-chat/`

- `1dd451cc7` fix(live-chat AI tên chiến dịch): maxTokens 40→800 (Gemini thinking cắt tên) + retry provider rỗng _(2026-06-27)_
- `7aa1f2507` feat(live-chat): AI gợi ý tên chiến dịch + giảm lag (firebase head→body) + hardening msgTs _(2026-06-27)_
- `6704382ea` fix(web2): thêm x-web2-token cho 5 web2 WRITE còn thiếu (Part A) _(2026-06-26)_
- `e5d158191` fix(live-chat): live-hidden-commenters _save gửi x-web2-token (hết 401 create/update) _(2026-06-26)\_
- `25b23634c` auto: session update _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-104357-b27f50b` cho Claude walk chain theo CLAUDE.md protocol.
