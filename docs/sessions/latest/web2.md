# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-202247-4aed604`
**Session file**: [`./20260630-202247-4aed604.md`](../20260630-202247-4aed604.md)
**Commit**: `4aed604` — fix(web2 zalo): QR đăng nhập lỗi ảnh vỡ — re-add data:image/png;base64 prefix bị zca-js bóc
**Last updated**: 2026-06-30 20:22:47 +07
**Summary**: fix web2 zalo QR login broken image (re-add data:image base64 prefix)

## Files changed in this commit (`web2/`)

- `web2/zalo/index.html`
- `web2/zalo/js/web2-zalo-accounts.js`

## Last 5 commits touching `web2/`

- `4aed60423` fix(web2 zalo): QR đăng nhập lỗi ảnh vỡ — re-add data:image/png;base64 prefix bị zca-js bóc _(2026-06-30)_
- `24195eb88` refactor(web2 product-units): gom builder per-tem về Web2ProductUnits.printUnit _(2026-06-30)_
- `f547f29fd` auto: session update _(2026-06-30)_
- `2ae3f068d` feat(web2 products-print): in STT kệ TO lên tem per-unit (phải QR, dưới giá) _(2026-06-30)_
- `970df859a` fix(web2 reconcile): audit fixes — keydown guard, audit-log in-tx, returned tab, a11y, UX kho _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-202247-4aed604` cho Claude walk chain theo CLAUDE.md protocol.
