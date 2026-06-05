# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-145543-3de04fa`
**Session file**: [`./20260605-145543-3de04fa.md`](../20260605-145543-3de04fa.md)
**Commit**: `3de04fa` — auto: session update
**Last updated**: 2026-06-05 14:55:43 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/fastsaleorder-invoice/index.html`
- `web2/printer-settings/index.html`
- `web2/shared/web2-bill-service.js`

## Last 5 commits touching `web2/`

- `c751cf9fa` fix(web2 bill): tat ca bill in ten nguoi ban = user dang dang nhap (Web2UserInfo.get().userName), fallback NV gan don _(2026-06-05)_
- `aabd34652` auto: session update _(2026-06-05)_
- `35731e4ad` feat(web2): detect 'CK XONG'/'ĐÃ CK' từ inbox Pancake 24/7 → trang Xác nhận CK _(2026-06-05)_
- `ad9ef3fe5` auto: session update _(2026-06-05)_
- `397deda52` feat(web2 bill): don ban tai shop ghi tieu de 'PBH SHOP' (thay 'Phieu Ban Hang (SHOP)') + sub 'BAN TAI SHOP' _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-145543-3de04fa` cho Claude walk chain theo CLAUDE.md protocol.
