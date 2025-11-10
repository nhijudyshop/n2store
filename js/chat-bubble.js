/**
 * Chat Bubble UI - Giao diện bong bóng chat
 * Hiển thị chat ở bất kỳ trang nào
 */

class ChatBubbleUI {
  constructor() {
    this.isOpen = false;
    this.currentView = 'conversations'; // 'conversations' hoặc 'chat'
    this.currentConversationId = null;
    this.messages = [];
    this.conversations = [];
    this.initialized = false;
  }

  /**
   * Khởi tạo UI
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Đợi ChatManager khởi tạo xong
      if (!window.ChatManager) {
        console.error('ChatManager chưa được khởi tạo');
        return;
      }

      await window.ChatManager.initialize();

      // Kiểm tra nếu ChatManager không khởi tạo được (user chưa đăng nhập)
      if (!window.ChatManager.initialized) {
        console.log('Chat bubble không khởi tạo - user chưa đăng nhập');
        return;
      }

      // Tạo HTML structure
      this.createChatBubble();
      this.createChatWindow();

      // Lắng nghe events từ ChatManager
      this.setupEventListeners();

      // Load conversations
      await this.loadConversations();

      this.initialized = true;
      console.log('Chat Bubble UI đã khởi tạo');
    } catch (error) {
      console.error('Lỗi khởi tạo Chat Bubble UI:', error);
    }
  }

  /**
   * Tạo nút chat bubble
   */
  createChatBubble() {
    const bubble = document.createElement('div');
    bubble.id = 'chat-bubble-btn';
    bubble.className = 'chat-bubble-btn';
    bubble.style.display = 'none'; // Ẩn mặc định, chỉ hiện khi có tin nhắn chưa đọc
    bubble.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
      </svg>
      <span class="chat-bubble-badge" style="display: none;">0</span>
    `;

    bubble.addEventListener('click', () => this.toggleChat());

    document.body.appendChild(bubble);
  }

  /**
   * Tạo cửa sổ chat
   */
  createChatWindow() {
    const chatWindow = document.createElement('div');
    chatWindow.id = 'chat-window';
    chatWindow.className = 'chat-window';
    chatWindow.style.display = 'none';

    chatWindow.innerHTML = `
      <div class="chat-header">
        <h3 class="chat-title">Tin nhắn</h3>
        <div class="chat-header-actions">
          <button class="chat-header-btn" id="chat-new-btn" title="Tin nhắn mới">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14M5 12h14"></path>
            </svg>
          </button>
          <button class="chat-header-btn" id="chat-close-btn" title="Đóng">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <div class="chat-body">
        <!-- Conversations List View -->
        <div class="chat-conversations-view" id="chat-conversations-view">
          <div class="chat-search">
            <input type="text" placeholder="Tìm kiếm..." id="chat-search-input">
          </div>
          <div class="chat-conversations-list" id="chat-conversations-list">
            <div class="chat-empty">
              <p>Chưa có cuộc trò chuyện nào</p>
            </div>
          </div>
        </div>

        <!-- Chat View -->
        <div class="chat-view" id="chat-view" style="display: none;">
          <div class="chat-view-header">
            <button class="chat-back-btn" id="chat-back-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 12H5M12 19l-7-7 7-7"></path>
              </svg>
            </button>
            <div class="chat-view-info">
              <h4 class="chat-view-name" id="chat-view-name">Tên người dùng</h4>
              <p class="chat-view-status" id="chat-view-status">Đang hoạt động</p>
            </div>
            <button class="chat-header-btn" id="chat-info-btn" title="Thông tin">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
            </button>
          </div>

          <div class="chat-messages" id="chat-messages">
            <div class="chat-empty">
              <p>Bắt đầu cuộc trò chuyện</p>
            </div>
          </div>

          <div class="chat-typing" id="chat-typing" style="display: none;">
            <span class="typing-dots">
              <span></span><span></span><span></span>
            </span>
            <span class="typing-text">đang nhập...</span>
          </div>

          <div class="chat-input">
            <button class="chat-attach-btn" id="chat-attach-btn" title="Đính kèm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
              </svg>
            </button>
            <button class="chat-image-btn" id="chat-image-btn" title="Hình ảnh">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <path d="M21 15l-5-5L5 21"></path>
              </svg>
            </button>
            <input type="text" class="chat-input-field" id="chat-input-field" placeholder="Nhập tin nhắn...">
            <button class="chat-send-btn" id="chat-send-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;

    // Hidden file inputs
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'chat-file-input';
    fileInput.style.display = 'none';
    fileInput.accept = '*/*';

    const imageInput = document.createElement('input');
    imageInput.type = 'file';
    imageInput.id = 'chat-image-input';
    imageInput.style.display = 'none';
    imageInput.accept = 'image/*';

    chatWindow.appendChild(fileInput);
    chatWindow.appendChild(imageInput);

    document.body.appendChild(chatWindow);

    // Setup button handlers
    this.setupButtonHandlers();
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Lắng nghe cập nhật conversations
    window.ChatManager.on('conversationsUpdated', (conversations) => {
      this.conversations = conversations;
      this.renderConversations();
      this.updateUnreadBadge();
    });

    // Lắng nghe cập nhật messages
    window.ChatManager.on('messagesUpdated', ({ conversationId, messages }) => {
      if (conversationId === this.currentConversationId) {
        this.messages = messages;
        this.renderMessages();
        this.scrollToBottom();

        // Đánh dấu đã đọc
        if (messages.length > 0) {
          const lastMessage = messages[messages.length - 1];
          window.ChatManager.markAsRead(conversationId, lastMessage.timestamp);
        }
      }
      this.updateUnreadBadge();
    });
  }

  /**
   * Setup button handlers
   */
  setupButtonHandlers() {
    // Close button
    document.getElementById('chat-close-btn').addEventListener('click', () => {
      this.toggleChat();
    });

    // Back button
    document.getElementById('chat-back-btn').addEventListener('click', () => {
      this.showConversationsView();
    });

    // Send button
    document.getElementById('chat-send-btn').addEventListener('click', () => {
      this.sendMessage();
    });

    // Input field
    const inputField = document.getElementById('chat-input-field');
    inputField.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Typing indicator
    inputField.addEventListener('input', () => {
      if (this.currentConversationId && inputField.value.trim()) {
        window.ChatManager.startTyping(this.currentConversationId);
      }
    });

    // Image button
    document.getElementById('chat-image-btn').addEventListener('click', () => {
      document.getElementById('chat-image-input').click();
    });

    // File button
    document.getElementById('chat-attach-btn').addEventListener('click', () => {
      document.getElementById('chat-file-input').click();
    });

    // Image input change
    document.getElementById('chat-image-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        await this.handleImageUpload(file);
        e.target.value = '';
      }
    });

    // File input change
    document.getElementById('chat-file-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        await this.handleFileUpload(file);
        e.target.value = '';
      }
    });

    // New message button
    document.getElementById('chat-new-btn').addEventListener('click', () => {
      this.showNewMessageDialog();
    });

    // Search input
    document.getElementById('chat-search-input').addEventListener('input', (e) => {
      this.filterConversations(e.target.value);
    });
  }

  /**
   * Toggle chat window
   */
  toggleChat() {
    this.isOpen = !this.isOpen;
    const chatWindow = document.getElementById('chat-window');

    if (this.isOpen) {
      chatWindow.style.display = 'flex';
      chatWindow.classList.add('chat-window-open');
    } else {
      chatWindow.classList.remove('chat-window-open');
      setTimeout(() => {
        chatWindow.style.display = 'none';
      }, 300);
    }
  }

  /**
   * Load conversations
   */
  async loadConversations() {
    try {
      this.conversations = await window.ChatManager.getConversationsWithUnreadCount();
      this.renderConversations();
      this.updateUnreadBadge();
    } catch (error) {
      console.error('Lỗi load conversations:', error);
    }
  }

  /**
   * Render conversations list
   */
  renderConversations() {
    const listEl = document.getElementById('chat-conversations-list');

    if (this.conversations.length === 0) {
      listEl.innerHTML = '<div class="chat-empty"><p>Chưa có cuộc trò chuyện nào</p></div>';
      return;
    }

    listEl.innerHTML = this.conversations.map(conv => {
      const members = Object.keys(conv.members || {}).filter(uid => uid !== window.ChatManager.currentUser.uid);
      const memberName = members.length > 0 ? members[0] : 'Unknown';
      const unreadBadge = conv.unreadCount > 0 ? `<span class="conversation-unread-badge">${conv.unreadCount}</span>` : '';
      const lastMessage = conv.lastMessage || 'Chưa có tin nhắn';
      const timeStr = this.formatTime(conv.lastMessageTimestamp);

      return `
        <div class="conversation-item" data-id="${conv.id}">
          <div class="conversation-avatar">
            <div class="avatar-circle">${memberName.charAt(0).toUpperCase()}</div>
          </div>
          <div class="conversation-content">
            <div class="conversation-header">
              <h4 class="conversation-name">${memberName}</h4>
              <span class="conversation-time">${timeStr}</span>
            </div>
            <div class="conversation-footer">
              <p class="conversation-last-message">${lastMessage}</p>
              ${unreadBadge}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Add click handlers
    listEl.querySelectorAll('.conversation-item').forEach(item => {
      item.addEventListener('click', () => {
        const conversationId = item.dataset.id;
        this.openConversation(conversationId);
      });
    });
  }

  /**
   * Open conversation
   */
  async openConversation(conversationId) {
    this.currentConversationId = conversationId;
    this.currentView = 'chat';

    // Show chat view
    document.getElementById('chat-conversations-view').style.display = 'none';
    document.getElementById('chat-view').style.display = 'flex';

    // Update header
    const conversation = this.conversations.find(c => c.id === conversationId);
    if (conversation) {
      const members = Object.keys(conversation.members || {}).filter(uid => uid !== window.ChatManager.currentUser.uid);
      const memberName = members.length > 0 ? members[0] : 'Unknown';
      document.getElementById('chat-view-name').textContent = memberName;

      // Get user status
      if (members.length > 0) {
        const userInfo = await window.ChatManager.getUserInfo(members[0]);
        const statusText = userInfo.status === 'online' ? 'Đang hoạt động' : 'Không hoạt động';
        document.getElementById('chat-view-status').textContent = statusText;
        document.getElementById('chat-view-status').className = `chat-view-status status-${userInfo.status}`;
      }
    }

    // Listen to typing
    window.ChatManager.listenToTyping(conversationId, (typingUsers) => {
      const typingEl = document.getElementById('chat-typing');
      if (typingUsers.length > 0) {
        typingEl.querySelector('.typing-text').textContent = `${typingUsers[0]} đang nhập...`;
        typingEl.style.display = 'flex';
      } else {
        typingEl.style.display = 'none';
      }
    });

    // Messages will be rendered via event listener
  }

  /**
   * Show conversations view
   */
  showConversationsView() {
    this.currentView = 'conversations';
    this.currentConversationId = null;
    document.getElementById('chat-view').style.display = 'none';
    document.getElementById('chat-conversations-view').style.display = 'flex';
  }

  /**
   * Render messages
   */
  renderMessages() {
    const messagesEl = document.getElementById('chat-messages');

    if (this.messages.length === 0) {
      messagesEl.innerHTML = '<div class="chat-empty"><p>Bắt đầu cuộc trò chuyện</p></div>';
      return;
    }

    messagesEl.innerHTML = this.messages.map(msg => {
      const isOwn = msg.senderId === window.ChatManager.currentUser.uid;
      const messageClass = isOwn ? 'message-own' : 'message-other';
      const timeStr = this.formatTime(msg.timestamp);

      let contentHtml = '';

      switch (msg.type) {
        case 'text':
          contentHtml = `<p class="message-text">${this.escapeHtml(msg.content)}</p>`;
          break;

        case 'image':
          contentHtml = `
            <div class="message-image">
              <img src="${msg.content}" alt="Image" />
              ${msg.caption ? `<p class="message-caption">${this.escapeHtml(msg.caption)}</p>` : ''}
            </div>
          `;
          break;

        case 'file':
          contentHtml = `
            <div class="message-file">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                <polyline points="13 2 13 9 20 9"></polyline>
              </svg>
              <div class="file-info">
                <p class="file-name">${this.escapeHtml(msg.fileName)}</p>
                <p class="file-size">${this.formatFileSize(msg.fileSize)}</p>
              </div>
            </div>
          `;
          break;

        case 'phone':
          contentHtml = `
            <div class="message-phone">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
              </svg>
              <div class="phone-info">
                ${msg.contactName ? `<p class="phone-name">${this.escapeHtml(msg.contactName)}</p>` : ''}
                <p class="phone-number">${this.escapeHtml(msg.content)}</p>
              </div>
            </div>
          `;
          break;
      }

      return `
        <div class="message ${messageClass}">
          <div class="message-content">
            ${contentHtml}
            <span class="message-time">${timeStr}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Send message
   */
  async sendMessage() {
    const inputField = document.getElementById('chat-input-field');
    const text = inputField.value.trim();

    if (!text || !this.currentConversationId) return;

    try {
      await window.ChatManager.sendTextMessage(this.currentConversationId, text);
      inputField.value = '';
    } catch (error) {
      console.error('Lỗi gửi tin nhắn:', error);
      alert('Không thể gửi tin nhắn. Vui lòng thử lại.');
    }
  }

  /**
   * Handle image upload
   */
  async handleImageUpload(file) {
    if (!this.currentConversationId) return;

    try {
      const fileData = await window.ChatManager.uploadFile(file);
      await window.ChatManager.sendImageMessage(this.currentConversationId, fileData.data, '');
    } catch (error) {
      console.error('Lỗi upload image:', error);
      alert('Không thể tải ảnh lên. Vui lòng thử lại.');
    }
  }

  /**
   * Handle file upload
   */
  async handleFileUpload(file) {
    if (!this.currentConversationId) return;

    try {
      const fileData = await window.ChatManager.uploadFile(file);
      await window.ChatManager.sendFileMessage(
        this.currentConversationId,
        fileData.data,
        fileData.name,
        fileData.size
      );
    } catch (error) {
      console.error('Lỗi upload file:', error);
      alert('Không thể tải file lên. Vui lòng thử lại.');
    }
  }

  /**
   * Show new message dialog
   */
  showNewMessageDialog() {
    const userId = prompt('Nhập ID người dùng để bắt đầu trò chuyện:');
    if (userId && userId.trim()) {
      this.createNewConversation(userId.trim());
    }
  }

  /**
   * Create new conversation
   */
  async createNewConversation(userId) {
    try {
      const conversationId = await window.ChatManager.createOrGetConversation([userId]);
      await this.loadConversations();
      this.openConversation(conversationId);
    } catch (error) {
      console.error('Lỗi tạo conversation:', error);
      alert('Không thể tạo cuộc trò chuyện. Vui lòng thử lại.');
    }
  }

  /**
   * Filter conversations
   */
  filterConversations(searchText) {
    const items = document.querySelectorAll('.conversation-item');
    const search = searchText.toLowerCase();

    items.forEach(item => {
      const name = item.querySelector('.conversation-name').textContent.toLowerCase();
      const lastMessage = item.querySelector('.conversation-last-message').textContent.toLowerCase();

      if (name.includes(search) || lastMessage.includes(search)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });
  }

  /**
   * Update unread badge
   */
  async updateUnreadBadge() {
    const totalUnread = this.conversations.reduce((sum, conv) => sum + (conv.unreadCount || 0), 0);
    const badge = document.querySelector('.chat-bubble-badge');
    const bubble = document.getElementById('chat-bubble-btn');

    if (totalUnread > 0) {
      // Hiển thị bubble khi có tin nhắn chưa đọc
      if (bubble) bubble.style.display = 'flex';
      badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
      badge.style.display = 'flex';
    } else {
      // Ẩn bubble khi không có tin nhắn chưa đọc
      if (bubble) bubble.style.display = 'none';
      badge.style.display = 'none';
    }
  }

  /**
   * Scroll to bottom
   */
  scrollToBottom() {
    const messagesEl = document.getElementById('chat-messages');
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  /**
   * Format time
   */
  formatTime(timestamp) {
    if (!timestamp) return '';

    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    // Dưới 1 phút
    if (diff < 60000) {
      return 'Vừa xong';
    }

    // Dưới 1 giờ
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes} phút`;
    }

    // Dưới 1 ngày
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours} giờ`;
    }

    // Dưới 1 tuần
    if (diff < 604800000) {
      const days = Math.floor(diff / 86400000);
      return `${days} ngày`;
    }

    // Format date
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  }

  /**
   * Format file size
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Escape HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.ChatBubbleUI = new ChatBubbleUI();
    window.ChatBubbleUI.initialize();
  });
} else {
  window.ChatBubbleUI = new ChatBubbleUI();
  window.ChatBubbleUI.initialize();
}
