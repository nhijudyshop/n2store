# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-092929-195f358`
**Session file**: [`./20260615-092929-195f358.md`](../20260615-092929-195f358.md)
**Commit**: `195f358` — docs(dev-log): TPOS đợt 2 deployed + verified (env dead removed, batch endpoints live)
**Last updated**: 2026-06-15 09:29:29 +07
**Summary**: docs(dev-log): TPOS đợt 2 deployed + verified (env dead removed, batch endpoints live)

## Files changed in this commit (`web2/`)

- `web2/customer-wallet/index.html`
- `web2/customer-wallet/js/web2-wallet-api.js`
- `web2/fastsaleorder-invoice/index.html`
- `web2/fastsaleorder-invoice/pbh-app.js`

## Last 5 commits touching `web2/`

- `81adccb7e` refactor(web2): gỡ TPOS perm registry + 3 N+1 batch endpoint (đợt 2) _(2026-06-15)_
- `4a175cd12` auto: session update _(2026-06-14)_
- `bdc3e869f` fix(web2-zalo): heal tên hội thoại USER 1-1 bị thành tên SHOP (shop nhắn cuối) _(2026-06-14)_
- `cee3b76ab` auto: session update _(2026-06-14)_
- `c07c03da5` chore(web2): xoá dead code web2-bulk-import.js + selector mồ côi .w2-bulk-modal _(2026-06-14)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-092929-195f358` cho Claude walk chain theo CLAUDE.md protocol.
