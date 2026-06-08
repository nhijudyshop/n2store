# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260608-110841-6922ce2`
**Session file**: [`./20260608-110841-6922ce2.md`](../20260608-110841-6922ce2.md)
**Commit**: `6922ce2` — feat(web2): backfill fb_id↔phone từ Web1 customers → warehouse + live-chat enrich SĐT/địa chỉ
**Last updated**: 2026-06-08 11:08:41 +07
**Summary**: feat(web2): backfill fb_id↔phone từ Web1 customers → warehouse + live-chat enrich SĐT/địa chỉ

## Files changed in this commit (`render.com/`)

- `render.com/routes/admin-web2-import-fb-links.js`
- `render.com/routes/v2/web2-customers.js`
- `render.com/server.js`

## Last 5 commits touching `render.com/`

- `6922ce2c6` feat(web2): backfill fb*id↔phone từ Web1 customers → warehouse + live-chat enrich SĐT/địa chỉ *(2026-06-08)\_
- `183e77110` refactor(web2): xóa hẳn live-campaign (page + route + sidebar + worker) _(2026-06-08)_
- `6d4176db9` feat(web2): admin endpoint import KH TPOS Partner → warehouse web2*customers (dedupe phone) *(2026-06-08)\_
- `74ead861c` refactor(web2): bỏ partner-customer (TPOS live) + repoint balance-history/customer-wallet sang warehouse _(2026-06-08)_
- `395016ee9` refactor(web2): bỏ TPOS API khỏi native-orders + xóa web2-customer-tpos route _(2026-06-08)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260608-110841-6922ce2` cho Claude walk chain theo CLAUDE.md protocol.
