// Chat Data Manager - Quản lý dữ liệu tin nhắn từ ChatOmni
// Tích hợp với bảng đơn hàng để hiển thị trạng thái tin nhắn

const ChatDataManager = (() => {
    // API Configuration
    const API_BASE = 'https://chat-viewer-ubjn.onrender.com/api';
    const DEFAULT_CREDENTIALS = {
        username: 'nv20',
        password: 'Aa@123456789',
        client_id: 'tmtWebApp'
    };

    // Cache for chat data
    let conversationsMap = new Map(); // Map<phoneNumber, conversation>
    let lastFetchTime = 0;
    const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache
    let isFetching = false;
    let apiAvailable = true; // Track if API is available
    let lastErrorTime = 0;

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

    // Fetch conversations from ChatOmni API
    async function fetchConversations() {
        // Skip if API is known to be unavailable (avoid repeated failures)
        if (!apiAvailable && Date.now() - lastErrorTime < 10 * 60 * 1000) {
            // Silently skip, API was unavailable recently
            return false;
        }

        if (isFetching) {
            return false;
        }

        // Check cache first
        const now = Date.now();
        if (now - lastFetchTime < CACHE_DURATION && conversationsMap.size > 0) {
            console.log('✅ Chat API: Sử dụng dữ liệu cache');
            return true;
        }

        try {
            isFetching = true;
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
                    Limit: 200, // Tăng limit để lấy nhiều cuộc hội thoại hơn
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
            conversationsMap.clear();
            conversations.forEach(conv => {
                if (conv.Phone) {
                    // Normalize phone number (remove spaces, dashes, etc.)
                    const normalizedPhone = normalizePhoneNumber(conv.Phone);
                    conversationsMap.set(normalizedPhone, conv);
                }
            });

            lastFetchTime = now;
            console.log(`✅ Chat API: Đã tải ${conversations.length} cuộc hội thoại (${conversationsMap.size} có SĐT)`);
            return true;

        } catch (error) {
            apiAvailable = false;
            // Only log once to avoid spam (only when first time or no conversations)
            if (conversationsMap.size === 0 && (lastErrorTime === 0 || Date.now() - lastErrorTime > 10 * 60 * 1000)) {
                console.warn('⚠️ Chat API: Không thể tải dữ liệu tin nhắn (chức năng này tạm thời không khả dụng)');
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

    // Initialize - automatically fetch data when module loads
    function initialize() {
        console.log('🚀 Chat Data Manager: Khởi tạo...');

        // Fetch conversations immediately (silently, error will be logged if needed)
        fetchConversations();

        // Auto-refresh every 5 minutes (reduced frequency to avoid spam)
        setInterval(() => {
            // Only try to fetch if API was available or enough time has passed since last error
            if (apiAvailable || Date.now() - lastErrorTime > 10 * 60 * 1000) {
                fetchConversations();
            }
        }, 5 * 60 * 1000);
    }

    // Public API
    return {
        initialize,
        fetchConversations,
        getMessageInfo,
        formatMessageBadge,
        // Expose for debugging
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
