# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260701-163542-9f9a91d`
**Session file**: [`./20260701-163542-9f9a91d.md`](../20260701-163542-9f9a91d.md)
**Commit**: `9f9a91d` — feat(cham-cong): giờ 24h mọi renderer + modal ngày tick Vào/Ra tự chọn 'Đi làm'
**Last updated**: 2026-07-01 16:35:42 +07
**Summary**: feat(cham-cong): giờ 24h mọi renderer + modal ngày tick Vào/Ra tự chọn 'Đi làm'

## Files changed in this commit (`web2/`)

- `web2/cham-cong/js/cham-cong-app.js`
- `web2/cham-cong/js/cham-cong-payroll.js`
- `web2/live-control/index.html`
- `web2/live-control/js/live-control.js`

## Last 5 commits touching `web2/`

- `9f9a91d9e` feat(cham-cong): giờ 24h mọi renderer + modal ngày tick Vào/Ra tự chọn 'Đi làm' _(2026-07-01)_
- `4bbc799fa` fix(web2-campaign): deep-audit #3 — CI1 comment resolve read-time + CAMP-2 board filter _(2026-07-01)_
- `6afe1dfd9` fix(web2-campaign): audit #4/#5 drag→giỏ — F1 kéo SP sai chiến dịch + M7 SSE clobber _(2026-07-01)_
- `23957624c` feat(web2-campaign): shared Web2CampaignPicker (bộ lọc chiến dịch 1 nguồn) + postsForCampaign _(2026-07-01)_
- `6b9b9d002` fix(web2-campaign): audit chiến dịch livestream + sửa 2 lỗi HIGH _(2026-07-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260701-163542-9f9a91d` cho Claude walk chain theo CLAUDE.md protocol.
