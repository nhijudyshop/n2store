# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260701-173451-404713d`
**Session file**: [`./20260701-173451-404713d.md`](../20260701-173451-404713d.md)
**Commit**: `404713d` — feat(web2-campaign): #2 cross-page cart merge + H4/MP1/CAMP-1 via parent_campaign_id
**Last updated**: 2026-07-01 17:34:51 +07
**Summary**: #2 cross-page cart merge + H4/MP1/CAMP-1 via parent_campaign_id (native-orders + cart, tested + reviewed)

## Files changed in this commit (`web2/`)

- `web2/cham-cong/css/cham-cong.css`
- `web2/cham-cong/js/cham-cong-app.js`
- `web2/cham-cong/js/cham-cong-employees.js`

## Last 5 commits touching `web2/`

- `8b82ed90c` fix(cham-cong): input giờ 24h thật (thay input type=time theo đồng hồ máy 12h SA/CH) _(2026-07-01)_
- `b6faf50ab` feat(cham-cong): chuột phải ô lưới chấm 'đúng giờ' ca chuẩn cho ngày nghỉ/chấm thiếu _(2026-07-01)_
- `e338c3ce2` fix(cham-cong): bỏ tick Vào/Ra cả 2 → mặc định 'Nghỉ không phép' _(2026-07-01)_
- `9f9a91d9e` feat(cham-cong): giờ 24h mọi renderer + modal ngày tick Vào/Ra tự chọn 'Đi làm' _(2026-07-01)_
- `4bbc799fa` fix(web2-campaign): deep-audit #3 — CI1 comment resolve read-time + CAMP-2 board filter _(2026-07-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260701-173451-404713d` cho Claude walk chain theo CLAUDE.md protocol.
