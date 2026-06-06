# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260606-193727-abf02a3`
**Session file**: [`./20260606-193727-abf02a3.md`](../20260606-193727-abf02a3.md)
**Commit**: `abf02a3` — fix(web2-products-print): render barcode = PNG canvas (giống TPOS) thay SVG
**Last updated**: 2026-06-06 19:37:27 +07
**Summary**: fix(web2-products-print): render barcode = PNG canvas (giống TPOS) thay SVG

## Files changed in this commit (`web2/`)

- `web2/products/index.html`
- `web2/products/js/web2-products-print.js`

## Last 5 commits touching `web2/`

- `abf02a354` fix(web2-products-print): render barcode = PNG canvas (giống TPOS) thay SVG _(2026-06-06)_
- `5cd867bf4` feat(web2): click pill Ví → lịch sử thanh toán KH (mọi nơi có tên/SĐT) _(2026-06-06)_
- `207dbc12c` fix(web2-products-print): barcode crisp dot-aligned (quét được mã dài) + giữ khổ 2 Tem 25mm mặc định _(2026-06-06)_
- `723c7d924` feat(web2-products-print): đặt khổ tem rộng 50×30mm làm mặc định _(2026-06-06)_
- `a0418691e` feat(web2-products-print): cảnh báo mã quá dài cho khổ tem + thêm tem rộng 50mm _(2026-06-06)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260606-193727-abf02a3` cho Claude walk chain theo CLAUDE.md protocol.
