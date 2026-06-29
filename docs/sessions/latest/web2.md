# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-174516-f535f7c`
**Session file**: [`./20260629-174516-f535f7c.md`](../20260629-174516-f535f7c.md)
**Commit**: `f535f7c` — feat(goods-weight): bộ lọc 12 tháng (mặc định tháng hiện tại) cho báo cáo
**Last updated**: 2026-06-29 17:45:16 +07
**Summary**: feat(goods-weight): bộ lọc 12 tháng (mặc định tháng hiện tại) cho báo cáo

## Files changed in this commit (`web2/`)

- `web2/goods-weight/css/goods-weight.css`
- `web2/goods-weight/index.html`
- `web2/goods-weight/js/goods-weight.js`

## Last 5 commits touching `web2/`

- `f535f7c71` feat(goods-weight): bộ lọc 12 tháng (mặc định tháng hiện tại) cho báo cáo _(2026-06-29)_
- `5050372a0` feat(unit-scan): GỘP sort-station → "Quét tem" 2 chế độ + sơ đồ kệ vật lý + nhãn ô + fix overlay _(2026-06-29)_
- `3fe57867d` feat(goods-weight): tiền ship (kg×25k + kiện×10k) + báo cáo theo ngày (filter chi tiết, PC) _(2026-06-29)_
- `17f400a21` feat(sort-station): trang "Bàn chia hàng" 📱 — put-wall sortation guided _(2026-06-29)_
- `e70726129` feat(print): tem QR sát lề trái + biến thể/giá lên đỉnh → chừa khoảng trống ghi bút _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-174516-f535f7c` cho Claude walk chain theo CLAUDE.md protocol.
