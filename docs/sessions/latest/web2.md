# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260609-184840-74c08f8`
**Session file**: [`./20260609-184840-74c08f8.md`](../20260609-184840-74c08f8.md)
**Commit**: `74c08f8` — feat(web2-customers): 1 KH thêm nhiều SĐT (alt_phones) — modal chips + persist create/PATCH
**Last updated**: 2026-06-09 18:48:40 +07
**Summary**: feat(web2-customers): 1 KH thêm nhiều SĐT (alt_phones) — modal chips + persist create/PATCH

## Files changed in this commit (`web2/`)

- `web2/customers/css/customers.css`

## Last 5 commits touching `web2/`

- `74c08f8e4` feat(web2-customers): 1 KH thêm nhiều SĐT (alt*phones) — modal chips + persist create/PATCH *(2026-06-09)\_
- `f1b685c61` auto: session update _(2026-06-09)_
- `c9d643e9c` auto: session update _(2026-06-09)_
- `28010116d` feat(web2): tem SP — biến thể bake vào giữa QR (Web2QR.centerLabel), đồng bộ bill _(2026-06-09)_
- `602a658e3` feat(web2-kpi): tách Dự báo(draft)/Thực(confirmed) theo status + KPI strip trên native-orders (scope admin/staff) _(2026-06-09)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260609-184840-74c08f8` cho Claude walk chain theo CLAUDE.md protocol.
