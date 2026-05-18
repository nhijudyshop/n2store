# Latest Snapshot — `orders-report/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260518-122814-f91badc`
**Session file**: [`./20260518-122814-f91badc.md`](../20260518-122814-f91badc.md)
**Commit**: `f91badc` — feat(web2/supplier-debt): toggle "TPOS (legacy)" — merge data từ TPOS Report API
**Last updated**: 2026-05-18 12:28:14 +07
**Summary**: feat(web2/supplier-debt): toggle "TPOS (legacy)" — merge data từ TPOS Report API

## Files changed in this commit (`orders-report/`)

- `orders-report/js/tab1/tab1-fast-sale-invoice-status.js`
- `orders-report/js/tab1/tab1-processing-tags.js`

## Last 5 commits touching `orders-report/`

- `b835da61` fix(orders-report): miss auto-tag XL "ĐÃ RA ĐƠN" sau tạo PBH (single + bulk) _(2026-05-18)_
- `5c72af4f` feat(kpi-strip): SSE-only realtime — push instant trên mọi write kpi-statistics _(2026-05-18)_
- `60b49340` fix(tab1): KPI strip divergence — always-on poll 60s + cache:no-store _(2026-05-18)_
- `f9b9bf44` fix(chat): sync toggle Tin nhắn/Bình luận với conv thực tế load _(2026-05-17)_
- `932cb47d` feat(kpi-inbox): drill-down chi tiết đơn theo NV (STT, số phiếu, SL món, KPI, trạng thái) _(2026-05-17)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260518-122814-f91badc` cho Claude walk chain theo CLAUDE.md protocol.
