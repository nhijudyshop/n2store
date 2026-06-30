# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-165352-c23125c`
**Session file**: [`./20260630-165352-c23125c.md`](../20260630-165352-c23125c.md)
**Commit**: `c23125c` — auto: session update
**Last updated**: 2026-06-30 16:53:52 +07
**Summary**: auto: session update

## Files changed in this commit (`so-order/`)

- `so-order/index.html`

## Last 5 commits touching `so-order/`

- `c23125cd9` auto: session update _(2026-06-30)_
- `7d5d7b24e` feat(so-order): surface 'chờ hàng cần đặt' (giỏ nháp > tồn) → nút Cần đặt + thêm vào đơn [#2 follow-up] _(2026-06-30)_
- `5050372a0` feat(unit-scan): GỘP sort-station → "Quét tem" 2 chế độ + sơ đồ kệ vật lý + nhãn ô + fix overlay _(2026-06-29)_
- `17f400a21` feat(sort-station): trang "Bàn chia hàng" 📱 — put-wall sortation guided _(2026-06-29)_
- `e70726129` feat(print): tem QR sát lề trái + biến thể/giá lên đỉnh → chừa khoảng trống ghi bút _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-165352-c23125c` cho Claude walk chain theo CLAUDE.md protocol.
