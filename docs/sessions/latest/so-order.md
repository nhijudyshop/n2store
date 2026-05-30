# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260530-170915-fbc8709`
**Session file**: [`./20260530-170915-fbc8709.md`](../20260530-170915-fbc8709.md)
**Commit**: `fbc8709` — auto: session update
**Last updated**: 2026-05-30 17:09:15 +07
**Summary**: auto: session update

## Files changed in this commit (`so-order/`)

- `so-order/index.html`
- `so-order/js/so-order-app.js`

## Last 5 commits touching `so-order/`

- `fbc87093f` auto: session update _(2026-05-30)_
- `774e01f56` auto: session update _(2026-05-30)_
- `42b5b9282` auto: session update _(2026-05-30)_
- `be3496bee` perf(so-order): stock check fast-path khi cache rỗng + timeout 1.2s fallback _(2026-05-30)_
- `f5c220cb2` feat(so-order): invoice grouping + NCC/invoice cell merge + suggestion ranking + paste thumbnail _(2026-05-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260530-170915-fbc8709` cho Claude walk chain theo CLAUDE.md protocol.
