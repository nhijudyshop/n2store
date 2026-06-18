# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260618-130917-4a7def4`
**Session file**: [`./20260618-130917-4a7def4.md`](../20260618-130917-4a7def4.md)
**Commit**: `4a7def4` — feat(balance-history-home): phân biệt 2 TK SePay Home — cột 'Tài khoản' + bộ lọc 44 TL/481 NVK
**Last updated**: 2026-06-18 13:09:17 +07
**Summary**: feat(balance-history-home): phân biệt 2 TK SePay Home — cột 'Tài khoản' + bộ lọc 44 TL/481 NVK

## Files changed in this commit (`render.com/`)

- `render.com/routes/sepay-home-webhook.js`

## Last 5 commits touching `render.com/`

- `4a7def4d0` feat(balance-history-home): phân biệt 2 TK SePay Home — cột 'Tài khoản' + bộ lọc 44 TL/481 NVK _(2026-06-18)_
- `75f7c5a08` fix(native-orders): bộ lọc chiến dịch NHÓM (cha) vs RIÊNG LẺ (bài) — loại trừ 2 chiều + tự chọn 2 bài mới nhất _(2026-06-17)_
- `6609ec405` fix(web2-products): upsert/adjust-pending match theo NCC — SP cùng tên+biến thể KHÁC NCC không gộp (mã prefix NCC riêng) _(2026-06-16)_
- `306e6ce6c` feat(customer-hub): double-click cột Ví khách hàng → xếp khách có công nợ lên đầu _(2026-06-16)_
- `ea1477ed2` feat(orders-report,render): ô check "đã kiểm tra/đã bán" cho strip + bỏ avatar (đồng bộ mọi máy theo chiến dịch) _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260618-130917-4a7def4` cho Claude walk chain theo CLAUDE.md protocol.
