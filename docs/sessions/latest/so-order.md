# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260518-175801-f5cb1cb`
**Session file**: [`./20260518-175801-f5cb1cb.md`](../20260518-175801-f5cb1cb.md)
**Commit**: `f5cb1cb` — fix(so-order): bỏ giật khi sync — skip Firestore snapshot có hasPendingWrites
**Last updated**: 2026-05-18 17:58:01 +07
**Summary**: fix(so-order): bỏ giật khi sync — skip Firestore snapshot có hasPendingWrites

## Files changed in this commit (`so-order/`)

- `so-order/js/so-order-storage.js`

## Last 5 commits touching `so-order/`

- `f5cb1cb3` fix(so-order): bỏ giật khi sync — skip Firestore snapshot có hasPendingWrites _(2026-05-18)_
- `3e5e034a` feat(so-order): inline edit Ngày giao / Đợt / Kiện / KG ở shipment header (click → input → Enter/blur commit) _(2026-05-18)_
- `4b338d24` feat(so-order): bảng giống native-orders — font Segoe UI + header bg + button action màu _(2026-05-18)_
- `0cb8e8da` feat(so-order): table grid lines + zebra + hover (style giống native-orders) _(2026-05-18)_
- `c6f1321f` feat(web2-products+so-order): full 2-way sync delete/edit qty ⇄ pending*qty *(2026-05-18)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260518-175801-f5cb1cb` cho Claude walk chain theo CLAUDE.md protocol.
