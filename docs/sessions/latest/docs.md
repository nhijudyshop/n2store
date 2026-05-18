# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260518-165815-1e6b6ae`
**Session file**: [`./20260518-165815-1e6b6ae.md`](../20260518-165815-1e6b6ae.md)
**Commit**: `1e6b6ae` — fix(so-order): replace lucide icons in FAB toggle with inline SVG + add label
**Last updated**: 2026-05-18 16:58:15 +07
**Summary**: fix(so-order): replace lucide icons in FAB toggle with inline SVG + add label

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `1e6b6ae3` fix(so-order): replace lucide icons in FAB toggle with inline SVG + add label _(2026-05-18)_
- `21593d8b` chore(session): RESUME:20260518-161635-12f2bb5 _(2026-05-18)_
- `12f2bb5a` feat(so-order): move "Mua hàng theo NCC" panel into right-side drawer with toggle _(2026-05-18)_
- `5d6d2c0c` chore(session): RESUME:20260518-161006-d9ca256 _(2026-05-18)_
- `d9ca2561` feat(so-order): Mua hàng trực tiếp từ rows local + global/per-row buttons _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260518-165815-1e6b6ae` cho Claude walk chain theo CLAUDE.md protocol.
