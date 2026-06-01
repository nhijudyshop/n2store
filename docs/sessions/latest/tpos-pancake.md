# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260601-184527-2422759`
**Session file**: [`./20260601-184527-2422759.md`](../20260601-184527-2422759.md)
**Commit**: `2422759` — fix(tpos-pancake): bump partnerCache maxSize 200→2000 — không hiện SĐT/địa chỉ KH do LRU evict
**Last updated**: 2026-06-01 18:45:27 +07
**Summary**: fix(tpos-pancake): bump partnerCache maxSize 200→2000 — không hiện SĐT/địa chỉ KH do LRU evict

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/js/tpos/tpos-state.js`

## Last 5 commits touching `tpos-pancake/`

- `242275958` fix(tpos-pancake): bump partnerCache maxSize 200→2000 — không hiện SĐT/địa chỉ KH do LRU evict _(2026-06-01)_
- `206b6289a` feat(web2): decouple Web 2.0 ↔ Web 1.0/TPOS per user decisions (Phase 11 follow-up) _(2026-06-01)_
- `c4cb3e2f7` feat(web2): rollout Web2Optimistic helper toàn bộ menu — UI-first cho mọi page _(2026-06-01)_
- `77aec531a` feat(tpos-pancake): UI-first cho cart ops — toast/badge instant, backend background, rollback nếu lỗi _(2026-06-01)_
- `11bd3d1e1` auto: session update _(2026-06-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260601-184527-2422759` cho Claude walk chain theo CLAUDE.md protocol.
