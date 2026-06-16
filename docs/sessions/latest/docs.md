# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-185932-694760b`
**Session file**: [`./20260616-185932-694760b.md`](../20260616-185932-694760b.md)
**Commit**: `694760b` — docs(dev-log): web2-products NCC-split match — verified live (cross-NCC riêng, same-NCC gộp, adjust đối xứng)
**Last updated**: 2026-06-16 18:59:32 +07
**Summary**: docs(dev-log): web2-products NCC-split match — verified live (cross-NCC riêng, same-NCC gộp, adjust đối xứng)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `694760bd3` docs(dev-log): web2-products NCC-split match — verified live (cross-NCC riêng, same-NCC gộp, adjust đối xứng) _(2026-06-16)_
- `6609ec405` fix(web2-products): upsert/adjust-pending match theo NCC — SP cùng tên+biến thể KHÁC NCC không gộp (mã prefix NCC riêng) _(2026-06-16)_
- `9c60daebb` feat(delivery-report): 2 thẻ thống kê lấy thẳng từ TPOS SumDeliveryReport (qua worker proxy) _(2026-06-16)_
- `28cffd657` chore(session): RESUME:20260616-183939-970000a _(2026-06-16)_
- `970000a95` fix(so-order): Sửa lô tách NCC per-row (lô = nguyên ngày giao, nhiều NCC) — ẩn ô NCC chung, thêm cột NCC mỗi dòng + picker Ví NCC _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-185932-694760b` cho Claude walk chain theo CLAUDE.md protocol.
