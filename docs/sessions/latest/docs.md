# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-104738-83392ba`
**Session file**: [`./20260628-104738-83392ba.md`](../20260628-104738-83392ba.md)
**Commit**: `83392ba` — auto: session update
**Last updated**: 2026-06-28 10:47:38 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `6e539bc9c` docs: dev-log — fix SP ghost live-control/live-tv khi xoá kho/Số Order _(2026-06-28)_
- `442f7da3c` chore(session): RESUME:20260628-102841-32a6ce5 _(2026-06-28)_
- `32a6ce594` fix(so-order): picker không auto-đặt tên cho dòng đã chọn SP (matchedCode) _(2026-06-28)_
- `d8748b475` chore(session): RESUME:20260628-101533-259d9a2 _(2026-06-28)_
- `259d9a22b` fix(ai-hub): ẩn nút nổi ✨ trợ lý AI trên trang ai-hub (đã là khung trợ lý) _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-104738-83392ba` cho Claude walk chain theo CLAUDE.md protocol.
