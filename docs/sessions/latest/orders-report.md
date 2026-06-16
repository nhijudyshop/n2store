# Latest Snapshot — `orders-report/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-143128-7bd7dbe`
**Session file**: [`./20260616-143128-7bd7dbe.md`](../20260616-143128-7bd7dbe.md)
**Commit**: `7bd7dbe` — fix(auth): tab3 dùng tokenManager (company-correct) thay vì tự login
**Last updated**: 2026-06-16 14:31:28 +07
**Summary**: fix(auth): tab3 dùng tokenManager (company-correct) thay vì tự login

## Files changed in this commit (`orders-report/`)

- `orders-report/js/tab3/tab3-core.js`
- `orders-report/tab-kpi-commission.html`
- `orders-report/tab-live-ledger.html`
- `orders-report/tab-overview.html`
- `orders-report/tab1-orders.html`
- `orders-report/tab3-product-assignment.html`

## Last 5 commits touching `orders-report/`

- `7bd7dbe02` fix(auth): tab3 dùng tokenManager (company-correct) thay vì tự login _(2026-06-16)_
- `85771c3f7` fix(auth): SwitchCompany theo công ty đang chọn — NJD Live = Company 1 (kho live) _(2026-06-16)_
- `7296b99aa` fix(orders-report,don-inbox): product search rỗng — tự refresh token TPOS stale _(2026-06-16)_
- `5f185dfdb` feat(orders-report): thanh "Khách chưa trả lời" giữa bộ lọc và bảng _(2026-06-16)_
- `7f9652b86` chore(web1): gỡ 3 direct call n2store-realtime mark-replied (giữ worker primary) — chuẩn bị retire service _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-143128-7bd7dbe` cho Claude walk chain theo CLAUDE.md protocol.
