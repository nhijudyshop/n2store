# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260523-153828-05ecba7`
**Session file**: [`./20260523-153828-05ecba7.md`](../20260523-153828-05ecba7.md)
**Commit**: `05ecba7` — fix(snap): backfill + auto offline KHÔNG lưu thumbnail generic nữa
**Last updated**: 2026-05-23 15:38:28 +07
**Summary**: fix(snap): backfill + auto offline KHÔNG lưu thumbnail generic nữa

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`
- `tpos-pancake/js/tpos/tpos-livestream-snap.js`

## Last 5 commits touching `tpos-pancake/`

- `05ecba7f4` fix(snap): backfill + auto offline KHÔNG lưu thumbnail generic nữa _(2026-05-23)_
- `c822fa6b3` feat(snap): button '📸 Chụp' cho comment không có bytea snap _(2026-05-23)_
- `604a8b572` fix(snap): auto-mode không cần share FB nữa (revert auto-prompt) _(2026-05-23)_
- `5ebfbf023` fix(snap): mọi comment có thumb (compute offset từ comment.time client-side) _(2026-05-23)_
- `13f17c601` feat(snap): toggle chip inline thumb (default OFF) + move thumb inline với phone/address _(2026-05-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260523-153828-05ecba7` cho Claude walk chain theo CLAUDE.md protocol.
