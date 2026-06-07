# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-151114-55e73dc`
**Session file**: [`./20260607-151114-55e73dc.md`](../20260607-151114-55e73dc.md)
**Commit**: `55e73dc` — auto: session update
**Last updated**: 2026-06-07 15:11:14 +07
**Summary**: auto: session update

## Files changed in this commit (`render.com/`)

- `render.com/server.js`

## Last 5 commits touching `render.com/`

- `7781a27a3` chore(web2): tắt hẳn web2-sync-worker (TPOS shadow không dùng) + native-orders ĐVVC dùng deliveryzone/hardcode _(2026-06-07)_
- `d8950e49b` feat(web2): gate auto-gán SePay — chỉ cộng ví khi KH có đơn active _(2026-06-07)_
- `a95df243c` auto: session update _(2026-06-07)_
- `8f4792a74` fix(admin): web2-all giữ web2*order_customers + KHÔNG truncate web2_records (chứa 92k partner-customer + TPOS shadow); bỏ CASCADE *(2026-06-07)\_
- `588ce3cf8` auto: session update _(2026-06-07)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-151114-55e73dc` cho Claude walk chain theo CLAUDE.md protocol.
