# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-150331-70e32bb`
**Session file**: [`./20260605-150331-70e32bb.md`](../20260605-150331-70e32bb.md)
**Commit**: `70e32bb` — refactor(web2): unread logic authoritative thuần (bỏ mirror Web 1.0 + nút Đã đọc)
**Last updated**: 2026-06-05 15:03:31 +07
**Summary**: refactor(web2): unread logic authoritative thuần (bỏ mirror Web 1.0 + nút Đã đọc)

## Files changed in this commit (`web2/`)

- `web2/payment-confirm/js/payment-confirm-app.js`

## Last 5 commits touching `web2/`

- `70e32bb69` refactor(web2): unread logic authoritative thuần (bỏ mirror Web 1.0 + nút Đã đọc) _(2026-06-05)_
- `c4557d45a` feat(web2 overview): card dang nhap/danh tinh (web2/login + web2/users) - phan quyen + gan danh tinh nguoi thuc hien + lich su hanh dong; chua login bill ghi 'an danh' _(2026-06-05)_
- `c751cf9fa` fix(web2 bill): tat ca bill in ten nguoi ban = user dang dang nhap (Web2UserInfo.get().userName), fallback NV gan don _(2026-06-05)_
- `aabd34652` auto: session update _(2026-06-05)_
- `35731e4ad` feat(web2): detect 'CK XONG'/'ĐÃ CK' từ inbox Pancake 24/7 → trang Xác nhận CK _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-150331-70e32bb` cho Claude walk chain theo CLAUDE.md protocol.
