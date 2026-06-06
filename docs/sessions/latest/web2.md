# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260606-085459-701cd69`
**Session file**: [`./20260606-085459-701cd69.md`](../20260606-085459-701cd69.md)
**Commit**: `701cd69` — auto: session update
**Last updated**: 2026-06-06 08:54:59 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/shared/web2-chat-readonly.js`

## Last 5 commits touching `web2/`

- `77392b076` fix(web2-chat-readonly): tin nhan moi nhat xuong day (sort asc theo timestamp) _(2026-06-06)_
- `812bfa27b` fix(web2): QR modal mở theo customer*id (partner_id) khi có — mỗi TPOS partner ra đúng QR riêng dù trùng SĐT *(2026-06-05)\_
- `d9fedb7cd` feat(web2-chat-readonly): sort hoi thoai moi nhat len dau (updated*at desc) *(2026-06-05)\_
- `be3f3332a` feat(web2): CK approve/watcher xử lý GD đã cộng đúng SĐT (đối soát + gửi tin) + history timeline trong modal _(2026-06-05)_
- `6d4de1344` fix(web2 products): tem mã SP 2-up canh giữa đúng tâm cột die-cut _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260606-085459-701cd69` cho Claude walk chain theo CLAUDE.md protocol.
