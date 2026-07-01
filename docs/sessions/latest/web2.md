# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260701-165151-b6faf50`
**Session file**: [`./20260701-165151-b6faf50.md`](../20260701-165151-b6faf50.md)
**Commit**: `b6faf50` — feat(cham-cong): chuột phải ô lưới chấm 'đúng giờ' ca chuẩn cho ngày nghỉ/chấm thiếu
**Last updated**: 2026-07-01 16:51:51 +07
**Summary**: feat(cham-cong): chuột phải ô lưới chấm 'đúng giờ' ca chuẩn cho ngày nghỉ/chấm thiếu

## Files changed in this commit (`web2/`)

- `web2/cham-cong/js/cham-cong-app.js`

## Last 5 commits touching `web2/`

- `b6faf50ab` feat(cham-cong): chuột phải ô lưới chấm 'đúng giờ' ca chuẩn cho ngày nghỉ/chấm thiếu _(2026-07-01)_
- `e338c3ce2` fix(cham-cong): bỏ tick Vào/Ra cả 2 → mặc định 'Nghỉ không phép' _(2026-07-01)_
- `9f9a91d9e` feat(cham-cong): giờ 24h mọi renderer + modal ngày tick Vào/Ra tự chọn 'Đi làm' _(2026-07-01)_
- `4bbc799fa` fix(web2-campaign): deep-audit #3 — CI1 comment resolve read-time + CAMP-2 board filter _(2026-07-01)_
- `6afe1dfd9` fix(web2-campaign): audit #4/#5 drag→giỏ — F1 kéo SP sai chiến dịch + M7 SSE clobber _(2026-07-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260701-165151-b6faf50` cho Claude walk chain theo CLAUDE.md protocol.
