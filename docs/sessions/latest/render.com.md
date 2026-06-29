# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-093352-f2dd8b3`
**Session file**: [`./20260629-093352-f2dd8b3.md`](../20260629-093352-f2dd8b3.md)
**Commit**: `f2dd8b3` — fix(v2/cart): cart drag (luồng livestream chính) hook reconcile — auto-gán unit
**Last updated**: 2026-06-29 09:33:52 +07
**Summary**: fix(v2/cart): cart drag (luồng livestream chính) hook reconcile — auto-gán unit

## Files changed in this commit (`render.com/`)

- `render.com/routes/v2/cart.js`
- `render.com/routes/web2-product-units.js`

## Last 5 commits touching `render.com/`

- `f2dd8b39e` fix(v2/cart): cart drag (luồng livestream chính) hook reconcile — auto-gán unit _(2026-06-29)_
- `9fd3316f6` feat(unit-scan): quét tem hiện số liệu live SP (Bán/KH mới/NCC/Còn/Tồn) như live-control _(2026-06-29)_
- `45b9702a9` fix(native-orders): PATCH fire reconcile khi đổi tên/SĐT KH → denorm sync triệt để _(2026-06-29)_
- `816b11d9a` feat(web2/auth): TTL phiên theo role — admin 90 ngày, user 14 ngày _(2026-06-29)_
- `80e80c426` auto: session update _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-093352-f2dd8b3` cho Claude walk chain theo CLAUDE.md protocol.
