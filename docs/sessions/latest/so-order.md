# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260530-093357-b5a1a06`
**Session file**: [`./20260530-093357-b5a1a06.md`](../20260530-093357-b5a1a06.md)
**Commit**: `b5a1a06` — perf(so-order): stock check 24000× faster — Web2ProductsCache thay N×HTTP
**Last updated**: 2026-05-30 09:33:57 +07
**Summary**: perf(so-order): stock check 24000× faster — Web2ProductsCache thay N×HTTP

## Files changed in this commit (`so-order/`)

- `so-order/css/so-order.css`
- `so-order/index.html`
- `so-order/js/so-order-app.js`

## Last 5 commits touching `so-order/`

- `b5a1a06a5` perf(so-order): stock check 24000× faster — Web2ProductsCache thay N×HTTP _(2026-05-30)_
- `057240824` fix(so-order): confirm popup mở instant + spam guard cho nút xóa _(2026-05-29)_
- `0ee0289f0` auto: session update _(2026-05-29)_
- `439a79ae5` feat(so-order): custom confirm popup thay window.confirm() — fix delay + match UI _(2026-05-29)_
- `dab18a069` feat(so-order): focus mode khi mở Receive panel — ẩn các shipments khác _(2026-05-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260530-093357-b5a1a06` cho Claude walk chain theo CLAUDE.md protocol.
