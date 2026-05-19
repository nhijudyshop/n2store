# Latest Snapshot — `_root/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-093944-ae200b3`
**Session file**: [`./20260519-093944-ae200b3.md`](../20260519-093944-ae200b3.md)
**Commit**: `ae200b3` — docs(web2): SSE realtime pattern guide + cập nhật CLAUDE.md/MEMORY rule bắt buộc
**Last updated**: 2026-05-19 09:39:44 +07
**Summary**: docs(web2): SSE realtime pattern guide + cập nhật CLAUDE.md/MEMORY rule bắt buộc

## Files changed in this commit (`_root/`)

- `CLAUDE.md`

## Last 5 commits touching `_root/`

- `ae200b35` docs(web2): SSE realtime pattern guide + cập nhật CLAUDE.md/MEMORY rule bắt buộc _(2026-05-19)_
- `cc2c8ff4` refactor(web2): move web2-products + web2-variants into web2/ _(2026-05-18)_
- `7eb39f57` refactor(web2): move web2-shared to web2/shared (consolidate Web 2.0) _(2026-05-18)_
- `c049756e` feat(web2): filter cancelled PBH + pagination + stock tracking + SePay endpoint + WEB2.0 markers _(2026-05-18)_
- `1bd91c3b` auto: session update _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-093944-ae200b3` cho Claude walk chain theo CLAUDE.md protocol.
