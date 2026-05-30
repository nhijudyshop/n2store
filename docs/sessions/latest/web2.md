# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260530-165621-26defed`
**Session file**: [`./20260530-165621-26defed.md`](../20260530-165621-26defed.md)
**Commit**: `26defed` — feat(web2-customer-wallet): tab QR VietQR — generate + display QR cho từng KH
**Last updated**: 2026-05-30 16:56:21 +07
**Summary**: feat(web2-customer-wallet): tab QR VietQR — generate + display QR cho từng KH

## Files changed in this commit (`web2/`)

- `web2/customer-wallet/css/customer-wallet.css`
- `web2/customer-wallet/index.html`
- `web2/customer-wallet/js/web2-customer-wallet-app.js`

## Last 5 commits touching `web2/`

- `26defed21` feat(web2-customer-wallet): tab QR VietQR — generate + display QR cho từng KH _(2026-05-30)_
- `57655d52a` feat(web2-shared): Web2SuppliersCache helper cho dropdown NCC _(2026-05-30)_
- `774e01f56` auto: session update _(2026-05-30)_
- `1a4641596` feat(web2): migrate all Web 2.0 stores localStorage → IndexedDB _(2026-05-30)_
- `42b5b9282` auto: session update _(2026-05-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260530-165621-26defed` cho Claude walk chain theo CLAUDE.md protocol.
