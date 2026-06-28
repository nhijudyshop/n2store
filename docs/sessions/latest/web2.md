# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-205615-e295242`
**Session file**: [`./20260628-205615-e295242.md`](../20260628-205615-e295242.md)
**Commit**: `e295242` — feat(web2-vn-address): bộ chọn Tỉnh/TP → Phường/Xã dùng chung (vietnamese-provinces-database, MIT)
**Last updated**: 2026-06-28 20:56:15 +07
**Summary**: Web2VnAddress: bộ chọn Tỉnh/TP→Phường/Xã (vietnamese-provinces-database MIT) tích hợp customers + native-orders

## Files changed in this commit (`web2/`)

- `web2/shared/data/vn-units.json`
- `web2/shared/web2-vn-address.js`
- `web2/system/data/web2-modules.json`
- `web2/system/data/web2-third-parties.json`

## Last 5 commits touching `web2/`

- `e2952425a` feat(web2-vn-address): bộ chọn Tỉnh/TP → Phường/Xã dùng chung (vietnamese-provinces-database, MIT) _(2026-06-28)_
- `b3b021bbb` feat(sidebar): thêm 'Quét tem đóng gói' (web2/unit-scan) vào nhóm Bán Hàng _(2026-06-28)_
- `7d1f0653a` auto: session update _(2026-06-28)_
- `c4679e281` feat(clearance): Kho hàng rớt xả (derived/lazy, 0 cron) + aging tiers + reversible override _(2026-06-28)_
- `1da7e99c6` feat(web2-products): nút In lại tem đơn vị (Web2UnitReprint shared) — chọn mã đơn vị qr1..qrN rồi in _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-205615-e295242` cho Claude walk chain theo CLAUDE.md protocol.
