# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-124106-b3d2734`
**Session file**: [`./20260607-124106-b3d2734.md`](../20260607-124106-b3d2734.md)
**Commit**: `b3d2734` — auto: session update
**Last updated**: 2026-06-07 12:41:06 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `a0d703e31` feat(orders): số lần in lên phiếu in (bill PBH + Phiếu Soạn Hàng) thay vì badge list _(2026-06-07)_
- `1d998cfcf` fix(so-order,purchase-refund): mã SP draft đúng format KHO + ẩn dropdown rỗng + tách đơn trả hàng theo đợt _(2026-06-07)_
- `014385db9` chore(session): RESUME:20260607-120031-05403e4 _(2026-06-07)_
- `05403e47e` auto: session update _(2026-06-07)_
- `8227e4c1a` chore(session): RESUME:20260607-113343-79c5d1b _(2026-06-07)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-124106-b3d2734` cho Claude walk chain theo CLAUDE.md protocol.
