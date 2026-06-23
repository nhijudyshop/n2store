# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-105516-e2d9dce`
**Session file**: [`./20260623-105516-e2d9dce.md`](../20260623-105516-e2d9dce.md)
**Commit**: `e2d9dce` — docs(dev-log): browser-test fix over-restock partial + /tx ledger-mint (#2) — both verified live
**Last updated**: 2026-06-23 10:55:16 +07
**Summary**: browser-test fix over-restock (returned_line_qty) + /tx amount recompute #2 — verified live

## Files changed in this commit (`render.com/`)

- `render.com/lib/web2-so-order-qty.js`
- `render.com/routes/fast-sale-orders.js`
- `render.com/routes/web2-returns.js`
- `render.com/routes/web2-supplier-wallet.js`

## Last 5 commits touching `render.com/`

- `ddbe635c9` fix(web2-supplier-wallet): #2 — /tx recompute amount theo cost so-order (chống mint ledger NCC) _(2026-06-23)_
- `d94047ab9` fix(web2-returns): over-restock khi thu*ve_1_phan trên PBH rồi cancel (returned_line_qty) *(2026-06-23)\_
- `c586e362c` fix(web2-returns): stock*applied — DELETE/approve đối xứng với create gate (regression vòng 4) *(2026-06-23)\_
- `18e89b8e9` fix(web2-wallet): audit vòng 5 — scope withdraw dedupe theo reference*type + cart qty clamp *(2026-06-23)\_
- `dc446c8f7` fix(web2-returns): audit vòng 4 — chặn huỷ phiếu đã consumed + ngừng bơm tồn ảo khi return native chưa có PBH _(2026-06-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-105516-e2d9dce` cho Claude walk chain theo CLAUDE.md protocol.
