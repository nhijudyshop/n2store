# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-074559-0d00e40`
**Session file**: [`./20260630-074559-0d00e40.md`](../20260630-074559-0d00e40.md)
**Commit**: `0d00e40` — feat(unit-scan): modal đặt lên kệ hiện tag đơn (CHỜ HÀNG/PBH…) — tái dùng engine order-tags
**Last updated**: 2026-06-30 07:45:59 +07
**Summary**: unit-scan modal đặt lên kệ hiện tag đơn (CHỜ HÀNG/PBH) — tái dùng engine order-tags

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `0d00e40a1` feat(unit-scan): modal đặt lên kệ hiện tag đơn (CHỜ HÀNG/PBH…) — tái dùng engine order-tags _(2026-06-30)_
- `27d149afb` chore(session): RESUME:20260630-000559-6fc0027 _(2026-06-30)_
- `6fc002794` feat(web2-zalo): đăng nhập GLOBAL always-on — admin, 2 cách (cookie/QR), lưu server + auto-refresh _(2026-06-30)_
- `7b0cb9d1c` chore(session): RESUME:20260629-232944-8446e7b _(2026-06-29)_
- `8446e7bac` feat(web2-variants): trường Nhóm modal → SELECT bắt buộc (Màu/Size) _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-074559-0d00e40` cho Claude walk chain theo CLAUDE.md protocol.
