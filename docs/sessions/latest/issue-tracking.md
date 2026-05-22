# Latest Snapshot — `issue-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260522-144551-1015d5b`
**Session file**: [`./20260522-144551-1015d5b.md`](../20260522-144551-1015d5b.md)
**Commit**: `1015d5b` — feat(web2/products): NCC dropdown từ so_order_v2 + auto-regen mã khi đổi NCC/Tên/Biến thể
**Last updated**: 2026-05-22 14:45:51 +07
**Summary**: feat(web2/products): NCC dropdown từ so_order_v2 + auto-regen mã khi đổi NCC/Tên/Biến thể

## Files changed in this commit (`issue-tracking/`)

- `issue-tracking/js/customer-orders-lookup.js`
- `issue-tracking/js/script.js`

## Last 5 commits touching `issue-tracking/`

- `90dadc4c3` fix(issue-tracking): ép timestamp hiển thị về UTC+7 (Asia/Ho*Chi_Minh) *(2026-05-22)\_
- `7cfb01320` chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b _(2026-05-21)_
- `36f8a0a6b` feat(issue-tracking): nút copy bên cạnh mọi SĐT 10 số _(2026-05-15)_
- `15829d6a2` auto: session update _(2026-05-15)_
- `1fc067bd5` feat(issue-tracking): hiển thị Ghi chú (Comment) + Ghi chú giao hàng (DeliveryNote) trong customer lookup _(2026-05-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260522-144551-1015d5b` cho Claude walk chain theo CLAUDE.md protocol.
