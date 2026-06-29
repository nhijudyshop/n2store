# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-140045-e707261`
**Session file**: [`./20260629-140045-e707261.md`](../20260629-140045-e707261.md)
**Commit**: `e707261` — feat(print): tem QR sát lề trái + biến thể/giá lên đỉnh → chừa khoảng trống ghi bút
**Last updated**: 2026-06-29 14:00:45 +07
**Summary**: Tem QR: QR sát lề trái + biến thể/giá lên đỉnh → chừa khoảng trống 41px ghi bút tay

## Files changed in this commit (`web2/`)

- `web2/products/index.html`
- `web2/products/js/web2-products-print-render.js`
- `web2/unit-scan/index.html`

## Last 5 commits touching `web2/`

- `e70726129` feat(print): tem QR sát lề trái + biến thể/giá lên đỉnh → chừa khoảng trống ghi bút _(2026-06-29)_
- `4df262c83` refactor(web2): module CHUNG Web2ProductUnits — client duy nhất /api/web2-product-units/\* _(2026-06-29)_
- `668550f86` feat(units): mint theo SL kho (SP-001..SP-SL) lúc tạo SP + gán seq nhỏ nhất / tái dùng freed _(2026-06-29)_
- `343ba2e48` fix(goods-weight): hết tràn ngang mobile — number input co được trong grid (min-width:0 + width:100%) _(2026-06-29)_
- `78dd026c1` feat(unit-scan): danh sách TẤT CẢ tem của SP (ẩn/bật, mỗi tem→STT) + QR tem TO HƠN _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-140045-e707261` cho Claude walk chain theo CLAUDE.md protocol.
