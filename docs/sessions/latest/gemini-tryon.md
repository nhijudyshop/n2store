# Latest Snapshot — `gemini-tryon/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-114539-254da26`
**Session file**: [`./20260627-114539-254da26.md`](../20260627-114539-254da26.md)
**Commit**: `254da26` — feat(gemini-tryon): đa account xoay tua + cài 1-click (bộ cài máy POS [4]) + route free vào tab Ghép đồ
**Last updated**: 2026-06-27 11:45:39 +07
**Summary**: gemini-tryon đa account xoay tua + cài 1-click (bộ cài [4]) + route free tab Ghép đồ

## Files changed in this commit (`gemini-tryon/`)

- `gemini-tryon/.gitignore`
- `gemini-tryon/README.md`
- `gemini-tryon/app.py`
- `gemini-tryon/gemini-tryon-windows-setup.ps1`
- `gemini-tryon/serve.py`

## Last 5 commits touching `gemini-tryon/`

- `254da264b` feat(gemini-tryon): đa account xoay tua + cài 1-click (bộ cài máy POS [4]) + route free vào tab Ghép đồ _(2026-06-27)_
- `41e805464` feat(web2 ai-hub): thư viện 49 prompt Nano Banana + nhóm Ghép mặt + try-on cải tiến + sidecar gemini-tryon (cookie FREE) _(2026-06-27)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-114539-254da26` cho Claude walk chain theo CLAUDE.md protocol.
