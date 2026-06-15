# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-194932-a6d6558`
**Session file**: [`./20260615-194932-a6d6558.md`](../20260615-194932-a6d6558.md)
**Commit**: `a6d6558` — auto: session update
**Last updated**: 2026-06-15 19:49:32 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `a6d65585e` auto: session update _(2026-06-15)_
- `4a61a819d` chore(session): RESUME:20260615-194326-f06a605 _(2026-06-15)_
- `94c569891` feat(web2-jt): tag XỬ LÝ BC đổi icon ngay + lưu DB đồng bộ đa máy _(2026-06-15)_
- `6dac043fb` chore(session): RESUME:20260615-193935-283422b _(2026-06-15)_
- `283422bf5` feat(web2): trạng thái/thông tin KH = 1 nguồn chung web2*customers + SSE đồng bộ *(2026-06-15)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-194932-a6d6558` cho Claude walk chain theo CLAUDE.md protocol.
