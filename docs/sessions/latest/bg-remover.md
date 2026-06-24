# Latest Snapshot — `bg-remover/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-165320-2132dc4`
**Session file**: [`./20260624-165320-2132dc4.md`](../20260624-165320-2132dc4.md)
**Commit**: `2132dc4` — auto: session update
**Last updated**: 2026-06-24 16:53:20 +07
**Summary**: auto: session update

## Files changed in this commit (`bg-remover/`)

- `bg-remover/app.py`

## Last 5 commits touching `bg-remover/`

- `25c4b5be4` perf(bg-remover): default BGR*MODEL u2net -> birefnet-general-lite (audit: better edges/hair, CPU-friendly) *(2026-06-24)\_
- `4bac6625f` chore(web2/users): prettier format users-app.js _(2026-06-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-165320-2132dc4` cho Claude walk chain theo CLAUDE.md protocol.
