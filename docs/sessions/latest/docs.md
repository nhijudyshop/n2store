# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-135607-ce7fa1e`
**Session file**: [`./20260627-135607-ce7fa1e.md`](../20260627-135607-ce7fa1e.md)
**Commit**: `ce7fa1e` — fix(web2/live-control): card flex-shrink:0 (hàng NCC/Giỏ/KH mới/Còn bị cắt khi nhiều SP) + nhãn GIỎ + cache-bust
**Last updated**: 2026-06-27 13:56:07 +07
**Summary**: fix(web2/live-control): card flex-shrink:0 (hàng NCC/Giỏ/KH mới/Còn bị cắt khi nhiều SP) + nhãn GIỎ + ...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `ce7fa1e20` fix(web2/live-control): card flex-shrink:0 (hàng NCC/Giỏ/KH mới/Còn bị cắt khi nhiều SP) + nhãn GIỎ + cache-bust _(2026-06-27)_
- `d804d92c6` chore(session): RESUME:20260627-132551-fb59af0 _(2026-06-27)_
- `fb59af033` fix(gemini-tryon): bắt trọn log uvicorn (PIPE pump) + đọc/hiện log UTF-8 (hết mojibake) _(2026-06-27)_
- `4f7c77188` fix(web2/live-control): hpin guard removed=false + KH MỚI column width polish _(2026-06-27)_
- `341705d8b` fix(gemini-tryon): UnicodeEncodeError cp1252 trên Windows — ép UTF-8 stdout/stderr + PYTHONIOENCODING _(2026-06-27)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-135607-ce7fa1e` cho Claude walk chain theo CLAUDE.md protocol.
