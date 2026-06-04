# Latest Snapshot — `don-inbox/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-132244-99f8cb7`
**Session file**: [`./20260604-132244-99f8cb7.md`](../20260604-132244-99f8cb7.md)
**Commit**: `99f8cb7` — auto: session update
**Last updated**: 2026-06-04 13:22:44 +07
**Summary**: auto: session update

## Files changed in this commit (`don-inbox/`)

- `don-inbox/index.html`
- `don-inbox/js/tab-social-column-visibility.js`
- `don-inbox/js/tab-social-core.js`
- `don-inbox/js/tab-social-kpi-reconcile.js`
- `don-inbox/js/tab-social-table.js`

## Last 5 commits touching `don-inbox/`

- `5a2ab01ea` feat(inbox): KPI Đơn Inbox — gate phiếu đã chốt + đối soát trừ hàng trả _(2026-06-04)_
- `9d96bb063` fix(don-inbox): nút 'Làm mới trạng thái phiếu từ TPOS' báo lỗi không tìm thấy đơn _(2026-06-03)_
- `7cfb01320` chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b _(2026-05-21)_
- `b452a8549` feat(don-inbox/sale): nut Tai lai SP tu TPOS canh o tim kiem F2 _(2026-05-20)_
- `1af7b58c2` fix(don-inbox/kpi-stat): chỉ phản ứng theo date filter, bỏ qua status/source/tag/search _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-132244-99f8cb7` cho Claude walk chain theo CLAUDE.md protocol.
