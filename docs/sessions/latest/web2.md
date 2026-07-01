# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260701-193011-421963f`
**Session file**: [`./20260701-193011-421963f.md`](../20260701-193011-421963f.md)
**Commit**: `421963f` — fix(web2-campaign-manager): resync-campaigns review fixes — deadlock ordering + scope clarity + NaN guard
**Last updated**: 2026-07-01 19:30:11 +07
**Summary**: fix(web2-campaign-manager): resync-campaigns review fixes — deadlock ordering + scope clarity + NaN guard

## Files changed in this commit (`web2/`)

- `web2/campaign-manager/js/campaign-manager.js`

## Last 5 commits touching `web2/`

- `421963fee` fix(web2-campaign-manager): resync-campaigns review fixes — deadlock ordering + scope clarity + NaN guard _(2026-07-01)_
- `1549b9f4a` auto: session update _(2026-07-01)_
- `5591041f7` feat(web2-reconcile): wire Web2CampaignPicker — lọc PBH theo chiến dịch cha (span 2 page) _(2026-07-01)_
- `8f5e5d03c` auto: session update _(2026-07-01)_
- `76d945946` feat(web2-goods-weight): tiền ship cân nặng theo bảng bậc/lần cân (thay tuyến tính 25k/kg) _(2026-07-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260701-193011-421963f` cho Claude walk chain theo CLAUDE.md protocol.
