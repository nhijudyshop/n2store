# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260601-184527-2422759`
**Session file**: [`./20260601-184527-2422759.md`](../20260601-184527-2422759.md)
**Commit**: `2422759` — fix(tpos-pancake): bump partnerCache maxSize 200→2000 — không hiện SĐT/địa chỉ KH do LRU evict
**Last updated**: 2026-06-01 18:45:27 +07
**Summary**: fix(tpos-pancake): bump partnerCache maxSize 200→2000 — không hiện SĐT/địa chỉ KH do LRU evict

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `242275958` fix(tpos-pancake): bump partnerCache maxSize 200→2000 — không hiện SĐT/địa chỉ KH do LRU evict _(2026-06-01)_
- `bdf8f814e` style(inventory-tracking): financial row label + tiền ngoại tệ màu đen size x2, (VND) xám nhạt giữ size _(2026-06-01)_
- `ef1f89772` fix(orders-report): XL auto-flip ĐÃ RA ĐƠN mất ~50% + đơn ÂM MÃ hiển thị sai _(2026-06-01)_
- `397da92e5` feat(virtual-credit): hạn cấp công nợ ảo 15 → 30 ngày (chỉ phiếu mới) + finalize refund per-line discount _(2026-06-01)_
- `30bc7800d` chore(session): RESUME:20260601-142549-fbfbba6 _(2026-06-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260601-184527-2422759` cho Claude walk chain theo CLAUDE.md protocol.
