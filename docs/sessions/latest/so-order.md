# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-131443-4df262c`
**Session file**: [`./20260629-131443-4df262c.md`](../20260629-131443-4df262c.md)
**Commit**: `4df262c` — refactor(web2): module CHUNG Web2ProductUnits — client duy nhất /api/web2-product-units/_
**Last updated**: 2026-06-29 13:14:43 +07
**Summary**: Audit mã SP web2 → tạo module chung Web2ProductUnits (client duy nhất /api/web2-product-units/_), adopt 4 file, verified browser

## Files changed in this commit (`so-order/`)

- `so-order/index.html`
- `so-order/js/so-order-barcode.js`

## Last 5 commits touching `so-order/`

- `4df262c83` refactor(web2): module CHUNG Web2ProductUnits — client duy nhất /api/web2-product-units/\* _(2026-06-29)_
- `668550f86` feat(units): mint theo SL kho (SP-001..SP-SL) lúc tạo SP + gán seq nhỏ nhất / tái dùng freed _(2026-06-29)_
- `78dd026c1` feat(unit-scan): danh sách TẤT CẢ tem của SP (ẩn/bật, mỗi tem→STT) + QR tem TO HƠN _(2026-06-29)_
- `8c1a9c556` feat(goods-weight): trang Cân Nặng Hàng ⚖️ — hàng về kiện cân + ảnh BYTEA + SSE web2:goods-weight _(2026-06-29)_
- `b5afc142f` fix(web2/ai-assistant): lỗi provider chứa "token" bị nhầm là phiên hết hạn → đăng xuất oan _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-131443-4df262c` cho Claude walk chain theo CLAUDE.md protocol.
