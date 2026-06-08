# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260608-122649-e512f88`
**Session file**: [`./20260608-122649-e512f88.md`](../20260608-122649-e512f88.md)
**Commit**: `e512f88` — refactor(web2): quét sạch chữ 'tpos' trong Web 2.0 (identifiers/UI/comments)
**Last updated**: 2026-06-08 12:26:49 +07
**Summary**: refactor(web2): quét sạch chữ 'tpos' trong Web 2.0 (identifiers/UI/comments)

## Files changed in this commit (`render.com/`)

- `render.com/routes/native-orders.js`
- `render.com/services/web2-order-customer-service.js`

## Last 5 commits touching `render.com/`

- `e512f88df` refactor(web2): quét sạch chữ 'tpos' trong Web 2.0 (identifiers/UI/comments) _(2026-06-08)_
- `82a132258` fix(web2): QR ví KH lấy customer*id từ kho warehouse (bỏ TPOS fallback) *(2026-06-08)\_
- `6922ce2c6` feat(web2): backfill fb*id↔phone từ Web1 customers → warehouse + live-chat enrich SĐT/địa chỉ *(2026-06-08)\_
- `183e77110` refactor(web2): xóa hẳn live-campaign (page + route + sidebar + worker) _(2026-06-08)_
- `6d4176db9` feat(web2): admin endpoint import KH TPOS Partner → warehouse web2*customers (dedupe phone) *(2026-06-08)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260608-122649-e512f88` cho Claude walk chain theo CLAUDE.md protocol.
