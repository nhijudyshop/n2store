# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-102126-e1d0d4f`
**Session file**: [`./20260521-102126-e1d0d4f.md`](../20260521-102126-e1d0d4f.md)
**Commit**: `e1d0d4f` — auto: session update
**Last updated**: 2026-05-21 10:21:26 +07
**Summary**: auto: session update

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`
- `tpos-pancake/js/tpos/tpos-realtime.js`

## Last 5 commits touching `tpos-pancake/`

- `e1d0d4f6` auto: session update _(2026-05-21)_
- `3edbf7ab` fix(tpos-pancake): savePartnerData strip @odata.\* annotations + drop ExtraAddress/Properties/FacebookMap before POST _(2026-05-21)_
- `1dfd24bc` fix(tpos-pancake): savePartnerData — fix 400 'Childs/Status/Extra\*' rejected bởi TPOS OData _(2026-05-21)_
- `0599b1dd` feat(web2): page-tag comments, frontend wire 3 endpoints, Trả hàng NCC stub _(2026-05-20)_
- `7b2eadd2` fix(web2/sidebar): preload web2-auth.js ở 19 trang load tpos-sidebar trực tiếp _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-102126-e1d0d4f` cho Claude walk chain theo CLAUDE.md protocol.
