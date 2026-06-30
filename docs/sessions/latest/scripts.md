# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-164920-19471a7`
**Session file**: [`./20260630-164920-19471a7.md`](../20260630-164920-19471a7.md)
**Commit**: `19471a7` — auto: session update
**Last updated**: 2026-06-30 16:49:20 +07
**Summary**: auto: session update

## Files changed in this commit (`scripts/`)

- `scripts/print-bridge.js`
- `scripts/print-bridge.ps1`

## Last 5 commits touching `scripts/`

- `19471a7f8` auto: session update _(2026-06-30)_
- `be910cb67` fix(nav): purge dead tpos-pancake/ paths → live-chat/ (nav href, permissions-registry, 17 test scripts) _(2026-06-29)_
- `e2952425a` feat(web2-vn-address): bộ chọn Tỉnh/TP → Phường/Xã dùng chung (vietnamese-provinces-database, MIT) _(2026-06-28)_
- `20c99cbbd` feat(sepay-invoices): push snapshot từ máy IP nhà + link trực tiếp khi Cloudflare chặn _(2026-06-28)_
- `881c19b4a` fix(web2/bill): PBH thermal QR sạch (bỏ mã giữa QR) + mã PBH dưới QR _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-164920-19471a7` cho Claude walk chain theo CLAUDE.md protocol.
