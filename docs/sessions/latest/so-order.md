# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260617-154242-f5b8182`
**Session file**: [`./20260617-154242-f5b8182.md`](../20260617-154242-f5b8182.md)
**Commit**: `f5b8182` — auto: session update
**Last updated**: 2026-06-17 15:42:42 +07
**Summary**: auto: session update

## Files changed in this commit (`so-order/`)

- `so-order/css/so-order.css`
- `so-order/index.html`
- `so-order/js/so-order-app.js`
- `so-order/js/so-order-storage.js`

## Last 5 commits touching `so-order/`

- `f5b81826f` auto: session update _(2026-06-17)_
- `970000a95` fix(so-order): Sửa lô tách NCC per-row (lô = nguyên ngày giao, nhiều NCC) — ẩn ô NCC chung, thêm cột NCC mỗi dòng + picker Ví NCC _(2026-06-16)_
- `560d40757` feat(so-order/products): gợi ý biến thể từ Kho Biến Thể khử dấu (den→Đen) + theo token cuối khi build multi _(2026-06-16)_
- `7f6835ef0` feat(web2/products): Kho SP nhập nhiều biến thể (Màu × Size → N SP) qua shared Web2VariantMulti.cartesian + preview _(2026-06-16)_
- `540d719cc` feat(so-order): dropdown biến thể hint nhập-nhiều + biến thể tự do (hết message cụt) _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260617-154242-f5b8182` cho Claude walk chain theo CLAUDE.md protocol.
