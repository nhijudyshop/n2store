# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-205615-e295242`
**Session file**: [`./20260628-205615-e295242.md`](../20260628-205615-e295242.md)
**Commit**: `e295242` — feat(web2-vn-address): bộ chọn Tỉnh/TP → Phường/Xã dùng chung (vietnamese-provinces-database, MIT)
**Last updated**: 2026-06-28 20:56:15 +07
**Summary**: Web2VnAddress: bộ chọn Tỉnh/TP→Phường/Xã (vietnamese-provinces-database MIT) tích hợp customers + native-orders

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`
- `docs/web2/WEB2-CODEMAP.md`
- `docs/web2/WEB2-PAGE-MODULES.md`
- `docs/web2/WEB2-THIRD-PARTIES.md`
- `docs/web2/web2-codemap.json`

## Last 5 commits touching `docs/`

- `e2952425a` feat(web2-vn-address): bộ chọn Tỉnh/TP → Phường/Xã dùng chung (vietnamese-provinces-database, MIT) _(2026-06-28)_
- `c0891d3e7` chore(session): RESUME:20260628-204449-b3b021b _(2026-06-28)_
- `61e539fb3` chore(session): RESUME:20260628-204002-9dad624 _(2026-06-28)_
- `7d82bdcc1` chore(session): RESUME:20260628-203742-7d1f065 _(2026-06-28)_
- `9c6fc6e95` chore(session): RESUME:20260628-201946-c4679e2 _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-205615-e295242` cho Claude walk chain theo CLAUDE.md protocol.
