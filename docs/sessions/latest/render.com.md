# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260601-135850-cbc4e8c`
**Session file**: [`./20260601-135850-cbc4e8c.md`](../20260601-135850-cbc4e8c.md)
**Commit**: `cbc4e8c` — fix(native-orders): customer hover popover overlap bug + TPOS-live address
**Last updated**: 2026-06-01 13:58:50 +07
**Summary**: fix(native-orders): customer hover popover overlap bug + TPOS-live address

## Files changed in this commit (`render.com/`)

- `render.com/routes/v2/web2-customer-tpos.js`
- `render.com/server.js`

## Last 5 commits touching `render.com/`

- `cbc4e8cd5` fix(native-orders): customer hover popover overlap bug + TPOS-live address _(2026-06-01)_
- `206b6289a` feat(web2): decouple Web 2.0 ↔ Web 1.0/TPOS per user decisions (Phase 11 follow-up) _(2026-06-01)_
- `749a37261` fix(orders-report,render): celebration sync cross-machine — máy khác render đúng ảnh admin upload _(2026-06-01)_
- `b2e8d4c20` chore(web2): xóa trang sale-online-facebook + dừng cron sync 15min _(2026-06-01)_
- `e4f05947b` perf(tpos-pancake): anti-lag khi kéo SP vào comment / thêm SP vào đơn _(2026-06-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260601-135850-cbc4e8c` cho Claude walk chain theo CLAUDE.md protocol.
