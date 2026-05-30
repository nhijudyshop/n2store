# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260530-094741-03ce0c4`
**Session file**: [`./20260530-094741-03ce0c4.md`](../20260530-094741-03ce0c4.md)
**Commit**: `03ce0c4` — auto: session update
**Last updated**: 2026-05-30 09:47:41 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `03ce0c478` auto: session update _(2026-05-30)_
- `6aad82770` chore(session): RESUME:20260530-094330-ed2e18e _(2026-05-30)_
- `5a646222d` feat(web2-products): multi-select checkbox + bulk print tem mã vạch _(2026-05-30)_
- `347e85b8b` chore(session): RESUME:20260530-093357-b5a1a06 _(2026-05-30)_
- `b5a1a06a5` perf(so-order): stock check 24000× faster — Web2ProductsCache thay N×HTTP _(2026-05-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260530-094741-03ce0c4` cho Claude walk chain theo CLAUDE.md protocol.
