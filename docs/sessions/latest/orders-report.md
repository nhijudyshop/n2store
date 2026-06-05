# Latest Snapshot — `orders-report/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-150331-70e32bb`
**Session file**: [`./20260605-150331-70e32bb.md`](../20260605-150331-70e32bb.md)
**Commit**: `70e32bb` — refactor(web2): unread logic authoritative thuần (bỏ mirror Web 1.0 + nút Đã đọc)
**Last updated**: 2026-06-05 15:03:31 +07
**Summary**: refactor(web2): unread logic authoritative thuần (bỏ mirror Web 1.0 + nút Đã đọc)

## Files changed in this commit (`orders-report/`)

- `orders-report/js/tab-kpi-commission.js`

## Last 5 commits touching `orders-report/`

- `fdb267eaa` fix(orders): KPI thuc tru nham don hoan co KPI goc=0 (cap loss <= order.kpi) _(2026-06-05)_
- `dd3295d19` feat(orders): KPI filter doi nut 'Thang nay' thanh dropdown chon thang cu the _(2026-06-05)_
- `7063a1e31` fix(orders): gửi tin nhắn hàng loạt rớt hết SP cho đơn nhiều món _(2026-06-05)_
- `a3e3aca2c` feat(orders-report): đối soát KPI theo MÓN + đổi sang ExportFileDetail _(2026-06-03)_
- `9d96bb063` fix(don-inbox): nút 'Làm mới trạng thái phiếu từ TPOS' báo lỗi không tìm thấy đơn _(2026-06-03)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-150331-70e32bb` cho Claude walk chain theo CLAUDE.md protocol.
