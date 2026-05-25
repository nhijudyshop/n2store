# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260525-111538-fea793f`
**Session file**: [`./20260525-111538-fea793f.md`](../20260525-111538-fea793f.md)
**Commit**: `fea793f` — auto: session update
**Last updated**: 2026-05-25 11:15:38 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/products/index.html`
- `web2/products/js/web2-products-print.js`

## Last 5 commits touching `web2/`

- `b915d1cb8` fix(web2/products): bỏ TPOS barcode endpoint — JsBarcode CDN, zero tpos.vn _(2026-05-25)_
- `609d7c707` auto: session update _(2026-05-25)_
- `19924a384` feat(web2/products): in tem 100% giống TPOS — port BarcodeLabelDialog _(2026-05-25)_
- `60236a1da` feat(web2): Excel "Tải về" build client-side từ native-orders thay vì TPOS _(2026-05-25)_
- `4e0343b68` auto: session update _(2026-05-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260525-111538-fea793f` cho Claude walk chain theo CLAUDE.md protocol.
