# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260522-163544-2d48920`
**Session file**: [`./20260522-163544-2d48920.md`](../20260522-163544-2d48920.md)
**Commit**: `2d48920` — feat(tpos-pancake/inv): kéo SP = tạo native-order sau 5s undo + sync remove/clear với native-orders
**Last updated**: 2026-05-22 16:35:44 +07
**Summary**: feat(tpos-pancake/inv): kéo SP = tạo native-order sau 5s undo + sync remove/clear với native-orders

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`
- `tpos-pancake/js/pancake/inventory-panel.js`

## Last 5 commits touching `tpos-pancake/`

- `2d48920ac` feat(tpos-pancake/inv): kéo SP = tạo native-order sau 5s undo + sync remove/clear với native-orders _(2026-05-22)_
- `730557730` feat(tpos-pancake/inv): optimistic UI + undo toast + xóa đơn confirm + no-confirm remove SP _(2026-05-22)_
- `d0abb32df` feat(tpos-pancake/inv): chỉ cho drop vào TPOS comments — bỏ Pancake conv fallback _(2026-05-22)_
- `781e50f86` feat(tpos-pancake/inv): drop target sang TPOS comments (left column) — phương án C _(2026-05-22)_
- `29e200478` fix(tpos-pancake/inv): drag không fire do inner elements bắt mousedown + lọc SL=0 _(2026-05-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260522-163544-2d48920` cho Claude walk chain theo CLAUDE.md protocol.
