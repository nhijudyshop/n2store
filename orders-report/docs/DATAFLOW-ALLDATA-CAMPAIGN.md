# TAI LIEU CHI TIET: Luong Du Lieu Chien Dich & allData - Orders Report Module

> Tai lieu nay mo ta TOAN BO logic, flow, code structure, va database cua he thong du lieu don hang.
> Dung de debug va lap ke hoach sua loi.
> Cap nhat: 2026-03-24

---

## MUC LUC

1. [Cau truc Database (Firestore + Realtime DB + IndexedDB + localStorage)](#1-cau-truc-database)
2. [Tab 1: Luong khoi tao chi tiet](#2-tab-1-luong-khoi-tao-chi-tiet)
3. [Tab 1: Cach tai va xu ly allData](#3-tab-1-cach-tai-va-xu-ly-alldata)
4. [Tab 1 → Tab 3: Luong chia se du lieu](#4-tab-1--tab-3-luong-chia-se-du-lieu)
5. [Tab 1 → Tab Bao cao tong hop (Overview)](#5-tab-1--tab-bao-cao-tong-hop-overview)
6. [Main.html: Message Router](#6-mainhtml-message-router)
7. [Cac diem gay loi (Bug Analysis)](#7-cac-diem-gay-loi-bug-analysis)
8. [De xuat sua loi](#8-de-xuat-sua-loi)

---

## 1. CAU TRUC DATABASE

### 1.1 Firestore Collections

```
Firestore Database
├── campaigns/                          # Dinh nghia chien dich
│   ├── {campaignId}/                   # Document ID tu dong
│   │   ├── name: "LIVE 15/03/2026"    # Ten chien dich
│   │   ├── customStartDate: "2026-03-15"  # Ngay bat dau (yyyy-mm-dd)
│   │   ├── customEndDate: "2026-03-15"    # Ngay ket thuc (yyyy-mm-dd)
│   │   ├── timeFrame: "custom"            # Loai time frame
│   │   └── updatedAt: 1711234567890       # Timestamp cap nhat
│   └── ...
│
├── user_preferences/                   # Tuy chon nguoi dung
│   ├── {userId}/                       # userId = firebase.auth().currentUser.uid
│   │   └── activeCampaignId: "abc123"  # Campaign dang active
│   └── ...
│
├── settings/                           # Cai dat chung
│   ├── table_name/                     # Ten bang mac dinh
│   │   └── name: "LIVE 15/03/2026"
│   └── employee_ranges_by_campaign/    # Phan cong nhan vien theo chien dich
│       └── {campaignName}/
│           └── ranges: [...]
│
├── processing_tags_{campaignId}/       # Tag xu ly theo chien dich
│   └── {orderId}/
│       └── tags: [...]
│
├── invoice_status_v2/                  # Trang thai hoa don (Firestore sync)
│   └── {docId}/
│       ├── data: Map<orderId, statusObj>
│       └── lastUpdated: timestamp
│
└── invoice_status_delete_v2/           # Trang thai xoa hoa don
    └── {docId}/
        ├── data: Map<orderId, deleteObj>
        └── lastUpdated: timestamp
```

### 1.2 Firebase Realtime Database

```
Realtime Database
├── tag_updates/                        # Thong bao cap nhat tag realtime
│   └── {orderId}/
│       ├── tags: "[JSON string]"
│       ├── updatedBy: "userId"
│       └── timestamp: 1711234567890
│
└── settings/
    └── employee_ranges_by_campaign/    # Phan cong nhan vien
        └── {campaignName}/
            └── ranges: [
                  { name: "NV1", start: 1, end: 50 },
                  { name: "NV2", start: 51, end: 100 }
                ]
```

### 1.3 IndexedDB (Cross-tab data sharing)

```
IndexedDB
├── key: 'allOrders'                    # Tab3 doc (transformed format)
│   └── value: {
│       orders: [                       # Array of transformed orders
│         {
│           stt: "15",                  # SessionIndex
│           orderId: 12345,             # Id
│           orderCode: "SO001234",      # Code
│           customerName: "Nguyen A",   # PartnerName || Name
│           phone: "0901234567",        # PartnerPhone || Telephone
│           address: "123 ABC",         # PartnerAddress || Address
│           totalAmount: 500000,        # TotalAmount || AmountTotal
│           quantity: 3,                # TotalQuantity
│           note: "Ghi chu",           # Note
│           state: 1,                   # Status || State
│           dateOrder: "2026-03-15..",  # DateCreated || DateOrder
│           Tags: "[{...}]",           # Tags (JSON string)
│           liveCampaignName: "LIVE"   # LiveCampaignName
│         }, ...
│       ],
│       timestamp: 1711234567890,       # Thoi diem ghi
│       activeCampaignNames: ["LIVE"]   # Ten cac chien dich
│   }
│
└── key: 'allOrdersRaw'                # Overview doc (raw API format)
    └── value: {
        orders: [                       # Array of RAW API objects
          {
            Id: 12345,
            Code: "SO001234",
            SessionIndex: "15",
            PartnerName: "Nguyen A",
            PartnerPhone: "0901234567",
            PartnerAddress: "123 ABC",
            TotalAmount: 500000,
            TotalQuantity: 3,
            Note: "Ghi chu",
            Status: 1,
            DateCreated: "2026-03-15T...",
            Tags: "[{...}]",
            LiveCampaignName: "LIVE",
            LiveCampaignId: 98765,
            Facebook_PostId: "...",
            // ... nhieu field khac tu API
          }, ...
        ],
        timestamp: 1711234567890
    }
```

### 1.4 localStorage Keys

```
localStorage
├── orders_campaign_user_id     # userId cho campaign management (fallback khi auth chua ready)
├── orders_table_name           # Ten bang/chien dich hien tai
├── ordersTableFontSize         # Kich thuoc font (px)
├── orders_tab1_filter_data     # Filter metadata (JSON)
├── tab1_filter_data            # Filter data cho cross-tab sync
├── standard_price_cache        # Cache gia san pham (co the >500KB)
├── product_excel_cache         # Cache danh sach san pham (co the >500KB)
├── invoiceStatusStore_v2       # Cache trang thai hoa don
├── invoiceStatusDelete_v2      # Cache trang thai xoa hoa don
└── orders_productAssignments   # Tab3: du lieu phan cong san pham
```

### 1.5 Memory (Global Variables)

```
window.campaignManager = {
    allCampaigns: {},           # Map: campaignId -> campaign object
    activeCampaignId: null,     # Campaign ID dang active
    activeCampaign: null,       # Campaign object dang active
    currentUserId: null,        # Firebase Auth UID hoac fallback
    initialized: false          # Da khoi tao xong chua
}

# Tab1 (tab1-core.js)
allData = []                    # Toan bo don hang tu API (RAW format)
filteredData = []               # Da filter theo nhan vien/tags
displayedData = []              # Da phan trang (pagination)
OrderStore._orders = Map()      # Map: orderId -> order (O(1) lookup)
OrderStore._ordersBySTT = Map() # Map: STT -> order (cho bulk tagging)
selectedCampaign = null         # { isCustom: true } hoac null

# Tab3 (tab3-core.js)
ordersData = []                 # Don hang (TRANSFORMED format)
productsData = []               # San pham tu TPOS API
assignments = []                # Phan cong san pham

# Overview (overview-core.js)
allOrders = []                  # Don hang (RAW format)
currentTableName = ""           # Ten bang hien tai
cachedOrderDetails = {}         # Chi tiet da tai tu Firebase
```

---

## 2. TAB 1: LUONG KHOI TAO CHI TIET

### 2.1 Thu tu load scripts (tab1-orders.html)

```
tab1-orders.html
├── 1. ../shared/js/core-loader.js           # Core utilities
├── 2. ../shared/js/shared-auth-manager.js   # Auth manager
├── 3. ../shared/js/shared-cache-manager.js  # Cache manager
├── 4. ../shared/js/firebase-config.js       # Firebase init
├── 5. ../shared/js/notification-system.js   # Notifications
├── 6. js/tab1/tab1-core.js                  # Global vars, OrderStore, formatTimeVN
├── 7. js/tab1/tab1-campaign-system.js       # Campaign CRUD (loadAllCampaigns, saveActiveCampaign)
├── 8. js/tab1/tab1-processing-tags.js       # Processing tags system
├── 9. js/tab1/tab1-firebase.js              # Firebase tag sync, realtime listeners
├── 10. js/tab1/tab1-search.js               # fetchOrders, handleSearch, loadCampaignList
├── 11. js/tab1/tab1-table.js                # Table rendering, showLoading
├── 12. js/tab1/tab1-employee.js             # Employee range management
├── 13. js/tab1/tab1-init.js                 # DOMContentLoaded, initializeApp, waitForAuthState
└── 14. (other modules: chat, edit, sale...)
```

### 2.2 DOMContentLoaded (tab1-init.js:9-379)

```
DOMContentLoaded fires
│
├─ [LINE 11-12] Apply font size from localStorage
│   ordersTableFontSize = localStorage.getItem("ordersTableFontSize") || "14"
│
├─ [LINE 22-67] localStorage cleanup (neu >4MB)
│   Xoa: firebase:* keys, standard_price_cache, product_excel_cache
│
├─ [LINE 69-73] Clear cacheManager
│   cacheManager.clear("orders")
│   cacheManager.clear("campaigns")
│
├─ [LINE 76-78] Check pending held products cleanup
│
├─ [LINE 80-86] Set default dates (30 ngay truoc → hom nay)
│   endDate.value = formatDateTimeLocal(now)
│   startDate.value = formatDateTimeLocal(thirtyDaysAgo)
│   ⚠️ QUAN TRONG: Set dates TRUOC khi load campaigns
│
├─ [LINE 88-129] Setup event listeners
│   ├─ loadCampaignsBtn → handleLoadCampaigns
│   ├─ clearCacheBtn → handleClearCache
│   ├─ selectAll → handleSelectAll
│   ├─ campaignFilter → handleCampaignChange
│   ├─ customStartDate → handleCustomDateChange
│   ├─ customEndDate → handleCustomEndDateChange
│   └─ employeeCampaignSelector → loadEmployeeRangesForCampaign
│
├─ [LINE 131-139] Init TokenManager Firebase
│   tokenManager.retryFirebaseInit()
│
├─ [LINE 144-170] Init Pancake (PARALLEL, khong block)
│   ├─ pancakeTokenManager.initialize()     # sync
│   └─ pancakeInitPromise = pancakeDataManager.initialize()  # async, background
│       └─ Khi xong: window.chatDataManager = window.pancakeDataManager
│
├─ [LINE 171-177] Init RealtimeManager
│   realtimeManager.initialize()
│
├─ [LINE 182-194] Defer TAG listeners (1 giay)
│   setTimeout(() => {
│       setupTagRealtimeListeners()     # Firebase RTDB listeners
│   }, 1000)
│
├─ [LINE 220-225] GOI initializeApp() (NON-BLOCKING)
│   initializeApp().then(...).catch(...)
│   ⚠️ KHONG AWAIT → DOMContentLoaded tiep tuc
│
├─ [LINE 228-236] Sau khi Pancake init xong
│   pancakeInitPromise.then(success => {
│       if (success && allData.length > 0)
│           performTableSearch()    # Re-render table voi chat data
│   })
│
├─ [LINE 238-258] Setup search input listeners
│
├─ [LINE 264] checkAdminPermission()
│
├─ [LINE 282-352] Setup postMessage listeners
│   ├─ REQUEST_TOKEN → tokenManager.getToken() → TOKEN_RESPONSE
│   ├─ REQUEST_ORDERS_DATA → transform allData → ORDERS_DATA_RESPONSE_TAB3
│   ├─ REQUEST_ORDERS_DATA_FROM_OVERVIEW → allData → ORDERS_DATA_RESPONSE_OVERVIEW
│   └─ OPEN_RETAIL_SALE_FROM_SOCIAL → openSaleModalFromSocialOrder
│
└─ [LINE 354-378] Keyboard shortcuts for tag modal
```

### 2.3 initializeApp() (tab1-init.js:427-521)

```
async initializeApp()
│
├─ [LINE 429-432] Guard: if (appInitialized) return
│   appInitialized = true
│
├─ [BUOC 1] LINE 438-453: Cho Firebase ready
│   if (typeof firebase === 'undefined' || !firebase.database) {
│       firebaseWaitAttempts++
│       if (firebaseWaitAttempts >= 20) {  # 20 × 500ms = 10s max
│           alert('Khong the ket noi Firebase...')
│           return
│       }
│       appInitialized = false  # Reset de retry
│       setTimeout(initializeApp, 500)
│       return
│   }
│   ⚠️ CO TIMEOUT 10 giay → an toan
│
├─ [BUOC 2] LINE 458-462: Cho Auth state
│   authUser = await waitForAuthState()
│   # waitForAuthState() (LINE 397-419):
│   #   - Neu firebase undefined → resolve(null)
│   #   - onAuthStateChanged fire → resolve(user)
│   #   - setTimeout 5s → resolve(firebase.auth().currentUser)  # FALLBACK
│   ⚠️ CO TIMEOUT 5 giay → an toan
│   ⚠️ NHUNG: Neu auth chua resolve, currentUser co the la null
│
├─ [BUOC 3] LINE 464-473: Set userId
│   window.campaignManager = { allCampaigns: {}, activeCampaignId: null, ... }
│   window.campaignManager.currentUserId = getCurrentUserId()
│   # getCurrentUserId() (LINE 526-538):
│   #   1. firebase.auth().currentUser?.uid         ← UU TIEN
│   #   2. localStorage('orders_campaign_user_id')  ← FALLBACK
│   #   3. 'user_' + Date.now()                     ← TAO MOI
│   ⚠️ VAN DE: Neu auth chua resolve → uid = null → dung fallback
│   ⚠️ → userId khac user that → Firestore tra sai activeCampaignId
│
├─ [BUOC 4] LINE 475-482: Load data PARALLEL
│   const [campaigns, activeCampaignId, _] = await Promise.all([
│       loadAllCampaigns(),        # Firestore: campaigns collection → get all docs
│       loadActiveCampaignId(),    # Firestore: user_preferences/{userId} → activeCampaignId
│       Promise.resolve()
│   ])
│
│   # loadAllCampaigns() (tab1-campaign-system.js:20-34):
│   #   db.collection('campaigns').get()
│   #   → snapshot.forEach(doc => campaigns[doc.id] = doc.data())
│   #   → window.campaignManager.allCampaigns = campaigns
│   #   ⚠️ Neu Firestore loi → return {} → app nghi khong co campaigns
│
│   # loadActiveCampaignId() (tab1-init.js:544-561):
│   #   db.collection('user_preferences').doc(userId).get()
│   #   → docSnapshot.data().activeCampaignId
│   #   ⚠️ Dung window.campaignManager.currentUserId
│   #   ⚠️ Neu userId sai → khong tim duoc preferences → tra null
│
├─ [BUOC 5] LINE 484-513: Quyet dinh tiep theo
│
│   ┌─ PATH A: activeCampaignId co + campaign ton tai + co dates
│   │   (LINE 485-494)
│   │   if (activeCampaignId && campaigns[activeCampaignId]) {
│   │       campaign = campaigns[activeCampaignId]
│   │       if (campaign.customStartDate) {
│   │           await continueAfterCampaignSelect(activeCampaignId)  ← HAPPY PATH
│   │           return
│   │       }
│   │   }
│   │
│   ├─ PATH B: Campaign co nhung KHONG co dates
│   │   (LINE 495-500)
│   │   showCampaignNoDatesModal(activeCampaignId)
│   │   → User nhap dates → callback goi continueAfterCampaignSelect()
│   │
│   ├─ PATH C: Co campaigns nhung khong co active
│   │   (LINE 503-508)
│   │   showSelectCampaignModal()
│   │   → User chon campaign → callback goi continueAfterCampaignSelect()
│   │
│   └─ PATH D: Khong co campaigns nao
│       (LINE 511-513)
│       showNoCampaignsModal()
│       → User tao moi → callback goi continueAfterCampaignSelect()
│
└─ [CATCH] LINE 515-520: Error handling
    notificationManager.error('Loi khoi tao: ' + error.message)
```

### 2.4 continueAfterCampaignSelect(campaignId) (tab1-init.js:571-671)

```
async continueAfterCampaignSelect(campaignId)
│
├─ [LINE 575-578] Lay campaign object
│   campaign = window.campaignManager.allCampaigns[campaignId]
│   if (!campaign) return  ← SILENT RETURN, khong show error
│
├─ [LINE 581-584] Set global state
│   campaignManager.activeCampaignId = campaignId
│   campaignManager.activeCampaign = campaign
│   campaignManager.initialized = true
│
├─ [LINE 586-603] Set dates vao INPUT FIELDS
│   startDate = campaign.customStartDate    # "2026-03-15"
│   endDate = campaign.customEndDate        # "2026-03-15"
│   customStartDate.value = startDate
│   customEndDate.value = endDate
│   startDate.value = startDate
│   endDate.value = endDate
│   modalCustomStartDate.value = startDate
│   modalCustomEndDate.value = endDate
│
├─ [LINE 608] selectedCampaign = { isCustom: true }
│
├─ [LINE 611] updateActiveCampaignLabel(campaign.name)
│   → label.innerHTML = '<i class="fas fa-bullhorn"></i> LIVE 15/03/2026'
│
├─ [LINE 614-617] Update modal dropdown selection
│
├─ [LINE 620-627] Show notification
│   "Dang tai don hang: 15/03/2026 - 15/03/2026"
│
├─ [LINE 629-636] Load employee ranges
│   await loadEmployeeRangesForCampaign(campaign.name)
│   # → Firebase RTDB: settings/employee_ranges_by_campaign/{campaignName}
│
├─ [LINE 638-651] Load processing tags
│   await Promise.all([
│       loadTagDefinitions(campaignId),       # Firestore: tag definitions
│       loadProcessingTags(campaignId),        # Firestore: processing tags data
│   ])
│   setupProcessingTagRealtimeListeners(campaignId)
│   initProcessingTagPanel()
│
├─ [LINE 653-655] ⭐ FETCH ORDERS
│   await handleSearch()
│   # → fetchOrders() → allData duoc populate
│   # → Chi tiet xem Muc 3
│
├─ [LINE 657-661] Connect realtime
│   realtimeManager.connectServerMode()
│   # SSE connection cho live updates
│
└─ [LINE 665-670] Error handling
    notificationManager.error('Loi tai chien dich: ' + error.message)
    ⚠️ KHONG co showLoading(false) trong catch!
```

---

## 3. TAB 1: CACH TAI VA XU LY allData

### 3.1 handleSearch() (tab1-search.js:1084-1134)

```
async handleSearch()
│
├─ [LINE 1087-1088] Lay date values tu input
│   customStartDateValue = document.getElementById("customStartDate").value
│   customEndDateValue = document.getElementById("customEndDate").value
│
├─ [LINE 1090-1106] Validate dates
│   if (!customStartDateValue) → error "Vui long chon Tu ngay"
│   if (!customEndDateValue) → error "Vui long chon Den ngay"
│
├─ [LINE 1108-1109] Set custom mode
│   selectedCampaign = { isCustom: true }
│
├─ [LINE 1111-1117] Update UI label
│   activeCampaignLabel = "📅 15/3/2026 - 15/3/2026"
│
├─ [LINE 1119-1125] Abort background loading (neu co)
│   if (isLoadingInBackground) {
│       loadingAborted = true
│       await sleep(200)
│   }
│
├─ [LINE 1127-1132] Reset state
│   cacheManager.clear("orders")
│   searchQuery = ""
│   allData = []
│   renderedCount = 0
│
└─ [LINE 1133] await fetchOrders()
```

### 3.2 fetchOrders() (tab1-search.js:1183-1394)

```
async fetchOrders()
│
├─ [LINE 1185-1188] Guard: Prevent duplicate calls
│   if (isFetchingOrders) return    ← SKIP neu dang fetch
│   isFetchingOrders = true
│
├─ [LINE 1192-1193] Show loading
│   showLoading(true)
│   loadingAborted = false
│
├─ [LINE 1200-1209] Parse date range
│   customStartDate = convertToUTC(customStartDateValue)
│   customEndDate = convertToUTC(customEndDateValue)
│   filter = "(DateCreated ge {start} and DateCreated le {end})"
│
├─ [LINE 1214-1222] Reset data
│   allData = []
│   renderedCount = 0
│   OrderStore.clear()
│
├─ [LINE 1224] Get auth headers
│   headers = await tokenManager.getAuthHeader()
│
├─ ═══════════════════════════════════════════
│  PHASE 1: Quick Count (LINE 1226-1242)
│  ═══════════════════════════════════════════
│   GET /ODataService.GetView?$top=1&$skip=0&$count=true&$filter={filter}
│   totalCount = response["@odata.count"]    # VD: 1090
│   showInfoBanner("⏳ Dang tai 1090 don hang...")
│
├─ ═══════════════════════════════════════════
│  PHASE 2: Parallel Batch Fetch (LINE 1244-1283)
│  ═══════════════════════════════════════════
│   PAGE_SIZE = 200
│   batches = [0, 200, 400, 600, 800, 1000]  # ceil(1090/200) = 6 batches
│
│   fetchPromises = batches.map(skipValue => {
│       GET /ODataService.GetView?$top=200&$skip={skipValue}&$filter={filter}
│       → { skipValue, orders: [...], error: false }
│   })
│
│   results = await Promise.all(fetchPromises)  # 6 requests DONG THOI
│
│   # Sort va merge:
│   results.sort((a,b) => a.skipValue - b.skipValue)
│   allData = []
│   for (result of results) {
│       allData = allData.concat(result.orders)  # 1090 orders total
│   }
│
├─ [LINE 1285-1288] Init OrderStore
│   OrderStore.setAll(allData)
│   # → _orders = Map(1090 entries: orderId → order)
│   # → _ordersBySTT = Map(STT → order)
│
├─ [LINE 1290-1319] Luu IndexedDB (FIRE-AND-FORGET)
│   # KEY 'allOrders' - Transformed format cho Tab3:
│   indexedDBStorage.setItem('allOrders', {
│       orders: allData.map(order => ({
│           stt: order.SessionIndex,
│           orderId: order.Id,
│           orderCode: order.Code,
│           customerName: order.PartnerName || order.Name,
│           phone: order.PartnerPhone || order.Telephone,
│           address: order.PartnerAddress || order.Address,
│           totalAmount: order.TotalAmount || order.AmountTotal || 0,
│           quantity: order.TotalQuantity || 0,
│           note: order.Note,
│           state: order.Status || order.State,
│           dateOrder: order.DateCreated || order.DateOrder,
│           Tags: order.Tags,
│           liveCampaignName: order.LiveCampaignName
│       })),
│       timestamp: Date.now(),
│       activeCampaignNames: selectedCampaign?.campaignNames || []
│   }).catch(err => console.error(...))   ← ⚠️ KHONG AWAIT, chi catch
│
│   # KEY 'allOrdersRaw' - Raw format cho Overview:
│   indexedDBStorage.setItem('allOrdersRaw', {
│       orders: allData,                    ← Toan bo raw API data
│       timestamp: Date.now()
│   }).catch(err => console.error(...))   ← ⚠️ KHONG AWAIT, chi catch
│
├─ [LINE 1321-1324] Render table
│   performTableSearch()
│   updateSearchResultCount()
│   showInfoBanner("✅ Da tai 1090 don hang.")
│
├─ [LINE 1326-1327] ⚠️ Cross-tab sync DA BI REMOVE
│   # NOTE: Removed cross-tab sync
│   # (sendDataToTab2, sendOrdersDataToOverview, sendOrdersDataToTab3)
│   # Each tab now fetches its own data independently
│
├─ [LINE 1329-1353] BACKGROUND tasks (khong await)
│   # Chat conversations:
│   (async () => {
│       await chatDataManager.fetchConversations(true, channelIds)
│       await pancakeDataManager.fetchConversations(true)
│       setTimeout(() => updateChatColumnsOnly(), 0)
│   })()
│
├─ [LINE 1355-1359] BACKGROUND: Load tags & user identifier
│   loadAvailableTags().catch(...)
│   loadCurrentUserIdentifier().catch(...)
│
├─ [LINE 1368] showLoading(false)
│
├─ [LINE 1370-1389] CATCH block
│   showLoading(false)    ← ✅ CO showLoading(false) trong catch
│
└─ [LINE 1390-1393] FINALLY block
    isFetchingOrders = false  ← ✅ CO reset flag trong finally
```

### 3.3 allData Structure (Moi order object tu API)

```javascript
// Moi phan tu trong allData[] la 1 order object RAW tu TPOS OData API:
{
    Id: 12345,                          // Order ID (unique, dung lam key)
    Code: "SO001234",                   // Ma don hang
    SessionIndex: "15",                 // STT (sequence number trong live)
    PartnerName: "Nguyen Van A",        // Ten khach hang
    PartnerPhone: "0901234567",         // So dien thoai
    PartnerAddress: "123 Le Loi, Q1",   // Dia chi
    TotalAmount: 500000,                // Tong tien
    TotalQuantity: 3,                   // Tong so luong san pham
    Note: "Ghi chu don hang",           // Ghi chu
    Status: 1,                          // Trang thai (1=New, 2=Confirmed, ...)
    State: "New",                       // Trang thai text
    DateCreated: "2026-03-15T10:30:00Z",// Ngay tao (UTC)
    DateOrder: "2026-03-15T10:30:00Z",  // Ngay dat hang
    Tags: "[{\"Id\":1,\"Name\":\"VIP\"}]", // Tags (JSON string)
    LiveCampaignId: 98765,              // ID chien dich live
    LiveCampaignName: "LIVE 15/03",     // Ten chien dich
    Facebook_PostId: "pfbid02...",      // Facebook Post ID (cho chat)
    Facebook_UserId: "...",             // Facebook User ID
    SaleChannelId: 1,                   // Kenh ban hang
    AmountTotal: 500000,                // Tong tien (alias)
    Name: "Nguyen Van A",              // Ten (alias)
    Telephone: "0901234567",           // SDT (alias)
    Address: "123 Le Loi, Q1",         // Dia chi (alias)
    // ... nhieu field khac tu API
}
```

---

## 4. TAB 1 → TAB 3: LUONG CHIA SE DU LIEU

### 4.1 Tab3 Init (tab3-core.js:540-572)

```
window.addEventListener('load', async () => {
│
├─ [LINE 545-553] Setup UserStorageManager
│
├─ [LINE 555] await getValidToken()    # Lay TPOS bearer token
│
├─ [LINE 556] loadOrdersData()         # ← KHONG AWAIT!
│   # → Doc IndexedDB hoac request postMessage
│
├─ [LINE 558-559] Load assignments tu localStorage
│   loadAssignmentsFromLocalStorage()
│
├─ [LINE 561-562] Setup listeners
│   setupLocalStorageListeners()
│
├─ [LINE 564] await loadProductsData() # ← AWAIT (block cho den khi xong)
│
└─ [LINE 565] updateOrdersCount()
})
```

### 4.2 Tab3 loadOrdersData() (tab3-core.js:382-407)

```
async loadOrdersData()
│
├─ CACH 1: IndexedDB (UU TIEN)
│   if (window.indexedDBStorage) {
│       cached = await indexedDBStorage.getItem('allOrders')
│       if (cached && cached.orders && cached.orders.length > 0) {
│           ordersData = cached.orders          ← TRANSFORMED format
│           activeCampaignNames = cached.activeCampaignNames
│           updateOrdersCount()
│           showNotification("📦 Da load {N} don hang")
│           return                               ← XONG, khong can postMessage
│       }
│   }
│
├─ CACH 2: postMessage Fallback
│   requestOrdersDataFromTab1()
│   # → window.parent.postMessage({ type: 'REQUEST_ORDERS_DATA_FROM_TAB3' }, '*')
│   # → main.html nhan → forward sang Tab1
│   # → Tab1 handler (tab1-init.js:308-331):
│   #       rawOrders = getAllOrders()
│   #       orders = rawOrders.map(order => ({
│   #           stt: order.SessionIndex,
│   #           orderId: order.Id,
│   #           customerName: order.PartnerName || order.Name,
│   #           ... (transformed format)
│   #       }))
│   #       postMessage({ type: 'ORDERS_DATA_RESPONSE_TAB3', orders })
│   # → main.html forward → Tab3
│
└─ CATCH: request postMessage fallback
    ordersData = []
    requestOrdersDataFromTab1()
```

### 4.3 Tab3 Message Listener (tab3-core.js:575-592)

```
window.addEventListener('message', (event) => {
    # Nhan orders data tu Tab1
    if (event.data.type === 'ORDERS_DATA_UPDATE' ||
        event.data.type === 'ORDERS_DATA_RESPONSE_TAB3') {
        ordersData = event.data.orders         ← Cap nhat ordersData
        updateOrdersCount()
        showNotification("📦 Da load {N} don hang tu Tab Quan Ly")
    }

    # Nhan campaign thay doi
    if (event.data.type === 'CAMPAIGN_CHANGED_FOR_TAB3') {
        activeCampaignNames = event.data.campaignNames || []
    }
})
```

### 4.4 Luong du lieu Tab1 → Tab3 (Diagram)

```
TAB 1 (fetchOrders)
  │
  ├─ allData = [1090 orders RAW]
  │
  ├─ Luu IndexedDB 'allOrders' (TRANSFORMED format, FIRE-AND-FORGET)
  │   {orders: [{stt, orderId, customerName, ...}], timestamp, activeCampaignNames}
  │
  └─ ⚠️ KHONG gui postMessage cho Tab3 (da bi remove)
       # Dong 1326: "NOTE: Removed cross-tab sync"


TAB 3 (window.load)
  │
  ├─ loadOrdersData()
  │   ├─ Try IndexedDB 'allOrders'
  │   │   ├─ Co data → ordersData = cached.orders ✅
  │   │   └─ Khong data → requestOrdersDataFromTab1()
  │   │                      │
  │   │                      ▼
  │   │                   main.html (message router)
  │   │                      │
  │   │                      ▼
  │   │                   Tab1 handler
  │   │                   getAllOrders() → transform → ORDERS_DATA_RESPONSE_TAB3
  │   │                      │
  │   │                      ▼
  │   │                   main.html → Tab3
  │   │                      │
  │   │                      ▼
  │   │                   ordersData = event.data.orders
  │   │
  │   └─ ⚠️ VAN DE: Neu Tab1 chua fetch xong, getAllOrders() tra []
  │       → Tab3 nhan mang rong → KHONG CO DATA
  │       → Tab3 KHONG co retry mechanism
  │
  └─ ⚠️ VAN DE: Tab3 load 1 lan duy nhat khi window.load
      Neu Tab1 fetch xong SAU khi Tab3 da load → Tab3 van data cu
      Tab1 KHONG notify Tab3 khi co data moi (cross-tab sync da remove)
```

---

## 5. TAB 1 → TAB BAO CAO TONG HOP (OVERVIEW)

### 5.1 Overview Init (overview-init.js:1-161)

```
DOMContentLoaded
│
├─ [LINE 11-13] initAnalysisTabVisibility()
├─ [LINE 15-21] Reset fetching state
├─ [LINE 24] loadCachedData()             # localStorage metadata
│
├─ [LINE 27] currentTableName = await loadDefaultTableNameFromFirebase()
│   # Firestore: settings/table_name → data.name
│   # Fallback: localStorage 'orders_table_name'
│   # Fallback cuoi: 'Bang 1'
│
├─ [LINE 31-35] Load settings PARALLEL
│   await Promise.all([
│       loadEmployeeRanges(),              # Firebase RTDB
│       loadAvailableTagsFromFirebase(),   # Firestore
│       loadTrackedTags()                  # Firestore
│   ])
│
├─ [LINE 39] await loadAvailableTables()   # Firestore: danh sach bang
│
├─ [LINE 42-43] Update UI
│   updateCachedCountBadge()
│   renderCachedDetailsTab()
│
├─ [LINE 50-53] Init discount stats UI
│
├─ [LINE 66-116] Check session cache (sessionStorage)
│   sessionCache = sessionStorage.getItem('reportOrdersExcelCache')
│   if (cache < 5 min && co orders) → load vao cachedOrderDetails
│
├─ [LINE 118-160] ⭐ Load orders data
│   # CACH 1: IndexedDB
│   cached = await indexedDBStorage.getItem('allOrdersRaw')  ← RAW format
│   if (cached && cached.orders.length > 0) {
│       allOrders = cached.orders
│       loadedFromIDB = true
│       # Detect campaign name tu order dau tien
│       currentCampaignName = allOrders[0].LiveCampaignName
│       updateStats()
│       renderStatisticsFromAllOrders()
│       loadTableDataFromFirebase(currentTableName)
│   }
│
│   # CACH 2: postMessage fallback (neu IndexedDB trong)
│   if (!loadedFromIDB) {
│       requestDataFromTab1()
│       # → postMessage 'REQUEST_ORDERS_DATA_FROM_OVERVIEW'
│   }
│
└─ END
```

### 5.2 Overview Message Listener (overview-events.js:1-90)

```
window.addEventListener('message', function(event) {

    # Nhan orders data tu Tab1
    if (event.data.type === 'ORDERS_DATA_RESPONSE_OVERVIEW') {
        # Guard: Neu user da chon bang khac, khong override
        if (userManuallySelectedTable && currentTableName !== tab1TableName) {
            addTableOptionIfNotExists(tab1TableName, orders.length)
            return
        }

        allOrders = event.data.orders          ← RAW format
        currentTableName = event.data.tableName  ← Ten bang tu Tab1

        # Detect campaign name
        currentCampaignName = allOrders[0].LiveCampaignName

        # Update UI
        updateStats()
        updateCachedCountBadge()
        renderCachedDetailsTab()

        # Render statistics
        loadEmployeeRanges().then(() => {
            renderStatisticsFromAllOrders()
        })

        # Load Firebase data
        loadTableDataFromFirebase(currentTableName)
    }

    # Nhan thong bao doi ten bang tu Tab1
    if (event.data.type === 'TABLE_NAME_CHANGED') {
        # Update neu user chua manually chon bang khac
    }
})
```

### 5.3 Luong du lieu Tab1 → Overview (Diagram)

```
TAB 1 (fetchOrders)
  │
  ├─ allData = [1090 orders RAW]
  │
  ├─ Luu IndexedDB 'allOrdersRaw' (RAW format, FIRE-AND-FORGET)
  │   {orders: allData, timestamp}
  │
  └─ ⚠️ KHONG gui postMessage cho Overview (da bi remove)


OVERVIEW (DOMContentLoaded)
  │
  ├─ Buoc 1: Try IndexedDB 'allOrdersRaw'
  │   ├─ Co data → allOrders = cached.orders ✅
  │   │   → updateStats(), renderStatisticsFromAllOrders()
  │   │
  │   └─ Khong data → requestDataFromTab1()
  │                      │
  │                      ▼
  │                   main.html → Tab1
  │                   Tab1: getAllOrders() → ORDERS_DATA_RESPONSE_OVERVIEW
  │                   kem tableName = campaign.name
  │                      │
  │                      ▼
  │                   main.html → Overview
  │                   allOrders = event.data.orders (RAW format)
  │
  └─ ⚠️ CUNG VAN DE nhu Tab3:
      - Neu Tab1 chua fetch → allOrders = []
      - Overview khong retry
      - Tab1 khong notify khi co data moi
```

---

## 6. MAIN.HTML: MESSAGE ROUTER

### 6.1 Cau truc iframe (main.html:620-646)

```html
<!-- 5 iframes -->
<iframe id="ordersFrame" src="tab1-orders.html">         <!-- Tab 1: Quan ly don -->
<iframe id="productAssignmentFrame" src="tab3-product-assignment.html">  <!-- Tab 3: Phan SP -->
<iframe id="overviewFrame" src="tab-overview.html">       <!-- Bao cao tong hop -->
<iframe id="pendingDeleteFrame" src="tab-pending-delete.html">   <!-- Cho xoa -->
<iframe id="kpiCommissionFrame" src="tab-kpi-commission.html">   <!-- KPI -->
```

### 6.2 Message routing (main.html:862-965)

```
main.html nhan message tu iframe
│
├─ FILTER_CHANGED (tu Tab1)
│   → Luu localStorage 'tab1_filter_data'
│   → showSyncIndicator()
│
├─ REQUEST_FILTER_DATA (tu Tab2/3)
│   → Tra localStorage 'tab1_filter_data'
│
├─ REQUEST_ORDERS_DATA_FROM_TAB3 (tu Tab3)
│   → Forward sang Tab1 (ordersFrame.contentWindow.postMessage)
│
├─ REQUEST_ORDERS_DATA_FROM_OVERVIEW (tu Overview)
│   → Forward sang Tab1 (ordersFrame.contentWindow.postMessage)
│
├─ ORDERS_DATA_RESPONSE_TAB3 (tu Tab1)
│   → Forward sang Tab3 (productAssignmentFrame.contentWindow.postMessage)
│
├─ ORDERS_DATA_RESPONSE_OVERVIEW (tu Tab1)
│   → Forward sang Overview (overviewFrame.contentWindow.postMessage)
│
├─ RELOAD_TAB1_ONLY (tu Tab3)
│   → ordersFrame.src = ordersFrame.src   # Full reload Tab1
│
├─ RELOAD_TAB1_AND_TAB3 (tu Tab3)
│   → ordersFrame.src = ordersFrame.src   # Reload Tab1
│   → setTimeout(3500ms) → productAssignmentFrame.src = ...  # Reload Tab3 sau 3.5s
│
├─ FETCH_CONVERSATIONS_FOR_ORDERS
│   → Forward tu Overview sang Tab1
│
├─ REQUEST_TOKEN / TOKEN_RESPONSE
│   → Token exchange giua tabs
│
└─ SWITCH_TO_TAB1
    → switchTab('orders')
```

### 6.3 So do tong the giao tiep giua cac tab

```
                    ┌──────────────────────────────────┐
                    │           main.html               │
                    │      (MESSAGE ROUTER)             │
                    │                                    │
                    │  Nhan message → Forward dung tab   │
                    └──┬──────────┬──────────┬──────────┘
                       │          │          │
          postMessage  │          │          │  postMessage
                       │          │          │
              ┌────────▼───┐  ┌───▼────┐  ┌──▼──────────┐
              │   TAB 1    │  │ TAB 3  │  │  OVERVIEW   │
              │  (iframe)  │  │(iframe)│  │  (iframe)   │
              ├────────────┤  ├────────┤  ├─────────────┤
              │            │  │        │  │             │
              │ WRITES:    │  │ READS: │  │ READS:      │
              │ • allData  │  │ • IDB  │  │ • IDB       │
              │ • IDB x2   │  │   key: │  │   key:      │
              │ • OrderStore│ │allOrders│  │allOrdersRaw │
              │            │  │   OR   │  │   OR        │
              │ RESPONDS:  │  │ • post │  │ • postMsg   │
              │ • REQUEST_ │  │  Msg   │  │             │
              │   ORDERS   │  │        │  │ FORMAT:     │
              │            │  │ FORMAT:│  │ RAW API     │
              │            │  │ trans- │  │ objects     │
              │            │  │ formed │  │             │
              └────────────┘  └────────┘  └─────────────┘

    ⚠️ NOTE: Tab1 KHONG tu dong gui data cho Tab3/Overview
    khi fetchOrders() xong (cross-tab sync da bi remove).
    Cac tab phai TU doc IndexedDB hoac request qua postMessage.
```

---

## 7. CAC DIEM GAY LOI (BUG ANALYSIS)

### 7.1 LOI 1: "Xoay lien tuc khi dang nhap moi"

**Nguyen nhan co the:**

| # | Van de | File:Line | Mo ta chi tiet |
|---|--------|-----------|----------------|
| A | userId sai khi auth chua resolve | tab1-init.js:526-538 | `getCurrentUserId()` fallback sang localStorage hoac random ID. Neu Firebase Auth chua tra uid → userId la `user_1711234567890` → Firestore `user_preferences/{userId}` khong co document → `activeCampaignId = null` → show modal thay vi auto-load |
| B | loadAllCampaigns() tra {} | tab1-campaign-system.js:20-34 | Neu Firestore loi (permission, network) → return `{}` → app nghi khong co campaigns → show "tao moi" modal → user confused |
| C | continueAfterCampaignSelect silent return | tab1-init.js:575-578 | `if (!campaign) return` — KHONG show error, KHONG showLoading(false) → loading overlay KET |
| D | handleSearch() throw truoc fetchOrders | tab1-search.js:1090-1106 | Neu dates khong hop le → error notification nhung loading overlay KHONG duoc toggle (showLoading khong duoc goi trong handleSearch) |
| E | waitForAuthState timeout + null userId | tab1-init.js:414-418 | Timeout 5s resolve(currentUser) — neu currentUser van null → fallback userId → chain loi tiep |

**Flow loi dien hinh (dang nhap moi, incognito):**
```
1. DOMContentLoaded → initializeApp()
2. Firebase SDK loaded (typeof firebase !== 'undefined') ✅
3. waitForAuthState() → onAuthStateChanged CHUA fire
4. setTimeout 5s → resolve(firebase.auth().currentUser)
   → currentUser = null (auth chua init xong)
5. getCurrentUserId() → firebase.auth().currentUser = null
   → fallback: localStorage empty (incognito) → tao 'user_1711234567890'
6. loadActiveCampaignId() → Firestore user_preferences/user_1711234567890
   → Document KHONG ton tai → return null
7. campaigns co (da tao truoc) NHUNG activeCampaignId = null
8. → showSelectCampaignModal() → Loading overlay van hien
   ⚠️ User thay xoay lien tuc vi loading overlay khong bi tat
```

### 7.2 LOI 2: "allData luc duoc luc khong"

**Nguyen nhan co the:**

| # | Van de | File:Line | Mo ta chi tiet |
|---|--------|-----------|----------------|
| A | IndexedDB ghi fire-and-forget | tab1-search.js:1308-1318 | `.catch()` thay vi `await` → Tab3/Overview co the doc TRUOC khi ghi xong |
| B | Tab3 load 1 lan duy nhat | tab3-core.js:556 | `loadOrdersData()` chay 1 lan khi window.load, KHONG co retry/interval |
| C | Cross-tab sync da bi remove | tab1-search.js:1326 | Tab1 KHONG gui postMessage cho Tab3/Overview sau khi fetch xong |
| D | Tab3 nhan [] khi Tab1 chua ready | tab1-init.js:309 | `getAllOrders()` tra allData hien tai — neu dang fetch → tra [] |
| E | Timing: 5 iframes load dong thoi | main.html:620-646 | Tab3 va Overview co the load TRUOC Tab1 fetch xong → IndexedDB trong |
| F | IndexedDB data cu | — | Khong co TTL/expiry. Data tu session truoc van con → Tab3 hien data cu |

**Flow loi dien hinh:**
```
TAU THOI GIAN:
  T=0ms:   main.html tao 5 iframes
  T=100ms: Tab3 DOMContentLoaded → loadOrdersData()
  T=150ms: Tab3 doc IndexedDB 'allOrders' → co data CU tu session truoc ✅
           HOAC: IndexedDB trong → requestOrdersDataFromTab1()
  T=200ms: Tab1 DOMContentLoaded → initializeApp()
  T=500ms: Tab1 waitForAuthState() → dang cho...
  T=5000ms: Tab1 auth resolve → loadAllCampaigns()
  T=6000ms: Tab1 continueAfterCampaignSelect() → handleSearch()
  T=7000ms: Tab1 fetchOrders() bat dau...
  T=10000ms: Tab1 fetchOrders() xong → allData co 1090 orders
             → Luu IndexedDB (fire-and-forget)
             → ⚠️ KHONG notify Tab3/Overview

  Ket qua:
  - Neu Tab3 load O T=150ms va IndexedDB trong → request postMessage
  - Tab1 nhan request O T=150ms nhung allData = [] → tra []
  - Tab3 nhan [] → KHONG CO DATA
  - Tab1 fetch xong o T=10000ms nhung KHONG notify Tab3
  - Tab3 van hien 0 don hang cho den khi USER RELOAD
```

---

## 8. DE XUAT SUA LOI

### 8.1 Fix "xoay lien tuc" (PRIORITY: CAO)

**Fix A: Dam bao showLoading(false) luon duoc goi**
```
File: tab1-init.js, continueAfterCampaignSelect()
Van de: Neu campaign = null → return ma khong showLoading(false)
Fix: Them showLoading(false) truoc moi return va trong catch
```

**Fix B: Xu ly userId fallback tot hon**
```
File: tab1-init.js, getCurrentUserId() + initializeApp()
Van de: Auth chua resolve → userId sai → activeCampaignId khong tim thay
Fix: Neu waitForAuthState() resolve null → thu lai auth 1 lan nua
     HOAC: Dung localStorage userId + show warning "Dang dang nhap..."
```

### 8.2 Fix "allData luc duoc luc khong" (PRIORITY: CAO)

**Fix A: Await IndexedDB write**
```
File: tab1-search.js:1308-1318
Van de: .catch() thay vi await → Tab3/Overview doc truoc khi ghi xong
Fix: await indexedDBStorage.setItem('allOrders', ...)
     await indexedDBStorage.setItem('allOrdersRaw', ...)
```

**Fix B: Notify Tab3/Overview sau khi data san sang**
```
File: tab1-search.js, sau dong 1319
Van de: Cross-tab sync da bi remove → cac tab khong biet co data moi
Fix: Sau khi IndexedDB ghi xong:
     window.parent.postMessage({ type: 'ALLDATA_READY' }, '*')
     main.html forward sang Tab3 va Overview
     Tab3/Overview nhan → doc lai IndexedDB
```

**Fix C: Tab3 retry mechanism**
```
File: tab3-core.js, loadOrdersData()
Van de: Chi load 1 lan, khong retry
Fix: Neu IndexedDB trong va postMessage tra [] → retry sau 3s, toi da 3 lan
```

---

## FILES QUAN TRONG

| File | Dong quan trong | Chuc nang |
|------|----------------|-----------|
| `orders-report/js/tab1/tab1-init.js` | 9-379, 397-420, 427-521, 571-671 | Init flow, waitForAuthState, initializeApp, continueAfterCampaignSelect |
| `orders-report/js/tab1/tab1-search.js` | 504-560, 1084-1134, 1183-1394 | loadCampaignList, handleSearch, fetchOrders |
| `orders-report/js/tab1/tab1-core.js` | 186-240 | allData, filteredData, OrderStore |
| `orders-report/js/tab1/tab1-campaign-system.js` | 7-55 | campaignManager, loadAllCampaigns, saveActiveCampaign |
| `orders-report/js/tab1/tab1-firebase.js` | — | Firebase tag sync, realtime listeners |
| `orders-report/js/tab1/tab1-table.js` | ~2003 | showLoading() |
| `orders-report/js/tab3/tab3-core.js` | 382-407, 540-592 | loadOrdersData, init, message listener |
| `orders-report/js/overview/overview-init.js` | 1-161 | DOMContentLoaded, IndexedDB load |
| `orders-report/js/overview/overview-events.js` | 1-90 | Message listener, ORDERS_DATA_RESPONSE_OVERVIEW |
| `orders-report/js/overview/overview-firebase.js` | 13-33 | loadDefaultTableNameFromFirebase |
| `orders-report/main.html` | 620-646, 862-965 | Iframes, message router |
