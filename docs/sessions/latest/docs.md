# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260601-185926-b1b5d7c`
**Session file**: [`./20260601-185926-b1b5d7c.md`](../20260601-185926-b1b5d7c.md)
**Commit**: `b1b5d7c` — feat(tpos-pancake+native-orders): tạo đơn từ tpos-pancake → SĐT+địa chỉ từ TPOS partner cache + fix nút Lấy TPOS
**Last updated**: 2026-06-01 18:59:26 +07
**Summary**: feat(tpos-pancake+native-orders): tạo đơn từ tpos-pancake → SĐT+địa chỉ từ TPOS partner cache + fix n...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `b1b5d7c15` feat(tpos-pancake+native-orders): tạo đơn từ tpos-pancake → SĐT+địa chỉ từ TPOS partner cache + fix nút Lấy TPOS _(2026-06-01)_
- `d38404d6f` chore(session): RESUME:20260601-184527-2422759 _(2026-06-01)_
- `242275958` fix(tpos-pancake): bump partnerCache maxSize 200→2000 — không hiện SĐT/địa chỉ KH do LRU evict _(2026-06-01)_
- `bdf8f814e` style(inventory-tracking): financial row label + tiền ngoại tệ màu đen size x2, (VND) xám nhạt giữ size _(2026-06-01)_
- `ef1f89772` fix(orders-report): XL auto-flip ĐÃ RA ĐƠN mất ~50% + đơn ÂM MÃ hiển thị sai _(2026-06-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260601-185926-b1b5d7c` cho Claude walk chain theo CLAUDE.md protocol.
