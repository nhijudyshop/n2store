# Latest Snapshot — `soluong-live/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-124432-7fc5c03`
**Session file**: [`./20260604-124432-7fc5c03.md`](../20260604-124432-7fc5c03.md)
**Commit**: `7fc5c03` — feat(soluong-live): resize ảnh proxy (WebP thumbnail) + đổi ảnh đẩy lên TPOS
**Last updated**: 2026-06-04 12:44:32 +07
**Summary**: feat(soluong-live): resize ảnh proxy (WebP thumbnail) + đổi ảnh đẩy lên TPOS

## Files changed in this commit (`soluong-live/`)

- `soluong-live/index.html`
- `soluong-live/js/main.js`
- `soluong-live/js/soluong-list.js`
- `soluong-live/js/warehouse-realtime.js`
- `soluong-live/soluong-list.html`

## Last 5 commits touching `soluong-live/`

- `7fc5c0395` feat(soluong-live): resize ảnh proxy (WebP thumbnail) + đổi ảnh đẩy lên TPOS _(2026-06-04)_
- `5a3f23507` fix(soluong-live): imageVersion cache-bust theo nội dung ảnh (URL proxy hằng số) _(2026-06-04)_
- `386ed6c18` feat: soluong-live khớp ảnh product-warehouse (TPOS-direct) + khôi phục dropdown tìm kiếm _(2026-06-04)_
- `bbea5fb07` fix(soluong-live): biến thể không có ảnh riêng lấy ảnh sản phẩm (template) _(2026-06-04)_
- `d1ca2554e` feat(soluong-live): reconcile-on-load + refreshAll cho realtime TPOS sync _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-124432-7fc5c03` cho Claude walk chain theo CLAUDE.md protocol.
