# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-104010-4b318b3`
**Session file**: [`./20260615-104010-4b318b3.md`](../20260615-104010-4b318b3.md)
**Commit**: `4b318b3` — feat(worker): route /api/web2-jt-tracking/_ → web2-api (Customer360 proxy)
**Last updated**: 2026-06-15 10:40:10 +07
**Summary**: feat(worker): route /api/web2-jt-tracking/_ → web2-api (Customer360 proxy)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `688d6319c` feat(web2): trang Tra cứu vận đơn J&T (Báo cáo) — route + frontend + lottie _(2026-06-15)_
- `c9636b9a2` chore(session): RESUME:20260615-102439-41509cd _(2026-06-15)_
- `194ce5230` fix(inventory-tracking): thêm NCC trùng tên KHÔNG gộp dòng — gỡ dedup-merge server-side POST /shipments _(2026-06-15)_
- `3f48d03c0` chore(session): RESUME:20260615-092929-195f358 _(2026-06-15)_
- `195f3584a` docs(dev-log): TPOS đợt 2 deployed + verified (env dead removed, batch endpoints live) _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-104010-4b318b3` cho Claude walk chain theo CLAUDE.md protocol.
