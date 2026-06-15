# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-003508-274721b`
**Session file**: [`./20260616-003508-274721b.md`](../20260616-003508-274721b.md)
**Commit**: `274721b` — chore: gỡ HẲN autofb.pro khỏi toàn project (shop không xài nữa)
**Last updated**: 2026-06-16 00:35:08 +07
**Summary**: chore: gỡ HẲN autofb.pro khỏi toàn project (shop không xài nữa)

## Files changed in this commit (`scripts/`)

- `scripts/autofb-login.js`
- `scripts/n2store-smoke-all-pages.js`

## Last 5 commits touching `scripts/`

- `274721baf` chore: gỡ HẲN autofb.pro khỏi toàn project (shop không xài nữa) _(2026-06-16)_
- `603a57073` fix(live-chat): comment livestream về 2 trang Live — relay join per-page pages:{id} + UI chọn trang _(2026-06-15)_
- `43ba24d53` feat(web2): gộp services-dashboard + admin-sse-monitor → trang Cấu hình & Hệ thống _(2026-06-14)_
- `707692b9a` test(wallet): chạy DB test thật (embedded-postgres) 29/29 PASS + ASCII migration _(2026-06-11)_
- `2857eee5e` fix(wallet): refund outbox + idempotency cho flow trừ/hoàn ví (Web 1.0 PROD) _(2026-06-11)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-003508-274721b` cho Claude walk chain theo CLAUDE.md protocol.
