# Latest Snapshot — `live-chat/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-183819-612882d`
**Session file**: [`./20260627-183819-612882d.md`](../20260627-183819-612882d.md)
**Commit**: `612882d` — fix(live-chat): picker chiến dịch cha hiện đúng bài đã gom cho live cũ
**Last updated**: 2026-06-27 18:38:19 +07
**Summary**: fix live-chat picker chiến dịch cha: live cũ hiện đúng bài đã gom (assignMap từ web2_live_post_assign)

## Files changed in this commit (`live-chat/`)

- `live-chat/index.html`
- `live-chat/js/live/live-campaign-manager.js`

## Last 5 commits touching `live-chat/`

- `612882daf` fix(live-chat): picker chiến dịch cha hiện đúng bài đã gom cho live cũ _(2026-06-27)_
- `6ceb6f4aa` feat(web2): trang chỉ-admin ẩn khỏi menu nhân viên + chặn URL trực tiếp _(2026-06-27)_
- `1dd451cc7` fix(live-chat AI tên chiến dịch): maxTokens 40→800 (Gemini thinking cắt tên) + retry provider rỗng _(2026-06-27)_
- `7aa1f2507` feat(live-chat): AI gợi ý tên chiến dịch + giảm lag (firebase head→body) + hardening msgTs _(2026-06-27)_
- `6704382ea` fix(web2): thêm x-web2-token cho 5 web2 WRITE còn thiếu (Part A) _(2026-06-26)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-183819-612882d` cho Claude walk chain theo CLAUDE.md protocol.
