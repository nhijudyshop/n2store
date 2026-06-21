# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-173150-81eb667`
**Session file**: [`./20260621-173150-81eb667.md`](../20260621-173150-81eb667.md)
**Commit**: `81eb667` — auto: session update
**Last updated**: 2026-06-21 17:31:50 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/shared/web2-order-tag-detail.js`
- `web2/video-maker/js/video-tts.js`

## Last 5 commits touching `web2/`

- `81eb667b9` auto: session update _(2026-06-21)_
- `da74a07c5` feat(web2): bấm pill TAG đơn → popup lý do chi tiết (SP chờ hàng / âm mã + ai đang giữ) _(2026-06-21)_
- `bb78c4806` fix(web2): 1 trigger = 1 tag — chặn tạo thẻ trùng trigger + dedupe engine + ẩn trigger đã dùng trong picker _(2026-06-21)_
- `31ae0603e` feat(video-maker): thêm thẻ cảm xúc VieNeu (cười/thở dài/hắng giọng) _(2026-06-21)_
- `6aed6fc0b` auto: session update _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-173150-81eb667` cho Claude walk chain theo CLAUDE.md protocol.
