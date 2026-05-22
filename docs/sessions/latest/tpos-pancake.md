# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260522-165825-ea15fb9`
**Session file**: [`./20260522-165825-ea15fb9.md`](../20260522-165825-ea15fb9.md)
**Commit**: `ea15fb9` — feat(tpos-pancake/cart + native-orders): giữ cart 15 ngày + auto-clear khi tạo PBH + stock sync
**Last updated**: 2026-05-22 16:58:25 +07
**Summary**: feat(tpos-pancake/cart + native-orders): giữ cart 15 ngày + auto-clear khi tạo PBH + stock sync

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/css/inventory-panel.css`
- `tpos-pancake/index.html`
- `tpos-pancake/js/pancake/inventory-panel.js`

## Last 5 commits touching `tpos-pancake/`

- `ea15fb97b` feat(tpos-pancake/cart + native-orders): giữ cart 15 ngày + auto-clear khi tạo PBH + stock sync _(2026-05-22)_
- `ea3553cd5` fix(tpos-pancake/inv): cart gắn theo CUSTOMER (fbUserId), không phải comment*id *(2026-05-22)\_
- `2d48920ac` feat(tpos-pancake/inv): kéo SP = tạo native-order sau 5s undo + sync remove/clear với native-orders _(2026-05-22)_
- `730557730` feat(tpos-pancake/inv): optimistic UI + undo toast + xóa đơn confirm + no-confirm remove SP _(2026-05-22)_
- `d0abb32df` feat(tpos-pancake/inv): chỉ cho drop vào TPOS comments — bỏ Pancake conv fallback _(2026-05-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260522-165825-ea15fb9` cho Claude walk chain theo CLAUDE.md protocol.
