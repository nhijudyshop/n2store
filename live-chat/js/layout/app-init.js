// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * App Initialization - Orchestrates all module initialization
 * This is the main entry point, loaded last after all modules
 */

(function () {
    'use strict';

    async function initializeApp() {
        console.log('[APP] Starting initialization...');

        // 1. Layout first (synchronous, no dependencies)
        if (window.ColumnManager) {
            window.ColumnManager.initialize();
            console.log('[APP] ColumnManager initialized');
        }

        // 2. Start shared services
        if (window.sharedDebtManager) {
            window.sharedDebtManager.startCleanup();
            console.log('[APP] DebtManager cleanup started');
        }

        // 3. Initialize Live column
        try {
            const liveInit = window.LiveColumnManager || window.LiveInit;
            if (liveInit && liveInit.initialize) {
                await liveInit.initialize('liveContent');
                console.log('[APP] Live column initialized');
            }
        } catch (error) {
            console.error('[APP] Live initialization failed:', error);
        }

        // 4. Initialize Pancake column (may auto-init via DOMContentLoaded)
        try {
            const pancakeInit = window.PancakeColumnManager || window.PancakeInit;
            if (pancakeInit && pancakeInit.initialize && !pancakeInit._initialized) {
                await pancakeInit.initialize('pancakeContent');
                console.log('[APP] Pancake column initialized');
            }
        } catch (error) {
            console.error('[APP] Pancake initialization failed:', error);
        }

        // 5. Wire up cross-column events
        _setupCrossColumnEvents();

        // 6. Initialize settings modals (inline JS from old index.html)
        if (window.SettingsManager) {
            window.SettingsManager.initialize();
            console.log('[APP] SettingsManager initialized');
        }

        console.log('[APP] Initialization complete');
    }

    function _setupCrossColumnEvents() {
        if (!window.eventBus) return;

        // When Live comment is selected, try to find matching Pancake conversation
        window.eventBus.on('live:commentSelected', (data) => {
            if (data.userId && window.PancakeConversationList) {
                window.PancakeConversationList.highlightByUserId(data.userId);
            }
        });

        // When Pancake saved list updates, notify Live column
        window.eventBus.on('pancake:savedListUpdated', () => {
            if (window.LiveCommentList) {
                window.LiveCommentList.updateSavedBadges();
            }
        });

        // When debt data is loaded, update both columns
        window.eventBus.on('debt:updated', (data) => {
            if (window.LiveCommentList) window.LiveCommentList.updateDebtBadges();
            if (window.PancakeConversationList) window.PancakeConversationList.updateDebtBadges();
        });

        // Layout refresh
        window.eventBus.on('layout:refresh', () => {
            const live = window.LiveColumnManager || window.LiveInit;
            const pancake = window.PancakeColumnManager || window.PancakeInit;
            if (live?.refresh) live.refresh();
            if (pancake?.refresh) pancake.refresh();
        });
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApp);
    } else {
        initializeApp();
    }

    // Export for external access
    window.AppInit = { initialize: initializeApp };
})();
