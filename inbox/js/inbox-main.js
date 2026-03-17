/* =====================================================
   INBOX MAIN - App initialization + Column Resizer
   ===================================================== */

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

window.showToast = showToast;

/* =====================================================
   COLUMN RESIZER - Draggable dividers between columns
   ===================================================== */

function initColumnResizer() {
    const handles = document.querySelectorAll('.resize-handle');

    handles.forEach(handle => {
        let startX = 0;
        let leftCol = null;
        let rightCol = null;
        let leftWidth = 0;
        let rightWidth = 0;

        function onMouseDown(e) {
            e.preventDefault();
            leftCol = document.getElementById(handle.dataset.left);
            rightCol = document.getElementById(handle.dataset.right);
            if (!leftCol || !rightCol) return;

            startX = e.clientX;
            leftWidth = leftCol.getBoundingClientRect().width;
            rightWidth = rightCol.getBoundingClientRect().width;

            handle.classList.add('dragging');
            document.body.classList.add('col-resizing');

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        }

        function onMouseMove(e) {
            const dx = e.clientX - startX;
            const newLeftW = leftWidth + dx;
            const newRightW = rightWidth - dx;

            const leftMin = parseInt(getComputedStyle(leftCol).minWidth) || 200;
            const rightMin = parseInt(getComputedStyle(rightCol).minWidth) || 200;

            if (newLeftW < leftMin || newRightW < rightMin) return;

            if (leftCol.classList.contains('inbox-col-conversations') ||
                leftCol.classList.contains('inbox-col-info')) {
                leftCol.style.width = newLeftW + 'px';
                leftCol.style.minWidth = newLeftW + 'px';
            } else {
                leftCol.style.flex = '0 0 ' + newLeftW + 'px';
                leftCol.style.minWidth = '300px';
            }

            if (rightCol.classList.contains('inbox-col-conversations') ||
                rightCol.classList.contains('inbox-col-info')) {
                rightCol.style.width = newRightW + 'px';
                rightCol.style.minWidth = newRightW + 'px';
            } else {
                rightCol.style.flex = '0 0 ' + newRightW + 'px';
                rightCol.style.minWidth = '300px';
            }
        }

        function onMouseUp() {
            handle.classList.remove('dragging');
            document.body.classList.remove('col-resizing');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }

        handle.addEventListener('mousedown', onMouseDown);

        // Touch support
        handle.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            onMouseDown({ clientX: touch.clientX, preventDefault: () => e.preventDefault() });

            function onTouchMove(e2) {
                onMouseMove({ clientX: e2.touches[0].clientX });
            }
            function onTouchEnd() {
                onMouseUp();
                document.removeEventListener('touchmove', onTouchMove);
                document.removeEventListener('touchend', onTouchEnd);
            }
            document.addEventListener('touchmove', onTouchMove, { passive: false });
            document.addEventListener('touchend', onTouchEnd);
        }, { passive: false });
    });
}

/* =====================================================
   INFO TABS - Switch between tabs in column 3
   ===================================================== */

function initInfoTabs() {
    const tabs = document.querySelectorAll('.info-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            // Deactivate all tabs
            document.querySelectorAll('.info-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.info-tab-content').forEach(c => c.classList.remove('active'));
            // Activate target
            tab.classList.add('active');
            const content = document.getElementById('tab' + targetTab.charAt(0).toUpperCase() + targetTab.slice(1));
            if (content) content.classList.add('active');
        });
    });
}

/* =====================================================
   INIT APP
   ===================================================== */

function initInboxApp() {
    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Initialize column resizer
    initColumnResizer();

    // Initialize info tabs
    initInfoTabs();

    // Initialize order controller if available
    if (typeof InboxOrderController !== 'undefined') {
        const orderController = new InboxOrderController();
        orderController.init();
        window.inboxOrders = orderController;
    }

    // Apply permission-based UI restrictions
    if (typeof PermissionHelper !== 'undefined') {
        PermissionHelper.applyUIRestrictions('inbox');
    }

    console.log('[Inbox] App initialized (clean slate - messaging removed)');
}

// Wait for DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInboxApp);
} else {
    initInboxApp();
}
