# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-094947-a3e1452`
**Session file**: [`./20260604-094947-a3e1452.md`](../20260604-094947-a3e1452.md)
**Commit**: `a3e1452` — auto: session update
**Last updated**: 2026-06-04 09:49:47 +07
**Summary**: auto: session update

## Files changed in this commit (`scripts/`)

- `scripts/web2-verify-data-load.js`

## Last 5 commits touching `scripts/`

- `cd029da6d` fix(web2): generic /api/web2 route shadow dedicated → data 3 trang load lại _(2026-06-04)_
- `826c87c70` feat(web2): Phase 6 CUTOVER — flip 26 route web2 + webhook + crons sang web2Db (Web 1.0 không đụng) _(2026-06-03)_
- `b2e8d4c20` chore(web2): xóa trang sale-online-facebook + dừng cron sync 15min _(2026-06-01)_
- `a92e02dd1` chore(web2): xóa 57 trang TPOS-clone stub không dùng + dọn sidebar/nav _(2026-06-01)_
- `bbd9d4315` chore(inventory-tracking): script backup dữ liệu qua API, đặt tên theo ngày-giờ _(2026-05-31)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-094947-a3e1452` cho Claude walk chain theo CLAUDE.md protocol.
