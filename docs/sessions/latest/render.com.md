# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-150247-e47b0b8`
**Session file**: [`./20260623-150247-e47b0b8.md`](../20260623-150247-e47b0b8.md)
**Commit**: `e47b0b8` — feat(web2-ai): env prefix WEB2* (phân biệt) + ưu tiên Gemini free trước + Cloudflare xoay nhiều account
**Last updated**: 2026-06-23 15:02:47 +07
**Summary**: feat(web2-ai): env prefix WEB2* (phân biệt) + ưu tiên Gemini free trước + Cloudflare xoay nhiều account

## Files changed in this commit (`render.com/`)

- `render.com/services/web2-ai-image-service.js`
- `render.com/services/web2-ai-service.js`
- `render.com/services/web2-caption-service.js`
- `render.com/services/web2-translate-service.js`

## Last 5 commits touching `render.com/`

- `e47b0b83d` feat(web2-ai): env prefix WEB2* (phân biệt) + ưu tiên Gemini free trước + Cloudflare xoay nhiều account *(2026-06-23)\_
- `d1b259949` fix(web2-ai-script): remap model Gemini khai tử → 2.5-flash (env WEB2*GEMINI_MODEL còn trỏ 2.0-flash) *(2026-06-23)\_
- `848b3baf9` fix(web2-ai): gemini-2.0-flash đã khai tử → gemini-2.5-flash (chat/translate/caption/ai-script) _(2026-06-23)_
- `3402deb75` fix(web2-ai): xoay key khi Gemini trả HTTP 400 API*KEY_INVALID (không chỉ 401/403) *(2026-06-23)\_
- `c8a45149f` refactor(web2-ai): gộp translate/caption/ai-script vào group xoay key tập trung _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-150247-e47b0b8` cho Claude walk chain theo CLAUDE.md protocol.
