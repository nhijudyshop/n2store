# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-105944-9cd8e13`
**Session file**: [`./20260519-105944-9cd8e13.md`](../20260519-105944-9cd8e13.md)
**Commit**: `9cd8e13` — feat(web2/balance-history): clone đầy đủ balance-history sang Web 2.0 + sidebar + SSE
**Last updated**: 2026-05-19 10:59:44 +07
**Summary**: feat(web2/balance-history): clone đầy đủ balance-history sang Web 2.0 + sidebar + SSE

## Files changed in this commit (`web2/`)

- `web2/balance-history/DATABASE_STRUCTURE.md`
- `web2/balance-history/css/accountant.css`
- `web2/balance-history/css/live-mode.css`
- `web2/balance-history/css/modern.css`
- `web2/balance-history/css/styles.css`
- `web2/balance-history/css/transfer-stats.css`
- `web2/balance-history/docs/ARCHITECTURE_balance_history.md`
- `web2/balance-history/docs/DEPLOYMENT_GUIDE.md`
- `web2/balance-history/docs/PARTIAL_PHONE_TPOS_SEARCH.md`
- `web2/balance-history/docs/PHONE_EXTRACTION_FEATURE.md`
- `web2/balance-history/docs/PHONE_EXTRACTION_IMPROVEMENTS.md`
- `web2/balance-history/docs/PHONE_PARTNER_FETCH_GUIDE.md`
- `web2/balance-history/docs/QR_DEBT_FLOW.md`
- `web2/balance-history/docs/README.md`
- `web2/balance-history/index.html`
- `web2/balance-history/js/accountant-history.js`
- `web2/balance-history/js/accountant.js`
- `web2/balance-history/js/balance-core.js`
- `web2/balance-history/js/balance-filters.js`
- `web2/balance-history/js/balance-table.js`
- `web2/balance-history/js/balance-verification.js`
- `web2/balance-history/js/config.js`
- `web2/balance-history/js/customer-info.js`
- `web2/balance-history/js/live-mode.js`
- `web2/balance-history/js/main.js`
- `web2/balance-history/js/qr-generator.js`
- `web2/balance-history/js/transfer-stats.js`
- `web2/balance-history/js/verification.js`
- `web2/shared/tpos-sidebar.js`

## Last 5 commits touching `web2/`

- `9cd8e13b` feat(web2/balance-history): clone đầy đủ balance-history sang Web 2.0 + sidebar + SSE _(2026-05-19)_
- `dc58ffa5` feat(supplier-wallet + supplier-debt): SSE realtime — auto-refresh khi SePay + so-order data change _(2026-05-19)_
- `32c2437e` feat(customer-wallet): SSE realtime auto-refresh khi SePay webhook nhận tiền _(2026-05-19)_
- `8769fced` feat(web2): SSE notify cho 3 routes còn lại (variants/users/PBH) + cache SSE for variants _(2026-05-19)_
- `07841fb8` feat(web2-generic + page-builder): SSE realtime tự enable cho 78 generic CRUD pages _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-105944-9cd8e13` cho Claude walk chain theo CLAUDE.md protocol.
