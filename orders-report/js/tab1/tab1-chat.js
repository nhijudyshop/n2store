// Anti-spam: Track fetched channelIds and debounce requests
const fetchedChannelIdsCache = new Set();
let fetchConversationsDebounceTimer = null;
let isFetchingConversationsFromOverview = false;

function handleFetchConversationsRequest(orders) {
    console.log('📨 [CONVERSATIONS] Nhận request fetch conversations từ tab-overview');
    console.log('📊 [CONVERSATIONS] Orders count:', orders.length);

    if (orders.length === 0 || !window.chatDataManager) {
        console.log('[CONVERSATIONS] ⏭️ Skipping - no orders or chatDataManager not ready');
        return;
    }

    // Prevent concurrent fetches
    if (isFetchingConversationsFromOverview) {
        console.log('[CONVERSATIONS] ⏭️ Skipping - already fetching');
        return;
    }

    // Parse channelIds from orders
    const allChannelIds = [...new Set(
        orders
            .map(order => {
                const postId = order.Facebook_PostId;
                if (!postId) return null;
                // Parse channelId from Facebook_PostId (format: "pageId_postId")
                const parts = postId.split('_');
                return parts.length > 0 ? parts[0] : null;
            })
            .filter(id => id)
    )];

    // Filter out already fetched channelIds (anti-spam)
    const newChannelIds = allChannelIds.filter(id => !fetchedChannelIdsCache.has(id));

    console.log('[CONVERSATIONS] All channel IDs:', allChannelIds.length);
    console.log('[CONVERSATIONS] New channel IDs (not cached):', newChannelIds.length);
    console.log('[CONVERSATIONS] Cached channel IDs:', fetchedChannelIdsCache.size);

    if (newChannelIds.length === 0) {
        console.log('[CONVERSATIONS] ✅ All channels already fetched, skipping API call');
        // Still re-render in case data changed
        performTableSearch();
        return;
    }

    // Debounce: Wait 500ms before fetching to avoid rapid consecutive calls
    if (fetchConversationsDebounceTimer) {
        clearTimeout(fetchConversationsDebounceTimer);
    }

    fetchConversationsDebounceTimer = setTimeout(async () => {
        isFetchingConversationsFromOverview = true;

        try {
            console.log('[CONVERSATIONS] 🔄 Fetching conversations for', newChannelIds.length, 'channels...');

            // Fetch conversations
            await window.chatDataManager.fetchConversations(true, newChannelIds);

            // Add to cache after successful fetch
            newChannelIds.forEach(id => fetchedChannelIdsCache.add(id));

            console.log('[CONVERSATIONS] ✅ Conversations fetched for Firebase orders');
            console.log('[CONVERSATIONS] Cache size now:', fetchedChannelIdsCache.size);

            // Re-render table to show messages
            performTableSearch();
        } catch (err) {
            console.error('[CONVERSATIONS] ❌ Error fetching conversations:', err);
        } finally {
            isFetchingConversationsFromOverview = false;
        }
    }, 500); // 500ms debounce
}

function sendOrdersDataToTab3() {
    // Prepare orders data with STT (SessionIndex)
    const ordersDataToSend = allData.map((order, index) => ({
        stt: order.SessionIndex || (index + 1).toString(), // Use SessionIndex as STT
        orderId: order.Id,
        orderCode: order.Code,
        customerName: order.PartnerName || order.Name,
        phone: order.PartnerPhone || order.Telephone,
        address: order.PartnerAddress || order.Address,
        totalAmount: order.TotalAmount || order.AmountTotal || 0,
        quantity: order.TotalQuantity || order.Details?.reduce((sum, d) => sum + (d.Quantity || d.ProductUOMQty || 0), 0) || 0,
        note: order.Note,
        state: order.Status || order.State,
        dateOrder: order.DateCreated || order.DateOrder,
        Tags: order.Tags, // Tags JSON array for overview aggregation
        LiveCampaignName: order.LiveCampaignName, // Campaign name for overview filtering
        products: order.Details?.map(d => ({
            id: d.ProductId,
            name: d.ProductName,
            nameGet: d.ProductNameGet,
            code: d.ProductCode,
            quantity: d.Quantity || d.ProductUOMQty || 0,
            price: d.Price || 0,
            imageUrl: d.ImageUrl,
            uom: d.UOMName
        })) || []
    }));

    // Save to localStorage for persistence
    localStorage.setItem('ordersData', JSON.stringify(ordersDataToSend));

    // Send to product assignment tab via parent window forwarding
    // Updated to avoid "SecurityError: Blocked a frame with origin 'null'"
    if (window.parent) {
        window.parent.postMessage({
            type: 'ORDERS_DATA_RESPONSE_TAB3', // Specific type for Tab3 only
            orders: ordersDataToSend
        }, '*');
        console.log(`📤 Đã gửi ${ordersDataToSend.length} đơn hàng về parent để forward sang tab 3`);
    }
}

function sendOrdersDataToOverview() {
    // Prepare orders data with STT (SessionIndex) - use ALL data (not filtered)
    const ordersDataToSend = allData.map((order, index) => ({
        stt: order.SessionIndex || (index + 1).toString(), // Use SessionIndex as STT
        orderId: order.Id,
        orderCode: order.Code,
        customerName: order.PartnerName || order.Name,
        phone: order.PartnerPhone || order.Telephone,
        address: order.PartnerAddress || order.Address,
        totalAmount: order.TotalAmount || order.AmountTotal || 0,
        quantity: order.TotalQuantity || order.Details?.reduce((sum, d) => sum + (d.Quantity || d.ProductUOMQty || 0), 0) || 0,
        note: order.Note,
        state: order.Status || order.State,
        dateOrder: order.DateCreated || order.DateOrder,
        Tags: order.Tags, // Tags JSON array for overview aggregation
        liveCampaignName: order.LiveCampaignName, // Campaign name for overview filtering
        products: order.Details?.map(d => ({
            id: d.ProductId,
            name: d.ProductName,
            nameGet: d.ProductNameGet,
            code: d.ProductCode,
            quantity: d.Quantity || d.ProductUOMQty || 0,
            price: d.Price || 0,
            imageUrl: d.ImageUrl,
            uom: d.UOMName
        })) || []
    }));

    // Send to overview tab via parent window forwarding
    if (window.parent) {
        // FIXED: Get campaign name from multiple sources for reliability
        let campaignName = null;

        // 1. Primary source: window.campaignManager.activeCampaign (most reliable)
        if (window.campaignManager && window.campaignManager.activeCampaign && window.campaignManager.activeCampaign.name) {
            campaignName = window.campaignManager.activeCampaign.name;
            console.log('[OVERVIEW] 📋 Campaign name from campaignManager:', campaignName);
        }

        // 2. Fallback: DOM element activeCampaignLabel
        if (!campaignName) {
            const activeCampaignLabel = document.getElementById('activeCampaignLabel');
            if (activeCampaignLabel) {
                // Extract text content, remove icon HTML
                const labelText = activeCampaignLabel.textContent.trim();
                // Check if it's still loading or empty
                if (labelText && labelText !== 'Đang tải...' && labelText !== '') {
                    campaignName = labelText;
                    console.log('[OVERVIEW] 📋 Campaign name from DOM label:', campaignName);
                }
            }
        }

        // 3. Last fallback: Get from first order's LiveCampaignName
        if (!campaignName && allData.length > 0 && allData[0].LiveCampaignName) {
            campaignName = allData[0].LiveCampaignName;
            console.log('[OVERVIEW] 📋 Campaign name from first order:', campaignName);
        }

        console.log('[OVERVIEW] 📋 Final campaign name to send:', campaignName);

        window.parent.postMessage({
            type: 'ORDERS_DATA_RESPONSE_OVERVIEW', // Specific type for Overview only
            orders: ordersDataToSend,
            tableName: campaignName, // Campaign name (null if not selected)
            timestamp: Date.now()
        }, '*');
        console.log(`📤 [OVERVIEW] Đã gửi ${ordersDataToSend.length} đơn hàng với campaign "${campaignName}" về tab Báo Cáo Tổng Hợp`);
    }
}

// =====================================================
// CHAT MODAL FUNCTIONS
// =====================================================
// Make these global so they can be accessed from other modules (e.g., chat-modal-products.js)
window.currentChatChannelId = null;
window.currentChatPSID = null;
window.currentRealFacebookPSID = null;  // Real Facebook PSID (from_psid) for Graph API
window.currentConversationId = null;  // Lưu conversation ID cho reply

// Module-scoped variables (not needed externally)
let currentChatType = null;
let currentChatCursor = null;
window.allChatMessages = []; // Make global for WebSocket access
let skipWebhookUpdate = false; // Flag to skip webhook updates right after sending message
let isSendingMessage = false; // Flag to prevent double message sending
window.allChatComments = []; // Make global for WebSocket access
let isLoadingMoreMessages = false;
let currentOrder = null;  // Lưu order hiện tại để gửi reply

// ============================================================================
// MARK READ/UNREAD STATE MANAGEMENT
// ============================================================================

/**
 * Global state for current conversation read status
 */
window.currentConversationReadState = {
    isRead: false,           // Current read status
    conversationId: null,    // Conversation ID
    pageId: null,            // Page ID
    lastMarkedAt: null,      // Last marked timestamp
    chatType: null           // 'message' or 'comment'
};

/**
 * Timer for auto mark as read debounce
 */
let markReadTimer = null;

/**
 * Update read badge UI
 * @param {boolean} isRead - Read status
 */
function updateReadBadge(isRead) {
    const badge = document.getElementById('chatReadBadge');
    if (!badge) return;

    badge.style.display = 'inline-flex'; // Show badge

    if (isRead) {
        badge.innerHTML = '<i class="fas fa-check-circle"></i> Đã đọc';
        badge.style.color = '#10b981'; // Green
        badge.style.background = 'rgba(16, 185, 129, 0.2)';
        badge.style.border = '1px solid rgba(16, 185, 129, 0.3)';
    } else {
        badge.innerHTML = '<i class="fas fa-circle"></i> Chưa đọc';
        badge.style.color = '#f59e0b'; // Orange
        badge.style.background = 'rgba(245, 158, 11, 0.2)';
        badge.style.border = '1px solid rgba(245, 158, 11, 0.3)';
    }
}

/**
 * Update mark read/unread toggle button UI
 * @param {boolean} isRead - Read status
 */
function updateMarkButton(isRead) {
    const btn = document.getElementById('btnMarkReadToggle');
    if (!btn) return;

    btn.style.display = 'flex'; // Show button

    if (isRead) {
        btn.innerHTML = '<i class="fas fa-envelope-open"></i>';
        btn.style.background = 'rgba(245, 158, 11, 0.8)'; // Orange
        btn.title = 'Đánh dấu chưa đọc';
    } else {
        btn.innerHTML = '<i class="fas fa-envelope"></i>';
        btn.style.background = 'rgba(16, 185, 129, 0.8)'; // Green
        btn.title = 'Đánh dấu đã đọc';
    }
}

/**
 * Auto mark conversation as read with debounce
 * @param {number} delayMs - Delay in milliseconds before marking
 */
function autoMarkAsRead(delayMs = 0) {
    clearTimeout(markReadTimer);

    markReadTimer = setTimeout(async () => {
        const { pageId, conversationId, isRead, chatType } = window.currentConversationReadState;

        // Skip if already marked as read
        if (isRead) {
            console.log('[MARK-READ] Already marked as read, skipping');
            return;
        }

        // Skip for comments (if comment read status not supported)
        if (chatType === 'comment') {
            console.log('[MARK-READ] Skipping auto-mark for comment type');
            return;
        }

        if (!pageId || !conversationId) {
            console.warn('[MARK-READ] Missing pageId or conversationId');
            return;
        }

        console.log('[MARK-READ] Auto marking as read...', conversationId);

        const success = await window.pancakeDataManager.markConversationAsRead(pageId, conversationId);

        if (success) {
            window.currentConversationReadState.isRead = true;
            window.currentConversationReadState.lastMarkedAt = Date.now();
            updateReadBadge(true);
            updateMarkButton(true);

            // ✨ NEW: Update conversation data locally and refresh table UI
            if (window.pancakeDataManager) {
                window.pancakeDataManager.updateConversationReadStatus(conversationId, true);

                // Re-render table to show updated badge/count
                if (typeof renderTable === 'function') {
                    console.log('[MARK-READ] 🔄 Auto-refresh table UI...');
                    renderTable();
                }
            }
        }
    }, delayMs);
}

/**
 * Toggle conversation read/unread state manually
 */
window.toggleConversationReadState = async function () {
    const { pageId, conversationId, isRead } = window.currentConversationReadState;

    if (!pageId || !conversationId) {
        alert('Không tìm thấy thông tin cuộc hội thoại');
        return;
    }

    const btn = document.getElementById('btnMarkReadToggle');
    if (!btn) return;

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        let success;
        if (isRead) {
            // Mark as unread
            console.log('[MARK-READ] Toggling to unread');
            success = await window.pancakeDataManager.markConversationAsUnread(pageId, conversationId);
        } else {
            // Mark as read
            console.log('[MARK-READ] Toggling to read');
            success = await window.pancakeDataManager.markConversationAsRead(pageId, conversationId);
        }

        if (success) {
            window.currentConversationReadState.isRead = !isRead;
            window.currentConversationReadState.lastMarkedAt = Date.now();
            updateReadBadge(!isRead);
            updateMarkButton(!isRead);

            // ✨ NEW: Update conversation data locally and refresh table UI
            if (window.pancakeDataManager) {
                window.pancakeDataManager.updateConversationReadStatus(conversationId, !isRead);

                // Re-render table to show updated badge/count
                if (typeof renderTable === 'function') {
                    console.log('[MARK-READ] 🔄 Refreshing table UI...');
                    renderTable();
                }
            }
        } else {
            alert('Không thể thay đổi trạng thái đọc');
        }
    } catch (error) {
        console.error('[MARK-READ] Toggle failed:', error);
        alert('Lỗi khi thay đổi trạng thái đọc');
    } finally {
        btn.disabled = false;
        updateMarkButton(window.currentConversationReadState.isRead);
    }
};

// ============================================================================
// END MARK READ/UNREAD STATE MANAGEMENT
// ============================================================================
let currentParentCommentId = null;  // Lưu parent comment ID
let currentPostId = null; // Lưu post ID của comment đang reply
window.availableChatPages = []; // Cache pages for selector
window.currentSendPageId = null; // Page ID selected for SENDING messages (independent from view)
window.allMatchingConversations = []; // Store all matching conversations for selector
let messageReplyType = 'reply_inbox'; // 'reply_inbox' or 'private_replies' for message modal

// =====================================================
// MESSAGE REPLY TYPE TOGGLE FUNCTIONS
// =====================================================

/**
 * Set the message reply type (toggle between reply_inbox and private_replies)
 * @param {string} type - 'reply_inbox' or 'private_replies'
 */
window.setMessageReplyType = function (type) {
    messageReplyType = type;

    const btnInbox = document.getElementById('btnMsgReplyInbox');
    const btnPrivate = document.getElementById('btnMsgPrivateReply');
    const hintText = document.getElementById('msgReplyTypeHint');

    if (type === 'reply_inbox') {
        // Messenger selected
        if (btnInbox) {
            btnInbox.style.borderColor = '#3b82f6';
            btnInbox.style.background = '#eff6ff';
            btnInbox.style.color = '#1d4ed8';
        }
        if (btnPrivate) {
            btnPrivate.style.borderColor = '#e5e7eb';
            btnPrivate.style.background = 'white';
            btnPrivate.style.color = '#6b7280';
        }
        if (hintText) {
            hintText.textContent = 'Gửi tin nhắn qua Messenger';
        }
    } else {
        // Private reply from comment selected
        if (btnInbox) {
            btnInbox.style.borderColor = '#e5e7eb';
            btnInbox.style.background = 'white';
            btnInbox.style.color = '#6b7280';
        }
        if (btnPrivate) {
            btnPrivate.style.borderColor = '#3b82f6';
            btnPrivate.style.background = '#eff6ff';
            btnPrivate.style.color = '#1d4ed8';
        }
        if (hintText) {
            hintText.textContent = 'Gửi tin nhắn riêng từ comment đặt hàng';
        }
    }

    console.log('[MESSAGE] Reply type set to:', type);
};

/**
 * Show or hide message reply type toggle based on comment availability
 */
window.updateMessageReplyTypeToggle = function () {
    const toggle = document.getElementById('messageReplyTypeToggle');
    if (!toggle) return;

    // Only show toggle for message type and when order has comment
    const hasComment = window.purchaseCommentId && window.purchaseFacebookPostId;
    const isMessageType = currentChatType === 'message';

    if (isMessageType && hasComment) {
        toggle.style.display = 'block';
        console.log('[MESSAGE] Reply type toggle shown - order has comment:', window.purchaseCommentId);
    } else {
        toggle.style.display = 'none';
        // Reset to default when hidden
        messageReplyType = 'reply_inbox';
    }
};

// =====================================================
// CONVERSATION TYPE TOGGLE FUNCTIONS
// =====================================================

// Track current conversation type being viewed
let currentConversationType = 'INBOX'; // 'INBOX' or 'COMMENT'

/**
 * Update conversation type toggle button states
 * @param {string} type - 'INBOX' or 'COMMENT'
 */
window.updateConversationTypeToggle = function (type) {
    const btnInbox = document.getElementById('btnViewInbox');
    const btnComment = document.getElementById('btnViewComment');

    if (!btnInbox || !btnComment) return;

    if (type === 'INBOX') {
        // INBOX selected
        btnInbox.style.borderColor = 'rgba(255, 255, 255, 0.8)';
        btnInbox.style.background = 'rgba(255, 255, 255, 0.2)';
        btnInbox.style.color = 'white';

        btnComment.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        btnComment.style.background = 'transparent';
        btnComment.style.color = 'rgba(255, 255, 255, 0.7)';
    } else {
        // COMMENT selected
        btnInbox.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        btnInbox.style.background = 'transparent';
        btnInbox.style.color = 'rgba(255, 255, 255, 0.7)';

        btnComment.style.borderColor = 'rgba(255, 255, 255, 0.8)';
        btnComment.style.background = 'rgba(255, 255, 255, 0.2)';
        btnComment.style.color = 'white';
    }

    currentConversationType = type;
    console.log('[CONV-TYPE] Conversation type set to:', type);
};

/**
 * Switch between INBOX and COMMENT conversation types
 * @param {string} type - 'INBOX' or 'COMMENT'
 */
window.switchConversationType = async function (type) {
    if (currentConversationType === type) {
        console.log('[CONV-TYPE] Already viewing', type);
        return;
    }

    console.log('[CONV-TYPE] Switching from', currentConversationType, 'to', type);

    // Update toggle button states
    window.updateConversationTypeToggle(type);

    // Update modal title
    const titleText = type === 'COMMENT' ? 'Bình luận' : 'Tin nhắn';
    const titleElement = document.getElementById('chatModalTitle');
    if (titleElement && currentOrder) {
        titleElement.textContent = `${titleText} với ${currentOrder.Name}`;
    }

    // Reset state
    window.allChatMessages = [];
    window.allChatComments = [];
    currentChatCursor = null;
    isLoadingMoreMessages = false;
    window.currentConversationId = null;
    currentParentCommentId = null;
    currentPostId = null;

    // Hide conversation selector
    window.hideConversationSelector();

    // Show loading
    const modalBody = document.getElementById('chatModalBody');
    const loadingText = type === 'COMMENT' ? 'Đang tải bình luận...' : 'Đang tải tin nhắn...';
    modalBody.innerHTML = `
        <div class="chat-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>${loadingText}</p>
        </div>`;

    // Update input state based on conversation type
    const chatInput = document.getElementById('chatReplyInput');
    const chatSendBtn = document.getElementById('chatSendBtn');
    const markReadBtn = document.getElementById('chatMarkReadBtn');

    if (type === 'COMMENT') {
        // Disable input for comments (only enable when replying to specific comment)
        if (chatInput) {
            chatInput.disabled = true;
            chatInput.placeholder = 'Chọn "Trả lời" một bình luận để reply...';
            chatInput.style.background = '#f3f4f6';
            chatInput.style.cursor = 'not-allowed';
        }
        if (chatSendBtn) {
            chatSendBtn.disabled = true;
            chatSendBtn.style.opacity = '0.5';
            chatSendBtn.style.cursor = 'not-allowed';
        }
        if (markReadBtn) {
            markReadBtn.style.display = 'none';
        }
    } else {
        // Enable input for INBOX messages
        if (chatInput) {
            chatInput.disabled = false;
            chatInput.placeholder = 'Nhập tin nhắn trả lời... (Shift+Enter để xuống dòng)';
            chatInput.style.background = '#f9fafb';
            chatInput.style.cursor = 'text';
        }
        if (chatSendBtn) {
            chatSendBtn.disabled = false;
            chatSendBtn.style.opacity = '1';
            chatSendBtn.style.cursor = 'pointer';
        }
        if (markReadBtn) {
            markReadBtn.style.display = 'none'; // Keep hidden for now
        }

        // Auto-focus chat input when switching to INBOX (message mode)
        setTimeout(() => {
            if (chatInput) chatInput.focus();
        }, 150);
    }

    // Update current chat type for other functions to use
    currentChatType = type === 'COMMENT' ? 'comment' : 'message';

    // Fetch messages or comments based on type
    // NOTE: Conversations are already fetched when modal opened, just reuse cached IDs
    try {
        if (type === 'COMMENT') {
            // Use cached COMMENT conversation ID (already fetched when modal opened)
            const commentConvId = window.currentCommentConversationId;

            if (!commentConvId) {
                console.warn('[CONV-TYPE] ⚠️ No COMMENT conversation ID found');
                modalBody.innerHTML = `
                    <div class="chat-error">
                        <i class="fas fa-info-circle"></i>
                        <p>Không tìm thấy bình luận cho khách hàng này</p>
                    </div>`;
                return;
            }

            // Use the cached conversation ID
            window.currentConversationId = commentConvId;
            console.log('[CONV-TYPE] ✅ Using cached COMMENT conversationId:', window.currentConversationId);

            // Fetch messages for COMMENT conversation
            console.log('[CONV-TYPE] 📥 Fetching messages for COMMENT conversation...');

            const messagesResponse = await window.pancakeDataManager.fetchMessagesForConversation(
                window.currentChatChannelId,
                window.currentConversationId,
                null,
                window.currentCustomerUUID
            );

            // Store as comments (they are actually messages from COMMENT conversation)
            window.allChatComments = messagesResponse.messages || [];
            currentChatCursor = messagesResponse.after;

            console.log('[CONV-TYPE] ✅ Loaded', window.allChatComments.length, 'comments/messages');

            // Render comments
            renderComments(window.allChatComments, true);

            // Setup infinite scroll
            setupChatInfiniteScroll();
            setupNewMessageIndicatorListener();

        } else {
            // Use cached INBOX conversation ID (already fetched when modal opened)
            const inboxConvId = window.currentInboxConversationId;

            if (inboxConvId) {
                window.currentConversationId = inboxConvId;
                console.log('[CONV-TYPE] ✅ Using cached INBOX conversationId:', window.currentConversationId);
            } else {
                // Fallback if not cached
                window.currentConversationId = `${window.currentChatChannelId}_${window.currentChatPSID}`;
                console.log('[CONV-TYPE] Using fallback conversationId:', window.currentConversationId);
            }

            // Fetch messages for INBOX conversation
            console.log('[CONV-TYPE] 📥 Fetching messages for INBOX conversation...');

            const response = await window.pancakeDataManager.fetchMessagesForConversation(
                window.currentChatChannelId,
                window.currentConversationId,
                null,
                window.currentCustomerUUID
            );

            window.allChatMessages = response.messages || [];
            currentChatCursor = response.after;

            // Update conversationId from response if available
            if (response.conversationId) {
                window.currentConversationId = response.conversationId;
                console.log('[CONV-TYPE] ✅ Updated conversationId from response:', window.currentConversationId);
            }

            console.log('[CONV-TYPE] ✅ Loaded', window.allChatMessages.length, 'messages');
            renderChatMessages(window.allChatMessages, true);

            // Setup infinite scroll and realtime
            setupChatInfiniteScroll();
            setupNewMessageIndicatorListener();
            setupRealtimeMessages();
        }
    } catch (error) {
        console.error('[CONV-TYPE] Error fetching data:', error);
        modalBody.innerHTML = `
            <div class="chat-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Lỗi khi tải ${type === 'COMMENT' ? 'bình luận' : 'tin nhắn'}</p>
                <p style="font-size: 12px; color: #6b7280;">${error.message}</p>
            </div>`;
    }
};

// =====================================================
// PAGE SELECTOR FUNCTIONS
// =====================================================

/**
 * Populate SEND page selector dropdown (for sending messages)
 * @param {string} currentPageId - Current page ID to pre-select
 */
window.populateSendPageSelector = async function (currentPageId) {
    console.log('[SEND-PAGE] Populating send page selector, current:', currentPageId);

    const select = document.getElementById('chatSendPageSelect');
    if (!select) {
        console.warn('[SEND-PAGE] Select element not found');
        return;
    }

    // Show loading state
    select.innerHTML = '<option value="">Đang tải...</option>';
    select.disabled = true;

    try {
        // Use cached pages if available
        let pages = window.availableChatPages;
        if (!pages || pages.length === 0) {
            // Fetch pages if not cached
            if (window.pancakeDataManager) {
                await window.pancakeDataManager.fetchPages();
                pages = await window.pancakeDataManager.fetchPagesWithUnreadCount();
                window.availableChatPages = pages;
            }
        }

        if (!pages || pages.length === 0) {
            select.innerHTML = '<option value="">Không có page</option>';
            select.disabled = true;
            return;
        }

        // Build options
        let optionsHtml = '';
        pages.forEach(page => {
            const isSelected = page.page_id === currentPageId ? 'selected' : '';
            optionsHtml += `<option value="${page.page_id}" ${isSelected}>${page.page_name}</option>`;
        });

        select.innerHTML = optionsHtml;
        select.disabled = false;

        // Set current send page
        window.currentSendPageId = currentPageId;

        // If current page not in list, add it as first option
        if (currentPageId && !pages.find(p => p.page_id === currentPageId)) {
            const currentOption = document.createElement('option');
            currentOption.value = currentPageId;
            currentOption.textContent = `Page ${currentPageId}`;
            currentOption.selected = true;
            select.insertBefore(currentOption, select.firstChild);
        }

        console.log('[SEND-PAGE] ✅ Populated with', pages.length, 'pages, selected:', currentPageId);

    } catch (error) {
        console.error('[SEND-PAGE] ❌ Error:', error);
        select.innerHTML = '<option value="">Lỗi tải</option>';
        select.disabled = true;
    }
};

/**
 * Handle SEND page selection change
 * @param {string} pageId - Selected page ID for sending
 */
window.onSendPageChanged = function (pageId) {
    console.log('[SEND-PAGE] Send page changed to:', pageId);

    if (!pageId) return;

    // Update send page ID (independent from view page)
    window.currentSendPageId = pageId;

    // Show notification
    const selectedPage = window.availableChatPages.find(p => p.page_id === pageId);
    const pageName = selectedPage?.page_name || pageId;

    if (window.notificationManager) {
        window.notificationManager.show(`Sẽ gửi tin nhắn từ page: ${pageName}`, 'info', 2000);
    }

    console.log('[SEND-PAGE] ✅ Updated currentSendPageId to:', pageId);
};

/**
 * Populate VIEW page selector dropdown with pages from Pancake API
 * @param {string} currentPageId - Current page ID to pre-select
 */
window.populateChatPageSelector = async function (currentPageId) {
    console.log('[PAGE-SELECTOR] Populating page selector, current:', currentPageId);

    const select = document.getElementById('chatPageSelect');
    if (!select) {
        console.warn('[PAGE-SELECTOR] Select element not found');
        return;
    }

    // Show loading state
    select.innerHTML = '<option value="">Đang tải pages...</option>';
    select.disabled = true;

    try {
        // Ensure pages are fetched first (for page names)
        if (window.pancakeDataManager) {
            await window.pancakeDataManager.fetchPages();
        }

        // Fetch pages with unread count
        const pagesWithUnread = window.pancakeDataManager ?
            await window.pancakeDataManager.fetchPagesWithUnreadCount() : [];

        if (pagesWithUnread.length === 0) {
            select.innerHTML = '<option value="">Không có page nào</option>';
            select.disabled = true;
            return;
        }

        // Cache pages
        window.availableChatPages = pagesWithUnread;

        // Build options
        let optionsHtml = '';
        pagesWithUnread.forEach(page => {
            const isSelected = page.page_id === currentPageId ? 'selected' : '';
            const unreadBadge = page.unread_conv_count > 0 ? ` (${page.unread_conv_count})` : '';
            optionsHtml += `<option value="${page.page_id}" ${isSelected}>${page.page_name}${unreadBadge}</option>`;
        });

        select.innerHTML = optionsHtml;
        select.disabled = false;

        // If current page not in list, add it as first option
        if (currentPageId && !pagesWithUnread.find(p => p.page_id === currentPageId)) {
            const currentOption = document.createElement('option');
            currentOption.value = currentPageId;
            currentOption.textContent = `Page ${currentPageId}`;
            currentOption.selected = true;
            select.insertBefore(currentOption, select.firstChild);
        }

        console.log('[PAGE-SELECTOR] ✅ Populated with', pagesWithUnread.length, 'pages');

    } catch (error) {
        console.error('[PAGE-SELECTOR] ❌ Error populating:', error);
        select.innerHTML = '<option value="">Lỗi tải pages</option>';
        select.disabled = true;
    }
};

/**
 * Handle page selection change
 * @param {string} pageId - Selected page ID
 */
window.onChatPageChanged = async function (pageId) {
    console.log('[PAGE-SELECTOR] Page changed to:', pageId);

    if (!pageId) return;

    // Update currentChatChannelId to use selected page
    const oldChannelId = window.currentChatChannelId;
    window.currentChatChannelId = pageId;

    // Also update the send page selector to match
    const sendPageSelect = document.getElementById('chatSendPageSelect');
    if (sendPageSelect && sendPageSelect.value !== pageId) {
        sendPageSelect.value = pageId;
        console.log('[PAGE-SELECTOR] ✅ Also updated chatSendPageSelect to:', pageId);
    }

    // Show notification
    const selectedPage = window.availableChatPages.find(p => p.page_id === pageId);
    const pageName = selectedPage?.page_name || pageId;

    if (window.notificationManager) {
        window.notificationManager.show(`Đang tải tin nhắn từ page: ${pageName}...`, 'info', 2000);
    }

    console.log('[PAGE-SELECTOR] ✅ Updated currentChatChannelId to:', pageId);

    // Reload messages/comments for the new page
    await window.reloadChatForSelectedPage(pageId);
};

/**
 * Reload messages/comments when page is changed
 * Uses same customer fb_id with different pages[pageId] filter
 * API: GET /conversations/customer/{fb_id}?pages[{newPageId}]=0
 * @param {string} pageId - New page ID to load messages from
 */
window.reloadChatForSelectedPage = async function (pageId) {
    console.log('[PAGE-RELOAD] Reloading chat for page:', pageId);

    const modalBody = document.getElementById('chatModalBody');
    if (!modalBody) return;

    // Get customer fb_id saved when modal opened
    const customerFbId = window.currentCustomerFbId;
    if (!customerFbId) {
        console.error('[PAGE-RELOAD] No customer fb_id available');
        const selectedPage = window.availableChatPages.find(p => p.page_id === pageId);
        const pageName = selectedPage?.page_name || pageId;
        modalBody.innerHTML = `
            <div class="chat-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Không thể chuyển page</p>
                <p style="font-size: 12px; color: #9ca3af;">Thiếu thông tin customer fb_id</p>
            </div>`;
        return;
    }

    // Show loading
    const loadingText = currentChatType === 'comment' ? 'Đang tải bình luận...' : 'Đang tải tin nhắn...';
    modalBody.innerHTML = `
        <div class="chat-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>${loadingText}</p>
        </div>`;

    try {
        // STEP 1: Fetch conversations using SAME fb_id with NEW page filter
        // API: GET /conversations/customer/{fb_id}?pages[{newPageId}]=0
        console.log('[PAGE-RELOAD] 🔍 Fetching conversations with fb_id:', customerFbId, 'on page:', pageId);

        const result = await window.pancakeDataManager.fetchConversationsByCustomerFbId(pageId, customerFbId);

        if (!result.success || result.conversations.length === 0) {
            console.warn('[PAGE-RELOAD] ⚠️ No conversations found for this page');
            const selectedPage = window.availableChatPages.find(p => p.page_id === pageId);
            const pageName = selectedPage?.page_name || pageId;
            modalBody.innerHTML = `
                <div class="chat-error">
                    <i class="fas fa-info-circle"></i>
                    <p>Không có cuộc hội thoại với page "${pageName}"</p>
                    <p style="font-size: 12px; color: #9ca3af;">Khách hàng chưa từng nhắn tin hoặc bình luận với page này</p>
                </div>`;
            return;
        }

        console.log('[PAGE-RELOAD] ✅ Found', result.conversations.length, 'conversations');

        // Update customer UUID from result
        if (result.customerUuid) {
            window.currentCustomerUUID = result.customerUuid;
        }

        // STEP 2: Filter conversations by current chat type
        const targetType = currentChatType === 'comment' ? 'COMMENT' : 'INBOX';
        const filteredConversations = result.conversations.filter(conv => conv.type === targetType);

        // Also get the other type for quick switching
        const otherType = currentChatType === 'comment' ? 'INBOX' : 'COMMENT';
        const otherConversations = result.conversations.filter(conv => conv.type === otherType);

        console.log('[PAGE-RELOAD] Filtered:', targetType, '=', filteredConversations.length, ', ', otherType, '=', otherConversations.length);

        if (filteredConversations.length === 0) {
            const selectedPage = window.availableChatPages.find(p => p.page_id === pageId);
            const pageName = selectedPage?.page_name || pageId;
            const typeText = currentChatType === 'comment' ? 'bình luận' : 'tin nhắn';
            modalBody.innerHTML = `
                <div class="chat-error">
                    <i class="fas fa-info-circle"></i>
                    <p>Không có ${typeText} với page "${pageName}"</p>
                    <p style="font-size: 12px; color: #9ca3af;">Khách hàng chưa có ${typeText} với page này</p>
                </div>`;
            return;
        }

        // STEP 3: Update conversation IDs
        const targetConv = filteredConversations[0];
        window.currentConversationId = targetConv.id;

        if (currentChatType === 'comment') {
            window.currentCommentConversationId = targetConv.id;
            if (otherConversations.length > 0) {
                window.currentInboxConversationId = otherConversations[0].id;
            }
        } else {
            window.currentInboxConversationId = targetConv.id;
            if (otherConversations.length > 0) {
                window.currentCommentConversationId = otherConversations[0].id;
            }
        }

        console.log('[PAGE-RELOAD] ✅ Updated conversationIds:', {
            current: window.currentConversationId,
            inbox: window.currentInboxConversationId,
            comment: window.currentCommentConversationId,
            realPSID: window.currentRealFacebookPSID
        });

        // STEP 4: Fetch messages/comments with correct parameters
        if (currentChatType === 'comment') {
            const response = await window.pancakeDataManager.fetchMessagesForConversation(
                pageId,
                window.currentCommentConversationId,
                null,
                window.currentCustomerUUID
            );

            // Map to comments format
            window.allChatComments = (response.messages || []).map(msg => ({
                Id: msg.id,
                Message: msg.original_message || msg.message?.replace(/<[^>]*>/g, '') || '',
                CreatedTime: msg.inserted_at,
                IsOwner: msg.from?.id === pageId,
                PostId: msg.page_id ? `${msg.page_id}_${msg.parent_id?.split('_')[0] || ''}` : null,
                ParentId: msg.parent_id !== msg.id ? msg.parent_id : null,
                FacebookId: msg.id,
                Attachments: msg.attachments || [],
                Status: msg.seen ? 10 : 30,
                from: msg.from
            }));
            currentChatCursor = response.after;

            console.log(`[PAGE-RELOAD] ✅ Loaded ${window.allChatComments.length} comments`);

            // Update parent comment ID if available
            if (window.allChatComments.length > 0) {
                const rootComment = window.allChatComments.find(c => !c.ParentId) || window.allChatComments[0];
                if (rootComment && rootComment.Id) {
                    currentParentCommentId = getFacebookCommentId(rootComment);
                    console.log(`[PAGE-RELOAD] Updated parent comment ID: ${currentParentCommentId}`);
                }
            }

            renderComments(window.allChatComments, true);
        } else {
            const response = await window.pancakeDataManager.fetchMessagesForConversation(
                pageId,
                window.currentConversationId,
                null,
                window.currentCustomerUUID
            );
            window.allChatMessages = response.messages || [];
            currentChatCursor = response.after;

            console.log(`[PAGE-RELOAD] ✅ Loaded ${window.allChatMessages.length} messages`);

            renderChatMessages(window.allChatMessages, true);

            // Re-setup infinite scroll
            setupChatInfiniteScroll();
            setupNewMessageIndicatorListener();
        }

        // STEP 5: Update conversation selector if multiple conversations
        if (filteredConversations.length > 1) {
            window.populateConversationSelector(filteredConversations, window.currentConversationId);
        } else {
            window.hideConversationSelector();
        }

        // STEP 6: Re-setup realtime messages for new page/conversation
        setupRealtimeMessages();

        // Show success notification
        const selectedPage = window.availableChatPages.find(p => p.page_id === pageId);
        const pageName = selectedPage?.page_name || pageId;
        if (window.notificationManager) {
            window.notificationManager.show(`✅ Đã tải tin nhắn từ page: ${pageName}`, 'success', 2000);
        }

    } catch (error) {
        console.error('[PAGE-RELOAD] Error loading chat:', error);
        const errorText = currentChatType === 'comment' ? 'Lỗi khi tải bình luận' : 'Lỗi khi tải tin nhắn';
        modalBody.innerHTML = `
            <div class="chat-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${errorText}</p>
                <p style="font-size: 12px; color: #9ca3af;">${error.message}</p>
            </div>`;
    }
};

// =====================================================
// CONVERSATION SELECTOR FUNCTIONS
// =====================================================

/**
 * Format time ago for conversation selector
 * @param {number} timestamp - Unix timestamp in seconds
 * @returns {string} - Formatted time ago string
 */
function formatConversationTimeAgo(timestamp) {
    if (!timestamp) return '';
    const now = Date.now() / 1000;
    const diff = now - timestamp;

    if (diff < 60) return 'vừa xong';
    if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} ngày trước`;
    return `${Math.floor(diff / 604800)} tuần trước`;
}

/**
 * Populate conversation selector with all matching conversations
 * Sort by most recent (updated_time) and select the most recent by default
 * @param {Array} conversations - Array of matching conversations
 * @param {string} selectedConvId - Optional conversation ID to pre-select
 */
window.populateConversationSelector = function (conversations, selectedConvId = null) {
    console.log('[CONV-SELECTOR] Populating with', conversations?.length || 0, 'conversations');

    const selectorContainer = document.getElementById('chatConversationSelector');
    const select = document.getElementById('chatConversationSelect');

    if (!selectorContainer || !select) {
        console.error('[CONV-SELECTOR] Selector elements not found');
        return;
    }

    // Hide selector if only 1 or no conversations
    if (!conversations || conversations.length <= 1) {
        selectorContainer.style.display = 'none';
        window.allMatchingConversations = conversations || [];
        return;
    }

    // Store all conversations globally
    window.allMatchingConversations = conversations;

    // Sort by updated_time descending (most recent first)
    const sortedConversations = [...conversations].sort((a, b) => {
        const timeA = a.updated_time || a.last_message_at || 0;
        const timeB = b.updated_time || b.last_message_at || 0;
        return timeB - timeA;
    });

    // Build options HTML
    let optionsHtml = '';
    sortedConversations.forEach((conv, index) => {
        const convId = conv.id || conv.conversation_id || `conv_${index}`;
        const convType = conv.type || 'INBOX';
        const typeIcon = convType === 'COMMENT' ? '💬' : '📨';
        const timeAgo = formatConversationTimeAgo(conv.updated_time || conv.last_message_at);
        const lastMessage = conv.last_message?.content || conv.snippet || '';
        const preview = lastMessage.length > 30 ? lastMessage.substring(0, 30) + '...' : lastMessage;
        const pageName = conv.page_name || '';

        // Label format: [Type Icon] [Time] - [Preview] (Page)
        let label = `${typeIcon} ${convType}`;
        if (timeAgo) label += ` • ${timeAgo}`;
        if (preview) label += ` - ${preview}`;
        if (pageName) label += ` (${pageName})`;

        const isSelected = selectedConvId ? (convId === selectedConvId) : (index === 0);
        optionsHtml += `<option value="${convId}" ${isSelected ? 'selected' : ''}>${label}</option>`;
    });

    select.innerHTML = optionsHtml;
    selectorContainer.style.display = 'block';

    console.log('[CONV-SELECTOR] ✅ Populated with', sortedConversations.length, 'conversations, default:', sortedConversations[0]?.id);

    // Return the most recent conversation (for initial load)
    return sortedConversations[0];
};

/**
 * Handle conversation selection change
 * @param {string} conversationId - Selected conversation ID
 */
window.onChatConversationChanged = async function (conversationId) {
    console.log('[CONV-SELECTOR] Conversation changed to:', conversationId);

    if (!conversationId) return;

    // Find the selected conversation
    const selectedConv = window.allMatchingConversations.find(c =>
        (c.id || c.conversation_id) === conversationId
    );

    if (!selectedConv) {
        console.error('[CONV-SELECTOR] Selected conversation not found:', conversationId);
        return;
    }

    // Show notification
    const convType = selectedConv.type || 'INBOX';
    if (window.notificationManager) {
        window.notificationManager.show(`Đang tải ${convType === 'COMMENT' ? 'bình luận' : 'tin nhắn'}...`, 'info', 2000);
    }

    // Reload chat for selected conversation
    await window.reloadChatForSelectedConversation(selectedConv);
};

/**
 * Reload messages/comments for selected conversation
 * @param {Object} conversation - Selected conversation object
 */
window.reloadChatForSelectedConversation = async function (conversation) {
    console.log('[CONV-RELOAD] Reloading chat for conversation:', conversation);

    const modalBody = document.getElementById('chatModalBody');
    if (!modalBody) return;

    // Get customer UUID from conversation
    const customerUuid = conversation.customers?.[0]?.id || conversation.customer_id;
    const pageId = conversation.page_id || window.currentChatChannelId;
    const convId = conversation.id || conversation.conversation_id;
    const convType = conversation.type || 'INBOX';

    if (!customerUuid) {
        console.error('[CONV-RELOAD] No customer UUID in conversation');
        return;
    }

    // Update global state
    window.currentCustomerUUID = customerUuid;
    window.currentConversationId = convId;
    if (pageId) window.currentChatChannelId = pageId;

    // Show loading
    const loadingText = convType === 'COMMENT' ? 'Đang tải bình luận...' : 'Đang tải tin nhắn...';
    modalBody.innerHTML = `
        <div class="chat-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>${loadingText}</p>
        </div>`;

    try {
        // Fetch inbox_preview to get correct conversationId
        const inboxPreview = await window.pancakeDataManager.fetchInboxPreview(pageId, customerUuid);

        if (inboxPreview.success) {
            // Use appropriate conversationId based on conversation type
            if (convType === 'COMMENT') {
                window.currentConversationId = inboxPreview.commentConversationId
                    || inboxPreview.inboxConversationId
                    || convId;
            } else {
                window.currentConversationId = inboxPreview.inboxConversationId
                    || convId;
            }
            window.currentInboxConversationId = inboxPreview.inboxConversationId;
            window.currentCommentConversationId = inboxPreview.commentConversationId;

            console.log('[CONV-RELOAD] ✅ Got conversationIds from inbox_preview:', {
                using: window.currentConversationId,
                inbox: window.currentInboxConversationId,
                comment: window.currentCommentConversationId
            });
        }

        // Fetch messages based on type
        if (convType === 'COMMENT' || currentChatType === 'comment') {
            const response = await window.chatDataManager.fetchComments(
                pageId,
                window.currentChatPSID,
                null,
                conversation.post_id,
                null
            );
            window.allChatComments = response.comments || [];
            currentChatCursor = response.after;

            console.log(`[CONV-RELOAD] Loaded ${window.allChatComments.length} comments`);

            // Update parent comment ID
            if (window.allChatComments.length > 0) {
                const rootComment = window.allChatComments.find(c => !c.ParentId) || window.allChatComments[0];
                if (rootComment && rootComment.Id) {
                    currentParentCommentId = getFacebookCommentId(rootComment);
                }
            }

            renderComments(window.allChatComments, true);
        } else {
            // Fetch messages for INBOX
            const response = await window.chatDataManager.fetchMessages(
                pageId,
                window.currentChatPSID,
                window.currentConversationId,
                customerUuid
            );
            window.allChatMessages = response.messages || [];
            currentChatCursor = response.after;

            // Update conversationId from response if available
            if (response.conversationId) {
                window.currentConversationId = response.conversationId;
            }

            console.log(`[CONV-RELOAD] Loaded ${window.allChatMessages.length} messages`);

            renderChatMessages(window.allChatMessages, true);
        }

        // Re-setup infinite scroll
        setupChatInfiniteScroll();
        setupNewMessageIndicatorListener();

        // Update input state based on conversation type
        const chatInput = document.getElementById('chatReplyInput');
        const chatSendBtn = document.getElementById('chatSendBtn');

        if (convType === 'COMMENT') {
            // Disable input for COMMENT - require selecting specific comment to reply
            if (chatInput) {
                chatInput.disabled = true;
                chatInput.placeholder = 'Chọn "Trả lời" một bình luận để reply...';
                chatInput.style.background = '#f3f4f6';
                chatInput.style.cursor = 'not-allowed';
            }
            if (chatSendBtn) {
                chatSendBtn.disabled = true;
                chatSendBtn.style.opacity = '0.5';
                chatSendBtn.style.cursor = 'not-allowed';
            }
            // Update currentChatType to 'comment'
            currentChatType = 'comment';
        } else {
            // Enable input for INBOX
            if (chatInput) {
                chatInput.disabled = false;
                chatInput.placeholder = 'Nhập tin nhắn trả lời... (Shift+Enter để xuống dòng)';
                chatInput.style.background = '#f9fafb';
                chatInput.style.cursor = 'text';
            }
            if (chatSendBtn) {
                chatSendBtn.disabled = false;
                chatSendBtn.style.opacity = '1';
                chatSendBtn.style.cursor = 'pointer';
                chatSendBtn.title = 'Gửi tin nhắn';
            }
            // Update currentChatType to 'message'
            currentChatType = 'message';
        }

        // Show success notification
        const convTypeLabel = convType === 'COMMENT' ? 'bình luận' : 'tin nhắn';
        if (window.notificationManager) {
            window.notificationManager.show(`✅ Đã tải ${convTypeLabel}`, 'success', 2000);
        }

    } catch (error) {
        console.error('[CONV-RELOAD] Error loading chat:', error);
        const errorText = convType === 'COMMENT' ? 'Lỗi khi tải bình luận' : 'Lỗi khi tải tin nhắn';
        modalBody.innerHTML = `
            <div class="chat-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${errorText}</p>
                <p style="font-size: 12px; color: #9ca3af;">${error.message}</p>
            </div>`;
    }
};

/**
 * Hide conversation selector
 */
window.hideConversationSelector = function () {
    const selectorContainer = document.getElementById('chatConversationSelector');
    if (selectorContainer) {
        selectorContainer.style.display = 'none';
    }
    window.allMatchingConversations = [];
};

// =====================================================
// AVATAR ZOOM MODAL
// =====================================================
window.openAvatarZoom = function (avatarUrl, senderName) {
    // Remove existing modal if any
    const existingModal = document.getElementById('avatar-zoom-modal');
    if (existingModal) existingModal.remove();

    // Create modal
    const modal = document.createElement('div');
    modal.id = 'avatar-zoom-modal';
    modal.innerHTML = `
        <div class="avatar-zoom-overlay" onclick="closeAvatarZoom()" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.85);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100000;
            cursor: zoom-out;
            animation: fadeIn 0.2s ease-out;
        ">
            <div style="text-align: center;">
                <img src="${avatarUrl}" 
                     alt="${senderName}"
                     style="
                        max-width: 90vw;
                        max-height: 80vh;
                        border-radius: 16px;
                        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                        animation: zoomIn 0.3s ease-out;
                     "
                     onclick="event.stopPropagation();"
                     onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 200%22><circle cx=%22100%22 cy=%22100%22 r=%22100%22 fill=%22%23e5e7eb%22/><circle cx=%22100%22 cy=%2280%22 r=%2235%22 fill=%22%239ca3af%22/><ellipse cx=%22100%22 cy=%22160%22 rx=%2255%22 ry=%2240%22 fill=%22%239ca3af%22/></svg>'"
                />
                <p style="color: white; font-size: 16px; margin-top: 16px; font-weight: 500;">${senderName}</p>
                <button onclick="closeAvatarZoom()" style="
                    margin-top: 12px;
                    padding: 10px 24px;
                    background: white;
                    color: #111827;
                    border: none;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: transform 0.2s;
                " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                    <i class="fas fa-times" style="margin-right: 6px;"></i>Đóng
                </button>
            </div>
        </div>
    `;

    // Add animation styles
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes zoomIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    `;
    modal.appendChild(style);

    document.body.appendChild(modal);

    // Close on Escape key
    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
            closeAvatarZoom();
            document.removeEventListener('keydown', escHandler);
        }
    });
};

window.closeAvatarZoom = function () {
    const modal = document.getElementById('avatar-zoom-modal');
    if (modal) {
        modal.style.opacity = '0';
        setTimeout(() => modal.remove(), 200);
    }
};

window.openChatModal = async function (orderId, channelId, psid, type = 'message') {
    console.log('[CHAT] Opening modal:', { orderId, channelId, psid, type });
    if (!channelId || !psid) {
        alert('Không có thông tin tin nhắn cho đơn hàng này');
        return;
    }

    // Reset pagination state
    window.currentChatChannelId = channelId;
    window.currentChatPSID = psid;
    currentChatType = type;
    currentChatCursor = null;
    window.allChatMessages = [];
    window.allChatComments = [];
    isLoadingMoreMessages = false;
    currentOrder = null;
    currentChatOrderId = null;
    window.currentConversationId = null;
    currentParentCommentId = null;
    currentPostId = null;

    // Hide conversation selector initially (will show if multiple conversations found)
    window.hideConversationSelector();

    // Get order info
    // First try to find order by exact ID match
    let order = allData.find(o => o.Id === orderId);
    // If not found, check if this orderId is in a merged order's OriginalIds
    if (!order) {
        order = allData.find(o => o.IsMerged && o.OriginalIds && o.OriginalIds.includes(orderId));
    }
    if (!order) {
        alert('Không tìm thấy đơn hàng');
        return;
    }

    // Lưu order hiện tại
    currentOrder = order;
    currentChatOrderId = orderId;

    // Save customer name for page switching (search by name across pages)
    window.currentCustomerName = order.Name || order.PartnerName;
    console.log('[CHAT] Saved customer name for page switching:', window.currentCustomerName);

    // Update modal title based on type
    const titleText = type === 'comment' ? 'Bình luận' : 'Tin nhắn';
    document.getElementById('chatModalTitle').textContent = `${titleText} với ${order.Name}`;
    document.getElementById('chatModalSubtitleText').textContent = `SĐT: ${order.Telephone || 'N/A'} • Mã ĐH: ${order.Code}`;

    // Initialize conversation type toggle
    const initialConvType = type === 'comment' ? 'COMMENT' : 'INBOX';
    window.updateConversationTypeToggle(initialConvType);
    // IMPORTANT: Also set currentConversationType so switchConversationType works correctly
    currentConversationType = initialConvType;

    // Show modal
    document.getElementById('chatModal').classList.add('show');

    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';

    // Load and display debt for this order's phone
    loadChatDebt(order.Telephone);

    // Populate page selectors with current channelId
    window.populateChatPageSelector(channelId);  // View page selector
    window.populateSendPageSelector(channelId);  // Send page selector (independent)

    // OPTIMIZATION: Fetch TPOS order details in parallel (non-blocking)
    // This runs independently while messages are being fetched
    // Uses cache to avoid redundant API calls (TTL: 5 minutes)
    const orderDetailsPromise = (async () => {
        try {
            // Check cache first
            let fullOrderData = getOrderDetailsFromCache(orderId);

            if (!fullOrderData) {
                // Cache miss - fetch from API
                console.log(`[CACHE] ❌ Order details cache MISS for ${orderId}, fetching from API...`);
                const headers = await window.tokenManager.getAuthHeader();
                const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})?$expand=Details,Partner,User,CRMTeam`;
                const response = await API_CONFIG.smartFetch(apiUrl, {
                    headers: {
                        ...headers,
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                    },
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                fullOrderData = await response.json();

                // Save to cache for future use
                saveOrderDetailsToCache(orderId, fullOrderData);
            }

            // Store full order data for dropped products manager (needed by moveDroppedToOrder)
            window.currentChatOrderData = fullOrderData;

            // Store Facebook data for highlighting purchase comment
            window.purchaseFacebookPostId = fullOrderData.Facebook_PostId || null;
            window.purchaseFacebookASUserId = fullOrderData.Facebook_ASUserId || null;
            window.purchaseCommentId = fullOrderData.Facebook_CommentId || null;

            console.log('[CHAT] Order Facebook data loaded:', {
                PostId: window.purchaseFacebookPostId,
                ASUserId: window.purchaseFacebookASUserId,
                CommentId: window.purchaseCommentId
            });

            // Store CRMTeam for Facebook_PageToken access (for 24h bypass)
            window.currentCRMTeam = fullOrderData.CRMTeam || null;
            if (window.currentCRMTeam && window.currentCRMTeam.Facebook_PageToken) {
                console.log('[CHAT] CRMTeam loaded with Facebook_PageToken');
            }

            // Store order details for products display
            currentChatOrderDetails = fullOrderData.Details ? JSON.parse(JSON.stringify(fullOrderData.Details)) : [];
            console.log('[CHAT] Order details loaded:', currentChatOrderDetails.length, 'products');

            // Render products table
            renderChatProductsTable();

            // Initialize search after render (with delay for DOM ready)
            setTimeout(() => {
                initChatProductSearch();
            }, 100);

            // Setup realtime listener for held products (multi-user collaboration)
            if (typeof window.setupHeldProductsListener === 'function') {
                window.setupHeldProductsListener();
            }

            // Update message reply type toggle (show if order has comment)
            window.updateMessageReplyTypeToggle();
        } catch (error) {
            console.error('[CHAT] Error loading order details:', error);
            // Reset order data
            window.currentChatOrderData = null;
            // Reset Facebook data on error
            window.purchaseFacebookPostId = null;
            window.purchaseFacebookASUserId = null;
            window.purchaseCommentId = null;
            // Reset order details
            currentChatOrderDetails = [];
            renderChatProductsTable();

            // Hide message reply type toggle on error
            window.updateMessageReplyTypeToggle();
        }
    })(); // Execute immediately but don't await - runs in parallel

    // Show loading
    const modalBody = document.getElementById('chatModalBody');
    const loadingText = type === 'comment' ? 'Đang tải bình luận...' : 'Đang tải tin nhắn...';
    modalBody.innerHTML = `
        <div class="chat-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>${loadingText}</p>
        </div>`;

    // Show/hide reply container and mark as read button
    // Show/hide reply container and mark as read button
    const replyContainer = document.getElementById('chatReplyContainer');
    const markReadBtn = document.getElementById('chatMarkReadBtn');

    // Always show reply container for both comment and message
    replyContainer.style.display = 'block';
    const chatInput = document.getElementById('chatReplyInput');
    chatInput.value = '';

    // Reset pasted image and uploaded images array
    currentPastedImage = null;
    window.currentPastedImage = null;
    window.uploadedImagesData = [];
    window.isUploadingImages = false;
    const previewContainer = document.getElementById('chatImagePreviewContainer');
    if (previewContainer) {
        previewContainer.innerHTML = '';
        previewContainer.style.display = 'none';
    }

    // Remove old listener to avoid duplicates (if any) and add new one
    chatInput.removeEventListener('paste', handleChatInputPaste);
    chatInput.addEventListener('paste', handleChatInputPaste);

    // Remove old Enter key listener and add new one with proper event handling
    chatInput.removeEventListener('keydown', handleChatInputKeyDown);
    chatInput.addEventListener('keydown', handleChatInputKeyDown);

    // Add input event listener for auto-resize
    chatInput.removeEventListener('input', handleChatInputInput);
    chatInput.addEventListener('input', handleChatInputInput);

    // Add file input listener for attachment button
    const fileInput = document.getElementById('uploadFileInput');
    if (fileInput) {
        fileInput.removeEventListener('change', handleFileInputChange);
        fileInput.addEventListener('change', handleFileInputChange);
    }

    if (type === 'comment') {
        if (markReadBtn) {
            markReadBtn.style.display = 'none';
        }

        // Disable input and send button by default for comments
        // Only enable when replying to a specific comment
        const chatSendBtn = document.getElementById('chatSendBtn');
        chatInput.disabled = true;
        chatInput.placeholder = 'Chọn "Trả lời" một bình luận để reply...';
        chatInput.style.background = '#f3f4f6';
        chatInput.style.cursor = 'not-allowed';
        if (chatSendBtn) {
            chatSendBtn.disabled = true;
            chatSendBtn.style.opacity = '0.5';
            chatSendBtn.style.cursor = 'not-allowed';
        }
    } else {
        if (markReadBtn) {
            markReadBtn.style.display = 'none'; // Keep hidden for now or show if needed
        }

        // Re-enable input and send button for chat (message mode)
        // Reset to default state in case it was disabled from previous comment modal
        const chatSendBtn = document.getElementById('chatSendBtn');
        chatInput.disabled = false;
        chatInput.placeholder = 'Nhập tin nhắn trả lời... (Shift+Enter để xuống dòng)';
        chatInput.style.background = '#f9fafb';
        chatInput.style.cursor = 'text';
        chatInput.style.opacity = '1';
        if (chatSendBtn) {
            chatSendBtn.disabled = false;
            chatSendBtn.style.opacity = '1';
            chatSendBtn.style.cursor = 'pointer';
            chatSendBtn.title = 'Gửi tin nhắn';
        }

        // Auto-focus chat input for immediate typing (message mode only)
        setTimeout(() => {
            chatInput.focus();
        }, 150);
    }

    // Ensure send button is in correct state after modal initialization
    updateSendButtonState();

    // Fetch messages or comments based on type
    try {
        if (type === 'comment') {
            // Fetch COMMENT conversations from Pancake to get conversation IDs
            const facebookPsid = order.Facebook_ASUserId;
            const facebookPostId = order.Facebook_PostId;

            console.log('[CHAT-MODAL] 🔍 Fetching COMMENT conversations by fb_id:', facebookPsid, 'post_id:', facebookPostId);

            if (window.pancakeDataManager && facebookPsid) {
                try {
                    // OPTIMIZATION: Fetch conversations AND page access token in parallel
                    console.log('[CHAT-MODAL] ⚡ Starting parallel fetch: conversations + pageAccessToken');
                    const parallelStartTime = Date.now();

                    const [result, preloadedPageAccessToken] = await Promise.all([
                        window.pancakeDataManager.fetchConversationsByCustomerFbId(channelId, facebookPsid),
                        window.pancakeTokenManager?.getOrGeneratePageAccessToken(channelId)
                    ]);

                    console.log(`[CHAT-MODAL] ⚡ Parallel fetch completed in ${Date.now() - parallelStartTime}ms`);

                    if (result.success && result.conversations.length > 0) {
                        console.log('[CHAT-MODAL] ✅ Found', result.conversations.length, 'conversations for fb_id:', facebookPsid);

                        // Save customer UUID
                        window.currentCustomerUUID = result.customerUuid;
                        console.log('[CHAT-MODAL] ✅ Got customer UUID:', window.currentCustomerUUID);

                        // Filter COMMENT conversations
                        // Note: COMMENT conversations don't have post_id field, but their ID format is:
                        // conversation.id = "POST_ID_COMMENT_ID" (e.g., "1300821062062414_1636143350714534")
                        // order.Facebook_PostId = "PAGE_ID_POST_ID" (e.g., "270136663390370_1300821062062414")
                        // Match by: extract POST_ID from order.Facebook_PostId and match with first part of conversation.id

                        let commentConversations;

                        // First, get all COMMENT conversations
                        const allCommentConvs = result.conversations.filter(conv => conv.type === 'COMMENT');

                        // Log all COMMENT conversations for debugging
                        console.log('[CHAT-MODAL] All COMMENT conversations:', allCommentConvs.map(c => ({
                            id: c.id,
                            snippet: c.snippet,
                            updated_at: c.updated_at
                        })));

                        if (facebookPostId && allCommentConvs.length > 0) {
                            // Extract POST_ID from order.Facebook_PostId (format: "PAGE_ID_POST_ID")
                            const postIdParts = facebookPostId.split('_');
                            const postId = postIdParts.length > 1 ? postIdParts[postIdParts.length - 1] : facebookPostId;

                            console.log('[CHAT-MODAL] Extracted POST_ID from order:', postId);

                            // Match conversation where conversation.id starts with POST_ID
                            commentConversations = allCommentConvs.filter(conv => {
                                const convIdFirstPart = conv.id.split('_')[0];
                                const match = convIdFirstPart === postId;
                                if (match) {
                                    console.log('[CHAT-MODAL] ✓ Match found:', conv.id, 'starts with', postId);
                                }
                                return match;
                            });

                            // If no match, use most recent COMMENT conversation
                            if (commentConversations.length === 0) {
                                console.warn('[CHAT-MODAL] ⚠️ No match by post_id, using most recent COMMENT conversation');
                                commentConversations = allCommentConvs;
                            }

                            console.log('[CHAT-MODAL] Filtered COMMENT conversations by post_id:', facebookPostId, '→', commentConversations.length, 'found');
                        } else {
                            commentConversations = allCommentConvs;
                            console.log('[CHAT-MODAL] No post_id or no COMMENT conversations, getting all →', commentConversations.length, 'found');
                        }

                        if (commentConversations.length > 0) {
                            // Populate conversation selector if multiple COMMENT conversations
                            const mostRecentConv = window.populateConversationSelector(commentConversations, commentConversations[0]?.id);
                            const selectedConv = mostRecentConv || commentConversations[0];

                            // Save COMMENT conversation ID
                            window.currentConversationId = selectedConv.id;
                            window.currentCommentConversationId = selectedConv.id;

                            console.log('[CHAT-MODAL] ✅ Found', commentConversations.length, 'COMMENT conversations matching post_id:', facebookPostId);
                            console.log('[CHAT-MODAL] ✅ Using conversationId:', window.currentConversationId);

                            // Initialize read state for COMMENT (will skip auto-mark since chatType = 'comment')
                            window.currentConversationReadState = {
                                isRead: false,
                                conversationId: window.currentConversationId,
                                pageId: channelId,
                                lastMarkedAt: null,
                                chatType: 'comment'
                            };
                            updateReadBadge(false); // Show badge (but won't auto-mark for comments)
                            updateMarkButton(false);

                            // Now fetch messages for this COMMENT conversation
                            // Pass preloaded pageAccessToken to skip redundant token fetch
                            console.log('[CHAT-MODAL] 📥 Fetching messages for COMMENT conversation (using preloaded token)...');

                            const messagesResponse = await window.pancakeDataManager.fetchMessagesForConversation(
                                channelId,
                                window.currentConversationId,
                                null,
                                window.currentCustomerUUID,
                                preloadedPageAccessToken  // Use preloaded token from parallel fetch
                            );

                            // Store as comments (they are messages from COMMENT conversation)
                            window.allChatComments = messagesResponse.messages || [];
                            currentChatCursor = messagesResponse.after;

                            console.log('[CHAT-MODAL] ✅ Loaded', window.allChatComments.length, 'comments/messages');

                            // Render comments
                            renderComments(window.allChatComments, true);

                        } else {
                            console.warn('[CHAT-MODAL] ⚠️ No COMMENT conversation found for post:', facebookPostId);
                            modalBody.innerHTML = `
                                <div class="chat-error">
                                    <i class="fas fa-info-circle"></i>
                                    <p>Không tìm thấy bình luận cho bài viết này</p>
                                </div>`;
                        }

                        // Also save INBOX conversation ID for quick switching
                        const inboxConv = result.conversations.find(conv => conv.type === 'INBOX');
                        if (inboxConv) {
                            window.currentInboxConversationId = inboxConv.id;
                            console.log('[CHAT-MODAL] ✅ Found INBOX conversationId:', window.currentInboxConversationId);
                        }

                    } else {
                        console.warn('[CHAT-MODAL] ⚠️ No conversations found for fb_id:', facebookPsid);
                        modalBody.innerHTML = `
                            <div class="chat-error">
                                <i class="fas fa-info-circle"></i>
                                <p>Không tìm thấy cuộc hội thoại</p>
                            </div>`;
                    }
                } catch (fetchError) {
                    console.error('[CHAT-MODAL] ❌ Error fetching COMMENT conversations:', fetchError);
                    modalBody.innerHTML = `
                        <div class="chat-error">
                            <i class="fas fa-exclamation-triangle"></i>
                            <p>Lỗi khi tải bình luận</p>
                            <p style="font-size: 12px; color: #6b7280;">${fetchError.message}</p>
                        </div>`;
                }
            } else {
                console.warn('[CHAT-MODAL] ⚠️ Missing pancakeDataManager or required data');
                modalBody.innerHTML = `
                    <div class="chat-error">
                        <i class="fas fa-info-circle"></i>
                        <p>Thiếu thông tin để tải bình luận</p>
                    </div>`;
            }

            // Setup infinite scroll for comments
            setupChatInfiniteScroll();
            setupNewMessageIndicatorListener();

        } else {
            // Fetch INBOX messages from Pancake
            const facebookPsid = order.Facebook_ASUserId;
            const facebookPostId = order.Facebook_PostId;

            console.log('[CHAT-MODAL] 🔍 Fetching INBOX conversations by fb_id:', facebookPsid);

            if (window.pancakeDataManager && facebookPsid) {
                try {
                    // OPTIMIZATION: Fetch conversations AND page access token in parallel
                    // This saves ~600ms by not waiting for token after conversations
                    console.log('[CHAT-MODAL] ⚡ Starting parallel fetch: conversations + pageAccessToken');
                    const parallelStartTime = Date.now();

                    const [result, preloadedPageAccessToken] = await Promise.all([
                        window.pancakeDataManager.fetchConversationsByCustomerFbId(channelId, facebookPsid),
                        window.pancakeTokenManager?.getOrGeneratePageAccessToken(channelId)
                    ]);

                    console.log(`[CHAT-MODAL] ⚡ Parallel fetch completed in ${Date.now() - parallelStartTime}ms`);

                    if (result.success && result.conversations.length > 0) {
                        console.log('[CHAT-MODAL] ✅ Found', result.conversations.length, 'conversations for fb_id:', facebookPsid);

                        // Save customer UUID
                        window.currentCustomerUUID = result.customerUuid;
                        console.log('[CHAT-MODAL] ✅ Got customer UUID:', window.currentCustomerUUID);

                        // Filter INBOX conversations
                        const inboxConversations = result.conversations.filter(conv => conv.type === 'INBOX');

                        // Also save COMMENT conversations for quick switching
                        const commentConversations = result.conversations.filter(conv => conv.type === 'COMMENT');

                        console.log('[CHAT-MODAL] - INBOX:', inboxConversations.length, 'conversations, COMMENT:', commentConversations.length, 'conversations');

                        if (inboxConversations.length > 0) {
                            // Use first INBOX conversation
                            const inboxConv = inboxConversations[0];
                            window.currentConversationId = inboxConv.id;
                            window.currentInboxConversationId = inboxConv.id;

                            // DEBUG: Log conversation structure to find real PSID field
                            console.log('[CHAT-MODAL] 🔍 DEBUG Conversation data:', JSON.stringify({
                                id: inboxConv.id,
                                from_psid: inboxConv.from_psid,
                                from: inboxConv.from,
                                customers: inboxConv.customers,
                                page_id: inboxConv.page_id
                            }, null, 2));

                            // IMPORTANT: Save the real Facebook PSID from conversation data
                            // This is needed for Facebook Graph API (different from Pancake internal ID)
                            // Try multiple sources: from_psid, from.id, customers[0].fb_id
                            window.currentRealFacebookPSID = inboxConv.from_psid
                                || inboxConv.from?.id
                                || (inboxConv.customers && inboxConv.customers[0]?.fb_id);
                            console.log('[CHAT-MODAL] ✅ Real Facebook PSID:', window.currentRealFacebookPSID);

                            // Save customer fb_id for page switching
                            // This fb_id is used with Pancake API: /conversations/customer/{fb_id}?pages[pageId]=0
                            window.currentCustomerFbId = inboxConv.customers?.[0]?.fb_id
                                || inboxConv.from?.id
                                || inboxConv.from_psid;
                            console.log('[CHAT-MODAL] ✅ Customer fb_id for page switching:', window.currentCustomerFbId);

                            console.log('[CHAT-MODAL] ✅ Using INBOX conversationId:', window.currentConversationId);

                            // Initialize read state for INBOX
                            window.currentConversationReadState = {
                                isRead: false,
                                conversationId: window.currentConversationId,
                                pageId: channelId,
                                lastMarkedAt: null,
                                chatType: 'message'
                            };
                            updateReadBadge(false);
                            updateMarkButton(false);

                            // Populate conversation selector if multiple INBOX conversations
                            if (inboxConversations.length > 1) {
                                window.populateConversationSelector(inboxConversations, window.currentConversationId);
                            } else {
                                window.hideConversationSelector();
                            }

                            // Now fetch messages for this INBOX conversation
                            // Pass preloaded pageAccessToken to skip redundant token fetch
                            console.log('[CHAT-MODAL] 📥 Fetching messages for INBOX conversation (using preloaded token)...');

                            const messagesResponse = await window.pancakeDataManager.fetchMessagesForConversation(
                                channelId,
                                window.currentConversationId,
                                null,
                                window.currentCustomerUUID,
                                preloadedPageAccessToken  // Use preloaded token from parallel fetch
                            );

                            window.allChatMessages = messagesResponse.messages || [];
                            currentChatCursor = messagesResponse.after;

                            console.log('[CHAT-MODAL] ✅ Loaded', window.allChatMessages.length, 'messages');

                            // Render messages
                            renderChatMessages(window.allChatMessages, true);

                        } else {
                            console.warn('[CHAT-MODAL] ⚠️ No INBOX conversation found');
                            modalBody.innerHTML = `
                                <div class="chat-error">
                                    <i class="fas fa-info-circle"></i>
                                    <p>Không tìm thấy tin nhắn cho khách hàng này</p>
                                </div>`;
                        }

                        // Save COMMENT conversation ID for quick switching
                        if (commentConversations.length > 0) {
                            // Filter by post_id if available
                            let targetCommentConv;
                            if (facebookPostId) {
                                targetCommentConv = commentConversations.find(conv => conv.post_id === facebookPostId);
                            }
                            if (!targetCommentConv) {
                                targetCommentConv = commentConversations[0];
                            }

                            window.currentCommentConversationId = targetCommentConv.id;
                            console.log('[CHAT-MODAL] ✅ Found COMMENT conversationId:', window.currentCommentConversationId);
                        }

                    } else {
                        console.warn('[CHAT-MODAL] ⚠️ No conversations found for fb_id:', facebookPsid);
                        modalBody.innerHTML = `
                            <div class="chat-error">
                                <i class="fas fa-info-circle"></i>
                                <p>Không tìm thấy cuộc hội thoại</p>
                            </div>`;
                    }
                } catch (fetchError) {
                    console.error('[CHAT-MODAL] ❌ Error fetching INBOX conversations:', fetchError);
                    modalBody.innerHTML = `
                        <div class="chat-error">
                            <i class="fas fa-exclamation-triangle"></i>
                            <p>Lỗi khi tải tin nhắn</p>
                            <p style="font-size: 12px; color: #6b7280;">${fetchError.message}</p>
                        </div>`;
                }
            } else {
                console.warn('[CHAT-MODAL] ⚠️ Missing pancakeDataManager or required data');
                modalBody.innerHTML = `
                    <div class="chat-error">
                        <i class="fas fa-info-circle"></i>
                        <p>Thiếu thông tin để tải tin nhắn</p>
                    </div>`;
            }

            // Setup infinite scroll and realtime
            setupChatInfiniteScroll();
            setupNewMessageIndicatorListener();
            setupRealtimeMessages();
        }

        /* LEGACY CODE REMOVED
        // Initialize Chat Product State
        initChatProductSearch();
     
        // Firebase Sync Logic - Shared products across all orders
        if (database) {
            currentChatProductsRef = database.ref('order_products/shared');
            currentChatProductsRef.on('value', (snapshot) => {
                const data = snapshot.val();
                if (data) {
                    console.log('[CHAT-FIREBASE] Loaded shared products from Firebase:', data);
                    currentChatOrderDetails = data;
                    renderChatProductsPanel();
                } else {
                    console.log('[CHAT-FIREBASE] No shared data in Firebase, initializing from order details');
                    // If no data in Firebase, initialize from order and save to shared
                    currentChatOrderDetails = order.Details ? JSON.parse(JSON.stringify(order.Details)) : [];
                    renderChatProductsPanel();
                    // Save initial state to shared Firebase path
                    saveChatProductsToFirebase('shared', currentChatOrderDetails);
                }
            });
        } else {
            // Fallback if no firebase
            currentChatOrderDetails = order.Details ? JSON.parse(JSON.stringify(order.Details)) : [];
            renderChatProductsPanel();
        }
        */



    } catch (error) {
        console.error(`[CHAT] Error loading ${type}:`, error);
        const errorText = type === 'comment' ? 'Lỗi khi tải bình luận' : 'Lỗi khi tải tin nhắn';
        modalBody.innerHTML = `
            <div class="chat-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${errorText}</p>
                <p style="font-size: 12px; color: #9ca3af;">${error.message}</p>
            </div>`;
    }
}

window.closeChatModal = async function () {
    // Cleanup temporary held products (isDraft: false) - return them to dropped
    // Only persisted held products (isDraft: true, user clicked "Lưu giữ") will remain
    if (typeof window.cleanupHeldProducts === 'function') {
        await window.cleanupHeldProducts();
    }

    // Cleanup held products listener
    if (typeof window.cleanupHeldProductsListener === 'function') {
        window.cleanupHeldProductsListener();
    }

    // Cleanup realtime messages (stop polling, remove event listeners)
    cleanupRealtimeMessages();

    document.getElementById('chatModal').classList.remove('show');

    // Restore body scroll when modal is closed
    document.body.style.overflow = '';

    // Clean up scroll listener
    const modalBody = document.getElementById('chatModalBody');
    if (modalBody) {
        modalBody.removeEventListener('scroll', handleChatScroll);
    }

    // Reset pagination state
    window.currentChatChannelId = null;
    window.currentChatPSID = null;
    window.currentRealFacebookPSID = null;
    currentChatType = null;
    currentChatCursor = null;
    window.allChatMessages = [];
    window.allChatComments = [];
    window.chatMessagesById = {}; // Clear messages map for reply functionality
    isLoadingMoreMessages = false;
    currentOrder = null;
    currentChatOrderId = null;
    currentChatOrderDetails = [];
    window.currentChatOrderData = null;
    window.currentConversationId = null;
    currentParentCommentId = null;
    currentPostId = null;

    // Reset conversation selector
    window.hideConversationSelector();

    // Reset image upload state
    currentPastedImage = null;
    window.currentPastedImage = null;
    window.uploadedImagesData = [];
    window.isUploadingImages = false;

    // Reset purchase comment highlight state
    window.purchaseCommentId = null;
    window.purchaseFacebookPostId = null;
    window.purchaseFacebookASUserId = null;

    // Reset message reply type and hide toggle
    messageReplyType = 'reply_inbox';
    const msgReplyToggle = document.getElementById('messageReplyTypeToggle');
    if (msgReplyToggle) {
        msgReplyToggle.style.display = 'none';
    }

    // Hide reply preview
    const replyPreviewContainer = document.getElementById('chatReplyPreviewContainer');
    if (replyPreviewContainer) {
        replyPreviewContainer.style.display = 'none';
    }

    // Detach Firebase listener
    if (currentChatProductsRef) {
        currentChatProductsRef.off();
        currentChatProductsRef = null;
    }
}

// Close chat modal when clicking outside (on backdrop)
document.addEventListener('click', function (event) {
    const modal = document.getElementById('chatModal');
    if (!modal || !modal.classList.contains('show')) return;

    const modalContent = modal.querySelector('.chat-modal-content');
    // If click is on the backdrop (modal itself, not its content), close the modal
    if (event.target === modal && modalContent && !modalContent.contains(event.target)) {
        closeChatModal();
    }
});

/**
 * Upload image with Firebase cache check
 * Returns uploaded image data or error
 * @param {Blob} imageBlob - Image blob to upload
 * @param {string|number} productId - Product ID (optional, for cache)
 * @param {string} productName - Product name (optional, for cache)
 * @param {string} channelId - Channel ID for Pancake upload
 * @param {string} productCode - Product code (optional, for cache key)
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
window.uploadImageWithCache = async function uploadImageWithCache(imageBlob, productId, productName, channelId, productCode = null) {
    try {
        let contentUrl = null;
        let contentId = null;
        let dimensions = null;

        // Check Firebase cache if productId exists
        if ((productId || productName || productCode) && window.firebaseImageCache) {
            console.log('[UPLOAD-CACHE] Checking Firebase cache for product:', productId, productName, 'Code:', productCode);

            const cached = await window.firebaseImageCache.get(productId, productName, productCode);

            if (cached && (cached.content_id || cached.content_url)) {
                // ✅ CACHE HIT - prioritize content_id over content_url
                console.log('[UPLOAD-CACHE] ✅ Cache HIT! Reusing content_id:', cached.content_id, 'content_url:', cached.content_url);
                contentUrl = cached.content_url || null;
                contentId = cached.content_id || null;
                dimensions = await getImageDimensions(imageBlob);

                return {
                    success: true,
                    data: {
                        content_url: contentUrl,
                        content_id: contentId,
                        width: dimensions.width,
                        height: dimensions.height,
                        cached: true
                    }
                };
            }
        }

        // Cache miss or no productId - Upload to Pancake
        console.log('[UPLOAD-CACHE] Preparing upload to Pancake...');

        // ⭐ NEW: Auto-compress if image is too large (Pancake limit: 500KB)
        const MAX_SIZE = 500 * 1024; // 500KB
        let blobToUpload = imageBlob;
        let compressionInfo = null;

        if (imageBlob.size > MAX_SIZE) {
            console.log(`[UPLOAD-CACHE] Image too large (${(imageBlob.size / 1024).toFixed(2)} KB > 500 KB), compressing...`);

            if (window.compressImage) {
                try {
                    const compressed = await window.compressImage(imageBlob, MAX_SIZE, 1920, 0.85);
                    blobToUpload = compressed.blob;
                    compressionInfo = compressed;
                    console.log(`[UPLOAD-CACHE] ✅ Compressed: ${(compressed.originalSize / 1024).toFixed(2)} KB → ${(compressed.compressedSize / 1024).toFixed(2)} KB (${compressed.compressionRatio} reduction)`);
                } catch (compressError) {
                    console.warn('[UPLOAD-CACHE] Compression failed, uploading original:', compressError);
                    // Continue with original blob
                }
            } else {
                console.warn('[UPLOAD-CACHE] compressImage function not available, uploading original (may fail)');
            }
        } else {
            console.log(`[UPLOAD-CACHE] Image size OK: ${(imageBlob.size / 1024).toFixed(2)} KB`);
        }

        // Upload to Pancake
        const [uploadResult, dims] = await Promise.all([
            window.pancakeDataManager.uploadImage(channelId, blobToUpload),
            compressionInfo ? Promise.resolve({ width: compressionInfo.width, height: compressionInfo.height }) : getImageDimensions(imageBlob)
        ]);

        // ⭐ NEW: Check for error response from Pancake
        if (uploadResult.success === false || (!uploadResult.content_url && !uploadResult.id)) {
            const errorMsg = uploadResult.message || 'Upload failed';
            console.error('[UPLOAD-CACHE] ❌ Pancake upload error:', errorMsg);
            throw new Error(errorMsg);
        }

        contentUrl = uploadResult.content_url;
        contentId = uploadResult.id;
        dimensions = dims;

        console.log('[UPLOAD-CACHE] ✅ Upload success, content_id:', contentId);

        // Save to Firebase cache
        if ((productId || productName || productCode) && window.firebaseImageCache) {
            console.log('[UPLOAD-CACHE] Saving to Firebase cache...');
            await window.firebaseImageCache.set(productId, productName, contentUrl, contentId, productCode, dimensions?.width, dimensions?.height)
                .catch(err => {
                    console.warn('[UPLOAD-CACHE] Cache save failed (non-critical):', err);
                });
        }

        return {
            success: true,
            data: {
                content_url: contentUrl,
                content_id: contentId,
                width: dimensions.width,
                height: dimensions.height,
                cached: false
            }
        };

    } catch (error) {
        console.error('[UPLOAD-CACHE] Upload failed:', error);
        return {
            success: false,
            error: error.message || 'Upload failed'
        };
    }
}

/**
 * Handle paste event on chat input
 * NOW: Upload immediately after paste
 */
function handleChatInputPaste(event) {
    const items = (event.clipboardData || event.originalEvent.clipboardData).items;
    let hasImage = false;

    for (let index in items) {
        const item = items[index];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            hasImage = true;
            event.preventDefault(); // Prevent default paste to avoid clearing text input

            const blob = item.getAsFile();
            currentPastedImage = blob;

            // Keep input enabled so user can press Enter to send or type additional text
            const chatInput = document.getElementById('chatReplyInput');
            if (chatInput) {
                chatInput.placeholder = 'Bấm Enter để gửi ảnh, hoặc nhập thêm tin nhắn...';
            }

            // Show preview with loading state
            const reader = new FileReader();
            reader.onload = async function (e) {
                try {
                    const previewContainer = document.getElementById('chatImagePreviewContainer');
                    if (!previewContainer) return;

                    // Show preview with loading overlay
                    previewContainer.style.display = 'flex';
                    previewContainer.style.alignItems = 'center';
                    previewContainer.style.justifyContent = 'space-between';

                    previewContainer.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px; position: relative;">
                        <img id="pastedImagePreview" src="${e.target.result}" style="height: 50px; border-radius: 4px; border: 1px solid #ddd; opacity: 0.5;">
                        <div id="uploadOverlay" style="position: absolute; left: 0; top: 0; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.8);">
                            <i class="fas fa-spinner fa-spin" style="color: #3b82f6;"></i>
                        </div>
                        <span id="uploadStatus" style="font-size: 12px; color: #3b82f6;">Đang tải lên Pancake...</span>
                    </div>
                    <button onclick="clearPastedImage()" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 16px;">
                        <i class="fas fa-times"></i>
                    </button>
                `;

                    // Upload immediately
                    const productId = null; // Paste doesn't have productId
                    const productName = null;
                    const channelId = window.currentChatChannelId;

                    if (!channelId) {
                        console.warn('[PASTE] No channelId available, skipping upload');
                        // Initialize array if needed
                        if (!window.uploadedImagesData) {
                            window.uploadedImagesData = [];
                        }
                        window.uploadedImagesData.push({
                            blob: blob,
                            productId: null,
                            productName: null,
                            error: 'Thiếu thông tin channel',
                            uploadFailed: true
                        });
                        updateMultipleImagesPreview();
                        return;
                    }

                    const result = await uploadImageWithCache(blob, productId, productName, channelId);

                    // Initialize array if needed
                    if (!window.uploadedImagesData) {
                        window.uploadedImagesData = [];
                    }

                    if (result.success) {
                        // Upload success - ADD to array (not replace)
                        window.uploadedImagesData.push({
                            ...result.data,
                            blob: blob,
                            productId: productId,
                            productName: productName
                        });
                        updateMultipleImagesPreview(); // NEW: Update preview with all images
                    } else {
                        // Upload failed - still show in preview with error
                        window.uploadedImagesData.push({
                            blob: blob,
                            productId: productId,
                            productName: productName,
                            error: result.error,
                            uploadFailed: true
                        });
                        updateMultipleImagesPreview();
                    }
                } catch (error) {
                    console.error('[PASTE] Error handling paste:', error);
                    // Initialize array if needed
                    if (!window.uploadedImagesData) {
                        window.uploadedImagesData = [];
                    }
                    // Add failed image to array
                    window.uploadedImagesData.push({
                        blob: blob,
                        productId: null,
                        productName: null,
                        error: error.message || 'Lỗi không xác định',
                        uploadFailed: true
                    });
                    updateMultipleImagesPreview();
                }
            };
            reader.readAsDataURL(blob);
            break; // Only handle first image
        }
    }
}

/**
 * Handle file input change event (when user selects files via attachment button)
 * Supports multiple files selection
 */
function handleFileInputChange(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const channelId = window.currentChatChannelId;
    if (!channelId) {
        if (window.notificationManager) {
            window.notificationManager.show('Vui lòng mở chat trước khi gửi file', 'warning');
        }
        return;
    }

    // Initialize array if needed
    if (!window.uploadedImagesData) {
        window.uploadedImagesData = [];
    }

    // Process each selected file
    Array.from(files).forEach(async (file) => {
        // Only process image files for now
        if (!file.type.startsWith('image/')) {
            console.log('[FILE-INPUT] Skipping non-image file:', file.name, file.type);
            if (window.notificationManager) {
                window.notificationManager.show(`Bỏ qua file không phải ảnh: ${file.name}`, 'warning');
            }
            return;
        }

        console.log('[FILE-INPUT] Processing image:', file.name, file.size, file.type);

        // Add to preview first (showing as uploading)
        const tempIndex = window.uploadedImagesData.length;
        window.uploadedImagesData.push({
            blob: file,
            productId: null,
            productName: file.name,
            uploading: true
        });
        updateMultipleImagesPreview();

        try {
            // Upload image
            const result = await window.uploadImageWithCache(file, null, file.name, channelId, null);

            if (result.success) {
                // Update with success data
                window.uploadedImagesData[tempIndex] = {
                    ...result.data,
                    blob: file,
                    productId: null,
                    productName: file.name
                };
                console.log('[FILE-INPUT] ✓ Upload success:', file.name);
            } else {
                // Update with error
                window.uploadedImagesData[tempIndex] = {
                    blob: file,
                    productId: null,
                    productName: file.name,
                    error: result.error || 'Upload failed',
                    uploadFailed: true
                };
                console.error('[FILE-INPUT] ✗ Upload failed:', file.name, result.error);
            }
        } catch (error) {
            console.error('[FILE-INPUT] Error uploading:', file.name, error);
            window.uploadedImagesData[tempIndex] = {
                blob: file,
                productId: null,
                productName: file.name,
                error: error.message || 'Lỗi không xác định',
                uploadFailed: true
            };
        }

        updateMultipleImagesPreview();
    });

    // Reset file input so same file can be selected again
    event.target.value = '';

    // Focus on chat input
    const chatInput = document.getElementById('chatReplyInput');
    if (chatInput) {
        chatInput.focus();
    }
}

/**
 * NEW: Update preview UI for multiple images (horizontal scroll)
 */
window.updateMultipleImagesPreview = function updateMultipleImagesPreview() {
    const previewContainer = document.getElementById('chatImagePreviewContainer');
    if (!previewContainer) return;

    if (!window.uploadedImagesData || window.uploadedImagesData.length === 0) {
        // No images - hide preview
        previewContainer.innerHTML = '';
        previewContainer.style.display = 'none';

        // Re-enable text input
        const chatInput = document.getElementById('chatReplyInput');
        if (chatInput) {
            chatInput.disabled = false;
            chatInput.style.opacity = '1';
            chatInput.style.cursor = 'text';
            chatInput.placeholder = 'Nhập tin nhắn trả lời... (Shift+Enter để xuống dòng)';
        }
        return;
    }

    // Show preview with horizontal scroll
    previewContainer.style.display = 'block';
    previewContainer.style.overflowX = 'auto';
    previewContainer.style.whiteSpace = 'nowrap';
    previewContainer.style.padding = '8px';
    previewContainer.style.background = '#f9fafb';
    previewContainer.style.borderRadius = '4px';

    let html = '<div style="display: flex; gap: 8px; align-items: flex-start;">';

    window.uploadedImagesData.forEach((imageData, index) => {
        const imageUrl = imageData.blob ? URL.createObjectURL(imageData.blob) : '';
        // Check content_id (from upload) instead of content_url (not returned by API)
        const hasContentId = !!(imageData.content_id || imageData.id);
        const isUploading = !hasContentId && !imageData.uploadFailed;
        const isSuccess = hasContentId && !imageData.uploadFailed;
        const isFailed = imageData.uploadFailed;
        const isCached = imageData.cached;

        html += `
            <div style="display: inline-flex; flex-direction: column; align-items: center; gap: 4px; position: relative;">
                <!-- Image preview -->
                <div style="position: relative; width: 80px; height: 80px;">
                    <img src="${imageUrl}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px; border: 2px solid ${isFailed ? '#ef4444' : isSuccess ? '#10b981' : '#3b82f6'}; opacity: ${isUploading ? '0.5' : '1'};">

                    ${isUploading ? `
                        <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.8);">
                            <i class="fas fa-spinner fa-spin" style="color: #3b82f6;"></i>
                        </div>
                    ` : ''}

                    <!-- Delete button (top-right) -->
                    <button onclick="removeImageAtIndex(${index})" style="position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%; background: #ef4444; color: white; border: 2px solid white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 10px; padding: 0;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <!-- Status text -->
                <span style="font-size: 10px; max-width: 80px; text-align: center; white-space: normal; line-height: 1.2;">
                    ${isUploading ? '<span style="color: #3b82f6;">Đang tải...</span>' :
                isFailed ? `<span style="color: #ef4444;">${imageData.error || 'Lỗi'}</span><br><button onclick="retryUploadAtIndex(${index})" style="margin-top: 2px; padding: 2px 6px; font-size: 9px; background: #3b82f6; color: white; border: none; border-radius: 3px; cursor: pointer;">Retry</button>` :
                    isCached ? '<span style="color: #10b981;"><i class="fas fa-recycle"></i> Đã có sẵn</span>' :
                        `<span style="color: #10b981;"><i class="fas fa-check"></i> ${Math.round((imageData.blob?.size || 0) / 1024)} KB</span>`}
                </span>
            </div>
        `;
    });

    html += `
        <!-- Clear all button -->
        <button onclick="clearAllImages()" style="margin-left: 8px; padding: 8px 12px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; align-self: center; white-space: normal; font-size: 12px;">
            <i class="fas fa-trash"></i><br>Xóa tất cả
        </button>
    </div>`;

    previewContainer.innerHTML = html;

    // Keep input enabled so user can press Enter to send or type additional text
    const chatInput = document.getElementById('chatReplyInput');
    if (chatInput) {
        chatInput.disabled = false;
        chatInput.style.opacity = '1';
        chatInput.style.cursor = 'text';
        chatInput.placeholder = 'Bấm Enter để gửi ảnh, hoặc nhập thêm tin nhắn...';
    }

    // Update send button state based on upload status
    updateSendButtonState();
};

/**
 * Update send button state - disable if any image is still uploading
 */
function updateSendButtonState() {
    const sendBtn = document.getElementById('chatSendBtn');
    if (!sendBtn) return;

    // Check if any image is still uploading (check content_id instead of content_url)
    const hasUploadingImages = window.uploadedImagesData && window.uploadedImagesData.some(img =>
        !(img.content_id || img.id) && !img.uploadFailed
    );

    if (hasUploadingImages) {
        // Disable send button
        sendBtn.disabled = true;
        sendBtn.style.opacity = '0.5';
        sendBtn.style.cursor = 'not-allowed';
        sendBtn.title = 'Đang tải ảnh... Vui lòng đợi';
        window.isUploadingImages = true;
    } else {
        // Enable send button
        sendBtn.disabled = false;
        sendBtn.style.opacity = '1';
        sendBtn.style.cursor = 'pointer';
        sendBtn.title = 'Gửi tin nhắn';
        window.isUploadingImages = false;
    }
}

/**
 * Update upload preview UI based on upload result (DEPRECATED - use updateMultipleImagesPreview)
 */
window.updateUploadPreviewUI = function updateUploadPreviewUI(success, message, cached) {
    const preview = document.getElementById('pastedImagePreview');
    const overlay = document.getElementById('uploadOverlay');
    const status = document.getElementById('uploadStatus');

    if (!preview || !overlay || !status) return;

    if (success) {
        // Success - show normal preview
        preview.style.opacity = '1';
        overlay.style.display = 'none';

        if (cached) {
            status.innerHTML = '<i class="fas fa-recycle" style="color: #10b981; margin-right: 4px;"></i>Ảnh đã có sẵn';
            status.style.color = '#10b981';
        } else {
            status.innerHTML = '<i class="fas fa-check-circle" style="color: #10b981; margin-right: 4px;"></i>' + message;
            status.style.color = '#10b981';
        }
    } else {
        // Failed - show error with retry option
        preview.style.opacity = '1';
        overlay.style.display = 'none';
        status.innerHTML = `<i class="fas fa-exclamation-triangle" style="color: #ef4444; margin-right: 4px;"></i>${message} <button onclick="retryUpload()" style="margin-left: 6px; padding: 2px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; font-size: 11px; cursor: pointer;">Retry</button>`;
        status.style.color = '#ef4444';
    }
}

/**
 * NEW: Remove a single image at index
 */
window.removeImageAtIndex = function (index) {
    if (!window.uploadedImagesData || index < 0 || index >= window.uploadedImagesData.length) return;

    // Revoke blob URL if exists
    const imageData = window.uploadedImagesData[index];
    if (imageData.blob) {
        URL.revokeObjectURL(URL.createObjectURL(imageData.blob));
    }

    // Remove from array
    window.uploadedImagesData.splice(index, 1);

    // Update preview
    updateMultipleImagesPreview();

    console.log('[REMOVE-IMAGE] Removed image at index', index, '- remaining:', window.uploadedImagesData.length);
};

/**
 * NEW: Clear all images
 */
window.clearAllImages = function () {
    // Revoke all blob URLs
    if (window.uploadedImagesData) {
        window.uploadedImagesData.forEach(imageData => {
            if (imageData.blob) {
                URL.revokeObjectURL(URL.createObjectURL(imageData.blob));
            }
        });
    }

    // Clear array
    window.uploadedImagesData = [];

    // Update preview (will hide it)
    updateMultipleImagesPreview();

    console.log('[CLEAR-ALL-IMAGES] Cleared all images');
};

/**
 * NEW: Retry upload at specific index (for failed uploads)
 */
window.retryUploadAtIndex = async function (index) {
    if (!window.uploadedImagesData || index < 0 || index >= window.uploadedImagesData.length) return;

    const imageData = window.uploadedImagesData[index];
    if (!imageData.blob) return;

    console.log('[RETRY-UPLOAD] Retrying upload at index', index);

    // Mark as uploading
    window.uploadedImagesData[index] = {
        blob: imageData.blob,
        productId: imageData.productId,
        productName: imageData.productName
    };
    updateMultipleImagesPreview();

    // Retry upload
    const channelId = window.currentChatChannelId;
    if (!channelId) {
        window.uploadedImagesData[index].uploadFailed = true;
        window.uploadedImagesData[index].error = 'Không thể upload: Thiếu thông tin';
        updateMultipleImagesPreview();
        return;
    }

    const result = await window.uploadImageWithCache(
        imageData.blob,
        imageData.productId,
        imageData.productName,
        channelId,
        imageData.productCode
    );

    if (result.success) {
        // Update with success data
        window.uploadedImagesData[index] = {
            ...result.data,
            blob: imageData.blob,
            productId: imageData.productId,
            productName: imageData.productName
        };
    } else {
        // Update with error
        window.uploadedImagesData[index] = {
            blob: imageData.blob,
            productId: imageData.productId,
            productName: imageData.productName,
            error: result.error,
            uploadFailed: true
        };
    }

    updateMultipleImagesPreview();
};

/**
 * Retry upload when failed (DEPRECATED - use retryUploadAtIndex)
 */
window.retryUpload = async function () {
    if (!currentPastedImage) return;

    const status = document.getElementById('uploadStatus');
    const overlay = document.getElementById('uploadOverlay');
    const preview = document.getElementById('pastedImagePreview');

    if (status && overlay && preview) {
        status.textContent = 'Đang thử lại...';
        status.style.color = '#3b82f6';
        overlay.style.display = 'flex';
        preview.style.opacity = '0.5';
    }

    const productId = window.currentPastedImageProductId || null;
    const productName = window.currentPastedImageProductName || null;
    const channelId = window.currentChatChannelId;

    const result = await uploadImageWithCache(currentPastedImage, productId, productName, channelId);

    if (result.success) {
        uploadedImageData = result.data;
        window.uploadedImageData = result.data;
        updateUploadPreviewUI(true, `${Math.round(currentPastedImage.size / 1024)} KB`, result.data.cached);
    } else {
        uploadedImageData = null;
        window.uploadedImageData = null;
        updateUploadPreviewUI(false, result.error, false);
    }
};

/**
 * Clear pasted image (UI only - keeps uploaded image on Pancake/Firebase)
 */
window.clearPastedImage = function () {
    // NEW: Use clearAllImages for multiple images
    clearAllImages();

    // Legacy cleanup
    currentPastedImage = null;
    window.currentPastedImage = null;
    window.currentPastedImageProductId = null;
    window.currentPastedImageProductName = null;

    console.log('[CLEAR-IMAGE] Cleared all images (UI only - images still on Pancake/Firebase)');
}

/**
 * Send product image to chat input
 * Checks Firebase cache first, if found uses cached content_id
 * Otherwise fetches image from URL, uploads to Pancake, and caches result
 * Called from Dropped Products tab and Orders tab (right-click on product image)
 * @param {string} imageUrl - URL of the product image
 * @param {string} productName - Name of the product
 * @param {number|string} productId - Product ID (optional, for Firebase cache)
 * @param {string} productCode - Product code (optional, for Firebase cache key)
 */
window.sendImageToChat = async function (imageUrl, productName, productId = null, productCode = null) {
    // Check if chat modal is open
    const chatModal = document.getElementById('chatModal');
    if (!chatModal || !chatModal.classList.contains('show')) {
        if (window.notificationManager) {
            window.notificationManager.show('Vui lòng mở chat trước khi gửi ảnh', 'warning');
        } else {
            alert('Vui lòng mở chat trước khi gửi ảnh');
        }
        return;
    }

    // Check if we have channel ID for upload
    const channelId = window.currentChatChannelId;
    if (!channelId) {
        if (window.notificationManager) {
            window.notificationManager.show('Không có thông tin channel để upload ảnh', 'error');
        }
        return;
    }

    // Initialize uploaded images array if needed
    if (!window.uploadedImagesData) {
        window.uploadedImagesData = [];
    }

    try {
        console.log('[SEND-IMAGE-TO-CHAT] Product:', productId, productName, 'Code:', productCode);
        console.log('[SEND-IMAGE-TO-CHAT] Image URL:', imageUrl);

        // Check Firebase cache first (using productCode as primary cache key)
        if (window.firebaseImageCache && (productId || productName || productCode)) {
            console.log('[SEND-IMAGE-TO-CHAT] 🔍 Checking Firebase cache...');

            // Pass productId, productName, and productCode - cache will use productCode as primary key
            const cached = await window.firebaseImageCache.get(productId, productName, productCode);

            if (cached && cached.content_id) {
                // ✅ CACHE HIT - Use cached content_id directly (no upload needed!)
                console.log('[SEND-IMAGE-TO-CHAT] ✅ Cache HIT! Using cached content_id:', cached.content_id);

                if (window.notificationManager) {
                    window.notificationManager.show('✓ Đã dùng ảnh đã lưu (không cần upload)', 'success');
                }

                // Fetch blob from imageUrl for preview display
                const WORKER_URL = API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
                const proxyUrl = `${WORKER_URL}/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;

                let blob = null;
                try {
                    const response = await fetch(proxyUrl);
                    if (response.ok) {
                        blob = await response.blob();
                    }
                } catch (err) {
                    console.warn('[SEND-IMAGE-TO-CHAT] Could not fetch blob for preview:', err);
                }

                // Add to preview with cached data
                window.uploadedImagesData.push({
                    content_url: cached.content_url || null,
                    content_id: cached.content_id,
                    width: cached.width || 0,
                    height: cached.height || 0,
                    blob: blob,  // Include blob for preview
                    productId: productId,
                    productName: productName,
                    productCode: productCode,
                    cached: true
                });
                window.updateMultipleImagesPreview();

                // Focus on chat input
                const chatInput = document.getElementById('chatReplyInput');
                if (chatInput) {
                    chatInput.focus();
                }

                return; // Done - no need to upload
            }

            console.log('[SEND-IMAGE-TO-CHAT] ❌ Cache miss, proceeding to upload...');
        }

        // Show loading notification
        if (window.notificationManager) {
            window.notificationManager.show('Đang tải ảnh...', 'info');
        }

        // Use Cloudflare Worker image proxy to bypass CORS
        const WORKER_URL = API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        const proxyUrl = `${WORKER_URL}/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;

        console.log('[SEND-IMAGE-TO-CHAT] Using proxy URL:', proxyUrl);

        // Fetch image through proxy and convert to blob
        const response = await fetch(proxyUrl);
        if (!response.ok) {
            throw new Error('Không thể tải ảnh từ URL');
        }

        const blob = await response.blob();

        // Add to preview first (showing as uploading)
        window.uploadedImagesData.push({
            blob: blob,
            productId: productId,
            productName: productName,
            productCode: productCode,
            uploading: true
        });
        window.updateMultipleImagesPreview();

        // Upload to Pancake
        console.log('[SEND-IMAGE-TO-CHAT] 📤 Uploading to Pancake...');

        const uploadResult = await window.pancakeDataManager.uploadImage(channelId, blob);

        // Update the last added item with upload result
        const lastIndex = window.uploadedImagesData.length - 1;

        if (uploadResult && uploadResult.id) {
            const contentId = uploadResult.id;
            const contentUrl = uploadResult.content_url;

            // Get dimensions for cache storage
            const dimensions = await getImageDimensions(blob);

            window.uploadedImagesData[lastIndex] = {
                content_url: contentUrl,
                content_id: contentId,
                blob: blob,
                width: dimensions.width,
                height: dimensions.height,
                productId: productId,
                productName: productName,
                productCode: productCode
            };

            console.log('[SEND-IMAGE-TO-CHAT] ✓ Upload success! content_id:', contentId);

            // Save to Firebase cache (using productCode as primary cache key)
            if (window.firebaseImageCache && (productId || productName || productCode)) {
                console.log('[SEND-IMAGE-TO-CHAT] 💾 Saving to Firebase cache...');
                await window.firebaseImageCache.set(productId, productName, contentUrl, contentId, productCode, dimensions.width, dimensions.height)
                    .catch(err => {
                        console.warn('[SEND-IMAGE-TO-CHAT] Cache save failed (non-critical):', err);
                    });
            }

            if (window.notificationManager) {
                window.notificationManager.show('✓ Đã thêm ảnh vào tin nhắn', 'success');
            }
        } else {
            window.uploadedImagesData[lastIndex] = {
                blob: blob,
                productId: productId,
                productName: productName,
                productCode: productCode,
                error: 'Upload failed - no content_id returned',
                uploadFailed: true
            };
            console.error('[SEND-IMAGE-TO-CHAT] ✗ Upload failed: no content_id');
            if (window.notificationManager) {
                window.notificationManager.show('Lỗi upload ảnh', 'error');
            }
        }

        // Update preview
        window.updateMultipleImagesPreview();

        // Focus on chat input
        const chatInput = document.getElementById('chatReplyInput');
        if (chatInput) {
            chatInput.focus();
        }

    } catch (error) {
        console.error('[SEND-IMAGE-TO-CHAT] Error:', error);
        if (window.notificationManager) {
            window.notificationManager.show('Lỗi khi gửi ảnh: ' + error.message, 'error');
        }
    }
};

/**
 * Send product name/info to chat input
 * Inserts product name into the chat message textarea
 * Called from Dropped Products tab (click on send button)
 * @param {number} productId - Product ID
 * @param {string} productName - Name of the product
 */
window.sendProductToChat = function (productId, productName) {
    // Check if chat modal is open
    const chatModal = document.getElementById('chatModal');
    if (!chatModal || !chatModal.classList.contains('show')) {
        if (window.notificationManager) {
            window.notificationManager.show('Vui lòng mở chat trước khi gửi tên sản phẩm', 'warning');
        } else {
            alert('Vui lòng mở chat trước khi gửi tên sản phẩm');
        }
        return;
    }

    const chatInput = document.getElementById('chatReplyInput');
    if (!chatInput) {
        console.error('[SEND-PRODUCT-TO-CHAT] Chat input not found');
        return;
    }

    // Insert product name at cursor position or append
    const currentValue = chatInput.value;
    const cursorPos = chatInput.selectionStart;

    if (currentValue) {
        // Append with newline if there's existing text
        const before = currentValue.substring(0, cursorPos);
        const after = currentValue.substring(cursorPos);
        const separator = before.endsWith('\n') || before === '' ? '' : '\n';
        chatInput.value = before + separator + productName + after;
    } else {
        chatInput.value = productName;
    }

    // Focus and trigger resize
    chatInput.focus();
    chatInput.dispatchEvent(new Event('input', { bubbles: true }));

    console.log('[SEND-PRODUCT-TO-CHAT] ✓ Added product name:', productName);

    if (window.notificationManager) {
        window.notificationManager.show('✓ Đã thêm tên sản phẩm vào tin nhắn', 'success');
    }
};

// Message Queue Management
window.chatMessageQueue = window.chatMessageQueue || [];
window.chatIsProcessingQueue = false;

// Reply Message State
window.currentReplyingToMessage = null; // Stores the message being replied to

/**
 * Auto-resize textarea based on content
 */
function autoResizeTextarea(textarea) {
    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    // Set height based on scrollHeight, but don't exceed max-height
    const maxHeight = 120; // matches max-height in CSS
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = newHeight + 'px';
}

/**
 * Handle Enter key in chat input - prevent double submission, allow Shift+Enter for newlines
 */
function handleChatInputKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        // Skip if autocomplete is active (let quick-reply-manager handle the Enter)
        if (window.quickReplyManager && window.quickReplyManager.autocompleteActive) {
            console.log('[CHAT] Enter pressed but autocomplete is active, skipping sendReplyComment');
            return; // Don't prevent default - let quick-reply-manager handle it
        }

        event.preventDefault(); // Prevent default form submission and double trigger
        event.stopPropagation(); // Stop event bubbling

        // Call sendReplyComment only once
        window.sendReplyComment();
    }
    // Shift+Enter will use default behavior (insert newline)
    // After newline is inserted, resize will happen via input event
}

/**
 * Handle input event for auto-resize
 */
function handleChatInputInput(event) {
    autoResizeTextarea(event.target);
}

/**
 * Set a message to reply to by ID (lookup from chatMessagesById map)
 */
window.setReplyMessageById = function (messageId) {
    const message = window.chatMessagesById?.[messageId];
    if (message) {
        window.setReplyMessage(message);
    } else {
        console.warn('[REPLY] Message not found in map:', messageId);
    }
};

/**
 * Set a message to reply to
 */
window.setReplyMessage = function (message) {
    window.currentReplyingToMessage = message;

    // Show reply preview
    const previewContainer = document.getElementById('chatReplyPreviewContainer');
    const previewText = document.getElementById('chatReplyPreviewText');

    if (previewContainer && previewText) {
        // Extract text from message (handle both text and HTML)
        const messageText = extractMessageText(message);
        const truncated = messageText.length > 100 ? messageText.substring(0, 100) + '...' : messageText;

        // Get sender name and Facebook ID
        const senderName = message.FromName || message.from?.name || 'Khách hàng';
        const fbId = message.From?.id || message.from?.id || message.FromId || null;

        // Get timestamp
        const timestamp = message.CreatedTime || message.updated_at || message.created_at;
        let timeStr = '';
        if (timestamp) {
            const date = new Date(timestamp);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            timeStr = `${day}/${month}/${year} ${hours}:${minutes}`;
        }

        // Verify fb_id matches current conversation's customer (if available)
        if (fbId && window.currentChatPSID && fbId !== window.currentChatPSID) {
            console.warn('[REPLY] ⚠️ Facebook ID mismatch!', {
                messageFbId: fbId,
                conversationPSID: window.currentChatPSID
            });
        }

        // Display with timestamp
        previewText.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; gap: 8px;">
                <div style="flex: 1; min-width: 0;">
                    <strong>${senderName}:</strong> ${truncated}
                </div>
                ${timeStr ? `<div style="color: #6b7280; font-size: 12px; white-space: nowrap; flex-shrink: 0;">${timeStr}</div>` : ''}
            </div>
        `;
        previewContainer.style.display = 'block';
    }

    // Focus input
    const input = document.getElementById('chatReplyInput');
    if (input) input.focus();

    console.log('[REPLY] Set reply to message:', message.id || message.Id, 'fb_id:', fbId, 'at', timestamp);
};

/**
 * Cancel replying to a message
 */
window.cancelReplyMessage = function () {
    window.currentReplyingToMessage = null;

    // Hide reply preview
    const previewContainer = document.getElementById('chatReplyPreviewContainer');
    if (previewContainer) {
        previewContainer.style.display = 'none';
    }

    console.log('[REPLY] Cancelled reply');
};

/**
 * Cancel replying to a comment
 */
window.cancelReplyComment = function () {
    // Clear reply state
    currentParentCommentId = null;
    currentPostId = null;

    // Hide reply preview
    const previewContainer = document.getElementById('chatReplyPreviewContainer');
    if (previewContainer) {
        previewContainer.style.display = 'none';
    }

    // Reset input and disable it (only allow replying to comments)
    const input = document.getElementById('chatReplyInput');
    const sendBtn = document.getElementById('chatSendBtn');

    if (input) {
        input.value = ''; // Clear input content
        input.disabled = true;
        input.placeholder = 'Chọn "Trả lời" một bình luận để reply...';
        input.style.background = '#f3f4f6';
        input.style.cursor = 'not-allowed';
    }

    // Disable send button
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.style.opacity = '0.5';
        sendBtn.style.cursor = 'not-allowed';
    }

    console.log('[REPLY] Cancelled comment reply');
};

/**
 * Cancel reply - works for both messages and comments
 */
window.cancelReply = function () {
    // Check if we're in comment or message mode
    if (currentChatType === 'comment') {
        window.cancelReplyComment();
    } else {
        window.cancelReplyMessage();
    }
};

/**
 * Extract text from message object (handles both text and HTML)
 */
function extractMessageText(message) {
    // Try different message fields
    let text = message.message || message.Message || message.text || '';

    // If HTML, extract text
    if (text.includes('<')) {
        const div = document.createElement('div');
        div.innerHTML = text;
        text = div.textContent || div.innerText || '';
    }

    return text.trim();
}

/**
 * Show/Hide sending indicator in chat modal
 */
window.showChatSendingIndicator = function (text = 'Đang gửi...', queueCount = 0) {
    const indicator = document.getElementById('chatSendingIndicator');
    const textSpan = document.getElementById('chatSendingText');
    const queueSpan = document.getElementById('chatQueueCount');

    if (indicator) {
        indicator.style.display = 'flex';
        if (textSpan) textSpan.textContent = text;
        if (queueSpan) {
            if (queueCount > 0) {
                queueSpan.textContent = `+${queueCount}`;
                queueSpan.style.display = 'block';
            } else {
                queueSpan.style.display = 'none';
            }
        }
    }
}

window.hideChatSendingIndicator = function () {
    const indicator = document.getElementById('chatSendingIndicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

/**
 * Process message queue
 */
async function processChatMessageQueue() {
    if (window.chatIsProcessingQueue || window.chatMessageQueue.length === 0) {
        return;
    }

    window.chatIsProcessingQueue = true;

    while (window.chatMessageQueue.length > 0) {
        const queueCount = window.chatMessageQueue.length - 1;
        showChatSendingIndicator('Đang gửi...', queueCount);

        const messageData = window.chatMessageQueue.shift();
        try {
            // Route to correct function based on chatType
            if (messageData.chatType === 'message') {
                await sendMessageInternal(messageData);
            } else if (messageData.chatType === 'comment') {
                await sendCommentInternal(messageData);
            } else {
                console.error('[QUEUE] Unknown chatType:', messageData.chatType);
                throw new Error('Unknown chatType: ' + messageData.chatType);
            }
        } catch (error) {
            console.error('[QUEUE] Error sending:', error);
            // Continue with next message even if this one fails
        }
    }

    window.chatIsProcessingQueue = false;
    hideChatSendingIndicator();
}

// =====================================================
// PUBLIC API - Message Modal
// =====================================================

/**
 * Split long messages into multiple parts (max 2000 characters each)
 * This is required because Facebook Messenger API has a 2000 character limit per message.
 * Splits at newlines first, then spaces, to avoid breaking words.
 * @param {string} message - The message to split
 * @param {number} maxLength - Maximum length per part (default: 2000)
 * @returns {string[]} Array of message parts
 */
function splitMessageIntoParts(message, maxLength = 2000) {
    if (!message || message.length <= maxLength) {
        return [message];
    }

    const parts = [];
    let remaining = message;

    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            parts.push(remaining);
            break;
        }

        // Find the nearest newline before maxLength
        let cutIndex = remaining.lastIndexOf('\n', maxLength);

        // If no newline found or too far back, find nearest space
        if (cutIndex === -1 || cutIndex < maxLength * 0.5) {
            cutIndex = remaining.lastIndexOf(' ', maxLength);
        }

        // If still no good cut point, hard cut at maxLength
        if (cutIndex === -1 || cutIndex < maxLength * 0.3) {
            cutIndex = maxLength;
        }

        const part = remaining.substring(0, cutIndex).trim();
        if (part.length > 0) {
            parts.push(part);
        }
        remaining = remaining.substring(cutIndex).trim();
    }

    console.log(`[MESSAGE] Split message into ${parts.length} parts (${message.length} chars total)`);
    return parts;
}

/**
 * Send message (MESSAGE modal only)
 * Public wrapper - adds to queue
 */
window.sendMessage = async function () {
    if (isSendingMessage) {
        console.log('[MESSAGE] Already sending, skipping duplicate call');
        return;
    }

    // Check if images are still uploading
    if (window.isUploadingImages) {
        alert('Ảnh đang được tải lên. Vui lòng đợi cho đến khi tải xong.');
        console.warn('[MESSAGE] Cannot send while images are uploading');
        return;
    }

    isSendingMessage = true;

    try {
        const messageInput = document.getElementById('chatReplyInput');
        let message = messageInput.value.trim();

        // Add signature
        if (message) {
            const auth = window.authManager ? window.authManager.getAuthState() : null;
            const displayName = auth && auth.displayName ? auth.displayName : null;
            if (displayName) {
                message = message + '\nNv. ' + displayName;
            }
        }

        // Validate - skip if quick reply is sending
        const hasImages = (window.uploadedImagesData && window.uploadedImagesData.length > 0);
        if (!message && !hasImages) {
            // Don't show alert if quick reply is currently sending
            if (window.isQuickReplySending) {
                console.log('[MESSAGE] Skipping validation - quick reply is sending');
                return;
            }
            alert('Vui lòng nhập tin nhắn hoặc dán ảnh!');
            return;
        }

        // Validate required info
        if (!currentOrder || !window.currentConversationId || !window.currentChatChannelId) {
            alert('Thiếu thông tin để gửi tin nhắn. Vui lòng đóng và mở lại modal.');
            console.error('[MESSAGE] Missing required info');
            return;
        }

        // Capture replied message ID
        const repliedMessageId = window.currentReplyingToMessage ?
            (window.currentReplyingToMessage.id || window.currentReplyingToMessage.Id || null) : null;

        // Add to queue - use currentSendPageId for sending (independent from view page)
        const sendPageId = window.currentSendPageId || window.currentChatChannelId;
        console.log('[MESSAGE] Adding to queue', {
            repliedMessageId,
            imageCount: window.uploadedImagesData?.length || 0,
            sendPageId,
            replyType: messageReplyType
        });

        // Split message into parts if too long (Facebook Messenger limit: 2000 chars)
        const messageParts = splitMessageIntoParts(message);
        const uploadedImages = window.uploadedImagesData || [];

        // Add each message part to the queue
        for (let i = 0; i < messageParts.length; i++) {
            const messagePart = messageParts[i];
            const isLastPart = i === messageParts.length - 1;

            // Build queue data for this part
            const queueData = {
                message: messagePart,
                // Only include images in the last part
                uploadedImagesData: isLastPart ? uploadedImages : [],
                order: currentOrder,
                conversationId: window.currentConversationId,
                channelId: sendPageId,
                chatType: 'message', // EXPLICITLY set to message
                // Only include repliedMessageId in the first part
                repliedMessageId: i === 0 ? repliedMessageId : null,
                customerId: window.currentCustomerUUID, // Add customer_id for Pancake API
                messageReplyType: messageReplyType // Add reply type for private_replies support
            };

            // Add Facebook data if using private_replies (only for first part)
            if (messageReplyType === 'private_replies' && i === 0) {
                queueData.postId = window.purchaseFacebookPostId;
                queueData.commentId = window.purchaseCommentId;
                queueData.psid = window.currentChatPSID;
                console.log('[MESSAGE] Private reply data:', {
                    postId: queueData.postId,
                    commentId: queueData.commentId,
                    psid: queueData.psid
                });
            }

            window.chatMessageQueue.push(queueData);

            if (messageParts.length > 1) {
                console.log(`[MESSAGE] Queued part ${i + 1}/${messageParts.length} (${messagePart.length} chars)`);
            }
        }

        // Clear input
        messageInput.value = '';
        messageInput.style.height = 'auto';

        // Clear images
        if (window.clearAllImages) {
            window.clearAllImages();
        }

        // Legacy cleanup
        currentPastedImage = null;
        window.currentPastedImage = null;
        window.currentPastedImageProductId = null;
        window.currentPastedImageProductName = null;

        // Clear reply state
        window.cancelReply();

        // Process queue
        processChatMessageQueue();
    } finally {
        setTimeout(() => {
            isSendingMessage = false;
        }, 100);
    }
};

// =====================================================
// PUBLIC API - Comment Modal
// =====================================================

/**
 * Send comment reply (COMMENT modal only)
 * Public wrapper - adds to queue
 */
window.sendComment = async function () {
    if (isSendingMessage) {
        console.log('[COMMENT] Already sending, skipping duplicate call');
        return;
    }

    // Check if images are still uploading
    if (window.isUploadingImages) {
        alert('Ảnh đang được tải lên. Vui lòng đợi cho đến khi tải xong.');
        console.warn('[COMMENT] Cannot send while images are uploading');
        return;
    }

    isSendingMessage = true;

    try {
        const messageInput = document.getElementById('chatReplyInput');
        let message = messageInput.value.trim();

        // Add signature
        if (message) {
            const auth = window.authManager ? window.authManager.getAuthState() : null;
            const displayName = auth && auth.displayName ? auth.displayName : null;
            if (displayName) {
                message = message + '\nNv. ' + displayName;
            }
        }

        // Validate - skip if quick reply is sending
        const hasImages = (window.uploadedImagesData && window.uploadedImagesData.length > 0);
        if (!message && !hasImages) {
            // Don't show alert if quick reply is currently sending
            if (window.isQuickReplySending) {
                console.log('[COMMENT] Skipping validation - quick reply is sending');
                return;
            }
            alert('Vui lòng nhập bình luận hoặc dán ảnh!');
            return;
        }

        // Validate required info
        // Note: conversationId will be built from order data in sendCommentInternal, so it's OK if null here
        if (!currentOrder || !window.currentChatChannelId) {
            alert('Thiếu thông tin để gửi bình luận. Vui lòng đóng và mở lại modal.');
            console.error('[COMMENT] Missing required info');
            return;
        }

        // Add to queue - use currentSendPageId for sending (independent from view page)
        const sendPageId = window.currentSendPageId || window.currentChatChannelId;
        console.log('[COMMENT] Adding to queue', { imageCount: window.uploadedImagesData?.length || 0, sendPageId });

        // Split message into parts if too long (Facebook limit: 2000 chars)
        const messageParts = splitMessageIntoParts(message);
        const uploadedImages = window.uploadedImagesData || [];

        // Add each message part to the queue
        for (let i = 0; i < messageParts.length; i++) {
            const messagePart = messageParts[i];
            const isLastPart = i === messageParts.length - 1;

            window.chatMessageQueue.push({
                message: messagePart,
                // Only include images in the last part
                uploadedImagesData: isLastPart ? uploadedImages : [],
                order: currentOrder,
                conversationId: window.currentConversationId,
                channelId: sendPageId,
                chatType: 'comment', // EXPLICITLY set to comment
                // Only include parentCommentId in the first part
                parentCommentId: i === 0 ? currentParentCommentId : null,
                postId: currentPostId || currentOrder.Facebook_PostId,
                customerId: window.currentCustomerUUID // Add customer_id for Pancake API
            });

            if (messageParts.length > 1) {
                console.log(`[COMMENT] Queued part ${i + 1}/${messageParts.length} (${messagePart.length} chars)`);
            }
        }

        // Clear input
        messageInput.value = '';
        messageInput.style.height = 'auto';

        // Clear images
        if (window.clearAllImages) {
            window.clearAllImages();
        }

        // Legacy cleanup
        currentPastedImage = null;
        window.currentPastedImage = null;
        window.currentPastedImageProductId = null;
        window.currentPastedImageProductName = null;

        // Clear reply state (for nested comments)
        if (window.cancelReply) {
            window.cancelReply();
        }

        // Process queue
        processChatMessageQueue();
    } finally {
        setTimeout(() => {
            isSendingMessage = false;
        }, 100);
    }
};

// =====================================================
// LEGACY WRAPPER - For backwards compatibility
// =====================================================

/**
 * Legacy wrapper - routes to correct function based on currentChatType
 * @deprecated Use window.sendMessage() or window.sendComment() directly
 */
window.sendReplyComment = async function () {
    console.log('[LEGACY] sendReplyComment called, routing to:', currentChatType);

    // Route to correct function based on chat type
    if (currentChatType === 'message') {
        return window.sendMessage();
    } else if (currentChatType === 'comment') {
        return window.sendComment();
    } else {
        console.error('[LEGACY] Unknown currentChatType:', currentChatType);
        alert('Lỗi: Không xác định được loại modal (message/comment)');
    }
};

/**
 * Get image dimensions from blob/file
 * @param {Blob|File} blob
 * @returns {Promise<{width: number, height: number}>}
 */
function getImageDimensions(blob) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);

        img.onload = function () {
            URL.revokeObjectURL(url);
            resolve({
                width: img.naturalWidth,
                height: img.naturalHeight
            });
        };

        img.onerror = function () {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image'));
        };

        img.src = url;
    });
}

// =====================================================
// MESSAGE MODAL - Send message functions
// =====================================================

/**
 * Send message via Facebook Graph API with POST_PURCHASE_UPDATE message tag
 * Used to bypass 24h policy when normal Pancake API fails
 * @param {object} params - Message parameters
 * @param {string} params.pageId - Facebook Page ID
 * @param {string} params.psid - Facebook PSID of recipient
 * @param {string} params.message - Message text to send
 * @param {Array<string>} params.imageUrls - Optional array of image URLs to send
 * @returns {Promise<{success: boolean, error?: string, messageId?: string}>}
 */
async function sendMessageViaFacebookTag(params) {
    const { pageId, psid, message, imageUrls } = params;

    console.log('[FB-TAG-SEND] ========================================');
    console.log('[FB-TAG-SEND] Attempting to send message via Facebook Graph API with POST_PURCHASE_UPDATE tag');
    console.log('[FB-TAG-SEND] Page ID:', pageId, 'PSID:', psid);

    try {
        // Get Facebook Page Token from TPOS CRMTeam data (expanded in order)
        // This token is different from Pancake's page_access_token
        let facebookPageToken = null;
        let tokenSourcePageId = null;

        // Source 1: Try from window.currentCRMTeam (set when chat modal opens)
        // IMPORTANT: Check if this CRMTeam matches the requested pageId
        if (window.currentCRMTeam && window.currentCRMTeam.Facebook_PageToken) {
            const crmPageId = window.currentCRMTeam.ChannelId || window.currentCRMTeam.Facebook_AccountId || window.currentCRMTeam.Id;
            tokenSourcePageId = crmPageId;

            // Check if pageId matches CRMTeam's page
            if (String(crmPageId) === String(pageId) ||
                String(window.currentCRMTeam.Facebook_AccountId) === String(pageId)) {
                facebookPageToken = window.currentCRMTeam.Facebook_PageToken;
                console.log('[FB-TAG-SEND] ✅ Got matching Facebook Page Token from window.currentCRMTeam');
            } else {
                console.warn(`[FB-TAG-SEND] ⚠️ currentCRMTeam page (${crmPageId}) does not match requested page (${pageId})`);
            }
        }

        // Source 2: Try to get from current order's CRMTeam (if already loaded)
        if (!facebookPageToken && window.currentOrder && window.currentOrder.CRMTeam && window.currentOrder.CRMTeam.Facebook_PageToken) {
            const crmPageId = window.currentOrder.CRMTeam.ChannelId || window.currentOrder.CRMTeam.Facebook_AccountId;
            tokenSourcePageId = crmPageId;

            if (String(crmPageId) === String(pageId) ||
                String(window.currentOrder.CRMTeam.Facebook_AccountId) === String(pageId)) {
                facebookPageToken = window.currentOrder.CRMTeam.Facebook_PageToken;
                console.log('[FB-TAG-SEND] ✅ Got matching Facebook Page Token from currentOrder.CRMTeam');
            } else {
                console.warn(`[FB-TAG-SEND] ⚠️ currentOrder.CRMTeam page (${crmPageId}) does not match requested page (${pageId})`);
            }
        }

        // Source 3: Try from cachedChannelsData
        if (!facebookPageToken && window.cachedChannelsData) {
            const channel = window.cachedChannelsData.find(ch =>
                String(ch.ChannelId) === String(pageId) ||
                String(ch.Facebook_AccountId) === String(pageId)
            );
            if (channel && channel.Facebook_PageToken) {
                facebookPageToken = channel.Facebook_PageToken;
                console.log('[FB-TAG-SEND] ✅ Got Facebook Page Token from cached channels');
            }
        }

        // Source 4: Fetch CRMTeam directly by pageId from TPOS (NEW!)
        if (!facebookPageToken) {
            console.log('[FB-TAG-SEND] Token not found for page, fetching CRMTeam from TPOS...');
            try {
                const headers = await window.tokenManager?.getAuthHeader() || {};
                // Try to find CRMTeam by ChannelId (pageId)
                const crmUrl = `${window.API_CONFIG.WORKER_URL}/api/odata/CRMTeam?$filter=ChannelId eq '${pageId}' or Facebook_AccountId eq '${pageId}'&$top=1`;
                const response = await fetch(crmUrl, {
                    method: 'GET',
                    headers: { ...headers, 'Accept': 'application/json' }
                });

                if (response.ok) {
                    const data = await response.json();
                    const teams = data.value || data;
                    if (teams && teams.length > 0 && teams[0].Facebook_PageToken) {
                        facebookPageToken = teams[0].Facebook_PageToken;
                        console.log('[FB-TAG-SEND] ✅ Got Facebook Page Token from CRMTeam API for page:', pageId);
                    }
                }
            } catch (fetchError) {
                console.warn('[FB-TAG-SEND] ⚠️ Could not fetch CRMTeam from TPOS:', fetchError.message);
            }
        }

        // Source 5: Fallback - use currentCRMTeam token anyway (may cause error but better than nothing)
        if (!facebookPageToken && window.currentCRMTeam && window.currentCRMTeam.Facebook_PageToken) {
            facebookPageToken = window.currentCRMTeam.Facebook_PageToken;
            console.warn('[FB-TAG-SEND] ⚠️ Using currentCRMTeam token as fallback - may cause page mismatch error!');
            console.warn(`[FB-TAG-SEND] ⚠️ Token is for page: ${tokenSourcePageId}, but sending to page: ${pageId}`);
        }

        if (!facebookPageToken) {
            console.error('[FB-TAG-SEND] ❌ No Facebook Page Token found for page:', pageId);
            return {
                success: false,
                error: 'Không tìm thấy Facebook Page Token. Token này khác với Pancake token và cần được thiết lập trong TPOS.'
            };
        }

        // Call Facebook Send API via our worker proxy
        const facebookSendUrl = window.API_CONFIG.buildUrl.facebookSend();
        console.log('[FB-TAG-SEND] Calling:', facebookSendUrl);

        const requestBody = {
            pageId: pageId,
            psid: psid,
            message: message,
            pageToken: facebookPageToken,
            useTag: true, // Use POST_PURCHASE_UPDATE tag
            imageUrls: imageUrls || [] // Include image URLs if provided
        };

        const response = await fetch(facebookSendUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const result = await response.json();
        console.log('[FB-TAG-SEND] Response:', result);
        console.log('[FB-TAG-SEND] ========================================');

        if (result.success) {
            console.log('[FB-TAG-SEND] ✅ Message sent successfully via Facebook Graph API!');
            console.log('[FB-TAG-SEND] Message ID:', result.message_id);
            console.log('[FB-TAG-SEND] Used tag:', result.used_tag);
            return {
                success: true,
                messageId: result.message_id,
                recipientId: result.recipient_id,
                usedTag: result.used_tag
            };
        } else {
            console.error('[FB-TAG-SEND] ❌ Facebook API error:', result.error);
            return {
                success: false,
                error: result.error || 'Facebook API error',
                errorCode: result.error_code,
                errorSubcode: result.error_subcode
            };
        }

    } catch (error) {
        console.error('[FB-TAG-SEND] ❌ Error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Global flag to track if 24h policy fallback UI should be shown
window.current24hPolicyStatus = {
    isExpired: false,
    hoursSinceLastMessage: null,
    canUseFacebookTag: false
};

/**
 * Show 24h policy fallback prompt with option to send via Facebook tag
 */
window.show24hFallbackPrompt = function (messageText, pageId, psid) {
    const modalContent = `
        <div style="padding: 20px; max-width: 400px;">
            <h3 style="margin: 0 0 16px; color: #ef4444; display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-clock"></i>
                Đã quá 24 giờ
            </h3>
            <p style="color: #6b7280; margin: 0 0 16px; line-height: 1.5;">
                Khách hàng chưa tương tác trong 24 giờ qua. Chọn cách gửi tin nhắn:
            </p>
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <button onclick="window.sendViaFacebookTagFromModal('${encodeURIComponent(messageText)}', '${pageId}', '${psid}')"
                    style="padding: 12px 16px; background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <i class="fab fa-facebook"></i>
                    Gửi với Message Tag (POST_PURCHASE_UPDATE)
                </button>
                <p style="font-size: 12px; color: #9ca3af; margin: 0; padding: 0 8px;">
                    ⚠️ Chỉ dùng cho thông báo liên quan đơn hàng (xác nhận, vận chuyển, yêu cầu hành động)
                </p>
                <button onclick="window.switchToCommentMode()"
                    style="padding: 12px 16px; background: #10b981; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <i class="fas fa-comment"></i>
                    Chuyển sang reply Comment
                </button>
                <button onclick="window.close24hFallbackModal()"
                    style="padding: 10px 16px; background: transparent; color: #6b7280; border: 1px solid #e5e7eb; border-radius: 8px; cursor: pointer;">
                    Hủy
                </button>
            </div>
        </div>
    `;

    // Create modal
    let modal = document.getElementById('fb24hFallbackModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'fb24hFallbackModal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10001; display: flex; align-items: center; justify-content: center;';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `<div style="background: white; border-radius: 12px; box-shadow: 0 20px 50px rgba(0,0,0,0.2);">${modalContent}</div>`;
    modal.style.display = 'flex';
};

window.close24hFallbackModal = function () {
    const modal = document.getElementById('fb24hFallbackModal');
    if (modal) modal.style.display = 'none';
};

window.sendViaFacebookTagFromModal = async function (encodedMessage, pageId, psid, imageUrls = []) {
    window.close24hFallbackModal();

    const message = decodeURIComponent(encodedMessage);

    if (window.notificationManager) {
        window.notificationManager.show('🔄 Đang gửi qua Facebook Graph API...', 'info');
    }

    const result = await sendMessageViaFacebookTag({ pageId, psid, message, imageUrls });

    if (result.success) {
        if (window.notificationManager) {
            window.notificationManager.show('✅ Đã gửi tin nhắn thành công qua Facebook!', 'success', 5000);
        }

        // Add optimistic UI update
        const now = new Date().toISOString();
        const tempMessage = {
            Id: `fb_${Date.now()}`,
            id: `fb_${Date.now()}`,
            Message: message + '\n\n[Gửi qua Facebook Message Tag]',
            CreatedTime: now,
            IsOwner: true,
            is_temp: true
        };
        window.allChatMessages.push(tempMessage);
        renderChatMessages(window.allChatMessages, true);

        // Refresh messages after a delay
        setTimeout(async () => {
            try {
                if (window.currentChatPSID && window.currentChatChannelId) {
                    const response = await window.chatDataManager.fetchMessages(
                        window.currentChatChannelId,
                        window.currentChatPSID
                    );
                    if (response.messages && response.messages.length > 0) {
                        window.allChatMessages = response.messages;
                        renderChatMessages(window.allChatMessages, false);
                    }
                }
            } catch (e) {
                console.error('[FB-TAG-SEND] Error refreshing messages:', e);
            }
        }, 1000);
    } else {
        if (window.notificationManager) {
            window.notificationManager.show('❌ Lỗi gửi qua Facebook: ' + result.error, 'error', 8000);
        } else {
            alert('❌ Lỗi gửi qua Facebook: ' + result.error);
        }
    }
};

window.switchToCommentMode = function () {
    window.close24hFallbackModal();
    if (window.notificationManager) {
        window.notificationManager.show('💡 Vui lòng mở lại modal Comment để reply', 'info', 5000);
    }
};

/**
 * Send message (MESSAGE modal only)
 * Called by queue processor
 * Supports both reply_inbox and private_replies actions
 */
async function sendMessageInternal(messageData) {
    const {
        message,
        uploadedImagesData,
        order,
        conversationId,
        channelId,
        repliedMessageId,
        customerId,
        messageReplyType = 'reply_inbox', // Default to reply_inbox
        postId,
        commentId,
        psid
    } = messageData;

    try {
        // Get page_access_token for Official API (pages.fm)
        const pageAccessToken = await window.pancakeTokenManager?.getOrGeneratePageAccessToken(channelId);
        if (!pageAccessToken) {
            throw new Error('Không tìm thấy page_access_token. Vui lòng vào Pancake Settings → Tools để tạo token.');
        }

        showChatSendingIndicator('Đang gửi tin nhắn...');

        // Step 1: Process multiple images
        let imagesDataArray = [];
        let hasFallbackImages = false; // Track if any images were uploaded via imgbb fallback
        if (uploadedImagesData && uploadedImagesData.length > 0) {
            console.log('[MESSAGE] Processing', uploadedImagesData.length, 'images');
            showChatSendingIndicator(`Đang xử lý ${uploadedImagesData.length} ảnh...`);

            for (let i = 0; i < uploadedImagesData.length; i++) {
                const imageData = uploadedImagesData[i];

                try {
                    // Check if image was already uploaded successfully (check content_id instead of content_url)
                    if ((imageData.content_id || imageData.id) && !imageData.uploadFailed) {
                        console.log(`[MESSAGE] Image ${i + 1}: Using pre-uploaded ID:`, imageData.content_id || imageData.id);
                        imagesDataArray.push(imageData);
                    } else if (imageData.fallback_url) {
                        // Image was uploaded via imgbb fallback (no content_id)
                        console.log(`[MESSAGE] Image ${i + 1}: Using fallback URL (imgbb):`, imageData.fallback_url);
                        imagesDataArray.push(imageData);
                        hasFallbackImages = true;
                    } else if (imageData.blob) {
                        // Retry upload
                        console.log(`[MESSAGE] Image ${i + 1}: Retrying upload...`);
                        showChatSendingIndicator(`Đang tải ảnh ${i + 1}/${uploadedImagesData.length}...`);

                        const result = await window.uploadImageWithCache(
                            imageData.blob,
                            imageData.productId || null,
                            imageData.productName || null,
                            channelId,
                            imageData.productCode || null
                        );

                        if (!result.success) {
                            throw new Error(`Ảnh ${i + 1} upload failed: ${result.error || 'Unknown error'}`);
                        }

                        console.log(`[MESSAGE] Image ${i + 1}: Uploaded:`, result.data.content_url);
                        imagesDataArray.push(result.data);

                        // Check if this was a fallback upload
                        if (result.data.fallback_url || result.data.fallback_source) {
                            hasFallbackImages = true;
                            console.log(`[MESSAGE] Image ${i + 1}: Detected fallback source:`, result.data.fallback_source);
                        }
                    }
                } catch (uploadError) {
                    console.error(`[MESSAGE] Image ${i + 1} processing failed:`, uploadError);
                    throw new Error(`Tải ảnh ${i + 1} thất bại: ${uploadError.message}`);
                }
            }

            console.log('[MESSAGE] All images processed:', imagesDataArray.length, 'hasFallbackImages:', hasFallbackImages);
        }

        // Step 1.5: If we have fallback images (no content_id), go directly to Facebook Graph API
        if (hasFallbackImages && imagesDataArray.length > 0) {
            console.log('[MESSAGE] 🔄 Fallback images detected - sending directly via Facebook Graph API');
            showChatSendingIndicator('Đang gửi qua Facebook Graph API...');

            // Extract all image URLs
            const imageUrls = imagesDataArray
                .map(img => img.fallback_url || img.content_url)
                .filter(url => url);

            if (imageUrls.length > 0) {
                // Get real PSID
                let realPsid = psid || window.currentRealFacebookPSID || window.currentChatPSID;

                const fbResult = await sendMessageViaFacebookTag({
                    pageId: channelId,
                    psid: realPsid,
                    message: message,
                    imageUrls: imageUrls
                });

                if (fbResult.success) {
                    console.log('[MESSAGE] ✅ Facebook Graph API send success!');
                    if (window.notificationManager) {
                        window.notificationManager.show('✅ Đã gửi tin nhắn qua Facebook!', 'success');
                    }

                    // Optimistic UI update
                    const now = new Date().toISOString();
                    const tempMessage = {
                        Id: `temp_${Date.now()}`,
                        id: `temp_${Date.now()}`,
                        Message: message,
                        CreatedTime: now,
                        IsOwner: true,
                        is_temp: true,
                        Attachments: imageUrls.map(url => ({
                            Type: 'image',
                            Payload: { Url: url }
                        }))
                    };
                    window.allChatMessages.push(tempMessage);
                    renderChatMessages(window.allChatMessages, true);

                    return; // Success - exit early
                } else {
                    console.error('[MESSAGE] ❌ Facebook Graph API send failed:', fbResult.error);
                    throw new Error('Gửi qua Facebook Graph API thất bại: ' + (fbResult.error || 'Unknown error'));
                }
            }
        }

        // Step 2: Build JSON payload based on reply type
        // Ref: https://developer.pancake.biz/#/paths/pages-page_id--conversations--conversation_id--messages/post
        let payload;
        let actualConversationId = conversationId;

        if (messageReplyType === 'private_replies') {
            // ========== PRIVATE REPLIES (Reply to comment via private message) ==========
            // Validate required data for private_replies
            if (!postId || !commentId || !psid) {
                throw new Error('Thiếu thông tin comment để gửi tin nhắn riêng. Vui lòng thử lại.');
            }

            // IMPORTANT: For private_replies, conversationId MUST equal message_id (comment_id)!
            // This matches the real Pancake API format (same as sendCommentInternal)
            actualConversationId = commentId;

            payload = {
                action: 'private_replies',
                post_id: postId,
                message_id: commentId,
                from_id: psid,
                message: message
            };

            console.log('[MESSAGE] Building PRIVATE_REPLIES payload:', {
                postId,
                commentId,
                psid,
                conversationId: actualConversationId
            });
        } else {
            // ========== REPLY INBOX (Standard Messenger reply) ==========
            payload = {
                action: 'reply_inbox',
                message: message
            };

            // Add replied_message_id if replying to a message
            if (repliedMessageId) {
                payload.replied_message_id = repliedMessageId;
                console.log('[MESSAGE] Adding replied_message_id:', repliedMessageId);
            }

            console.log('[MESSAGE] Building REPLY_INBOX payload');
        }

        // Step 3: Send message
        // When sending images, use Internal API (pancake.vn) with multipart/form-data
        // For text-only, use Official API (pages.fm) with JSON

        let replyUrl;
        let requestOptions;
        let apiSuccess = false;
        let apiError = null;

        if (imagesDataArray.length > 0) {
            // ========== SEND WITH IMAGES via Internal API (multipart/form-data) ==========
            console.log('[MESSAGE] Adding', imagesDataArray.length, 'images to payload');

            // Get JWT access_token for Internal API
            const accessToken = await window.pancakeDataManager?.getToken();
            if (!accessToken) {
                throw new Error('No Pancake access_token available for image send');
            }

            // Use Internal API (pancake.vn) for sending images
            replyUrl = window.API_CONFIG.buildUrl.pancake(
                `pages/${channelId}/conversations/${actualConversationId}/messages`,
                `access_token=${accessToken}`
            ) + (customerId ? `&customer_id=${customerId}` : '');

            // Build multipart/form-data for each image
            // Pancake web sends one image at a time with these fields:
            // action, message, content_id, attachment_id, content_url, width, height, send_by_platform
            const firstImage = imagesDataArray[0];
            const formData = new FormData();
            formData.append('action', payload.action || 'reply_inbox');
            formData.append('message', message || '');
            formData.append('content_id', firstImage.content_id || firstImage.id || '');
            formData.append('attachment_id', firstImage.fb_id || '');
            formData.append('content_url', firstImage.content_url || '');
            formData.append('width', String(firstImage.width || 0));
            formData.append('height', String(firstImage.height || 0));
            formData.append('send_by_platform', 'web');

            if (repliedMessageId) {
                formData.append('replied_message_id', repliedMessageId);
            }

            requestOptions = {
                method: 'POST',
                body: formData
                // Don't set Content-Type header - browser will set it with boundary
            };

            console.log('[MESSAGE] Using Internal API with multipart/form-data');
            console.log('[MESSAGE] content_id:', firstImage.content_id || firstImage.id);
            console.log('[MESSAGE] content_url:', firstImage.content_url);
            console.log('[MESSAGE] dimensions:', firstImage.width, 'x', firstImage.height);

            // TODO: If multiple images, need to send them in sequence
            if (imagesDataArray.length > 1) {
                console.warn('[MESSAGE] ⚠️ Multiple images not fully supported yet - only first image will be sent');
            }
        } else {
            // ========== SEND TEXT ONLY via Official API (JSON) ==========
            replyUrl = window.API_CONFIG.buildUrl.pancakeOfficial(
                `pages/${channelId}/conversations/${actualConversationId}/messages`,
                pageAccessToken
            ) + (customerId ? `&customer_id=${customerId}` : '');

            requestOptions = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(payload)
            };
        }

        console.log('[MESSAGE] Sending message...');
        console.log('[MESSAGE] URL:', replyUrl.replace(/access_token=[^&]+/, 'access_token=***'));

        try {
            const replyResponse = await API_CONFIG.smartFetch(replyUrl, requestOptions, 1, true); // maxRetries=1, skipFallback=true

            if (!replyResponse.ok) {
                const errorText = await replyResponse.text();
                console.error('[MESSAGE] Send failed:', errorText);
                throw new Error(`Gửi tin nhắn thất bại: ${replyResponse.status} ${replyResponse.statusText}`);
            }

            const replyData = await replyResponse.json();
            console.log('[MESSAGE] Response:', replyData);

            if (!replyData.success) {
                console.error('[MESSAGE] API Error:', replyData);

                // Check for Facebook 24-hour policy error
                const is24HourError = (replyData.e_code === 10 && replyData.e_subcode === 2018278) ||
                    (replyData.message && replyData.message.includes('khoảng thời gian cho phép'));

                if (is24HourError) {
                    console.warn('[MESSAGE] ⚠️ 24-hour policy violation detected');
                    const error24h = new Error('24H_POLICY_ERROR');
                    error24h.is24HourError = true;
                    error24h.originalMessage = replyData.message;
                    throw error24h;
                }

                // Check for user unavailable error (551)
                const isUserUnavailable = (replyData.e_code === 551) ||
                    (replyData.message && replyData.message.includes('không có mặt'));

                if (isUserUnavailable) {
                    console.warn('[MESSAGE] ⚠️ User unavailable (551) error detected');
                    const error551 = new Error('USER_UNAVAILABLE');
                    error551.isUserUnavailable = true;
                    error551.originalMessage = replyData.message;
                    throw error551;
                }

                const errorMessage = replyData.error || replyData.message || replyData.reason || 'Unknown error';
                throw new Error('Gửi tin nhắn thất bại: ' + errorMessage);
            }

            apiSuccess = true;

            // Auto-mark as read after successful message send
            console.log('[MARK-READ] Message sent successfully');
            autoMarkAsRead(0);
        } catch (err) {
            apiError = err;
            console.warn('[MESSAGE] ⚠️ API failed:', err.message);

            // NOTE: PANCAKE-UNLOCK đã được bỏ - đi thẳng đến FB-TAG-SEND cho 24H errors
            // và Private Reply cho 551 errors

            // ========== Fallback: Private Reply (for error 551 only) ==========
            // If still not successful and this is a 551 error, try Private Reply via Facebook Graph API
            if (!apiSuccess && err.isUserUnavailable) {
                console.log('[MESSAGE] 🔄 User unavailable (#551), checking for Private Reply context...');

                // Hiển thị thông báo giải thích lỗi 551
                if (window.notificationManager) {
                    window.notificationManager.show(
                        '⚠️ Lỗi 551: Không thể gửi inbox. Có thể do:\n• Khách chỉ comment, chưa từng inbox\n• Khách đã block page\n• Đang thử Private Reply...',
                        'warning',
                        5000
                    );
                }

                const facebookPostId = order.Facebook_PostId || window.purchaseFacebookPostId;
                const facebookCommentId = order.Facebook_CommentId || window.purchaseCommentId;
                const facebookASUserId = order.Facebook_ASUserId || window.purchaseFacebookASUserId || psid;

                // Get REAL Facebook Page Token (not Pancake JWT!)
                const realFacebookPageToken = window.currentCRMTeam?.Facebook_PageToken;

                if (facebookPostId && facebookCommentId && facebookASUserId && realFacebookPageToken) {
                    console.log('[MESSAGE] ✅ Found comment context, attempting Private Reply fallback...');
                    showChatSendingIndicator('Khách chưa nhắn tin, đang thử Private Reply...');

                    try {
                        // Extract Comment ID (first one if multiple)
                        const commentIds = facebookCommentId.toString().split(',').map(id => id.trim());
                        const targetCommentId = commentIds[0];

                        // Build Private Reply payload for Facebook Graph API
                        const privateReplyUrl = window.API_CONFIG.buildUrl.facebookSend();

                        const privatePayload = {
                            pageId: channelId, // Required by worker proxy
                            recipient: {
                                comment_id: targetCommentId
                            },
                            message: {
                                text: message
                            },
                            pageToken: realFacebookPageToken // REAL Facebook Page Token (EAAEppgm... format)
                        };

                        console.log('[MESSAGE] Sending Private Reply (Graph API) payload:', JSON.stringify(privatePayload));

                        const prResponse = await API_CONFIG.smartFetch(privateReplyUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Accept': 'application/json'
                            },
                            body: JSON.stringify(privatePayload)
                        }, 1, true);

                        if (prResponse.ok) {
                            const prData = await prResponse.json();
                            if (prData.success !== false) {
                                console.log('[MESSAGE] ✅ Private Reply fallback succeeded!');
                                apiSuccess = true;
                                apiError = null;

                                if (window.notificationManager) {
                                    window.notificationManager.show('✅ Đã gửi tin nhắn (Private Reply) thành công!', 'success');
                                }

                                // Auto-mark as read
                                autoMarkAsRead(0);
                            } else {
                                console.warn('[MESSAGE] ❌ Private Reply API error:', prData);
                            }
                        } else {
                            const errorData = await prResponse.json().catch(() => ({}));
                            console.warn('[MESSAGE] ❌ Private Reply HTTP error:', prResponse.status, errorData);
                        }
                    } catch (prError) {
                        console.error('[MESSAGE] ❌ Private Reply fallback failed:', prError);
                    }
                } else {
                    console.warn('[MESSAGE] ⚠️ Cannot try Private Reply: Missing context', {
                        hasPostId: !!facebookPostId,
                        hasCommentId: !!facebookCommentId,
                        hasASUserId: !!facebookASUserId,
                        hasPageToken: !!realFacebookPageToken
                    });

                    // Thông báo không thể Private Reply vì thiếu thông tin comment
                    if (window.notificationManager) {
                        window.notificationManager.show(
                            '❌ Lỗi 551: Không thể gửi inbox!\n• Khách chưa từng inbox với page\n• Không có thông tin comment để Private Reply\n→ Hãy dùng COMMENT để trả lời khách!',
                            'error',
                            8000
                        );
                    }
                }
            }
        }

        // If API failed, throw error
        if (!apiSuccess && apiError) {
            throw apiError;
        }

        // Step 4: Optimistic UI update
        const now = new Date().toISOString();
        skipWebhookUpdate = true;

        const tempMessage = {
            Id: `temp_${Date.now()}`,
            id: `temp_${Date.now()}`,
            Message: message,
            CreatedTime: now,
            IsOwner: true,
            is_temp: true
        };

        // Add image attachments
        if (imagesDataArray && imagesDataArray.length > 0) {
            tempMessage.Attachments = imagesDataArray.map(img => ({
                Type: 'image',
                Payload: { Url: img.content_url }
            }));
        }

        window.allChatMessages.push(tempMessage);
        renderChatMessages(window.allChatMessages, true);

        console.log('[MESSAGE] Added optimistic message to UI');

        // Step 5: Refresh messages from API
        setTimeout(async () => {
            try {
                if (window.currentChatPSID) {
                    const response = await window.chatDataManager.fetchMessages(channelId, window.currentChatPSID);
                    if (response.messages && response.messages.length > 0) {
                        window.allChatMessages = response.messages;
                        renderChatMessages(window.allChatMessages, false);
                        console.log('[MESSAGE] Replaced temp messages with real data');
                    }
                }
            } finally {
                skipWebhookUpdate = false;
            }
        }, 300);

        // Success notification
        if (window.notificationManager) {
            window.notificationManager.show('✅ Đã gửi tin nhắn thành công!', 'success');
        }

        console.log('[MESSAGE] ✅ Sent successfully');

    } catch (error) {
        console.error('[MESSAGE] ❌ Error:', error);

        // Special handling for 24-hour policy error or user unavailable (551) error
        if (error.is24HourError || error.isUserUnavailable) {
            const errorType = error.is24HourError ? '24H' : '551';
            console.log(`[MESSAGE] 📝 Showing Facebook Tag fallback for ${errorType} error`);

            // Get the original message text from the messageData
            const originalMessage = messageData.message || '';
            const pageId = messageData.channelId || window.currentChatChannelId;

            // IMPORTANT: Get the real Facebook PSID from conversation data
            // window.currentChatPSID may be Pancake internal ID, not Facebook PSID
            // Facebook Graph API requires the real PSID (from_psid or customers[0].fb_id)
            let psid = null;

            // Try to use the saved real Facebook PSID first
            if (window.currentRealFacebookPSID) {
                psid = window.currentRealFacebookPSID;
                console.log('[MESSAGE] ✅ Using saved real Facebook PSID:', psid);
            }
            // Fallback: Try to get from current conversation data (cached)
            else if (window.currentConversationId && window.pancakeDataManager) {
                const convId = window.currentConversationId;
                // Search in inboxMapByPSID values
                for (const [key, conv] of window.pancakeDataManager.inboxMapByPSID) {
                    if (conv.id === convId) {
                        psid = conv.from_psid || (conv.customers && conv.customers[0]?.fb_id);
                        if (psid) {
                            console.log('[MESSAGE] ✅ Got real PSID from cached conversation:', psid);
                            break;
                        }
                    }
                }
            }

            // Last fallback to currentChatPSID if no real PSID found
            if (!psid) {
                psid = window.currentChatPSID;
                console.log('[MESSAGE] ⚠️ Using currentChatPSID as last fallback:', psid);
            }

            // Auto-send via Facebook Tag (POST_PURCHASE_UPDATE) for 24h error or 551 error
            if ((error.is24HourError || error.isUserUnavailable) && originalMessage && pageId && psid) {
                const errorType = error.is24HourError ? '24h error' : '551 (user unavailable)';
                console.log(`[MESSAGE] 🔄 Auto-sending via Facebook Tag for ${errorType}`);

                // Extract image URLs from uploadedImagesData
                const imageUrls = [];
                if (messageData.uploadedImagesData && messageData.uploadedImagesData.length > 0) {
                    for (const imgData of messageData.uploadedImagesData) {
                        // Try fallback_url first (from imgbb)
                        if (imgData.fallback_url) {
                            imageUrls.push(imgData.fallback_url);
                        }
                        // Try content_url (from Pancake cache)
                        else if (imgData.content_url) {
                            imageUrls.push(imgData.content_url);
                        }
                        // Last resort: build URL from content_id (may not work)
                        else if (imgData.content_id || imgData.id) {
                            const contentId = imgData.content_id || imgData.id;
                            // Pancake content URL format
                            imageUrls.push(`https://content.pancake.vn/2.1-25/contents/${contentId}`);
                        }
                    }
                    console.log('[MESSAGE] Extracted image URLs for Facebook Tag:', imageUrls);
                }

                // Auto-send without showing modal
                window.sendViaFacebookTagFromModal(encodeURIComponent(originalMessage), pageId, psid, imageUrls);
            } else {
                // For missing data, just show notification
                let message = error.is24HourError
                    ? '⚠️ Không thể gửi Inbox (đã quá 24h). Thử gửi qua Facebook Message Tag hoặc dùng COMMENT!'
                    : '⚠️ Không thể gửi Inbox (người dùng không có mặt). Đang thử gửi qua Facebook...';

                if (window.notificationManager) {
                    window.notificationManager.show(message, 'warning', 8000);
                } else {
                    alert(message);
                }
            }
            // Don't throw error for these cases - just notify user
            return;
        }

        if (window.notificationManager) {
            window.notificationManager.show('❌ Lỗi khi gửi tin nhắn: ' + error.message, 'error');
        } else {
            alert('❌ Lỗi khi gửi tin nhắn: ' + error.message);
        }
        throw error;
    }
}

// =====================================================
// COMMENT MODAL - Send comment functions
// =====================================================

/**
 * Send comment reply (COMMENT modal only)
 * Called by queue processor
 */
async function sendCommentInternal(commentData) {
    const { message, uploadedImagesData, order, conversationId, channelId, parentCommentId, postId, customerId } = commentData;

    try {
        // Get page_access_token for Official API (pages.fm)
        const pageAccessToken = await window.pancakeTokenManager?.getOrGeneratePageAccessToken(channelId);
        if (!pageAccessToken) {
            throw new Error('Không tìm thấy page_access_token. Vui lòng vào Pancake Settings → Tools để tạo token.');
        }

        showChatSendingIndicator('Đang gửi bình luận...');

        // Step 1: Process single image (comments only support 1 image)
        let imageData = null;
        if (uploadedImagesData && uploadedImagesData.length > 0) {
            const firstImage = uploadedImagesData[0];
            console.log('[COMMENT] Processing image');
            showChatSendingIndicator('Đang xử lý ảnh...');

            try {
                // Check content_id instead of content_url (API returns id, not url)
                if ((firstImage.content_id || firstImage.id) && !firstImage.uploadFailed) {
                    console.log('[COMMENT] Using pre-uploaded image ID:', firstImage.content_id || firstImage.id);
                    imageData = firstImage;
                } else if (firstImage.blob) {
                    console.log('[COMMENT] Uploading image...');
                    const result = await window.uploadImageWithCache(
                        firstImage.blob,
                        firstImage.productId || null,
                        firstImage.productName || null,
                        channelId,
                        firstImage.productCode || null
                    );

                    if (!result.success) {
                        throw new Error(`Upload failed: ${result.error || 'Unknown error'}`);
                    }

                    console.log('[COMMENT] Image uploaded:', result.data.content_url);
                    imageData = result.data;
                }
            } catch (uploadError) {
                console.error('[COMMENT] Image processing failed:', uploadError);
                throw new Error(`Tải ảnh thất bại: ${uploadError.message}`);
            }
        }

        // Step 2: Build conversationId and validate order data
        const facebookName = order.Facebook_UserName;
        const facebookASUserId = order.Facebook_ASUserId;
        const facebookCommentId = order.Facebook_CommentId;
        const facebookPostId = order.Facebook_PostId;

        if (!facebookName || !facebookASUserId || !facebookCommentId || !facebookPostId) {
            throw new Error('Thiếu thông tin: Facebook_UserName, Facebook_ASUserId, Facebook_CommentId, hoặc Facebook_PostId');
        }

        // Use channelId from dropdown selection, or extract from order if not available
        const pageId = channelId || facebookPostId.split('_')[0];
        console.log('[COMMENT] Using pageId from selection:', pageId, '(channelId param:', channelId, ')');

        // For message_id: use parentCommentId if replying to specific comment, otherwise use order's comment ID
        let messageId;
        if (parentCommentId) {
            // Replying to a specific comment - use parentCommentId
            messageId = parentCommentId;
            console.log('[COMMENT] Using parentCommentId as messageId:', messageId);
        } else {
            // Replying to root comment or no specific parent - use order's comment ID
            const commentIds = facebookCommentId.split(',').map(id => id.trim());
            messageId = commentIds[0];
            console.log('[COMMENT] Using order comment ID as messageId:', messageId);
        }

        // IMPORTANT: For private_replies, conversationId MUST equal message_id!
        // This matches the real Pancake API format (e.g., both are "1573633073980967_1544674883102468")
        const finalConversationId = messageId;

        console.log('[COMMENT] Message ID:', messageId);
        console.log('[COMMENT] ConversationId (same as messageId):', finalConversationId);
        console.log('[COMMENT] Param conversationId:', conversationId);

        // Step 3: Fetch inbox_preview to get thread_id_preview and thread_key_preview
        let threadId = null;
        let threadKey = null;
        const fromId = facebookASUserId;

        if (customerId && window.pancakeDataManager) {
            try {
                console.log('[COMMENT] Fetching inbox_preview for thread IDs...');
                showChatSendingIndicator('Đang lấy thông tin thread...');
                const inboxPreview = await window.pancakeDataManager.fetchInboxPreview(pageId, customerId);
                if (inboxPreview.success) {
                    threadId = inboxPreview.threadId || null;
                    threadKey = inboxPreview.threadKey || null;
                    console.log('[COMMENT] ✅ Got thread IDs from inbox_preview:', { threadId, threadKey });
                } else {
                    console.warn('[COMMENT] ⚠️ inbox_preview returned unsuccessfully, using null thread IDs');
                }
            } catch (inboxError) {
                console.warn('[COMMENT] ⚠️ Could not fetch inbox_preview, using null thread IDs:', inboxError.message);
            }
        } else {
            console.warn('[COMMENT] ⚠️ Missing customerId or pancakeDataManager, using null thread IDs');
        }

        console.log('[COMMENT] Using data:', {
            pageId,
            conversationId: finalConversationId,
            fromId,
            threadId: threadId || 'null',
            threadKey: threadKey || 'null'
        });

        // Step 4: Send private_replies via Official API (pages.fm)
        // Ref: https://developer.pancake.biz/#/paths/pages-page_id--conversations--conversation_id--messages/post
        // private_replies: gửi tin nhắn riêng từ comment (chỉ Facebook/Instagram)
        showChatSendingIndicator('Đang gửi tin nhắn riêng...');

        const apiUrl = window.API_CONFIG.buildUrl.pancakeOfficial(
            `pages/${pageId}/conversations/${finalConversationId}/messages`,
            pageAccessToken
        ) + (customerId ? `&customer_id=${customerId}` : '');

        // Prepare private_replies payload (JSON) - theo API chính thức
        // Required fields: action, post_id, message_id, from_id, message
        const privateRepliesPayload = {
            action: 'private_replies',
            post_id: facebookPostId,
            message_id: messageId,
            from_id: fromId,
            message: message
        };

        // Add image nếu có - dùng content_ids (array) theo API chính thức
        if (imageData) {
            const contentId = imageData.content_id || imageData.id;
            if (contentId) {
                privateRepliesPayload.content_ids = [contentId];
                privateRepliesPayload.attachment_type = 'PHOTO';
            }
        }

        console.log('[COMMENT] Sending private_replies...');
        console.log('[COMMENT] Payload:', JSON.stringify(privateRepliesPayload));

        // Send single request (không cần gửi 2 API song song như trước)
        let privateRepliesSuccess = false;

        try {
            const response = await API_CONFIG.smartFetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(privateRepliesPayload)
            }, 1, true); // maxRetries=1, skipFallback=true: chỉ gọi 1 lần, không retry

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`private_replies failed: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            if (data.success === false) {
                throw new Error(`private_replies API error: ${data.error || data.message || 'Unknown'}`);
            }

            console.log('[COMMENT] ✅ private_replies succeeded:', data);
            privateRepliesSuccess = true;
        } catch (err) {
            console.warn('[COMMENT] ❌ private_replies failed:', err.message);
        }

        // Check result
        if (!privateRepliesSuccess) {
            throw new Error('Gửi tin nhắn riêng thất bại (private_replies)');
        }

        console.log('[COMMENT] ✅ private_replies succeeded!');

        // Step 6: Optimistic UI update
        const now = new Date().toISOString();
        skipWebhookUpdate = true;

        const tempComment = {
            Id: `temp_${Date.now()}`,
            Message: message,
            From: {
                Name: 'Me',
                Id: channelId
            },
            CreatedTime: now,
            is_temp: true,
            ParentId: parentCommentId
        };

        window.allChatComments.push(tempComment);
        renderComments(window.allChatComments, true);

        console.log('[COMMENT] Added optimistic comment to UI');

        // Step 6: Refresh comments from API
        setTimeout(async () => {
            try {
                if (window.currentChatPSID) {
                    const response = await window.chatDataManager.fetchComments(channelId, window.currentChatPSID);
                    if (response.comments && response.comments.length > 0) {
                        window.allChatComments = window.allChatComments.filter(c => !c.is_temp);

                        response.comments.forEach(newComment => {
                            const exists = window.allChatComments.some(c => c.Id === newComment.Id);
                            if (!exists) {
                                window.allChatComments.push(newComment);
                            }
                        });

                        renderComments(window.allChatComments, false);
                        console.log('[COMMENT] Replaced temp comments with real data');
                    }
                }
            } finally {
                skipWebhookUpdate = false;
            }
        }, 300);

        // Success notification
        if (window.notificationManager) {
            window.notificationManager.show('✅ Đã gửi tin nhắn riêng thành công!', 'success');
        }

        console.log('[COMMENT] ✅ Sent successfully!');

    } catch (error) {
        console.error('[COMMENT] ❌ Error:', error);
        if (window.notificationManager) {
            window.notificationManager.show('❌ Lỗi khi gửi bình luận: ' + error.message, 'error');
        } else {
            alert('❌ Lỗi khi gửi bình luận: ' + error.message);
        }
        throw error;
    }
}

/**
 * Handle click on "Trả lời" button in comment list
 * @param {string} commentId - ID of the comment being replied to
 * @param {string} postId - Post ID of the comment
 */
function handleReplyToComment(commentId, postId) {
    console.log(`[CHAT] Replying to comment: ${commentId}, post: ${postId}`);

    // Set current parent comment ID
    // Look up the comment in allChatComments to get the full object
    // Support both uppercase (Id) and lowercase (id) field names from Pancake API
    const comment = window.allChatComments.find(c => (c.Id || c.id) === commentId);

    if (comment) {
        // Use helper to get the correct ID (FacebookId, OriginalId, etc.)
        currentParentCommentId = getFacebookCommentId(comment);
        console.log(`[CHAT] Selected parent comment ID: ${currentParentCommentId} (from ${comment.Id})`);
    } else {
        // Fallback if comment not found in local list (shouldn't happen often)
        currentParentCommentId = commentId;
        console.warn(`[CHAT] Could not find comment object for ${commentId}, using raw ID`);
    }

    // Set current post ID (if available)
    if (postId && postId !== 'undefined' && postId !== 'null') {
        currentPostId = postId;
    } else {
        currentPostId = null;
    }

    // Show reply preview
    const previewContainer = document.getElementById('chatReplyPreviewContainer');
    const previewText = document.getElementById('chatReplyPreviewText');

    if (previewContainer && previewText && comment) {
        // Extract comment text (handle both text and HTML)
        let commentText = comment.Message || comment.message || comment.text || '';

        // If HTML, extract text content
        if (commentText.includes('<')) {
            const div = document.createElement('div');
            div.innerHTML = commentText;
            commentText = div.textContent || div.innerText || '';
        }

        // Get sender name and Facebook ID
        const senderName = comment.FromName || comment.from?.name || 'Khách hàng';
        const fbId = comment.From?.id || comment.from?.id || comment.FromId || null;

        // Get timestamp (use CreatedTime or updated_at)
        const timestamp = comment.CreatedTime || comment.updated_at || comment.created_at;
        let timeStr = '';
        if (timestamp) {
            const date = new Date(timestamp);
            // Format: DD/MM/YYYY HH:mm
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            timeStr = `${day}/${month}/${year} ${hours}:${minutes}`;
        }

        // Verify fb_id matches current conversation's customer (if available)
        if (fbId && window.currentChatPSID && fbId !== window.currentChatPSID) {
            console.warn('[REPLY] ⚠️ Facebook ID mismatch!', {
                commentFbId: fbId,
                conversationPSID: window.currentChatPSID
            });
        }

        // Show preview with sender name and truncated message
        const maxLength = 100;
        const truncatedText = commentText.length > maxLength
            ? commentText.substring(0, maxLength) + '...'
            : commentText;

        // Display with timestamp
        previewText.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; gap: 8px;">
                <div style="flex: 1; min-width: 0;">
                    <strong>${senderName}:</strong> ${truncatedText}
                </div>
                ${timeStr ? `<div style="color: #6b7280; font-size: 12px; white-space: nowrap; flex-shrink: 0;">${timeStr}</div>` : ''}
            </div>
        `;
        previewContainer.style.display = 'block';

        console.log('[REPLY] Showing preview for comment:', senderName, 'fb_id:', fbId, truncatedText, 'at', timeStr);
    }

    // Focus input and enable it for replying
    const input = document.getElementById('chatReplyInput');
    const sendBtn = document.getElementById('chatSendBtn');

    if (input) {
        // Enable input and send button
        input.disabled = false;
        input.style.cursor = 'text';
        input.style.background = '#f9fafb';
        input.focus();
        input.placeholder = `Nhập nội dung trả lời...`;

        // Enable send button
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.style.opacity = '1';
            sendBtn.style.cursor = 'pointer';
        }

        // Add visual feedback (optional)
        input.style.borderColor = '#3b82f6';
        setTimeout(() => {
            input.style.borderColor = '#d1d5db';
        }, 1000);
    }
}

function renderChatMessages(messages, scrollToBottom = false) {
    const modalBody = document.getElementById('chatModalBody');

    if (!messages || messages.length === 0) {
        modalBody.innerHTML = `
            <div class="chat-empty">
                <i class="fas fa-comments"></i>
                <p>Chưa có tin nhắn</p>
            </div>`;
        return;
    }

    // Format time helper - use global formatTimeVN
    const formatTime = window.formatTimeVN;

    // Sort messages by timestamp - oldest first (newest at bottom like Messenger/Zalo)
    const sortedMessages = messages.slice().sort((a, b) => {
        const timeA = new Date(a.inserted_at || a.CreatedTime || 0).getTime();
        const timeB = new Date(b.inserted_at || b.CreatedTime || 0).getTime();
        return timeA - timeB; // Ascending: oldest first, newest last (at bottom)
    });

    // Initialize map to store messages by ID for reply functionality
    if (!window.chatMessagesById) {
        window.chatMessagesById = {};
    }

    const messagesHTML = sortedMessages.map(msg => {
        // Store message in map for reply button lookup
        const msgId = msg.id || msg.Id || null;
        if (msgId) {
            window.chatMessagesById[msgId] = msg;
        }
        // Determine isOwner by comparing from.id with page_id (Pancake API format)
        const pageId = window.currentChatChannelId || msg.page_id || null;
        const fromId = msg.from?.id || msg.FromId || null;
        const isOwner = msg.IsOwner !== undefined ? msg.IsOwner : (fromId === pageId);
        const alignClass = isOwner ? 'chat-message-right' : 'chat-message-left';
        const bgClass = isOwner ? 'chat-bubble-owner' : 'chat-bubble-customer';

        // Get avatar URL - prioritize direct URL from Pancake API
        const cachedToken = window.pancakeTokenManager?.token || null;
        // Check for direct avatar URL from Pancake (avatar, picture, profile_picture fields)
        const directAvatar = msg.from?.avatar || msg.from?.picture || msg.from?.profile_picture || msg.avatar || null;
        const avatarUrl = window.pancakeDataManager?.getAvatarUrl(fromId, pageId, cachedToken, directAvatar) ||
            'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="%23e5e7eb"/><circle cx="20" cy="15" r="7" fill="%239ca3af"/><ellipse cx="20" cy="32" rx="11" ry="8" fill="%239ca3af"/></svg>';
        const senderName = msg.from?.name || msg.FromName || '';

        // Debug: log ALL messages with reactions data to identify format
        const hasReactionData = msg.reactions || msg.reaction_summary;
        if (hasReactionData) {
            console.log('[CHAT REACTIONS DEBUG] Message with reactions:', {
                messageId: msg.id || msg.Id,
                senderName: senderName,
                reactions: msg.reactions,
                reaction_summary: msg.reaction_summary,
                allReactionFields: Object.keys(msg).filter(key => key.toLowerCase().includes('react'))
            });
        } else {
            // Log first message even without reactions to see full structure
            if (sortedMessages.indexOf(msg) === 0) {
                console.log('[CHAT REACTIONS DEBUG] First message (no reactions):', {
                    allFields: Object.keys(msg),
                    fullMessage: msg
                });
            }
        }
        // Admin name for page messages (Pancake API returns from.admin_name for staff-sent messages)
        const adminName = msg.from?.admin_name || null;

        // Get message text - prioritize original_message (plain text from Pancake API)
        let messageText = msg.original_message || msg.message || msg.Message || '';

        // If message is HTML (from Pancake's "message" field), strip HTML tags
        if (messageText && messageText.includes('<div>')) {
            messageText = messageText.replace(/<[^>]*>/g, '').trim();
        }

        let content = '';
        if (messageText) {
            // Escape HTML to prevent XSS but preserve emoji and special characters
            // Only escape < and > to prevent HTML injection
            let escapedMessage = messageText
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>')
                .replace(/\r/g, '');

            // Convert URLs to clickable links
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            escapedMessage = escapedMessage.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;">$1</a>');

            content = `<p class="chat-message-text" style="word-wrap: break-word; white-space: pre-wrap;">${escapedMessage}</p>`;
        }

        // Handle attachments (images and audio)
        if (msg.Attachments && msg.Attachments.length > 0) {
            msg.Attachments.forEach(att => {
                if (att.Type === 'image' && att.Payload && att.Payload.Url) {
                    content += `<img src="${att.Payload.Url}" class="chat-message-image" loading="lazy" />`;
                } else if (att.Type === 'audio' && att.Payload && att.Payload.Url) {
                    content += `
                        <div class="chat-audio-message">
                            <i class="fas fa-microphone" style="color: #3b82f6; margin-right: 8px;"></i>
                            <audio controls style="max-width: 100%; height: 32px;">
                                <source src="${att.Payload.Url}" type="audio/mp4">
                                Trình duyệt không hỗ trợ phát audio
                            </audio>
                        </div>`;
                }
            });
        }

        // Handle Pancake API format attachments (lowercase 'attachments')
        if (msg.attachments && msg.attachments.length > 0) {
            // Collect all images first for grid layout
            const images = [];

            msg.attachments.forEach(att => {
                // Collect images
                if (att.type === 'photo' && att.url) {
                    images.push(att.url);
                } else if (att.mime_type && att.mime_type.startsWith('image/') && att.file_url) {
                    images.push(att.file_url);
                }
            });

            // Render images in grid if multiple
            if (images.length > 0) {
                const gridClass = images.length === 1 ? 'chat-image-grid-single' :
                    images.length === 2 ? 'chat-image-grid-two' :
                        images.length === 3 ? 'chat-image-grid-three' :
                            'chat-image-grid-multi';

                content += `<div class="chat-image-grid ${gridClass}">`;
                images.forEach((imageUrl, idx) => {
                    const escapedUrl = imageUrl.replace(/'/g, "\\'");
                    content += `<img src="${imageUrl}"
                        class="chat-grid-image"
                        loading="lazy"
                        onclick="showImageZoom('${escapedUrl}', 'Ảnh ${idx + 1}/${images.length}')"
                        title="Click để phóng to" />`;
                });
                content += `</div>`;
            }

            // Now process other attachments
            msg.attachments.forEach(att => {
                // Skip images (already rendered)
                if ((att.type === 'photo' && att.url) ||
                    (att.mime_type && att.mime_type.startsWith('image/') && att.file_url)) {
                    return;
                }

                // Replied Message (Quoted message)
                if (att.type === 'replied_message') {
                    // Debug: Log replied_message structure to find the correct ID field
                    console.log('[REPLIED_MESSAGE] Full attachment object:', JSON.stringify(att, null, 2));

                    const quotedText = att.message || '';
                    const quotedFrom = att.from?.name || att.from?.admin_name || 'Unknown';
                    const quotedHasAttachment = att.attachments && att.attachments.length > 0;
                    const quotedMessageId = att.id || att.message_id || att.mid || '';

                    console.log('[REPLIED_MESSAGE] Extracted ID:', quotedMessageId, 'from fields:', {
                        'att.id': att.id,
                        'att.message_id': att.message_id,
                        'att.mid': att.mid
                    });

                    // Build attachment preview content
                    let attachmentPreview = '';
                    if (quotedHasAttachment) {
                        att.attachments.forEach(qAtt => {
                            // Image attachment
                            if ((qAtt.type === 'photo' && qAtt.url) ||
                                (qAtt.mime_type && qAtt.mime_type.startsWith('image/') && qAtt.file_url)) {
                                const imgUrl = qAtt.url || qAtt.file_url;
                                attachmentPreview += `
                                    <div style="margin-top: 4px;">
                                        <img src="${imgUrl}" style="max-width: 80px; max-height: 60px; border-radius: 4px; object-fit: cover;" loading="lazy" />
                                    </div>`;
                            }
                            // Audio attachment
                            else if (qAtt.mime_type === 'audio/mp4' && qAtt.file_url) {
                                attachmentPreview += `
                                    <div style="margin-top: 4px; display: flex; align-items: center; color: #6b7280; font-size: 11px;">
                                        <i class="fas fa-microphone" style="margin-right: 4px;"></i>
                                        <span>Tin nhắn thoại</span>
                                    </div>`;
                            }
                            // Video attachment
                            else if ((qAtt.type === 'video_inline' || qAtt.type === 'video_direct_response' || qAtt.type === 'video') && qAtt.url) {
                                attachmentPreview += `
                                    <div style="margin-top: 4px; display: flex; align-items: center; color: #6b7280; font-size: 11px;">
                                        <i class="fas fa-video" style="margin-right: 4px;"></i>
                                        <span>Video</span>
                                    </div>`;
                            }
                            // Sticker attachment
                            else if (qAtt.type === 'sticker' && (qAtt.url || qAtt.file_url)) {
                                const stickerUrl = qAtt.url || qAtt.file_url;
                                attachmentPreview += `
                                    <div style="margin-top: 4px;">
                                        <img src="${stickerUrl}" style="max-width: 50px; max-height: 50px;" loading="lazy" />
                                    </div>`;
                            }
                            // File attachment
                            else if (qAtt.type === 'file' || (qAtt.mime_type && qAtt.file_url)) {
                                const fileName = qAtt.name || 'Tệp đính kèm';
                                attachmentPreview += `
                                    <div style="margin-top: 4px; display: flex; align-items: center; color: #6b7280; font-size: 11px;">
                                        <i class="fas fa-file" style="margin-right: 4px;"></i>
                                        <span>${fileName}</span>
                                    </div>`;
                            }
                            // Generic attachment fallback
                            else if (!attachmentPreview) {
                                attachmentPreview += `
                                    <div style="margin-top: 4px; display: flex; align-items: center; color: #6b7280; font-size: 11px;">
                                        <i class="fas fa-paperclip" style="margin-right: 4px;"></i>
                                        <span>Tệp đính kèm</span>
                                    </div>`;
                            }
                        });
                    }

                    // Display text content (if any)
                    const textContent = quotedText ? `<div style="font-size: 12px; color: #374151;">${quotedText}</div>` : '';
                    const displayContent = textContent || attachmentPreview || '<div style="font-size: 12px; color: #9ca3af;">[Không có nội dung]</div>';

                    // Add click handler if we have a message ID
                    const clickHandler = quotedMessageId ? `onclick="window.scrollToMessage('${quotedMessageId}')"` : '';
                    const cursorStyle = quotedMessageId ? 'cursor: pointer;' : '';

                    content = `
                        <div class="quoted-message" ${clickHandler} style="background: #f3f4f6; border-left: 3px solid #3b82f6; padding: 8px 10px; margin-bottom: 8px; border-radius: 4px; ${cursorStyle} transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#e5e7eb'" onmouseout="this.style.backgroundColor='#f3f4f6'">
                            <div style="font-size: 11px; color: #6b7280; margin-bottom: 2px;">
                                <i class="fas fa-reply" style="margin-right: 4px;"></i>${quotedFrom}
                            </div>
                            ${displayContent}
                            ${textContent && attachmentPreview ? attachmentPreview : ''}
                        </div>
                    ` + content;
                    return;
                }

                // Debug: Log attachment structure to identify sticker format
                if (att.type === 'sticker' || att.sticker_id || att.type === 'animated_image_share') {
                    console.log('[DEBUG STICKER] Attachment object:', JSON.stringify(att, null, 2));
                }

                // Audio: mime_type = "audio/mp4", file_url
                if (att.mime_type === 'audio/mp4' && att.file_url) {
                    content += `
                        <div class="chat-audio-message" style="display: flex; align-items: center; background: #f3f4f6; padding: 10px 14px; border-radius: 20px; margin-top: 8px;">
                            <i class="fas fa-microphone" style="color: #3b82f6; margin-right: 10px; font-size: 16px;"></i>
                            <audio controls style="height: 36px; flex: 1;">
                                <source src="${att.file_url}" type="audio/mp4">
                                Trình duyệt không hỗ trợ phát audio
                            </audio>
                        </div>`;
                }
                // Link attachment with comment (private reply preview from Pancake)
                else if (att.type === 'link' && att.comment) {
                    const commentFrom = att.comment.from || '';
                    const commentContent = att.comment.content || '';
                    const postName = att.name || '';
                    const postUrl = att.url || '#';
                    // Show post thumbnail if available
                    const thumbnail = att.post_attachments?.[0]?.url || '';
                    content += `
                        <div class="chat-link-attachment" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-top: 8px; overflow: hidden;">
                            ${thumbnail ? `<img src="${thumbnail}" style="width: 100%; max-height: 120px; object-fit: cover; border-bottom: 1px solid #e2e8f0;" loading="lazy" />` : ''}
                            <div style="padding: 10px 12px;">
                                <p style="font-size: 12px; color: #64748b; margin: 0 0 4px 0;"><i class="fas fa-comment" style="margin-right: 6px;"></i>Bình luận từ ${commentFrom}</p>
                                <p style="font-size: 13px; color: #1e293b; margin: 0 0 6px 0; font-weight: 500;">"${commentContent}"</p>
                                <a href="${postUrl}" target="_blank" style="font-size: 11px; color: #3b82f6; text-decoration: none; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <i class="fas fa-external-link-alt" style="margin-right: 4px;"></i>${postName || 'Xem bài viết'}
                                </a>
                            </div>
                        </div>`;
                }
                // Video attachment
                else if ((att.type === 'video_inline' || att.type === 'video_direct_response' || att.type === 'video') && att.url) {
                    content += `
                        <div class="chat-video-attachment" style="margin-top: 8px;">
                            <img src="${att.url}" style="max-width: 100%; border-radius: 8px; cursor: pointer;" onclick="window.open('${att.url}', '_blank')" loading="lazy" />
                        </div>`;
                }
                // Sticker attachment from Messenger (type = 'sticker')
                else if (att.type === 'sticker' && (att.url || att.file_url)) {
                    const stickerUrl = att.url || att.file_url;
                    content += `
                        <div class="chat-sticker-message" style="margin-top: 8px;">
                            <img src="${stickerUrl}"
                                 alt="Sticker"
                                 style="max-width: 150px; max-height: 150px;"
                                 loading="lazy"
                                 onerror="this.style.display='none'; this.parentElement.innerHTML='<span style=\\'color:#9ca3af;\\'>🧸 Sticker</span>';" />
                        </div>`;
                }
                // Sticker with sticker_id (alternative Pancake format)
                else if (att.sticker_id && (att.url || att.file_url)) {
                    const stickerUrl = att.url || att.file_url;
                    content += `
                        <div class="chat-sticker-message" style="margin-top: 8px;">
                            <img src="${stickerUrl}"
                                 alt="Sticker"
                                 style="max-width: 150px; max-height: 150px;"
                                 loading="lazy"
                                 onerror="this.style.display='none'; this.parentElement.innerHTML='<span style=\\'color:#9ca3af;\\'>🧸 Sticker</span>';" />
                        </div>`;
                }
                // Animated sticker (GIF format)
                else if (att.type === 'animated_image_share' && (att.url || att.file_url)) {
                    const gifUrl = att.url || att.file_url;
                    content += `
                        <div class="chat-sticker-message" style="margin-top: 8px;">
                            <img src="${gifUrl}"
                                 alt="GIF Sticker"
                                 style="max-width: 200px; max-height: 200px; border-radius: 8px;"
                                 loading="lazy" />
                        </div>`;
                }
            });
        }

        // Handle reactions display
        let reactionsHTML = '';

        // Collect reactions from attachments (Pancake API format)
        const reactionAttachments = [];
        if (msg.attachments && msg.attachments.length > 0) {
            msg.attachments.forEach(att => {
                if (att.type === 'reaction' && att.emoji) {
                    reactionAttachments.push(att.emoji);
                }
            });
        }

        // Collect reactions from msg.reactions or msg.reaction_summary
        const reactions = msg.reactions || msg.reaction_summary;
        const reactionsArray = [];

        if (reactions && Object.keys(reactions).length > 0) {
            const reactionIcons = {
                'LIKE': '👍',
                'LOVE': '❤️',
                'HAHA': '😆',
                'WOW': '😮',
                'SAD': '😢',
                'ANGRY': '😠',
                'CARE': '🤗'
            };

            Object.entries(reactions)
                .filter(([type, count]) => count > 0)
                .forEach(([type, count]) => {
                    const emoji = reactionIcons[type] || '👍';
                    reactionsArray.push(`<span style="display: inline-flex; align-items: center; background: #fef3c7; padding: 2px 8px; border-radius: 12px; font-size: 12px; margin-right: 4px;">
                        ${emoji} ${count > 1 ? count : ''}
                    </span>`);
                });
        }

        // Add reactions from attachments
        if (reactionAttachments.length > 0) {
            reactionAttachments.forEach(emoji => {
                reactionsArray.push(`<span style="display: inline-flex; align-items: center; background: #fef3c7; padding: 2px 8px; border-radius: 12px; font-size: 14px; margin-right: 4px;">
                    ${emoji}
                </span>`);
            });
        }

        // Build final reactions HTML
        if (reactionsArray.length > 0) {
            reactionsHTML = `<div style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px;">${reactionsArray.join('')}</div>`;
        }

        // Reply button for customer messages
        const messageId = msg.id || msg.Id || null;
        const replyButton = !isOwner && messageId ? `
            <span class="message-reply-btn"
                  onclick="window.setReplyMessageById('${messageId}')"
                  style="cursor: pointer; color: #3b82f6; margin-left: 8px; font-weight: 500;">
                Trả lời
            </span>
        ` : '';

        // Avatar HTML - only show for customer messages (not owner)
        const avatarHTML = !isOwner ? `
            <img src="${avatarUrl}"
                 alt="${senderName}"
                 title="Click để phóng to - ${senderName}"
                 class="avatar-loading chat-avatar-clickable"
                 style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; flex-shrink: 0; margin-right: 12px; border: 2px solid #e5e7eb; background: #f3f4f6; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;"
                 onmouseover="this.style.transform='scale(1.1)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.2)'"
                 onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none'"
                 onclick="openAvatarZoom('${avatarUrl}', '${senderName.replace(/'/g, "\\'")}'); event.stopPropagation();"
                 onload="this.classList.remove('avatar-loading')"
                 onerror="this.classList.remove('avatar-loading'); this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 48 48%22><circle cx=%2224%22 cy=%2224%22 r=%2224%22 fill=%22%23e5e7eb%22/><circle cx=%2224%22 cy=%2218%22 r=%228%22 fill=%22%239ca3af%22/><ellipse cx=%2224%22 cy=%2238%22 rx=%2213%22 ry=%2210%22 fill=%22%239ca3af%22/></svg>'"
            />
        ` : '';

        return `
            <div class="chat-message ${alignClass}" style="display: flex; align-items: flex-start;">
                ${!isOwner ? avatarHTML : ''}
                <div style="flex: 1; ${isOwner ? 'display: flex; justify-content: flex-end;' : ''}">
                    <div class="chat-bubble ${bgClass}">
                        ${!isOwner && senderName ? `<p style="font-size: 11px; font-weight: 600; color: #6b7280; margin: 0 0 4px 0;">${senderName}</p>` : ''}
                        ${isOwner && adminName ? `<p style="font-size: 10px; font-weight: 500; color: #9ca3af; margin: 0 0 4px 0; text-align: right;"><i class="fas fa-user-tie" style="margin-right: 4px; font-size: 9px;"></i>${adminName}</p>` : ''}
                        ${content}
                        ${reactionsHTML}
                        <p class="chat-message-time">
                            ${formatTime(msg.inserted_at || msg.CreatedTime)}
                            ${replyButton}
                        </p>
                    </div>
                </div>
            </div>`;
    }).join('');

    // Add loading indicator at top based on pagination state
    let loadingIndicator = '';
    if (currentChatCursor) {
        // Still have more messages to load
        loadingIndicator = `
            <div id="chatLoadMoreIndicator" style="
                text-align: center;
                padding: 16px 12px;
                color: #6b7280;
                font-size: 13px;
                background: linear-gradient(to bottom, #f9fafb 0%, transparent 100%);
                border-bottom: 1px solid #e5e7eb;
                margin-bottom: 8px;
            ">
                <i class="fas fa-arrow-up" style="margin-right: 6px; color: #3b82f6;"></i>
                <span style="font-weight: 500;">Cuộn lên để tải thêm tin nhắn</span>
            </div>`;
    } else if (window.allChatMessages.length > 0 && !currentChatCursor) {
        // No more messages (reached the beginning)
        loadingIndicator = `
            <div style="
                text-align: center;
                padding: 16px 12px;
                color: #9ca3af;
                font-size: 12px;
                background: #f9fafb;
                border-bottom: 1px solid #e5e7eb;
                margin-bottom: 8px;
            ">
                <i class="fas fa-check-circle" style="margin-right: 6px; color: #10b981;"></i>
                Đã tải hết tin nhắn cũ
            </div>`;
    }

    // Check if user is at bottom before render (within 100px threshold)
    // CHANGED: Check scrollToBottom parameter OR current position
    const wasAtBottom = scrollToBottom || (modalBody.scrollHeight - modalBody.scrollTop - modalBody.clientHeight < 100);
    const previousScrollHeight = modalBody.scrollHeight;
    const previousScrollTop = modalBody.scrollTop;

    modalBody.innerHTML = `<div class="chat-messages-container">${loadingIndicator}${messagesHTML}</div>`;

    // Only auto-scroll if explicitly requested OR user was already at bottom
    if (wasAtBottom) {
        // Use requestAnimationFrame to ensure DOM has updated before scrolling
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                modalBody.scrollTop = modalBody.scrollHeight;
                // Hide new message indicator when scrolled to bottom
                const indicator = document.getElementById('chatNewMessageIndicator');
                if (indicator) indicator.style.display = 'none';
            });
        });
    } else {
        // Preserve scroll position (adjust for new content added at top)
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const newScrollHeight = modalBody.scrollHeight;
                const heightDiff = newScrollHeight - previousScrollHeight;
                modalBody.scrollTop = previousScrollTop + heightDiff;

                // Show new message indicator if there's new content at bottom
                if (heightDiff > 0) {
                    showNewMessageIndicator();
                }
            });
        });
    }
}

function renderComments(comments, scrollToBottom = false) {
    const modalBody = document.getElementById('chatModalBody');

    if (!comments || comments.length === 0) {
        modalBody.innerHTML = `
            <div class="chat-empty">
                <i class="fas fa-comments"></i>
                <p>Chưa có bình luận</p>
            </div>`;
        return;
    }

    // Format time helper - use global formatTimeVN
    const formatTime = window.formatTimeVN;

    // Sort comments by timestamp - oldest first (newest at bottom like Messenger/Zalo)
    const sortedComments = comments.slice().sort((a, b) => {
        const timeA = new Date(a.CreatedTime || a.updated_at || a.created_at || 0).getTime();
        const timeB = new Date(b.CreatedTime || b.updated_at || b.created_at || 0).getTime();
        return timeA - timeB; // Ascending: oldest first, newest last (at bottom)
    });

    // Helper function to check if comment is the purchase comment
    const isPurchaseComment = (comment) => {
        if (!window.purchaseCommentId) return false;

        // Get comment ID (handle different formats)
        const commentId = comment.FacebookId || comment.OriginalId || comment.Id || comment.id;

        // Facebook_CommentId format: "postId_commentId" (e.g., "1672237127083024_2168976250601862")
        // Extract just the comment ID part for comparison
        const purchaseIdParts = window.purchaseCommentId.split('_');
        const purchaseCommentOnlyId = purchaseIdParts.length > 1 ? purchaseIdParts[purchaseIdParts.length - 1] : window.purchaseCommentId;

        // Check if this comment matches the purchase comment
        if (commentId === window.purchaseCommentId) return true;
        if (commentId === purchaseCommentOnlyId) return true;

        // Also check if commentId contains the purchase comment ID
        if (commentId && commentId.includes(purchaseCommentOnlyId)) return true;

        // Check full format match (postId_commentId)
        // Support both uppercase (PostId) and lowercase (post_id) field names from Pancake API
        const fullCommentId = `${comment.PostId || comment.post_id || ''}_${commentId}`;
        if (fullCommentId === window.purchaseCommentId) return true;

        return false;
    };

    const commentsHTML = sortedComments.map(comment => {
        // Handle both old format (IsOwner) and Pancake API format (is_owner)
        const isOwner = comment.IsOwner || comment.is_owner || false;
        const alignClass = isOwner ? 'chat-message-right' : 'chat-message-left';
        const bgClass = isOwner ? 'chat-bubble-owner' : 'chat-bubble-customer';

        // Get avatar URL for comments (same logic as messages)
        const cachedToken = window.pancakeTokenManager?.token || null;
        const pageId = window.currentChatChannelId || comment.page_id || null;
        const fromId = comment.from?.id || comment.FromId || null;
        const directAvatar = comment.from?.avatar || comment.from?.picture || comment.from?.profile_picture || comment.avatar || null;
        const avatarUrl = window.pancakeDataManager?.getAvatarUrl(fromId, pageId, cachedToken, directAvatar) ||
            'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="%23e5e7eb"/><circle cx="20" cy="15" r="7" fill="%239ca3af"/><ellipse cx="20" cy="32" rx="11" ry="8" fill="%239ca3af"/></svg>';
        const senderName = comment.from?.name || comment.FromName || '';

        // Check if this is the purchase comment (comment where user made the order)
        const isPurchase = isPurchaseComment(comment);
        const purchaseHighlightClass = isPurchase ? 'purchase-comment-highlight' : '';
        const purchaseBadge = isPurchase ? '<span class="purchase-badge"><i class="fas fa-shopping-cart"></i> Bình luận đặt hàng</span>' : '';

        let content = '';
        // Handle both old format (Message) and Pancake API format (message)
        const messageText = comment.Message || comment.message || '';
        if (messageText) {
            content = `<p class="chat-message-text">${messageText}</p>`;
        }

        // Handle attachments (images and audio) for comments
        if (comment.Attachments && comment.Attachments.length > 0) {
            comment.Attachments.forEach(att => {
                if (att.Type === 'image' && att.Payload && att.Payload.Url) {
                    content += `<img src="${att.Payload.Url}" class="chat-message-image" loading="lazy" />`;
                } else if (att.Type === 'audio' && att.Payload && att.Payload.Url) {
                    content += `
                        <div class="chat-audio-message">
                            <i class="fas fa-microphone" style="color: #3b82f6; margin-right: 8px;"></i>
                            <audio controls style="max-width: 100%; height: 32px;">
                                <source src="${att.Payload.Url}" type="audio/mp4">
                                Trình duyệt không hỗ trợ phát audio
                            </audio>
                        </div>`;
                }
            });
        }

        // Handle Pancake API format attachments for comments
        if (comment.attachments && comment.attachments.length > 0) {
            comment.attachments.forEach(att => {
                if (att.mime_type === 'audio/mp4' && att.file_url) {
                    content += `
                        <div class="chat-audio-message">
                            <i class="fas fa-microphone" style="color: #3b82f6; margin-right: 8px;"></i>
                            <audio controls style="max-width: 100%; height: 32px;">
                                <source src="${att.file_url}" type="audio/mp4">
                                Trình duyệt không hỗ trợ phát audio
                            </audio>
                        </div>`;
                } else if (att.mime_type && att.mime_type.startsWith('image/') && att.file_url) {
                    content += `<img src="${att.file_url}" class="chat-message-image" loading="lazy" />`;
                }
            });
        }

        // Status badge for unread comments
        const statusBadge = comment.Status === 30
            ? '<span style="background: #f59e0b; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-left: 8px;">Mới</span>'
            : '';

        // Render nested replies if any
        let repliesHTML = '';
        if (comment.Messages && comment.Messages.length > 0) {
            repliesHTML = comment.Messages.map(reply => {
                // Handle both old format (IsOwner) and Pancake API format (is_owner)
                const replyIsOwner = reply.IsOwner || reply.is_owner || false;
                const replyAlignClass = replyIsOwner ? 'chat-message-right' : 'chat-message-left';
                const replyBgClass = replyIsOwner ? 'chat-bubble-owner' : 'chat-bubble-customer';

                // Get avatar URL for reply
                const replyFromId = reply.from?.id || reply.FromId || null;
                const replyDirectAvatar = reply.from?.avatar || reply.from?.picture || reply.from?.profile_picture || reply.avatar || null;
                const replyAvatarUrl = window.pancakeDataManager?.getAvatarUrl(replyFromId, pageId, cachedToken, replyDirectAvatar) ||
                    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="%23e5e7eb"/><circle cx="20" cy="15" r="7" fill="%239ca3af"/><ellipse cx="20" cy="32" rx="11" ry="8" fill="%239ca3af"/></svg>';
                const replySenderName = reply.from?.name || reply.FromName || '';

                let replyContent = '';
                // Handle both old format (Message) and Pancake API format (message)
                const replyMessageText = reply.Message || reply.message || '';
                if (replyMessageText) {
                    replyContent = `<p class="chat-message-text">${replyMessageText}</p>`;
                }

                // Handle attachments in replies
                if (reply.Attachments && reply.Attachments.length > 0) {
                    reply.Attachments.forEach(att => {
                        if (att.Type === 'image' && att.Payload && att.Payload.Url) {
                            replyContent += `<img src="${att.Payload.Url}" class="chat-message-image" loading="lazy" />`;
                        } else if (att.Type === 'audio' && att.Payload && att.Payload.Url) {
                            replyContent += `
                                <div class="chat-audio-message">
                                    <i class="fas fa-microphone" style="color: #3b82f6; margin-right: 8px;"></i>
                                    <audio controls style="max-width: 100%; height: 32px;">
                                        <source src="${att.Payload.Url}" type="audio/mp4">
                                        Trình duyệt không hỗ trợ phát audio
                                    </audio>
                                </div>`;
                        }
                    });
                }

                // Handle Pancake API format in replies
                if (reply.attachments && reply.attachments.length > 0) {
                    reply.attachments.forEach(att => {
                        if (att.mime_type === 'audio/mp4' && att.file_url) {
                            replyContent += `
                                <div class="chat-audio-message">
                                    <i class="fas fa-microphone" style="color: #3b82f6; margin-right: 8px;"></i>
                                    <audio controls style="max-width: 100%; height: 32px;">
                                        <source src="${att.file_url}" type="audio/mp4">
                                        Trình duyệt không hỗ trợ phát audio
                                    </audio>
                                </div>`;
                        } else if (att.mime_type && att.mime_type.startsWith('image/') && att.file_url) {
                            replyContent += `<img src="${att.file_url}" class="chat-message-image" loading="lazy" />`;
                        }
                    });
                }

                // Handle both old format (CreatedTime) and Pancake API format (inserted_at/created_at/updated_at)
                const replyTimestamp = reply.inserted_at || reply.CreatedTime || reply.created_at || reply.updated_at || new Date();

                // Avatar HTML for reply
                const replyAvatarHTML = !replyIsOwner ? `
                    <img src="${replyAvatarUrl}"
                         alt="${replySenderName}"
                         style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; flex-shrink: 0; margin-right: 8px; border: 2px solid #e5e7eb; background: #f3f4f6;"
                         onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22><circle cx=%2216%22 cy=%2216%22 r=%2216%22 fill=%22%23e5e7eb%22/><circle cx=%2216%22 cy=%2212%22 r=%225%22 fill=%22%239ca3af%22/><ellipse cx=%2216%22 cy=%2224%22 rx=%228%22 ry=%226%22 fill=%22%239ca3af%22/></svg>'"
                    />
                ` : '';

                return `
                    <div class="chat-message ${replyAlignClass}" style="margin-left: 24px; margin-top: 8px; display: flex; align-items: flex-start;">
                        ${!replyIsOwner ? replyAvatarHTML : ''}
                        <div style="flex: 1; ${replyIsOwner ? 'display: flex; justify-content: flex-end;' : ''}">
                            <div class="chat-bubble ${replyBgClass}" style="font-size: 13px;">
                                ${!replyIsOwner && replySenderName ? `<p style="font-size: 10px; font-weight: 600; color: #6b7280; margin: 0 0 4px 0;">${replySenderName}</p>` : ''}
                                ${replyContent}
                                <p class="chat-message-time">${formatTime(replyTimestamp)}</p>
                            </div>
                        </div>
                    </div>`;
            }).join('');
        }

        // Handle both old format (CreatedTime) and Pancake API format (inserted_at/created_at/updated_at)
        const timestamp = comment.inserted_at || comment.CreatedTime || comment.created_at || comment.updated_at || new Date();

        // Avatar HTML - only show for customer comments (not owner)
        const avatarHTML = !isOwner ? `
            <img src="${avatarUrl}"
                 alt="${senderName}"
                 title="Click để phóng to - ${senderName}"
                 class="avatar-loading chat-avatar-clickable"
                 style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; flex-shrink: 0; margin-right: 12px; border: 2px solid #e5e7eb; background: #f3f4f6; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;"
                 onmouseover="this.style.transform='scale(1.1)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.2)'"
                 onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none'"
                 onclick="openAvatarZoom('${avatarUrl}', '${senderName.replace(/'/g, "\\'")}'); event.stopPropagation();"
                 onload="this.classList.remove('avatar-loading')"
                 onerror="this.classList.remove('avatar-loading'); this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 48 48%22><circle cx=%2224%22 cy=%2224%22 r=%2224%22 fill=%22%23e5e7eb%22/><circle cx=%2224%22 cy=%2218%22 r=%228%22 fill=%22%239ca3af%22/><ellipse cx=%2224%22 cy=%2238%22 rx=%2213%22 ry=%2210%22 fill=%22%239ca3af%22/></svg>'"
            />
        ` : '';

        return `
            <div class="chat-message ${alignClass} ${purchaseHighlightClass}" data-comment-id="${comment.Id || comment.id || ''}" style="display: flex; align-items: flex-start;">
                ${!isOwner ? avatarHTML : ''}
                <div style="flex: 1; ${isOwner ? 'display: flex; justify-content: flex-end;' : ''}">
                    ${purchaseBadge}
                    <div class="chat-bubble ${bgClass}">
                        ${!isOwner && senderName ? `<p style="font-size: 11px; font-weight: 600; color: #6b7280; margin: 0 0 4px 0;">${senderName}</p>` : ''}
                        ${content}
                        <p class="chat-message-time">
                            ${formatTime(timestamp)} ${statusBadge}
                            ${!isOwner ? `<span class="reply-btn" onclick="handleReplyToComment('${comment.Id || comment.id}', '${comment.PostId || comment.post_id || ''}')" style="cursor: pointer; color: #3b82f6; margin-left: 8px; font-weight: 500;">Trả lời</span>` : ''}
                        </p>
                    </div>
                </div>
            </div>
            ${repliesHTML}`;
    }).join('');

    // Add loading indicator at top based on pagination state
    let loadingIndicator = '';
    if (currentChatCursor) {
        // Still have more comments to load
        loadingIndicator = `
            <div id="chatLoadMoreIndicator" style="
                text-align: center;
                padding: 16px 12px;
                color: #6b7280;
                font-size: 13px;
                background: linear-gradient(to bottom, #f9fafb 0%, transparent 100%);
                border-bottom: 1px solid #e5e7eb;
                margin-bottom: 8px;
            ">
                <i class="fas fa-arrow-up" style="margin-right: 6px; color: #3b82f6;"></i>
                <span style="font-weight: 500;">Cuộn lên để tải thêm bình luận</span>
            </div>`;
    } else if (window.allChatComments.length > 0 && !currentChatCursor) {
        // No more comments (reached the beginning)
        loadingIndicator = `
            <div style="
                text-align: center;
                padding: 16px 12px;
                color: #9ca3af;
                font-size: 12px;
                background: #f9fafb;
                border-bottom: 1px solid #e5e7eb;
                margin-bottom: 8px;
            ">
                <i class="fas fa-check-circle" style="margin-right: 6px; color: #10b981;"></i>
                Đã tải hết bình luận cũ
            </div>`;
    }

    // Add post/video context at the top if available
    let postContext = '';
    if (comments[0] && comments[0].Object) {
        const obj = comments[0].Object;
        postContext = `
            <div style="
                background: #f9fafb;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                padding: 12px;
                margin-bottom: 16px;
            ">
                <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">
                    <i class="fas fa-video"></i> ${obj.ObjectType === 1 ? 'Video' : 'Bài viết'} Live
                </div>
                <div style="font-size: 13px; font-weight: 500; color: #1f2937;">
                    ${obj.Description || obj.Title || 'Không có mô tả'}
                </div>
            </div>`;
    }

    // Check if user is at bottom before render (within 100px threshold)
    // CHANGED: Check scrollToBottom parameter OR current position
    const wasAtBottom = scrollToBottom || (modalBody.scrollHeight - modalBody.scrollTop - modalBody.clientHeight < 100);
    const previousScrollHeight = modalBody.scrollHeight;
    const previousScrollTop = modalBody.scrollTop;

    modalBody.innerHTML = `<div class="chat-messages-container">${loadingIndicator}${postContext}${commentsHTML}</div>`;

    // Check if there's a purchase comment to scroll to (only on initial load)
    const purchaseCommentElement = modalBody.querySelector('.purchase-comment-highlight');

    // Only auto-scroll if explicitly requested OR user was already at bottom
    if (wasAtBottom) {
        // Use requestAnimationFrame to ensure DOM has updated before scrolling
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                // Priority: scroll to purchase comment if exists, otherwise scroll to bottom
                if (purchaseCommentElement && scrollToBottom) {
                    // Scroll to purchase comment with smooth behavior
                    purchaseCommentElement.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center'
                    });
                    console.log('[CHAT] Scrolled to purchase comment');
                } else {
                    modalBody.scrollTop = modalBody.scrollHeight;
                }
                // Hide new message indicator when scrolled to bottom
                const indicator = document.getElementById('chatNewMessageIndicator');
                if (indicator) indicator.style.display = 'none';
            });
        });
    } else {
        // Preserve scroll position (adjust for new content added at top)
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const newScrollHeight = modalBody.scrollHeight;
                const heightDiff = newScrollHeight - previousScrollHeight;
                modalBody.scrollTop = previousScrollTop + heightDiff;

                // Show new message indicator if there's new content at bottom
                if (heightDiff > 0) {
                    showNewMessageIndicator();
                }
            });
        });
    }
}

// =====================================================
// NEW MESSAGE INDICATOR
// =====================================================

/**
 * Show visual indicator for new messages (without flash animation)
 */
function showNewMessageIndicator() {
    const modalBody = document.getElementById('chatModalBody');
    if (!modalBody) return;

    // Check if indicator already exists
    let indicator = document.getElementById('chatNewMessageIndicator');

    if (!indicator) {
        // Create indicator element
        indicator = document.createElement('div');
        indicator.id = 'chatNewMessageIndicator';
        indicator.innerHTML = `
            <div style="
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 10px 20px;
                background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                color: white;
                border-radius: 24px;
                font-size: 13px;
                font-weight: 500;
                box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
                cursor: pointer;
                transition: transform 0.2s, box-shadow 0.2s;
            " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(59, 130, 246, 0.5)';"
               onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(59, 130, 246, 0.4)';">
                <i class="fas fa-arrow-down" style="font-size: 12px;"></i>
                <span>Tin nhắn mới</span>
            </div>
        `;

        // Position indicator at bottom center
        indicator.style.cssText = `
            position: absolute;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 10;
            display: none;
        `;

        // Scroll to bottom when clicked
        indicator.onclick = () => {
            modalBody.scrollTo({
                top: modalBody.scrollHeight,
                behavior: 'smooth'
            });
            indicator.style.display = 'none';
        };

        // Append to modal body's parent to position it correctly
        const chatModal = document.getElementById('chatModal');
        const modalContent = chatModal?.querySelector('.modal-body');
        if (modalContent) {
            modalContent.style.position = 'relative';
            modalContent.appendChild(indicator);
        }
    }

    // Show indicator with smooth appearance (no flash)
    indicator.style.display = 'block';
}

/**
 * Setup scroll listener to auto-hide indicator when user scrolls to bottom
 */
function setupNewMessageIndicatorListener() {
    const modalBody = document.getElementById('chatModalBody');
    if (!modalBody) return;

    modalBody.addEventListener('scroll', () => {
        const isAtBottom = (modalBody.scrollHeight - modalBody.scrollTop - modalBody.clientHeight < 100);
        const indicator = document.getElementById('chatNewMessageIndicator');

        if (indicator && isAtBottom) {
            indicator.style.display = 'none';
        }
    });
}

// =====================================================
// REALTIME MESSAGES - FACEBOOK API INTEGRATION
// =====================================================

/**
 * Global variables for realtime messages
 */
window.realtimeMessagesInterval = null;
window.realtimeMessagesHandler = null;
window.lastMessageTimestamp = null;
const REALTIME_POLL_INTERVAL = 10000; // 10 seconds polling interval

/**
 * Setup realtime messages when chat modal opens
 * Uses both WebSocket events and polling as backup
 */
function setupRealtimeMessages() {
    console.log('[REALTIME-MSG] Setting up realtime messages...');

    // Cleanup any existing listeners first
    cleanupRealtimeMessages();

    // 1. Listen for WebSocket events from RealtimeManager
    window.realtimeMessagesHandler = handleRealtimeConversationEvent;
    window.addEventListener('realtimeConversationUpdate', window.realtimeMessagesHandler);
    console.log('[REALTIME-MSG] WebSocket event listener added');

    // 2. Start polling as backup (only if WebSocket is not connected)
    // Polling is disabled by default since we have WebSocket realtime
    // startRealtimePolling();
}

/**
 * Handle realtime conversation update from WebSocket
 * Trực tiếp lấy tin nhắn từ WebSocket payload, không cần gọi API
 * @param {CustomEvent} event - Event with conversation data
 */
async function handleRealtimeConversationEvent(event) {
    const conversation = event.detail;
    if (!conversation) return;

    // Check if this update is for the current conversation
    const currentConvId = window.currentConversationId;
    const currentPSID = window.currentChatPSID;
    const currentChannelId = window.currentChatChannelId;

    // Match by conversation ID or by page_id + customer PSID
    const isMatchingConv = (conversation.id === currentConvId) ||
        (conversation.page_id === currentChannelId &&
            (conversation.from?.id === currentPSID || conversation.from_psid === currentPSID));

    if (!isMatchingConv) {
        // Log quietly - this is expected for updates to other conversations
        return;
    }

    console.log('[REALTIME-MSG] ⚡ Received realtime update for current conversation:', conversation.id);

    // Try to get the new message directly from WebSocket payload
    const lastMessage = conversation.last_message || conversation.message;

    if (lastMessage && lastMessage.id) {
        // Check if this message already exists
        const existingIds = new Set(window.allChatMessages.map(m => m.id || m.Id));

        if (!existingIds.has(lastMessage.id)) {
            console.log('[REALTIME-MSG] ⚡ Adding message directly from WebSocket:', lastMessage.id);

            // Add the new message directly (instant realtime!)
            window.allChatMessages.push(lastMessage);

            // Update timestamp
            window.lastMessageTimestamp = lastMessage.inserted_at || lastMessage.created_time;

            // Check if user is at bottom before updating
            const modalBody = document.getElementById('chatModalBody');
            const wasAtBottom = modalBody &&
                (modalBody.scrollHeight - modalBody.scrollTop - modalBody.clientHeight < 100);

            // Re-render messages
            renderChatMessages(window.allChatMessages, wasAtBottom);

            // Show indicator if not at bottom
            if (!wasAtBottom) {
                showNewMessageIndicator();
            }

            // Play notification sound
            playNewMessageSound();

            return; // Done - no need to call API
        } else {
            console.log('[REALTIME-MSG] Message already exists:', lastMessage.id);
            return;
        }
    }

    // Fallback: If last_message not in payload, check snippet
    // This means we only got a notification, need to fetch the full message
    if (conversation.snippet) {
        console.log('[REALTIME-MSG] WebSocket has snippet but not full message, fetching via API...');
        await fetchAndUpdateMessages();
    }
}

/**
 * Start polling for new messages
 */
function startRealtimePolling() {
    // Clear any existing interval
    if (window.realtimeMessagesInterval) {
        clearInterval(window.realtimeMessagesInterval);
    }

    // Store initial timestamp
    if (window.allChatMessages && window.allChatMessages.length > 0) {
        const latestMsg = window.allChatMessages.reduce((latest, msg) => {
            const msgTime = new Date(msg.inserted_at || msg.CreatedTime || 0).getTime();
            const latestTime = new Date(latest.inserted_at || latest.CreatedTime || 0).getTime();
            return msgTime > latestTime ? msg : latest;
        });
        window.lastMessageTimestamp = latestMsg.inserted_at || latestMsg.CreatedTime;
    }

    console.log('[REALTIME-MSG] Starting polling every', REALTIME_POLL_INTERVAL / 1000, 'seconds');

    // Start polling
    window.realtimeMessagesInterval = setInterval(async () => {
        // Only poll if chat modal is open
        const chatModal = document.getElementById('chatModal');
        if (!chatModal || !chatModal.classList.contains('show')) {
            console.log('[REALTIME-MSG] Chat modal closed, stopping poll');
            cleanupRealtimeMessages();
            return;
        }

        // Only poll for message type (not comments)
        if (currentChatType !== 'message') {
            return;
        }

        await fetchAndUpdateMessages();
    }, REALTIME_POLL_INTERVAL);
}

/**
 * Fetch latest messages using Facebook Graph API via Pancake
 * Only fetches new messages since last update
 */
async function fetchAndUpdateMessages() {
    if (!window.currentChatChannelId || !window.currentChatPSID) {
        return;
    }

    // Prevent concurrent fetches
    if (window.isFetchingRealtimeMessages) {
        console.log('[REALTIME-MSG] Already fetching, skipping...');
        return;
    }

    window.isFetchingRealtimeMessages = true;

    try {
        console.log('[REALTIME-MSG] Fetching latest messages...');

        // Try Facebook Graph API first if we have page token
        let newMessages = [];
        const facebookPageToken = await getFacebookPageToken();

        if (facebookPageToken && window.currentConversationId) {
            // Use Facebook Graph API directly
            newMessages = await fetchMessagesFromFacebookAPI(facebookPageToken);
        } else {
            // Fallback to Pancake API
            const response = await window.chatDataManager.fetchMessages(
                window.currentChatChannelId,
                window.currentChatPSID,
                window.currentConversationId,
                window.currentCustomerUUID
            );
            newMessages = response.messages || [];
        }

        if (newMessages.length === 0) {
            console.log('[REALTIME-MSG] No messages returned');
            window.isFetchingRealtimeMessages = false;
            return;
        }

        // Find truly new messages by comparing IDs
        const existingIds = new Set(window.allChatMessages.map(m => m.id || m.Id));
        const trulyNewMessages = newMessages.filter(msg => {
            const msgId = msg.id || msg.Id;
            return msgId && !existingIds.has(msgId);
        });

        if (trulyNewMessages.length > 0) {
            console.log('[REALTIME-MSG] Found', trulyNewMessages.length, 'new messages');

            // Add new messages to the array
            window.allChatMessages = [...window.allChatMessages, ...trulyNewMessages];

            // Update timestamp
            const latestMsg = trulyNewMessages.reduce((latest, msg) => {
                const msgTime = new Date(msg.inserted_at || msg.CreatedTime || 0).getTime();
                const latestTime = new Date(latest.inserted_at || latest.CreatedTime || 0).getTime();
                return msgTime > latestTime ? msg : latest;
            });
            window.lastMessageTimestamp = latestMsg.inserted_at || latestMsg.CreatedTime;

            // Check if user is at bottom before updating
            const modalBody = document.getElementById('chatModalBody');
            const wasAtBottom = modalBody &&
                (modalBody.scrollHeight - modalBody.scrollTop - modalBody.clientHeight < 100);

            // Re-render messages
            renderChatMessages(window.allChatMessages, wasAtBottom);

            // Show indicator if not at bottom
            if (!wasAtBottom) {
                showNewMessageIndicator();
            }

            // Play notification sound if available
            playNewMessageSound();
        } else {
            console.log('[REALTIME-MSG] No new messages to display');
        }

    } catch (error) {
        console.error('[REALTIME-MSG] Error fetching messages:', error);
    } finally {
        window.isFetchingRealtimeMessages = false;
    }
}

/**
 * Get Facebook Page Token from various sources
 * @returns {string|null} Facebook Page Token
 */
async function getFacebookPageToken() {
    // Try CRMTeam first
    if (window.currentCRMTeam && window.currentCRMTeam.Facebook_PageToken) {
        return window.currentCRMTeam.Facebook_PageToken;
    }

    // Try current order
    if (window.currentOrder && window.currentOrder.CRMTeam && window.currentOrder.CRMTeam.Facebook_PageToken) {
        return window.currentOrder.CRMTeam.Facebook_PageToken;
    }

    // Try pancake token manager
    if (window.pancakeTokenManager && window.currentChatChannelId) {
        const pageAccessToken = await window.pancakeTokenManager.getOrGeneratePageAccessToken(window.currentChatChannelId);
        return pageAccessToken;
    }

    return null;
}

/**
 * Fetch messages directly from Facebook Graph API
 * Uses the conversation endpoint with page access token
 * @param {string} pageToken - Facebook Page Token
 * @returns {Array} Messages array
 */
async function fetchMessagesFromFacebookAPI(pageToken) {
    try {
        // Build the Facebook Graph API URL
        // GET /{conversation-id}/messages?access_token={page_token}
        const conversationId = window.currentConversationId;

        if (!conversationId) {
            console.warn('[REALTIME-MSG] No conversation ID for Facebook API call');
            return [];
        }

        // Use Pancake Official API which proxies to Facebook
        // This respects the same format and avoids CORS issues
        const pageAccessToken = await window.pancakeTokenManager?.getOrGeneratePageAccessToken(window.currentChatChannelId);

        if (!pageAccessToken) {
            console.warn('[REALTIME-MSG] No page access token for Facebook API');
            return [];
        }

        // Build URL using existing API config
        let extraParams = '';
        if (window.currentCustomerUUID) {
            extraParams = `&customer_id=${window.currentCustomerUUID}`;
        }

        const url = window.API_CONFIG.buildUrl.pancakeOfficial(
            `pages/${window.currentChatChannelId}/conversations/${conversationId}/messages`,
            pageAccessToken
        ) + extraParams;

        console.log('[REALTIME-MSG] Calling Facebook API via Pancake:', url.substring(0, 100) + '...');

        const response = await API_CONFIG.smartFetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        }, 2, true); // 2 retries, skip fallback

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('[REALTIME-MSG] Facebook API returned', data.messages?.length || 0, 'messages');

        return data.messages || [];

    } catch (error) {
        console.error('[REALTIME-MSG] Error calling Facebook API:', error);
        return [];
    }
}

/**
 * Play notification sound for new messages
 */
function playNewMessageSound() {
    try {
        // Create a simple beep sound using Web Audio API
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 800; // Frequency in Hz
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime); // Low volume
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {
        // Silently fail if audio not supported
    }
}

/**
 * Cleanup realtime messages listeners and intervals
 */
function cleanupRealtimeMessages() {
    console.log('[REALTIME-MSG] Cleaning up realtime messages...');

    // Remove WebSocket event listener
    if (window.realtimeMessagesHandler) {
        window.removeEventListener('realtimeConversationUpdate', window.realtimeMessagesHandler);
        window.realtimeMessagesHandler = null;
    }

    // Clear polling interval
    if (window.realtimeMessagesInterval) {
        clearInterval(window.realtimeMessagesInterval);
        window.realtimeMessagesInterval = null;
    }

    // Reset state
    window.lastMessageTimestamp = null;
    window.isFetchingRealtimeMessages = false;
}

// Expose for external use
window.setupRealtimeMessages = setupRealtimeMessages;
window.cleanupRealtimeMessages = cleanupRealtimeMessages;
window.fetchAndUpdateMessages = fetchAndUpdateMessages;

// #region ═══════════════════════════════════════════════════════════════════════
// ║                       SECTION 13: INFINITE SCROLL                           ║
// ║                            search: #SCROLL                                  ║
// #endregion ════════════════════════════════════════════════════════════════════

// =====================================================
// SCROLL TO MESSAGE FUNCTION
// =====================================================

/**
 * Scroll to a specific message in the chat modal and highlight it
 * @param {string} messageId - The ID of the message to scroll to
 */
window.scrollToMessage = function (messageId) {
    if (!messageId) return;

    const modalBody = document.getElementById('chatModalBody');
    if (!modalBody) return;

    // Find message element by data-message-id attribute
    const messageElement = modalBody.querySelector(`[data-message-id="${messageId}"]`);

    if (messageElement) {
        // Scroll to message
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Add highlight animation
        messageElement.classList.add('message-highlight');

        // Remove highlight after animation
        setTimeout(() => {
            messageElement.classList.remove('message-highlight');
        }, 2000);
    } else {
        console.log('[SCROLL] Message not found:', messageId);
        // Message might not be loaded yet - show notification
        showToast && showToast('Tin nhắn không tìm thấy trong cuộc hội thoại hiện tại', 'warning');
    }
};

// =====================================================
// INFINITE SCROLL FOR MESSAGES & COMMENTS #SCROLL
// =====================================================

function setupChatInfiniteScroll() {
    const modalBody = document.getElementById('chatModalBody');
    if (!modalBody) return;

    // Remove existing listener to avoid duplicates
    modalBody.removeEventListener('scroll', handleChatScroll);

    // Add scroll listener
    modalBody.addEventListener('scroll', handleChatScroll);
}

async function handleChatScroll(event) {
    const modalBody = event.target;

    // Check if scrolled to top (or near top)
    const isNearTop = modalBody.scrollTop < 100;

    // Only load more if:
    // 1. Near the top of the scroll
    // 2. Not already loading
    // Note: For MESSAGE, we use count-based pagination (no cursor needed)
    //       For COMMENT, we still use cursor-based pagination
    if (isNearTop && !isLoadingMoreMessages) {
        if (currentChatType === 'message') {
            await loadMoreMessages();
        } else if (currentChatType === 'comment' && currentChatCursor) {
            await loadMoreComments();
        }
    }
}

async function loadMoreMessages() {
    if (!window.currentChatChannelId || !window.currentChatPSID) {
        return;
    }

    // Stop if already loading
    if (isLoadingMoreMessages) {
        console.log('[CHAT] Already loading messages, skipping...');
        return;
    }

    isLoadingMoreMessages = true;

    try {
        const modalBody = document.getElementById('chatModalBody');
        const loadMoreIndicator = document.getElementById('chatLoadMoreIndicator');

        // Show loading state with better visual feedback
        if (loadMoreIndicator) {
            loadMoreIndicator.innerHTML = `
                <i class="fas fa-spinner fa-spin" style="margin-right: 8px; color: #3b82f6;"></i>
                <span style="font-weight: 500; color: #3b82f6;">Đang tải thêm tin nhắn...</span>
            `;
            loadMoreIndicator.style.background = 'linear-gradient(to bottom, #eff6ff 0%, transparent 100%)';
        }

        // Use count-based pagination (current_count parameter)
        const currentCount = window.allChatMessages.length;
        console.log(`[CHAT] Loading more messages with current_count: ${currentCount}`);

        // Fetch more messages using count-based pagination
        const response = await window.chatDataManager.fetchMessages(
            window.currentChatChannelId,
            window.currentChatPSID,
            currentCount,  // Pass number for count-based pagination
            window.currentCustomerUUID  // Pass customerId
        );

        // Get scroll height before updating
        const scrollHeightBefore = modalBody.scrollHeight;
        const scrollTopBefore = modalBody.scrollTop;

        // Append older messages to the beginning of the array
        const newMessages = response.messages || [];
        if (newMessages.length > 0) {
            window.allChatMessages = [...window.allChatMessages, ...newMessages];
            console.log(`[CHAT] ✅ Loaded ${newMessages.length} more messages. Total: ${window.allChatMessages.length}`);
        } else {
            console.log(`[CHAT] 🏁 No new messages loaded. Reached the beginning of conversation.`);
        }

        // Re-render with all messages, don't scroll to bottom
        renderChatMessages(window.allChatMessages, false);

        // Restore scroll position (adjust for new content height)
        setTimeout(() => {
            const scrollHeightAfter = modalBody.scrollHeight;
            const heightDifference = scrollHeightAfter - scrollHeightBefore;
            modalBody.scrollTop = scrollTopBefore + heightDifference;
        }, 50);

    } catch (error) {
        console.error('[CHAT] Error loading more messages:', error);
    } finally {
        isLoadingMoreMessages = false;
    }
}

async function loadMoreComments() {
    if (!window.currentChatChannelId || !window.currentChatPSID || !currentChatCursor) {
        return;
    }

    isLoadingMoreMessages = true;

    try {
        const modalBody = document.getElementById('chatModalBody');
        const loadMoreIndicator = document.getElementById('chatLoadMoreIndicator');

        // Show loading state with better visual feedback
        if (loadMoreIndicator) {
            loadMoreIndicator.innerHTML = `
                <i class="fas fa-spinner fa-spin" style="margin-right: 8px; color: #3b82f6;"></i>
                <span style="font-weight: 500; color: #3b82f6;">Đang tải thêm bình luận...</span>
            `;
            loadMoreIndicator.style.background = 'linear-gradient(to bottom, #eff6ff 0%, transparent 100%)';
        }

        console.log(`[CHAT] Loading more comments with cursor: ${currentChatCursor}`);

        // Fetch more comments using the cursor
        const response = await window.chatDataManager.fetchComments(
            window.currentChatChannelId,
            window.currentChatPSID,
            currentChatCursor
        );

        // Get scroll height before updating
        const scrollHeightBefore = modalBody.scrollHeight;
        const scrollTopBefore = modalBody.scrollTop;

        // Append older comments to the beginning of the array
        const newComments = response.comments || [];
        if (newComments.length > 0) {
            window.allChatComments = [...window.allChatComments, ...newComments];
            console.log(`[CHAT] ✅ Loaded ${newComments.length} more comments. Total: ${window.allChatComments.length}`);
        } else {
            console.log(`[CHAT] ⚠️ No new comments loaded. Reached end or empty batch.`);
        }

        // Update cursor for next page (null = no more comments)
        currentChatCursor = response.after;
        if (currentChatCursor) {
            console.log(`[CHAT] 📄 Next cursor available: ${currentChatCursor.substring(0, 20)}...`);
        } else {
            console.log(`[CHAT] 🏁 No more comments. Reached the beginning.`);
        }

        // Re-render with all comments, don't scroll to bottom
        renderComments(window.allChatComments, false);

        // Restore scroll position (adjust for new content height)
        setTimeout(() => {
            const scrollHeightAfter = modalBody.scrollHeight;
            const heightDifference = scrollHeightAfter - scrollHeightBefore;
            modalBody.scrollTop = scrollTopBefore + heightDifference;
        }, 50);

    } catch (error) {
        console.error('[CHAT] Error loading more comments:', error);
    } finally {
        isLoadingMoreMessages = false;
    }
}

window.markChatAsRead = async function () {
    if (!window.currentChatChannelId || !window.currentChatPSID) return;

    try {
        const markReadBtn = document.getElementById('chatMarkReadBtn');
        if (markReadBtn) {
            markReadBtn.disabled = true;
            markReadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';
        }

        await window.chatDataManager.markAsSeen(window.currentChatChannelId, window.currentChatPSID);

        // Hide button
        if (markReadBtn) {
            markReadBtn.style.display = 'none';
            markReadBtn.disabled = false;
            markReadBtn.innerHTML = '<i class="fas fa-check"></i> Đánh dấu đã đọc';
        }

        // Re-render table to update UI
        renderTable();

        if (window.notificationManager) {
            window.notificationManager.success('Đã đánh dấu tin nhắn là đã đọc', 2000);
        }
    } catch (error) {
        console.error('[CHAT] Error marking as read:', error);
        if (window.notificationManager) {
            window.notificationManager.error('Lỗi khi đánh dấu đã đọc: ' + error.message, 3000);
        }
    }
}

