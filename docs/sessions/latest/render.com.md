# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-163740-0c0870b`
**Session file**: [`./20260616-163740-0c0870b.md`](../20260616-163740-0c0870b.md)
**Commit**: `0c0870b` — feat(so-order/kho): Part B — Kho SP lưu origin_currency/origin_rate, hover hiện giá gốc ngoại tệ (CNY); write paths gửi origin lúc nhập
**Last updated**: 2026-06-16 16:37:40 +07
**Summary**: feat(so-order/kho): Part B — Kho SP lưu origin_currency/origin_rate, hover hiện giá gốc ngoại tệ (CNY); w...

## Files changed in this commit (`render.com/`)

- `render.com/routes/web2-products.js`

## Last 5 commits touching `render.com/`

- `3d2106113` auto: session update _(2026-06-16)_
- `a56d9d55c` fix(render): pending*customers sai múi giờ -7h — server emit ISO-UTC (strip báo trễ 7h) *(2026-06-16)\_
- `e39b3b51f` feat(web2/live-chat): POST /snapshots/purge (scope today _(all) + client clear-cache on purge|2026-06-16)_
- `0df1cd9bf` fix(web2/live-chat): reconcileFullText truyền customer*id (UUID) → vá comment dài cắt '...' *(2026-06-16)\_
- `07b759ab7` feat(web2-jt): tìm đơn theo tên KH + SĐT (thêm src*message vào /list search) *(2026-06-16)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-163740-0c0870b` cho Claude walk chain theo CLAUDE.md protocol.
