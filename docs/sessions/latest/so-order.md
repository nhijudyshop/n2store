# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260529-201832-c24c6b5`
**Session file**: [`./20260529-201832-c24c6b5.md`](../20260529-201832-c24c6b5.md)
**Commit**: `c24c6b5` — perf(so-order): Receive modal scroll smoothness fix (CSS containment + GPU layer)
**Last updated**: 2026-05-29 20:18:32 +07
**Summary**: perf(so-order): Receive modal scroll smoothness fix (CSS containment + GPU layer)

## Files changed in this commit (`so-order/`)

- `so-order/css/so-order.css`
- `so-order/index.html`
- `so-order/js/so-order-app.js`

## Last 5 commits touching `so-order/`

- `c24c6b5b8` perf(so-order): Receive modal scroll smoothness fix (CSS containment + GPU layer) _(2026-05-29)_
- `4cfc8c1d1` auto: session update _(2026-05-29)_
- `662f615d4` perf(so-order): Receive modal mở instant (9ms) — lookup chạy ngầm + patch DOM _(2026-05-29)_
- `8de6b96dc` refactor(so-order): bỏ "Mua hàng" cũ (drawer + modal + per-row button) — chỉ giữ "Nhận hàng" _(2026-05-29)_
- `d305d31e8` fix(so-order): Nhận hàng button text bị clip vì so-action-btn fixed 28x28 _(2026-05-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260529-201832-c24c6b5` cho Claude walk chain theo CLAUDE.md protocol.
