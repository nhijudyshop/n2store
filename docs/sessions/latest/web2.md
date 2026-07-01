# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260701-190432-1549b9f`
**Session file**: [`./20260701-190432-1549b9f.md`](../20260701-190432-1549b9f.md)
**Commit**: `1549b9f` — auto: session update
**Last updated**: 2026-07-01 19:04:32 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/campaign-manager/index.html`
- `web2/campaign-manager/js/campaign-manager.js`

## Last 5 commits touching `web2/`

- `1549b9f4a` auto: session update _(2026-07-01)_
- `5591041f7` feat(web2-reconcile): wire Web2CampaignPicker — lọc PBH theo chiến dịch cha (span 2 page) _(2026-07-01)_
- `8f5e5d03c` auto: session update _(2026-07-01)_
- `76d945946` feat(web2-goods-weight): tiền ship cân nặng theo bảng bậc/lần cân (thay tuyến tính 25k/kg) _(2026-07-01)_
- `14d62ae5c` feat(cham-cong): lịch sử chỉnh sửa lương (icon 🕘 → Web2AuditLog + BE ghi audit diff) _(2026-07-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260701-190432-1549b9f` cho Claude walk chain theo CLAUDE.md protocol.
