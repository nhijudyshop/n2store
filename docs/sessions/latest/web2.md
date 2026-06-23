# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-132618-c768b5a`
**Session file**: [`./20260623-132618-c768b5a.md`](../20260623-132618-c768b5a.md)
**Commit**: `c768b5a` — feat(web2-cham-cong): bảng công dạng chấm tròn màu + popup chi tiết (Vào/Ra/OT/về sớm, đi làm·nghỉ phép)
**Last updated**: 2026-06-23 13:26:18 +07
**Summary**: Kết nối DG-600 thật (192.168.1.201): pull 2276 lượt qua agent + bảng công dạng chấm tròn + popup chi tiết

## Files changed in this commit (`web2/`)

- `web2/cham-cong/css/cham-cong.css`
- `web2/cham-cong/index.html`
- `web2/cham-cong/js/cham-cong-app.js`
- `web2/cham-cong/js/cham-cong-salary.js`

## Last 5 commits touching `web2/`

- `c768b5aaf` feat(web2-cham-cong): bảng công dạng chấm tròn màu + popup chi tiết (Vào/Ra/OT/về sớm, đi làm·nghỉ phép) _(2026-06-23)_
- `f1f1dfd9d` fix(web2-ai): bỏ slice(0,-1) chặt nhầm message user → chat UI báo 'Thiếu nội dung chat' _(2026-06-23)_
- `fadcac906` feat(web2-admin): group Quản trị viên (admin-only) + Chấm công DG-600 + Quản lý chi tiêu _(2026-06-23)_
- `dc446c8f7` fix(web2-returns): audit vòng 4 — chặn huỷ phiếu đã consumed + ngừng bơm tồn ảo khi return native chưa có PBH _(2026-06-23)_
- `3ad35df32` fix(web2-pbh) deep money-flow audit: 8 bug (double-refund/over-sell/orphan/double-count) _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-132618-c768b5a` cho Claude walk chain theo CLAUDE.md protocol.
