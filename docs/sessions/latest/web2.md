# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260603-183758-9fbe914`
**Session file**: [`./20260603-183758-9fbe914.md`](../20260603-183758-9fbe914.md)
**Commit**: `9fbe914` — docs(web2): Phase 6 cutover VERIFIED — overview + dev-log (web2 trên web2Db, Web 1.0 untouched)
**Last updated**: 2026-06-03 18:37:58 +07
**Summary**: docs(web2): Phase 6 cutover VERIFIED — overview + dev-log (web2 trên web2Db, Web 1.0 untouched)

## Files changed in this commit (`web2/`)

- `web2/overview/index.html`

## Last 5 commits touching `web2/`

- `9fbe91498` docs(web2): Phase 6 cutover VERIFIED — overview + dev-log (web2 trên web2Db, Web 1.0 untouched) _(2026-06-03)_
- `b57befb0e` docs(web2): overview — cập nhật DB (n2store-web2-db) + router /api/web2/\* namespace + Firebase web2\_ _(2026-06-03)_
- `af4767e14` feat(web2): Phase 3 namespace — dual-mount /api/web2/<entity> + frontend đổi /api/v2/_ piggyback → /api/web2/_ (notifications,audit-log,kpi,dashboard,smart-match,supplier-360,supplier-aging,inventory-forecast,cart) _(2026-06-03)_
- `030c1815e` feat(web2): Phase 2b — endpoint web2 customers/by-phone/:phone/orders (customer-wallet bỏ /api/v2/customers Web 1.0) _(2026-06-03)_
- `470bad1bd` chore(web2): xóa 15 dead file Web 1.0 (balance-history 13 + customer-wallet legacy 2) — tránh nhầm _(2026-06-03)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260603-183758-9fbe914` cho Claude walk chain theo CLAUDE.md protocol.
