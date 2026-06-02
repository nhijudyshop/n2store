# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260602-153754-815ea85`
**Session file**: [`./20260602-153754-815ea85.md`](../20260602-153754-815ea85.md)
**Commit**: `815ea85` — feat(tpos-pancake): fallback gửi qua N2 Extension bypass-24h khi Pancake API lỗi (giống native-orders)
**Last updated**: 2026-06-02 15:37:54 +07
**Summary**: feat(tpos-pancake): fallback gửi qua N2 Extension bypass-24h khi Pancake API lỗi (giống native-orders)

## Files changed in this commit (`web2/`)

- `web2/shared/web2-extension-bridge.js`

## Last 5 commits touching `web2/`

- `815ea8553` feat(tpos-pancake): fallback gửi qua N2 Extension bypass-24h khi Pancake API lỗi (giống native-orders) _(2026-06-02)_
- `206b6289a` feat(web2): decouple Web 2.0 ↔ Web 1.0/TPOS per user decisions (Phase 11 follow-up) _(2026-06-01)_
- `c4cb3e2f7` feat(web2): rollout Web2Optimistic helper toàn bộ menu — UI-first cho mọi page _(2026-06-01)_
- `71f95f2ff` feat(web2/shared): Web2Optimistic helper — pattern UI-first cho toàn bộ Web 2.0 _(2026-06-01)_
- `144e2ef87` auto: session update _(2026-06-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260602-153754-815ea85` cho Claude walk chain theo CLAUDE.md protocol.
