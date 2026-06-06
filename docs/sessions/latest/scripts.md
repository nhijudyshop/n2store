# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260606-200501-667b583`
**Session file**: [`./20260606-200501-667b583.md`](../20260606-200501-667b583.md)
**Commit**: `667b583` — auto: session update
**Last updated**: 2026-06-06 20:05:01 +07
**Summary**: auto: session update

## Files changed in this commit (`scripts/`)

- `scripts/test-ck-watcher-auto.js`
- `scripts/test-migration-web2-returns.js`

## Last 5 commits touching `scripts/`

- `667b58307` auto: session update _(2026-06-06)_
- `48c68c058` feat(web2): gán KH ở balance-history → tự nối tín hiệu CK + gửi tin báo _(2026-06-06)_
- `5346a521d` feat(web2): CK cộng ví → tự trừ vào PBH chưa trả của SĐT (đơn đã thanh toán) _(2026-06-06)_
- `8bab5f4cf` fix(web2): CK chỉ auto khi định danh khớp (tránh gửi nhầm khách) _(2026-06-06)_
- `0babf0ce2` feat(web2): CK watcher 2 chiều — xử lý cả tiền-về-trước + đã-ck-sau _(2026-06-06)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260606-200501-667b583` cho Claude walk chain theo CLAUDE.md protocol.
