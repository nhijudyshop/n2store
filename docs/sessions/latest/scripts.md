# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-195454-cc865c3`
**Session file**: [`./20260604-195454-cc865c3.md`](../20260604-195454-cc865c3.md)
**Commit**: `cc865c3` — feat(web2): quan ly may in + in thang IP:port (print-bridge ESC/POS raster) + gan may theo chuc nang
**Last updated**: 2026-06-04 19:54:54 +07
**Summary**: feat(web2): quan ly may in + in thang IP:port (print-bridge ESC/POS raster) + gan may theo chuc nang

## Files changed in this commit (`scripts/`)

- `scripts/print-bridge.js`

## Last 5 commits touching `scripts/`

- `cc865c318` feat(web2): quan ly may in + in thang IP:port (print-bridge ESC/POS raster) + gan may theo chuc nang _(2026-06-04)_
- `8ca7391c9` fix(PBH): luu carrier*name khi tao tu native-order (PBH SHOP/phuong thuc hien tren bill+badge) *(2026-06-04)\_
- `4046fe3ac` feat(web2): trang cau hinh Phuong thuc giao hang (entity deliveryzone) + menu Cau hinh _(2026-06-04)_
- `d1982a67b` refactor(web2 supplier-debt): cat sach coupling TPOS/inventory*shipments (Web 1.0) *(2026-06-04)\_
- `dce18bb44` feat(web2): localize anh SP (data URL webp) + hover zoom reconcile _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-195454-cc865c3` cho Claude walk chain theo CLAUDE.md protocol.
