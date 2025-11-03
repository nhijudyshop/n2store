// =====================================================
// UPDATED saveOrderTags() FUNCTION
// POST to: https://tomato.tpos.vn/odata/TagSaleOnlineOrder/ODataService.AssignTag
// =====================================================

async function saveOrderTags() {
    if (!currentEditingOrderId) {
        console.error('[TAG] No order selected');
        return;
    }

    try {
        showLoading(true);

        // Prepare payload for AssignTag endpoint
        const payload = {
            Tags: currentOrderTags.map(tag => ({
                Id: tag.Id,
                Color: tag.Color,
                Name: tag.Name
            })),
            OrderId: currentEditingOrderId
        };

        console.log('[TAG] Saving tags to order:', payload);

        // Get authentication headers
        const headers = await window.tokenManager.getAuthHeader();

        // POST to AssignTag endpoint
        const response = await fetch('https://tomato.tpos.vn/odata/TagSaleOnlineOrder/ODataService.AssignTag', {
            method: 'POST',
            headers: {
                ...headers,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[TAG] API Error:', response.status, errorText);
            throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
        }

        // Parse response (if any)
        let responseData = null;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            responseData = await response.json();
            console.log('[TAG] API Response:', responseData);
        }

        // Update local data with JSON stringified tags (for display)
        const tagsJson = JSON.stringify(currentOrderTags);
        const order = allData.find(o => o.Id === currentEditingOrderId);
        if (order) {
            order.Tags = tagsJson;
        }

        // Refresh table display
        renderTable();
        
        // Clear orders cache to force refresh on next load
        if (window.cacheManager) {
            window.cacheManager.clear('orders');
            console.log('[TAG] Orders cache cleared');
        }

        showLoading(false);
        closeTagModal();
        
        // Success notification
        showInfoBanner(`✅ Đã gán ${currentOrderTags.length} tag cho đơn hàng thành công!`);
        
        console.log('[TAG] Tags saved successfully');

    } catch (error) {
        console.error('[TAG] Error saving tags:', error);
        showLoading(false);
        
        // Show error alert
        alert(`Lỗi khi lưu tag:\n${error.message}\n\nVui lòng thử lại hoặc kiểm tra console để biết chi tiết.`);
    }
}

// =====================================================
// ENHANCED VERSION WITH NOTIFICATION SYSTEM
// (If notification-system.js is loaded)
// =====================================================

async function saveOrderTagsEnhanced() {
    if (!currentEditingOrderId) {
        console.error('[TAG] No order selected');
        return;
    }

    const notificationManager = window.notificationManager;
    let notificationId = null;

    try {
        // Show saving notification
        if (notificationManager) {
            notificationId = notificationManager.saving(`Đang lưu ${currentOrderTags.length} tag...`);
        } else {
            showLoading(true);
        }

        // Prepare payload
        const payload = {
            Tags: currentOrderTags.map(tag => ({
                Id: tag.Id,
                Color: tag.Color,
                Name: tag.Name
            })),
            OrderId: currentEditingOrderId
        };

        console.log('[TAG] Saving tags to order:', payload);

        // Get authentication headers
        const headers = await window.tokenManager.getAuthHeader();

        // POST to AssignTag endpoint
        const response = await fetch('https://tomato.tpos.vn/odata/TagSaleOnlineOrder/ODataService.AssignTag', {
            method: 'POST',
            headers: {
                ...headers,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[TAG] API Error:', response.status, errorText);
            throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
        }

        // Parse response
        let responseData = null;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            responseData = await response.json();
            console.log('[TAG] API Response:', responseData);
        }

        // Update local data
        const tagsJson = JSON.stringify(currentOrderTags);
        const order = allData.find(o => o.Id === currentEditingOrderId);
        if (order) {
            order.Tags = tagsJson;
        }

        // Refresh display
        renderTable();
        
        // Clear cache
        if (window.cacheManager) {
            window.cacheManager.clear('orders');
            console.log('[TAG] Orders cache cleared');
        }

        // Close notification and show success
        if (notificationManager && notificationId) {
            notificationManager.remove(notificationId);
            notificationManager.success(
                `Đã gán ${currentOrderTags.length} tag cho đơn hàng`,
                2000,
                'Thành công'
            );
        } else {
            showLoading(false);
            showInfoBanner(`✅ Đã gán ${currentOrderTags.length} tag cho đơn hàng thành công!`);
        }

        closeTagModal();
        console.log('[TAG] Tags saved successfully');

    } catch (error) {
        console.error('[TAG] Error saving tags:', error);
        
        // Show error notification
        if (notificationManager) {
            if (notificationId) {
                notificationManager.remove(notificationId);
            }
            notificationManager.error(
                error.message,
                5000,
                'Lỗi khi lưu tag'
            );
        } else {
            showLoading(false);
            alert(`Lỗi khi lưu tag:\n${error.message}\n\nVui lòng thử lại hoặc kiểm tra console để biết chi tiết.`);
        }
    }
}

// =====================================================
// USAGE NOTES
// =====================================================
/*
THAY ĐỔI CHÍNH:
1. Endpoint: POST https://tomato.tpos.vn/odata/TagSaleOnlineOrder/ODataService.AssignTag
2. Payload format:
   {
     "Tags": [
       {"Id": 59119, "Color": "#e8330c", "Name": "THẺ KHÁCH LẠ"},
       ...
     ],
     "OrderId": "d4430000-5d27-0015-3353-08de152ea966"
   }
3. Method: POST (thay vì PATCH)
4. Giữ nguyên authentication qua tokenManager
5. Clear cache sau khi lưu thành công

CÁCH SỬ DỤNG:
- Thay thế hàm saveOrderTags() hiện tại bằng một trong hai version trên
- Version 1 (saveOrderTags): Dùng showLoading() và alert() có sẵn
- Version 2 (saveOrderTagsEnhanced): Dùng notificationManager nếu có

ĐỂ DÙNG VERSION ENHANCED:
- Đổi tên hàm saveOrderTagsEnhanced() thành saveOrderTags()
- Hoặc update button onclick trong HTML:
  <button class="tag-btn-save" onclick="saveOrderTagsEnhanced()">
*/
