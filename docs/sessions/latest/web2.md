# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-192549-812bfa2`
**Session file**: [`./20260605-192549-812bfa2.md`](../20260605-192549-812bfa2.md)
**Commit**: `812bfa2` — fix(web2): QR modal mở theo customer_id (partner_id) khi có — mỗi TPOS partner ra đúng QR riêng dù trùng SĐT
**Last updated**: 2026-06-05 19:25:50 +07
**Summary**: fix(web2): QR modal mở theo customer_id (partner_id) khi có — mỗi TPOS partner ra đúng QR riêng dù trùng ...

## Files changed in this commit (`web2/`)

- `web2/shared/web2-qr-modal.js`

## Last 5 commits touching `web2/`

- `812bfa27b` fix(web2): QR modal mở theo customer*id (partner_id) khi có — mỗi TPOS partner ra đúng QR riêng dù trùng SĐT *(2026-06-05)\_
- `d9fedb7cd` feat(web2-chat-readonly): sort hoi thoai moi nhat len dau (updated*at desc) *(2026-06-05)\_
- `be3f3332a` feat(web2): CK approve/watcher xử lý GD đã cộng đúng SĐT (đối soát + gửi tin) + history timeline trong modal _(2026-06-05)_
- `6d4de1344` fix(web2 products): tem mã SP 2-up canh giữa đúng tâm cột die-cut _(2026-06-05)_
- `2b8a932e8` feat(web2): 5 tính năng tương tác khách — auto-reply + watcher + intent + dashboard _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-192549-812bfa2` cho Claude walk chain theo CLAUDE.md protocol.
