# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260618-163127-4aea4b7`
**Session file**: [`./20260618-163127-4aea4b7.md`](../20260618-163127-4aea4b7.md)
**Commit**: `4aea4b7` — fix(web2/money): vá 5 HIGH + 3 MED rủi ro tiền NCC + ví khách
**Last updated**: 2026-06-18 16:31:27 +07
**Summary**: fix(web2/money): vá 5 HIGH + 3 MED rủi ro tiền NCC + ví khách

## Files changed in this commit (`render.com/`)

- `render.com/routes/fast-sale-orders.js`
- `render.com/routes/purchase-refund.js`
- `render.com/routes/v2/web2-customer-wallet.js`
- `render.com/routes/web2-supplier-wallet.js`
- `render.com/services/web2-wallet-service.js`

## Last 5 commits touching `render.com/`

- `4aea4b7b0` fix(web2/money): vá 5 HIGH + 3 MED rủi ro tiền NCC + ví khách _(2026-06-18)_
- `625dd0c74` fix(wallets-v2): Rút tiền thủ công (Customer 360) trừ đúng số dư mọi lần _(2026-06-18)_
- `4a7def4d0` feat(balance-history-home): phân biệt 2 TK SePay Home — cột 'Tài khoản' + bộ lọc 44 TL/481 NVK _(2026-06-18)_
- `75f7c5a08` fix(native-orders): bộ lọc chiến dịch NHÓM (cha) vs RIÊNG LẺ (bài) — loại trừ 2 chiều + tự chọn 2 bài mới nhất _(2026-06-17)_
- `6609ec405` fix(web2-products): upsert/adjust-pending match theo NCC — SP cùng tên+biến thể KHÁC NCC không gộp (mã prefix NCC riêng) _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260618-163127-4aea4b7` cho Claude walk chain theo CLAUDE.md protocol.
