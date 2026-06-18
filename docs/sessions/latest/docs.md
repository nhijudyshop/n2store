# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260618-120214-17158a4`
**Session file**: [`./20260618-120214-17158a4.md`](../20260618-120214-17158a4.md)
**Commit**: `17158a4` — fix(delivery-report): tab ĐƠN 0đ hiện đủ Thành phố/NAP/Thu về (không chỉ Shop+Tomato)
**Last updated**: 2026-06-18 12:02:14 SEAST
**Summary**: delivery-report: tab ĐƠN 0đ hiện đủ Thành phố/NAP/Thu về (giữ cột TOMATO), frontend-only

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `17158a4c3` fix(delivery-report): tab ĐƠN 0đ hiện đủ Thành phố/NAP/Thu về (không chỉ Shop+Tomato) _(2026-06-18)_
- `220fbc58f` chore(session): RESUME:20260617-211914-d68cf95 _(2026-06-17)_
- `d68cf952d` feat(web2): Popup dùng chung — alert/confirm/popup nhiều loại + hiệu ứng custom + migrate toàn cục _(2026-06-17)_
- `75f7c5a08` fix(native-orders): bộ lọc chiến dịch NHÓM (cha) vs RIÊNG LẺ (bài) — loại trừ 2 chiều + tự chọn 2 bài mới nhất _(2026-06-17)_
- `08f7c6906` feat(pancake-settings): nút 'Đồng bộ pages từ token' — sửa account có quyền page nhưng pages cache rỗng _(2026-06-17)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260618-120214-17158a4` cho Claude walk chain theo CLAUDE.md protocol.
