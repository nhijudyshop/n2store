# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-180152-c70542e`
**Session file**: [`./20260605-180152-c70542e.md`](../20260605-180152-c70542e.md)
**Commit**: `c70542e` — auto: session update
**Last updated**: 2026-06-05 18:01:52 +07
**Summary**: auto: session update

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`

## Last 5 commits touching `tpos-pancake/`

- `c70542eee` auto: session update _(2026-06-05)_
- `6502f392f` feat(tpos-pancake): enrich SĐT/địa chỉ comment từ kho khách hàng theo fb*id (TPOS trước, kho KH lấp chỗ trống, batch /customers/batch fb_ids) *(2026-06-05)\_
- `d65400306` feat(web2): tu dong lam giau kho KH (fb*id) khi bat chat Pancake moi noi *(2026-06-04)\_
- `ba21c5780` perf(tpos-pancake): fix drop-feedback CSS (tpos rows) + drag delegation + search debounce _(2026-06-04)_
- `af4767e14` feat(web2): Phase 3 namespace — dual-mount /api/web2/<entity> + frontend đổi /api/v2/_ piggyback → /api/web2/_ (notifications,audit-log,kpi,dashboard,smart-match,supplier-360,supplier-aging,inventory-forecast,cart) _(2026-06-03)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-180152-c70542e` cho Claude walk chain theo CLAUDE.md protocol.
