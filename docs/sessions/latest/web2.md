# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260606-200501-667b583`
**Session file**: [`./20260606-200501-667b583.md`](../20260606-200501-667b583.md)
**Commit**: `667b583` — auto: session update
**Last updated**: 2026-06-06 20:05:01 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/returns/css/returns.css`
- `web2/returns/index.html`
- `web2/returns/js/returns-api.js`
- `web2/returns/js/returns-app.js`
- `web2/shared/web2-return-bill.js`

## Last 5 commits touching `web2/`

- `667b58307` auto: session update _(2026-06-06)_
- `5059bc581` auto: session update _(2026-06-06)_
- `abf02a354` fix(web2-products-print): render barcode = PNG canvas (giống TPOS) thay SVG _(2026-06-06)_
- `5cd867bf4` feat(web2): click pill Ví → lịch sử thanh toán KH (mọi nơi có tên/SĐT) _(2026-06-06)_
- `207dbc12c` fix(web2-products-print): barcode crisp dot-aligned (quét được mã dài) + giữ khổ 2 Tem 25mm mặc định _(2026-06-06)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260606-200501-667b583` cho Claude walk chain theo CLAUDE.md protocol.
