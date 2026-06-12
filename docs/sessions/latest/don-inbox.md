# Latest Snapshot — `don-inbox/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260612-200128-2a4021b`
**Session file**: [`./20260612-200128-2a4021b.md`](../20260612-200128-2a4021b.md)
**Commit**: `2a4021b` — fix(orders-report): gộp đơn trùng SĐT — hết miss tag "ĐÃ GỘP KHÔNG CHỐT" theo máy + progress UI trong modal
**Last updated**: 2026-06-12 20:01:28 +07
**Summary**: fix(orders-report): gộp đơn trùng SĐT — hết miss tag "ĐÃ GỘP KHÔNG CHỐT" theo máy + progress UI tro...

## Files changed in this commit (`don-inbox/`)

- `don-inbox/index.html`

## Last 5 commits touching `don-inbox/`

- `248532b73` feat(web2): ENFORCE-PREP — wire x-web2-token toàn bộ client gọi route soft-gated _(2026-06-12)_
- `f8a0e3fea` fix(wallet): vòng 2 audit — 8 fix còn sót (don-inbox refund-first, order-wide guard, UI kế toán REFUND*DUE) *(2026-06-11)\_
- `3f162f108` fix(orders-report): hủy đơn hoàn-ví-trước + surface mọi lỗi ví (Web 1.0 PROD) _(2026-06-11)_
- `3a89c42e0` fix(inbox): refresh thẻ KPI 1 lần khi InvoiceStatusStore sẵn sàng (hết ra 0 lúc mở) _(2026-06-06)_
- `04e6f92e3` perf(inbox): KPI thẻ "tất cả" thôi auto kéo toàn bộ lịch sử đơn khi mở trang _(2026-06-06)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260612-200128-2a4021b` cho Claude walk chain theo CLAUDE.md protocol.
