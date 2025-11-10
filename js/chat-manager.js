/**
 * Chat Manager - Hệ thống quản lý chat nội bộ
 * Hỗ trợ: văn bản, hình ảnh, file, số điện thoại
 * Real-time sync với Firebase
 */

class ChatManager {
  constructor() {
    this.db = null;
    this.currentUser = null;
    this.conversations = new Map();
    this.listeners = new Map();
    this.typingTimeouts = new Map();
    this.initialized = false;
  }

  /**
   * Khởi tạo chat manager
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Import Firebase v9 modules
      const firebaseApp = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js');
      const firebaseDatabase = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js');

      // Khởi tạo Firebase app nếu chưa có
      let app;
      try {
        app = firebaseApp.getApp();
      } catch (error) {
        // App chưa tồn tại, khởi tạo mới
        if (window.FIREBASE_CONFIG) {
          app = firebaseApp.initializeApp(window.FIREBASE_CONFIG);
          console.log('✅ Firebase app đã được khởi tạo cho chat');
        } else {
          throw new Error('FIREBASE_CONFIG không tồn tại');
        }
      }

      // Lấy database instance
      this.db = firebaseDatabase.getDatabase(app);
      this.dbRef = firebaseDatabase.ref;
      this.dbOnValue = firebaseDatabase.onValue;
      this.dbOff = firebaseDatabase.off;

      // Import thêm các functions cần thiết
      const dbModule = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js');
      this.dbSet = dbModule.set;
      this.dbUpdate = dbModule.update;
      this.dbPush = dbModule.push;
      this.dbRemove = dbModule.remove;
      this.dbGet = dbModule.get;
      this.dbQuery = dbModule.query;
      this.dbOrderByChild = dbModule.orderByChild;
      this.dbLimitToLast = dbModule.limitToLast;
      this.dbServerTimestamp = dbModule.serverTimestamp;

      // Lấy thông tin user hiện tại
      if (window.AuthManager) {
        const authData = window.AuthManager.getAuthData();
        if (authData) {
          this.currentUser = {
            uid: authData.uid || authData.username,
            displayName: authData.displayName || authData.username,
            username: authData.username
          };
        }
      }

      if (!this.currentUser) {
        throw new Error('Người dùng chưa đăng nhập');
      }

      // Cập nhật trạng thái online
      await this.updateUserStatus('online');

      // Lắng nghe khi user offline
      window.addEventListener('beforeunload', () => {
        this.updateUserStatus('offline');
      });

      // Lắng nghe conversations
      this.listenToConversations();

      this.initialized = true;
      console.log('Chat Manager đã khởi tạo thành công');
    } catch (error) {
      console.error('Lỗi khởi tạo Chat Manager:', error);
      throw error;
    }
  }

  /**
   * Cập nhật trạng thái người dùng (online/offline)
   */
  async updateUserStatus(status) {
    if (!this.db || !this.currentUser) return;

    try {
      const statusRef = this.dbRef(this.db, `userStatus/${this.currentUser.uid}`);
      await this.dbSet(statusRef, {
        status: status,
        lastActive: this.dbServerTimestamp(),
        displayName: this.currentUser.displayName
      });
    } catch (error) {
      console.error('Lỗi cập nhật trạng thái:', error);
    }
  }

  /**
   * Lắng nghe tất cả conversations của user
   */
  listenToConversations() {
    const conversationsRef = this.dbRef(this.db, 'chatConversations');

    this.dbOnValue(conversationsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        Object.keys(data).forEach(conversationId => {
          const conversation = data[conversationId];
          // Chỉ lấy conversations mà user là thành viên
          if (conversation.members && conversation.members[this.currentUser.uid]) {
            this.conversations.set(conversationId, conversation);
            // Lắng nghe messages của conversation này
            this.listenToMessages(conversationId);
          }
        });

        // Trigger event
        this.triggerEvent('conversationsUpdated', Array.from(this.conversations.values()));
      }
    });
  }

  /**
   * Lắng nghe messages của một conversation
   */
  listenToMessages(conversationId) {
    // Nếu đã có listener thì bỏ qua
    if (this.listeners.has(conversationId)) return;

    const messagesRef = this.dbRef(this.db, `chatMessages/${conversationId}`);
    const messagesQuery = this.dbQuery(
      messagesRef,
      this.dbOrderByChild('timestamp'),
      this.dbLimitToLast(100) // Lấy 100 tin nhắn gần nhất
    );

    const unsubscribe = this.dbOnValue(messagesQuery, (snapshot) => {
      const messages = [];
      if (snapshot.exists()) {
        snapshot.forEach((childSnapshot) => {
          messages.push({
            id: childSnapshot.key,
            ...childSnapshot.val()
          });
        });
      }

      // Trigger event
      this.triggerEvent('messagesUpdated', { conversationId, messages });
    });

    this.listeners.set(conversationId, unsubscribe);
  }

  /**
   * Tạo conversation mới hoặc lấy conversation hiện có
   */
  async createOrGetConversation(participantIds, type = 'direct') {
    try {
      // Thêm current user vào danh sách
      const allParticipants = [this.currentUser.uid, ...participantIds].filter((id, index, self) =>
        self.indexOf(id) === index
      );

      // Kiểm tra conversation đã tồn tại chưa
      const existingConversation = this.findExistingConversation(allParticipants, type);
      if (existingConversation) {
        return existingConversation.id;
      }

      // Tạo conversation mới
      const conversationsRef = this.dbRef(this.db, 'chatConversations');
      const newConversationRef = this.dbPush(conversationsRef);
      const conversationId = newConversationRef.key;

      // Tạo members object
      const members = {};
      allParticipants.forEach(uid => {
        members[uid] = true;
      });

      const conversationData = {
        id: conversationId,
        type: type, // 'direct' hoặc 'group'
        members: members,
        createdAt: this.dbServerTimestamp(),
        createdBy: this.currentUser.uid,
        lastMessageTimestamp: this.dbServerTimestamp(),
        lastMessage: null
      };

      await this.dbSet(newConversationRef, conversationData);

      // Thêm members vào chatMembers
      for (const uid of allParticipants) {
        const memberRef = this.dbRef(this.db, `chatMembers/${conversationId}/${uid}`);
        await this.dbSet(memberRef, {
          userId: uid,
          joinedAt: this.dbServerTimestamp(),
          lastReadTimestamp: Date.now()
        });
      }

      return conversationId;
    } catch (error) {
      console.error('Lỗi tạo conversation:', error);
      throw error;
    }
  }

  /**
   * Tìm conversation hiện có
   */
  findExistingConversation(participantIds, type) {
    for (const [id, conversation] of this.conversations.entries()) {
      if (conversation.type !== type) continue;

      const conversationMembers = Object.keys(conversation.members || {});
      if (conversationMembers.length !== participantIds.length) continue;

      const allMatch = participantIds.every(uid => conversation.members[uid]);
      if (allMatch) {
        return { id, ...conversation };
      }
    }
    return null;
  }

  /**
   * Gửi tin nhắn văn bản
   */
  async sendTextMessage(conversationId, text) {
    return this.sendMessage(conversationId, {
      type: 'text',
      content: text
    });
  }

  /**
   * Gửi tin nhắn hình ảnh
   */
  async sendImageMessage(conversationId, imageData, caption = '') {
    return this.sendMessage(conversationId, {
      type: 'image',
      content: imageData, // base64 hoặc URL
      caption: caption
    });
  }

  /**
   * Gửi tin nhắn file
   */
  async sendFileMessage(conversationId, fileData, fileName, fileSize) {
    return this.sendMessage(conversationId, {
      type: 'file',
      content: fileData, // base64 hoặc URL
      fileName: fileName,
      fileSize: fileSize
    });
  }

  /**
   * Gửi tin nhắn số điện thoại
   */
  async sendPhoneMessage(conversationId, phoneNumber, contactName = '') {
    return this.sendMessage(conversationId, {
      type: 'phone',
      content: phoneNumber,
      contactName: contactName
    });
  }

  /**
   * Gửi tin nhắn (core function)
   */
  async sendMessage(conversationId, messageData) {
    try {
      const messagesRef = this.dbRef(this.db, `chatMessages/${conversationId}`);
      const newMessageRef = this.dbPush(messagesRef);

      const message = {
        id: newMessageRef.key,
        senderId: this.currentUser.uid,
        senderName: this.currentUser.displayName,
        timestamp: this.dbServerTimestamp(),
        ...messageData,
        status: 'sent' // sent, delivered, read
      };

      await this.dbSet(newMessageRef, message);

      // Cập nhật lastMessage của conversation
      const conversationRef = this.dbRef(this.db, `chatConversations/${conversationId}`);
      await this.dbUpdate(conversationRef, {
        lastMessage: messageData.type === 'text' ? messageData.content : `[${this.getMessageTypeLabel(messageData.type)}]`,
        lastMessageTimestamp: this.dbServerTimestamp(),
        lastMessageSenderId: this.currentUser.uid
      });

      // Xóa typing indicator
      this.stopTyping(conversationId);

      return message;
    } catch (error) {
      console.error('Lỗi gửi tin nhắn:', error);
      throw error;
    }
  }

  /**
   * Lấy label cho loại tin nhắn
   */
  getMessageTypeLabel(type) {
    const labels = {
      text: 'Tin nhắn',
      image: 'Hình ảnh',
      file: 'File',
      phone: 'Số điện thoại'
    };
    return labels[type] || 'Tin nhắn';
  }

  /**
   * Đánh dấu đang nhập
   */
  async startTyping(conversationId) {
    try {
      const typingRef = this.dbRef(this.db, `chatTyping/${conversationId}/${this.currentUser.uid}`);
      await this.dbSet(typingRef, {
        displayName: this.currentUser.displayName,
        timestamp: this.dbServerTimestamp()
      });

      // Auto remove sau 3 giây
      if (this.typingTimeouts.has(conversationId)) {
        clearTimeout(this.typingTimeouts.get(conversationId));
      }

      const timeout = setTimeout(() => {
        this.stopTyping(conversationId);
      }, 3000);

      this.typingTimeouts.set(conversationId, timeout);
    } catch (error) {
      console.error('Lỗi cập nhật typing:', error);
    }
  }

  /**
   * Dừng typing indicator
   */
  async stopTyping(conversationId) {
    try {
      const typingRef = this.dbRef(this.db, `chatTyping/${conversationId}/${this.currentUser.uid}`);
      await this.dbRemove(typingRef);

      if (this.typingTimeouts.has(conversationId)) {
        clearTimeout(this.typingTimeouts.get(conversationId));
        this.typingTimeouts.delete(conversationId);
      }
    } catch (error) {
      console.error('Lỗi xóa typing:', error);
    }
  }

  /**
   * Lắng nghe typing của người khác
   */
  listenToTyping(conversationId, callback) {
    const typingRef = this.dbRef(this.db, `chatTyping/${conversationId}`);

    this.dbOnValue(typingRef, (snapshot) => {
      const typingUsers = [];
      if (snapshot.exists()) {
        const data = snapshot.val();
        Object.keys(data).forEach(uid => {
          if (uid !== this.currentUser.uid) {
            typingUsers.push(data[uid].displayName);
          }
        });
      }
      callback(typingUsers);
    });
  }

  /**
   * Đánh dấu đã đọc tin nhắn
   */
  async markAsRead(conversationId, lastMessageTimestamp) {
    try {
      const memberRef = this.dbRef(this.db, `chatMembers/${conversationId}/${this.currentUser.uid}`);
      await this.dbUpdate(memberRef, {
        lastReadTimestamp: lastMessageTimestamp || Date.now()
      });
    } catch (error) {
      console.error('Lỗi đánh dấu đã đọc:', error);
    }
  }

  /**
   * Lấy số tin nhắn chưa đọc
   */
  async getUnreadCount(conversationId) {
    try {
      const memberRef = this.dbRef(this.db, `chatMembers/${conversationId}/${this.currentUser.uid}`);
      const memberSnapshot = await this.dbGet(memberRef);

      if (!memberSnapshot.exists()) return 0;

      const lastReadTimestamp = memberSnapshot.val().lastReadTimestamp || 0;

      const messagesRef = this.dbRef(this.db, `chatMessages/${conversationId}`);
      const messagesSnapshot = await this.dbGet(messagesRef);

      if (!messagesSnapshot.exists()) return 0;

      let unreadCount = 0;
      messagesSnapshot.forEach((childSnapshot) => {
        const message = childSnapshot.val();
        if (message.timestamp > lastReadTimestamp && message.senderId !== this.currentUser.uid) {
          unreadCount++;
        }
      });

      return unreadCount;
    } catch (error) {
      console.error('Lỗi lấy unread count:', error);
      return 0;
    }
  }

  /**
   * Lấy danh sách conversations với unread count
   */
  async getConversationsWithUnreadCount() {
    const conversationsArray = Array.from(this.conversations.values());
    const conversationsWithUnread = await Promise.all(
      conversationsArray.map(async (conversation) => {
        const unreadCount = await this.getUnreadCount(conversation.id);
        return {
          ...conversation,
          unreadCount
        };
      })
    );

    // Sắp xếp theo lastMessageTimestamp
    conversationsWithUnread.sort((a, b) => {
      const timeA = a.lastMessageTimestamp || 0;
      const timeB = b.lastMessageTimestamp || 0;
      return timeB - timeA;
    });

    return conversationsWithUnread;
  }

  /**
   * Lấy thông tin user từ uid
   */
  async getUserInfo(uid) {
    try {
      const statusRef = this.dbRef(this.db, `userStatus/${uid}`);
      const snapshot = await this.dbGet(statusRef);

      if (snapshot.exists()) {
        return snapshot.val();
      }

      return {
        displayName: uid,
        status: 'offline'
      };
    } catch (error) {
      console.error('Lỗi lấy user info:', error);
      return {
        displayName: uid,
        status: 'offline'
      };
    }
  }

  /**
   * Upload file/image
   */
  async uploadFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        resolve({
          data: e.target.result, // base64
          name: file.name,
          size: file.size,
          type: file.type
        });
      };

      reader.onerror = (error) => {
        reject(error);
      };

      reader.readAsDataURL(file);
    });
  }

  /**
   * Event system
   */
  on(event, callback) {
    if (!this.eventListeners) {
      this.eventListeners = new Map();
    }

    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }

    this.eventListeners.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.eventListeners || !this.eventListeners.has(event)) return;

    const listeners = this.eventListeners.get(event);
    const index = listeners.indexOf(callback);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  }

  triggerEvent(event, data) {
    if (!this.eventListeners || !this.eventListeners.has(event)) return;

    this.eventListeners.get(event).forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Lỗi trong event listener ${event}:`, error);
      }
    });
  }

  /**
   * Cleanup
   */
  destroy() {
    // Xóa tất cả listeners
    this.listeners.forEach((unsubscribe, conversationId) => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
    this.listeners.clear();

    // Xóa typing timeouts
    this.typingTimeouts.forEach((timeout) => {
      clearTimeout(timeout);
    });
    this.typingTimeouts.clear();

    // Cập nhật status offline
    this.updateUserStatus('offline');

    this.initialized = false;
  }
}

// Export global instance
window.ChatManager = new ChatManager();
