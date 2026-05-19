# Latest Snapshot — `don-inbox/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-131132-050a596`
**Session file**: [`./20260519-131132-050a596.md`](../20260519-131132-050a596.md)
**Commit**: `050a596` — fix(server): wire fast-sale-orders + web2-users initializeNotifiers top-level (block scope bug)
**Last updated**: 2026-05-19 13:11:32 +07
**Summary**: fix(server): wire fast-sale-orders + web2-users initializeNotifiers top-level (block scope bug)

## Files changed in this commit (`don-inbox/`)

- `don-inbox/css/don-inbox.css`
- `don-inbox/index.html`
- `don-inbox/js/tab-social-core.js`
- `don-inbox/js/tab-social-invoice.js`
- `don-inbox/js/tab-social-sale.js`
- `don-inbox/js/tab-social-table.js`

## Last 5 commits touching `don-inbox/`

- `15211c34` feat(don-inbox): stat card KPI ngày + toast "User bán được X món - nhận được Yk" _(2026-05-19)_
- `625b797b` fix(inbox): STT độc nhất — atomic counter `inbox_counters` thay cho orders.length+1 _(2026-05-17)_
- `ef1c0425` feat(kpi-inbox): tính KPI từ don-inbox social orders, phân riêng trong KPI tab _(2026-05-13)_
- `b451b433` fix(wallet): ẩn cặp tạo-hủy đơn khỏi UI ví + fix note PBH "Nợ Cũ" sai khi tiền vào ví là ADJUSTMENT _(2026-05-07)_
- `fc29455d` feat(don-inbox): pin button trên mọi tag card trong panel (không chỉ zero-order sub-list) _(2026-05-07)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-131132-050a596` cho Claude walk chain theo CLAUDE.md protocol.
