// Chat Data Manager - Quản lý dữ liệu tin nhắn từ ChatOmni
// Sử dụng POLLING thay vì WebSocket/Socket.IO để tránh phức tạp

const ChatDataManager = (() => {
    // API Configuration
    const API_BASE = 'https://chat-viewer-ubjn.onrender.com/api';
    const DEFAULT_CREDENTIALS = {
        username: 'nv20',
        password: 'Aa@123456789',
        client_id: 'tmtWebApp'
    };

    // Polling Configuration
    const POLLING_CONFIG = {
        INTERVAL: 3 * 60 * 1000,      // Poll mỗi 3 phút
        CACHE_DURATION: 5 * 60 * 1000, // Cache 5 phút
        RETRY_DELAY: 10 * 60 * 1000,   // Retry sau 10 phút nếu failed
        MAX_CONVERSATIONS: 200          // Số lượng conversations tối đa
    };

    // Cache for chat data
    let conversationsMap = new Map(); // Map<phoneNumber, conversation>
    let lastFetchTime = 0;
    let isFetching = false;
    let apiAvailable = true; // Track if API is available
    let lastErrorTime = 0;
    let pollingInterval = null;

    // Authentication functions
    async function getAuthToken() {
        try {
            const response = await fetch(`${API_BASE}/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `grant_type=password&username=${DEFAULT_CREDENTIALS.username}&password=${encodeURIComponent(DEFAULT_CREDENTIALS.password)}&client_id=${DEFAULT_CREDENTIALS.client_id}`
            });

            if (!response.ok) {
                apiAvailable = false;
                // Only log error once every 10 minutes to avoid spam
                if (lastErrorTime === 0 || Date.now() - lastErrorTime > 10 * 60 * 1000) {
                    console.warn('⚠️ Chat API: Không thể xác thực (API có thể đang offline)');
                    lastErrorTime = Date.now();
                }
                return null;
            }

            const data = await response.json();
            const token = data.access_token;
            const expiry = Date.now() + (data.expires_in * 1000);

            // Save to localStorage
            localStorage.setItem('chatBearerToken', token);
            localStorage.setItem('chatTokenExpiry', expiry.toString());

            apiAvailable = true;
            console.log('✅ Chat API: Đăng nhập thành công');
            return token;
        } catch (error) {
            apiAvailable = false;
            // Only log once every 10 minutes to avoid spam
            if (lastErrorTime === 0 || Date.now() - lastErrorTime > 10 * 60 * 1000) {
                console.warn('⚠️ Chat API: Lỗi kết nối:', error.message);
                lastErrorTime = Date.now();
            }
            return null;
        }
    }

    async function getValidToken() {
        const storedToken = localStorage.getItem('chatBearerToken');
        const storedExpiry = localStorage.getItem('chatTokenExpiry');

        if (storedToken && storedExpiry) {
            const expiry = parseInt(storedExpiry);
            // Check if token expires in more than 5 minutes
            if (expiry > Date.now() + 300000) {
                return storedToken;
            }
        }

        // Token expired or not found, get new one
        return await getAuthToken();
    }

    // Fetch conversations from ChatOmni API (POLLING method)
    async function fetchConversations(forceRefresh = false) {
        // Skip if API is known to be unavailable (avoid repeated failures)
        if (!apiAvailable && Date.now() - lastErrorTime < POLLING_CONFIG.RETRY_DELAY) {
            // Silently skip, API was unavailable recently
            return false;
        }

        if (isFetching) {
            console.log('⏳ [POLLING] Đang fetch dữ liệu...');
            return false;
        }

        // Check cache first (unless force refresh)
        const now = Date.now();
        if (!forceRefresh && now - lastFetchTime < POLLING_CONFIG.CACHE_DURATION && conversationsMap.size > 0) {
            console.log('✅ [POLLING] Sử dụng cache (còn hiệu lực)');
            return true;
        }

        try {
            isFetching = true;
            console.log('🔄 [POLLING] Đang tải dữ liệu tin nhắn từ API...');

            const token = await getValidToken();

            if (!token) {
                // Token fetch failed, API might be unavailable
                return false;
            }

            const response = await fetch(`${API_BASE}/api-ms/chatomni/v1/conversations/search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'accept': 'application/json',
                },
                body: JSON.stringify({
                    Keyword: null,
                    Limit: POLLING_CONFIG.MAX_CONVERSATIONS,
                    Sort: null,
                    Before: null,
                    After: null,
                    Channels: [{ Id: "270136663390370", Type: 4 }],
                    Type: "message",
                    HasPhone: null,
                    HasAddress: null,
                    HasOrder: null,
                    IsUnread: null,
                    IsUnreplied: null,
                    TagIds: [],
                    UserIds: [],
                    Start: null,
                    End: null,
                    FromNewToOld: null
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            const conversations = data.Data || [];

            // Build phone number map
            const previousSize = conversationsMap.size;
            conversationsMap.clear();
            conversations.forEach(conv => {
                if (conv.Phone) {
                    // Normalize phone number (remove spaces, dashes, etc.)
                    const normalizedPhone = normalizePhoneNumber(conv.Phone);
                    conversationsMap.set(normalizedPhone, conv);
                }
            });

            lastFetchTime = now;
            apiAvailable = true;

            const changeInfo = previousSize > 0 ? ` (${conversationsMap.size - previousSize > 0 ? '+' : ''}${conversationsMap.size - previousSize} thay đổi)` : '';
            console.log(`✅ [POLLING] Đã tải ${conversations.length} cuộc hội thoại (${conversationsMap.size} có SĐT)${changeInfo}`);

            // Trigger table refresh if needed
            if (typeof renderTable === 'function' && previousSize > 0 && conversationsMap.size !== previousSize) {
                console.log('🔄 [POLLING] Có thay đổi, refresh bảng...');
                renderTable();
            }

            return true;

        } catch (error) {
            apiAvailable = false;
            // Only log once to avoid spam (only when first time or no conversations)
            if (conversationsMap.size === 0 && (lastErrorTime === 0 || Date.now() - lastErrorTime > POLLING_CONFIG.RETRY_DELAY)) {
                console.warn('⚠️ [POLLING] Không thể tải dữ liệu tin nhắn (chức năng này tạm thời không khả dụng)');
                lastErrorTime = Date.now();
            }
            return false;
        } finally {
            isFetching = false;
        }
    }

    // Normalize phone number for comparison
    function normalizePhoneNumber(phone) {
        if (!phone) return '';
        // Remove all non-digit characters
        let normalized = phone.replace(/\D/g, '');

        // Handle Vietnam phone numbers
        // Convert 84... to 0...
        if (normalized.startsWith('84')) {
            normalized = '0' + normalized.substring(2);
        }

        return normalized;
    }

    // Get message info for a phone number
    function getMessageInfo(phoneNumber) {
        if (!phoneNumber) {
            return null;
        }

        const normalizedPhone = normalizePhoneNumber(phoneNumber);
        const conversation = conversationsMap.get(normalizedPhone);

        if (!conversation) {
            return null;
        }

        return {
            hasUnread: conversation.LastActivities?.HasUnread || false,
            unreadCount: conversation.LastActivities?.UnreadCount || 0,
            lastMessage: conversation.LastActivities?.Message?.Message || '',
            lastMessageTime: conversation.LastActivities?.ActivitedTime || null,
            conversationId: conversation.Id,
            userId: conversation.User?.Id
        };
    }

    // Format message badge HTML
    function formatMessageBadge(phoneNumber) {
        const messageInfo = getMessageInfo(phoneNumber);

        if (!messageInfo) {
            // No conversation found
            return '<span style="color: #9ca3af; font-size: 12px;">-</span>';
        }

        if (messageInfo.hasUnread && messageInfo.unreadCount > 0) {
            // Has unread messages
            return `
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="
                        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                        color: white;
                        padding: 4px 10px;
                        border-radius: 12px;
                        font-size: 12px;
                        font-weight: 600;
                        display: inline-flex;
                        align-items: center;
                        gap: 4px;
                        box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3);
                    ">
                        <i class="fas fa-envelope" style="font-size: 10px;"></i>
                        ${messageInfo.unreadCount} mới
                    </span>
                </div>
            `;
        } else {
            // Has conversation but no unread messages
            return `
                <span style="
                    background: #e5e7eb;
                    color: #6b7280;
                    padding: 4px 10px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: 500;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                ">
                    <i class="fas fa-check" style="font-size: 10px;"></i>
                    Đã đọc
                </span>
            `;
        }
    }

    // Start polling - Initialize and start automatic polling
    function startPolling() {
        console.log('🚀 [POLLING] Khởi tạo Chat Data Manager...');
        console.log(`⚙️ [POLLING] Config: Interval=${POLLING_CONFIG.INTERVAL/1000}s, Cache=${POLLING_CONFIG.CACHE_DURATION/1000}s, Max=${POLLING_CONFIG.MAX_CONVERSATIONS} conversations`);

        // Fetch conversations immediately
        fetchConversations();

        // Setup automatic polling
        if (pollingInterval) {
            clearInterval(pollingInterval);
        }

        pollingInterval = setInterval(() => {
            // Only try to fetch if API was available or enough time has passed since last error
            if (apiAvailable || Date.now() - lastErrorTime > POLLING_CONFIG.RETRY_DELAY) {
                console.log('⏰ [POLLING] Auto-refresh trigger...');
                fetchConversations();
            } else {
                console.log('⏸️ [POLLING] Skipped (API unavailable)');
            }
        }, POLLING_CONFIG.INTERVAL);

        console.log(`✅ [POLLING] Started (polling every ${POLLING_CONFIG.INTERVAL/60000} minutes)`);
    }

    // Stop polling
    function stopPolling() {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
            console.log('⏹️ [POLLING] Stopped');
        }
    }

    // Manual refresh - force refresh bỏ qua cache
    function manualRefresh() {
        console.log('🔄 [POLLING] Manual refresh triggered...');
        return fetchConversations(true);
    }

    // Initialize (backward compatibility)
    function initialize() {
        startPolling();
    }

    // Public API
    return {
        // Core functions
        initialize,
        startPolling,
        stopPolling,
        manualRefresh,

        // Data access
        fetchConversations,
        getMessageInfo,
        formatMessageBadge,

        // Configuration
        getConfig: () => POLLING_CONFIG,

        // Debug & Status
        getStatus: () => ({
            isPolling: pollingInterval !== null,
            isFetching,
            apiAvailable,
            conversationsCount: conversationsMap.size,
            lastFetchTime: lastFetchTime ? new Date(lastFetchTime).toLocaleString('vi-VN') : 'Chưa tải',
            cacheAge: lastFetchTime ? Math.floor((Date.now() - lastFetchTime) / 1000) + 's' : 'N/A',
            lastError: lastErrorTime ? new Date(lastErrorTime).toLocaleString('vi-VN') : 'Không có lỗi',
            nextPoll: pollingInterval ? Math.ceil((lastFetchTime + POLLING_CONFIG.INTERVAL - Date.now()) / 1000) + 's' : 'N/A'
        }),

        // Backward compatibility
        _debug: {
            getConversationsMap: () => conversationsMap,
            getCache: () => ({
                size: conversationsMap.size,
                lastFetchTime: lastFetchTime ? new Date(lastFetchTime).toLocaleString('vi-VN') : 'Chưa tải',
                cacheAge: lastFetchTime ? Math.floor((Date.now() - lastFetchTime) / 1000) + 's' : 'N/A',
                apiAvailable,
                lastError: lastErrorTime ? new Date(lastErrorTime).toLocaleString('vi-VN') : 'Chưa có lỗi'
            })
        }
    };
})();

// Auto-initialize when script loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        ChatDataManager.initialize();
    });
} else {
    ChatDataManager.initialize();
}

// ==========================================
// USAGE EXAMPLES:
// ==========================================
//
// 1. Check status:
//    ChatDataManager.getStatus()
//
// 2. Manual refresh:
//    ChatDataManager.manualRefresh()
//
// 3. Stop/Start polling:
//    ChatDataManager.stopPolling()
//    ChatDataManager.startPolling()
//
// 4. Get config:
//    ChatDataManager.getConfig()
// ==========================================
