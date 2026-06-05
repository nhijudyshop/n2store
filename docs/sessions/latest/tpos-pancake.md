# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-120152-6502f39`
**Session file**: [`./20260605-120152-6502f39.md`](../20260605-120152-6502f39.md)
**Commit**: `6502f39` — feat(tpos-pancake): enrich SĐT/địa chỉ comment từ kho khách hàng theo fb_id (TPOS trước, kho KH lấp chỗ trống, batch /customers/batch fb_ids)
**Last updated**: 2026-06-05 12:01:52 +07
**Summary**: feat(tpos-pancake): enrich SĐT/địa chỉ comment từ kho khách hàng theo fb_id (TPOS trước, kho KH lấp ch...

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`
- `tpos-pancake/js/tpos/tpos-comment-list.js`
- `tpos-pancake/js/tpos/tpos-kho-enricher.js`
- `tpos-pancake/js/tpos/tpos-state.js`

## Last 5 commits touching `tpos-pancake/`

- `6502f392f` feat(tpos-pancake): enrich SĐT/địa chỉ comment từ kho khách hàng theo fb*id (TPOS trước, kho KH lấp chỗ trống, batch /customers/batch fb_ids) *(2026-06-05)\_
- `d65400306` feat(web2): tu dong lam giau kho KH (fb*id) khi bat chat Pancake moi noi *(2026-06-04)\_
- `ba21c5780` perf(tpos-pancake): fix drop-feedback CSS (tpos rows) + drag delegation + search debounce _(2026-06-04)_
- `af4767e14` feat(web2): Phase 3 namespace — dual-mount /api/web2/<entity> + frontend đổi /api/v2/_ piggyback → /api/web2/_ (notifications,audit-log,kpi,dashboard,smart-match,supplier-360,supplier-aging,inventory-forecast,cart) _(2026-06-03)_
- `f3f77419b` feat(web2): hiển thị số dư ví KH khắp nơi + tìm 5-10 số đuôi SĐT + ẩn Tổng tiền vào _(2026-06-02)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-120152-6502f39` cho Claude walk chain theo CLAUDE.md protocol.
