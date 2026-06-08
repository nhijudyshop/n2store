# Latest Snapshot — `shared/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260608-144824-35d01e7`
**Session file**: [`./20260608-144824-35d01e7.md`](../20260608-144824-35d01e7.md)
**Commit**: `35d01e7` — auto: session update
**Last updated**: 2026-06-08 14:48:24 +07
**Summary**: auto: session update

## Files changed in this commit (`shared/`)

- `shared/js/warehouse-api.js`

## Last 5 commits touching `shared/`

- `f280aa99a` feat(soluong-live): nut 🔄 TPOS per-product - ep sync TPOS roi re-import (bien the/gia/ten/ma/anh, giu soldQty) _(2026-06-08)_
- `2c22ee033` fix(issue-tracking): don Khach Gui luon cong cong no vao vi + tach lich su 2 buoc _(2026-06-06)_
- `d59cf73ba` fix(cloudflare CORS): allow header X-Web2-Token - sau khi dang nhap Web2.0 client gui x-web2-token bi CORS preflight chan -> moi API web2 fail. Them 1 header, khong dung logic trang khac _(2026-06-05)_
- `5a3f23507` fix(soluong-live): imageVersion cache-bust theo nội dung ảnh (URL proxy hằng số) _(2026-06-04)_
- `7bab6d9ec` fix(issue-tracking): refund PUT consistency - zero giảm giá order-level khi bake giá vào PriceUnit _(2026-06-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260608-144824-35d01e7` cho Claude walk chain theo CLAUDE.md protocol.
