# Latest Snapshot — `don-inbox/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260611-164934-77fb3cb`
**Session file**: [`./20260611-164934-77fb3cb.md`](../20260611-164934-77fb3cb.md)
**Commit**: `77fb3cb` — docs(dev-log): chat-db 15GB + realtime starter + nghi hết build minutes Render
**Last updated**: 2026-06-11 16:49:34 +07
**Summary**: docs(dev-log): chat-db 15GB + realtime starter + nghi hết build minutes Render

## Files changed in this commit (`don-inbox/`)

- `don-inbox/index.html`
- `don-inbox/js/tab-social-invoice.js`

## Last 5 commits touching `don-inbox/`

- `f8a0e3fea` fix(wallet): vòng 2 audit — 8 fix còn sót (don-inbox refund-first, order-wide guard, UI kế toán REFUND*DUE) *(2026-06-11)\_
- `3f162f108` fix(orders-report): hủy đơn hoàn-ví-trước + surface mọi lỗi ví (Web 1.0 PROD) _(2026-06-11)_
- `3a89c42e0` fix(inbox): refresh thẻ KPI 1 lần khi InvoiceStatusStore sẵn sàng (hết ra 0 lúc mở) _(2026-06-06)_
- `04e6f92e3` perf(inbox): KPI thẻ "tất cả" thôi auto kéo toàn bộ lịch sử đơn khi mở trang _(2026-06-06)_
- `a2ebdddbb` fix(inbox): verify lưu thẳng Render (mount dưới /api/social-orders/kpi-verify) _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260611-164934-77fb3cb` cho Claude walk chain theo CLAUDE.md protocol.
