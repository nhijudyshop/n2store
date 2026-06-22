# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-102759-b60bc41`
**Session file**: [`./20260622-102759-b60bc41.md`](../20260622-102759-b60bc41.md)
**Commit**: `b60bc41` — refactor(web2-css) theme: dedup dead tr-level zebra/hover (striping now 1-source at td-level Block A)
**Last updated**: 2026-06-22 10:27:59 +07
**Summary**: refactor(web2-css) theme: dedup dead tr-level zebra/hover (striping now 1-source at td-level Block A)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `edaa40d97` refactor(web2-css) consolidate toward 1-source/component: rm 4 orphan css + dead page-builder table/modal/pagination blocks _(2026-06-22)_
- `c1dad6906` chore(session): RESUME:20260622-101404-1ab47a7 _(2026-06-22)_
- `1ab47a75a` polish(live-chat): Chụp Live — bỏ toast success sau khi chụp (user req, lỗi vẫn báo) _(2026-06-22)_
- `d45e5c521` chore(session): RESUME:20260622-101028-2b38875 _(2026-06-22)_
- `2b3887554` fix(live-chat): Chụp Live ra ảnh trắng — capture TRƯỚC khi mở sidebar Kho Hình (sidebar che iframe) + ẩn sidebar lúc chụp lần 2+ _(2026-06-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-102759-b60bc41` cho Claude walk chain theo CLAUDE.md protocol.
