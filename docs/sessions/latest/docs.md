# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260626-083217-c5d43f1`
**Session file**: [`./20260626-083217-c5d43f1.md`](../20260626-083217-c5d43f1.md)
**Commit**: `c5d43f1` — feat(web2/order-tags): trigger 'Có ghi chú SP' (ghi chú cấp dòng SP) + đổi tên co_ghi_chu → 'Có ghi chú đơn'
**Last updated**: 2026-06-26 08:32:17 +07
**Summary**: feat(web2/order-tags): trigger 'Có ghi chú SP' (ghi chú cấp dòng SP) + đổi tên co_ghi_chu → 'Có ghi chú...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `c5d43f19a` feat(web2/order-tags): trigger 'Có ghi chú SP' (ghi chú cấp dòng SP) + đổi tên co*ghi_chu → 'Có ghi chú đơn' *(2026-06-26)\_
- `4b4df9a4a` fix(web2/order-tags): thẻ KHÁCH LẠ trả về trigger khach*la (không có trong kho KH) + tách thẻ Thiếu địa chỉ *(2026-06-26)\_
- `6c4544bbf` chore(session): RESUME:20260626-074403-7bee461 _(2026-06-26)_
- `7bee461b8` feat(web2/order-tags): thêm 5 trigger (khach*la, co_ghi_chu, co_tin_nhan, co_binh_luan, da_doi_soat) *(2026-06-26)\_
- `aaaacbf0a` chore(session): RESUME:20260626-072001-d4a773b _(2026-06-26)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260626-083217-c5d43f1` cho Claude walk chain theo CLAUDE.md protocol.
