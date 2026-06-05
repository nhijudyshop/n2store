# Latest Snapshot — `don-inbox/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-110211-02a5e2b`
**Session file**: [`./20260605-110211-02a5e2b.md`](../20260605-110211-02a5e2b.md)
**Commit**: `02a5e2b` — docs(dev-log): bill tieng Viet bot nhoe/dut khuc
**Last updated**: 2026-06-05 11:02:11 +07
**Summary**: docs(dev-log): bill tieng Viet bot nhoe/dut khuc

## Files changed in this commit (`don-inbox/`)

- `don-inbox/index.html`
- `don-inbox/js/tab-social-kpi-reconcile.js`

## Last 5 commits touching `don-inbox/`

- `b519642ee` feat(inbox): KPI verify auto-sync localStorage → Render (không mất cross-máy) _(2026-06-05)_
- `5df3ce83c` fix(inbox): bỏ GetListOrderIds (lỗi 400) + im 404 verify trước khi deploy _(2026-06-05)_
- `216b992ac` feat(inbox): modal KPI gồm theo NV + đánh dấu kiểm tra + lịch sử + refresh phiếu TPOS _(2026-06-05)_
- `b6b1e9ada` feat(inbox): KPI đối soát load đủ khoảng ngày + trừ theo tổng MÓN + modal chi tiết _(2026-06-05)_
- `92ceb6b06` fix(inbox): đối soát KPI báo hoàn 0đ — OrderLines phiếu thiếu ProductCode _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-110211-02a5e2b` cho Claude walk chain theo CLAUDE.md protocol.
