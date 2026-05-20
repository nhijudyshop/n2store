# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260520-112443-e4a31f2`
**Session file**: [`./20260520-112443-e4a31f2.md`](../20260520-112443-e4a31f2.md)
**Commit**: `e4a31f2` — test(web2): final smoke verify — 87/87 Web 2.0 pages clean, 0 errors
**Last updated**: 2026-05-20 11:24:43 +07
**Summary**: test(web2): final smoke verify — 87/87 Web 2.0 pages clean, 0 errors

## Files changed in this commit (`web2/`)

- `web2/customer-wallet/index.html`
- `web2/customer-wallet/js/customer-wallet-app.js`
- `web2/customer-wallet/js/customer-wallet-storage.js`
- `web2/shared/web2-realtime.js`

## Last 5 commits touching `web2/`

- `fca5c7ec` fix(web2/realtime): stop retry direct WS sau handshake fail + skip direct trong webdriver _(2026-05-20)_
- `94fb840d` feat(web2/customer-wallet): fetch native-orders + tạo entry cho KH chưa lập PBH _(2026-05-20)_
- `7b2eadd2` fix(web2/sidebar): preload web2-auth.js ở 19 trang load tpos-sidebar trực tiếp _(2026-05-19)_
- `8ff85337` fix(web2/sidebar): preload web2-auth.js trong page-shell → footer user/đăng xuất luôn hiện _(2026-05-19)_
- `5cc1fcd6` Revert "feat(web2/sidebar): forceExpand option — tpos-pancake luôn show sidebar đầy đủ" _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260520-112443-e4a31f2` cho Claude walk chain theo CLAUDE.md protocol.
