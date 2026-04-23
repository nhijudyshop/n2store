// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Column Manager - Dual column layout management
 * Handles column order, resize, fullscreen, and settings panel
 */

const ColumnManager = (() => {
    const STORAGE_KEY = 'tpos_pancake_column_order';
    const DEFAULT_ORDER = ['tpos', 'pancake'];
    const MIN_COLUMN_WIDTH = 300;

    const COLUMNS = {
        tpos: { id: 'tposColumn', contentId: 'tposContent', name: 'TPOS', icon: 'shopping-cart' },
        pancake: {
            id: 'pancakeColumn',
            contentId: 'pancakeContent',
            name: 'Pancake',
            icon: 'layout-grid',
        },
    };

    let currentOrder = [...DEFAULT_ORDER];
    let isResizing = false;
    let startX = 0;
    let startWidths = { left: 0, right: 0 };

    // ---- Column Order ----

    function loadOrder() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length === 2) {
                    currentOrder = parsed;
                }
            }
        } catch {
            currentOrder = [...DEFAULT_ORDER];
        }
    }

    function saveOrder() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentOrder));
    }

    function applyOrder() {
        const container = document.getElementById('dualColumnContainer');
        const tposCol = document.getElementById('tposColumn');
        const pancakeCol = document.getElementById('pancakeColumn');
        const handle = document.getElementById('resizeHandle');
        if (!container || !tposCol || !pancakeCol || !handle) return;

        container.innerHTML = '';
        currentOrder.forEach((key, i) => {
            container.appendChild(key === 'tpos' ? tposCol : pancakeCol);
            if (i === 0) container.appendChild(handle);
        });

        _refreshIcons();
    }

    function swapColumns() {
        currentOrder = [currentOrder[1], currentOrder[0]];
        applyOrder();
        saveOrder();
        _updateSelectValues();
        window.eventBus?.emit('layout:columnSwapped', { order: [...currentOrder] });
    }

    function getOrder() {
        return [...currentOrder];
    }

    // ---- Resize ----

    function _initResize() {
        const handle = document.getElementById('resizeHandle');
        if (!handle) return;

        handle.addEventListener('mousedown', _startResize);
        document.addEventListener('mousemove', _doResize);
        document.addEventListener('mouseup', _stopResize);

        handle.addEventListener('touchstart', (e) => _startResize(e.touches[0]));
        document.addEventListener('touchmove', (e) => {
            if (isResizing) _doResize(e.touches[0]);
        });
        document.addEventListener('touchend', _stopResize);
    }

    function _startResize(e) {
        isResizing = true;
        startX = e.clientX;
        const container = document.getElementById('dualColumnContainer');
        const cols = container.querySelectorAll('.column-wrapper');
        if (cols.length >= 2) {
            startWidths.left = cols[0].offsetWidth;
            startWidths.right = cols[1].offsetWidth;
        }
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }

    function _doResize(e) {
        if (!isResizing) return;
        const container = document.getElementById('dualColumnContainer');
        const cols = container.querySelectorAll('.column-wrapper');
        const handle = document.getElementById('resizeHandle');
        if (cols.length < 2) return;

        const dx = e.clientX - startX;
        const containerW = container.offsetWidth - handle.offsetWidth;
        let leftW = startWidths.left + dx;
        let rightW = startWidths.right - dx;

        if (leftW < MIN_COLUMN_WIDTH) {
            leftW = MIN_COLUMN_WIDTH;
            rightW = containerW - MIN_COLUMN_WIDTH;
        }
        if (rightW < MIN_COLUMN_WIDTH) {
            rightW = MIN_COLUMN_WIDTH;
            leftW = containerW - MIN_COLUMN_WIDTH;
        }

        cols[0].style.flex = `0 0 ${(leftW / containerW) * 100}%`;
        cols[1].style.flex = `0 0 ${(rightW / containerW) * 100}%`;
    }

    function _stopResize() {
        if (!isResizing) return;
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }

    // ---- Fullscreen ----

    function toggleFullscreen(columnKey) {
        const col = document.getElementById(COLUMNS[columnKey]?.id);
        if (!col) return;
        const isFs = col.classList.toggle('fullscreen');
        document.body.style.overflow = isFs ? 'hidden' : '';
        _refreshIcons();
    }

    // ---- Settings Panel ----

    function _initSettingsPanel() {
        const btn = document.getElementById('btnColumnSettings');
        const panel = document.getElementById('settingsPanel');
        const closeBtn = document.getElementById('closeSettings');
        const applyBtn = document.getElementById('btnApplySettings');
        const resetBtn = document.getElementById('btnResetSettings');
        const col1 = document.getElementById('column1Select');
        const col2 = document.getElementById('column2Select');

        if (btn) btn.addEventListener('click', () => panel?.classList.toggle('show'));
        if (closeBtn) closeBtn.addEventListener('click', () => panel?.classList.remove('show'));

        document.addEventListener('click', (e) => {
            if (
                panel?.classList.contains('show') &&
                !panel.contains(e.target) &&
                e.target !== btn &&
                !btn?.contains(e.target)
            ) {
                panel.classList.remove('show');
            }
        });

        if (col1 && col2) {
            col1.addEventListener('change', () => {
                col2.value = col1.value === 'tpos' ? 'pancake' : 'tpos';
            });
            col2.addEventListener('change', () => {
                col1.value = col2.value === 'tpos' ? 'pancake' : 'tpos';
            });
        }

        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                if (col1.value === col2.value) {
                    showNotification('Hai cột không thể giống nhau!', 'error');
                    return;
                }
                currentOrder = [col1.value, col2.value];
                applyOrder();
                saveOrder();
                panel?.classList.remove('show');
                showNotification('Đã áp dụng cài đặt vị trí cột!', 'success');
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                currentOrder = [...DEFAULT_ORDER];
                applyOrder();
                saveOrder();
                _updateSelectValues();
                showNotification('Đã đặt lại vị trí cột mặc định!', 'info');
            });
        }
    }

    function _updateSelectValues() {
        const col1 = document.getElementById('column1Select');
        const col2 = document.getElementById('column2Select');
        if (col1) col1.value = currentOrder[0];
        if (col2) col2.value = currentOrder[1];
    }

    // ---- Notifications ----

    function showNotification(message, type = 'info') {
        let container = document.querySelector('.notification-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'notification-container';
            container.style.cssText =
                'position:fixed;top:80px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;';
            document.body.appendChild(container);
        }

        const colors = {
            success: { bg: '#dcfce7', border: '#22c55e', text: '#166534' },
            error: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
            info: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
            warning: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
        };
        const c = colors[type] || colors.info;

        const el = document.createElement('div');
        el.className = `notification notification-${type}`;
        el.style.cssText = `padding:12px 16px;background:${c.bg};border:1px solid ${c.border};border-radius:8px;color:${c.text};font-size:14px;font-weight:500;box-shadow:0 4px 6px -1px rgb(0 0 0/0.1);animation:slideIn 0.3s ease-out;max-width:320px;`;
        el.textContent = message;
        container.appendChild(el);

        setTimeout(() => {
            el.style.animation = 'slideOut 0.3s ease-in forwards';
            setTimeout(() => el.remove(), 300);
        }, 3000);
    }

    // ---- Refresh / Utility ----

    function _refreshIcons() {
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function refreshColumns() {
        showNotification('Đã làm mới nội dung!', 'success');
        window.eventBus?.emit('layout:refresh');
    }

    function setColumnContent(columnKey, html) {
        const el = document.getElementById(COLUMNS[columnKey]?.contentId);
        if (el) {
            el.innerHTML = html;
            _refreshIcons();
        }
    }

    // ---- Init ----

    function initialize() {
        loadOrder();
        applyOrder();
        _updateSelectValues();
        _initSettingsPanel();
        _initResize();
        _refreshIcons();

        // Escape key exits fullscreen
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const fs = document.querySelector('.column-wrapper.fullscreen');
                if (fs) {
                    fs.classList.remove('fullscreen');
                    document.body.style.overflow = '';
                }
            }
        });

        // Refresh button
        const btnRefresh = document.getElementById('btnRefresh');
        if (btnRefresh) btnRefresh.addEventListener('click', refreshColumns);

        // Inject animation styles
        if (!document.getElementById('column-manager-styles')) {
            const style = document.createElement('style');
            style.id = 'column-manager-styles';
            style.textContent = `
                @keyframes slideIn { from { opacity:0; transform:translateX(100%); } to { opacity:1; transform:translateX(0); } }
                @keyframes slideOut { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(100%); } }
            `;
            document.head.appendChild(style);
        }
    }

    return {
        initialize,
        swapColumns,
        toggleFullscreen,
        showNotification,
        refreshColumns,
        setColumnContent,
        getOrder,
    };
})();

// Export
if (typeof window !== 'undefined') {
    window.ColumnManager = ColumnManager;
    window.showNotification = ColumnManager.showNotification;
}
