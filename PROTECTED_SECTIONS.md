# Protected Code Sections

This document lists code sections that are **CORRECT** and **SHOULD NOT BE MODIFIED** without explicit approval.

⚠️ **IMPORTANT**: Before making any changes to the sections below, please confirm with the team first.

---

## 1. API Calculation Logic - `orders-report/chat-product-manager.js`

**Status**: ✅ Correct - Do NOT modify without approval

### Protected Methods:

#### `fetchInvoiceHistory()` (Lines 940-1008)
- **Purpose**: Fetches invoice history for a partner within the last 30 days
- **API Endpoint**: `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/FastSaleOrder/ODataService.GetOrdersByPartnerId`
- **Features**:
  - Cache mechanism (5-minute expiry)
  - Date range calculation (last 30 days)
  - Fetches detailed invoice data with OrderLines
  - Smart caching to reduce API calls

#### `fetchInvoiceDetails()` (Lines 1010-1034)
- **Purpose**: Fetches detailed invoice information including products
- **API Endpoint**: `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/FastSaleOrder({invoiceId})?$expand=OrderLines($expand=Product,ProductUOM,User)`
- **Features**:
  - Expands OrderLines with product details
  - Proper error handling
  - Returns complete invoice object with nested product data

### Key Features:
- ✅ Proper caching mechanism
- ✅ Correct API endpoints
- ✅ Error handling
- ✅ Date range filtering
- ✅ OData expansion for related entities

---

## 2. Right Panel Orders UI - `orders-report/tab1-orders.html`

**Status**: ✅ Correct - Do NOT modify without approval

### Protected Section: `<!-- Right Panel: Orders -->` (Starting at Line 594)

**HTML Structure**:
```html
<!-- Right Panel: Orders -->
<div class="chat-right-panel" style="flex: 1; display: flex; flex-direction: column; background: #f8fafc; border-left: 1px solid #e2e8f0;">
    <!-- Tabs Header -->
    <div class="chat-panel-tabs">
        <!-- Tab buttons and content -->
    </div>
</div>
```

### Key Features:
- ✅ Correct layout structure
- ✅ Proper styling for right panel
- ✅ Tab navigation system
- ✅ Flexbox layout for responsive design

---

## Modification Guidelines

### Before Making Changes:

1. **Read this document** to check if the section is protected
2. **Ask the team** before modifying any protected section
3. **Document the reason** for the change
4. **Test thoroughly** after any approved changes
5. **Update this document** if protection status changes

### If You Need to Modify:

1. Create a new branch
2. Document the proposed changes
3. Get approval from the team
4. Make changes with comprehensive testing
5. Update this documentation

---

## Change Log

| Date | Section | Change | Approved By |
|------|---------|--------|-------------|
| 2025-11-26 | Initial Documentation | Created protected sections list | Team |

---

## Contact

If you need to modify any protected section, please contact the development team first.

**Last Updated**: 2025-11-26
**Maintained By**: Development Team
