# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-220850-881c19b`
**Session file**: [`./20260625-220850-881c19b.md`](../20260625-220850-881c19b.md)
**Commit**: `881c19b` — fix(web2/bill): PBH thermal QR sạch (bỏ mã giữa QR) + mã PBH dưới QR
**Last updated**: 2026-06-25 22:08:50 +07
**Summary**: PBH bill QR sạch + mã dưới QR; tem SP P1 verify real (in tem thật)

## Files changed in this commit (`web2/`)

- `web2/fastsaleorder-invoice/index.html`
- `web2/printer-settings/index.html`

## Last 5 commits touching `web2/`

- `881c19b4a` fix(web2/bill): PBH thermal QR sạch (bỏ mã giữa QR) + mã PBH dưới QR _(2026-06-25)_
- `4e3d28151` auto: session update _(2026-06-25)_
- `8d1162f25` feat(web2/video-beauty): skeleton-frame loading during video decode _(2026-06-25)_
- `83513cd80` feat(web2/print): QR đẹp + bố cục tem SP "2 tem" P1 (tên/biến thể/giá) + QR hoá đơn A4 _(2026-06-25)_
- `f574d593c` chore: remove accidentally-committed temp QR audit harness (TEMP scratch, unlinked) _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-220850-881c19b` cho Claude walk chain theo CLAUDE.md protocol.
