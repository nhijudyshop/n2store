# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260601-095229-11bd3d1`
**Session file**: [`./20260601-095229-11bd3d1.md`](../20260601-095229-11bd3d1.md)
**Commit**: `11bd3d1` — auto: session update
**Last updated**: 2026-06-01 09:52:29 +07
**Summary**: auto: session update

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`
- `tpos-pancake/js/pancake/inventory-panel.js`

## Last 5 commits touching `tpos-pancake/`

- `11bd3d1e1` auto: session update _(2026-06-01)_
- `e4f05947b` perf(tpos-pancake): anti-lag khi kéo SP vào comment / thêm SP vào đơn _(2026-06-01)_
- `646661565` auto: session update _(2026-05-31)_
- `38ee7cf4a` feat(kpi): Sprint 1 — wire ledger write path (forecast + actual + revoked) _(2026-05-31)_
- `78d9e5b0c` perf(tpos-pancake): defer cross-item refresh sau createOrder → anti-freeze _(2026-05-31)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260601-095229-11bd3d1` cho Claude walk chain theo CLAUDE.md protocol.
