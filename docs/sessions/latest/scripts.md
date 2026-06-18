# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260618-215204-36ed8a7`
**Session file**: [`./20260618-215204-36ed8a7.md`](../20260618-215204-36ed8a7.md)
**Commit**: `36ed8a7` — feat(web2): bản đồ code "thông minh" (codemap auto-gen) + master plan tách module toàn bộ Web 2.0
**Last updated**: 2026-06-18 21:52:04 +07
**Summary**: codemap thông minh (gen-web2-codemap) + master plan tách module toàn bộ Web 2.0 (discovery 29-agent)

## Files changed in this commit (`scripts/`)

- `scripts/gen-web2-codemap.js`

## Last 5 commits touching `scripts/`

- `36ed8a744` feat(web2): bản đồ code "thông minh" (codemap auto-gen) + master plan tách module toàn bộ Web 2.0 _(2026-06-18)_
- `6d1fc53f2` fix(web2): audit toàn bộ Web 2.0 — 16 bug (IME, race, null-deref, leak, double-submit, money display) _(2026-06-18)_
- `dadf493f6` fix(web2/fastsaleorder-invoice): nút Trả hàng crash — STATE.items→STATE.orders _(2026-06-18)_
- `307da7b15` fix(web2/so-order): mã SP theo biến thể + viết lại extractType (tìm loại giữa tên) + 8 cải tiến modal tạo đơn _(2026-06-16)_
- `10086d1e3` refactor(web1⊥web2): gỡ /api/v2/customers/:id/orders đọc web2Db (coupling cuối) — độc lập hoàn toàn _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260618-215204-36ed8a7` cho Claude walk chain theo CLAUDE.md protocol.
