# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-183600-2b8a932`
**Session file**: [`./20260605-183600-2b8a932.md`](../20260605-183600-2b8a932.md)
**Commit**: `2b8a932` — feat(web2): 5 tính năng tương tác khách — auto-reply + watcher + intent + dashboard
**Last updated**: 2026-06-05 18:36:00 +07
**Summary**: feat(web2): 5 tính năng tương tác khách — auto-reply + watcher + intent + dashboard

## Files changed in this commit (`scripts/`)

- `scripts/test-ck-features.js`

## Last 5 commits touching `scripts/`

- `2b8a932e8` feat(web2): 5 tính năng tương tác khách — auto-reply + watcher + intent + dashboard _(2026-06-05)_
- `35deb9b4b` feat(web2): đối chiếu & duyệt CK xuyên 3 trang — component dùng chung web2-ck-review _(2026-06-05)_
- `661e80a1c` auto: session update _(2026-06-05)_
- `0bb4c2845` feat(web2): unread reconcile — fix row chưa đọc kẹt sau khi đã đọc trên Pancake _(2026-06-05)_
- `272ce994e` feat(web2 pancake): auto-login refresh token — harvester + server-side request flow _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-183600-2b8a932` cho Claude walk chain theo CLAUDE.md protocol.
