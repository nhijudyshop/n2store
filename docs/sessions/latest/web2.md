# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260701-184104-5591041`
**Session file**: [`./20260701-184104-5591041.md`](../20260701-184104-5591041.md)
**Commit**: `5591041` — feat(web2-reconcile): wire Web2CampaignPicker — lọc PBH theo chiến dịch cha (span 2 page)
**Last updated**: 2026-07-01 18:41:04 +07
**Summary**: feat(web2-reconcile): wire Web2CampaignPicker — lọc PBH theo chiến dịch cha (span 2 page)

## Files changed in this commit (`web2/`)

- `web2/reconcile/index.html`
- `web2/reconcile/js/reconcile-api.js`
- `web2/reconcile/js/reconcile-app.js`
- `web2/reconcile/js/reconcile-state.js`

## Last 5 commits touching `web2/`

- `5591041f7` feat(web2-reconcile): wire Web2CampaignPicker — lọc PBH theo chiến dịch cha (span 2 page) _(2026-07-01)_
- `8f5e5d03c` auto: session update _(2026-07-01)_
- `76d945946` feat(web2-goods-weight): tiền ship cân nặng theo bảng bậc/lần cân (thay tuyến tính 25k/kg) _(2026-07-01)_
- `14d62ae5c` feat(cham-cong): lịch sử chỉnh sửa lương (icon 🕘 → Web2AuditLog + BE ghi audit diff) _(2026-07-01)_
- `e57cab108` feat(web2-campaign-manager): trang quản lý chiến dịch CRUD + tạo+gán bài FB 1 luồng (admin) _(2026-07-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260701-184104-5591041` cho Claude walk chain theo CLAUDE.md protocol.
