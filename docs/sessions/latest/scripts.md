# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260523-161759-2e11654`
**Session file**: [`./20260523-161759-2e11654.md`](../20260523-161759-2e11654.md)
**Commit**: `2e11654` — feat(snap): Phase 3 (smart fill + SSE + DRM badge) + GMT+7 force
**Last updated**: 2026-05-23 16:17:59 +07
**Summary**: feat(snap): Phase 3 (smart fill + SSE + DRM badge) + GMT+7 force

## Files changed in this commit (`scripts/`)

- `scripts/snap-e2e-full-test.js`

## Last 5 commits touching `scripts/`

- `2e1165404` feat(snap): Phase 3 (smart fill + SSE + DRM badge) + GMT+7 force _(2026-05-23)_
- `53022460c` feat(snap): Phase 1 — 1-click 🎬 Bắt đầu chụp live (tự mở FB + share) _(2026-05-23)_
- `c822fa6b3` feat(snap): button '📸 Chụp' cho comment không có bytea snap _(2026-05-23)_
- `98dc943ae` test(snap-e2e): mock getDisplayMedia + set tutorial flag pre-load _(2026-05-23)_
- `604a8b572` fix(snap): auto-mode không cần share FB nữa (revert auto-prompt) _(2026-05-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260523-161759-2e11654` cho Claude walk chain theo CLAUDE.md protocol.
