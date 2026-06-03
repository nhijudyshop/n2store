# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260603-184833-8701861`
**Session file**: [`./20260603-184833-8701861.md`](../20260603-184833-8701861.md)
**Commit**: `8701861` — docs(web2): overview thêm section #conventions (quy ước Web 2.0 canonical cho code mới) + CLAUDE.md pointer
**Last updated**: 2026-06-03 18:48:33 +07
**Summary**: docs(web2): overview thêm section #conventions (quy ước Web 2.0 canonical cho code mới) + CLAUDE.md pointer

## Files changed in this commit (`web2/`)

- `web2/overview/index.html`
- `web2/smart-match/index.html`

## Last 5 commits touching `web2/`

- `87018611e` docs(web2): overview thêm section #conventions (quy ước Web 2.0 canonical cho code mới) + CLAUDE.md pointer _(2026-06-03)_
- `9bda96b93` fix(web2): re-check cutover — web2-customer-tpos ghi web2Db (không ghi Web 1.0 customers) + smart-match link → /api/web2/balance-history PATCH _(2026-06-03)_
- `9fbe91498` docs(web2): Phase 6 cutover VERIFIED — overview + dev-log (web2 trên web2Db, Web 1.0 untouched) _(2026-06-03)_
- `b57befb0e` docs(web2): overview — cập nhật DB (n2store-web2-db) + router /api/web2/\* namespace + Firebase web2\_ _(2026-06-03)_
- `af4767e14` feat(web2): Phase 3 namespace — dual-mount /api/web2/<entity> + frontend đổi /api/v2/_ piggyback → /api/web2/_ (notifications,audit-log,kpi,dashboard,smart-match,supplier-360,supplier-aging,inventory-forecast,cart) _(2026-06-03)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260603-184833-8701861` cho Claude walk chain theo CLAUDE.md protocol.
