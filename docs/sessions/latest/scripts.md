# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-132913-307da7b`
**Session file**: [`./20260616-132913-307da7b.md`](../20260616-132913-307da7b.md)
**Commit**: `307da7b` — fix(web2/so-order): mã SP theo biến thể + viết lại extractType (tìm loại giữa tên) + 8 cải tiến modal tạo đơn
**Last updated**: 2026-06-16 13:29:13 +07
**Summary**: fix(web2/so-order): mã SP theo biến thể + viết lại extractType (tìm loại giữa tên) + 8 cải tiến mo...

## Files changed in this commit (`scripts/`)

- `scripts/test-web2-product-code.js`

## Last 5 commits touching `scripts/`

- `307da7b15` fix(web2/so-order): mã SP theo biến thể + viết lại extractType (tìm loại giữa tên) + 8 cải tiến modal tạo đơn _(2026-06-16)_
- `10086d1e3` refactor(web1⊥web2): gỡ /api/v2/customers/:id/orders đọc web2Db (coupling cuối) — độc lập hoàn toàn _(2026-06-16)_
- `274721baf` chore: gỡ HẲN autofb.pro khỏi toàn project (shop không xài nữa) _(2026-06-16)_
- `603a57073` fix(live-chat): comment livestream về 2 trang Live — relay join per-page pages:{id} + UI chọn trang _(2026-06-15)_
- `43ba24d53` feat(web2): gộp services-dashboard + admin-sse-monitor → trang Cấu hình & Hệ thống _(2026-06-14)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-132913-307da7b` cho Claude walk chain theo CLAUDE.md protocol.
