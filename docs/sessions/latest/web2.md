# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260612-183410-7bb139d`
**Session file**: [`./20260612-183410-7bb139d.md`](../20260612-183410-7bb139d.md)
**Commit**: `7bb139d` — auto: session update
**Last updated**: 2026-06-12 18:34:10 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/customers/index.html`
- `web2/fastsaleorder-delivery/dlv-app.js`
- `web2/fastsaleorder-delivery/index.html`
- `web2/fastsaleorder-invoice/index.html`
- `web2/fastsaleorder-invoice/pbh-app.js`
- `web2/fastsaleorder-refund/index.html`
- `web2/fastsaleorder-refund/rf-app.js`
- `web2/pancake-settings/index.html`
- `web2/purchase-refund/index.html`
- `web2/purchase-refund/js/purchase-refund-app.js`
- `web2/report-revenue/index.html`
- `web2/shared/pbh-realtime.js`
- `web2/shared/web2-chat-client.js`
- `web2/shared/web2-msg-template.js`
- `web2/shared/web2-quick-reply.js`
- `web2/shared/web2-suppliers-cache.js`
- `web2/supplier-wallet/index.html`
- `web2/supplier-wallet/js/supplier-wallet-app.js`
- `web2/supplier-wallet/js/supplier-wallet-storage.js`

## Last 5 commits touching `web2/`

- `7bb139d21` auto: session update _(2026-06-12)_
- `c719b9de4` refactor(web2): gỡ hẳn crm*team_id/crm_team_name — di tích TPOS (DROP COLUMN native_orders + fast_sale_orders, client ngừng gửi, getPartnerInfo bỏ tham số chết) *(2026-06-12)\_
- `e7b76e1b2` docs(web2): đánh dấu đợt H ✅ hoàn tất (276a64355 + cf11709bb) _(2026-06-12)_
- `cf11709bb` fix(web2): đợt H phần còn lại — 3H9 + 3H8/events + LC-pollnow-auth + 3H15 _(2026-06-12)_
- `31af2eef2` docs(web2): đợt H live-chat — cập nhật catalog audit + overview (3H6✅ 3H7✅ H11✅ 3H8🟨 + crm*team_id BIGINT) *(2026-06-12)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260612-183410-7bb139d` cho Claude walk chain theo CLAUDE.md protocol.
