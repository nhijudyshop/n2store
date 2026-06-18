# Latest Snapshot — `_root/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260618-212907-1483652`
**Session file**: [`./20260618-212907-1483652.md`](../20260618-212907-1483652.md)
**Commit**: `1483652` — docs(convention): Web 2.0 — tách module nhỏ + share dùng chung (CLAUDE.md item 0, dev-log, memory)
**Last updated**: 2026-06-18 21:29:07 +07
**Summary**: docs(convention): Web 2.0 — tách module nhỏ + share dùng chung (CLAUDE.md item 0, dev-log, memory)

## Files changed in this commit (`_root/`)

- `CLAUDE.md`

## Last 5 commits touching `_root/`

- `148365232` docs(convention): Web 2.0 — tách module nhỏ + share dùng chung (CLAUDE.md item 0, dev-log, memory) _(2026-06-18)_
- `d45779ee6` chore(docs): xoá docs Pancake cũ (lỗi thời) → browser-test trang thật _(2026-06-18)_
- `2a02bff32` refactor(web2): hợp nhất base-URL về 1 nguồn (web2-auth.js) + fix livestream 404 worker + ck-dashboard 401 _(2026-06-15)_
- `f6e3c7171` docs(web2): chốt quy ước REALTIME, KHÔNG POLLER (CLAUDE.md + overview #conventions + dev-log) _(2026-06-15)_
- `ef24e8646` docs(claude): browser test FIFO/cổng động — tránh tranh chấp đa phiên _(2026-06-14)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260618-212907-1483652` cho Claude walk chain theo CLAUDE.md protocol.
