# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-001022-dc07206`
**Session file**: [`./20260620-001022-dc07206.md`](../20260620-001022-dc07206.md)
**Commit**: `dc07206` — docs(web2): dev-log + codemap cho PWA dùng chung
**Last updated**: 2026-06-20 00:10:22 +07
**Summary**: docs(web2): dev-log + codemap cho PWA dùng chung

## Files changed in this commit (`web2/`)

- `web2/audit-log/index.html`
- `web2/balance-history/index.html`
- `web2/ck-dashboard/index.html`
- `web2/customer-wallet/index.html`
- `web2/customers/index.html`
- `web2/dashboard/index.html`
- `web2/delivery-zone/index.html`
- `web2/fastsaleorder-delivery/index.html`
- `web2/fastsaleorder-invoice/index.html`
- `web2/fastsaleorder-refund/index.html`
- `web2/fb-ads-stats/index.html`
- `web2/fb-insights/index.html`
- `web2/fb-posts/index.html`
- `web2/index.html`
- `web2/jt-tracking/index.html`
- `web2/kpi/assignments.html`
- `web2/kpi/index.html`
- `web2/livestream-poller/index.html`
- `web2/multi-tool/index.html`
- `web2/notifications/index.html`
- `web2/overview/index.html`
- `web2/pancake-settings/index.html`
- `web2/photo-editor/index.html`
- `web2/photo-studio/index.html`
- `web2/printer-settings/index.html`
- `web2/product-card/index.html`
- `web2/product-category/index.html`
- `web2/products/index.html`
- `web2/purchase-refund/index.html`
- `web2/reconcile/index.html`
- `web2/report-delivery/index.html`
- `web2/report-revenue/index.html`
- `web2/returns/index.html`
- `web2/shared/web2-manifest.webmanifest`
- `web2/shared/web2-pwa.js`
- `web2/shared/web2-sidebar.js`
- `web2/supplier-debt/index.html`
- `web2/supplier-wallet/index.html`
- `web2/system/index.html`
- `web2/users-permissions/index.html`
- `web2/users/index.html`
- `web2/variants/index.html`
- `web2/video-beauty/index.html`
- `web2/video-maker/index.html`
- `web2/zalo/index.html`

## Last 5 commits touching `web2/`

- `23b5e998a` feat(web2): PWA dùng chung (Thêm vào Màn hình chính, iOS/Android) — manifest+apple meta+icon auto-inject qua sidebar.js, không App Store/dev account; bump sidebar ?v _(2026-06-20)_
- `d7296bcfa` feat(web2): shared mobile responsive (web2-mobile.css) — 1 nguồn cho mọi trang qua sidebar.js inject; bump sidebar ?v _(2026-06-19)_
- `19a57582f` refactor(web2): tách nút Tải bộ cài máy POS → shared Web2PosInstaller (printer-settings + video-maker dùng chung) _(2026-06-19)_
- `f64ff57cc` feat(printer-settings): bat cài máy POS gộp Print Bridge + Giọng VieNeu (auto-start nền, xoá auto cũ) _(2026-06-19)_
- `9e78c109d` feat(web2/fb): nut Xem truoc bai (giong Facebook) qua shared Web2FbPostPreview _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-001022-dc07206` cho Claude walk chain theo CLAUDE.md protocol.
