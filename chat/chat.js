// =====================================================
// CHAT PAGE MAIN SCRIPT
// =====================================================

class ChatPage {
    constructor() {
        this.currentChatId = null;
        this.conversations = [];
        this.users = [];
        this.selectedUsers = new Set();
        this.typingTimeouts = new Map();

        this.init();
    }

    async init() {
        console.log('[CHAT-PAGE] Initializing in OFFLINE MODE...');

        // ⚠️ OFFLINE MODE - Backend not ready
        // Chat UI will display but without real-time functionality

        // Setup event listeners
        this.setupEventListeners();

        // Show offline mode message
        this.showOfflineMode();

        console.log('[CHAT-PAGE] ✅ Initialized in offline mode');
    }

    showOfflineMode() {
        // Show message in conversations list
        document.getElementById('conversationsList').innerHTML = `
            <div style="padding: 20px; text-align: center; color: #666;">
                <i data-lucide="wifi-off" style="width: 48px; height: 48px; margin-bottom: 12px; opacity: 0.5;"></i>
                <h4 style="margin: 8px 0; font-size: 16px; color: #333;">Chat Offline</h4>
                <p style="font-size: 13px; margin: 0; line-height: 1.5;">
                    Chức năng chat đang được phát triển.<br>
                    Backend server chưa sẵn sàng.
                </p>
            </div>
        `;

        // Show message in online users
        document.getElementById('onlineUsersList').innerHTML = `
            <div style="padding: 12px; text-align: center; color: #999; font-size: 13px;">
                Offline
            </div>
        `;

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    setupEventListeners() {
        // New chat button - DISABLED in offline mode
        document.getElementById('newChatBtn').addEventListener('click', () => {
            this.showToast('⚠️ Chat đang ở chế độ offline - Backend chưa sẵn sàng', 'warning');
        });

        // Refresh button - DISABLED in offline mode
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.showToast('⚠️ Chat đang ở chế độ offline - Không thể làm mới', 'warning');
        });

        // Search conversations - keep as is (local filtering only)
        document.getElementById('searchConversations').addEventListener('input', (e) => {
            // Disabled in offline mode - no conversations to filter
        });

        // ALL OTHER EVENT LISTENERS DISABLED IN OFFLINE MODE
        // Message input, send, attach, modal - all require backend
        console.log('[CHAT-PAGE] ℹ️ Event listeners limited in offline mode');
    }

    setupChatClientCallbacks() {
        // New message received
        chatClient.onNewMessage = (chatId, message) => {
            console.log('[CHAT-PAGE] New message:', chatId, message);

            if (this.currentChatId === chatId) {
                this.addMessageToUI(message, false);
                this.scrollToBottom();

                // Mark as read
                chatClient.markAsRead(chatId, [message.id]).catch(console.error);
            }

            // Update conversation list
            this.updateConversationLastMessage(chatId, message);
        };

        // User typing
        chatClient.onUserTyping = (chatId, userId) => {
            if (this.currentChatId === chatId && userId !== chatClient.getUserId()) {
                this.showTypingIndicator();
            }
        };

        // User stopped typing
        chatClient.onUserStoppedTyping = (chatId, userId) => {
            if (this.currentChatId === chatId) {
                this.hideTypingIndicator();
            }
        };

        // User status changed
        chatClient.onUserStatus = (userId, online) => {
            this.updateUserStatus(userId, online);
        };

        // Connected
        chatClient.onConnected = () => {
            console.log('[CHAT-PAGE] Connected to chat server');
            this.showToast('Đã kết nối chat server', 'success');
        };

        // Disconnected
        chatClient.onDisconnected = () => {
            console.log('[CHAT-PAGE] Disconnected from chat server');
            this.showToast('Mất kết nối chat server, đang kết nối lại...', 'warning');
        };

        // Error
        chatClient.onError = (error) => {
            console.error('[CHAT-PAGE] Chat client error:', error);
        };
    }

    // =====================================================
    // CONVERSATIONS
    // =====================================================

    async loadConversations() {
        try {
            const conversations = await chatClient.getConversations();
            this.conversations = conversations;
            this.renderConversations(conversations);
        } catch (error) {
            console.error('[CHAT-PAGE] Failed to load conversations:', error);
            document.getElementById('conversationsList').innerHTML =
                '<div class="loading">Không thể tải hội thoại</div>';
        }
    }

    renderConversations(conversations) {
        const container = document.getElementById('conversationsList');

        if (!conversations || conversations.length === 0) {
            container.innerHTML = '<div class="loading">Chưa có hội thoại nào</div>';
            return;
        }

        container.innerHTML = conversations.map(chat => {
            const isGroup = chat.type === 'group';
            const name = isGroup ? chat.groupName : this.getChatName(chat);
            const lastMsg = chat.lastMessage;
            const unreadCount = chat.unreadCount?.[chatClient.getUserId()] || 0;

            return `
                <div class="conversation-item ${chat.id === this.currentChatId ? 'active' : ''}"
                     data-chat-id="${chat.id}">
                    <div class="avatar">
                        <i data-feather="${isGroup ? 'users' : 'user'}"></i>
                        ${!isGroup ? '<span class="status-dot"></span>' : ''}
                    </div>
                    <div class="conversation-info">
                        <div class="conversation-header">
                            <span class="name">${name}</span>
                            ${lastMsg ? `<span class="time">${this.formatTime(lastMsg.timestamp)}</span>` : ''}
                        </div>
                        <div class="last-message ${unreadCount > 0 ? 'unread' : ''}">
                            ${lastMsg ? this.formatLastMessage(lastMsg) : 'Bắt đầu trò chuyện'}
                            ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Add click listeners
        container.querySelectorAll('.conversation-item').forEach(item => {
            item.addEventListener('click', () => {
                this.openChat(item.dataset.chatId);
            });
        });

        feather.replace();
    }

    getChatName(chat) {
        const participants = chat.participantDetails || {};
        const otherUsers = Object.keys(participants).filter(id => id !== chatClient.getUserId());

        if (otherUsers.length === 0) return 'Unknown';

        const otherUser = participants[otherUsers[0]];
        return otherUser?.userName || otherUser?.displayName || 'Unknown';
    }

    formatLastMessage(msg) {
        if (!msg) return '';

        if (msg.type === 'image') return '📷 Hình ảnh';
        if (msg.type === 'file') return '📎 File';

        return msg.text || '';
    }

    formatTime(timestamp) {
        if (!timestamp) return '';

        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Vừa xong';
        if (diff < 3600000) return Math.floor(diff / 60000) + 'p';
        if (diff < 86400000) return Math.floor(diff / 3600000) + 'h';

        return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    }

    filterConversations(query) {
        const items = document.querySelectorAll('.conversation-item');
        const searchTerm = query.toLowerCase();

        items.forEach(item => {
            const name = item.querySelector('.name').textContent.toLowerCase();
            item.style.display = name.includes(searchTerm) ? '' : 'none';
        });
    }

    updateConversationLastMessage(chatId, message) {
        const chat = this.conversations.find(c => c.id === chatId);
        if (chat) {
            chat.lastMessage = {
                text: message.text,
                timestamp: message.createdAt,
                type: message.type
            };
            this.renderConversations(this.conversations);
        } else {
            // Reload conversations if new chat
            this.loadConversations();
        }
    }

    // =====================================================
    // ONLINE USERS
    // =====================================================

    async loadOnlineUsers() {
        try {
            const users = await chatClient.getUsers({ online: true });
            this.renderOnlineUsers(users);
        } catch (error) {
            console.error('[CHAT-PAGE] Failed to load online users:', error);
        }
    }

    renderOnlineUsers(users) {
        const container = document.getElementById('onlineUsersList');
        const currentUserId = chatClient.getUserId();

        // Filter out current user
        const otherUsers = users.filter(u => u.userId !== currentUserId);

        if (otherUsers.length === 0) {
            container.innerHTML = '<div class="loading">Không có ai online</div>';
            return;
        }

        container.innerHTML = otherUsers.map(user => `
            <div class="user-item" data-user-id="${user.userId}">
                <div class="avatar">
                    <i data-feather="user"></i>
                    <span class="status-badge"></span>
                </div>
                <span class="user-name">${user.userName || user.displayName}</span>
            </div>
        `).join('');

        // Add click listeners
        container.querySelectorAll('.user-item').forEach(item => {
            item.addEventListener('click', async () => {
                const userId = item.dataset.userId;
                await this.startDirectChat(userId);
            });
        });

        feather.replace();
    }

    async startDirectChat(userId) {
        try {
            const result = await chatClient.createChat([userId], 'direct');
            this.openChat(result.chatId);

            if (!result.existing) {
                await this.loadConversations();
            }
        } catch (error) {
            console.error('[CHAT-PAGE] Failed to start chat:', error);
            this.showToast('Không thể tạo chat', 'error');
        }
    }

    updateUserStatus(userId, online) {
        // Update in conversations list
        const items = document.querySelectorAll('.conversation-item');
        items.forEach(item => {
            const dot = item.querySelector('.status-dot');
            if (dot) {
                dot.classList.toggle('offline', !online);
            }
        });

        // Update in chat header if current chat
        if (this.currentChatId) {
            const currentChat = this.conversations.find(c => c.id === this.currentChatId);
            if (currentChat && currentChat.type === 'direct') {
                const participants = Object.keys(currentChat.participantDetails || {});
                const otherUserId = participants.find(id => id !== chatClient.getUserId());

                if (otherUserId === userId) {
                    const statusDot = document.querySelector('.chat-header .status-dot');
                    const statusText = document.getElementById('statusText');

                    if (statusDot) {
                        statusDot.classList.toggle('online', online);
                        statusDot.classList.toggle('offline', !online);
                    }

                    if (statusText) {
                        statusText.textContent = online ? 'Online' : 'Offline';
                    }
                }
            }
        }

        // Reload online users
        this.loadOnlineUsers();
    }

    // =====================================================
    // CHAT WINDOW
    // =====================================================

    async openChat(chatId) {
        console.log('[CHAT-PAGE] Opening chat:', chatId);

        this.currentChatId = chatId;

        // Update UI
        document.getElementById('emptyState').style.display = 'none';
        document.getElementById('chatWindow').style.display = 'flex';

        // Update active conversation
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.toggle('active', item.dataset.chatId === chatId);
        });

        // Load chat details
        const chat = this.conversations.find(c => c.id === chatId);
        if (!chat) {
            console.error('[CHAT-PAGE] Chat not found:', chatId);
            return;
        }

        // Update chat header
        this.updateChatHeader(chat);

        // Load messages
        await this.loadMessages(chatId);
    }

    updateChatHeader(chat) {
        const isGroup = chat.type === 'group';
        const name = isGroup ? chat.groupName : this.getChatName(chat);

        document.getElementById('chatName').textContent = name;

        // Update status
        if (!isGroup) {
            const participants = Object.keys(chat.participantDetails || {});
            const otherUserId = participants.find(id => id !== chatClient.getUserId());
            const otherUser = chat.participantDetails?.[otherUserId];

            const statusDot = document.querySelector('.chat-header .status-dot');
            const statusText = document.getElementById('statusText');

            // TODO: Get online status from server
            statusDot.classList.add('offline');
            statusText.textContent = 'Offline';
        } else {
            document.querySelector('.chat-header .status').style.display = 'none';
        }
    }

    async loadMessages(chatId) {
        const container = document.getElementById('messagesContainer');
        const loadingEl = document.querySelector('.loading-messages');

        loadingEl.style.display = 'flex';
        container.innerHTML = '';

        try {
            const messages = await chatClient.getMessages(chatId);

            loadingEl.style.display = 'none';

            if (messages.length === 0) {
                container.innerHTML = '<div class="loading">Chưa có tin nhắn nào</div>';
                return;
            }

            messages.forEach(msg => {
                this.addMessageToUI(msg, false);
            });

            this.scrollToBottom();

            // Mark all as read
            const unreadIds = messages
                .filter(m => !m.readBy?.includes(chatClient.getUserId()))
                .map(m => m.id);

            if (unreadIds.length > 0) {
                await chatClient.markAsRead(chatId, unreadIds);
            }
        } catch (error) {
            console.error('[CHAT-PAGE] Failed to load messages:', error);
            loadingEl.style.display = 'none';
            container.innerHTML = '<div class="loading">Không thể tải tin nhắn</div>';
        }
    }

    addMessageToUI(message, animate = true) {
        const container = document.getElementById('messagesContainer');
        const isSent = message.senderId === chatClient.getUserId();

        const messageEl = document.createElement('div');
        messageEl.className = `message ${isSent ? 'sent' : 'received'}`;
        if (animate) messageEl.style.animation = 'messageIn 0.3s ease-out';

        let bubbleContent = '';

        if (message.type === 'text') {
            bubbleContent = `<div class="message-bubble">${this.escapeHtml(message.text)}</div>`;
        } else if (message.type === 'image') {
            bubbleContent = `
                <div class="message-bubble image-message">
                    <img src="${message.fileUrl}" alt="${message.fileName}" onclick="window.open('${message.fileUrl}', '_blank')">
                </div>
            `;
        } else if (message.type === 'file') {
            bubbleContent = `
                <div class="message-bubble file-message">
                    <div class="file-icon">
                        <i data-feather="file"></i>
                    </div>
                    <div class="file-info">
                        <div class="file-name">${message.fileName}</div>
                        <div class="file-size">${this.formatFileSize(message.fileSize || 0)}</div>
                    </div>
                    <a href="${message.fileUrl}" download class="btn-icon">
                        <i data-feather="download"></i>
                    </a>
                </div>
            `;
        }

        messageEl.innerHTML = `
            ${!isSent ? `
                <div class="avatar">
                    <i data-feather="user"></i>
                </div>
            ` : ''}
            <div class="message-content">
                ${bubbleContent}
                <div class="message-time">${this.formatMessageTime(message.createdAt)}</div>
            </div>
        `;

        container.appendChild(messageEl);
        feather.replace();
    }

    formatMessageTime(timestamp) {
        if (!timestamp) return '';

        const date = new Date(timestamp);
        return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    scrollToBottom() {
        const messagesArea = document.getElementById('messagesArea');
        messagesArea.scrollTop = messagesArea.scrollHeight;
    }

    // =====================================================
    // TYPING INDICATOR
    // =====================================================

    showTypingIndicator() {
        document.getElementById('typingIndicator').style.display = 'flex';
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        document.getElementById('typingIndicator').style.display = 'none';
    }

    handleMessageInput() {
        const input = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn');

        // Enable/disable send button
        sendBtn.disabled = !input.value.trim();

        // Send typing indicator
        if (this.currentChatId && input.value.trim()) {
            chatClient.sendTyping(this.currentChatId);

            // Clear existing timeout
            if (this.typingTimeouts.has(this.currentChatId)) {
                clearTimeout(this.typingTimeouts.get(this.currentChatId));
            }

            // Set timeout to stop typing
            const timeout = setTimeout(() => {
                chatClient.stopTyping(this.currentChatId);
                this.typingTimeouts.delete(this.currentChatId);
            }, 3000);

            this.typingTimeouts.set(this.currentChatId, timeout);
        }
    }

    // =====================================================
    // SEND MESSAGE
    // =====================================================

    async sendMessage() {
        const input = document.getElementById('messageInput');
        const text = input.value.trim();

        if (!text || !this.currentChatId) return;

        try {
            // Stop typing indicator
            chatClient.stopTyping(this.currentChatId);

            // Send message
            const message = await chatClient.sendMessage(this.currentChatId, text);

            // Add to UI
            this.addMessageToUI(message, true);
            this.scrollToBottom();

            // Clear input
            input.value = '';
            input.style.height = 'auto';
            document.getElementById('sendBtn').disabled = true;

            // Update conversation list
            this.updateConversationLastMessage(this.currentChatId, message);
        } catch (error) {
            console.error('[CHAT-PAGE] Failed to send message:', error);
            this.showToast('Không thể gửi tin nhắn', 'error');
        }
    }

    async handleFileUpload(file) {
        if (!file || !this.currentChatId) return;

        try {
            this.showToast('Đang tải lên...', 'info');

            // Upload file
            const result = await chatClient.uploadFile(this.currentChatId, file);

            // Send message with file
            let message;
            if (result.fileType === 'image') {
                message = await chatClient.sendImage(this.currentChatId, result.fileUrl, result.fileName);
            } else {
                message = await chatClient.sendFile(this.currentChatId, result.fileUrl, result.fileName);
            }

            // Add to UI
            this.addMessageToUI(message, true);
            this.scrollToBottom();

            // Update conversation
            this.updateConversationLastMessage(this.currentChatId, message);

            this.showToast('Đã gửi file', 'success');
        } catch (error) {
            console.error('[CHAT-PAGE] Failed to upload file:', error);
            this.showToast('Không thể tải lên file', 'error');
        }

        // Reset file inputs
        document.getElementById('fileInput').value = '';
        document.getElementById('imageInput').value = '';
    }

    // =====================================================
    // NEW CHAT MODAL
    // =====================================================

    async openNewChatModal() {
        document.getElementById('newChatModal').style.display = 'flex';

        // Reset form
        document.querySelector('input[name="chatType"][value="direct"]').checked = true;
        document.getElementById('groupName').value = '';
        document.getElementById('groupNameGroup').style.display = 'none';
        this.selectedUsers.clear();

        // Load users
        await this.loadUsersForModal();

        feather.replace();
    }

    closeNewChatModal() {
        document.getElementById('newChatModal').style.display = 'none';
    }

    toggleGroupNameInput(show) {
        document.getElementById('groupNameGroup').style.display = show ? 'block' : 'none';
    }

    async loadUsersForModal() {
        const container = document.getElementById('usersSelectList');
        container.innerHTML = '<div class="loading">Đang tải...</div>';

        try {
            const users = await chatClient.getUsers();
            const currentUserId = chatClient.getUserId();

            // Filter out current user
            this.users = users.filter(u => u.userId !== currentUserId);

            this.renderUsersForModal(this.users);
        } catch (error) {
            console.error('[CHAT-PAGE] Failed to load users:', error);
            container.innerHTML = '<div class="loading">Không thể tải danh sách</div>';
        }
    }

    renderUsersForModal(users) {
        const container = document.getElementById('usersSelectList');

        if (users.length === 0) {
            container.innerHTML = '<div class="loading">Không có người dùng nào</div>';
            return;
        }

        container.innerHTML = users.map(user => `
            <div class="user-select-item" data-user-id="${user.userId}">
                <input type="checkbox" id="user_${user.userId}">
                <div class="avatar">
                    <i data-feather="user"></i>
                </div>
                <div class="user-info">
                    <div class="name">${user.userName || user.displayName}</div>
                    <div class="status">
                        <span class="status-dot ${user.online ? 'online' : ''}"></span>
                        ${user.online ? 'Online' : 'Offline'}
                    </div>
                </div>
            </div>
        `).join('');

        // Add click listeners
        container.querySelectorAll('.user-select-item').forEach(item => {
            item.addEventListener('click', () => {
                const checkbox = item.querySelector('input[type="checkbox"]');
                checkbox.checked = !checkbox.checked;
                this.toggleUserSelection(item.dataset.userId, checkbox.checked);
            });

            const checkbox = item.querySelector('input[type="checkbox"]');
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                this.toggleUserSelection(item.dataset.userId, e.target.checked);
            });
        });

        feather.replace();
    }

    toggleUserSelection(userId, selected) {
        if (selected) {
            this.selectedUsers.add(userId);
        } else {
            this.selectedUsers.delete(userId);
        }

        this.updateSelectedUsersDisplay();
    }

    updateSelectedUsersDisplay() {
        const container = document.getElementById('selectedUsers');
        const list = document.getElementById('selectedUsersList');
        const createBtn = document.getElementById('createChatBtn');
        const chatType = document.querySelector('input[name="chatType"]:checked').value;

        if (this.selectedUsers.size === 0) {
            container.style.display = 'none';
            createBtn.disabled = true;
            return;
        }

        // Check if valid selection
        if (chatType === 'direct' && this.selectedUsers.size !== 1) {
            createBtn.disabled = true;
        } else if (chatType === 'group' && this.selectedUsers.size < 2) {
            createBtn.disabled = true;
        } else {
            createBtn.disabled = false;
        }

        container.style.display = 'block';

        list.innerHTML = Array.from(this.selectedUsers).map(userId => {
            const user = this.users.find(u => u.userId === userId);
            return `
                <div class="selected-user-tag">
                    <span>${user?.userName || 'Unknown'}</span>
                    <button onclick="chatPage.toggleUserSelection('${userId}', false)">
                        <i data-feather="x"></i>
                    </button>
                </div>
            `;
        }).join('');

        feather.replace();
    }

    filterUsersInModal(query) {
        const items = document.querySelectorAll('.user-select-item');
        const searchTerm = query.toLowerCase();

        items.forEach(item => {
            const name = item.querySelector('.name').textContent.toLowerCase();
            item.style.display = name.includes(searchTerm) ? '' : 'none';
        });
    }

    async createChat() {
        const chatType = document.querySelector('input[name="chatType"]:checked').value;
        const participants = Array.from(this.selectedUsers);

        if (chatType === 'group') {
            const groupName = document.getElementById('groupName').value.trim();
            if (!groupName) {
                this.showToast('Vui lòng nhập tên nhóm', 'error');
                return;
            }

            try {
                const result = await chatClient.createChat(participants, 'group', groupName);
                this.closeNewChatModal();
                await this.loadConversations();
                this.openChat(result.chatId);
                this.showToast('Đã tạo nhóm chat', 'success');
            } catch (error) {
                console.error('[CHAT-PAGE] Failed to create group:', error);
                this.showToast('Không thể tạo nhóm', 'error');
            }
        } else {
            // Direct chat
            if (participants.length !== 1) {
                this.showToast('Chọn 1 người để chat', 'error');
                return;
            }

            await this.startDirectChat(participants[0]);
            this.closeNewChatModal();
        }
    }

    // =====================================================
    // UTILITIES
    // =====================================================

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        const messageEl = document.getElementById('toastMessage');

        messageEl.textContent = message;
        toast.style.display = 'block';

        setTimeout(() => {
            toast.style.display = 'none';
        }, 3000);
    }
}

// Initialize
const chatPage = new ChatPage();
window.chatPage = chatPage;
