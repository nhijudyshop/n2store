# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260529-160218-200fb3f`
**Session file**: [`./20260529-160218-200fb3f.md`](../20260529-160218-200fb3f.md)
**Commit**: `200fb3f` — feat(so-order): Receive modal show "đã nhận N / còn M chờ" per row
**Last updated**: 2026-05-29 16:02:18 +07
**Summary**: feat(so-order): Receive modal show "đã nhận N / còn M chờ" per row

## Files changed in this commit (`web2/`)

- `web2/products/js/web2-products-app.js`

## Last 5 commits touching `web2/`

- `200fb3f3c` feat(so-order): Receive modal show "đã nhận N / còn M chờ" per row _(2026-05-29)_
- `741ac9218` auto: session update _(2026-05-29)_
- `32bbd71f4` refactor(web2): P2 audit fix — remove 4 Firestore onSnapshot listeners _(2026-05-29)_
- `13807da2d` chore(web2): P1 audit fix — bump 72 trang stale cache page-shell.js v=20260519j → v=20260529a _(2026-05-29)_
- `4662e6833` feat(web2/live-campaign): modal tạo/sửa campaign giống TPOS — page picker + live video cascade + Config dropdown _(2026-05-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260529-160218-200fb3f` cho Claude walk chain theo CLAUDE.md protocol.
