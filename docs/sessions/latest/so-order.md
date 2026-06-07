# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-103701-fe66d43`
**Session file**: [`./20260607-103701-fe66d43.md`](../20260607-103701-fe66d43.md)
**Commit**: `fe66d43` — feat(so-order): nút 'In tem' trong panel nhận hàng — in/in lại QR cả khi đã nhận đủ
**Last updated**: 2026-06-07 10:37:01 +07
**Summary**: feat(so-order): nút 'In tem' trong panel nhận hàng — in/in lại QR cả khi đã nhận đủ

## Files changed in this commit (`so-order/`)

- `so-order/index.html`
- `so-order/js/so-order-app.js`

## Last 5 commits touching `so-order/`

- `fe66d43ca` feat(so-order): nút 'In tem' trong panel nhận hàng — in/in lại QR cả khi đã nhận đủ _(2026-06-07)_
- `34d580a1c` fix(so-order): nhận hàng in tem QR 2-tem theo SL nhận (bump print script version) _(2026-06-07)_
- `88a063b46` refactor(web2): gộp payment-confirm vào ck-dashboard (1 trang CK + tab Tin nhắn chưa đọc) _(2026-06-06)_
- `566cb6619` auto: session update _(2026-06-06)_
- `6d4de1344` fix(web2 products): tem mã SP 2-up canh giữa đúng tâm cột die-cut _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-103701-fe66d43` cho Claude walk chain theo CLAUDE.md protocol.
