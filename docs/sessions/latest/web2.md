# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260609-105507-826cd35`
**Session file**: [`./20260609-105507-826cd35.md`](../20260609-105507-826cd35.md)
**Commit**: `826cd35` — docs(dev-log): auto-gan balance-history (20 GD) + chien dich cha native-orders
**Last updated**: 2026-06-09 10:55:07 +07
**Summary**: docs(dev-log): auto-gan balance-history (20 GD) + chien dich cha native-orders

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/balance-history/js/web2-balance-history-app.js`

## Last 5 commits touching `web2/`

- `c314c71ce` feat(web2): balance-history nut 'Tu dong gan' GD chua gan vao KH (khop duoi SDT + ten nguoi gui) _(2026-06-09)_
- `b0f1f06c1` feat(web2): balance-history tu cap nhat khi co GD moi (SSE web2:balance-history, khoi F5) _(2026-06-08)_
- `676c63b1b` fix(web2): modal gan KH balance-history bo text TPOS/91K/OData -> kho Web 2.0 _(2026-06-08)_
- `18438ca6b` chore(web2): bump balance-history script versions (bust cache -> code da sach tpos) _(2026-06-08)_
- `0dbf4fdb7` refactor(web2): chuyen 'Lay comment Live' xuong menu Cau hinh; bo campaign-cha khoi settings (chuyen vao live-chat) _(2026-06-08)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260609-105507-826cd35` cho Claude walk chain theo CLAUDE.md protocol.
