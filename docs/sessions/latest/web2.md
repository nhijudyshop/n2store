# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-095217-3411444`
**Session file**: [`./20260628-095217-3411444.md`](../20260628-095217-3411444.md)
**Commit**: `3411444` — fix(ai-hub): preset callback đúng signature — pickImage/pickRole cb(promptString, obj)
**Last updated**: 2026-06-28 09:52:17 +07
**Summary**: fix(ai-hub): preset callback đúng signature — pickImage/pickRole cb(promptString, obj)

## Files changed in this commit (`web2/`)

- `web2/ai-hub/index.html`
- `web2/ai-hub/js/ai-hub.js`
- `web2/shared/web2-gemini-chat.js`
- `web2/shared/web2-gemini-client.js`

## Last 5 commits touching `web2/`

- `341144434` fix(ai-hub): preset callback đúng signature — pickImage/pickRole cb(promptString, obj) _(2026-06-28)_
- `7795b2c0c` feat(ai-hub): gộp 4 tab thành 1 'Trợ lý AI' — chat+tạo ảnh+ghép đồ+ghép mặt, chip chế độ _(2026-06-28)_
- `603d011a0` feat(web2/overview): nav gọn — avatar DiceBear + 1 nút → trang đầu user có quyền _(2026-06-28)_
- `b6cec441a` auto: session update _(2026-06-28)_
- `f0ae7dfe0` feat(ai-hub+gemini): đính ảnh chat Gemini, fallback paid fail-fast, PREMIUM ưu tiên xoay tua _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-095217-3411444` cho Claude walk chain theo CLAUDE.md protocol.
