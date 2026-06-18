# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260618-192635-a122c7d`
**Session file**: [`./20260618-192635-a122c7d.md`](../20260618-192635-a122c7d.md)
**Commit**: `a122c7d` — auto: session update
**Last updated**: 2026-06-18 19:26:35 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `6d1fc53f2` fix(web2): audit toàn bộ Web 2.0 — 16 bug (IME, race, null-deref, leak, double-submit, money display) _(2026-06-18)_
- `f5807b724` chore(session): RESUME:20260618-190051-6a90f3b _(2026-06-18)_
- `6a90f3b83` fix(web2-chat): guard Enter-to-send against Vietnamese IME composition (gửi nhầm 2 tin) _(2026-06-18)_
- `9213b73f5` chore(session): RESUME:20260618-185101-51d9368 _(2026-06-18)_
- `a6405962b` chore(session): RESUME:20260618-182131-d45779e _(2026-06-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260618-192635-a122c7d` cho Claude walk chain theo CLAUDE.md protocol.
