# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260522-181836-6b05bc3`
**Session file**: [`./20260522-181836-6b05bc3.md`](../20260522-181836-6b05bc3.md)
**Commit**: `6b05bc3` — fix(tpos-pancake): đơn drag SP mất fbPageId/fbPostId không mở chat được
**Last updated**: 2026-05-22 18:18:36 +07
**Summary**: fix(tpos-pancake): đơn drag SP mất fbPageId/fbPostId không mở chat được

## Files changed in this commit (`render.com/`)

- `render.com/routes/v2/cart.js`

## Last 5 commits touching `render.com/`

- `6b05bc3cb` fix(tpos-pancake): đơn drag SP mất fbPageId/fbPostId không mở chat được _(2026-05-22)_
- `ea15fb97b` feat(tpos-pancake/cart + native-orders): giữ cart 15 ngày + auto-clear khi tạo PBH + stock sync _(2026-05-22)_
- `ea3553cd5` fix(tpos-pancake/inv): cart gắn theo CUSTOMER (fbUserId), không phải comment*id *(2026-05-22)\_
- `5afc48ef3` fix(balance-history): dual-write balance*history → web2_balance_history cho Live Mode + migration 082 self-heal *(2026-05-22)\_
- `2d48920ac` feat(tpos-pancake/inv): kéo SP = tạo native-order sau 5s undo + sync remove/clear với native-orders _(2026-05-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260522-181836-6b05bc3` cho Claude walk chain theo CLAUDE.md protocol.
