# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-171227-9f5b17a`
**Session file**: [`./20260630-171227-9f5b17a.md`](../20260630-171227-9f5b17a.md)
**Commit**: `9f5b17a` — auto: session update
**Last updated**: 2026-06-30 17:12:27 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/ai-hub/js/ai-hub.js`
- `web2/balance-history/js/web2-bh-core.js`
- `web2/balance-history/js/web2-link-customer-modal.js`
- `web2/balance-history/js/web2-manual-deposit.js`
- `web2/balance-history/js/web2-partner-enricher.js`
- `web2/balance-history/js/web2-pm-core.js`
- `web2/cham-cong/js/cham-cong-app.js`
- `web2/cham-cong/js/cham-cong-salary.js`
- `web2/chi-tieu/js/chi-tieu-app.js`
- `web2/ck-dashboard/js/ck-dashboard-app.js`
- `web2/clearance/js/clearance.js`
- `web2/customer-wallet/js/web2-customer-wallet-state.js`
- `web2/customers/js/customers-state.js`
- `web2/fastsaleorder-delivery/dlv-app.js`
- `web2/fastsaleorder-invoice/pbh-state.js`
- `web2/fastsaleorder-refund/rf-app.js`
- `web2/fb-ads-stats/js/fb-ads-manual.js`
- `web2/fb-ads-stats/js/fb-ads-stats.js`
- `web2/fb-insights/js/fb-insights.js`
- `web2/fb-posts/js/fb-posts-app.js`
- `web2/fb-posts/js/fb-posts-composer.js`
- `web2/fb-posts/js/fb-posts-drafts.js`
- `web2/fb-posts/js/fb-posts-list.js`
- `web2/fb-posts/js/fb-posts-media.js`
- `web2/kpi/js/kpi-assignments.js`
- `web2/kpi/js/kpi-dashboard.js`
- `web2/multi-tool/js/multi-tool.js`
- `web2/order-tags/js/order-tags-app.js`
- `web2/overview/overview.js`
- `web2/pancake-settings/js/pancake-settings-state.js`
- `web2/payment-confirm/js/payment-confirm-app.js`
- `web2/product-card/js/product-card.js`
- `web2/product-types/js/web2-product-types-app.js`
- `web2/products/js/web2-product-detail.js`
- `web2/products/js/web2-products-print-utils.js`
- `web2/purchase-refund/js/purchase-refund-state.js`
- `web2/reconcile/js/reconcile-state.js`
- `web2/shared/beauty/web2-beauty-studio.js`
- `web2/shared/chat-panel/web2-chat-panel-state.js`
- `web2/shared/page-builder.js`
- `web2/shared/web2-ai-assistant.js`
- `web2/shared/web2-ai-describe.js`
- `web2/shared/web2-audit-log.js`
- `web2/shared/web2-ck-assign-picker.js`
- `web2/shared/web2-ck-review.js`
- `web2/shared/web2-command-palette.js`
- `web2/shared/web2-content-maker.js`
- `web2/shared/web2-customer-detail-modal.js`
- `web2/shared/web2-fb-post-preview.js`
- `web2/shared/web2-gemini-chat.js`
- `web2/shared/web2-import.js`
- `web2/shared/web2-kpi.js`
- `web2/shared/web2-notification-bell.js`
- `web2/shared/web2-order-tag-detail.js`
- `web2/shared/web2-order-tag-pill.js`
- `web2/shared/web2-product-group.js`
- `web2/shared/web2-product-status.js`
- `web2/shared/web2-sidebar.js`
- `web2/shared/web2-tryon.js`
- `web2/shared/web2-unread-panel.js`
- `web2/shared/web2-user-profile.js`
- `web2/shared/web2-variant-picker.js`
- `web2/supplier-debt/js/supplier-debt-state.js`
- `web2/supplier-wallet/js/supplier-wallet-state.js`
- `web2/system/data/web2-dedup-audit.json`
- `web2/system/js/system-ai-suggestions.js`
- `web2/system/js/system-dedup.js`
- `web2/system/js/system-modules.js`
- `web2/system/js/system-services.js`
- `web2/system/js/system-sse.js`
- `web2/system/js/system-thirdparty.js`
- `web2/unit-scan/js/unit-scan.js`
- `web2/users/js/users-app.js`
- `web2/variants/js/web2-variants-app.js`
- `web2/video-maker/js/video-maker.js`
- `web2/video-maker/js/video-stock.js`

## Last 5 commits touching `web2/`

- `85f9fe063` refactor(web2 util): gộp money(11)→Web2Format.vnd + escape(76)→Web2Escape.escapeHtml (delegate-with-fallback); date đã-delegate, phone hoãn _(2026-06-30)_
- `c23125cd9` auto: session update _(2026-06-30)_
- `cc6bfa7d2` feat(system): tab 'Trùng lặp / 1-nguồn' (dedup audit toàn bộ Web 2.0) — 15 nhóm, JSON-driven _(2026-06-30)_
- `19471a7f8` auto: session update _(2026-06-30)_
- `662ee1163` refactor(web2-products): computeProductStatus 1 nguồn + fix confirm-partial HET*HANG; cross-link công thức chờ hàng (audit #2,#3) *(2026-06-30)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-171227-9f5b17a` cho Claude walk chain theo CLAUDE.md protocol.
