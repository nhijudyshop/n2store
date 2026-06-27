# Latest Snapshot — `gemini-tryon/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-163537-27c148e`
**Session file**: [`./20260627-163537-27c148e.md`](../20260627-163537-27c148e.md)
**Commit**: `27c148e` — feat(gemini-tryon): temporary mode (khong luu hoi thoai) + log loi tung account de debug 1-acc-full-4-acc-0
**Last updated**: 2026-06-27 16:35:37 +07
**Summary**: feat(gemini-tryon): temporary mode (khong luu hoi thoai) + log loi tung account de debug 1-acc-full-4-acc-0

## Files changed in this commit (`gemini-tryon/`)

- `gemini-tryon/app.py`

## Last 5 commits touching `gemini-tryon/`

- `27c148ea6` feat(gemini-tryon): temporary mode (khong luu hoi thoai) + log loi tung account de debug 1-acc-full-4-acc-0 _(2026-06-27)_
- `23f93e878` fix(gemini-tryon): cooldown khi account hết lượt ảnh/ngày (regex 'limit resets' + 8h); test thật phát hiện free quota cạn → fallback paid _(2026-06-27)_
- `fb59af033` fix(gemini-tryon): bắt trọn log uvicorn (PIPE pump) + đọc/hiện log UTF-8 (hết mojibake) _(2026-06-27)_
- `341705d8b` fix(gemini-tryon): UnicodeEncodeError cp1252 trên Windows — ép UTF-8 stdout/stderr + PYTHONIOENCODING _(2026-06-27)_
- `4dd59e284` feat(gemini-tryon): thêm debug — launcher ghi log + health-check trong bat, endpoint /debug + tab chẩn đoán _(2026-06-27)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-163537-27c148e` cho Claude walk chain theo CLAUDE.md protocol.
