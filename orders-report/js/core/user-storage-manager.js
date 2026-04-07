// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// USER-SPECIFIC STORAGE MANAGER
// Manages localStorage and Firebase persistence per user account
// Priority: Firebase > localStorage (Firebase is source of truth)
// =====================================================

class UserStorageManager {
    constructor() {
        this.authManager = window.authManager;
        this.currentUser = null;
        this.userIdentifier = null;
        this.init();
    }

    /**
     * Initialize and get current user info
     */
    init() {
        try {
            const authState = this.authManager?.getAuthState();
            if (authState && authState.isLoggedIn === 'true') {
                this.currentUser = authState;
                // PRIORITY: Use userType first (most reliable in this system)
                // Extract username from userType format: "username-shop" => "username"
                let identifier = 'default';
                if (authState.userType) {
                    identifier = authState.userType.includes('-')
                        ? authState.userType.split('-')[0]
                        : authState.userType;
                } else if (authState.username) {
                    identifier = authState.username;
                } else if (authState.uid) {
                    identifier = authState.uid;
                }

                this.userIdentifier = identifier;
                return true;
            } else {
                console.warn('[USER-STORAGE] No authenticated user found');
                this.userIdentifier = 'guest'; // Fallback
                return false;
            }
        } catch (error) {
            console.error('[USER-STORAGE] Error initializing:', error);
            this.userIdentifier = 'guest'; // Fallback
            return false;
        }
    }

    /**
     * Refresh user identifier (call this when user changes)
     */
    refresh() {
        return this.init();
    }

    /**
     * Get current user identifier
     * @returns {string} User identifier (username/uid)
     */
    getUserIdentifier() {
        if (!this.userIdentifier) {
            this.init();
        }
        return this.userIdentifier || 'guest';
    }

    /**
     * Get Firebase path for user-specific data
     * @param {string} basePath - Base path (e.g., 'productAssignments')
     * @returns {string} User-specific path (e.g., 'productAssignments/user123')
     */
    getUserFirebasePath(basePath) {
        const userId = this.getUserIdentifier();
        return `${basePath}/${userId}`;
    }

    /**
     * Get localStorage key for user-specific data
     * @param {string} baseKey - Base key (e.g., 'ordersData')
     * @returns {string} User-specific key (e.g., 'ordersData_user123')
     */
    getUserLocalStorageKey(baseKey) {
        const userId = this.getUserIdentifier();
        return `${baseKey}_${userId}`;
    }

    /**
     * Save data to localStorage with user identifier
     * @param {string} baseKey - Base key
     * @param {any} data - Data to save
     */
    saveToLocalStorage(baseKey, data) {
        try {
            const key = this.getUserLocalStorageKey(baseKey);
            const jsonData = JSON.stringify(data);
            localStorage.setItem(key, jsonData);
            return true;
        } catch (error) {
            console.error('[USER-STORAGE] ❌ Error saving to localStorage:', error);
            return false;
        }
    }

    /**
     * Load data from localStorage with user identifier
     * @param {string} baseKey - Base key
     * @returns {any} Parsed data or null
     */
    loadFromLocalStorage(baseKey) {
        try {
            const key = this.getUserLocalStorageKey(baseKey);
            const jsonData = localStorage.getItem(key);
            if (jsonData) {
                const data = JSON.parse(jsonData);
                return data;
            }
            return null;
        } catch (error) {
            console.error('[USER-STORAGE] ❌ Error loading from localStorage:', error);
            return null;
        }
    }

    /**
     * Remove data from localStorage with user identifier
     * @param {string} baseKey - Base key
     */
    removeFromLocalStorage(baseKey) {
        try {
            const key = this.getUserLocalStorageKey(baseKey);
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('[USER-STORAGE] ❌ Error removing from localStorage:', error);
            return false;
        }
    }

    /**
     * Save data to Firebase with user-specific path
     * @param {object} database - Firebase database reference
     * @param {string} basePath - Base path
     * @param {any} data - Data to save
     * @returns {Promise<boolean>}
     */
    async saveToFirebase(database, basePath, data) {
        try {
            const path = this.getUserFirebasePath(basePath);
            await database.ref(path).set(data);
            return true;
        } catch (error) {
            console.error('[USER-STORAGE] ❌ Error saving to Firebase:', error);
            return false;
        }
    }

    /**
     * Load data from Firebase with user-specific path
     * @param {object} database - Firebase database reference
     * @param {string} basePath - Base path
     * @returns {Promise<any>} Data or null
     */
    async loadFromFirebase(database, basePath) {
        try {
            const path = this.getUserFirebasePath(basePath);
            const snapshot = await database.ref(path).once('value');
            const data = snapshot.val();
            if (data) {
                return data;
            }
            return null;
        } catch (error) {
            console.error('[USER-STORAGE] ❌ Error loading from Firebase:', error);
            return null;
        }
    }

    /**
     * Listen to Firebase changes with user-specific path
     * @param {object} database - Firebase database reference
     * @param {string} basePath - Base path
     * @param {function} callback - Callback function (snapshot) => {}
     * @returns {function} Unsubscribe function
     */
    listenToFirebase(database, basePath, callback) {
        try {
            const path = this.getUserFirebasePath(basePath);

            database.ref(path).on('value', (snapshot) => {
                callback(snapshot);
            });

            // Return unsubscribe function
            return () => {
                database.ref(path).off('value', callback);
            };
        } catch (error) {
            console.error('[USER-STORAGE] ❌ Error setting up Firebase listener:', error);
            return () => {}; // Return empty unsubscribe function
        }
    }

    /**
     * Hybrid save: Save to both Firebase (priority) and localStorage (fallback)
     * @param {object} database - Firebase database reference
     * @param {string} basePath - Base path for Firebase
     * @param {string} baseKey - Base key for localStorage
     * @param {any} data - Data to save
     * @returns {Promise<object>} { firebase: boolean, localStorage: boolean }
     */
    async saveToAll(database, basePath, baseKey, data) {
        const results = {
            firebase: false,
            localStorage: false
        };

        // Priority 1: Firebase
        try {
            results.firebase = await this.saveToFirebase(database, basePath, data);
        } catch (error) {
            console.error('[USER-STORAGE] Firebase save failed:', error);
        }

        // Priority 2: localStorage (as fallback)
        try {
            results.localStorage = this.saveToLocalStorage(baseKey, data);
        } catch (error) {
            console.error('[USER-STORAGE] localStorage save failed:', error);
        }

        return results;
    }

    /**
     * Hybrid load: Load from Firebase first, fallback to localStorage
     * @param {object} database - Firebase database reference
     * @param {string} basePath - Base path for Firebase
     * @param {string} baseKey - Base key for localStorage
     * @returns {Promise<any>} Data or null
     */
    async loadFromAll(database, basePath, baseKey) {
        // Priority 1: Firebase (source of truth)
        try {
            const firebaseData = await this.loadFromFirebase(database, basePath);
            if (firebaseData !== null) {
                // Sync to localStorage as cache
                this.saveToLocalStorage(baseKey, firebaseData);
                return firebaseData;
            }
        } catch (error) {
            console.error('[USER-STORAGE] Firebase load failed:', error);
        }

        // Priority 2: localStorage (fallback)
        try {
            const localData = this.loadFromLocalStorage(baseKey);
            if (localData !== null) {
                // Try to sync back to Firebase
                if (database && basePath) {
                    this.saveToFirebase(database, basePath, localData).catch(err => {
                        console.warn('[USER-STORAGE] Could not sync localStorage to Firebase:', err);
                    });
                }
                return localData;
            }
        } catch (error) {
            console.error('[USER-STORAGE] localStorage load failed:', error);
        }

        return null;
    }

    /**
     * Clear all user-specific data (both Firebase and localStorage)
     * @param {object} database - Firebase database reference
     * @param {string} basePath - Base path for Firebase
     * @param {string} baseKey - Base key for localStorage
     * @returns {Promise<object>} { firebase: boolean, localStorage: boolean }
     */
    async clearAll(database, basePath, baseKey) {
        const results = {
            firebase: false,
            localStorage: false
        };

        // Clear Firebase
        try {
            const path = this.getUserFirebasePath(basePath);
            await database.ref(path).remove();
            results.firebase = true;
        } catch (error) {
            console.error('[USER-STORAGE] ❌ Error clearing Firebase:', error);
        }

        // Clear localStorage
        try {
            results.localStorage = this.removeFromLocalStorage(baseKey);
        } catch (error) {
            console.error('[USER-STORAGE] ❌ Error clearing localStorage:', error);
        }

        return results;
    }
}

// =====================================================
// INITIALIZE GLOBAL INSTANCE
// =====================================================

// Wait for authManager to be ready
// Module guard: if instance already exists (vd script load 2x), skip toàn bộ block
if (typeof window !== 'undefined' && !window.userStorageManager) {
    // Initialize immediately if authManager is ready
    if (window.authManager) {
        window.userStorageManager = new UserStorageManager();
    } else {
        // Wait for authManager to be ready
        const checkAuthManager = setInterval(() => {
            if (window.userStorageManager) {
                // Đã tồn tại (vd module reload song song) → cleanup ngay
                clearInterval(checkAuthManager);
                return;
            }
            if (window.authManager) {
                window.userStorageManager = new UserStorageManager();
                clearInterval(checkAuthManager);
            }
        }, 100);

        // Timeout after 5 seconds
        setTimeout(() => {
            clearInterval(checkAuthManager);
            if (!window.userStorageManager) {
                console.warn('[USER-STORAGE] AuthManager not found after 5s, creating fallback instance');
                window.userStorageManager = new UserStorageManager();
            }
        }, 5000);
    }
}
