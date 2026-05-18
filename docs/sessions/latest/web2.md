# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260518-141625-2a8ad33`
**Session file**: [`./20260518-141625-2a8ad33.md`](../20260518-141625-2a8ad33.md)
**Commit**: `2a8ad33` — fix(web2/sidebar): nav scroll + footer pinned + nút "Đăng xuất" rõ ràng
**Last updated**: 2026-05-18 14:16:25 +07
**Summary**: fix(web2/sidebar): nav scroll + footer pinned + nút "Đăng xuất" rõ ràng

## Files changed in this commit (`web2/`)

- `web2/login/index.html`
- `web2/shared/tpos-sidebar.css`
- `web2/shared/tpos-sidebar.js`
- `web2/shared/web2-auth.js`

## Last 5 commits touching `web2/`

- `2a8ad332` fix(web2/sidebar): nav scroll + footer pinned + nút "Đăng xuất" rõ ràng _(2026-05-18)_
- `853a7501` feat(web2): trang đăng nhập + sidebar user widget + auth helper _(2026-05-18)_
- `d26c4aa5` feat(web2/users): hệ thống user account riêng cho Web 2.0 + phân quyền per-page per-action _(2026-05-18)_
- `13986fe1` fix(web2/supplier-debt): bút toán PAY/2026/---- → derive stable suffix từ id/ts _(2026-05-18)_
- `ad05cc17` fix(web2/supplier-debt): bút toán unique + chống spam click thanh toán _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260518-141625-2a8ad33` cho Claude walk chain theo CLAUDE.md protocol.
