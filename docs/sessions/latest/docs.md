# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-170024-065e6c8`
**Session file**: [`./20260623-170024-065e6c8.md`](../20260623-170024-065e6c8.md)
**Commit**: `065e6c8` — auto: session update
**Last updated**: 2026-06-23 17:00:24 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `7092197c9` fix(web2-zalo): CHỈ TK chính tự kết nối + giữ kết nối; TK phụ không refresh liên tục _(2026-06-23)_
- `352f99957` chore(session): RESUME:20260623-165702-821b884 _(2026-06-23)_
- `3ee7ce904` feat(web2-cham-cong): NV thủ công + ghi chú theo ngày + modal Chi tiết bảng lương _(2026-06-23)_
- `1ae556841` chore(session): RESUME:20260623-164050-b3ae8c0 _(2026-06-23)_
- `b3ae8c021` feat(web2-image): Web2ImagePaste.enhance() — mọi Choose File ảnh dán Ctrl+V + kéo-thả _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-170024-065e6c8` cho Claude walk chain theo CLAUDE.md protocol.
