# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260701-180549-76d9459`
**Session file**: [`./20260701-180549-76d9459.md`](../20260701-180549-76d9459.md)
**Commit**: `76d9459` — feat(web2-goods-weight): tiền ship cân nặng theo bảng bậc/lần cân (thay tuyến tính 25k/kg)
**Last updated**: 2026-07-01 18:05:49 +07
**Summary**: feat(web2-goods-weight): tiền ship cân nặng theo bảng bậc/lần cân (thay tuyến tính 25k/kg)

## Files changed in this commit (`web2/`)

- `web2/cham-cong/index.html`
- `web2/cham-cong/js/cham-cong-payroll.js`
- `web2/goods-weight/js/goods-weight.js`

## Last 5 commits touching `web2/`

- `76d945946` feat(web2-goods-weight): tiền ship cân nặng theo bảng bậc/lần cân (thay tuyến tính 25k/kg) _(2026-07-01)_
- `14d62ae5c` feat(cham-cong): lịch sử chỉnh sửa lương (icon 🕘 → Web2AuditLog + BE ghi audit diff) _(2026-07-01)_
- `e57cab108` feat(web2-campaign-manager): trang quản lý chiến dịch CRUD + tạo+gán bài FB 1 luồng (admin) _(2026-07-01)_
- `4b823c9d3` feat(cham-cong): Bảng lương sửa inline (Phụ cấp/Thưởng/Giảm trừ/Đã trả/Tăng ca/Ghi chú) + icon lịch chấm công + sort công + nhớ tab _(2026-07-01)_
- `2c687d28c` feat(cham-cong): nhớ tab đang xem qua refresh (localStorage cc*tab) *(2026-07-01)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260701-180549-76d9459` cho Claude walk chain theo CLAUDE.md protocol.
