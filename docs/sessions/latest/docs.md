# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-102841-32a6ce5`
**Session file**: [`./20260628-102841-32a6ce5.md`](../20260628-102841-32a6ce5.md)
**Commit**: `32a6ce5` — fix(so-order): picker không auto-đặt tên cho dòng đã chọn SP (matchedCode)
**Last updated**: 2026-06-28 10:28:41 +07
**Summary**: fix(so-order): picker không auto-đặt tên cho dòng đã chọn SP (matchedCode)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `32a6ce594` fix(so-order): picker không auto-đặt tên cho dòng đã chọn SP (matchedCode) _(2026-06-28)_
- `d8748b475` chore(session): RESUME:20260628-101533-259d9a2 _(2026-06-28)_
- `259d9a22b` fix(ai-hub): ẩn nút nổi ✨ trợ lý AI trên trang ai-hub (đã là khung trợ lý) _(2026-06-28)_
- `859b30006` chore(session): RESUME:20260628-101015-30b4f6a _(2026-06-28)_
- `30b4f6a60` fix(ai-hub): icon SVG sạch cho nút đính ảnh/prompt/gửi + chốt ẩn busy (scoped !important) _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-102841-32a6ce5` cho Claude walk chain theo CLAUDE.md protocol.
