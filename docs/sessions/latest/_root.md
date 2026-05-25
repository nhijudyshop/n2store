# Latest Snapshot — `_root/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260525-153907-cd4bcf4`
**Session file**: [`./20260525-153907-cd4bcf4.md`](../20260525-153907-cd4bcf4.md)
**Commit**: `cd4bcf4` — auto: session update
**Last updated**: 2026-05-25 15:39:07 +07
**Summary**: auto: session update

## Files changed in this commit (`_root/`)

- `CLAUDE.md`

## Last 5 commits touching `_root/`

- `cd4bcf408` auto: session update _(2026-05-25)_
- `218e85db6` refactor(purchase-orders): rollback Bunny → Postgres bytea cho upload mới + policy "Bunny chỉ AI KOL" _(2026-05-21)_
- `243383d01` fix(purchase-orders): paste image lớn không bị lỗi nữa + persistent session restore + debug-via-console rule _(2026-05-21)_
- `ae200b354` docs(web2): SSE realtime pattern guide + cập nhật CLAUDE.md/MEMORY rule bắt buộc _(2026-05-19)_
- `cc2c8ff4b` refactor(web2): move web2-products + web2-variants into web2/ _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260525-153907-cd4bcf4` cho Claude walk chain theo CLAUDE.md protocol.
