# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-100104-b968047`
**Session file**: [`./20260521-100104-b968047.md`](../20260521-100104-b968047.md)
**Commit**: `b968047` — docs(web2-products): dev-log entry cho migration 078 backfill + force-sync GIÀY ĐEN
**Last updated**: 2026-05-21 10:01:04 +07
**Summary**: docs(web2-products): dev-log entry cho migration 078 backfill + force-sync GIÀY ĐEN

## Files changed in this commit (`scripts/`)

- `scripts/restore-login-session.js`
- `scripts/save-login-session.js`

## Last 5 commits touching `scripts/`

- `243383d0` fix(purchase-orders): paste image lớn không bị lỗi nữa + persistent session restore + debug-via-console rule _(2026-05-21)_
- `f97ef682` auto: session update _(2026-05-21)_
- `ac49c9e4` feat(domain): setup nhijudy.store DNS via GoDaddy API + update OG URLs _(2026-05-20)_
- `4b338d24` feat(so-order): bảng giống native-orders — font Segoe UI + header bg + button action màu _(2026-05-18)_
- `ba75d7a3` feat(scripts): seeder fake demo data cho Web 2.0 _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-100104-b968047` cho Claude walk chain theo CLAUDE.md protocol.
