# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-201946-c4679e2`
**Session file**: [`./20260628-201946-c4679e2.md`](../20260628-201946-c4679e2.md)
**Commit**: `c4679e2` — feat(clearance): Kho hàng rớt xả (derived/lazy, 0 cron) + aging tiers + reversible override
**Last updated**: 2026-06-28 20:19:46 +07
**Summary**: feat(clearance): Kho hàng rớt xả (derived/lazy, 0 cron) + aging tiers + reversible override

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`
- `docs/web2/PER-UNIT-QR-PLAN.md`

## Last 5 commits touching `docs/`

- `c4679e281` feat(clearance): Kho hàng rớt xả (derived/lazy, 0 cron) + aging tiers + reversible override _(2026-06-28)_
- `0650095fb` chore(session): RESUME:20260628-194726-1da7e99 _(2026-06-28)_
- `b830c6460` chore(session): RESUME:20260628-193532-52c4e45 _(2026-06-28)_
- `bfdcf3851` chore(session): RESUME:20260628-192722-d636b1e _(2026-06-28)_
- `d636b1ea7` feat(web2-product-units): mã đơn vị + QR riêng/món + trang quét định tuyến kệ STT _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-201946-c4679e2` cho Claude walk chain theo CLAUDE.md protocol.
