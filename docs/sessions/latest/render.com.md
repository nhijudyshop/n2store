# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260603-162445-7305973`
**Session file**: [`./20260603-162445-7305973.md`](../20260603-162445-7305973.md)
**Commit**: `7305973` — docs(web2): chốt quyết định tách DB (wipe OK, bỏ Phase 3) + tiến độ + inventory cutover route
**Last updated**: 2026-06-03 16:24:45 +07
**Summary**: docs(web2): chốt quyết định tách DB (wipe OK, bỏ Phase 3) + tiến độ + inventory cutover route

## Files changed in this commit (`render.com/`)

- `render.com/db/web2-customers-schema.js`
- `render.com/db/web2-pool.js`
- `render.com/routes/v2/web2-customers.js`
- `render.com/server.js`
- `render.com/services/tpos-customer-service.js`

## Last 5 commits touching `render.com/`

- `050f29fcc` feat(web2): Phase 1 tách DB — web2*customers (kho KH riêng web2Db) thay /api/v2/customers Web 1.0 *(2026-06-03)\_
- `3f2264afb` refactor(balance-history): bỏ coupling Web 1.0 — dùng web2-content-parser cho extraction*preview thay legacy extractPhoneFromContent *(2026-06-03)\_
- `2e631900c` feat(balance-history): audit log cho prelink*credit + script rà soát rủi ro gán nhầm KH (clone Web 1.0) *(2026-06-03)\_
- `7ac1a6994` fix(balance-history): search 500 — cast sepay*id::text ILIKE (clone Web 1.0 type mismatch) *(2026-06-03)\_
- `b85fc91e6` feat(tpos-pancake): kho Hình Livestream — chụp iframe thủ công + sidebar gallery filter campaign _(2026-06-02)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260603-162445-7305973` cho Claude walk chain theo CLAUDE.md protocol.
