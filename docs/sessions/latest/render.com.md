# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260603-184833-8701861`
**Session file**: [`./20260603-184833-8701861.md`](../20260603-184833-8701861.md)
**Commit**: `8701861` — docs(web2): overview thêm section #conventions (quy ước Web 2.0 canonical cho code mới) + CLAUDE.md pointer
**Last updated**: 2026-06-03 18:48:33 +07
**Summary**: docs(web2): overview thêm section #conventions (quy ước Web 2.0 canonical cho code mới) + CLAUDE.md pointer

## Files changed in this commit (`render.com/`)

- `render.com/routes/v2/web2-customer-tpos.js`

## Last 5 commits touching `render.com/`

- `9bda96b93` fix(web2): re-check cutover — web2-customer-tpos ghi web2Db (không ghi Web 1.0 customers) + smart-match link → /api/web2/balance-history PATCH _(2026-06-03)_
- `826c87c70` feat(web2): Phase 6 CUTOVER — flip 26 route web2 + webhook + crons sang web2Db (Web 1.0 không đụng) _(2026-06-03)_
- `2f1541042` fix(web2): mirror handle GENERATED column (customers fts) + data-copy skip generated; bỏ fast*sale_order_lines (không tồn tại) *(2026-06-03)\_
- `000a0d010` feat(web2): Phase 6 — mở rộng mirror list (mọi bảng web2 đụng + copy riêng customers/balance*history/campaigns ở web2Db, Web 1.0 không đụng) *(2026-06-03)\_
- `c1fa9ba8c` feat(web2): Phase 6 prep — bump-sequences endpoint (+10000 chống collision gap rows khi cutover) _(2026-06-03)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260603-184833-8701861` cho Claude walk chain theo CLAUDE.md protocol.
