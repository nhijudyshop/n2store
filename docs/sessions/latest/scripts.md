# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-120019-d371b0a`
**Session file**: [`./20260521-120019-d371b0a.md`](../20260521-120019-d371b0a.md)
**Commit**: `d371b0a` — auto: session update
**Last updated**: 2026-05-21 12:00:19 +07
**Summary**: auto: session update

## Files changed in this commit (`scripts/`)

- `scripts/n2store-browser-session.js`

## Last 5 commits touching `scripts/`

- `d371b0a9` auto: session update _(2026-05-21)_
- `a82a7de4` auto: session update _(2026-05-21)_
- `8f182fc9` auto: session update _(2026-05-21)_
- `243383d0` fix(purchase-orders): paste image lớn không bị lỗi nữa + persistent session restore + debug-via-console rule _(2026-05-21)_
- `f97ef682` auto: session update _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-120019-d371b0a` cho Claude walk chain theo CLAUDE.md protocol.
