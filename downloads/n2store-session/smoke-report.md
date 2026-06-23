# Smoke Test Report — 82 pages

Generated: 2026-06-23T18:04:24.279Z

- ✅ Clean: **69**
- ❌ Issues: **13**

## Pages with issues (sorted by severity)

| Path                                          | HTTP | Title                          | Errors | Unhandled | Visible | Body? | Notes |
| --------------------------------------------- | ---- | ------------------------------ | ------ | --------- | ------- | ----- | ----- |
| `/balance-history/index.html`                 | 200  | Nhi Judy House — Hệ thống quản | 6      | 0         |         | ✓     |       |
| `/customer-hub/index.html`                    | 200  | Nhi Judy House — Hệ thống quản | 2      | 0         |         | ✓     |       |
| `/delivery-report/index.html`                 | 200  | Nhi Judy House — Hệ thống quản | 1      | 0         |         | ✓     |       |
| `/don-inbox/index.html`                       | 200  | Nhi Judy House — Hệ thống quản | 2      | 0         |         | ✓     |       |
| `/issue-tracking/index.html`                  | 200  | Nhi Judy House — Hệ thống quản | 2      | 0         |         | ✓     |       |
| `/orders-report/main.html`                    | 200  | Nhi Judy House — Hệ thống quản | 1      | 0         |         | ✓     |       |
| `/product-warehouse/index.html`               | 200  | Nhi Judy House — Hệ thống quản | 2      | 0         |         | ✓     |       |
| `/purchase-orders/goods-receiving/index.html` | 200  | Nhi Judy House — Hệ thống quản | 2      | 0         |         | ✓     |       |
| `/purchase-orders/index.html`                 | 200  | Nhi Judy House — Hệ thống quản | 2      | 0         |         | ✓     |       |
| `/render-data-manager/index.html`             | 200  | Nhi Judy House — Hệ thống quản | 1      | 0         |         | ✓     |       |
| `/tpos-pancake/index.html`                    | 404  | Error response                 | 0      | 0         |         | ✓     |       |
| `/web2/live-campaign/index.html`              | 404  | Error response                 | 0      | 0         |         | ✓     |       |
| `/web2/partner-customer/index.html`           | 404  | Error response                 | 0      | 0         |         | ✓     |       |

## Top errors (first 3 per broken page)

### `/balance-history/index.html`

- err: [ACCOUNTANT] Stats error: TypeError: Failed to fetch
  at loadDashboardStats (http://localhost:8080/balance-history/js/accountant.js?v=20260611b:623:36)
  at HTMLDocument.init (http://localhost:8080/balance-history/js/accountant.js?v=20260611b:207:9)
- err: [ACCOUNTANT] Load queue error: TypeError: Failed to fetch
  at loadPendingQueue (http://localhost:8080/balance-history/js/accountant.js?v=20260611b:709:36)
  at HTMLDocument.init (http://localhost:8080/balance-history/js/accountant.js?v=20260611b:208:9)
- err: Error loading statistics: TypeError: Failed to fetch
  at loadStatistics (http://localhost:8080/balance-history/js/balance-core.js?v=20260521b:440:32)
  at HTMLDocument.<anonymous> (http://localhost:8080/balance-history/js/main.js?v=20260521b:36:13)

### `/customer-hub/index.html`

- err: API Service Error: TypeError: Failed to fetch
  at fetchJson (http://localhost:8080/shared/js/api-service.js?v=20260521b:2064:32)
  at Object.getUnlinkedTransactionsCount (http://localhost:8080/shared/js/api-service.js?v=20260521b:1906:36)
  at updateUnlinkedBadge (http://localhost:8080/customer-hub/js/main.js?v=20260521b:111:47)
  at HTMLDocument.<anonymous> (http://localhost:8080/custome
- err: [API] getUnlinkedTransactionsCount failed: TypeError: Failed to fetch
  at fetchJson (http://localhost:8080/shared/js/api-service.js?v=20260521b:2064:32)
  at Object.getUnlinkedTransactionsCount (http://localhost:8080/shared/js/api-service.js?v=20260521b:1906:36)
  at updateUnlinkedBadge (http://localhost:8080/customer-hub/js/main.js?v=20260521b:111:47)
  at HTMLDocument.<anonymous> (http:

### `/delivery-report/index.html`

- err: [DELIVERY-REPORT] Fetch error: TypeError: Failed to fetch
  at fetchData (http://localhost:8080/delivery-report/js/delivery-report.js?v=20260620e:1055:36)

### `/don-inbox/index.html`

- err: [INVOICE-STATUS] API load error: TypeError: Failed to fetch
  at Object.\_loadFromAPI (http://localhost:8080/orders-report/js/tab1/tab1-fast-sale-invoice-status.js?v=20260603a:271:40)
  at Object.init (http://localhost:8080/orders-report/js/tab1/tab1-fast-sale-invoice-status.js?v=20260603a:222:28)
  at init (http://localhost:8080/orders-report/js/tab1/tab1-fast-sale-invoice-status.js?v=202606
- err: [INVOICE-DELETE] API load error: TypeError: Failed to fetch
  at Object.\_loadFromAPI (http://localhost:8080/orders-report/js/tab1/tab1-fast-sale-workflow.js?v=20260611b:60:40)
  at Object.init (http://localhost:8080/orders-report/js/tab1/tab1-fast-sale-workflow.js?v=20260611b:47:28)
  at HTMLDocument.initWorkflow (http://localhost:8080/orders-report/js/tab1/tab1-fast-sale-workflow.js?v=20260

### `/issue-tracking/index.html`

- err: [API-SSE] SSE connection error: Event
- err: [API-V2] Subscribe to tickets error: TypeError: Failed to fetch
  at fetchTickets (http://localhost:8080/shared/js/api-service.js?v=20260611a:560:44)
  at Object.subscribeToTickets (http://localhost:8080/shared/js/api-service.js?v=20260611a:622:13)
  at HTMLDocument.<anonymous> (http://localhost:8080/issue-tracking/js/script.js?v=20260612a:99:44)

### `/orders-report/main.html`

- err: [FULFILLMENT] Error loading delete entries: TypeError: Failed to fetch
  at \_loadInvoiceDeletes (http://localhost:8080/orders-report/js/fulfillment-data.js?v=20260521b:50:36)
  at Object.init (http://localhost:8080/orders-report/js/fulfillment-data.js?v=20260521b:104:23)
  at HTMLDocument.<anonymous> (http://localhost:8080/orders-report/main.html?t=1782237755440:225:44)

### `/product-warehouse/index.html`

- err: [TOKEN] Error in authenticated fetch: TypeError: Failed to fetch
  at TokenManager.authenticatedFetch (http://localhost:8080/shared/js/token-manager.js?v=20260620d:653:36)
  at async fetchProducts (http://localhost:8080/product-warehouse/js/main.js?v=20260604h:1612:30)
  at async HTMLDocument.init (http://localhost:8080/product-warehouse/js/main.js?v=20260604h:5557:9)
- err: [Warehouse] TPOS fetch error: TypeError: Failed to fetch
  at TokenManager.authenticatedFetch (http://localhost:8080/shared/js/token-manager.js?v=20260620d:653:36)
  at async fetchProducts (http://localhost:8080/product-warehouse/js/main.js?v=20260604h:1612:30)
  at async HTMLDocument.init (http://localhost:8080/product-warehouse/js/main.js?v=20260604h:5557:9)

### `/purchase-orders/goods-receiving/index.html`

- err: [PurchaseOrderService] Stats failed: TypeError: Failed to fetch
  at PurchaseOrderService.\_fetch (http://localhost:8080/purchase-orders/js/service.js?v=20260525a:74:32)
  at PurchaseOrderService.getStatsAndCounts (http://localhost:8080/purchase-orders/js/service.js?v=20260525a:215:37)
  at async PurchaseOrderDataManager.loadStatsAndCounts (http://localhost:8080/purchase-orders/js/data-manage
- err: [TPOS Stats] Failed to load: TypeError: Failed to fetch
  at Object.authenticatedFetch (http://localhost:8080/purchase-orders/js/lib/tpos-search.js?v=20260525a:351:32)
  at async Promise.all (index 1)
  at async PurchaseOrderUIComponents.renderTPOSStats (http://localhost:8080/purchase-orders/js/ui-components.js?v=20260525a:620:57)

### `/purchase-orders/index.html`

- err: [PurchaseOrderService] Stats failed: TypeError: Failed to fetch
  at PurchaseOrderService.\_fetch (http://localhost:8080/purchase-orders/js/service.js?v=20260525a:74:32)
  at PurchaseOrderService.getStatsAndCounts (http://localhost:8080/purchase-orders/js/service.js?v=20260525a:215:37)
  at async PurchaseOrderDataManager.loadStatsAndCounts (http://localhost:8080/purchase-orders/js/data-manage
- err: [TPOS Stats] Failed to load: TypeError: Failed to fetch
  at Object.authenticatedFetch (http://localhost:8080/purchase-orders/js/lib/tpos-search.js?v=20260525a:351:32)
  at async Promise.all (index 1)
  at async PurchaseOrderUIComponents.renderTPOSStats (http://localhost:8080/purchase-orders/js/ui-components.js?v=20260525a:620:57)

### `/render-data-manager/index.html`

- err: [DATA-MANAGER] Load tables error: TypeError: Failed to fetch
  at loadTableList (http://localhost:8080/render-data-manager/js/main.js?v=20260521b:126:28)
  at HTMLDocument.<anonymous> (http://localhost:8080/render-data-manager/js/main.js?v=20260521b:65:5)

## Clean pages (69)

- `/`
- `/AI/gemini.html`
- `/bangkiemhang/index.html`
- `/doi-soat/index.html`
- `/fb-ads/index.html`
- `/firebase-stats/index.html`
- `/hanghoan/index.html`
- `/inbox/index.html`
- `/index.html`
- `/inventory-tracking/index.html`
- `/invoice-compare/index.html`
- `/lichsuchinhsua/index.html`
- `/native-orders/index.html`
- `/nhanhang/index.html`
- `/order-management/hidden-products.html`
- `/order-management/index.html`
- `/order-management/order-list.html`
- `/orders-report/migration-kpi-per-user.html`
- `/orders-report/tab-kpi-commission.html`
- `/orders-report/tab-live-ledger.html`
- `/orders-report/tab-overview.html`
- `/orders-report/tab-pending-delete.html`
- `/orders-report/tab1-orders.html`
- `/orders-report/tab3-product-assignment.html`
- `/phone-management/index.html`
- `/phone-management/monitor.html`
- `/privacy-policy.html`
- `/project-tracker/index.html`
- `/purchase-orders/label-test.html`
- `/quy-trinh/index.html`
- `/resident/index.html`
- `/service-costs/index.html`
- `/soluong-live/hidden-soluong.html`
- `/soluong-live/index.html`
- `/soluong-live/sales-report.html`
- `/soluong-live/social-sales.html`
- `/soluong-live/soluong-list.html`
- `/soorder/index.html`
- `/soquy/huong_dan_so_quy.html`
- `/soquy/index.html`
- `/stitch_customer/customer_search.html`
- `/stitch_customer/transaction-activity.html`
- `/stitch_customer/Unlinked_Bank_Transactions.html`
- `/supplier-debt/index.html`
- `/user-management/index.html`
- `/web2/audit-log/index.html`
- `/web2/balance-history/index.html`
- `/web2/customer-wallet/index.html`
- `/web2/dashboard/index.html`
- `/web2/fastsaleorder-delivery/index.html`
- `/web2/fastsaleorder-invoice/index.html`
- `/web2/fastsaleorder-refund/index.html`
- `/web2/kpi/index.html`
- `/web2/login/index.html`
- `/web2/notifications/index.html`
- `/web2/overview/index.html`
- `/web2/pancake-settings/index.html`
- `/web2/products/index.html`
- `/web2/products/index.html`
- `/web2/purchase-refund/index.html`
- `/web2/reconcile/index.html`
- `/web2/report-delivery/index.html`
- `/web2/report-revenue/index.html`
- `/web2/supplier-debt/index.html`
- `/web2/supplier-wallet/index.html`
- `/web2/system/index.html`
- `/web2/users-permissions/index.html`
- `/web2/users/index.html`
- `/web2/variants/index.html`
