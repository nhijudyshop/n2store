/**
 * User Service
 * Service để load và quản lý danh sách users từ Firebase Firestore
 */

class UserService {
  constructor() {
    this.users = [];
    this.db = null;
    this.initialized = false;
  }

  /**
   * Khởi tạo UserService
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Wait for Firebase to be initialized
      if (!firebase || !firebase.apps || firebase.apps.length === 0) {
        console.error('Firebase chưa được khởi tạo');
        return false;
      }

      this.db = firebase.firestore();
      this.initialized = true;
      console.log('✅ UserService initialized');
      return true;
    } catch (error) {
      console.error('❌ Error initializing UserService:', error);
      return false;
    }
  }

  /**
   * Load tất cả users từ Firestore
   */
  async loadUsers() {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.db) {
      console.error('Database not initialized');
      return [];
    }

    try {
      const snapshot = await this.db.collection('users').get();
      this.users = [];

      snapshot.forEach((doc) => {
        this.users.push({
          id: doc.id,
          username: doc.id,
          ...doc.data()
        });
      });

      // Sort by permission level and name
      this.users.sort((a, b) => {
        if (a.checkLogin !== b.checkLogin) {
          return a.checkLogin - b.checkLogin;
        }
        return (a.displayName || a.username).localeCompare(b.displayName || b.username);
      });

      console.log(`✅ Loaded ${this.users.length} users`);
      return this.users;
    } catch (error) {
      console.error('❌ Error loading users:', error);
      return [];
    }
  }

  /**
   * Lấy thông tin user theo username
   */
  getUserByUsername(username) {
    return this.users.find(u => u.id === username || u.username === username);
  }

  /**
   * Lấy danh sách users (trừ current user)
   */
  getUsersExceptCurrent(currentUsername) {
    return this.users.filter(u => u.username !== currentUsername && u.id !== currentUsername);
  }

  /**
   * Search users by name
   */
  searchUsers(query, excludeUsername = null) {
    if (!query) {
      return excludeUsername
        ? this.getUsersExceptCurrent(excludeUsername)
        : this.users;
    }

    const lowerQuery = query.toLowerCase();
    return this.users.filter(user => {
      if (excludeUsername && (user.username === excludeUsername || user.id === excludeUsername)) {
        return false;
      }

      const displayName = (user.displayName || '').toLowerCase();
      const username = (user.username || user.id || '').toLowerCase();

      return displayName.includes(lowerQuery) || username.includes(lowerQuery);
    });
  }

  /**
   * Lấy display name của user
   */
  getDisplayName(username) {
    const user = this.getUserByUsername(username);
    return user?.displayName || username;
  }

  /**
   * Lấy role/permission name
   */
  getRoleName(checkLogin) {
    const roles = {
      0: 'Admin',
      1: 'Quản lý',
      2: 'Nhân viên',
      3: 'Khách'
    };
    return roles[checkLogin] || 'Unknown';
  }
}

// Export global instance
window.UserService = new UserService();
