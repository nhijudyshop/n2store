# Latest Snapshot — `don-inbox/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260606-122222-2c22ee0`
**Session file**: [`./20260606-122222-2c22ee0.md`](../20260606-122222-2c22ee0.md)
**Commit**: `2c22ee0` — fix(issue-tracking): don Khach Gui luon cong cong no vao vi + tach lich su 2 buoc
**Last updated**: 2026-06-06 12:22:22 +07
**Summary**: fix(issue-tracking): don Khach Gui luon cong cong no vao vi + tach lich su 2 buoc

## Files changed in this commit (`don-inbox/`)

- `don-inbox/js/tab-social-core.js`
- `don-inbox/js/tab-social-kpi-reconcile.js`

## Last 5 commits touching `don-inbox/`

- `04e6f92e3` perf(inbox): KPI thẻ "tất cả" thôi auto kéo toàn bộ lịch sử đơn khi mở trang _(2026-06-06)_
- `a2ebdddbb` fix(inbox): verify lưu thẳng Render (mount dưới /api/social-orders/kpi-verify) _(2026-06-05)_
- `b519642ee` feat(inbox): KPI verify auto-sync localStorage → Render (không mất cross-máy) _(2026-06-05)_
- `5df3ce83c` fix(inbox): bỏ GetListOrderIds (lỗi 400) + im 404 verify trước khi deploy _(2026-06-05)_
- `216b992ac` feat(inbox): modal KPI gồm theo NV + đánh dấu kiểm tra + lịch sử + refresh phiếu TPOS _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260606-122222-2c22ee0` cho Claude walk chain theo CLAUDE.md protocol.
