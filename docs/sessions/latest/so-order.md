# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-102841-32a6ce5`
**Session file**: [`./20260628-102841-32a6ce5.md`](../20260628-102841-32a6ce5.md)
**Commit**: `32a6ce5` — fix(so-order): picker không auto-đặt tên cho dòng đã chọn SP (matchedCode)
**Last updated**: 2026-06-28 10:28:41 +07
**Summary**: fix(so-order): picker không auto-đặt tên cho dòng đã chọn SP (matchedCode)

## Files changed in this commit (`so-order/`)

- `so-order/index.html`
- `so-order/js/so-order-modal-core.js`

## Last 5 commits touching `so-order/`

- `32a6ce594` fix(so-order): picker không auto-đặt tên cho dòng đã chọn SP (matchedCode) _(2026-06-28)_
- `71b9d98e9` auto: session update _(2026-06-28)_
- `ff504d7ac` feat(so-order): SP cha nhiều biến thể = khối tách biệt rõ (giữ NCC/Ảnh-HĐ rowspan) _(2026-06-28)_
- `6e4a6160a` feat(so-order): gom SP cha nhiều biến thể — tên cha 1 lần, biến thể '↳' thụt khối _(2026-06-27)_
- `034a95081` auto: session update _(2026-06-27)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-102841-32a6ce5` cho Claude walk chain theo CLAUDE.md protocol.
