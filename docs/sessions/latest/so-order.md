# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260626-153500-f17cf53`
**Session file**: [`./20260626-153500-f17cf53.md`](../20260626-153500-f17cf53.md)
**Commit**: `f17cf53` — docs(dev-log): system UI + flow audit + 5 fixes (2026-06-26)
**Last updated**: 2026-06-26 15:35:00 +07
**Summary**: System UI (modal/AI widget) + audit 19-agent luồng (12 bug) + fix 5 (report merge/refunds KPI, nhận hàng NCC, hủy PBH restock); defer 6 money/stock

## Files changed in this commit (`so-order/`)

- `so-order/index.html`
- `so-order/js/so-order-receive.js`

## Last 5 commits touching `so-order/`

- `52f5e4b5a` fix(web2 flow): nhận hàng đúng NCC (#1/#8) + hủy PBH restock per-code (#9) + audit doc _(2026-06-26)_
- `556aa7965` refactor(web2-variant-picker): genName dùng toLocaleUpperCase('vi-VN') (defensive) _(2026-06-26)_
- `bb894ec87` feat(so-order): tự tạo TÊN SP từ biến thể đã chọn (sửa được) _(2026-06-26)_
- `246e72c6d` feat(so-order): Phase 3b — modal Tạo/Sửa đơn dùng Web2VariantPicker _(2026-06-26)_
- `cdacedc07` fix(so-order): cột Biến Thể zip loại↔biến thể theo món — 'Áo Trắng, Quần Đen' _(2026-06-26)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260626-153500-f17cf53` cho Claude walk chain theo CLAUDE.md protocol.
