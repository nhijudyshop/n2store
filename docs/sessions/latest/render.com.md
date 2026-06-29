# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-141219-8711499`
**Session file**: [`./20260629-141219-8711499.md`](../20260629-141219-8711499.md)
**Commit**: `8711499` — fix(order-tags): TAG "Có ghi chú đơn" chỉ tính userNote, bỏ note=log comment auto
**Last updated**: 2026-06-29 14:12:19 +07
**Summary**: fix order-tags: Có ghi chú đơn chỉ tính userNote

## Files changed in this commit (`render.com/`)

- `render.com/services/web2-order-tags-service.js`

## Last 5 commits touching `render.com/`

- `87114993a` fix(order-tags): TAG "Có ghi chú đơn" chỉ tính userNote, bỏ note=log comment auto _(2026-06-29)_
- `668550f86` feat(units): mint theo SL kho (SP-001..SP-SL) lúc tạo SP + gán seq nhỏ nhất / tái dùng freed _(2026-06-29)_
- `038a74651` fix(units): thêm lib/web2-shelf-stt thiếu (routes require → tránh crash web2-api) + dev-log _(2026-06-29)_
- `fd8f3eb92` auto: session update _(2026-06-29)_
- `8c1a9c556` feat(goods-weight): trang Cân Nặng Hàng ⚖️ — hàng về kiện cân + ảnh BYTEA + SSE web2:goods-weight _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-141219-8711499` cho Claude walk chain theo CLAUDE.md protocol.
