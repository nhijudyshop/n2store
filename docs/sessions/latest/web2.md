# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260530-183912-812407a`
**Session file**: [`./20260530-183912-812407a.md`](../20260530-183912-812407a.md)
**Commit**: `812407a` — fix(web2-partner-customer): đổi icon edit từ 'square-pen' sang 'pencil'
**Last updated**: 2026-05-30 18:39:12 +07
**Summary**: fix(web2-partner-customer): đổi icon edit từ 'square-pen' sang 'pencil'

## Files changed in this commit (`web2/`)

- `web2/partner-customer/js/partner-customer-app.js`

## Last 5 commits touching `web2/`

- `812407a02` fix(web2-partner-customer): đổi icon edit từ 'square-pen' sang 'pencil' _(2026-05-30)_
- `39f86f655` refactor(web2-customer-wallet): TPOS primary source + Web 2.0 wallet overlay _(2026-05-30)_
- `e666e9a56` feat(web2): QR auto-create + partner-customer QR button + sidebar cleanup 16 pages _(2026-05-30)_
- `6f4de490e` auto: session update _(2026-05-30)_
- `fbc87093f` auto: session update _(2026-05-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260530-183912-812407a` cho Claude walk chain theo CLAUDE.md protocol.
