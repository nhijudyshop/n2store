# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-101024-937c317`
**Session file**: [`./20260521-101024-937c317.md`](../20260521-101024-937c317.md)
**Commit**: `937c317` — docs(dev-log): ✅ verify prod paste-image fix sau deploy 243383d0
**Last updated**: 2026-05-21 10:10:24 +07
**Summary**: docs(dev-log): ✅ verify prod paste-image fix sau deploy 243383d0

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`
- `tpos-pancake/js/tpos/tpos-api.js`

## Last 5 commits touching `tpos-pancake/`

- `1dfd24bc` fix(tpos-pancake): savePartnerData — fix 400 'Childs/Status/Extra\*' rejected bởi TPOS OData _(2026-05-21)_
- `0599b1dd` feat(web2): page-tag comments, frontend wire 3 endpoints, Trả hàng NCC stub _(2026-05-20)_
- `7b2eadd2` fix(web2/sidebar): preload web2-auth.js ở 19 trang load tpos-sidebar trực tiếp _(2026-05-19)_
- `5cc1fcd6` Revert "feat(web2/sidebar): forceExpand option — tpos-pancake luôn show sidebar đầy đủ" _(2026-05-19)_
- `32772f6f` feat(web2/sidebar): forceExpand option — tpos-pancake luôn show sidebar đầy đủ _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-101024-937c317` cho Claude walk chain theo CLAUDE.md protocol.
