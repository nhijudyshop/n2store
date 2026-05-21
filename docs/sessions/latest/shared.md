# Latest Snapshot — `shared/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-113334-411482c`
**Session file**: [`./20260521-113334-411482c.md`](../20260521-113334-411482c.md)
**Commit**: `411482c` — feat(domain): rewire codebase sang custom domain nhijudy.store
**Last updated**: 2026-05-21 11:33:34 +07
**Summary**: feat(domain): rewire codebase sang custom domain nhijudy.store

## Files changed in this commit (`shared/`)

- `shared/universal/cors-headers.js`

## Last 5 commits touching `shared/`

- `411482c3` feat(domain): rewire codebase sang custom domain nhijudy.store _(2026-05-21)_
- `76fc24cd` fix(tpos-pancake): gỡ legacy auth → opt-in qua flag \__SKIP_LEGACY_NAV_AUTH _(2026-05-18)\_
- `cc2c8ff4` refactor(web2): move web2-products + web2-variants into web2/ _(2026-05-18)_
- `0c3c1310` chore(web2): xóa nốt fastpurchaseorder-refund + audit data flow _(2026-05-18)_
- `034b2608` chore(web2): xóa 2 trang TPOS-clone product-template + product-variant _(2026-05-17)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-113334-411482c` cho Claude walk chain theo CLAUDE.md protocol.
