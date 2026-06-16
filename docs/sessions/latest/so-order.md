# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-160137-3090aec`
**Session file**: [`./20260616-160137-3090aec.md`](../20260616-160137-3090aec.md)
**Commit**: `3090aec` — auto: session update
**Last updated**: 2026-06-16 16:01:37 +07
**Summary**: auto: session update

## Files changed in this commit (`so-order/`)

- `so-order/css/so-order.css`
- `so-order/index.html`
- `so-order/js/so-order-app.js`
- `so-order/js/so-order-storage.js`

## Last 5 commits touching `so-order/`

- `3090aec46` auto: session update _(2026-06-16)_
- `d9c0609e4` fix(so-order): nền bảng xen kẽ theo NHÓM NCC/đơn (parity class JS) thay zebra :nth-child lệch nhóm — tăng tương phản đọc từng khối _(2026-06-16)_
- `f014397c5` auto: session update _(2026-06-16)_
- `716992f5f` feat(web2/supplier-wallet): bỏ nút Đồng bộ → realtime tự động (thêm SSE web2:so-order) _(2026-06-16)_
- `2a5b8e4ab` fix(so-order): modal Tạo Đơn Hàng — đồng bộ bố cục form (label height + ảnh hóa đơn compact 40px + cột đều) + làm đẹp table (tabular-nums, header slate-50, row hover) _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-160137-3090aec` cho Claude walk chain theo CLAUDE.md protocol.
