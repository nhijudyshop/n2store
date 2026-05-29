# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260529-123228-f8299c1`
**Session file**: [`./20260529-123228-f8299c1.md`](../20260529-123228-f8299c1.md)
**Commit**: `f8299c1` — feat(inventory): add inline "+ Thêm hàng" button on last row of each NCC invoice
**Last updated**: 2026-05-29 12:32:28 +07
**Summary**: feat(inventory): add inline "+ Thêm hàng" button on last row of each NCC invoice

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `f8299c153` feat(inventory): add inline "+ Thêm hàng" button on last row of each NCC invoice _(2026-05-29)_
- `825ae1b6b` chore(session): RESUME:20260529-123035-072e139 _(2026-05-29)_
- `fe70cca62` docs(dev-log): web2 comprehensive recheck — 50/50 smoke PASS + SSE e2e verified _(2026-05-29)_
- `834e9fa09` chore(session): RESUME:20260529-121633-e617e3a _(2026-05-29)_
- `e617e3a53` feat(inventory-tracking): SSE realtime auto-refresh + grant bobo CP perms _(2026-05-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260529-123228-f8299c1` cho Claude walk chain theo CLAUDE.md protocol.
