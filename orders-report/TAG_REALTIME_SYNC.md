# TAG Realtime Sync - Implementation Guide

## 📋 Tổng quan

Hệ thống TAG Realtime Sync cho phép nhiều người dùng cùng xem và cập nhật TAG của đơn hàng theo thời gian thực. Khi user A cập nhật TAG cho đơn hàng, user B sẽ thấy ngay lập tức không cần refresh page.

## 🎯 Features Đã Implement

### ✅ 1. Realtime Sync qua Firebase
- ✅ Khi user save TAG → emit update lên Firebase Realtime Database
- ✅ Tất cả user khác đang xem cùng campaign sẽ nhận update ngay lập tức
- ✅ Update UI tự động (không cần reload page)
- ✅ Hiển thị notification cho user biết ai đã update TAG nào

### ✅ 2. WebSocket Support (Ready for Backend)
- ✅ RealtimeManager đã được update để handle event `order:tags_updated`
- ✅ Khi backend emit event qua WebSocket → UI tự động update
- ✅ Tương thích với architecture hiện tại (Pancake WebSocket)

### ✅ 3. Conflict Resolution
- ✅ Phát hiện khi 2 user cùng edit 1 đơn hàng
- ✅ Tự động đóng modal của user đang edit nếu user khác save trước
- ✅ Hiển thị warning message để user biết có conflict

### ✅ 4. Smart Listeners Management
- ✅ Tự động setup Firebase listeners khi chọn campaign
- ✅ Cleanup listeners khi đổi sang campaign khác
- ✅ Tránh memory leak và duplicate listeners

### ✅ 5. Data Persistence & Offline Handling
- ✅ TAG luôn được lưu trên server (TPOS API) - source of truth
- ✅ Firebase chỉ dùng cho realtime sync, không phải primary storage
- ✅ Khi mất mạng → TAG vẫn được giữ an toàn trên server
- ✅ Khi kết nối lại → sync lại từ server

## 🔧 Kiến trúc

```
┌─────────────────────────────────────────────────────────────┐
│                   TAG REALTIME SYNC FLOW                    │
└─────────────────────────────────────────────────────────────┘

USER A: Cập nhật TAG
  ↓
  1. saveOrderTags()
     ├── POST /api/odata/TagSaleOnlineOrder/ODataService.AssignTag
     ├── ✅ Save to TPOS Server (Primary)
     └── emitTagUpdateToFirebase()
         └── 🔥 Write to Firebase: /tag_updates/{campaignId}/{orderId}

USER B, C, D: Nhận update realtime
  ↓
  2. Firebase Listener (setupTagRealtimeListeners)
     └── .on('child_changed') → handleRealtimeTagUpdate()
         ├── Check conflict (có đang edit không?)
         ├── updateOrderInTable() → Update 3 arrays (allData, filteredData, displayedData)
         ├── Re-render table
         └── Show notification: "🔥 User A đã cập nhật TAG cho đơn #123"

FUTURE: Backend WebSocket Support
  ↓
  3. Backend emit event khi TAG được save
     └── RealtimeManager.handleOrderTagsUpdate()
         └── window.dispatchEvent('realtimeOrderTagsUpdate')
             └── handleRealtimeTagUpdate()
```

## 📁 Files Modified

### 1. `realtime-manager.js`
- **Thêm:** `handleOrderTagsUpdate()` - xử lý WebSocket event
- **Thêm:** Handler cho event `order:tags_updated` trong `handleMessage()` và `proxyWs.onmessage`

### 2. `tab1-orders.js`
- **Thêm:** `emitTagUpdateToFirebase()` - emit TAG update lên Firebase
- **Thêm:** `setupTagRealtimeListeners()` - setup Firebase & WebSocket listeners
- **Thêm:** `handleRealtimeTagUpdate()` - xử lý realtime update từ Firebase/WebSocket
- **Thêm:** `cleanupTagRealtimeListeners()` - cleanup listeners khi đổi campaign
- **Update:** `saveOrderTags()` - thêm emit lên Firebase sau khi save
- **Update:** `handleCampaignChange()` - cleanup old listeners và setup new listeners

## 🚀 Cách sử dụng

### User Experience

1. **Xem TAG realtime:**
   - User A và User B cùng mở trang Orders Report
   - Chọn cùng một campaign
   - User A update TAG cho đơn hàng → User B thấy ngay lập tức

2. **Notification:**
   - Khi có TAG update từ user khác → hiện notification
   - Format: `🔥 [Tên user] đã cập nhật TAG cho đơn #[Mã đơn]: [Danh sách TAG]`

3. **Conflict Handling:**
   - User A đang edit TAG của đơn #123
   - User B save TAG cho đơn #123
   - Modal của User A tự động đóng với warning message
   - User A có thể mở lại và edit với data mới nhất

### Developer Experience

```javascript
// 1. Firebase listener tự động setup khi chọn campaign
// Không cần làm gì thêm

// 2. Để test: Mở 2 browser tabs
// Tab 1: Chọn campaign, update TAG
// Tab 2: Chọn cùng campaign, xem TAG update realtime

// 3. Check logs trong console
// [TAG-REALTIME] Tag update emitted to Firebase: ...
// [TAG-REALTIME] Firebase tag update received: ...
// [TAG-REALTIME] Processing update from firebase: ...
```

## 🔌 Backend Integration (Optional - WebSocket)

Nếu backend TPOS hỗ trợ WebSocket, có thể emit event để tăng tốc độ sync:

### Backend Requirements:

```javascript
// Khi API /TagSaleOnlineOrder/ODataService.AssignTag được gọi
// Emit event qua WebSocket:

socket.broadcast.emit('order:tags_updated', {
  orderId: req.body.OrderId,
  orderCode: order.Code,
  STT: order.STT,
  tags: req.body.Tags,
  updatedBy: req.user.displayName || req.user.name,
  timestamp: Date.now()
});
```

### Phoenix WebSocket Format:

```javascript
// Message format: [joinRef, ref, topic, event, payload]
const message = [
  joinRef,
  ref,
  `multiple_pages:${userId}`,
  'order:tags_updated',
  {
    orderId: '...',
    orderCode: '...',
    STT: 123,
    tags: [...],
    updatedBy: 'Display Name',
    timestamp: 1234567890
  }
];

ws.send(JSON.stringify(message));
```

**Note:** Nếu backend không hỗ trợ WebSocket, Firebase Realtime Database vẫn hoạt động tốt như primary realtime solution.

## 🛡️ Data Safety

### 1. Source of Truth: TPOS Server
- TAG luôn được lưu vào server TPOS API trước
- Firebase chỉ dùng để broadcast update, không phải primary storage
- Nếu Firebase fail → TAG vẫn an toàn trên server

### 2. Offline Handling
```
Scenario: User mất mạng 1 giờ

T0: User online, TAG saved on server ✅
T1: Mất mạng 1 giờ
    - localStorage cache vẫn valid (expire sau 24h)
    - Server giữ nguyên TAG
T2: Kết nối lại
    - Firebase sync lại ✅
    - Reload orders từ server nếu cần ✅
    - TAG không bị mất ✅
```

### 3. Conflict Resolution
- **Last Write Wins:** Update cuối cùng sẽ được giữ
- **Auto-close modal:** Ngăn user overwrite lẫn nhau
- **Notification:** User biết ai đã update và có thể re-edit nếu cần

## 📊 Firebase Database Structure

```
/tag_updates
  /{orderId}
    orderId: "uuid"
    orderCode: "DH123"
    STT: 123
    tags: [
      { Id: 123, Name: "VIP", Color: "#ff0000" },
      { Id: 456, Name: "Ưu tiên", Color: "#00ff00" }
    ]
    updatedBy: "Display Name"
    timestamp: 1234567890
```

**Note:**
- No `campaignId` nesting - simpler structure
- `STT` field included for better notification context
- `updatedBy` uses `authManager.getAuthState().displayName`

**Retention Policy:**
- Data tự động expire sau 24h (có thể config trong Firebase Rules)
- Chỉ dùng để sync realtime, không dùng để backup

## 🐛 Troubleshooting

### Issue: TAG không sync realtime

**Check:**
1. Firebase có được init không?
   ```javascript
   console.log('[NOTE-TRACKER] Firebase database reference obtained');
   ```

2. Campaign có được chọn không?
   ```javascript
   // Phải chọn specific campaign, không phải "all"
   const campaignId = document.getElementById('campaignFilter')?.value;
   console.log('Campaign ID:', campaignId);
   ```

3. Firebase listener có được setup không?
   ```javascript
   console.log('[TAG-REALTIME] Setting up Firebase listener on: ...');
   ```

### Issue: Notification không hiện

**Check:**
1. `window.notificationManager` có available không?
   ```javascript
   if (!window.notificationManager) {
     console.error('NotificationManager not available');
   }
   ```

2. Check browser console logs:
   ```
   [TAG-REALTIME] Notification: ...
   ```

### Issue: Conflict không được handle

**Check:**
1. `currentEditingOrderId` có được set đúng không?
   ```javascript
   console.log('Currently editing order:', currentEditingOrderId);
   ```

2. Modal có đang mở không?
   ```javascript
   const modal = document.getElementById('tagModal');
   console.log('Modal display:', modal.style.display);
   ```

## 📈 Performance Notes

- **Firebase listeners:** Chỉ listen changes của campaign hiện tại → giảm bandwidth
- **Memory management:** Cleanup listeners khi đổi campaign → no memory leak
- **Bandwidth:** Chỉ emit khi có update thật sự → không waste bandwidth
- **Debounce:** Firebase updates được debounce tự động (không emit quá nhiều)

## 🎓 Best Practices

1. **Chọn specific campaign** để enable realtime sync (không chọn "all")
2. **Không giữ modal TAG mở quá lâu** để tránh conflict
3. **Reload page thỉnh thoảng** để sync lại data mới nhất từ server
4. **Check Firebase connection** trong Settings nếu realtime không hoạt động

## 📝 Future Improvements

- [ ] Thêm "typing indicator" khi user đang edit TAG
- [ ] Show list of users đang xem cùng campaign
- [ ] Thêm undo/redo cho TAG changes
- [ ] Thêm TAG change history/audit log
- [ ] Optimize Firebase bandwidth với delta updates

## 📞 Support

Nếu có vấn đề, check:
1. Browser Console logs (F12)
2. Firebase Console → Realtime Database → Data tab
3. Network tab để xem API calls

---

**Implemented by:** Claude AI Assistant
**Date:** 2025-12-02
**Version:** 1.0.0
