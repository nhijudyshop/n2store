# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-101630-10086d1`
**Session file**: [`./20260616-101630-10086d1.md`](../20260616-101630-10086d1.md)
**Commit**: `10086d1` — refactor(web1⊥web2): gỡ /api/v2/customers/:id/orders đọc web2Db (coupling cuối) — độc lập hoàn toàn
**Last updated**: 2026-06-16 10:16:30 +07
**Summary**: refactor(web1⊥web2): gỡ /api/v2/customers/:id/orders đọc web2Db (coupling cuối) — độc lập hoàn toàn

## Files changed in this commit (`scripts/`)

- `scripts/pbh-qa-test.js`

## Last 5 commits touching `scripts/`

- `10086d1e3` refactor(web1⊥web2): gỡ /api/v2/customers/:id/orders đọc web2Db (coupling cuối) — độc lập hoàn toàn _(2026-06-16)_
- `274721baf` chore: gỡ HẲN autofb.pro khỏi toàn project (shop không xài nữa) _(2026-06-16)_
- `603a57073` fix(live-chat): comment livestream về 2 trang Live — relay join per-page pages:{id} + UI chọn trang _(2026-06-15)_
- `43ba24d53` feat(web2): gộp services-dashboard + admin-sse-monitor → trang Cấu hình & Hệ thống _(2026-06-14)_
- `707692b9a` test(wallet): chạy DB test thật (embedded-postgres) 29/29 PASS + ASCII migration _(2026-06-11)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-101630-10086d1` cho Claude walk chain theo CLAUDE.md protocol.
