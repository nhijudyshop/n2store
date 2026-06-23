# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260623-113734-7e5db29`
**Session file**: [`./20260623-113734-7e5db29.md`](../20260623-113734-7e5db29.md)
**Commit**: `7e5db29` — docs(dev-log): quick-refund cost-cap sync verified live (đóng nốt #2 trên cả 2 đường hoàn NCC)
**Last updated**: 2026-06-23 11:37:34 +07
**Summary**: quick-refund đồng bộ cost-cap so-order (#2 đóng nốt) — verified live; COD khách giữ nhập tay

## Files changed in this commit (`render.com/`)

- `render.com/routes/purchase-refund.js`

## Last 5 commits touching `render.com/`

- `45530fad2` fix(purchase-refund): quick-refund cap amount theo cost so-order (đồng bộ /tx #2) _(2026-06-23)_
- `ddbe635c9` fix(web2-supplier-wallet): #2 — /tx recompute amount theo cost so-order (chống mint ledger NCC) _(2026-06-23)_
- `d94047ab9` fix(web2-returns): over-restock khi thu*ve_1_phan trên PBH rồi cancel (returned_line_qty) *(2026-06-23)\_
- `c586e362c` fix(web2-returns): stock*applied — DELETE/approve đối xứng với create gate (regression vòng 4) *(2026-06-23)\_
- `18e89b8e9` fix(web2-wallet): audit vòng 5 — scope withdraw dedupe theo reference*type + cart qty clamp *(2026-06-23)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260623-113734-7e5db29` cho Claude walk chain theo CLAUDE.md protocol.
