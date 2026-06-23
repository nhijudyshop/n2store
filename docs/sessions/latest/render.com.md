# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-132618-c768b5a`
**Session file**: [`./20260623-132618-c768b5a.md`](../20260623-132618-c768b5a.md)
**Commit**: `c768b5a` — feat(web2-cham-cong): bảng công dạng chấm tròn màu + popup chi tiết (Vào/Ra/OT/về sớm, đi làm·nghỉ phép)
**Last updated**: 2026-06-23 13:26:18 +07
**Summary**: Kết nối DG-600 thật (192.168.1.201): pull 2276 lượt qua agent + bảng công dạng chấm tròn + popup chi tiết

## Files changed in this commit (`render.com/`)

- `render.com/routes/web2-ai-script.js`
- `render.com/services/web2-ai-service.js`
- `render.com/services/web2-caption-service.js`
- `render.com/services/web2-translate-service.js`

## Last 5 commits touching `render.com/`

- `848b3baf9` fix(web2-ai): gemini-2.0-flash đã khai tử → gemini-2.5-flash (chat/translate/caption/ai-script) _(2026-06-23)_
- `3402deb75` fix(web2-ai): xoay key khi Gemini trả HTTP 400 API*KEY_INVALID (không chỉ 401/403) *(2026-06-23)\_
- `c8a45149f` refactor(web2-ai): gộp translate/caption/ai-script vào group xoay key tập trung _(2026-06-23)_
- `b536ac7dd` auto: session update _(2026-06-23)_
- `0f689e444` fix(web2-attendance): auto-tạo device-user khi nhập punch (ADMS/import/manual hiện ngay bảng công) _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-132618-c768b5a` cho Claude walk chain theo CLAUDE.md protocol.
