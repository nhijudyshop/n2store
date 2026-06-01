# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260601-132353-206b628`
**Session file**: [`./20260601-132353-206b628.md`](../20260601-132353-206b628.md)
**Commit**: `206b628` — feat(web2): decouple Web 2.0 ↔ Web 1.0/TPOS per user decisions (Phase 11 follow-up)
**Last updated**: 2026-06-01 13:23:53 +07
**Summary**: feat(web2): decouple Web 2.0 ↔ Web 1.0/TPOS per user decisions (Phase 11 follow-up)

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/js/tpos/tpos-api.js`

## Last 5 commits touching `tpos-pancake/`

- `206b6289a` feat(web2): decouple Web 2.0 ↔ Web 1.0/TPOS per user decisions (Phase 11 follow-up) _(2026-06-01)_
- `c4cb3e2f7` feat(web2): rollout Web2Optimistic helper toàn bộ menu — UI-first cho mọi page _(2026-06-01)_
- `77aec531a` feat(tpos-pancake): UI-first cho cart ops — toast/badge instant, backend background, rollback nếu lỗi _(2026-06-01)_
- `11bd3d1e1` auto: session update _(2026-06-01)_
- `e4f05947b` perf(tpos-pancake): anti-lag khi kéo SP vào comment / thêm SP vào đơn _(2026-06-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260601-132353-206b628` cho Claude walk chain theo CLAUDE.md protocol.
