# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-124941-b1bcd21`
**Session file**: [`./20260607-124941-b1bcd21.md`](../20260607-124941-b1bcd21.md)
**Commit**: `b1bcd21` — fix(orders): lần in gắn cạnh #STT trên bill (bỏ dòng meta riêng, tiết kiệm diện tích)
**Last updated**: 2026-06-07 12:49:41 +07
**Summary**: fix(orders): lần in gắn cạnh #STT trên bill (bỏ dòng meta riêng, tiết kiệm diện tích)

## Files changed in this commit (`web2/`)

- `web2/shared/web2-bill-service.js`

## Last 5 commits touching `web2/`

- `b1bcd21bc` fix(orders): lần in gắn cạnh #STT trên bill (bỏ dòng meta riêng, tiết kiệm diện tích) _(2026-06-07)_
- `ad5500b6c` feat(web2/returns): Vấn đề khách/shipper, thu về 1 phần theo đơn, Sửa COD (shipper) _(2026-06-07)_
- `b3d273449` auto: session update _(2026-06-07)_
- `a0d703e31` feat(orders): số lần in lên phiếu in (bill PBH + Phiếu Soạn Hàng) thay vì badge list _(2026-06-07)_
- `1d998cfcf` fix(so-order,purchase-refund): mã SP draft đúng format KHO + ẩn dropdown rỗng + tách đơn trả hàng theo đợt _(2026-06-07)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-124941-b1bcd21` cho Claude walk chain theo CLAUDE.md protocol.
