# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-170050-1936b5e`
**Session file**: [`./20260604-170050-1936b5e.md`](../20260604-170050-1936b5e.md)
**Commit**: `1936b5e` — feat(web2): photo-studio đợt 5 — xử lý hàng loạt (batch+ZIP) + AI upscale ×2 (ESRGAN-slim, fallback Lanczos)
**Last updated**: 2026-06-04 17:00:50 +07
**Summary**: feat(web2): photo-studio đợt 5 — xử lý hàng loạt (batch+ZIP) + AI upscale ×2 (ESRGAN-slim, fallback Lanczos)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `1936b5e93` feat(web2): photo-studio đợt 5 — xử lý hàng loạt (batch+ZIP) + AI upscale ×2 (ESRGAN-slim, fallback Lanczos) _(2026-06-04)_
- `b8e4fbb3a` chore(session): RESUME:20260604-163720-f6ba032 _(2026-06-04)_
- `f6ba03282` feat(web2): photo-studio đợt 4 — brush sửa viền (xóa/khôi phục) + fix [hidden] brush bar _(2026-06-04)_
- `34002341c` chore(session): RESUME:20260604-163417-ab1d1e9 _(2026-06-04)_
- `7e9fed66d` fix(inventory-tracking): NCC ẩn không thực sự ẩn hàng SP — apply hidden state sau render + khi expand _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-170050-1936b5e` cho Claude walk chain theo CLAUDE.md protocol.
