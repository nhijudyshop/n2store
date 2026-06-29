# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-162120-17f400a`
**Session file**: [`./20260629-162120-17f400a.md`](../20260629-162120-17f400a.md)
**Commit**: `17f400a` — feat(sort-station): trang "Bàn chia hàng" 📱 — put-wall sortation guided
**Last updated**: 2026-06-29 16:21:20 +07
**Summary**: Trang MỚI Bàn chia hàng (sort-station) — put-wall guided: quét→KỆ+đủ/thiếu+manifest; verified e2e

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`
- `docs/web2/KB-PRODUCT-CODE-UNITS.md`
- `docs/web2/WEB2-CODEMAP.md`
- `docs/web2/WEB2-PAGE-MODULES.md`
- `docs/web2/web2-codemap.json`

## Last 5 commits touching `docs/`

- `17f400a21` feat(sort-station): trang "Bàn chia hàng" 📱 — put-wall sortation guided _(2026-06-29)_
- `d52e29ecb` chore(session): RESUME:20260629-151039-a13f211 _(2026-06-29)_
- `a13f211cf` fix(order-tags): co*coc tính cọc GIỎ (native deposit) + MAX cọc PBH, không đè mất *(2026-06-29)\_
- `564e6cad4` chore(session): RESUME:20260629-150214-0290c61 _(2026-06-29)_
- `0290c61e0` feat(order-tags): activate + fix co*coc (enrich PBH deposit) + ship_tinh/ship_tp (derive zone từ địa chỉ) *(2026-06-29)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-162120-17f400a` cho Claude walk chain theo CLAUDE.md protocol.
