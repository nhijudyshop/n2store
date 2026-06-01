# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260601-105500-29c2ab3`
**Session file**: [`./20260601-105500-29c2ab3.md`](../20260601-105500-29c2ab3.md)
**Commit**: `29c2ab3` — auto: session update
**Last updated**: 2026-06-01 10:55:00 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/web2/UI-FIRST.md`

## Last 5 commits touching `docs/`

- `d882ce45f` docs(web2): rule #8 — UI-first cho mọi mutation handler (BẮT BUỘC) _(2026-06-01)_
- `09e84b03e` chore(session): RESUME:20260601-104718-749a372 _(2026-06-01)_
- `749a37261` fix(orders-report,render): celebration sync cross-machine — máy khác render đúng ảnh admin upload _(2026-06-01)_
- `94239893c` chore(session): RESUME:20260601-103156-9a47de6 _(2026-06-01)_
- `e2ba673e0` chore(session): RESUME:20260601-102954-9d30404 _(2026-06-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260601-105500-29c2ab3` cho Claude walk chain theo CLAUDE.md protocol.
