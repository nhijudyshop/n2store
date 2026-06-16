# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-153109-716992f`
**Session file**: [`./20260616-153109-716992f.md`](../20260616-153109-716992f.md)
**Commit**: `716992f` — feat(web2/supplier-wallet): bỏ nút Đồng bộ → realtime tự động (thêm SSE web2:so-order)
**Last updated**: 2026-06-16 15:31:09 +07
**Summary**: feat(web2/supplier-wallet): bỏ nút Đồng bộ → realtime tự động (thêm SSE web2:so-order)

## Files changed in this commit (`so-order/`)

- `so-order/css/so-order.css`
- `so-order/index.html`

## Last 5 commits touching `so-order/`

- `716992f5f` feat(web2/supplier-wallet): bỏ nút Đồng bộ → realtime tự động (thêm SSE web2:so-order) _(2026-06-16)_
- `2a5b8e4ab` fix(so-order): modal Tạo Đơn Hàng — đồng bộ bố cục form (label height + ảnh hóa đơn compact 40px + cột đều) + làm đẹp table (tabular-nums, header slate-50, row hover) _(2026-06-16)_
- `a4998fe61` fix(so-order): modal Tạo Đơn Hàng — dropdown portal (hết bị che) + tách checkbox thông tin lô 6 field + ảnh hóa đơn cấp đơn _(2026-06-16)_
- `9a48ebe86` auto: session update _(2026-06-16)_
- `077127f56` auto: session update _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-153109-716992f` cho Claude walk chain theo CLAUDE.md protocol.
