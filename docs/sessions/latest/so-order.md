# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260518-161006-d9ca256`
**Session file**: [`./20260518-161006-d9ca256.md`](../20260518-161006-d9ca256.md)
**Commit**: `d9ca256` — feat(so-order): Mua hàng trực tiếp từ rows local + global/per-row buttons
**Last updated**: 2026-05-18 16:10:06 +07
**Summary**: feat(so-order): Mua hàng trực tiếp từ rows local + global/per-row buttons

## Files changed in this commit (`so-order/`)

- `so-order/css/so-order.css`
- `so-order/index.html`
- `so-order/js/so-order-app.js`

## Last 5 commits touching `so-order/`

- `d9ca2561` feat(so-order): Mua hàng trực tiếp từ rows local + global/per-row buttons _(2026-05-18)_
- `cbba186a` feat(web2-effects+so-order+products): paste-only image upload + compress JPEG _(2026-05-18)_
- `0546bad3` feat(web2-products+so-order): CHỜ MUA / ĐANG BÁN pipeline + Mua hàng per NCC _(2026-05-18)_
- `c38f56fc` chore(web2): bump tpos-sidebar.css cache v20260518d → v20260518e _(2026-05-18)_
- `cc2c8ff4` refactor(web2): move web2-products + web2-variants into web2/ _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260518-161006-d9ca256` cho Claude walk chain theo CLAUDE.md protocol.
