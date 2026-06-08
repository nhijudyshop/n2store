# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260608-095545-4519089`
**Session file**: [`./20260608-095545-4519089.md`](../20260608-095545-4519089.md)
**Commit**: `4519089` — auto: session update
**Last updated**: 2026-06-08 09:55:45 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/balance-history/js/tpos-partner-enricher.js`
- `web2/customer-wallet/index.html`
- `web2/customer-wallet/js/customer-wallet-app.js`
- `web2/customer-wallet/js/web2-customer-wallet-app.js`
- `web2/live-campaign/index.html`
- `web2/live-campaign/js/live-campaign-api.js`
- `web2/partner-customer/css/partner-customer.css`
- `web2/partner-customer/index.html`
- `web2/partner-customer/js/partner-customer-api.js`
- `web2/partner-customer/js/partner-customer-app.js`
- `web2/shared/web2-customer-lookup.js`
- `web2/shared/web2-sidebar.js`

## Last 5 commits touching `web2/`

- `74ead861c` refactor(web2): bỏ partner-customer (TPOS live) + repoint balance-history/customer-wallet sang warehouse _(2026-06-08)_
- `c4d375b7e` refactor(web2): bỏ field tpos: (deep-link TPOS) khỏi web2-sidebar + alertSoon _(2026-06-08)_
- `a1037d2a1` refactor(web2): rename design-system tpos-_ → web2-_ (classes + --vars), files + theme class _(2026-06-07)_
- `f1f0b7690` refactor(live-chat): rename tpos-pancake→live-chat, purge chữ 'tpos' + comment qua pages.fm _(2026-06-07)_
- `f7a6a56ff` feat(web2): GỠ SẠCH TPOS khỏi cột live + live-campaign (no flag, no fallback) _(2026-06-07)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260608-095545-4519089` cho Claude walk chain theo CLAUDE.md protocol.
