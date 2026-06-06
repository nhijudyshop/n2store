# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260606-090546-72dc67c`
**Session file**: [`./20260606-090546-72dc67c.md`](../20260606-090546-72dc67c.md)
**Commit**: `72dc67c` — auto: session update
**Last updated**: 2026-06-06 09:05:46 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/shared/web2-chat-readonly.js`

## Last 5 commits touching `web2/`

- `72dc67c21` auto: session update _(2026-06-06)_
- `566cb6619` auto: session update _(2026-06-06)_
- `f0126efa8` auto: session update _(2026-06-06)_
- `77392b076` fix(web2-chat-readonly): tin nhan moi nhat xuong day (sort asc theo timestamp) _(2026-06-06)_
- `812bfa27b` fix(web2): QR modal mở theo customer*id (partner_id) khi có — mỗi TPOS partner ra đúng QR riêng dù trùng SĐT *(2026-06-05)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260606-090546-72dc67c` cho Claude walk chain theo CLAUDE.md protocol.
