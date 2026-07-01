# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260701-154512-2395762`
**Session file**: [`./20260701-154512-2395762.md`](../20260701-154512-2395762.md)
**Commit**: `2395762` — feat(web2-campaign): shared Web2CampaignPicker (bộ lọc chiến dịch 1 nguồn) + postsForCampaign
**Last updated**: 2026-07-01 15:45:12 +07
**Summary**: Foundation Web2CampaignPicker + postsForCampaign; overhaul chiến dịch 6 mục (mapper xong, drag ở inventory-panel); H4 name-group + native-orders dropdown surgery + wire 10 trang còn lại

## Files changed in this commit (`web2/`)

- `web2/shared/web2-campaign-picker.js`
- `web2/shared/web2-campaign.js`

## Last 5 commits touching `web2/`

- `23957624c` feat(web2-campaign): shared Web2CampaignPicker (bộ lọc chiến dịch 1 nguồn) + postsForCampaign _(2026-07-01)_
- `6b9b9d002` fix(web2-campaign): audit chiến dịch livestream + sửa 2 lỗi HIGH _(2026-07-01)_
- `5a2158df2` feat(reconcile): gọn tab lọc + Hủy đóng gói chụp ảnh lưu lịch sử _(2026-07-01)_
- `18523d2ba` fix(reconcile): quét tem per-unit ra mã SP thay vì link _(2026-07-01)_
- `20c123ec4` feat(tryon-widget): ✨ ghép đồ/mặt cũng paid-first như ai-hub _(2026-07-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260701-154512-2395762` cho Claude walk chain theo CLAUDE.md protocol.
