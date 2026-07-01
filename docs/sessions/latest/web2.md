# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260701-175637-e57cab1`
**Session file**: [`./20260701-175637-e57cab1.md`](../20260701-175637-e57cab1.md)
**Commit**: `e57cab1` — feat(web2-campaign-manager): trang quản lý chiến dịch CRUD + tạo+gán bài FB 1 luồng (admin)
**Last updated**: 2026-07-01 17:56:37 +07
**Summary**: Web2CampaignManager trang mới (CRUD + tạo+gán bài FB 1 luồng, admin) + #1; browser-tested

## Files changed in this commit (`web2/`)

- `web2/campaign-manager/css/campaign-manager.css`
- `web2/campaign-manager/index.html`
- `web2/campaign-manager/js/campaign-manager.js`
- `web2/cham-cong/css/cham-cong.css`
- `web2/cham-cong/js/cham-cong-app.js`
- `web2/cham-cong/js/cham-cong-payroll.js`
- `web2/cham-cong/js/cham-cong-salary.js`
- `web2/shared/web2-sidebar.js`

## Last 5 commits touching `web2/`

- `e57cab108` feat(web2-campaign-manager): trang quản lý chiến dịch CRUD + tạo+gán bài FB 1 luồng (admin) _(2026-07-01)_
- `4b823c9d3` feat(cham-cong): Bảng lương sửa inline (Phụ cấp/Thưởng/Giảm trừ/Đã trả/Tăng ca/Ghi chú) + icon lịch chấm công + sort công + nhớ tab _(2026-07-01)_
- `2c687d28c` feat(cham-cong): nhớ tab đang xem qua refresh (localStorage cc*tab) *(2026-07-01)\_
- `8b82ed90c` fix(cham-cong): input giờ 24h thật (thay input type=time theo đồng hồ máy 12h SA/CH) _(2026-07-01)_
- `b6faf50ab` feat(cham-cong): chuột phải ô lưới chấm 'đúng giờ' ca chuẩn cho ngày nghỉ/chấm thiếu _(2026-07-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260701-175637-e57cab1` cho Claude walk chain theo CLAUDE.md protocol.
