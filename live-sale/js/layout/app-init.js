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

        // 3. Initialize TPOS column
        try {
            const tposInit = window.TposColumnManager || window.TposInit;
            if (tposInit && tposInit.initialize) {
                await tposInit.initialize('tposContent');
                console.log('[APP] TPOS column initialized');
            }
        } catch (error) {
            console.error('[APP] TPOS initialization failed:', error);
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

        // When TPOS comment is selected, try to find matching Pancake conversation
        window.eventBus.on('tpos:commentSelected', (data) => {
            if (data.userId && window.PancakeConversationList) {
                window.PancakeConversationList.highlightByUserId(data.userId);
            }
        });

        // When Pancake saved list updates, notify TPOS column
        window.eventBus.on('pancake:savedListUpdated', () => {
            if (window.TposCommentList) {
                window.TposCommentList.updateSavedBadges();
            }
        });

        // When debt data is loaded, update both columns
        window.eventBus.on('debt:updated', (data) => {
            if (window.TposCommentList) window.TposCommentList.updateDebtBadges();
            if (window.PancakeConversationList) window.PancakeConversationList.updateDebtBadges();
        });

        // Layout refresh
        window.eventBus.on('layout:refresh', () => {
            const tpos = window.TposColumnManager || window.TposInit;
            const pancake = window.PancakeColumnManager || window.PancakeInit;
            if (tpos?.refresh) tpos.refresh();
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
