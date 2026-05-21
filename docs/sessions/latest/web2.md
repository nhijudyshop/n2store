# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-185419-65fd9d7`
**Session file**: [`./20260521-185419-65fd9d7.md`](../20260521-185419-65fd9d7.md)
**Commit**: `65fd9d7` — chore(cache-bust): bump asset version v=20260521b → v=20260521c
**Last updated**: 2026-05-21 18:54:19 +07
**Summary**: chore(cache-bust): bump asset version v=20260521b → v=20260521c

## Files changed in this commit (`web2/`)

- `web2/fastsaleorder-invoice/index.html`
- `web2/products/index.html`

## Last 5 commits touching `web2/`

- `65fd9d77` chore(cache-bust): bump asset version v=20260521b → v=20260521c _(2026-05-21)_
- `2afef5fd` feat(web2): SSE realtime cho products + PBH page (không cần F5) _(2026-05-21)_
- `02ef6878` feat(fast-sale-orders): simplify 2-state model (Hoàn thành + Đã hủy) _(2026-05-21)_
- `3f1cb9a1` feat(web2-products): badge "ĐANG DÙNG" + popover orders chứa SP _(2026-05-21)_
- `bd2afacf` perf(web2-msg-template): parallel multi-worker send theo page _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-185419-65fd9d7` cho Claude walk chain theo CLAUDE.md protocol.
