# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-132551-fb59af0`
**Session file**: [`./20260627-132551-fb59af0.md`](../20260627-132551-fb59af0.md)
**Commit**: `fb59af0` — fix(gemini-tryon): bắt trọn log uvicorn (PIPE pump) + đọc/hiện log UTF-8 (hết mojibake)
**Last updated**: 2026-06-27 13:25:51 +07
**Summary**: fix(gemini-tryon): bắt trọn log uvicorn (PIPE pump) + đọc/hiện log UTF-8 (hết mojibake)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `fb59af033` fix(gemini-tryon): bắt trọn log uvicorn (PIPE pump) + đọc/hiện log UTF-8 (hết mojibake) _(2026-06-27)_
- `4f7c77188` fix(web2/live-control): hpin guard removed=false + KH MỚI column width polish _(2026-06-27)_
- `341705d8b` fix(gemini-tryon): UnicodeEncodeError cp1252 trên Windows — ép UTF-8 stdout/stderr + PYTHONIOENCODING _(2026-06-27)_
- `c4759d73d` chore(session): RESUME:20260627-124238-4dd59e2 _(2026-06-27)_
- `4dd59e284` feat(gemini-tryon): thêm debug — launcher ghi log + health-check trong bat, endpoint /debug + tab chẩn đoán _(2026-06-27)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-132551-fb59af0` cho Claude walk chain theo CLAUDE.md protocol.
