# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-104500-3af9039`
**Session file**: [`./20260604-104500-3af9039.md`](../20260604-104500-3af9039.md)
**Commit**: `3af9039` — feat(so-order): seed Sổ Order ảo theo kho SP (Firestore web2_so_order)
**Last updated**: 2026-06-04 10:45:00 +07
**Summary**: feat(so-order): seed Sổ Order ảo theo kho SP (Firestore web2_so_order)

## Files changed in this commit (`scripts/`)

- `scripts/web2-seed-so-order.js`

## Last 5 commits touching `scripts/`

- `3af903913` feat(so-order): seed Sổ Order ảo theo kho SP (Firestore web2*so_order) *(2026-06-04)\_
- `f27b57581` chore(web2): scripts wipe+reseed data ảo (mã SP đúng Web2ProductCode) + verify _(2026-06-04)_
- `cd029da6d` fix(web2): generic /api/web2 route shadow dedicated → data 3 trang load lại _(2026-06-04)_
- `826c87c70` feat(web2): Phase 6 CUTOVER — flip 26 route web2 + webhook + crons sang web2Db (Web 1.0 không đụng) _(2026-06-03)_
- `b2e8d4c20` chore(web2): xóa trang sale-online-facebook + dừng cron sync 15min _(2026-06-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-104500-3af9039` cho Claude walk chain theo CLAUDE.md protocol.
