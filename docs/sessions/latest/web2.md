# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-101015-30b4f6a`
**Session file**: [`./20260628-101015-30b4f6a.md`](../20260628-101015-30b4f6a.md)
**Commit**: `30b4f6a` — fix(ai-hub): icon SVG sạch cho nút đính ảnh/prompt/gửi + chốt ẩn busy (scoped !important)
**Last updated**: 2026-06-28 10:10:15 +07
**Summary**: fix(ai-hub): icon SVG sạch cho nút đính ảnh/prompt/gửi + chốt ẩn busy (scoped !important)

## Files changed in this commit (`web2/`)

- `web2/ai-hub/index.html`
- `web2/shared/web2-gemini-chat.js`

## Last 5 commits touching `web2/`

- `30b4f6a60` fix(ai-hub): icon SVG sạch cho nút đính ảnh/prompt/gửi + chốt ẩn busy (scoped !important) _(2026-06-28)_
- `71b9d98e9` auto: session update _(2026-06-28)_
- `afe959107` fix(ai-hub): busy 'Đang xử lý ảnh' stuck, chip đổi không đóng attach, switchTab fallback _(2026-06-28)_
- `1e1b6abde` feat(web2/overview+shared): logo riêng n2shop Web 2.0 — mark N gradient + wordmark _(2026-06-28)_
- `341144434` fix(ai-hub): preset callback đúng signature — pickImage/pickRole cb(promptString, obj) _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-101015-30b4f6a` cho Claude walk chain theo CLAUDE.md protocol.
