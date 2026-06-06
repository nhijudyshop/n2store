# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260606-132952-356baaa`
**Session file**: [`./20260606-132952-356baaa.md`](../20260606-132952-356baaa.md)
**Commit**: `356baaa` — docs(dev-log): bỏ cột Nợ hiện tại partner-customer
**Last updated**: 2026-06-06 13:29:52 +07
**Summary**: docs(dev-log): bỏ cột Nợ hiện tại partner-customer

## Files changed in this commit (`web2/`)

- `web2/partner-customer/css/partner-customer.css`
- `web2/partner-customer/index.html`
- `web2/partner-customer/js/partner-customer-app.js`

## Last 5 commits touching `web2/`

- `98f584ada` feat(web2/partner-customer): bỏ cột Nợ hiện tại (th/td/toggle/CSS + export Excel) — số dư ví đã hiện qua pill cạnh SĐT _(2026-06-06)_
- `5202d1b67` feat(web2-reconcile): endpoint + nút hủy đóng gói (cancel-pack) _(2026-06-06)_
- `7e1101ebf` feat(web2-reconcile): modal lịch sử toàn bộ + filter đối chiếu camera _(2026-06-06)_
- `76b3edacd` auto: session update _(2026-06-06)_
- `bef27cad4` feat(web2-reconcile): lịch sử đối soát chi tiết (ngày giờ + user + thao tác) _(2026-06-06)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260606-132952-356baaa` cho Claude walk chain theo CLAUDE.md protocol.
