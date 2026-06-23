# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-134454-7e7ca83`
**Session file**: [`./20260623-134454-7e7ca83.md`](../20260623-134454-7e7ca83.md)
**Commit**: `7e7ca83` — fix(web2-cham-cong): NV gán ưu tiên hơn tên máy (PIN gán Còi → Bảng công hiện 'Còi' không phải 'Coi')
**Last updated**: 2026-06-23 13:44:54 +07
**Summary**: Fix gán NV ưu tiên hơn tên máy (Còi) + cache hydrate guard

## Files changed in this commit (`web2/`)

- `web2/cham-cong/index.html`
- `web2/cham-cong/js/cham-cong-app.js`

## Last 5 commits touching `web2/`

- `7e7ca83ac` fix(web2-cham-cong): NV gán ưu tiên hơn tên máy (PIN gán Còi → Bảng công hiện 'Còi' không phải 'Coi') _(2026-06-23)_
- `f8012d291` auto: session update _(2026-06-23)_
- `a47424f02` feat(web2-admin): Người dùng vào group Quản trị viên + bỏ badge số group + smart cache IndexedDB cho Chấm công _(2026-06-23)_
- `c768b5aaf` feat(web2-cham-cong): bảng công dạng chấm tròn màu + popup chi tiết (Vào/Ra/OT/về sớm, đi làm·nghỉ phép) _(2026-06-23)_
- `f1f1dfd9d` fix(web2-ai): bỏ slice(0,-1) chặt nhầm message user → chat UI báo 'Thiếu nội dung chat' _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-134454-7e7ca83` cho Claude walk chain theo CLAUDE.md protocol.
