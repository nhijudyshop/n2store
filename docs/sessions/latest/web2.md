# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-115253-87bfab3`
**Session file**: [`./20260627-115253-87bfab3.md`](../20260627-115253-87bfab3.md)
**Commit**: `87bfab3` — auto: session update
**Last updated**: 2026-06-27 11:52:53 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/shared/web2-perm.js`
- `web2/shared/web2-sidebar.js`

## Last 5 commits touching `web2/`

- `87bfab397` auto: session update _(2026-06-27)_
- `254da264b` feat(gemini-tryon): đa account xoay tua + cài 1-click (bộ cài máy POS [4]) + route free vào tab Ghép đồ _(2026-06-27)_
- `41e805464` feat(web2 ai-hub): thư viện 49 prompt Nano Banana + nhóm Ghép mặt + try-on cải tiến + sidecar gemini-tryon (cookie FREE) _(2026-06-27)_
- `6ed930d63` feat(web2/cham-cong): audit "thời gian chỉnh sửa" chấm công (ai + lúc nào) + fix false-stamp nghỉ phép _(2026-06-27)_
- `b27f50bda` auto: session update _(2026-06-27)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-115253-87bfab3` cho Claude walk chain theo CLAUDE.md protocol.
