// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// ============================================
// CHECKBOX HANDLING & QUICK REPLY
// Extracted from tab1-orders.html
// ============================================

// ------------------------------------------------------------
// Helpers: thao tác tập selectedOrderIds + sync UI
// ------------------------------------------------------------

function getDisplayedOrders() {
    if (Array.isArray(window.displayedData)) return window.displayedData;
    if (typeof displayedData !== 'undefined' && Array.isArray(displayedData)) return displayedData;
    return [];
}

function getSelectedSet() {
    if (window.selectedOrderIds instanceof Set) return window.selectedOrderIds;
    if (typeof selectedOrderIds !== 'undefined' && selectedOrderIds instanceof Set) return selectedOrderIds;
    return null;
}

function syncCheckboxesFromState() {
    const selected = getSelectedSet();
    if (!selected) return;

    // Main table + employee sections (kept in sync with state)
    document.querySelectorAll('#tableBody input[type="checkbox"], .employee-section tbody input[type="checkbox"]')
        .forEach(cb => {
            if (!cb.value) return;
            cb.checked = selected.has(String(cb.value));
        });

    updateSelectAllHeaderState();
    if (typeof updateActionButtons === 'function') updateActionButtons();
}

function updateSelectAllHeaderState() {
    const selectAll = document.getElementById('selectAll');
    if (!selectAll) return;
    const total = getDisplayedOrders().length;
    const selectedCount = getSelectedSet()?.size || 0;

    if (total === 0 || selectedCount === 0) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
    } else if (selectedCount >= total) {
        selectAll.checked = true;
        selectAll.indeterminate = false;
    } else {
        selectAll.checked = false;
        selectAll.indeterminate = true;
    }
}

function notify(type, message) {
    if (window.notificationManager?.[type]) {
        window.notificationManager[type](message);
    }
}

// ------------------------------------------------------------
// Selection strategies
// ------------------------------------------------------------

function selectFirstN(n) {
    const data = getDisplayedOrders();
    const selected = getSelectedSet();
    if (!selected) return;
    if (data.length === 0) {
        notify('warning', 'Không có đơn hàng để chọn');
        return;
    }

    selected.clear();
    const count = Math.min(n, data.length);
    for (let i = 0; i < count; i++) {
        selected.add(String(data[i].Id));
    }
    syncCheckboxesFromState();
    notify('info', `Đã chọn ${count} đơn đầu tiên`);
}

function selectAllDisplayed() {
    const data = getDisplayedOrders();
    const selected = getSelectedSet();
    if (!selected) return;
    if (data.length === 0) {
        notify('warning', 'Không có đơn hàng để chọn');
        return;
    }
    selected.clear();
    data.forEach(order => selected.add(String(order.Id)));
    syncCheckboxesFromState();
    notify('info', `Đã chọn tất cả ${data.length} đơn`);
}

function clearSelection() {
    const selected = getSelectedSet();
    if (!selected) return;
    selected.clear();
    syncCheckboxesFromState();
    notify('info', 'Đã bỏ chọn tất cả');
}

/** Chọn đơn có SessionIndex (STT in TPOS) trong khoảng [from, to] (đã chuẩn hoá). */
function selectBySTTRange(from, to) {
    const data = getDisplayedOrders();
    const selected = getSelectedSet();
    if (!selected) return;
    if (data.length === 0) {
        notify('warning', 'Không có đơn hàng để chọn');
        return;
    }

    const min = Math.min(from, to);
    const max = Math.max(from, to);
    selected.clear();
    let count = 0;
    data.forEach(order => {
        const stt = Number(order.SessionIndex);
        if (Number.isFinite(stt) && stt >= min && stt <= max) {
            selected.add(String(order.Id));
            count++;
        }
    });
    syncCheckboxesFromState();
    if (count === 0) {
        notify('warning', `Không có đơn nào trong khoảng STT ${min} - ${max}`);
    } else {
        notify('info', `Đã chọn ${count} đơn trong khoảng STT ${min} - ${max}`);
    }
}

/** Chọn theo vị trí hiển thị (1-based index trong displayedData). */
function selectByDisplayPosition(from, to) {
    const data = getDisplayedOrders();
    const selected = getSelectedSet();
    if (!selected) return;
    if (data.length === 0) {
        notify('warning', 'Không có đơn hàng để chọn');
        return;
    }

    const total = data.length;
    const min = Math.max(1, Math.min(from, to));
    const max = Math.min(total, Math.max(from, to));
    if (min > total) {
        notify('warning', `Vị trí bắt đầu vượt quá số đơn hiển thị (${total})`);
        return;
    }

    selected.clear();
    for (let i = min - 1; i <= max - 1; i++) {
        selected.add(String(data[i].Id));
    }
    syncCheckboxesFromState();
    notify('info', `Đã chọn ${max - min + 1} đơn (vị trí ${min} - ${max})`);
}

// Expose một số helper để các module khác có thể dùng lại
window.Tab1Selection = {
    selectFirstN,
    selectAllDisplayed,
    clearSelection,
    selectBySTTRange,
    selectByDisplayPosition,
    syncCheckboxesFromState,
};

// ------------------------------------------------------------
// Dropdown UI wiring
// ------------------------------------------------------------

function positionSelectAllMenu() {
    const menu = document.getElementById('selectAllMenu');
    const btn = document.getElementById('selectAllMenuBtn');
    if (!menu || !btn) return;

    const rect = btn.getBoundingClientRect();
    const menuWidth = menu.offsetWidth || 240;
    const menuHeight = menu.offsetHeight || 260;
    const margin = 4;

    let left = rect.left;
    let top = rect.bottom + margin;
    if (left + menuWidth > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - menuWidth - 8);
    }
    if (top + menuHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - menuHeight - margin);
    }
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
}

function toggleSelectAllMenu(forceState) {
    const menu = document.getElementById('selectAllMenu');
    const btn = document.getElementById('selectAllMenuBtn');
    if (!menu || !btn) return;

    const willOpen = typeof forceState === 'boolean' ? forceState : menu.hasAttribute('hidden');
    if (willOpen) {
        menu.removeAttribute('hidden');
        btn.setAttribute('aria-expanded', 'true');
        const total = getDisplayedOrders().length;
        const totalSpan = document.getElementById('selectAllMenuTotal');
        if (totalSpan) totalSpan.textContent = String(total);
        positionSelectAllMenu();
    } else {
        menu.setAttribute('hidden', '');
        btn.setAttribute('aria-expanded', 'false');
    }
}

function parseRangeInputs(fromEl, toEl) {
    const from = Number(fromEl?.value);
    const to = Number(toEl?.value);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= 0) {
        notify('warning', 'Vui lòng nhập đủ 2 giá trị số hợp lệ');
        return null;
    }
    return { from, to };
}

document.addEventListener('DOMContentLoaded', function () {
    const selectAllCheckbox = document.getElementById('selectAll');
    const menuBtn = document.getElementById('selectAllMenuBtn');
    const menu = document.getElementById('selectAllMenu');

    // ----- Individual checkbox change (giữ hành vi cũ) -----
    document.addEventListener('change', function (e) {
        if (e.target.matches('tbody input[type="checkbox"]')) {
            if (typeof updateActionButtons === 'function') updateActionButtons();
            updateSelectAllHeaderState();
        }
    });

    // ----- Dropdown toggle -----
    if (menuBtn) {
        menuBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            toggleSelectAllMenu();
        });
    }

    // Đóng menu khi click ra ngoài
    document.addEventListener('click', function (e) {
        if (!menu || menu.hasAttribute('hidden')) return;
        const wrapper = menu.closest('.select-all-wrapper');
        if (wrapper && !wrapper.contains(e.target)) {
            toggleSelectAllMenu(false);
        }
    });

    // Đóng menu khi nhấn Escape
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && menu && !menu.hasAttribute('hidden')) {
            toggleSelectAllMenu(false);
        }
    });

    // Đóng menu khi scroll table hoặc resize window (vì position: fixed)
    const closeOnViewportChange = () => {
        if (menu && !menu.hasAttribute('hidden')) toggleSelectAllMenu(false);
    };
    window.addEventListener('resize', closeOnViewportChange);
    document.addEventListener('scroll', closeOnViewportChange, true);

    // ----- Quick-select items (data-select-count) -----
    if (menu) {
        menu.addEventListener('click', function (e) {
            const item = e.target.closest('[data-select-count]');
            if (!item) return;
            const value = item.dataset.selectCount;
            if (value === 'all') {
                selectAllDisplayed();
            } else if (value === 'none') {
                clearSelection();
            } else {
                const n = parseInt(value, 10);
                if (Number.isFinite(n) && n > 0) selectFirstN(n);
            }
            toggleSelectAllMenu(false);
        });
    }

    // ----- Chọn theo khoảng STT -----
    const rangeApply = document.getElementById('selectAllRangeApply');
    const rangeFrom = document.getElementById('selectAllRangeFrom');
    const rangeTo = document.getElementById('selectAllRangeTo');
    if (rangeApply && rangeFrom && rangeTo) {
        const applyRange = () => {
            const parsed = parseRangeInputs(rangeFrom, rangeTo);
            if (!parsed) return;
            selectBySTTRange(parsed.from, parsed.to);
            toggleSelectAllMenu(false);
        };
        rangeApply.addEventListener('click', applyRange);
        [rangeFrom, rangeTo].forEach(el => {
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    applyRange();
                }
            });
        });
    }

    // ----- Chọn theo vị trí hiển thị -----
    const posApply = document.getElementById('selectAllPosApply');
    const posFrom = document.getElementById('selectAllPosFrom');
    const posTo = document.getElementById('selectAllPosTo');
    if (posApply && posFrom && posTo) {
        const applyPos = () => {
            const parsed = parseRangeInputs(posFrom, posTo);
            if (!parsed) return;
            selectByDisplayPosition(parsed.from, parsed.to);
            toggleSelectAllMenu(false);
        };
        posApply.addEventListener('click', applyPos);
        [posFrom, posTo].forEach(el => {
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    applyPos();
                }
            });
        });
    }

    // Ngăn click trong menu làm đóng menu (trừ các item có handler riêng)
    if (menu) {
        menu.addEventListener('click', (e) => e.stopPropagation());
    }

    // Cập nhật trạng thái select-all header khi tải lần đầu
    updateSelectAllHeaderState();
});

/**
 * Open quick reply modal for inserting into chat input
 */
window.openChatTemplateModal = function() {
    if (!window.quickReplyManager) {
        console.error('❌ QuickReplyManager not initialized');
        if (window.notificationManager) {
            window.notificationManager.error('Hệ thống chưa sẵn sàng, vui lòng thử lại');
        }
        return;
    }

    // Open quick reply modal with target input
    window.quickReplyManager.openModal('chatReplyInput');

};
