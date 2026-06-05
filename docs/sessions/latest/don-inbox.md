# Latest Snapshot — `don-inbox/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-095959-b08f869`
**Session file**: [`./20260605-095959-b08f869.md`](../20260605-095959-b08f869.md)
**Commit**: `b08f869` — auto: session update
**Last updated**: 2026-06-05 09:59:59 +07
**Summary**: auto: session update

## Files changed in this commit (`don-inbox/`)

- `don-inbox/index.html`
- `don-inbox/js/tab-social-core.js`
- `don-inbox/js/tab-social-kpi-reconcile.js`

## Last 5 commits touching `don-inbox/`

- `b6b1e9ada` feat(inbox): KPI đối soát load đủ khoảng ngày + trừ theo tổng MÓN + modal chi tiết _(2026-06-05)_
- `92ceb6b06` fix(inbox): đối soát KPI báo hoàn 0đ — OrderLines phiếu thiếu ProductCode _(2026-06-04)_
- `2030efa8d` feat(inbox): thêm nút 'Tải file Excel' refund gốc TPOS để kiểm tra chéo _(2026-06-04)_
- `5a2ab01ea` feat(inbox): KPI Đơn Inbox — gate phiếu đã chốt + đối soát trừ hàng trả _(2026-06-04)_
- `9d96bb063` fix(don-inbox): nút 'Làm mới trạng thái phiếu từ TPOS' báo lỗi không tìm thấy đơn _(2026-06-03)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-095959-b08f869` cho Claude walk chain theo CLAUDE.md protocol.
