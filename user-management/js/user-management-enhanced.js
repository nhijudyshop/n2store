// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// USER MANAGEMENT WITH RENDER API
// =====================================================

let users = [];

// =====================================================
// API CLIENT
// =====================================================
const UserAPI = {
    BASE_URL: window.location.hostname === 'localhost'
        ? 'http://localhost:3000/api/users'
        : 'https://chatomni-proxy.nhijudyshop.workers.dev/api/users',

    getToken() {
        const auth = JSON.parse(localStorage.getItem('loginindex_auth') || sessionStorage.getItem('loginindex_auth') || '{}');
        return auth.token;
    },

    async fetch(endpoint, options = {}) {
        const url = `${this.BASE_URL}${endpoint}`;
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.getToken()}`,
                ...options.headers
            }
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }
        return data;
    }
};

// Check admin access
function checkAdminAccess() {
    const isLoggedIn = localStorage.getItem("isLoggedIn") || sessionStorage.getItem("isLoggedIn");
    const authData = localStorage.getItem("loginindex_auth") || sessionStorage.getItem("loginindex_auth");

    if (!isLoggedIn || isLoggedIn !== "true") {
        showAccessDenied("Ban chua dang nhap he thong.");
        return false;
    }

    if (!authData) {
        showAccessDenied("Khong tim thay thong tin dang nhap.");
        return false;
    }

    let hasPermission = false;

    try {
        const auth = JSON.parse(authData);

        if (auth.detailedPermissions && auth.detailedPermissions['user-management']) {
            const userMgmtPerms = auth.detailedPermissions['user-management'];
            hasPermission = Object.values(userMgmtPerms).some(v => v === true);
        }
    } catch (e) {
        console.error("Error checking permissions:", e);
    }

    if (!hasPermission) {
        showAccessDenied("Ban khong co quyen truy cap trang quan ly nguoi dung.");
        return false;
    }

    try {
        const auth = JSON.parse(authData);
        document.getElementById("currentUser").textContent =
            auth.displayName || auth.username || "Admin";
    } catch (e) {
        document.getElementById("currentUser").textContent = "Admin";
    }

    document.getElementById("mainContainer").style.display = "block";

    // Check API connection
    setTimeout(checkApiConnection, 500);

    return true;
}

function showAccessDenied(reason = "") {
    document.getElementById("accessDenied").style.display = "block";
    document.getElementById("mainContainer").style.display = "none";

    if (reason) {
        const msg = document.querySelector("#accessDenied p");
        msg.innerHTML = reason;
    }
}

// API Connection Check
async function checkApiConnection() {
    const statusEl = document.getElementById("apiStatus");
    if (!statusEl) return;

    try {
        const data = await UserAPI.fetch('/');
        statusEl.textContent = `Connected to Render API\nUsers: ${data.users?.length || 0}`;
        statusEl.className = "output success";

        // Auto load users
        users = data.users || [];
        renderUserList(users);
    } catch (error) {
        statusEl.textContent = "API connection failed: " + error.message;
        statusEl.className = "output error";
    }
}

// Load users
function renderSkeletonLoading(container, count = 5) {
    let html = '';
    for (let i = 0; i < count; i++) {
        html += `<div class="skeleton-user-item">
            <div class="skeleton skeleton-avatar"></div>
            <div class="skeleton-details">
                <div class="skeleton skeleton-text-lg"></div>
                <div class="skeleton skeleton-text-sm"></div>
            </div>
        </div>`;
    }
    container.innerHTML = html;
}

async function loadUsers() {
    const userList = document.getElementById("userList");
    renderSkeletonLoading(userList, 5);

    try {
        const data = await UserAPI.fetch('/');
        users = data.users || [];

        if (users.length === 0) {
            userList.innerHTML =
                '<div class="empty-state show"><div class="empty-state-icon-wrapper"><i data-lucide="user-x"></i></div><h3>Không có tài khoản nào</h3></div>';
            if (typeof lucide !== "undefined") {
                lucide.createIcons();
            }
            return;
        }

        users.sort((a, b) => {
            const aIsAdmin = a.roleTemplate === 'admin' ? 0 : 1;
            const bIsAdmin = b.roleTemplate === 'admin' ? 0 : 1;
            if (aIsAdmin !== bIsAdmin) return aIsAdmin - bIsAdmin;
            return (a.displayName || '').localeCompare(b.displayName || '');
        });

        renderUserList(users);
    } catch (error) {
        userList.innerHTML = `<div class="empty-state show"><div class="empty-state-icon-wrapper"><i data-lucide="alert-circle"></i></div><h3>Lỗi tải danh sách</h3><p>${error.message}</p><button class="btn btn-primary" onclick="loadUsers()"><i data-lucide="refresh-cw"></i> Thử lại</button></div>`;
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }
}

// =====================================================
// BULK SELECTION MANAGEMENT
// =====================================================
const selectedUsers = new Set();

function toggleUserSelection(userId, checkbox) {
    if (checkbox.checked) {
        selectedUsers.add(userId);
    } else {
        selectedUsers.delete(userId);
    }
    updateBulkToolbar();
}

function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById("selectAllCheckbox");
    const checkboxes = document.querySelectorAll(".user-select-checkbox");

    if (selectAllCheckbox.checked) {
        checkboxes.forEach(cb => {
            cb.checked = true;
            selectedUsers.add(cb.dataset.userId);
        });
    } else {
        checkboxes.forEach(cb => {
            cb.checked = false;
        });
        selectedUsers.clear();
    }
    updateBulkToolbar();
}

function clearSelection() {
    selectedUsers.clear();
    document.querySelectorAll(".user-select-checkbox").forEach(cb => cb.checked = false);
    const selectAllCheckbox = document.getElementById("selectAllCheckbox");
    if (selectAllCheckbox) selectAllCheckbox.checked = false;
    updateBulkToolbar();
}

function updateBulkToolbar() {
    const toolbar = document.getElementById("bulkActionToolbar");
    const count = selectedUsers.size;

    if (toolbar) {
        if (count > 0) {
            toolbar.style.display = "flex";
            document.getElementById("selectedCount").textContent = count;
        } else {
            toolbar.style.display = "none";
        }
    }
}

function showBulkTemplateModal() {
    if (selectedUsers.size === 0) {
        showError("Vui long chon it nhat 1 user!");
        return;
    }

    const selectedUsersList = Array.from(selectedUsers).map(uid => {
        const user = users.find(u => u.id === uid);
        return user ? `<li>${user.displayName} (${user.id})</li>` : '';
    }).join('');

    const templates = typeof PERMISSION_TEMPLATES !== 'undefined' ? PERMISSION_TEMPLATES : {};
    let templateOptions = '';
    Object.entries(templates).forEach(([id, template]) => {
        if (id !== 'custom') {
            templateOptions += `
                <label class="template-option" data-template="${id}">
                    <input type="radio" name="bulkTemplate" value="${id}">
                    <div class="template-option-content" style="border-color: ${template.color}20">
                        <i data-lucide="${template.icon || 'sliders'}" style="color: ${template.color}"></i>
                        <span class="template-name">${template.name}</span>
                        <span class="template-desc">${template.description || ''}</span>
                    </div>
                </label>
            `;
        }
    });

    const modalHtml = `
        <div class="modal-overlay" id="bulkTemplateModal" onclick="if(event.target === this) closeBulkTemplateModal()">
            <div class="modal-content bulk-template-modal">
                <div class="modal-header">
                    <h3><i data-lucide="users"></i> Ap dung Template cho ${selectedUsers.size} Users</h3>
                    <button class="modal-close" onclick="closeBulkTemplateModal()">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="bulk-template-section">
                        <h4><i data-lucide="layout-template"></i> Chon Template</h4>
                        <div class="template-options-grid">
                            ${templateOptions}
                        </div>
                    </div>
                    <div class="bulk-template-section">
                        <h4><i data-lucide="users"></i> Users se duoc cap nhat</h4>
                        <div class="selected-users-preview">
                            <ul>${selectedUsersList}</ul>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeBulkTemplateModal()">
                        <i data-lucide="x"></i> Huy
                    </button>
                    <button class="btn btn-primary" onclick="executeBulkApplyTemplate()">
                        <i data-lucide="check"></i> Ap dung Template
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    lucide.createIcons();
}

function closeBulkTemplateModal() {
    const modal = document.getElementById("bulkTemplateModal");
    if (modal) modal.remove();
}

async function executeBulkApplyTemplate() {
    const selectedTemplate = document.querySelector('input[name="bulkTemplate"]:checked');

    if (!selectedTemplate) {
        showError("Vui long chon mot template!");
        return;
    }

    const templateId = selectedTemplate.value;
    const templateName = PERMISSION_TEMPLATES[templateId]?.name || templateId;

    if (!confirm(`Ban co chac chan muon ap dung template "${templateName}" cho ${selectedUsers.size} users?\n\nHanh dong nay se ghi de toan bo quyen hien tai cua cac users da chon.`)) {
        return;
    }

    // Get permissions from registry
    let permissions = {};
    if (typeof PermissionsRegistry !== 'undefined') {
        const templateData = PermissionsRegistry.generateTemplatePermissions(templateId);
        permissions = templateData.detailedPermissions || {};
    }

    const applyBtn = document.querySelector('.bulk-template-modal .btn-primary');
    const originalText = applyBtn.innerHTML;
    applyBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Dang xu ly...';
    applyBtn.disabled = true;

    try {
        await UserAPI.fetch('/batch-template', {
            method: 'POST',
            body: JSON.stringify({
                userIds: Array.from(selectedUsers),
                templateId: templateId,
                permissions: permissions
            })
        });

        showSuccess(`Da ap dung template "${templateName}" cho ${selectedUsers.size} users!`);
        closeBulkTemplateModal();
        clearSelection();
        await loadUsers();

    } catch (error) {
        console.error("Bulk apply error:", error);
        showError("Loi khi ap dung template: " + error.message);
        applyBtn.innerHTML = originalText;
        applyBtn.disabled = false;
    }
}

// =====================================================
// USER LIST RENDERING
// =====================================================

function renderUserList(users) {
    const userList = document.getElementById("userList");
    const emptyState = userList.querySelector(".empty-state");

    if (!users || users.length === 0) {
        if (emptyState) emptyState.classList.add("show");
        return;
    }

    if (emptyState) emptyState.classList.remove("show");

    let html = `
        <div class="user-list-header">
            <div class="user-select-cell">
                <input type="checkbox" id="selectAllCheckbox" onchange="toggleSelectAll()" title="Chon tat ca">
            </div>
            <div class="user-list-header-info">
                <span class="user-count">${users.length} users</span>
            </div>
            <div id="bulkActionToolbar" class="bulk-action-toolbar" style="display: none;">
                <span class="selected-info">
                    <i data-lucide="check-square"></i>
                    Da chon <strong id="selectedCount">0</strong> users
                </span>
                <button class="btn btn-primary btn-sm" onclick="showBulkTemplateModal()">
                    <i data-lucide="layout-template"></i>
                    Ap dung Template
                </button>
                <button class="btn btn-secondary btn-sm" onclick="clearSelection()">
                    <i data-lucide="x"></i>
                    Bo chon
                </button>
            </div>
        </div>
    `;

    users.forEach((user) => {
        const roleInfo = getRoleTemplateInfo(user.roleTemplate);

        let permissionCount = 0;
        let accessiblePagesCount = 0;
        if (user.detailedPermissions) {
            Object.entries(user.detailedPermissions).forEach(([pageId, pagePerms]) => {
                const pagePermCount = Object.values(pagePerms).filter(v => v === true).length;
                permissionCount += pagePermCount;
                if (pagePermCount > 0) accessiblePagesCount++;
            });
        }

        let totalPerms = 0;
        if (typeof DETAILED_PERMISSIONS !== 'undefined') {
            Object.values(DETAILED_PERMISSIONS).forEach((page) => {
                totalPerms += Object.keys(page.subPermissions).length;
            });
        }

        const createdDate = user.createdAt
            ? new Date(user.createdAt).toLocaleDateString("vi-VN")
            : "N/A";
        const updatedDate = user.updatedAt
            ? " | Cap nhat: " + new Date(user.updatedAt).toLocaleDateString("vi-VN")
            : "";

        const isSelected = selectedUsers.has(user.id);
        html += `
            <div class="user-list-item ${isSelected ? 'selected' : ''}">
                <div class="user-select-cell">
                    <input type="checkbox" class="user-select-checkbox"
                           data-user-id="${user.id}"
                           ${isSelected ? 'checked' : ''}
                           onchange="toggleUserSelection('${user.id}', this)">
                </div>
                <div class="user-list-info">
                    <div class="user-avatar-large">
                        <i data-lucide="user"></i>
                    </div>
                    <div class="user-list-details">
                        <div class="user-list-name">${user.displayName} <span style="color: var(--text-tertiary); font-weight: normal">(${user.id})</span></div>
                        <div class="user-list-meta">
                            <span class="user-role-badge" style="background: ${roleInfo.color}15; color: ${roleInfo.color}; border: 1px solid ${roleInfo.color}30;">
                                <i data-lucide="${roleInfo.icon}"></i>
                                ${roleInfo.name}
                            </span>
                            ${user.totpEnabled ? '<span class="user-role-badge" style="background: #d1fae5; color: #059669; border: 1px solid #05966930;"><i data-lucide="shield-check"></i> 2FA</span>' : ''}
                            <span><i data-lucide="layout-grid" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> ${accessiblePagesCount} trang</span>
                            <span><i data-lucide="shield-check" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> ${permissionCount}/${totalPerms} quyen</span>
                            <span><i data-lucide="calendar" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> ${createdDate}${updatedDate}</span>
                        </div>
                    </div>
                </div>
                <div class="user-list-actions">
                    <button class="btn-icon" onclick="editUser('${user.id}')" title="Chinh sua">
                        <i data-lucide="edit"></i>
                    </button>
                    <button class="btn-icon" onclick="viewUserPermissions('${user.id}')" title="Xem quyen">
                        <i data-lucide="eye"></i>
                    </button>
                    ${user.totpEnabled ? `<button class="btn-icon" onclick="reset2FA('${user.id}')" title="Reset 2FA"><i data-lucide="key-round"></i></button>` : ''}
                    <button class="btn-icon danger" onclick="deleteUser('${user.id}')" title="Xoa">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </div>
        `;
    });

    userList.innerHTML = html;
    lucide.createIcons();
}

function getRoleTemplateInfo(roleTemplate) {
    if (typeof PERMISSION_TEMPLATES !== 'undefined' && PERMISSION_TEMPLATES[roleTemplate]) {
        const info = PERMISSION_TEMPLATES[roleTemplate];
        return {
            id: roleTemplate,
            name: info.name?.split(' - ')[0] || roleTemplate,
            icon: info.icon || 'user',
            color: info.color || '#6366f1'
        };
    }

    const defaultTemplates = {
        'admin': { name: 'Admin', icon: 'crown', color: '#ef4444' },
        'manager': { name: 'Manager', icon: 'briefcase', color: '#f59e0b' },
        'sales-team': { name: 'Sales Team', icon: 'shopping-cart', color: '#3b82f6' },
        'warehouse-team': { name: 'Warehouse Team', icon: 'package', color: '#10b981' },
        'staff': { name: 'Staff', icon: 'users', color: '#8b5cf6' },
        'viewer': { name: 'Viewer', icon: 'eye', color: '#6b7280' },
        'custom': { name: 'Custom', icon: 'sliders', color: '#6366f1' }
    };

    return {
        id: roleTemplate || 'custom',
        ...(defaultTemplates[roleTemplate] || defaultTemplates['custom'])
    };
}

function renderRoleBadge(roleTemplate) {
    const info = getRoleTemplateInfo(roleTemplate);
    return `<span class="role-badge" style="background: ${info.color}20; color: ${info.color}; border: 1px solid ${info.color}40;">
        <i data-lucide="${info.icon}" style="width: 12px; height: 12px;"></i>
        ${info.name}
    </span>`;
}

// =====================================================
// USER CRUD OPERATIONS
// =====================================================

function editUser(username) {
    const user = users.find((u) => u.id === username);
    if (!user) return;

    document.getElementById("editUsername").value = user.id;
    document.getElementById("editDisplayName").value = user.displayName;
    document.getElementById("editIdentifier").value = user.identifier || "";
    document.getElementById("editNewPassword").value = "";

    if (window.editDetailedPermUI) {
        window.editDetailedPermUI.setPermissions(user.detailedPermissions || {});
        window.editDetailedPermUI.currentTemplate = user.roleTemplate || 'custom';
    }

    const isAdmin = user.isAdmin === true || user.roleTemplate === 'admin';
    const editIsAdminCheckbox = document.getElementById('editIsAdmin');
    if (editIsAdminCheckbox) {
        editIsAdminCheckbox.checked = isAdmin;
    }
    toggleAdminMode(isAdmin);

    document.querySelector('[data-tab="manage"]').click();
    document
        .querySelector("#manage .card:nth-child(3)")
        .scrollIntoView({ behavior: "smooth" });
}

function viewUserPermissions(username) {
    const user = users.find((u) => u.id === username);
    if (!user) return;

    let report = `QUYEN HAN CHI TIET\n`;
    report += `${"=".repeat(60)}\n\n`;
    report += `Tai khoan: ${user.displayName} (${user.id})\n`;
    const roleInfo = getRoleTemplateInfo(user.roleTemplate);
    report += `Vai tro: ${roleInfo.name}\n\n`;

    const permissions = user.detailedPermissions || {};
    let totalGranted = 0;

    if (typeof DETAILED_PERMISSIONS !== 'undefined') {
        Object.values(DETAILED_PERMISSIONS).forEach((page) => {
            const pagePerms = permissions[page.id] || {};
            const granted = Object.entries(pagePerms).filter(([_, v]) => v === true);

            if (granted.length > 0) {
                report += `${page.name}\n`;
                granted.forEach(([subKey, _]) => {
                    const subPerm = page.subPermissions[subKey];
                    report += `   * ${subPerm.name}\n`;
                    totalGranted++;
                });
                report += "\n";
            }
        });
    }

    if (totalGranted === 0) {
        report += "Khong co quyen nao duoc cap\n";
    } else {
        report += `\nTong cong: ${totalGranted} quyen\n`;
    }

    alert(report);
}

async function updateUser() {
    const username = document.getElementById("editUsername").value.trim();
    const displayName = document.getElementById("editDisplayName").value.trim();
    const identifier = document.getElementById("editIdentifier").value.trim();
    const newPassword = document.getElementById("editNewPassword").value.trim();

    if (!username || !displayName) {
        showError("Vui long nhap day du thong tin!");
        return;
    }

    const isAdminCheckbox = document.getElementById('editIsAdmin');
    const isAdmin = isAdminCheckbox ? isAdminCheckbox.checked : false;

    let detailedPermissions;
    if (isAdmin) {
        if (typeof PermissionsRegistry !== 'undefined' && typeof PermissionsRegistry.generateFullDetailedPermissions === 'function') {
            detailedPermissions = PermissionsRegistry.generateFullDetailedPermissions();
        } else if (typeof window.generateFullAdminPermissions === 'function') {
            detailedPermissions = window.generateFullAdminPermissions();
        } else {
            detailedPermissions = window.editDetailedPermUI
                ? window.editDetailedPermUI.getPermissions()
                : {};
        }
    } else {
        detailedPermissions = window.editDetailedPermUI
            ? window.editDetailedPermUI.getPermissions()
            : {};
    }

    const roleTemplate = window.editDetailedPermUI?.currentTemplate || 'custom';

    const loadingId = showFloatingAlert("Dang cap nhat tai khoan...", "loading");

    try {
        const updateData = {
            displayName: displayName,
            identifier: identifier,
            detailedPermissions: detailedPermissions,
            roleTemplate: isAdmin ? 'admin' : roleTemplate,
            isAdmin: isAdmin,
        };

        if (newPassword) {
            updateData.password = newPassword;
        }

        await UserAPI.fetch(`/${username}`, {
            method: 'PUT',
            body: JSON.stringify(updateData)
        });

        if (window.notify) {
            window.notify.remove(loadingId);
        }

        let permCount = 0;
        let accessiblePages = 0;
        Object.entries(detailedPermissions).forEach(([pageId, pagePerms]) => {
            const grantedCount = Object.values(pagePerms).filter(v => v === true).length;
            permCount += grantedCount;
            if (grantedCount > 0) accessiblePages++;
        });

        showSuccess(
            `Cap nhat thanh cong!\nUsername: ${username}\nTen hien thi: ${displayName}\nNhom quyen: ${isAdmin ? 'admin' : roleTemplate}\nTruy cap trang: ${accessiblePages} trang\nQuyen chi tiet: ${permCount} quyen${newPassword ? "\nDa thay doi password" : ""}`,
        );

        setTimeout(loadUsers, 1000);
        setTimeout(() => {
            clearEditForm();
        }, 3000);
    } catch (error) {
        if (window.notify) {
            window.notify.remove(loadingId);
        }
        showError("Loi cap nhat: " + error.message);
    }
}

async function createUser() {
    const username = document
        .getElementById("newUsername")
        .value.trim()
        .toLowerCase();
    const password = document.getElementById("newPassword").value.trim();
    const displayName =
        document.getElementById("newDisplayName").value.trim() ||
        username.charAt(0).toUpperCase() + username.slice(1);
    const identifier = document.getElementById("newIdentifier").value.trim();

    if (!username || !password) {
        showError("Vui long nhap username va password!");
        return;
    }

    if (!/^[a-z0-9_]+$/.test(username)) {
        showError("Username chi duoc chua chu cai thuong, so va dau gach duoi!");
        return;
    }

    if (password.length < 6) {
        showError("Password phai co it nhat 6 ky tu!");
        return;
    }

    const roleTemplate = window.newDetailedPermUI?.currentTemplate || 'custom';
    const isAdmin = roleTemplate === 'admin';

    let detailedPermissions;
    if (isAdmin) {
        if (typeof PermissionsRegistry !== 'undefined' && typeof PermissionsRegistry.generateFullDetailedPermissions === 'function') {
            detailedPermissions = PermissionsRegistry.generateFullDetailedPermissions();
        } else if (typeof window.generateFullAdminPermissions === 'function') {
            detailedPermissions = window.generateFullAdminPermissions();
        } else {
            detailedPermissions = window.newDetailedPermUI
                ? window.newDetailedPermUI.getPermissions()
                : {};
        }
    } else {
        detailedPermissions = window.newDetailedPermUI
            ? window.newDetailedPermUI.getPermissions()
            : {};
    }

    const loadingId = showFloatingAlert("Dang tao tai khoan...", "loading");

    try {
        await UserAPI.fetch('/', {
            method: 'POST',
            body: JSON.stringify({
                username,
                password,
                displayName,
                identifier,
                roleTemplate,
                isAdmin,
                detailedPermissions
            })
        });

        if (window.notify) {
            window.notify.remove(loadingId);
        }

        let permCount = 0;
        let accessiblePages = 0;
        Object.entries(detailedPermissions).forEach(([pageId, pagePerms]) => {
            const grantedCount = Object.values(pagePerms).filter(v => v === true).length;
            permCount += grantedCount;
            if (grantedCount > 0) accessiblePages++;
        });

        showSuccess(
            `Tao tai khoan thanh cong!\n\nUsername: ${username}\nTen hien thi: ${displayName}\nNhom quyen: ${roleTemplate}\nTruy cap trang: ${accessiblePages} trang\nQuyen chi tiet: ${permCount} quyen\nPassword da duoc hash an toan`,
        );

        clearCreateForm();
        setTimeout(loadUsers, 1000);
    } catch (error) {
        if (window.notify) {
            window.notify.remove(loadingId);
        }
        showError("Loi tao tai khoan: " + error.message);
    }
}

// =====================================================
// 2FA MANAGEMENT
// =====================================================

async function reset2FA(username) {
    if (!confirm(`Reset 2FA cho user "${username}"?\n\nUser sẽ phải thiết lập lại Google Authenticator.`)) {
        return;
    }

    try {
        await UserAPI.fetch('/2fa/reset', {
            method: 'POST',
            body: JSON.stringify({ username })
        });
        showSuccess(`Đã reset 2FA cho ${username}`);
        loadUsers();
    } catch (error) {
        showError('Lỗi reset 2FA: ' + error.message);
    }
}

async function setup2FA() {
    try {
        const data = await UserAPI.fetch('/2fa/setup', { method: 'POST' });

        // Show modal with QR code
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 480px;">
                <div class="bulk-template-modal">
                    <div class="modal-header">
                        <h3><i data-lucide="shield-check"></i> Thiết lập 2FA</h3>
                        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                            <i data-lucide="x"></i>
                        </button>
                    </div>
                    <div class="modal-body" style="text-align: center;">
                        <p style="margin-bottom: 16px; color: var(--text-secondary);">Quét mã QR bằng Google Authenticator:</p>
                        <img src="${data.qrCode}" alt="QR Code" style="width: 200px; height: 200px; margin: 0 auto 16px; display: block; border-radius: 8px;" />
                        <p style="font-size: 12px; color: var(--text-tertiary); margin-bottom: 16px;">Hoặc nhập key thủ công: <code style="background: var(--gray-100); padding: 2px 8px; border-radius: 4px; font-size: 11px; word-break: break-all;">${data.secret}</code></p>
                        <div style="margin-top: 16px;">
                            <label style="display: block; font-weight: 500; margin-bottom: 8px;">Nhập mã 6 chữ số để xác nhận:</label>
                            <input type="text" id="setup2FACode" maxlength="6" inputmode="numeric" pattern="[0-9]{6}" style="width: 200px; text-align: center; font-size: 24px; letter-spacing: 8px; font-weight: 600; padding: 12px; border: 2px solid var(--border); border-radius: 8px;" placeholder="000000" />
                        </div>
                    </div>
                    <div class="modal-footer" style="display: flex; gap: 8px; justify-content: flex-end; padding: 16px; border-top: 1px solid var(--border);">
                        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Hủy</button>
                        <button class="btn btn-primary" id="confirm2FASetup">Xác nhận</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        if (typeof lucide !== 'undefined') lucide.createIcons();

        document.getElementById('confirm2FASetup').addEventListener('click', async () => {
            const code = document.getElementById('setup2FACode').value.trim();
            if (code.length !== 6) {
                showError('Vui lòng nhập đủ 6 chữ số');
                return;
            }
            try {
                const verifyData = await UserAPI.fetch('/2fa/verify-setup', {
                    method: 'POST',
                    body: JSON.stringify({ totpCode: code })
                });
                modal.remove();

                // Show backup codes
                const backupModal = document.createElement('div');
                backupModal.className = 'modal-overlay';
                backupModal.innerHTML = `
                    <div class="modal-content" style="max-width: 480px;">
                        <div class="bulk-template-modal">
                            <div class="modal-header" style="background: linear-gradient(135deg, #10b981, #059669);">
                                <h3><i data-lucide="check-circle"></i> 2FA Đã Kích Hoạt!</h3>
                            </div>
                            <div class="modal-body" style="text-align: center;">
                                <p style="margin-bottom: 16px; color: var(--text-secondary);">Lưu lại 10 mã dự phòng này. Mỗi mã chỉ dùng được 1 lần:</p>
                                <div style="background: var(--gray-50); border: 1px solid var(--border); border-radius: 8px; padding: 16px; font-family: monospace; font-size: 16px; letter-spacing: 2px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                                    ${verifyData.backupCodes.map(code => `<span>${code}</span>`).join('')}
                                </div>
                                <button class="btn btn-secondary" style="margin-top: 16px;" onclick="navigator.clipboard.writeText('${verifyData.backupCodes.join('\\n')}'); this.textContent='Đã copy!';">
                                    <i data-lucide="copy"></i> Copy mã dự phòng
                                </button>
                            </div>
                            <div class="modal-footer" style="display: flex; justify-content: flex-end; padding: 16px; border-top: 1px solid var(--border);">
                                <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">Đã lưu, đóng</button>
                            </div>
                        </div>
                    </div>
                `;
                document.body.appendChild(backupModal);
                if (typeof lucide !== 'undefined') lucide.createIcons();
                showSuccess('2FA đã được kích hoạt thành công!');
            } catch (err) {
                showError('Mã không hợp lệ: ' + err.message);
            }
        });
    } catch (error) {
        showError('Lỗi thiết lập 2FA: ' + error.message);
    }
}

async function disable2FA() {
    const code = prompt('Nhập mã 6 chữ số từ Google Authenticator để tắt 2FA:');
    if (!code) return;

    try {
        await UserAPI.fetch('/2fa/disable', {
            method: 'POST',
            body: JSON.stringify({ totpCode: code.trim() })
        });
        showSuccess('2FA đã được tắt');
    } catch (error) {
        showError('Lỗi tắt 2FA: ' + error.message);
    }
}

async function deleteUser(username) {
    const user = users.find((u) => u.id === username);
    if (!user) return;

    const adminCount = users.filter((u) => u.roleTemplate === 'admin').length;
    if (user.roleTemplate === 'admin' && adminCount === 1) {
        showError("Khong the xoa admin cuoi cung!\nHe thong phai co it nhat 1 admin.");
        return;
    }

    let permCount = 0;
    if (user.detailedPermissions) {
        Object.values(user.detailedPermissions).forEach((pagePerms) => {
            permCount += Object.values(pagePerms).filter((v) => v === true).length;
        });
    }

    const roleInfo = getRoleTemplateInfo(user.roleTemplate);
    const confirmMsg = `XAC NHAN XOA TAI KHOAN\n\nUsername: ${username}\nTen: ${user.displayName}\nNhom quyen: ${roleInfo.name}\nQuyen chi tiet: ${permCount} quyen\n\nHanh dong nay KHONG THE HOAN TAC!\n\nBan co chac chan muon xoa?`;

    if (!confirm(confirmMsg)) {
        return;
    }

    const loadingId = showFloatingAlert("Dang xoa tai khoan...", "loading");

    try {
        await UserAPI.fetch(`/${username}`, { method: 'DELETE' });

        if (window.notify) {
            window.notify.remove(loadingId);
        }

        showSuccess(`Da xoa tai khoan "${username}" thanh cong!`);
        loadUsers();
    } catch (error) {
        if (window.notify) {
            window.notify.remove(loadingId);
        }
        showError("Loi xoa tai khoan: " + error.message);
    }
}

// Load permissions overview
async function loadPermissionsOverview() {
    const overview = document.getElementById("permissionsOverview");
    overview.innerHTML =
        '<div class="empty-state show"><i data-lucide="loader" class="spinning"></i><h3>Dang tai du lieu...</h3></div>';

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }

    try {
        const data = await UserAPI.fetch('/');
        const allUsers = data.users || [];

        const permissionStats = {};
        const roleStats = {};

        if (typeof DETAILED_PERMISSIONS !== 'undefined') {
            Object.values(DETAILED_PERMISSIONS).forEach((page) => {
                permissionStats[page.id] = {};
                Object.keys(page.subPermissions).forEach((subKey) => {
                    permissionStats[page.id][subKey] = {
                        name: page.subPermissions[subKey].name,
                        icon: page.subPermissions[subKey].icon,
                        pageName: page.name,
                        count: 0,
                        users: [],
                    };
                });
            });
        }

        let totalUsers = 0;

        allUsers.forEach((user) => {
            totalUsers++;

            const roleInfo = getRoleTemplateInfo(user.roleTemplate);
            const role = roleInfo.name;
            roleStats[role] = (roleStats[role] || 0) + 1;

            const permissions = user.detailedPermissions || {};
            Object.entries(permissions).forEach(([pageId, pagePerms]) => {
                Object.entries(pagePerms).forEach(([subKey, granted]) => {
                    if (granted && permissionStats[pageId] && permissionStats[pageId][subKey]) {
                        permissionStats[pageId][subKey].count++;
                        permissionStats[pageId][subKey].users.push(user.displayName || user.id);
                    }
                });
            });
        });

        let html = `
            <div style="background: white; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
                <h3><i data-lucide="bar-chart-2" style="width:20px;height:20px;display:inline-block;vertical-align:middle;margin-right:8px;"></i>Thong Ke Tong Quan</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 15px;">
        `;

        Object.entries(roleStats).forEach(([role, count]) => {
            html += `
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 24px; font-weight: bold; color: #007bff;">${count}</div>
                    <div style="font-size: 14px; color: #6c757d;">${role}</div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
            <div style="background: white; padding: 20px; border-radius: 10px;">
                <h3><i data-lucide="shield-check" style="width:20px;height:20px;display:inline-block;vertical-align:middle;margin-right:8px;"></i>Thong Ke Quyen Chi Tiet</h3>
                <div style="margin-top: 15px;">
        `;

        if (typeof DETAILED_PERMISSIONS !== 'undefined') {
            Object.entries(permissionStats).forEach(([pageId, subPerms]) => {
                const page = DETAILED_PERMISSIONS[pageId];
                if (!page) return;

                html += `<div style="margin-bottom: 25px;">`;
                html += `<h4 style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">`;
                html += `<i data-lucide="${page.icon}" style="width:18px;height:18px;"></i>`;
                html += `${page.name}</h4>`;

                Object.entries(subPerms).forEach(([subKey, stats]) => {
                    const percentage = totalUsers > 0 ? Math.round((stats.count / totalUsers) * 100) : 0;

                    html += `
                        <div style="margin-bottom: 12px; padding: 12px; border: 1px solid #dee2e6; border-radius: 8px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                <span style="font-size: 0.875rem;"><i data-lucide="${stats.icon}" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:6px;"></i>${stats.name}</span>
                                <span style="background: #007bff; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px;">
                                    ${stats.count}/${totalUsers} (${percentage}%)
                                </span>
                            </div>
                            <div style="background: #e9ecef; height: 6px; border-radius: 3px; overflow: hidden;">
                                <div style="background: #007bff; height: 100%; width: ${percentage}%; transition: width 0.3s ease;"></div>
                            </div>
                            ${stats.users.length > 0 ? `
                                <div style="margin-top: 6px; font-size: 11px; color: #6c757d;">
                                    <strong>Users:</strong> ${stats.users.join(", ")}
                                </div>
                            ` : ""}
                        </div>
                    `;
                });

                html += `</div>`;
            });
        }

        html += "</div></div>";
        overview.innerHTML = html;

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    } catch (error) {
        overview.innerHTML = `<div class="empty-state show"><i data-lucide="alert-circle"></i><h3>Loi tai thong ke</h3><p>${error.message}</p></div>`;
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }
}

// Export permissions
async function exportPermissions() {
    if (users.length === 0) {
        showError("Vui long tai danh sach users truoc!");
        return;
    }

    try {
        let csv = "Username,Display Name,Role,";

        if (typeof DETAILED_PERMISSIONS !== 'undefined') {
            Object.values(DETAILED_PERMISSIONS).forEach((page) => {
                Object.values(page.subPermissions).forEach((subPerm) => {
                    csv += `${page.name} - ${subPerm.name},`;
                });
            });
        }
        csv += "Total Permissions,Created Date\n";

        users.forEach((user) => {
            const permissions = user.detailedPermissions || {};
            const createdDate = user.createdAt
                ? new Date(user.createdAt).toLocaleDateString("vi-VN")
                : "N/A";

            const roleInfo = getRoleTemplateInfo(user.roleTemplate);
            csv += `${user.id},"${user.displayName}","${roleInfo.name}",`;

            let totalPerms = 0;
            if (typeof DETAILED_PERMISSIONS !== 'undefined') {
                Object.values(DETAILED_PERMISSIONS).forEach((page) => {
                    Object.keys(page.subPermissions).forEach((subKey) => {
                        const hasPermission = permissions[page.id]?.[subKey] || false;
                        csv += hasPermission ? "YES," : "NO,";
                        if (hasPermission) totalPerms++;
                    });
                });
            }

            csv += `${totalPerms},"${createdDate}"\n`;
        });

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);

        link.setAttribute("href", url);
        link.setAttribute("download", `N2Shop_Detailed_Permissions_${new Date().toISOString().split("T")[0]}.csv`);
        link.style.visibility = "hidden";

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showSuccess("Da xuat bao cao quyen chi tiet thanh cong!");
    } catch (error) {
        showError("Loi xuat bao cao: " + error.message);
    }
}

// Export users
async function exportUsers() {
    if (users.length === 0) {
        showError("Khong co du lieu de xuat!");
        return;
    }

    try {
        let csv = "Username,Display Name,Role,Role Template,Total Permissions,Created Date,Updated Date\n";

        users.forEach((user) => {
            const createdDate = user.createdAt
                ? new Date(user.createdAt).toLocaleDateString("vi-VN")
                : "N/A";
            const updatedDate = user.updatedAt
                ? new Date(user.updatedAt).toLocaleDateString("vi-VN")
                : "N/A";

            let permCount = 0;
            if (user.detailedPermissions) {
                Object.values(user.detailedPermissions).forEach((pagePerms) => {
                    permCount += Object.values(pagePerms).filter((v) => v === true).length;
                });
            }

            const roleInfo = getRoleTemplateInfo(user.roleTemplate);
            csv += `${user.id},"${user.displayName}","${roleInfo.name}","${user.roleTemplate || 'custom'}",${permCount},"${createdDate}","${updatedDate}"\n`;
        });

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);

        link.setAttribute("href", url);
        link.setAttribute("download", `N2Shop_Users_${new Date().toISOString().split("T")[0]}.csv`);
        link.style.visibility = "hidden";

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showSuccess("Da xuat file CSV thanh cong!");
    } catch (error) {
        showError("Loi xuat file: " + error.message);
    }
}

// =====================================================
// ADMIN TOGGLE
// =====================================================

function toggleAdminMode(isAdmin) {
    const detailedPermissions = document.getElementById('editDetailedPermissions');
    const adminBadge = document.getElementById('editAdminBadge');
    const adminBadgeOff = document.getElementById('editAdminBadgeOff');

    if (isAdmin) {
        if (detailedPermissions) detailedPermissions.style.display = 'none';
        if (adminBadge) adminBadge.style.display = 'inline-flex';
        if (adminBadgeOff) adminBadgeOff.style.display = 'none';
    } else {
        if (detailedPermissions) detailedPermissions.style.display = '';
        if (adminBadge) adminBadge.style.display = 'none';
        if (adminBadgeOff) adminBadgeOff.style.display = '';
    }
}

function initAdminToggle() {
    const adminCheckbox = document.getElementById('editIsAdmin');
    const adminToggleGroup = document.getElementById('editAdminToggleGroup');

    if (adminCheckbox) {
        adminCheckbox.addEventListener('change', function() {
            toggleAdminMode(this.checked);
        });
    }

    if (adminToggleGroup) {
        const authData = localStorage.getItem('loginindex_auth') || sessionStorage.getItem('loginindex_auth');
        if (authData) {
            try {
                const auth = JSON.parse(authData);
                const isCurrentUserAdmin = auth.isAdmin === true || auth.roleTemplate === 'admin';
                const hasUserMgmtAccess = auth.detailedPermissions?.['user-management'] &&
                    Object.values(auth.detailedPermissions['user-management']).some(v => v === true);
                if (isCurrentUserAdmin || hasUserMgmtAccess) {
                    adminToggleGroup.style.display = '';
                }
            } catch (e) {
                console.error('Error parsing auth data for admin toggle:', e);
            }
        }
    }
}

// Clear forms
function clearEditForm() {
    document.getElementById("editUsername").value = "";
    document.getElementById("editDisplayName").value = "";
    document.getElementById("editIdentifier").value = "";
    document.getElementById("editNewPassword").value = "";

    if (window.editDetailedPermUI) {
        window.editDetailedPermUI.setPermissions({});
    }

    const output = document.getElementById("editOutput");
    output.style.display = "none";
    output.textContent = "";
    output.className = "output";
}

function clearCreateForm() {
    document.getElementById("newUsername").value = "";
    document.getElementById("newPassword").value = "";
    document.getElementById("newDisplayName").value = "";
    document.getElementById("newIdentifier").value = "";

    if (window.newDetailedPermUI) {
        window.newDetailedPermUI.setPermissions({});
    }

    const output = document.getElementById("createOutput");
    output.style.display = "none";
    output.textContent = "";
    output.className = "output";
}

// Helper functions for notifications
function showFloatingAlert(message, type = "info") {
    if (window.notify) {
        if (type === "loading") {
            return window.notify.loading(message);
        }
        window.notify.show(message, type, 3000);
    } else {
        console.log(`[${type.toUpperCase()}]`, message);
        if (type !== "loading") {
            alert(message);
        }
    }
}

function showSuccess(message) {
    if (window.notify) {
        window.notify.success(message);
    } else {
        console.log("[SUCCESS]", message);
        alert(message);
    }
}

function showError(message) {
    if (window.notify) {
        window.notify.error(message);
    } else {
        console.error("[ERROR]", message);
        alert(message);
    }
}

// Auto-fill display name
document.getElementById("newUsername")?.addEventListener("input", function () {
    const username = this.value.trim();
    if (username && !document.getElementById("newDisplayName").value) {
        document.getElementById("newDisplayName").value =
            username.charAt(0).toUpperCase() + username.slice(1);
    }
});

// =====================================================
// FIREBASE MIGRATION (temporary - remove after migration)
// =====================================================
async function migrateFromFirebase() {
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
        showError('Firebase not loaded. Add Firebase scripts temporarily for migration.');
        return;
    }

    const db = firebase.firestore();
    const loadingId = showFloatingAlert('Dang migrate du lieu tu Firebase...', 'loading');

    try {
        // Load users
        const usersSnapshot = await db.collection('users').get();
        const usersData = [];
        usersSnapshot.forEach(doc => {
            usersData.push({ id: doc.id, ...doc.data() });
        });

        // Load templates
        const templatesSnapshot = await db.collection('permission_templates').get();
        const templatesData = [];
        templatesSnapshot.forEach(doc => {
            templatesData.push({ id: doc.id, ...doc.data() });
        });

        // Load settings
        const settingsData = {};
        try {
            const menuNamesDoc = await db.collection('settings').doc('custom_menu_names').get();
            if (menuNamesDoc.exists) {
                settingsData.custom_menu_names = menuNamesDoc.data();
            }
        } catch (e) {
            console.warn('Could not load settings:', e);
        }

        // Send to API
        const response = await fetch(UserAPI.BASE_URL + '/migrate/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                users: usersData,
                templates: templatesData,
                settings: settingsData
            })
        });

        const result = await response.json();

        if (window.notify) window.notify.remove(loadingId);

        if (result.success) {
            showSuccess('Migration thanh cong! ' + result.message);
        } else {
            showError('Migration that bai: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        if (window.notify) window.notify.remove(loadingId);
        showError('Migration loi: ' + error.message);
    }
}

// Initialize page
document.addEventListener("DOMContentLoaded", function () {
    console.log("User Management page loading (Render API mode)...");

    if (!checkAdminAccess()) {
        return;
    }

    console.log("User Management initialized with Render API");

    initAdminToggle();
    update2FAButton();
});

async function update2FAButton() {
    const btn = document.getElementById('btn2FA');
    if (!btn) return;
    try {
        const status = await UserAPI.fetch('/2fa/status');
        if (status.enabled) {
            btn.innerHTML = '<i data-lucide="shield-check"></i><span>2FA ON</span>';
            btn.style.background = '#d1fae5';
            btn.style.color = '#059669';
            btn.style.border = '1px solid #05966930';
            btn.onclick = () => {
                if (confirm('2FA đang bật. Bạn muốn tắt 2FA?')) disable2FA();
            };
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (e) {
        // Silently fail - button stays as setup
    }
}
