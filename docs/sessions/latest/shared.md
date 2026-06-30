# Latest Snapshot — `shared/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260701-002449-359bea1`
**Session file**: [`./20260701-002449-359bea1.md`](../20260701-002449-359bea1.md)
**Commit**: `359bea1` — security: client creds → env/config-endpoint (SIP fallback + SePay account password)
**Last updated**: 2026-07-01 00:24:49 +07
**Summary**: Client creds → env/config-endpoint: SIP fallback gỡ trống + SePay account password gỡ khỏi client (worker dùng env); user phải set worker secret + rotate

## Files changed in this commit (`shared/`)

- `shared/js/navigation-modern.js`

## Last 5 commits touching `shared/`

- `359bea187` security: client creds → env/config-endpoint (SIP fallback + SePay account password) _(2026-07-01)_
- `be910cb67` fix(nav): purge dead tpos-pancake/ paths → live-chat/ (nav href, permissions-registry, 17 test scripts) _(2026-06-29)_
- `be14ea22f` fix(web2): avatar DiceBear transparent→400 + avatar vào trang Người dùng + đổi MK chính mình giữ phiên + Zalo CORS x-web2-zalo-owner _(2026-06-23)_
- `c0681a9df` chore(web2): xoá trang product-category (Nhóm sản phẩm) + khôi phục Kho Biến Thể (108) _(2026-06-23)_
- `0ae27d030` auto: session update _(2026-06-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260701-002449-359bea1` cho Claude walk chain theo CLAUDE.md protocol.
