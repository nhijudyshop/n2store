# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-144341-528b07a`
**Session file**: [`./20260605-144341-528b07a.md`](../20260605-144341-528b07a.md)
**Commit**: `528b07a` — feat(web2): unread DB riêng Web 2.0 + harden Pancake WS 24/7
**Last updated**: 2026-06-05 14:43:41 +07
**Summary**: feat(web2): unread DB riêng Web 2.0 + harden Pancake WS 24/7

## Files changed in this commit (`render.com/`)

- `render.com/routes/web2-unread.js`
- `render.com/services/web2-unread-tracker.js`

## Last 5 commits touching `render.com/`

- `528b07a1c` feat(web2): unread DB riêng Web 2.0 + harden Pancake WS 24/7 _(2026-06-05)_
- `aabd34652` auto: session update _(2026-06-05)_
- `35731e4ad` feat(web2): detect 'CK XONG'/'ĐÃ CK' từ inbox Pancake 24/7 → trang Xác nhận CK _(2026-06-05)_
- `ad9ef3fe5` auto: session update _(2026-06-05)_
- `6502f392f` feat(tpos-pancake): enrich SĐT/địa chỉ comment từ kho khách hàng theo fb*id (TPOS trước, kho KH lấp chỗ trống, batch /customers/batch fb_ids) *(2026-06-05)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-144341-528b07a` cho Claude walk chain theo CLAUDE.md protocol.
