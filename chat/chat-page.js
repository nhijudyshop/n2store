/**
 * Chat Page Script
 * Full-page chat interface logic
 */

class ChatPageApp {
  constructor() {
    this.currentConversationId = null;
    this.conversations = [];
    this.messages = [];
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Wait for core utilities to load
      if (!window.ChatManager) {
        console.log('Đợi ChatManager khởi tạo...');
        await this.waitForChatManager();
      }

      await window.ChatManager.initialize();

      // Kiểm tra nếu ChatManager không khởi tạo được (user chưa đăng nhập)
      if (!window.ChatManager.initialized) {
        console.log('Chat page không thể khởi tạo - user chưa đăng nhập');
        this.showLoginRequiredMessage();
        return;
      }

      // Initialize UserService
      if (window.UserService) {
        await window.UserService.initialize();
        await window.UserService.loadUsers();
      }

      // Setup event listeners
      this.setupEventListeners();
      this.setupChatManagerEvents();
      this.setupUserModalEvents();

      // Load conversations
      await this.loadConversations();

      this.initialized = true;
      console.log('Chat Page đã khởi tạo thành công');
    } catch (error) {
      console.error('Lỗi khởi tạo Chat Page:', error);
    }
  }

  waitForChatManager() {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (window.ChatManager) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  setupEventListeners() {
    // New chat button
    document.getElementById('btn-new-chat').addEventListener('click', () => {
      this.showNewChatDialog();
    });

    document.getElementById('btn-start-chat').addEventListener('click', () => {
      this.showNewChatDialog();
    });

    // Search
    document.getElementById('sidebar-search-input').addEventListener('input', (e) => {
      this.filterConversations(e.target.value);
    });

    // Send button
    document.getElementById('btn-send').addEventListener('click', () => {
      this.sendMessage();
    });

    // Input field
    const inputField = document.getElementById('main-input-field');
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
    document.getElementById('btn-image').addEventListener('click', () => {
      document.getElementById('hidden-image-input').click();
    });

    // File button
    document.getElementById('btn-attach').addEventListener('click', () => {
      document.getElementById('hidden-file-input').click();
    });

    // Image input
    document.getElementById('hidden-image-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        await this.handleImageUpload(file);
        e.target.value = '';
      }
    });

    // File input
    document.getElementById('hidden-file-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        await this.handleFileUpload(file);
        e.target.value = '';
      }
    });
  }

  setupChatManagerEvents() {
    // Listen for conversations updates
    window.ChatManager.on('conversationsUpdated', (conversations) => {
      this.conversations = conversations;
      this.renderConversations();
    });

    // Listen for messages updates
    window.ChatManager.on('messagesUpdated', ({ conversationId, messages }) => {
      if (conversationId === this.currentConversationId) {
        this.messages = messages;
        this.renderMessages();
        this.scrollToBottom();

        // Mark as read
        if (messages.length > 0) {
          const lastMessage = messages[messages.length - 1];
          window.ChatManager.markAsRead(conversationId, lastMessage.timestamp);
        }
      }
    });
  }

  async loadConversations() {
    try {
      this.conversations = await window.ChatManager.getConversationsWithUnreadCount();
      this.renderConversations();
    } catch (error) {
      console.error('Lỗi load conversations:', error);
    }
  }

  renderConversations() {
    const listEl = document.getElementById('sidebar-conversations-list');

    if (this.conversations.length === 0) {
      listEl.innerHTML = `
        <div class="chat-empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
          </svg>
          <p>Chưa có cuộc trò chuyện nào</p>
          <button class="btn-start-chat" id="btn-start-chat">Bắt đầu trò chuyện</button>
        </div>
      `;

      // Re-attach event listener
      document.getElementById('btn-start-chat').addEventListener('click', () => {
        this.showNewChatDialog();
      });
      return;
    }

    listEl.innerHTML = this.conversations.map(conv => {
      const members = Object.keys(conv.members || {}).filter(uid => uid !== window.ChatManager.currentUser.uid);
      const memberUid = members.length > 0 ? members[0] : 'Unknown';
      // Get display name from UserService
      const memberName = window.UserService ? window.UserService.getDisplayName(memberUid) : memberUid;
      const unreadBadge = conv.unreadCount > 0 ? `<span class="sidebar-conversation-badge">${conv.unreadCount}</span>` : '';
      const lastMessage = conv.lastMessage || 'Chưa có tin nhắn';
      const timeStr = this.formatTime(conv.lastMessageTimestamp);
      const isActive = conv.id === this.currentConversationId ? 'active' : '';

      return `
        <div class="sidebar-conversation-item ${isActive}" data-id="${conv.id}">
          <div class="user-avatar">
            <span>${memberName.charAt(0).toUpperCase()}</span>
          </div>
          <div class="sidebar-conversation-content">
            <div class="sidebar-conversation-header">
              <div class="sidebar-conversation-name">${this.escapeHtml(memberName)}</div>
              <div class="sidebar-conversation-time">${timeStr}</div>
            </div>
            <div class="sidebar-conversation-footer">
              <div class="sidebar-conversation-message">${this.escapeHtml(lastMessage)}</div>
              ${unreadBadge}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach click handlers
    listEl.querySelectorAll('.sidebar-conversation-item').forEach(item => {
      item.addEventListener('click', () => {
        const conversationId = item.dataset.id;
        this.openConversation(conversationId);
      });
    });
  }

  async openConversation(conversationId) {
    this.currentConversationId = conversationId;

    // Show chat content
    document.getElementById('chat-main-empty').style.display = 'none';
    document.getElementById('chat-main-content').style.display = 'flex';

    // Update header
    const conversation = this.conversations.find(c => c.id === conversationId);
    if (conversation) {
      const members = Object.keys(conversation.members || {}).filter(uid => uid !== window.ChatManager.currentUser.uid);
      const memberUid = members.length > 0 ? members[0] : 'Unknown';
      // Get display name from UserService
      const memberName = window.UserService ? window.UserService.getDisplayName(memberUid) : memberUid;

      document.getElementById('main-user-name').textContent = memberName;
      document.getElementById('main-user-avatar').innerHTML = `<span>${memberName.charAt(0).toUpperCase()}</span>`;

      // Get user status
      if (members.length > 0) {
        const userInfo = await window.ChatManager.getUserInfo(members[0]);
        const statusText = userInfo.status === 'online' ? 'Đang hoạt động' : 'Không hoạt động';
        const statusEl = document.getElementById('main-user-status');
        statusEl.textContent = statusText;
        statusEl.className = userInfo.status === 'online' ? 'status-online' : 'status-offline';
      }
    }

    // Update active state in sidebar
    this.renderConversations();

    // Listen to typing
    window.ChatManager.listenToTyping(conversationId, (typingUsers) => {
      const typingEl = document.getElementById('main-typing-indicator');
      if (typingUsers.length > 0) {
        typingEl.querySelector('.typing-text').textContent = `${typingUsers[0]} đang nhập...`;
        typingEl.style.display = 'flex';
      } else {
        typingEl.style.display = 'none';
      }
    });

    // Messages will be rendered via event listener
  }

  renderMessages() {
    const messagesEl = document.getElementById('main-messages-area');

    if (this.messages.length === 0) {
      messagesEl.innerHTML = `
        <div class="chat-empty-state">
          <p>Bắt đầu cuộc trò chuyện</p>
        </div>
      `;
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
              <img src="${msg.content}" alt="Image" style="max-width: 100%; border-radius: 8px; display: block;" />
              ${msg.caption ? `<p class="message-caption">${this.escapeHtml(msg.caption)}</p>` : ''}
            </div>
          `;
          break;

        case 'file':
          contentHtml = `
            <div class="message-file" style="display: flex; align-items: center; gap: 12px; padding: 8px; background: rgba(255, 255, 255, 0.1); border-radius: 8px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 32px; height: 32px;">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                <polyline points="13 2 13 9 20 9"></polyline>
              </svg>
              <div>
                <p style="margin: 0 0 2px 0; font-size: 14px; font-weight: 500;">${this.escapeHtml(msg.fileName)}</p>
                <p style="margin: 0; font-size: 12px; opacity: 0.7;">${this.formatFileSize(msg.fileSize)}</p>
              </div>
            </div>
          `;
          break;

        case 'phone':
          contentHtml = `
            <div class="message-phone" style="display: flex; align-items: center; gap: 12px; padding: 8px; background: rgba(255, 255, 255, 0.1); border-radius: 8px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 24px; height: 24px;">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
              </svg>
              <div>
                ${msg.contactName ? `<p style="margin: 0 0 2px 0; font-size: 14px; font-weight: 500;">${this.escapeHtml(msg.contactName)}</p>` : ''}
                <p style="margin: 0; font-size: 14px;">${this.escapeHtml(msg.content)}</p>
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

  async sendMessage() {
    const inputField = document.getElementById('main-input-field');
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

  showNewChatDialog() {
    // Show modal to select user
    this.openUserSelectionModal();
  }

  setupUserModalEvents() {
    // Close modal button
    const closeBtn = document.getElementById('btn-close-user-modal');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.closeUserSelectionModal();
      });
    }

    // Click outside modal to close
    const modalOverlay = document.getElementById('modal-select-user');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
          this.closeUserSelectionModal();
        }
      });
    }

    // User search
    const searchInput = document.getElementById('user-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.filterUserList(e.target.value);
      });
    }
  }

  async openUserSelectionModal() {
    const modal = document.getElementById('modal-select-user');
    const userList = document.getElementById('user-list');

    if (!modal || !userList) return;

    // Show modal
    modal.style.display = 'flex';

    // Load users
    if (!window.UserService) {
      userList.innerHTML = '<div class="empty-user-list"><p>User service không khả dụng</p></div>';
      return;
    }

    const currentUser = window.ChatManager.currentUser;
    const users = window.UserService.getUsersExceptCurrent(currentUser?.username || currentUser?.uid);

    this.renderUserList(users);
  }

  closeUserSelectionModal() {
    const modal = document.getElementById('modal-select-user');
    if (modal) {
      modal.style.display = 'none';
    }

    // Clear search
    const searchInput = document.getElementById('user-search-input');
    if (searchInput) {
      searchInput.value = '';
    }
  }

  renderUserList(users) {
    const userList = document.getElementById('user-list');
    if (!userList) return;

    if (!users || users.length === 0) {
      userList.innerHTML = `
        <div class="empty-user-list">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="8.5" cy="7" r="4"></circle>
            <line x1="20" y1="8" x2="20" y2="14"></line>
            <line x1="23" y1="11" x2="17" y2="11"></line>
          </svg>
          <p>Không tìm thấy người dùng nào</p>
        </div>
      `;
      return;
    }

    userList.innerHTML = users.map(user => {
      const displayName = user.displayName || user.username || user.id;
      const roleName = window.UserService.getRoleName(user.checkLogin);
      const initial = displayName.charAt(0).toUpperCase();

      return `
        <div class="user-item" data-user-id="${this.escapeHtml(user.username || user.id)}">
          <div class="user-item-avatar">${initial}</div>
          <div class="user-item-info">
            <div class="user-item-name">${this.escapeHtml(displayName)}</div>
            <div class="user-item-role">${roleName}</div>
          </div>
        </div>
      `;
    }).join('');

    // Add click handlers
    userList.querySelectorAll('.user-item').forEach(item => {
      item.addEventListener('click', () => {
        const userId = item.getAttribute('data-user-id');
        this.handleUserSelected(userId);
      });
    });
  }

  filterUserList(searchQuery) {
    if (!window.UserService) return;

    const currentUser = window.ChatManager.currentUser;
    const users = window.UserService.searchUsers(
      searchQuery,
      currentUser?.username || currentUser?.uid
    );

    this.renderUserList(users);
  }

  async handleUserSelected(userId) {
    this.closeUserSelectionModal();
    this.createNewConversation(userId);
  }

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

  filterConversations(searchText) {
    const items = document.querySelectorAll('.sidebar-conversation-item');
    const search = searchText.toLowerCase();

    items.forEach(item => {
      const name = item.querySelector('.sidebar-conversation-name').textContent.toLowerCase();
      const message = item.querySelector('.sidebar-conversation-message').textContent.toLowerCase();

      if (name.includes(search) || message.includes(search)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });
  }

  scrollToBottom() {
    const messagesEl = document.getElementById('main-messages-area');
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

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
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  showLoginRequiredMessage() {
    const mainEmpty = document.getElementById('chat-main-empty');
    if (mainEmpty) {
      mainEmpty.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"></path>
          <path d="M12 6v6l4 2"></path>
        </svg>
        <h3>Vui lòng đăng nhập</h3>
        <p>Bạn cần đăng nhập để sử dụng hệ thống chat</p>
      `;
      mainEmpty.style.display = 'flex';
    }

    // Hide sidebar
    const sidebar = document.querySelector('.chat-sidebar');
    if (sidebar) {
      sidebar.style.display = 'none';
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.chatPageApp = new ChatPageApp();
    window.chatPageApp.initialize();
  });
} else {
  window.chatPageApp = new ChatPageApp();
  window.chatPageApp.initialize();
}
