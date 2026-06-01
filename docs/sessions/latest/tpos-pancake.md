# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260601-094816-e4f0594`
**Session file**: [`./20260601-094816-e4f0594.md`](../20260601-094816-e4f0594.md)
**Commit**: `e4f0594` — perf(tpos-pancake): anti-lag khi kéo SP vào comment / thêm SP vào đơn
**Last updated**: 2026-06-01 09:48:16 +07
**Summary**: perf(tpos-pancake): anti-lag khi kéo SP vào comment / thêm SP vào đơn

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/js/pancake/inventory-panel.js`

## Last 5 commits touching `tpos-pancake/`

- `e4f05947b` perf(tpos-pancake): anti-lag khi kéo SP vào comment / thêm SP vào đơn _(2026-06-01)_
- `646661565` auto: session update _(2026-05-31)_
- `38ee7cf4a` feat(kpi): Sprint 1 — wire ledger write path (forecast + actual + revoked) _(2026-05-31)_
- `78d9e5b0c` perf(tpos-pancake): defer cross-item refresh sau createOrder → anti-freeze _(2026-05-31)_
- `e15ff6158` fix(tpos-pancake): campaign chọn giờ load comments từ TẤT CẢ Facebook*PostId *(2026-05-26)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260601-094816-e4f0594` cho Claude walk chain theo CLAUDE.md protocol.
