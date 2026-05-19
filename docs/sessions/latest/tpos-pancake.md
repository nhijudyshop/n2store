# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-182504-8ff8533`
**Session file**: [`./20260519-182504-8ff8533.md`](../20260519-182504-8ff8533.md)
**Commit**: `8ff8533` — fix(web2/sidebar): preload web2-auth.js trong page-shell → footer user/đăng xuất luôn hiện
**Last updated**: 2026-05-19 18:25:04 +07
**Summary**: fix(web2/sidebar): preload web2-auth.js trong page-shell → footer user/đăng xuất luôn hiện

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`

## Last 5 commits touching `tpos-pancake/`

- `5cc1fcd6` Revert "feat(web2/sidebar): forceExpand option — tpos-pancake luôn show sidebar đầy đủ" _(2026-05-19)_
- `32772f6f` feat(web2/sidebar): forceExpand option — tpos-pancake luôn show sidebar đầy đủ _(2026-05-19)_
- `95dc85bf` chore(web2): đồng nhất title 15 trang chính thành '<base> - WEB 2.0' _(2026-05-19)_
- `c38f56fc` chore(web2): bump tpos-sidebar.css cache v20260518d → v20260518e _(2026-05-18)_
- `76fc24cd` fix(tpos-pancake): gỡ legacy auth → opt-in qua flag \__SKIP_LEGACY_NAV_AUTH _(2026-05-18)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-182504-8ff8533` cho Claude walk chain theo CLAUDE.md protocol.
