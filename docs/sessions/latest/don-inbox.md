# Latest Snapshot — `don-inbox/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-133604-a220409`
**Session file**: [`./20260604-133604-a220409.md`](../20260604-133604-a220409.md)
**Commit**: `a220409` — auto: session update
**Last updated**: 2026-06-04 13:36:04 +07
**Summary**: auto: session update

## Files changed in this commit (`don-inbox/`)

- `don-inbox/index.html`
- `don-inbox/js/tab-social-kpi-reconcile.js`

## Last 5 commits touching `don-inbox/`

- `2030efa8d` feat(inbox): thêm nút 'Tải file Excel' refund gốc TPOS để kiểm tra chéo _(2026-06-04)_
- `5a2ab01ea` feat(inbox): KPI Đơn Inbox — gate phiếu đã chốt + đối soát trừ hàng trả _(2026-06-04)_
- `9d96bb063` fix(don-inbox): nút 'Làm mới trạng thái phiếu từ TPOS' báo lỗi không tìm thấy đơn _(2026-06-03)_
- `7cfb01320` chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b _(2026-05-21)_
- `b452a8549` feat(don-inbox/sale): nut Tai lai SP tu TPOS canh o tim kiem F2 _(2026-05-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-133604-a220409` cho Claude walk chain theo CLAUDE.md protocol.
