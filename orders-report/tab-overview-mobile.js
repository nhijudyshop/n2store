/**
 * Mobile-specific JavaScript utilities for tab-overview.html
 * Handles collapsible sections, touch interactions, and mobile UX enhancements
 */

(function() {
    'use strict';

    // Check if we're on mobile
    const isMobile = () => window.innerWidth <= 768;

    /**
     * Initialize collapsible sections for mobile
     */
    function initCollapsibleSections() {
        console.log('[MOBILE] Initializing collapsible sections...');

        // Product Statistics - Collapsed by default on mobile
        const productStatsSection = document.getElementById('productStatsSection');
        if (productStatsSection && isMobile()) {
            makeCollapsible(productStatsSection, {
                title: 'Thống Kê Sản Phẩm',
                icon: 'fa-box',
                collapsed: true, // Start collapsed on mobile
                badge: true
            });
        }

        // Tag Statistics - Can be collapsed
        const tagStatsSection = document.getElementById('tagStatsSection');
        if (tagStatsSection && isMobile()) {
            makeCollapsible(tagStatsSection, {
                title: 'Thống Kê Theo Tag',
                icon: 'fa-tags',
                collapsed: false,
                badge: true
            });
        }
    }

    /**
     * Make a section collapsible with mobile-friendly UI
     */
    function makeCollapsible(section, options = {}) {
        const {
            title = 'Section',
            icon = 'fa-chart-bar',
            collapsed = false,
            badge = false
        } = options;

        // Skip if already collapsible
        if (section.classList.contains('collapsible-section')) {
            return;
        }

        // Get the content to be collapsed
        const content = section.querySelector('.stats-table-wrapper') ||
                       section.querySelector('.mobile-card-list') ||
                       section.querySelector('table')?.parentElement;

        if (!content) {
            console.warn('[MOBILE] No content found for collapsible section:', section.id);
            return;
        }

        // Get badge count if exists
        const badgeElement = section.querySelector('.section-badge');
        const badgeText = badgeElement ? badgeElement.textContent : '';

        // Create collapsible structure
        const wrapper = document.createElement('div');
        wrapper.className = 'collapsible-section';
        if (collapsed) {
            wrapper.classList.add('collapsed');
        } else {
            wrapper.classList.add('expanded');
        }

        // Create header
        const header = document.createElement('div');
        header.className = 'collapsible-header';
        header.innerHTML = `
            <div class="collapsible-title">
                <i class="fas ${icon}"></i>
                <span>${title}</span>
                ${badge && badgeText ? `<span class="mobile-card-badge">${badgeText}</span>` : ''}
            </div>
            <div class="collapsible-toggle">
                <i class="fas fa-chevron-down"></i>
            </div>
        `;

        // Create content wrapper
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'collapsible-content';
        const contentBody = document.createElement('div');
        contentBody.className = 'collapsible-body';

        // Move original content
        contentBody.appendChild(content);
        contentWrapper.appendChild(contentBody);

        // Assemble structure
        wrapper.appendChild(header);
        wrapper.appendChild(contentWrapper);

        // Replace original section content
        section.innerHTML = '';
        section.appendChild(wrapper);

        // Add click handler
        header.addEventListener('click', () => {
            toggleCollapsible(wrapper);
        });

        console.log('[MOBILE] Made section collapsible:', title);
    }

    /**
     * Toggle collapsible section
     */
    function toggleCollapsible(section) {
        const isExpanded = section.classList.contains('expanded');

        if (isExpanded) {
            section.classList.remove('expanded');
            section.classList.add('collapsed');
        } else {
            section.classList.remove('collapsed');
            section.classList.add('expanded');
        }

        // Haptic feedback if available
        if (navigator.vibrate) {
            navigator.vibrate(10);
        }
    }

    /**
     * Convert tables to mobile card lists
     */
    function convertTablesToCards() {
        if (!isMobile()) return;

        console.log('[MOBILE] Converting tables to card lists...');

        // Find all tables in stats sections
        const tables = document.querySelectorAll('.stats-table, .orders-table');

        tables.forEach(table => {
            const cardList = createCardListFromTable(table);
            if (cardList) {
                // Insert card list before table
                table.parentElement.insertBefore(cardList, table);
                // Hide table (CSS will handle this, but double-check)
                table.style.display = 'none';
            }
        });
    }

    /**
     * Create mobile card list from table
     */
    function createCardListFromTable(table) {
        const thead = table.querySelector('thead');
        const tbody = table.querySelector('tbody');

        if (!thead || !tbody) return null;

        // Get headers
        const headers = Array.from(thead.querySelectorAll('th')).map(th => th.textContent.trim());
        const rows = Array.from(tbody.querySelectorAll('tr'));

        if (rows.length === 0) return null;

        // Create card list container
        const cardList = document.createElement('div');
        cardList.className = 'mobile-card-list';

        // Convert each row to a card
        rows.forEach((row, index) => {
            const cells = Array.from(row.querySelectorAll('td'));

            const card = document.createElement('div');
            card.className = 'mobile-card-item';

            // Create rows for each cell
            cells.forEach((cell, cellIndex) => {
                if (cellIndex >= headers.length) return; // Skip extra cells

                const header = headers[cellIndex];
                const value = cell.textContent.trim();

                // Skip empty headers (like action columns)
                if (!header) return;

                const cardRow = document.createElement('div');
                cardRow.className = 'mobile-card-row';

                const label = document.createElement('div');
                label.className = 'mobile-card-label';
                label.textContent = header;

                const valueDiv = document.createElement('div');
                valueDiv.className = 'mobile-card-value';

                // Preserve HTML content if exists (like tags, badges)
                if (cell.querySelector('.order-tag, .tag-badge')) {
                    valueDiv.innerHTML = cell.innerHTML;
                } else {
                    valueDiv.textContent = value;
                }

                cardRow.appendChild(label);
                cardRow.appendChild(valueDiv);
                card.appendChild(cardRow);
            });

            // Add click handler if original row had one
            if (row.onclick) {
                card.onclick = row.onclick;
                card.style.cursor = 'pointer';
            }

            cardList.appendChild(card);
        });

        return cardList;
    }

    /**
     * Initialize employee cards with collapsible details
     */
    function initEmployeeCards() {
        if (!isMobile()) return;

        console.log('[MOBILE] Initializing employee cards...');

        const employeeSections = document.querySelectorAll('.employee-section');

        employeeSections.forEach((section, index) => {
            const header = section.querySelector('.employee-header');
            const tableContainer = section.querySelector('.table-container');

            if (!header || !tableContainer) return;

            // Add toggle icon to employee name
            const employeeName = header.querySelector('.employee-name');
            if (employeeName && !employeeName.querySelector('.toggle-icon')) {
                const toggleIcon = document.createElement('i');
                toggleIcon.className = 'fas fa-chevron-down toggle-icon';
                employeeName.appendChild(toggleIcon);
            }

            // Start collapsed (except first employee)
            if (index > 0) {
                section.classList.add('collapsed');
                tableContainer.style.display = 'none';
            } else {
                section.classList.add('expanded');
            }

            // Add click handler
            header.addEventListener('click', () => {
                const isCollapsed = section.classList.contains('collapsed');

                if (isCollapsed) {
                    section.classList.remove('collapsed');
                    section.classList.add('expanded');
                    tableContainer.style.display = 'block';
                    if (employeeName.querySelector('.toggle-icon')) {
                        employeeName.querySelector('.toggle-icon').style.transform = 'rotate(180deg)';
                    }
                } else {
                    section.classList.remove('expanded');
                    section.classList.add('collapsed');
                    tableContainer.style.display = 'none';
                    if (employeeName.querySelector('.toggle-icon')) {
                        employeeName.querySelector('.toggle-icon').style.transform = 'rotate(0deg)';
                    }
                }

                // Haptic feedback
                if (navigator.vibrate) {
                    navigator.vibrate(10);
                }
            });
        });
    }

    /**
     * Handle window resize - re-initialize if switching between mobile/desktop
     */
    let resizeTimer;
    function handleResize() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            console.log('[MOBILE] Window resized, checking if re-init needed...');
            const wasMobile = document.body.classList.contains('mobile-view');
            const nowMobile = isMobile();

            if (wasMobile !== nowMobile) {
                document.body.classList.toggle('mobile-view', nowMobile);
                if (nowMobile) {
                    initMobileFeatures();
                }
            }
        }, 250);
    }

    /**
     * Initialize all mobile features
     */
    function initMobileFeatures() {
        if (!isMobile()) {
            console.log('[MOBILE] Not on mobile, skipping mobile features');
            return;
        }

        console.log('[MOBILE] Initializing mobile features...');
        document.body.classList.add('mobile-view');

        // Initialize collapsible sections
        setTimeout(() => {
            initCollapsibleSections();
            initEmployeeCards();
            convertTablesToCards();
        }, 500); // Wait for DOM to be ready
    }

    /**
     * Add smooth scroll behavior
     */
    function initSmoothScroll() {
        document.documentElement.style.scrollBehavior = 'smooth';
    }

    /**
     * Prevent double-tap zoom on buttons
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
     * Initialize on DOM ready
     */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initMobileFeatures();
            initSmoothScroll();
            preventDoubleTapZoom();
        });
    } else {
        initMobileFeatures();
        initSmoothScroll();
        preventDoubleTapZoom();
    }

    // Listen for window resize
    window.addEventListener('resize', handleResize);

    // Export functions for external use
    window.MobileUtils = {
        initCollapsibleSections,
        initEmployeeCards,
        convertTablesToCards,
        isMobile,
        toggleCollapsible
    };

    console.log('[MOBILE] Mobile utilities loaded and ready');

})();
