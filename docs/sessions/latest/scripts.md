# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260601-102722-144e2ef`
**Session file**: [`./20260601-102722-144e2ef.md`](../20260601-102722-144e2ef.md)
**Commit**: `144e2ef` — auto: session update
**Last updated**: 2026-06-01 10:27:22 +07
**Summary**: auto: session update

## Files changed in this commit (`scripts/`)

- `scripts/n2store-smoke-all-pages.js`
- `scripts/web2-seed-from-tpos.js`

## Last 5 commits touching `scripts/`

- `b2e8d4c20` chore(web2): xóa trang sale-online-facebook + dừng cron sync 15min _(2026-06-01)_
- `a92e02dd1` chore(web2): xóa 57 trang TPOS-clone stub không dùng + dọn sidebar/nav _(2026-06-01)_
- `bbd9d4315` chore(inventory-tracking): script backup dữ liệu qua API, đặt tên theo ngày-giờ _(2026-05-31)_
- `aa7227a81` feat(scripts): pancake livestream comment-count booster _(2026-05-29)_
- `741ac9218` auto: session update _(2026-05-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260601-102722-144e2ef` cho Claude walk chain theo CLAUDE.md protocol.
