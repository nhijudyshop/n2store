# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-125215-1f56a64`
**Session file**: [`./20260629-125215-1f56a64.md`](../20260629-125215-1f56a64.md)
**Commit**: `1f56a64` — docs(web2): KB cách vận hành mã SP & per-unit QR (mint→so-order→Kho SP→unit-scan)
**Last updated**: 2026-06-29 12:52:15 +07
**Summary**: Mint theo SL kho (SP-001..SP-N lúc tạo SP) + gán seq nhỏ nhất/tái dùng freed + KB mã SP; verified online

## Files changed in this commit (`render.com/`)

- `render.com/routes/web2-product-units.js`
- `render.com/routes/web2-products.js`

## Last 5 commits touching `render.com/`

- `668550f86` feat(units): mint theo SL kho (SP-001..SP-SL) lúc tạo SP + gán seq nhỏ nhất / tái dùng freed _(2026-06-29)_
- `038a74651` fix(units): thêm lib/web2-shelf-stt thiếu (routes require → tránh crash web2-api) + dev-log _(2026-06-29)_
- `fd8f3eb92` auto: session update _(2026-06-29)_
- `8c1a9c556` feat(goods-weight): trang Cân Nặng Hàng ⚖️ — hàng về kiện cân + ảnh BYTEA + SSE web2:goods-weight _(2026-06-29)_
- `bc8640b9f` feat(clearance): admin-only chuyển SP rớt xả ↔ kho chính (gate POST /:id/clearance + ẩn nút non-admin) _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-125215-1f56a64` cho Claude walk chain theo CLAUDE.md protocol.
