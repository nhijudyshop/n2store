# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260523-153124-c822fa6`
**Session file**: [`./20260523-153124-c822fa6.md`](../20260523-153124-c822fa6.md)
**Commit**: `c822fa6` — feat(snap): button '📸 Chụp' cho comment không có bytea snap
**Last updated**: 2026-05-23 15:31:24 +07
**Summary**: feat(snap): button '📸 Chụp' cho comment không có bytea snap

## Files changed in this commit (`scripts/`)

- `scripts/snap-e2e-full-test.js`

## Last 5 commits touching `scripts/`

- `c822fa6b3` feat(snap): button '📸 Chụp' cho comment không có bytea snap _(2026-05-23)_
- `98dc943ae` test(snap-e2e): mock getDisplayMedia + set tutorial flag pre-load _(2026-05-23)_
- `604a8b572` fix(snap): auto-mode không cần share FB nữa (revert auto-prompt) _(2026-05-23)_
- `13f17c601` feat(snap): toggle chip inline thumb (default OFF) + move thumb inline với phone/address _(2026-05-23)_
- `d3a191f6e` feat(snap): compact thumb (chỉ ảnh) + click zoom lightbox _(2026-05-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260523-153124-c822fa6` cho Claude walk chain theo CLAUDE.md protocol.
