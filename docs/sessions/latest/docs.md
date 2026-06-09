# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260609-185605-7b58a46`
**Session file**: [`./20260609-185605-7b58a46.md`](../20260609-185605-7b58a46.md)
**Commit**: `7b58a46` — auto: session update
**Last updated**: 2026-06-09 18:56:05 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `3d0b73c99` feat(orders): nút Facebook popup KH luôn hiện — fallback resolve global*id + tìm theo tên *(2026-06-09)\_
- `8bc393248` chore(session): RESUME:20260609-185333-da7e24b _(2026-06-09)_
- `f0fc98899` feat(web2-customers): chọn SĐT phụ làm SĐT chính (hiển thị) — swap qua nút ⭐ _(2026-06-09)_
- `540b1e21d` chore(session): RESUME:20260609-184840-74c08f8 _(2026-06-09)_
- `74c08f8e4` feat(web2-customers): 1 KH thêm nhiều SĐT (alt*phones) — modal chips + persist create/PATCH *(2026-06-09)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260609-185605-7b58a46` cho Claude walk chain theo CLAUDE.md protocol.
