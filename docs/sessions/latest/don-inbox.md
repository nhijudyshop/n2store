# Latest Snapshot — `don-inbox/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260611-101806-bfd2fbd`
**Session file**: [`./20260611-101806-bfd2fbd.md`](../20260611-101806-bfd2fbd.md)
**Commit**: `bfd2fbd` — auto: session update
**Last updated**: 2026-06-11 10:18:06 +07
**Summary**: auto: session update

## Files changed in this commit (`don-inbox/`)

- `don-inbox/index.html`

## Last 5 commits touching `don-inbox/`

- `3f162f108` fix(orders-report): hủy đơn hoàn-ví-trước + surface mọi lỗi ví (Web 1.0 PROD) _(2026-06-11)_
- `3a89c42e0` fix(inbox): refresh thẻ KPI 1 lần khi InvoiceStatusStore sẵn sàng (hết ra 0 lúc mở) _(2026-06-06)_
- `04e6f92e3` perf(inbox): KPI thẻ "tất cả" thôi auto kéo toàn bộ lịch sử đơn khi mở trang _(2026-06-06)_
- `a2ebdddbb` fix(inbox): verify lưu thẳng Render (mount dưới /api/social-orders/kpi-verify) _(2026-06-05)_
- `b519642ee` feat(inbox): KPI verify auto-sync localStorage → Render (không mất cross-máy) _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260611-101806-bfd2fbd` cho Claude walk chain theo CLAUDE.md protocol.
