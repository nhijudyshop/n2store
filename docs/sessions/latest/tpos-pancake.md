# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-100742-95dc85b`
**Session file**: [`./20260519-100742-95dc85b.md`](../20260519-100742-95dc85b.md)
**Commit**: `95dc85b` — chore(web2): đồng nhất title 15 trang chính thành '<base> - WEB 2.0'
**Last updated**: 2026-05-19 10:07:42 +07
**Summary**: chore(web2): đồng nhất title 15 trang chính thành '<base> - WEB 2.0'

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`

## Last 5 commits touching `tpos-pancake/`

- `95dc85bf` chore(web2): đồng nhất title 15 trang chính thành '<base> - WEB 2.0' _(2026-05-19)_
- `c38f56fc` chore(web2): bump tpos-sidebar.css cache v20260518d → v20260518e _(2026-05-18)_
- `76fc24cd` fix(tpos-pancake): gỡ legacy auth → opt-in qua flag \__SKIP_LEGACY_NAV_AUTH _(2026-05-18)\_
- `7eb39f57` refactor(web2): move web2-shared to web2/shared (consolidate Web 2.0) _(2026-05-18)_
- `5922ea4d` fix(web2-shared): sidebar collapsed — labels bleed + toggle bị che _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-100742-95dc85b` cho Claude walk chain theo CLAUDE.md protocol.
