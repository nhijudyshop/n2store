/**
 * Mobile JavaScript V2 - Event-Based System
 * Tab Báo Cáo Tổng Hợp - N2Store
 *
 * Features:
 * - Event-driven architecture (waits for statistics to render)
 * - Non-destructive DOM manipulation
 * - Collapsible sections (Product, Tag, Employee)
 * - Touch interactions with haptic feedback
 * - Pull-to-refresh hint
 * - Responsive to window resize
 *
 * @version 2.0.0
 * @date 2025-12-21
 */

(function() {
    'use strict';

    // ========================================
    // CONFIGURATION
    // ========================================

    const CONFIG = {
        // Collapse settings
        productSectionCollapsed: true,
        tagSectionCollapsed: false,
        employeeCardsCollapsible: true,

        // Interaction settings
        enableHapticFeedback: true,
        animationDuration: 300,

        // Timing
        eventDebounceMs: 250,
        resizeDebounceMs: 250,

        // Debug
        debug: true
    };

    // ========================================
    // STATE
    // ========================================

    let state = {
        mobileInitialized: false,
        statisticsRendered: false,
        isMobile: false
    };

    // ========================================
    // UTILITY FUNCTIONS
    // ========================================

    /**
     * Check if current viewport is mobile
     */
    function isMobile() {
        return window.innerWidth <= 768;
    }

    /**
     * Log debug messages
     */
    function log(...args) {
        if (CONFIG.debug) {
            console.log('[MOBILE V2]', ...args);
        }
    }

    /**
     * Haptic feedback (if supported)
     */
    function haptic(duration = 10) {
        if (CONFIG.enableHapticFeedback && navigator.vibrate) {
            navigator.vibrate(duration);
        }
    }

    // ========================================
    // EVENT HANDLERS
    // ========================================

    /**
     * Handle statistics rendered event
     */
    function handleStatisticsRendered(event) {
        if (!isMobile()) {
            log('Not on mobile, skipping mobile UI');
            return;
        }

        log('📊 Statistics rendered event received:', event.detail);
        state.statisticsRendered = true;

        // Apply mobile UI
        applyMobileUI();
    }

    /**
     * Handle window resize
     */
    let resizeTimeout;
    function handleResize() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const nowMobile = isMobile();
            const wasMobile = state.isMobile;

            if (nowMobile !== wasMobile) {
                log(`📱 Screen size changed: ${wasMobile ? 'desktop→mobile' : 'mobile→desktop'}`);

                state.isMobile = nowMobile;

                if (nowMobile && state.statisticsRendered) {
                    document.body.classList.add('mobile-mode');
                    applyMobileUI();
                } else {
                    document.body.classList.remove('mobile-mode');
                    removeMobileUI();
                }
            }
        }, CONFIG.resizeDebounceMs);
    }

    // ========================================
    // MAIN MOBILE UI APPLICATION
    // ========================================

    /**
     * Apply mobile UI transformations
     */
    function applyMobileUI() {
        if (state.mobileInitialized) {
            log('Mobile UI already initialized, skipping');
            return;
        }

        log('🎨 Applying mobile UI transformations...');

        // Mark body as mobile mode
        document.body.classList.add('mobile-mode');
        state.isMobile = true;

        try {
            // Apply transformations in sequence
            makeProductSectionCollapsible();
            makeTagSectionCollapsible();
            transformEmployeeCards();
            addPullToRefreshHint();
            setupMobileInteractions();

            state.mobileInitialized = true;
            log('✅ Mobile UI applied successfully');

        } catch (error) {
            console.error('[MOBILE V2] ❌ Error applying mobile UI:', error);
        }
    }

    /**
     * Remove mobile UI transformations
     */
    function removeMobileUI() {
        if (!state.mobileInitialized) {
            return;
        }

        log('🧹 Removing mobile UI transformations...');

        try {
            // Remove all mobile wrappers
            document.querySelectorAll('.mobile-collapsible-section').forEach(wrapper => {
                const section = wrapper.querySelector('[id$="Section"]');
                if (section) {
                    // Move section back out
                    wrapper.parentNode.insertBefore(section, wrapper);
                    // Remove wrapper
                    wrapper.remove();
                    // Clean up section
                    section.style.maxHeight = '';
                    section.style.overflow = '';
                    section.style.transition = '';
                    delete section.dataset.mobileCollapsible;
                }
            });

            // Remove employee card modifications
            document.querySelectorAll('.employee-card[data-mobile-processed]').forEach(card => {
                card.classList.remove('mobile-collapsed', 'mobile-expanded');
                const header = card.querySelector('.employee-card-header');
                if (header) {
                    header.style.cursor = '';
                    header.classList.remove('mobile-clickable');
                }
                const statsGrid = card.querySelector('.employee-stats-grid');
                if (statsGrid) {
                    statsGrid.style.maxHeight = '';
                    statsGrid.style.overflow = '';
                    statsGrid.style.transition = '';
                }
                const toggle = card.querySelector('.mobile-employee-toggle');
                if (toggle) toggle.remove();
                delete card.dataset.mobileProcessed;
            });

            // Remove pull hint
            const hint = document.getElementById('mobile-pull-hint');
            if (hint) hint.remove();

            document.body.classList.remove('mobile-mode');
            state.mobileInitialized = false;

            log('✅ Mobile UI removed successfully');

        } catch (error) {
            console.error('[MOBILE V2] ❌ Error removing mobile UI:', error);
        }
    }

    // ========================================
    // COLLAPSIBLE SECTIONS
    // ========================================

    /**
     * Make product statistics section collapsible
     */
    function makeProductSectionCollapsible() {
        const section = document.getElementById('productStatsSection');
        if (!section) {
            log('⚠️ Product section not found');
            return;
        }

        if (section.dataset.mobileCollapsible) {
            log('Product section already collapsible');
            return;
        }

        wrapAsCollapsible(section, {
            id: 'product-stats',
            title: 'Thống Kê Sản Phẩm',
            icon: 'fa-box',
            iconGradient: 'orange',
            collapsed: CONFIG.productSectionCollapsed,
            getBadgeText: () => {
                const badge = section.querySelector('#productStatsBadge');
                return badge ? badge.textContent : '';
            }
        });

        section.dataset.mobileCollapsible = 'true';
    }

    /**
     * Make tag statistics section collapsible
     */
    function makeTagSectionCollapsible() {
        const section = document.getElementById('tagStatsSection');
        if (!section || section.dataset.mobileCollapsible) {
            return;
        }

        wrapAsCollapsible(section, {
            id: 'tag-stats',
            title: 'Thống Kê Theo Tag',
            icon: 'fa-tags',
            iconGradient: 'primary',
            collapsed: CONFIG.tagSectionCollapsed,
            preserveHeader: true
        });

        section.dataset.mobileCollapsible = 'true';
    }

    /**
     * Wrap a section as collapsible (non-destructive)
     */
    function wrapAsCollapsible(section, options) {
        const {
            id,
            title,
            icon,
            iconGradient = 'primary',
            collapsed = false,
            getBadgeText = null,
            preserveHeader = false
        } = options;

        // Create mobile wrapper
        const mobileWrapper = document.createElement('div');
        mobileWrapper.className = 'mobile-collapsible-section';
        mobileWrapper.id = `mobile-${id}`;
        if (collapsed) {
            mobileWrapper.classList.add('collapsed');
        } else {
            mobileWrapper.classList.add('expanded');
        }

        // Create header
        const header = document.createElement('div');
        header.className = 'mobile-collapsible-header';

        const badgeText = getBadgeText ? getBadgeText() : '';
        const badgeHtml = badgeText ? `<span class="mobile-badge">${badgeText}</span>` : '';

        header.innerHTML = `
            <div class="mobile-header-content">
                <i class="fas ${icon} mobile-icon gradient-${iconGradient}"></i>
                <span class="mobile-title">${title}</span>
                ${badgeHtml}
            </div>
            <div class="mobile-toggle-icon">
                <i class="fas fa-chevron-down"></i>
            </div>
        `;

        // Insert wrapper before section
        section.parentNode.insertBefore(mobileWrapper, section);

        // Move section into wrapper
        mobileWrapper.appendChild(header);
        mobileWrapper.appendChild(section);

        // Set initial collapsed state
        if (collapsed) {
            section.style.maxHeight = '0';
            section.style.overflow = 'hidden';
            section.style.transition = `max-height ${CONFIG.animationDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
        } else {
            section.style.transition = `max-height ${CONFIG.animationDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
        }

        // Add click handler
        header.addEventListener('click', () => {
            toggleCollapsible(mobileWrapper, section);
        });

        log(`✅ Made "${title}" collapsible (${collapsed ? 'collapsed' : 'expanded'})`);
    }

    /**
     * Toggle collapsible section
     */
    function toggleCollapsible(wrapper, section) {
        const isCollapsed = wrapper.classList.contains('collapsed');

        if (isCollapsed) {
            // Expand
            wrapper.classList.remove('collapsed');
            wrapper.classList.add('expanded');
            section.style.maxHeight = section.scrollHeight + 'px';

            // After animation, remove max-height to allow dynamic content
            setTimeout(() => {
                if (wrapper.classList.contains('expanded')) {
                    section.style.maxHeight = 'none';
                }
            }, CONFIG.animationDuration);

        } else {
            // Collapse
            // Set exact height first for smooth animation
            section.style.maxHeight = section.scrollHeight + 'px';
            // Force reflow
            section.offsetHeight;
            // Then collapse
            section.style.maxHeight = '0';

            wrapper.classList.remove('expanded');
            wrapper.classList.add('collapsed');
        }

        // Haptic feedback
        haptic();

        log(`🔄 Toggled section: ${isCollapsed ? 'expanded' : 'collapsed'}`);
    }

    // ========================================
    // EMPLOYEE CARDS
    // ========================================

    /**
     * Transform employee cards for mobile
     */
    function transformEmployeeCards() {
        const employeeCards = document.querySelectorAll('.employee-card');

        if (employeeCards.length === 0) {
            log('⚠️ No employee cards found');
            return;
        }

        employeeCards.forEach((card, index) => {
            // Check if already processed
            if (card.dataset.mobileProcessed) {
                return;
            }

            const header = card.querySelector('.employee-card-header');
            const statsGrid = card.querySelector('.employee-stats-grid');

            if (!header || !statsGrid) {
                return;
            }

            // Make header clickable
            header.style.cursor = 'pointer';
            header.classList.add('mobile-clickable');

            // Add toggle icon
            const toggleIcon = document.createElement('i');
            toggleIcon.className = 'fas fa-chevron-down mobile-employee-toggle';
            header.appendChild(toggleIcon);

            // Set initial state
            statsGrid.style.transition = `max-height ${CONFIG.animationDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`;

            // Collapse all except first
            if (index > 0 && CONFIG.employeeCardsCollapsible) {
                card.classList.add('mobile-collapsed');
                statsGrid.style.maxHeight = '0';
                statsGrid.style.overflow = 'hidden';
            } else {
                card.classList.add('mobile-expanded');
            }

            // Add click handler
            header.addEventListener('click', (e) => {
                // Don't toggle if clicking on buttons
                if (e.target.closest('.btn-view-detail')) {
                    return;
                }

                toggleEmployeeCard(card, statsGrid);
            });

            card.dataset.mobileProcessed = 'true';
        });

        log(`✅ Transformed ${employeeCards.length} employee cards`);
    }

    /**
     * Toggle employee card
     */
    function toggleEmployeeCard(card, statsGrid) {
        const isCollapsed = card.classList.contains('mobile-collapsed');

        if (isCollapsed) {
            // Expand
            card.classList.remove('mobile-collapsed');
            card.classList.add('mobile-expanded');
            statsGrid.style.maxHeight = statsGrid.scrollHeight + 'px';

            setTimeout(() => {
                if (card.classList.contains('mobile-expanded')) {
                    statsGrid.style.maxHeight = 'none';
                }
            }, CONFIG.animationDuration);

        } else {
            // Collapse
            statsGrid.style.maxHeight = statsGrid.scrollHeight + 'px';
            statsGrid.offsetHeight; // Force reflow
            statsGrid.style.maxHeight = '0';

            card.classList.remove('mobile-expanded');
            card.classList.add('mobile-collapsed');
        }

        // Haptic feedback
        haptic();
    }

    // ========================================
    // PULL TO REFRESH
    // ========================================

    /**
     * Add pull-to-refresh hint
     */
    function addPullToRefreshHint() {
        // Check if already exists
        if (document.getElementById('mobile-pull-hint')) {
            return;
        }

        const hint = document.createElement('div');
        hint.id = 'mobile-pull-hint';
        hint.className = 'mobile-pull-hint hidden';
        hint.innerHTML = `
            <i class="fas fa-arrow-down mobile-pull-icon"></i>
            <span class="mobile-pull-text">Kéo xuống để tải lại</span>
        `;

        document.body.insertBefore(hint, document.body.firstChild);

        // Simple pull detection
        let startY = 0;
        let isPulling = false;

        window.addEventListener('touchstart', (e) => {
            if (window.scrollY === 0) {
                startY = e.touches[0].pageY;
                isPulling = true;
            }
        }, { passive: true });

        window.addEventListener('touchmove', (e) => {
            if (!isPulling) return;

            const currentY = e.touches[0].pageY;
            const diff = currentY - startY;

            if (diff > 50 && window.scrollY === 0) {
                hint.classList.remove('hidden');
            } else {
                hint.classList.add('hidden');
            }
        }, { passive: true });

        window.addEventListener('touchend', () => {
            isPulling = false;
            hint.classList.add('hidden');
        }, { passive: true });

        log('✅ Pull-to-refresh hint added');
    }

    // ========================================
    // MOBILE INTERACTIONS
    // ========================================

    /**
     * Setup mobile-specific interactions
     */
    function setupMobileInteractions() {
        // Prevent double-tap zoom on buttons
        preventDoubleTapZoom();

        // Smooth scroll
        if (!document.documentElement.style.scrollBehavior) {
            document.documentElement.style.scrollBehavior = 'smooth';
        }

        // Touch active states
        addTouchActiveStates();

        log('✅ Mobile interactions setup complete');
    }

    /**
     * Prevent double-tap zoom
     */
    function preventDoubleTapZoom() {
        let lastTouchEnd = 0;
        document.addEventListener('touchend', (event) => {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) {
                event.preventDefault();
            }
            lastTouchEnd = now;
        }, { passive: false });
    }

    /**
     * Add touch active states
     */
    function addTouchActiveStates() {
        const selectors = [
            '.btn-action',
            '.stat-card',
            '.mobile-collapsible-header',
            '.employee-card-header.mobile-clickable'
        ];

        selectors.forEach(selector => {
            document.addEventListener('touchstart', (e) => {
                const el = e.target.closest(selector);
                if (el) {
                    el.classList.add('touch-active');
                }
            }, { passive: true });

            document.addEventListener('touchend', (e) => {
                const el = e.target.closest(selector);
                if (el) {
                    setTimeout(() => {
                        el.classList.remove('touch-active');
                    }, 150);
                }
            }, { passive: true });
        });
    }

    // ========================================
    // INITIALIZATION
    // ========================================

    /**
     * Initialize mobile utilities
     */
    function init() {
        log('📱 Mobile Utilities V2 initializing...');

        // Set initial mobile state
        state.isMobile = isMobile();

        // Create mobile UI elements immediately if mobile
        if (state.isMobile) {
            createMobileHeader();
            createMobileFAB();
        }

        // Listen for statistics rendered event
        window.addEventListener('statisticsRendered', handleStatisticsRendered);

        // Listen for window resize
        window.addEventListener('resize', handleResize);

        // If statistics are already rendered (late load), apply mobile UI
        // This handles the case where the script loads after statistics are already displayed
        if (state.isMobile && document.getElementById('statisticsContainer')?.style.display !== 'none') {
            log('⚡ Statistics appear to be already rendered, checking...');
            setTimeout(() => {
                // Double-check if statisticsRendered event was missed
                if (!state.statisticsRendered && document.querySelector('.employee-card, #productStatsBody tr')) {
                    log('🔄 Statistics found in DOM, applying mobile UI now');
                    state.statisticsRendered = true;
                    applyMobileUI();
                }
            }, 500);
        }

        log('✅ Mobile Utilities V2 initialized');
    }

    // ========================================
    // MOBILE HEADER & FAB
    // ========================================

    /**
     * Create mobile-optimized header
     */
    function createMobileHeader() {
        // Check if already exists
        if (document.querySelector('.mobile-header')) {
            return;
        }

        const header = document.createElement('div');
        header.className = 'mobile-header';
        header.innerHTML = `
            <div class="mobile-header-title">
                <i class="fas fa-chart-bar"></i>
                <span>Báo Cáo</span>
            </div>
            <select id="mobileTableSelector" class="mobile-campaign-selector" onchange="handleTableChange()">
                <option value="">Chọn live</option>
            </select>
        `;

        // Insert at top of body
        document.body.insertBefore(header, document.body.firstChild);

        // Sync with desktop selector
        syncMobileTableSelector();

        log('✅ Mobile header created');
    }

    /**
     * Sync mobile table selector with desktop
     */
    function syncMobileTableSelector() {
        const desktopSelector = document.getElementById('tableSelector');
        const mobileSelector = document.getElementById('mobileTableSelector');

        if (!desktopSelector || !mobileSelector) return;

        // Copy options
        mobileSelector.innerHTML = desktopSelector.innerHTML;

        // Sync value
        mobileSelector.value = desktopSelector.value;

        // Keep in sync
        const originalHandler = window.handleTableChange;
        window.handleTableChange = function() {
            if (originalHandler) originalHandler();
            if (mobileSelector && desktopSelector) {
                mobileSelector.value = desktopSelector.value;
                desktopSelector.value = mobileSelector.value;
            }
        };
    }

    /**
     * Create floating action button (FAB)
     */
    function createMobileFAB() {
        // Check if already exists
        if (document.querySelector('.mobile-fab-container')) {
            return;
        }

        // Create FAB main button
        const fabContainer = document.createElement('div');
        fabContainer.className = 'mobile-fab-container';
        fabContainer.innerHTML = `
            <button class="mobile-fab success" id="mobileFabMain" title="Actions">
                <i class="fas fa-ellipsis-v"></i>
            </button>
        `;

        document.body.appendChild(fabContainer);

        // Create FAB menu (bottom sheet)
        const fabMenu = document.createElement('div');
        fabMenu.className = 'mobile-fab-menu';
        fabMenu.id = 'mobileFabMenu';
        fabMenu.innerHTML = `
            <div class="mobile-fab-menu-header">
                <div class="mobile-fab-menu-title">Thao tác</div>
                <button class="mobile-fab-menu-close" onclick="window.MobileUtils.closeFABMenu()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="mobile-fab-menu-item" onclick="refreshAllData(); window.MobileUtils.closeFABMenu();">
                <i class="fas fa-sync-alt"></i>
                <div class="mobile-fab-menu-item-content">
                    <div class="mobile-fab-menu-item-title">Làm mới danh sách</div>
                    <div class="mobile-fab-menu-item-desc">Tải lại dữ liệu từ nguồn</div>
                </div>
            </div>
            <div class="mobile-fab-menu-item" onclick="startBatchFetch(); window.MobileUtils.closeFABMenu();">
                <i class="fas fa-download"></i>
                <div class="mobile-fab-menu-item-content">
                    <div class="mobile-fab-menu-item-title">Lấy chi tiết đơn hàng</div>
                    <div class="mobile-fab-menu-item-desc">Tải chi tiết từ Firebase</div>
                </div>
            </div>
            <div class="mobile-fab-menu-item" onclick="switchMainTab('details'); window.MobileUtils.closeFABMenu();">
                <i class="fas fa-database"></i>
                <div class="mobile-fab-menu-item-content">
                    <div class="mobile-fab-menu-item-title">Chi tiết đã tải</div>
                    <div class="mobile-fab-menu-item-desc">Xem dữ liệu đã lưu</div>
                </div>
            </div>
        `;

        document.body.appendChild(fabMenu);

        // Create backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'mobile-fab-backdrop';
        backdrop.id = 'mobileFabBackdrop';
        backdrop.onclick = () => closeFABMenu();

        document.body.appendChild(backdrop);

        // Add click handler to main FAB
        document.getElementById('mobileFabMain').onclick = () => openFABMenu();

        log('✅ Mobile FAB created');
    }

    /**
     * Open FAB menu
     */
    function openFABMenu() {
        const menu = document.getElementById('mobileFabMenu');
        const backdrop = document.getElementById('mobileFabBackdrop');

        if (menu && backdrop) {
            menu.classList.add('show');
            backdrop.classList.add('show');
            haptic(15);
        }
    }

    /**
     * Close FAB menu
     */
    function closeFABMenu() {
        const menu = document.getElementById('mobileFabMenu');
        const backdrop = document.getElementById('mobileFabBackdrop');

        if (menu && backdrop) {
            menu.classList.remove('show');
            backdrop.classList.remove('show');
        }
    }

    // ========================================
    // PUBLIC API
    // ========================================

    window.MobileUtils = {
        // State
        isMobile,
        getState: () => ({ ...state }),

        // Actions
        applyMobileUI,
        removeMobileUI,
        toggleCollapsible,

        // Mobile UI
        openFABMenu,
        closeFABMenu,

        // Config
        CONFIG,

        // Version
        version: '2.0.0'
    };

    // ========================================
    // AUTO-INITIALIZE
    // ========================================

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    log('📦 Mobile Utilities V2 loaded (version 2.0.0)');

})();
