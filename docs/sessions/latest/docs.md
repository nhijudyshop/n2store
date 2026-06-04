# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-113608-3e28684`
**Session file**: [`./20260604-113608-3e28684.md`](../20260604-113608-3e28684.md)
**Commit**: `3e28684` — feat(web2): photo-studio — chèn nền: 8 preset studio + chọn nền trên camera (live) + lưu nền riêng dùng lại
**Last updated**: 2026-06-04 11:36:08 +07
**Summary**: feat(web2): photo-studio — chèn nền: 8 preset studio + chọn nền trên camera (live) + lưu nền riêng dùn...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `3e2868402` feat(web2): photo-studio — chèn nền: 8 preset studio + chọn nền trên camera (live) + lưu nền riêng dùng lại _(2026-06-04)_
- `1a6b11cc1` chore(session): RESUME:20260604-113229-1efd14a _(2026-06-04)_
- `213f353a1` chore(session): RESUME:20260604-112813-ef32c68 _(2026-06-04)_
- `9a563cfec` chore(session): RESUME:20260604-111903-954852a _(2026-06-04)_
- `954852a89` feat(soluong-live): realtime TPOS sync tên/hình/số lượng (giữ logic biến thể) _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-113608-3e28684` cho Claude walk chain theo CLAUDE.md protocol.
