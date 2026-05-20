# Latest Snapshot — `don-inbox/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260520-155309-0599b1d`
**Session file**: [`./20260520-155309-0599b1d.md`](../20260520-155309-0599b1d.md)
**Commit**: `0599b1d` — feat(web2): page-tag comments, frontend wire 3 endpoints, Trả hàng NCC stub
**Last updated**: 2026-05-20 15:53:09 +07
**Summary**: feat(web2): page-tag comments, frontend wire 3 endpoints, Trả hàng NCC stub

## Files changed in this commit (`don-inbox/`)

- `don-inbox/index.html`
- `don-inbox/js/tab-social-sale.js`

## Last 5 commits touching `don-inbox/`

- `b452a854` feat(don-inbox/sale): nut Tai lai SP tu TPOS canh o tim kiem F2 _(2026-05-20)_
- `1af7b58c` fix(don-inbox/kpi-stat): chỉ phản ứng theo date filter, bỏ qua status/source/tag/search _(2026-05-19)_
- `15211c34` feat(don-inbox): stat card KPI ngày + toast "User bán được X món - nhận được Yk" _(2026-05-19)_
- `625b797b` fix(inbox): STT độc nhất — atomic counter `inbox_counters` thay cho orders.length+1 _(2026-05-17)_
- `ef1c0425` feat(kpi-inbox): tính KPI từ don-inbox social orders, phân riêng trong KPI tab _(2026-05-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260520-155309-0599b1d` cho Claude walk chain theo CLAUDE.md protocol.
