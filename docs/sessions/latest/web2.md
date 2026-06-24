# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-165320-2132dc4`
**Session file**: [`./20260624-165320-2132dc4.md`](../20260624-165320-2132dc4.md)
**Commit**: `2132dc4` — auto: session update
**Last updated**: 2026-06-24 16:53:20 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/cham-cong/index.html`
- `web2/cham-cong/js/cham-cong-api.js`
- `web2/cham-cong/js/cham-cong-app.js`
- `web2/cham-cong/js/cham-cong-payroll.js`
- `web2/system/css/system.css`
- `web2/system/index.html`
- `web2/system/js/system-app.js`

## Last 5 commits touching `web2/`

- `2132dc41c` auto: session update _(2026-06-24)_
- `a49d94a39` feat(cham-cong): nhóm 3a - widget Hôm nay (ai chưa vào / quên bấm ra / vắng) _(2026-06-24)_
- `8067cc7b7` auto: session update _(2026-06-24)_
- `08d3adecc` feat(web2/photo-editor): add 'Thêm logo/watermark' (Web2Watermark) - the only missing image tool _(2026-06-24)_
- `6116a3ae5` fix(cham-cong): nhóm 1 - sửa lỗi tính lương (số công nguyên, punch thiếu=0, override reset phạt, chống gán trùng NV) _(2026-06-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-165320-2132dc4` cho Claude walk chain theo CLAUDE.md protocol.
