# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-141441-53ef887`
**Session file**: [`./20260623-141441-53ef887.md`](../20260623-141441-53ef887.md)
**Commit**: `53ef887` — feat(web2-cham-cong): dải trạng thái nhận biết PC đồng bộ tắt (stale >15') + hướng dẫn dự phòng (lay-du-lieu.bat / Nhập Excel)
**Last updated**: 2026-06-23 14:14:41 +07
**Summary**: feat(web2-cham-cong): dải trạng thái nhận biết PC đồng bộ tắt (stale >15') + hướng dẫn dự phò...

## Files changed in this commit (`web2/`)

- `web2/cham-cong/css/cham-cong.css`
- `web2/cham-cong/index.html`
- `web2/cham-cong/js/cham-cong-app.js`

## Last 5 commits touching `web2/`

- `53ef887dc` feat(web2-cham-cong): dải trạng thái nhận biết PC đồng bộ tắt (stale >15') + hướng dẫn dự phòng (lay-du-lieu.bat / Nhập Excel) _(2026-06-23)_
- `7e7ca83ac` fix(web2-cham-cong): NV gán ưu tiên hơn tên máy (PIN gán Còi → Bảng công hiện 'Còi' không phải 'Coi') _(2026-06-23)_
- `f8012d291` auto: session update _(2026-06-23)_
- `a47424f02` feat(web2-admin): Người dùng vào group Quản trị viên + bỏ badge số group + smart cache IndexedDB cho Chấm công _(2026-06-23)_
- `c768b5aaf` feat(web2-cham-cong): bảng công dạng chấm tròn màu + popup chi tiết (Vào/Ra/OT/về sớm, đi làm·nghỉ phép) _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-141441-53ef887` cho Claude walk chain theo CLAUDE.md protocol.
