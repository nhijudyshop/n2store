# Latest Snapshot — `gemini-tryon/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-160413-5dd946d`
**Session file**: [`./20260627-160413-5dd946d.md`](../20260627-160413-5dd946d.md)
**Commit**: `5dd946d` — fix(web2/live-control): cuộn cả trang được + đẩy panel điều khiển TV xuống dưới
**Last updated**: 2026-06-27 16:04:13 +07
**Summary**: fix(web2/live-control): cuộn cả trang được + đẩy panel điều khiển TV xuống dưới

## Files changed in this commit (`gemini-tryon/`)

- `gemini-tryon/app.py`

## Last 5 commits touching `gemini-tryon/`

- `23f93e878` fix(gemini-tryon): cooldown khi account hết lượt ảnh/ngày (regex 'limit resets' + 8h); test thật phát hiện free quota cạn → fallback paid _(2026-06-27)_
- `fb59af033` fix(gemini-tryon): bắt trọn log uvicorn (PIPE pump) + đọc/hiện log UTF-8 (hết mojibake) _(2026-06-27)_
- `341705d8b` fix(gemini-tryon): UnicodeEncodeError cp1252 trên Windows — ép UTF-8 stdout/stderr + PYTHONIOENCODING _(2026-06-27)_
- `4dd59e284` feat(gemini-tryon): thêm debug — launcher ghi log + health-check trong bat, endpoint /debug + tab chẩn đoán _(2026-06-27)_
- `2f7e2d911` fix(gemini-tryon): heartbeat đăng ký registry — SSL certifi + User-Agent (worker chặn Python-urllib 403) _(2026-06-27)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-160413-5dd946d` cho Claude walk chain theo CLAUDE.md protocol.
