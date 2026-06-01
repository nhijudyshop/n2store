# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260601-102722-144e2ef`
**Session file**: [`./20260601-102722-144e2ef.md`](../20260601-102722-144e2ef.md)
**Commit**: `144e2ef` — auto: session update
**Last updated**: 2026-06-01 10:27:22 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/modules-manifest.js`
- `web2/sale-online-facebook/index.html`
- `web2/shared/page-shell.js`
- `web2/shared/tpos-sidebar.js`

## Last 5 commits touching `web2/`

- `144e2ef87` auto: session update _(2026-06-01)_
- `b2e8d4c20` chore(web2): xóa trang sale-online-facebook + dừng cron sync 15min _(2026-06-01)_
- `a92e02dd1` chore(web2): xóa 57 trang TPOS-clone stub không dùng + dọn sidebar/nav _(2026-06-01)_
- `cd5a5b850` feat(web2-balance-history): filter nhanh — Hôm nay/Hôm qua/Tuần này/Tuần trước/Tháng này/Tháng trước _(2026-06-01)_
- `08717f9c9` feat(kpi): Sprint 5 — fastsaleorder-invoice integration + user guide (FINAL) _(2026-06-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260601-102722-144e2ef` cho Claude walk chain theo CLAUDE.md protocol.
