# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-131443-4df262c`
**Session file**: [`./20260629-131443-4df262c.md`](../20260629-131443-4df262c.md)
**Commit**: `4df262c` — refactor(web2): module CHUNG Web2ProductUnits — client duy nhất /api/web2-product-units/_
**Last updated**: 2026-06-29 13:14:43 +07
**Summary**: Audit mã SP web2 → tạo module chung Web2ProductUnits (client duy nhất /api/web2-product-units/_), adopt 4 file, verified browser

## Files changed in this commit (`web2/`)

- `web2/products/index.html`
- `web2/products/js/web2-products-render.js`
- `web2/shared/web2-product-units.js`
- `web2/shared/web2-unit-reprint.js`
- `web2/system/data/web2-modules.json`
- `web2/unit-scan/index.html`
- `web2/unit-scan/js/unit-scan.js`

## Last 5 commits touching `web2/`

- `4df262c83` refactor(web2): module CHUNG Web2ProductUnits — client duy nhất /api/web2-product-units/\* _(2026-06-29)_
- `668550f86` feat(units): mint theo SL kho (SP-001..SP-SL) lúc tạo SP + gán seq nhỏ nhất / tái dùng freed _(2026-06-29)_
- `343ba2e48` fix(goods-weight): hết tràn ngang mobile — number input co được trong grid (min-width:0 + width:100%) _(2026-06-29)_
- `78dd026c1` feat(unit-scan): danh sách TẤT CẢ tem của SP (ẩn/bật, mỗi tem→STT) + QR tem TO HƠN _(2026-06-29)_
- `968eadd74` feat(goods-weight): rebuild MOBILE-NATIVE theo unit-scan (no sidebar, PWA, safe-area, Zalo tokens) _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-131443-4df262c` cho Claude walk chain theo CLAUDE.md protocol.
