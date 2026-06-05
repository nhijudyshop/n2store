# Latest Snapshot — `orders-report/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-161244-af3db07`
**Session file**: [`./20260605-161244-af3db07.md`](../20260605-161244-af3db07.md)
**Commit**: `af3db07` — feat(orders): banner don hoan ghi ro tung mon hoan (ma+ten+ly do) de de so sanh
**Last updated**: 2026-06-05 16:12:44 +07
**Summary**: feat(orders): banner don hoan ghi ro tung mon hoan (ma+ten+ly do) de de so sanh

## Files changed in this commit (`orders-report/`)

- `orders-report/css/tab-kpi-commission.css`
- `orders-report/js/tab-kpi-commission.js`
- `orders-report/tab-kpi-commission.html`

## Last 5 commits touching `orders-report/`

- `af3db0719` feat(orders): banner don hoan ghi ro tung mon hoan (ma+ten+ly do) de de so sanh _(2026-06-05)_
- `938a3df0d` fix(orders): KPI refund chi tru mon duoc tinh KPI + modal hien thi ro mon tinh/mon hoan _(2026-06-05)_
- `28d74f0f8` fix(orders): KPI Lịch sử kiểm tra mất dấu ✓ + Số phiếu "—" & sửa text "share" sai _(2026-06-05)_
- `aeb78f00a` fix(orders): đánh KPI base sau gửi tin nhắn hàng loạt rớt ~nửa đơn _(2026-06-05)_
- `fdb267eaa` fix(orders): KPI thuc tru nham don hoan co KPI goc=0 (cap loss <= order.kpi) _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-161244-af3db07` cho Claude walk chain theo CLAUDE.md protocol.
