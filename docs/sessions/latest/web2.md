# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-210144-ac6e7b0`
**Session file**: [`./20260628-210144-ac6e7b0.md`](../20260628-210144-ac6e7b0.md)
**Commit**: `ac6e7b0` — auto: session update
**Last updated**: 2026-06-28 21:01:44 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/customers/js/customers-detail.js`
- `web2/shared/web2-vn-address.js`

## Last 5 commits touching `web2/`

- `ac6e7b042` auto: session update _(2026-06-28)_
- `e2952425a` feat(web2-vn-address): bộ chọn Tỉnh/TP → Phường/Xã dùng chung (vietnamese-provinces-database, MIT) _(2026-06-28)_
- `b3b021bbb` feat(sidebar): thêm 'Quét tem đóng gói' (web2/unit-scan) vào nhóm Bán Hàng _(2026-06-28)_
- `7d1f0653a` auto: session update _(2026-06-28)_
- `c4679e281` feat(clearance): Kho hàng rớt xả (derived/lazy, 0 cron) + aging tiers + reversible override _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-210144-ac6e7b0` cho Claude walk chain theo CLAUDE.md protocol.
