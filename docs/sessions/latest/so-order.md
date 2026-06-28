# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-233732-88ae387`
**Session file**: [`./20260628-233732-88ae387.md`](../20260628-233732-88ae387.md)
**Commit**: `88ae387` — fix(so-order): import "Đã nhận" → draft (tránh row kẹt) + dev-log Task 4 verified
**Last updated**: 2026-06-28 23:37:32 +07
**Summary**: Auto-gán unit theo giỏ STT (ít lịch sử→seq) + In tem per-unit + bỏ nút Gán + import fix — verified live

## Files changed in this commit (`so-order/`)

- `so-order/index.html`
- `so-order/js/so-order-import.js`

## Last 5 commits touching `so-order/`

- `88ae3878e` fix(so-order): import "Đã nhận" → draft (tránh row kẹt) + dev-log Task 4 verified _(2026-06-28)_
- `7e6950dfe` fix(so-order): audit fixes — per-unit QR on main receive path + orphan dropdown on modal close _(2026-06-28)_
- `a56562d38` fix(so-order): server-authoritative sync — wipe DB sticks (kill local-first footgun) _(2026-06-28)_
- `8f37cffac` feat(so-order): Dien ngau nhien bom nhieu data hon - LOAI bien the (Ao/Quan/Dam/Vay/Giay/Dep) tu ProductTypesCache + 12 NCC + 2-6 dong; reset-flow wipe target _(2026-06-28)_
- `d636b1ea7` feat(web2-product-units): mã đơn vị + QR riêng/món + trang quét định tuyến kệ STT _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-233732-88ae387` cho Claude walk chain theo CLAUDE.md protocol.
