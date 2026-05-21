# Latest Snapshot — `orders-report/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-113334-411482c`
**Session file**: [`./20260521-113334-411482c.md`](../20260521-113334-411482c.md)
**Commit**: `411482c` — feat(domain): rewire codebase sang custom domain nhijudy.store
**Last updated**: 2026-05-21 11:33:34 +07
**Summary**: feat(domain): rewire codebase sang custom domain nhijudy.store

## Files changed in this commit (`orders-report/`)

- `orders-report/main.html`

## Last 5 commits touching `orders-report/`

- `411482c3` feat(domain): rewire codebase sang custom domain nhijudy.store _(2026-05-21)_
- `2291e264` fix(orders/kpi-commission): confirm modal kiểm tra đơn hiển thị cho cả đơn chưa có phiếu bán hàng _(2026-05-19)_
- `400dd6b7` feat(kpi-inbox): cột "Ngày đơn" + ẩn nháp + custom date range _(2026-05-19)_
- `b835da61` fix(orders-report): miss auto-tag XL "ĐÃ RA ĐƠN" sau tạo PBH (single + bulk) _(2026-05-18)_
- `5c72af4f` feat(kpi-strip): SSE-only realtime — push instant trên mọi write kpi-statistics _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-113334-411482c` cho Claude walk chain theo CLAUDE.md protocol.
