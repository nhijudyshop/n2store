# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-120152-6502f39`
**Session file**: [`./20260605-120152-6502f39.md`](../20260605-120152-6502f39.md)
**Commit**: `6502f39` — feat(tpos-pancake): enrich SĐT/địa chỉ comment từ kho khách hàng theo fb_id (TPOS trước, kho KH lấp chỗ trống, batch /customers/batch fb_ids)
**Last updated**: 2026-06-05 12:01:52 +07
**Summary**: feat(tpos-pancake): enrich SĐT/địa chỉ comment từ kho khách hàng theo fb_id (TPOS trước, kho KH lấp ch...

## Files changed in this commit (`render.com/`)

- `render.com/routes/v2/customers.js`

## Last 5 commits touching `render.com/`

- `6502f392f` feat(tpos-pancake): enrich SĐT/địa chỉ comment từ kho khách hàng theo fb*id (TPOS trước, kho KH lấp chỗ trống, batch /customers/batch fb_ids) *(2026-06-05)\_
- `e48a7e7cf` fix(web2-msg-send): mount /api/web2/msg-send (CF worker forward /api/web2/\*) thay /api/web2-msg-send (chua trong allowlist -> roi ve TPOS 404) _(2026-06-05)_
- `a6f0e3e7d` feat(native-orders): gửi tin nhắn template qua JOB server-side đa-account Pancake + extension fallback (refresh-safe, SSE progress) _(2026-06-05)_
- `cfcc3e8a2` feat(inbox): thêm DELETE /api/social-orders/kpi-verify/:orderId (cleanup lịch sử) _(2026-06-05)_
- `a2ebdddbb` fix(inbox): verify lưu thẳng Render (mount dưới /api/social-orders/kpi-verify) _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-120152-6502f39` cho Claude walk chain theo CLAUDE.md protocol.
