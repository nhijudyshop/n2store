# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-202517-2a85aca`
**Session file**: [`./20260630-202517-2a85aca.md`](../20260630-202517-2a85aca.md)
**Commit**: `2a85aca` — fix(web2 reconcile): scanner-box tràn — nút camera/OCR lòi ra ngoài viền bo tròn
**Last updated**: 2026-06-30 20:25:17 +07
**Summary**: fix scanner-box tràn: nút camera/OCR giữ trong viền (min-width:0 + pill ellipsis)

## Files changed in this commit (`web2/`)

- `web2/reconcile/css/reconcile.css`
- `web2/reconcile/index.html`

## Last 5 commits touching `web2/`

- `2a85aca87` fix(web2 reconcile): scanner-box tràn — nút camera/OCR lòi ra ngoài viền bo tròn _(2026-06-30)_
- `4aed60423` fix(web2 zalo): QR đăng nhập lỗi ảnh vỡ — re-add data:image/png;base64 prefix bị zca-js bóc _(2026-06-30)_
- `24195eb88` refactor(web2 product-units): gom builder per-tem về Web2ProductUnits.printUnit _(2026-06-30)_
- `f547f29fd` auto: session update _(2026-06-30)_
- `2ae3f068d` feat(web2 products-print): in STT kệ TO lên tem per-unit (phải QR, dưới giá) _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-202517-2a85aca` cho Claude walk chain theo CLAUDE.md protocol.
