// =====================================================
// VERSION CHECKER - Force logout on version mismatch
// =====================================================

class VersionChecker {
    constructor() {
        this.firebaseRef = null;
        this.localVersion = window.APP_VERSION || { build: 0 };
        this.isChecking = false;
    }

    /**
     * Initialize version checker
     */
    async init() {
        try {
            // Wait for Firebase to be ready
            await this.waitForFirebase();

            // Check version
            await this.checkVersion();

            // Listen for version changes
            this.setupVersionListener();

        } catch (error) {
            console.error('[VERSION] Error initializing version checker:', error);
        }
    }

    /**
     * Wait for Firebase SDK to be available
     */
    async waitForFirebase() {
        const maxRetries = 50; // 5 seconds max
        let retries = 0;

        while (retries < maxRetries) {
            if (window.firebase && window.firebase.database && typeof window.firebase.database === 'function') {
                this.firebaseRef = window.firebase.database().ref('app_version');
                console.log('[VERSION] ✅ Firebase reference initialized');
                return;
            }

            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
        }

        console.warn('[VERSION] Firebase not available, version check disabled');
    }

    /**
     * Check version against Firebase
     */
    async checkVersion() {
        if (!this.firebaseRef || this.isChecking) {
            return;
        }

        this.isChecking = true;

        try {
            console.log('[VERSION] Checking version...');
            console.log('[VERSION] Local version:', this.localVersion);

            // Get version from Firebase
            const snapshot = await this.firebaseRef.once('value');
            const firebaseVersion = snapshot.val();

            console.log('[VERSION] Firebase version:', firebaseVersion);

            // If Firebase has no version, publish local version
            if (!firebaseVersion) {
                console.log('[VERSION] No version in Firebase, publishing local version...');
                await this.publishVersion();
                this.isChecking = false;
                return;
            }

            // Compare versions
            if (firebaseVersion.build !== this.localVersion.build) {
                console.warn('[VERSION] ⚠️ Version mismatch detected!');
                console.warn('[VERSION] Local build:', this.localVersion.build);
                console.warn('[VERSION] Firebase build:', firebaseVersion.build);

                // Force logout and reload
                this.forceLogout();
            } else {
                console.log('[VERSION] ✅ Version OK (build', this.localVersion.build + ')');
            }

        } catch (error) {
            console.error('[VERSION] Error checking version:', error);
        } finally {
            this.isChecking = false;
        }
    }

    /**
     * Publish current version to Firebase
     */
    async publishVersion() {
        if (!this.firebaseRef) {
            return;
        }

        try {
            await this.firebaseRef.set(this.localVersion);
            console.log('[VERSION] ✅ Version published to Firebase:', this.localVersion);
        } catch (error) {
            console.error('[VERSION] Error publishing version:', error);
        }
    }

    /**
     * Setup listener for version changes
     */
    setupVersionListener() {
        if (!this.firebaseRef) {
            return;
        }

        let isFirstTrigger = true;

        this.firebaseRef.on('value', (snapshot) => {
            // Skip first trigger (already checked in checkVersion)
            if (isFirstTrigger) {
                isFirstTrigger = false;
                return;
            }

            const firebaseVersion = snapshot.val();
            if (!firebaseVersion) {
                return;
            }

            // Check if version changed
            if (firebaseVersion.build !== this.localVersion.build) {
                console.warn('[VERSION] ⚠️ Version changed in Firebase!');
                console.warn('[VERSION] Local build:', this.localVersion.build);
                console.warn('[VERSION] Firebase build:', firebaseVersion.build);

                // Force logout and reload
                this.forceLogout();
            }
        });

        console.log('[VERSION] ✅ Version listener setup complete');
    }

    /**
     * Force logout: clear storage and redirect to login
     */
    forceLogout() {
        console.log('[VERSION] 🚨 Forcing logout due to version mismatch...');

        // Show notification if available
        if (window.notificationManager) {
            window.notificationManager.warning(
                'Phiên bản mới đã được cập nhật. Đang đăng xuất để tải lại...',
                0,
                'Cập nhật phiên bản',
                { persistent: true, showOverlay: true }
            );
        }

        // Wait a bit for notification to show
        setTimeout(() => {
            // Clear all localStorage
            localStorage.clear();
            console.log('[VERSION] ✅ localStorage cleared');

            // Clear sessionStorage
            sessionStorage.clear();
            console.log('[VERSION] ✅ sessionStorage cleared');

            // Redirect to login page
            const loginUrl = 'https://nhijudyshop.github.io/n2store/index.html';
            console.log('[VERSION] 🔄 Redirecting to:', loginUrl);
            window.location.href = loginUrl;
        }, 1500);
    }

    /**
     * Manual version publish (call this when you want to force all users to logout)
     */
    async forceVersionUpdate() {
        console.log('[VERSION] 📢 Force version update triggered');
        await this.publishVersion();
    }
}

// =====================================================
// INITIALIZE VERSION CHECKER
// =====================================================

// Wait for APP_VERSION to be loaded, then initialize
if (window.APP_VERSION) {
    const versionChecker = new VersionChecker();
    window.versionChecker = versionChecker;

    // Initialize after a short delay to ensure Firebase is ready
    setTimeout(() => {
        versionChecker.init();
    }, 1000);

    console.log('[VERSION] Version Checker initialized');
} else {
    console.warn('[VERSION] APP_VERSION not found, version checker disabled');
}
