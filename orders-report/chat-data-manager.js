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
                throw new Error('Không thể xác thực với ChatOmni API');
            }

            const data = await response.json();
            const token = data.access_token;
            const expiry = Date.now() + (data.expires_in * 1000);

            // Save to localStorage
            localStorage.setItem('chatBearerToken', token);
            localStorage.setItem('chatTokenExpiry', expiry.toString());

            console.log('✅ Chat API: Đăng nhập thành công');
            return token;
        } catch (error) {
            console.error('❌ Chat API: Lỗi xác thực:', error);
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
        if (isFetching) {
            console.log('⏳ Chat API: Đang tải dữ liệu...');
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
                console.error('❌ Chat API: Không có token hợp lệ');
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
            console.error('❌ Chat API: Lỗi khi tải dữ liệu:', error);
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

        // Fetch conversations immediately
        fetchConversations();

        // Auto-refresh every 2 minutes
        setInterval(() => {
            console.log('🔄 Chat API: Tự động làm mới dữ liệu...');
            fetchConversations();
        }, 2 * 60 * 1000);
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
                lastFetchTime: new Date(lastFetchTime).toLocaleString('vi-VN'),
                cacheAge: Math.floor((Date.now() - lastFetchTime) / 1000) + 's'
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
