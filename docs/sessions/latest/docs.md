# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260614-190401-ef24e86`
**Session file**: [`./20260614-190401-ef24e86.md`](../20260614-190401-ef24e86.md)
**Commit**: `ef24e86` — docs(claude): browser test FIFO/cổng động — tránh tranh chấp đa phiên
**Last updated**: 2026-06-14 19:04:01 +07
**Summary**: docs(claude): browser test FIFO/cổng động — tránh tranh chấp đa phiên

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `ef24e8646` docs(claude): browser test FIFO/cổng động — tránh tranh chấp đa phiên _(2026-06-14)_
- `65d32a8bb` fix(web2-zalo): heal tên hội thoại NHÓM bị lấy theo người nhắn cuối _(2026-06-14)_
- `2ac4fe9cd` chore(session): RESUME:20260614-190009-cee3b76 _(2026-06-14)_
- `c07c03da5` chore(web2): xoá dead code web2-bulk-import.js + selector mồ côi .w2-bulk-modal _(2026-06-14)_
- `d9ef45219` chore(session): RESUME:20260614-185748-adebdc5 _(2026-06-14)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260614-190401-ef24e86` cho Claude walk chain theo CLAUDE.md protocol.
