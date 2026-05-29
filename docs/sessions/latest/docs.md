# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260529-211146-909de65`
**Session file**: [`./20260529-211146-909de65.md`](../20260529-211146-909de65.md)
**Commit**: `909de65` — fix(inventory): variant mismatch keeps Tổng SL untouched + red row highlight
**Last updated**: 2026-05-29 21:11:46 +07
**Summary**: fix(inventory): variant mismatch keeps Tổng SL untouched + red row highlight

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `909de65fc` fix(inventory): variant mismatch keeps Tổng SL untouched + red row highlight _(2026-05-29)_
- `b2a66b7a0` chore(session): RESUME:20260529-210129-439a79a _(2026-05-29)_
- `439a79ae5` feat(so-order): custom confirm popup thay window.confirm() — fix delay + match UI _(2026-05-29)_
- `f815df585` chore(session): RESUME:20260529-204826-6785c1d _(2026-05-29)_
- `6785c1da2` feat(extension): pancake bump — hardcode page dropdown (NhiJudy Store/House/Oi) _(2026-05-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260529-211146-909de65` cho Claude walk chain theo CLAUDE.md protocol.
