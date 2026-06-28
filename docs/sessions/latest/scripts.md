# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-205615-e295242`
**Session file**: [`./20260628-205615-e295242.md`](../20260628-205615-e295242.md)
**Commit**: `e295242` — feat(web2-vn-address): bộ chọn Tỉnh/TP → Phường/Xã dùng chung (vietnamese-provinces-database, MIT)
**Last updated**: 2026-06-28 20:56:15 +07
**Summary**: Web2VnAddress: bộ chọn Tỉnh/TP→Phường/Xã (vietnamese-provinces-database MIT) tích hợp customers + native-orders

## Files changed in this commit (`scripts/`)

- `scripts/gen-vn-address-data.js`

## Last 5 commits touching `scripts/`

- `e2952425a` feat(web2-vn-address): bộ chọn Tỉnh/TP → Phường/Xã dùng chung (vietnamese-provinces-database, MIT) _(2026-06-28)_
- `20c99cbbd` feat(sepay-invoices): push snapshot từ máy IP nhà + link trực tiếp khi Cloudflare chặn _(2026-06-28)_
- `881c19b4a` fix(web2/bill): PBH thermal QR sạch (bỏ mã giữa QR) + mã PBH dưới QR _(2026-06-25)_
- `4e3d28151` auto: session update _(2026-06-25)_
- `fcebc6ea2` feat(web2/system): thống kê trang↔module + 2 doc agent-reference (PAGE-MODULES + THIRD-PARTIES) _(2026-06-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-205615-e295242` cho Claude walk chain theo CLAUDE.md protocol.
