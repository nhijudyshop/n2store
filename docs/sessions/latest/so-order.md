# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260529-181826-d305d31`
**Session file**: [`./20260529-181826-d305d31.md`](../20260529-181826-d305d31.md)
**Commit**: `d305d31` — fix(so-order): Nhận hàng button text bị clip vì so-action-btn fixed 28x28
**Last updated**: 2026-05-29 18:18:26 +07
**Summary**: fix(so-order): Nhận hàng button text bị clip vì so-action-btn fixed 28x28

## Files changed in this commit (`so-order/`)

- `so-order/css/so-order.css`
- `so-order/index.html`
- `so-order/js/so-order-app.js`

## Last 5 commits touching `so-order/`

- `d305d31e8` fix(so-order): Nhận hàng button text bị clip vì so-action-btn fixed 28x28 _(2026-05-29)_
- `200fb3f3c` feat(so-order): Receive modal show "đã nhận N / còn M chờ" per row _(2026-05-29)_
- `741ac9218` auto: session update _(2026-05-29)_
- `b73017711` auto: session update _(2026-05-29)_
- `d654a830e` auto: session update _(2026-05-26)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260529-181826-d305d31` cho Claude walk chain theo CLAUDE.md protocol.
