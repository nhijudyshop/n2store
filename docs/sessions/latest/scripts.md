# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260523-101112-f9995fb`
**Session file**: [`./20260523-101112-f9995fb.md`](../20260523-101112-f9995fb.md)
**Commit**: `f9995fb` — fix(snap): credentials 'include' → 'omit' để bypass CORS preflight block
**Last updated**: 2026-05-23 10:11:12 +07
**Summary**: fix(snap): credentials 'include' → 'omit' để bypass CORS preflight block

## Files changed in this commit (`scripts/`)

- `scripts/snap-fb-test.js`
- `scripts/snap-fb-test2.js`

## Last 5 commits touching `scripts/`

- `f9995fbd2` fix(snap): credentials 'include' → 'omit' để bypass CORS preflight block _(2026-05-23)_
- `bbab64083` fix(snap): button không nhấp nháy + chip floating fallback mount _(2026-05-23)_
- `5e5ec5372` fix(web2/products SSE): tách _sseReloadTimer + \_sseUsageTimer riêng _(2026-05-23)\_
- `1aa81b75c` refactor(v2/cart + tpos-pancake): giỏ TPOS panel = native*orders.products (1 nguồn) *(2026-05-22)\_
- `8976f129a` fix(delivery-report): excel buttons + export content match active groups (lite=TOMATO+SHOP) _(2026-05-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260523-101112-f9995fb` cho Claude walk chain theo CLAUDE.md protocol.
