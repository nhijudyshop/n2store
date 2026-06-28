# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-204449-b3b021b`
**Session file**: [`./20260628-204449-b3b021b.md`](../20260628-204449-b3b021b.md)
**Commit**: `b3b021b` — feat(sidebar): thêm 'Quét tem đóng gói' (web2/unit-scan) vào nhóm Bán Hàng
**Last updated**: 2026-06-28 20:44:49 +07
**Summary**: feat(sidebar): thêm 'Quét tem đóng gói' (web2/unit-scan) vào nhóm Bán Hàng

## Files changed in this commit (`web2/`)

- `web2/shared/web2-sidebar.js`

## Last 5 commits touching `web2/`

- `b3b021bbb` feat(sidebar): thêm 'Quét tem đóng gói' (web2/unit-scan) vào nhóm Bán Hàng _(2026-06-28)_
- `7d1f0653a` auto: session update _(2026-06-28)_
- `c4679e281` feat(clearance): Kho hàng rớt xả (derived/lazy, 0 cron) + aging tiers + reversible override _(2026-06-28)_
- `1da7e99c6` feat(web2-products): nút In lại tem đơn vị (Web2UnitReprint shared) — chọn mã đơn vị qr1..qrN rồi in _(2026-06-28)_
- `52c4e4591` feat(unit-scan): nút In lại tem 1 đơn vị (reuse Web2ProductsPrint) + fix hero khi mọi đơn đã đủ _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-204449-b3b021b` cho Claude walk chain theo CLAUDE.md protocol.
