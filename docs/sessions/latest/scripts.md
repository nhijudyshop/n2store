# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260603-183413-826c87c`
**Session file**: [`./20260603-183413-826c87c.md`](../20260603-183413-826c87c.md)
**Commit**: `826c87c` — feat(web2): Phase 6 CUTOVER — flip 26 route web2 + webhook + crons sang web2Db (Web 1.0 không đụng)
**Last updated**: 2026-06-03 18:34:13 +07
**Summary**: feat(web2): Phase 6 CUTOVER — flip 26 route web2 + webhook + crons sang web2Db (Web 1.0 không đụng)

## Files changed in this commit (`scripts/`)

- `scripts/auto-publish-extension.sh`
- `scripts/cws-get-refresh-token.js`
- `scripts/migrate-firestore-web2-rename.html`

## Last 5 commits touching `scripts/`

- `826c87c70` feat(web2): Phase 6 CUTOVER — flip 26 route web2 + webhook + crons sang web2Db (Web 1.0 không đụng) _(2026-06-03)_
- `b2e8d4c20` chore(web2): xóa trang sale-online-facebook + dừng cron sync 15min _(2026-06-01)_
- `a92e02dd1` chore(web2): xóa 57 trang TPOS-clone stub không dùng + dọn sidebar/nav _(2026-06-01)_
- `bbd9d4315` chore(inventory-tracking): script backup dữ liệu qua API, đặt tên theo ngày-giờ _(2026-05-31)_
- `aa7227a81` feat(scripts): pancake livestream comment-count booster _(2026-05-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260603-183413-826c87c` cho Claude walk chain theo CLAUDE.md protocol.
