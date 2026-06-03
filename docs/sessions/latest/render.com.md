# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260603-165200-af4767e`
**Session file**: [`./20260603-165200-af4767e.md`](../20260603-165200-af4767e.md)
**Commit**: `af4767e` — feat(web2): Phase 3 namespace — dual-mount /api/web2/<entity> + frontend đổi /api/v2/_ piggyback → /api/web2/_ (notifications,audit-log,kpi,dashboard,smart-match,supplier-360,supplier-aging,inventory-forecast,cart)
**Last updated**: 2026-06-03 16:52:00 +07
**Summary**: feat(web2): Phase 3 namespace — dual-mount /api/web2/<entity> + frontend đổi /api/v2/_ piggyback → /api/web2/_...

## Files changed in this commit (`render.com/`)

- `render.com/routes/v2/web2-customers.js`
- `render.com/server.js`

## Last 5 commits touching `render.com/`

- `af4767e14` feat(web2): Phase 3 namespace — dual-mount /api/web2/<entity> + frontend đổi /api/v2/_ piggyback → /api/web2/_ (notifications,audit-log,kpi,dashboard,smart-match,supplier-360,supplier-aging,inventory-forecast,cart) _(2026-06-03)_
- `030c1815e` feat(web2): Phase 2b — endpoint web2 customers/by-phone/:phone/orders (customer-wallet bỏ /api/v2/customers Web 1.0) _(2026-06-03)_
- `050f29fcc` feat(web2): Phase 1 tách DB — web2*customers (kho KH riêng web2Db) thay /api/v2/customers Web 1.0 *(2026-06-03)\_
- `3f2264afb` refactor(balance-history): bỏ coupling Web 1.0 — dùng web2-content-parser cho extraction*preview thay legacy extractPhoneFromContent *(2026-06-03)\_
- `2e631900c` feat(balance-history): audit log cho prelink*credit + script rà soát rủi ro gán nhầm KH (clone Web 1.0) *(2026-06-03)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260603-165200-af4767e` cho Claude walk chain theo CLAUDE.md protocol.
