# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-100358-71b9d98`
**Session file**: [`./20260628-100358-71b9d98.md`](../20260628-100358-71b9d98.md)
**Commit**: `71b9d98` — auto: session update
**Last updated**: 2026-06-28 10:03:58 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/ai-hub/index.html`
- `web2/ai-hub/js/ai-hub.js`
- `web2/overview/index.html`
- `web2/shared/web2-gemini-chat.js`
- `web2/shared/web2-image-paste.js`
- `web2/shared/web2-logo.svg`
- `web2/shared/web2-sidebar.js`

## Last 5 commits touching `web2/`

- `71b9d98e9` auto: session update _(2026-06-28)_
- `afe959107` fix(ai-hub): busy 'Đang xử lý ảnh' stuck, chip đổi không đóng attach, switchTab fallback _(2026-06-28)_
- `1e1b6abde` feat(web2/overview+shared): logo riêng n2shop Web 2.0 — mark N gradient + wordmark _(2026-06-28)_
- `341144434` fix(ai-hub): preset callback đúng signature — pickImage/pickRole cb(promptString, obj) _(2026-06-28)_
- `7795b2c0c` feat(ai-hub): gộp 4 tab thành 1 'Trợ lý AI' — chat+tạo ảnh+ghép đồ+ghép mặt, chip chế độ _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-100358-71b9d98` cho Claude walk chain theo CLAUDE.md protocol.
