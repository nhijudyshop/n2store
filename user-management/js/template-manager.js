// =====================================================
// TEMPLATE MANAGER - Quản lý mẫu phân quyền
// Cho phép tạo, sửa, xóa templates tùy chỉnh
// =====================================================

// Template permissions version - tăng khi có thay đổi logic generateTemplatePermissions
// Version 2: sales-team thêm quyền reports category
const TEMPLATE_PERMISSIONS_VERSION = 2;

/**
 * TemplateManager - Quản lý Permission Templates
 *
 * Features:
 * - Load templates (built-in + custom từ Firebase)
 * - Create/Edit/Delete custom templates
 * - Preview permissions trong template
 * - Sync với DetailedPermissionsUI
 */
class TemplateManager {
    constructor() {
        // SIMPLIFIED: Chỉ dùng 1 object templates, tất cả lưu trong Firebase
        this.templates = {};
        this.isLoading = false;
        this.allUsers = [];
        this.selectedTemplateId = null;

        // Giữ reference để generate default permissions khi reset
        this.defaultTemplateIds = ['admin', 'manager', 'sales-team', 'warehouse-team', 'staff', 'viewer'];
    }

    /**
     * Khởi tạo - chỉ log, templates sẽ được load từ Firebase
     */
    init() {
        console.log('[TemplateManager] Initialized - will load templates from Firebase');
    }

    /**
     * Migration: Seed default templates vào Firebase nếu chưa có
     */
    async migrateDefaultTemplates() {
        if (typeof db === 'undefined' || !db) {
            console.warn('[TemplateManager] Firebase not available, skipping migration');
            return false;
        }

        try {
            // Check if any templates exist
            const snapshot = await db.collection('permission_templates').get();

            if (!snapshot.empty) {
                // Check if version upgrade is needed
                await this.checkAndUpgradeTemplatesVersion(snapshot);
                console.log('[TemplateManager] Templates already exist, migration skipped');
                return false;
            }

            console.log('[TemplateManager] No templates found, seeding defaults...');

            // Get metadata from PERMISSION_TEMPLATES
            const templateMeta = typeof PERMISSION_TEMPLATES !== 'undefined' ? PERMISSION_TEMPLATES : {};

            // Seed each default template
            for (const templateId of this.defaultTemplateIds) {
                const meta = templateMeta[templateId] || {};

                // Generate permissions from registry
                let detailedPermissions = {};
                if (typeof PermissionsRegistry !== 'undefined' && PermissionsRegistry.generateTemplatePermissions) {
                    const result = PermissionsRegistry.generateTemplatePermissions(templateId);
                    detailedPermissions = result.detailedPermissions || {};
                }

                await db.collection('permission_templates').doc(templateId).set({
                    id: templateId,
                    name: meta.name || templateId,
                    icon: meta.icon || 'sliders',
                    color: meta.color || '#6366f1',
                    description: meta.description || '',
                    detailedPermissions: detailedPermissions,
                    isSystemDefault: true,  // Đánh dấu không xóa được
                    permissionsVersion: TEMPLATE_PERMISSIONS_VERSION,  // Track version
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    createdBy: 'system'
                });

                console.log(`[TemplateManager] Seeded template: ${templateId}`);
            }

            console.log('[TemplateManager] Migration completed:', this.defaultTemplateIds.length, 'templates seeded');
            return true;

        } catch (error) {
            console.error('[TemplateManager] Migration error:', error);
            return false;
        }
    }

    /**
     * Check và upgrade templates version nếu cần
     * Khi TEMPLATE_PERMISSIONS_VERSION tăng, tự động update system templates
     */
    async checkAndUpgradeTemplatesVersion(snapshot) {
        try {
            const templatesNeedingUpgrade = [];

            snapshot.forEach(doc => {
                const data = doc.data();
                // Chỉ upgrade system default templates
                if (data.isSystemDefault && this.defaultTemplateIds.includes(doc.id)) {
                    const currentVersion = data.permissionsVersion || 1;
                    if (currentVersion < TEMPLATE_PERMISSIONS_VERSION) {
                        templatesNeedingUpgrade.push({
                            id: doc.id,
                            currentVersion,
                            data
                        });
                    }
                }
            });

            if (templatesNeedingUpgrade.length === 0) {
                return;
            }

            console.log(`[TemplateManager] Upgrading ${templatesNeedingUpgrade.length} templates to version ${TEMPLATE_PERMISSIONS_VERSION}`);

            const templateMeta = typeof PERMISSION_TEMPLATES !== 'undefined' ? PERMISSION_TEMPLATES : {};

            for (const item of templatesNeedingUpgrade) {
                // Re-generate permissions từ registry mới
                let newPermissions = {};
                if (typeof PermissionsRegistry !== 'undefined' && PermissionsRegistry.generateTemplatePermissions) {
                    const result = PermissionsRegistry.generateTemplatePermissions(item.id);
                    newPermissions = result.detailedPermissions || {};
                }

                await db.collection('permission_templates').doc(item.id).update({
                    detailedPermissions: newPermissions,
                    permissionsVersion: TEMPLATE_PERMISSIONS_VERSION,
                    upgradedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    upgradeNote: `Auto-upgraded from v${item.currentVersion} to v${TEMPLATE_PERMISSIONS_VERSION}`
                });

                console.log(`[TemplateManager] Upgraded ${item.id}: v${item.currentVersion} -> v${TEMPLATE_PERMISSIONS_VERSION}`);
            }

            // Notify user
            if (window.notify) {
                window.notify.info(`Đã cập nhật ${templatesNeedingUpgrade.length} templates hệ thống với quyền mới`);
            }

        } catch (error) {
            console.error('[TemplateManager] Version upgrade error:', error);
        }
    }

    /**
     * Load templates từ Firebase (SIMPLIFIED - chỉ 1 nguồn dữ liệu)
     */
    async loadTemplates() {
        if (this.isLoading) return;
        this.isLoading = true;

        const container = document.getElementById('templatesList');
        if (container) {
            container.innerHTML = `
                <div class="empty-state show">
                    <i data-lucide="loader" class="spinning"></i>
                    <h3>Đang tải templates...</h3>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        try {
            // Migrate defaults if needed (first time)
            await this.migrateDefaultTemplates();

            // Load ALL templates from Firebase
            if (typeof db !== 'undefined' && db) {
                const snapshot = await db.collection('permission_templates').get();
                this.templates = {};

                snapshot.forEach(doc => {
                    this.templates[doc.id] = {
                        id: doc.id,
                        ...doc.data()
                    };
                });

                console.log('[TemplateManager] Loaded', Object.keys(this.templates).length, 'templates from Firebase');
            }

            // Render UI
            this.renderTemplatesList();

            // Refresh template buttons in DetailedPermissionsUI instances
            this.refreshAllTemplateButtons();

        } catch (error) {
            console.error('[TemplateManager] Error loading templates:', error);
            if (container) {
                container.innerHTML = `
                    <div class="empty-state show">
                        <i data-lucide="alert-circle"></i>
                        <h3>Lỗi tải templates</h3>
                        <p>${error.message}</p>
                    </div>
                `;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        }

        this.isLoading = false;
    }

    /**
     * Render danh sách templates (SIMPLIFIED - chỉ 1 danh sách)
     */
    renderTemplatesList() {
        const container = document.getElementById('templatesList');
        if (!container) return;

        const templateKeys = Object.keys(this.templates);

        if (templateKeys.length === 0) {
            container.innerHTML = `
                <div class="empty-state show">
                    <i data-lucide="layout-template"></i>
                    <h3>Chưa có template nào</h3>
                    <p>Nhấn "Tạo Template Mới" để bắt đầu</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        // Separate system defaults and custom templates for display order
        const systemTemplates = templateKeys.filter(k => this.templates[k].isSystemDefault);
        const customTemplates = templateKeys.filter(k => !this.templates[k].isSystemDefault);

        let html = `
            <div class="templates-section">
                <h3 class="section-title">
                    <i data-lucide="layout-template"></i>
                    Tất cả Templates (${templateKeys.length})
                </h3>
                <p class="section-desc">Tất cả templates đều có thể chỉnh sửa. Templates mặc định (hệ thống) không thể xóa nhưng có thể reset về trạng thái ban đầu.</p>
                <div class="templates-grid">
        `;

        // Render system templates first
        systemTemplates.forEach(key => {
            html += this.renderTemplateCard(key, this.templates[key]);
        });

        // Then custom templates
        customTemplates.forEach(key => {
            html += this.renderTemplateCard(key, this.templates[key]);
        });

        html += '</div></div>';

        container.innerHTML = html;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    /**
     * Render một template card (SIMPLIFIED)
     */
    renderTemplateCard(id, template) {
        const permissions = this.getTemplatePermissions(id);
        const permCount = this.countPermissions(permissions);
        const totalPerms = typeof PermissionsRegistry !== 'undefined'
            ? PermissionsRegistry.getTotalPermissionsCount()
            : 101;

        const isSystemDefault = template.isSystemDefault === true;
        const isAdmin = id === 'admin';

        // Badge - chỉ 2 loại: Mặc định hoặc Tùy chỉnh
        let badgeHtml = '';
        if (isAdmin) {
            badgeHtml = `<span class="template-badge admin"><i data-lucide="crown"></i> Admin</span>`;
        } else if (isSystemDefault) {
            badgeHtml = `<span class="template-badge builtin"><i data-lucide="settings"></i> Mặc định</span>`;
        } else {
            badgeHtml = `<span class="template-badge custom"><i data-lucide="user"></i> Tùy chỉnh</span>`;
        }

        // Action buttons - đơn giản hóa
        let actionsHtml = `
            <button class="btn btn-sm btn-success" onclick="templateManager.showUserAssignment('${id}')" title="Gán nhân viên vào template này">
                <i data-lucide="users"></i>
                Gán NV
            </button>
            <button class="btn btn-sm btn-secondary" onclick="templateManager.previewTemplate('${id}')" title="Xem chi tiết">
                <i data-lucide="eye"></i>
                Xem
            </button>
            <button class="btn btn-sm btn-primary" onclick="templateManager.editTemplate('${id}')" title="Chỉnh sửa">
                <i data-lucide="edit"></i>
                Sửa
            </button>
            <button class="btn btn-sm btn-info" onclick="templateManager.syncUsersWithTemplate('${id}')" title="Cập nhật quyền cho tất cả users đang dùng template này">
                <i data-lucide="refresh-cw"></i>
            </button>
            <button class="btn btn-sm btn-secondary" onclick="templateManager.duplicateTemplate('${id}')" title="Sao chép">
                <i data-lucide="copy"></i>
            </button>
        `;

        // System defaults: có nút Reset, không có nút Xóa
        if (isSystemDefault) {
            actionsHtml += `
                <button class="btn btn-sm btn-warning" onclick="templateManager.resetToDefault('${id}')" title="Khôi phục về mặc định">
                    <i data-lucide="rotate-ccw"></i>
                </button>
            `;
        } else {
            // Custom templates: có nút Xóa
            actionsHtml += `
                <button class="btn btn-sm btn-danger" onclick="templateManager.deleteTemplate('${id}')" title="Xóa">
                    <i data-lucide="trash-2"></i>
                </button>
            `;
        }

        return `
            <div class="template-card ${isSystemDefault ? 'system-default' : 'custom'} ${isAdmin ? 'admin-template' : ''}" data-template-id="${id}">
                <div class="template-card-header" style="--template-color: ${template.color || '#6366f1'}">
                    <div class="template-icon">
                        <i data-lucide="${template.icon || 'sliders'}"></i>
                    </div>
                    <div class="template-info">
                        <h4 class="template-name">${template.name || id}</h4>
                        <p class="template-desc">${template.description || 'Không có mô tả'}</p>
                    </div>
                </div>
                <div class="template-card-body">
                    <div class="template-stats">
                        <span class="stat">
                            <i data-lucide="shield-check"></i>
                            ${permCount}/${totalPerms} quyền
                        </span>
                        <span class="stat">
                            <i data-lucide="layout-grid"></i>
                            ${this.countAccessiblePages(permissions)} trang
                        </span>
                    </div>
                    ${badgeHtml}
                </div>
                <div class="template-card-actions">
                    ${actionsHtml}
                </div>
            </div>
        `;
    }

    /**
     * Lấy permissions của template (SIMPLIFIED - luôn từ Firebase)
     */
    getTemplatePermissions(templateId) {
        const template = this.templates[templateId];
        if (template?.detailedPermissions) {
            return template.detailedPermissions;
        }
        return {};
    }

    /**
     * Đếm số permissions được cấp
     */
    countPermissions(permissions) {
        let count = 0;
        Object.values(permissions).forEach(pagePerms => {
            count += Object.values(pagePerms).filter(v => v === true).length;
        });
        return count;
    }

    /**
     * Đếm số trang có quyền truy cập
     */
    countAccessiblePages(permissions) {
        let count = 0;
        Object.values(permissions).forEach(pagePerms => {
            if (Object.values(pagePerms).some(v => v === true)) {
                count++;
            }
        });
        return count;
    }

    /**
     * Xem chi tiết template (SIMPLIFIED)
     */
    previewTemplate(templateId) {
        const template = this.templates[templateId];

        if (!template) {
            alert('Không tìm thấy template!');
            return;
        }

        const permissions = this.getTemplatePermissions(templateId);
        const totalPerms = typeof PermissionsRegistry !== 'undefined'
            ? PermissionsRegistry.getTotalPermissionsCount()
            : 101;

        let report = `CHI TIẾT TEMPLATE: ${template.name}\n`;
        report += `${'='.repeat(50)}\n\n`;
        report += `Mô tả: ${template.description || 'Không có'}\n`;
        report += `Loại: ${template.isSystemDefault ? 'Hệ thống' : 'Tùy chỉnh'}\n`;
        report += `Tổng quyền: ${this.countPermissions(permissions)}/${totalPerms}\n\n`;

        report += `DANH SÁCH QUYỀN:\n`;
        report += `${'─'.repeat(50)}\n`;

        const pages = typeof PAGES_REGISTRY !== 'undefined' ? PAGES_REGISTRY : {};

        Object.entries(permissions).forEach(([pageId, pagePerms]) => {
            const grantedPerms = Object.entries(pagePerms).filter(([_, v]) => v === true);
            if (grantedPerms.length > 0) {
                const page = pages[pageId];
                report += `\n📄 ${page?.name || pageId}\n`;
                grantedPerms.forEach(([permKey, _]) => {
                    const permInfo = page?.detailedPermissions?.[permKey];
                    report += `   ✓ ${permInfo?.name || permKey}\n`;
                });
            }
        });

        alert(report);
    }

    /**
     * Hiển thị modal tạo template mới
     */
    showCreateModal() {
        this.showEditorModal(null, 'create');
    }

    /**
     * Sao chép template (SIMPLIFIED)
     */
    duplicateTemplate(templateId) {
        const source = this.templates[templateId];

        if (!source) {
            alert('Không tìm thấy template gốc!');
            return;
        }

        // Prefill với data từ source
        const duplicateData = {
            name: `${source.name} (Copy)`,
            description: source.description,
            icon: source.icon,
            color: source.color,
            detailedPermissions: this.getTemplatePermissions(templateId)
        };

        this.showEditorModal(duplicateData, 'create');
    }

    /**
     * Chỉnh sửa template (SIMPLIFIED - tất cả templates đều edit được)
     */
    editTemplate(templateId) {
        const template = this.templates[templateId];

        if (!template) {
            alert('Không tìm thấy template!');
            return;
        }

        this.showEditorModal({
            id: templateId,
            name: template.name,
            description: template.description,
            icon: template.icon,
            color: template.color,
            detailedPermissions: template.detailedPermissions || {},
            isSystemDefault: template.isSystemDefault === true
        }, 'edit');
    }

    /**
     * Reset template về mặc định (chỉ cho system defaults)
     */
    async resetToDefault(templateId) {
        const template = this.templates[templateId];

        if (!template) {
            alert('Không tìm thấy template!');
            return;
        }

        if (!template.isSystemDefault) {
            alert('Chỉ có thể reset templates mặc định của hệ thống!');
            return;
        }

        if (!confirm(`Bạn có chắc chắn muốn khôi phục template "${template.name}" về mặc định?\n\nTất cả tùy chỉnh sẽ bị xóa!`)) {
            return;
        }

        try {
            // Re-generate permissions từ registry
            let defaultPermissions = {};
            if (typeof PermissionsRegistry !== 'undefined' && PermissionsRegistry.generateTemplatePermissions) {
                const result = PermissionsRegistry.generateTemplatePermissions(templateId);
                defaultPermissions = result.detailedPermissions || {};
            }

            // Get metadata from PERMISSION_TEMPLATES
            const templateMeta = typeof PERMISSION_TEMPLATES !== 'undefined' ? PERMISSION_TEMPLATES[templateId] : {};

            // Update Firebase with default permissions
            await db.collection('permission_templates').doc(templateId).update({
                detailedPermissions: defaultPermissions,
                name: templateMeta.name || template.name,
                description: templateMeta.description || template.description,
                icon: templateMeta.icon || template.icon,
                color: templateMeta.color || template.color,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedBy: JSON.parse(localStorage.getItem('loginindex_auth') || sessionStorage.getItem('loginindex_auth') || '{}').username || 'system'
            });

            // Update local cache
            this.templates[templateId] = {
                ...this.templates[templateId],
                detailedPermissions: defaultPermissions,
                name: templateMeta.name || template.name,
                description: templateMeta.description || template.description,
                icon: templateMeta.icon || template.icon,
                color: templateMeta.color || template.color
            };

            if (window.notify) {
                window.notify.success(`Đã khôi phục template "${template.name}" về mặc định`);
            }

            this.renderTemplatesList();
            this.refreshAllTemplateButtons();

        } catch (error) {
            console.error('[TemplateManager] Error resetting template:', error);
            alert('Lỗi khôi phục template: ' + error.message);
        }
    }

    /**
     * Sync permissions cho tất cả users đang dùng template này
     * Cập nhật detailedPermissions của users theo template mới nhất
     */
    async syncUsersWithTemplate(templateId) {
        const template = this.templates[templateId];

        if (!template) {
            alert('Không tìm thấy template!');
            return;
        }

        if (!template.detailedPermissions || Object.keys(template.detailedPermissions).length === 0) {
            alert('Template chưa có permissions nào!');
            return;
        }

        // Count users using this template
        const usersSnapshot = await db.collection('users')
            .where('roleTemplate', '==', templateId)
            .get();

        if (usersSnapshot.empty) {
            alert(`Không có user nào đang sử dụng template "${template.name}"`);
            return;
        }

        const userCount = usersSnapshot.size;

        if (!confirm(`Cập nhật quyền cho ${userCount} user đang sử dụng template "${template.name}"?\n\nQuyền của họ sẽ được thay thế bằng permissions từ template.`)) {
            return;
        }

        try {
            const loadingId = window.notify?.loading?.(`Đang cập nhật ${userCount} users...`) ||
                window.notify?.info?.(`Đang cập nhật ${userCount} users...`);

            const batch = db.batch();
            const currentUser = JSON.parse(localStorage.getItem('loginindex_auth') || sessionStorage.getItem('loginindex_auth') || '{}').username || 'system';

            usersSnapshot.forEach(doc => {
                batch.update(doc.ref, {
                    detailedPermissions: template.detailedPermissions,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: currentUser,
                    permissionsSyncedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });

            await batch.commit();

            if (loadingId && window.notify?.remove) {
                window.notify.remove(loadingId);
            }

            window.notify?.success?.(`Đã cập nhật quyền cho ${userCount} user theo template "${template.name}"`);

            // Reload users list if function exists
            if (typeof loadUsers === 'function') {
                setTimeout(loadUsers, 500);
            }

        } catch (error) {
            console.error('[TemplateManager] Error syncing users:', error);
            alert('Lỗi cập nhật users: ' + error.message);
        }
    }

    /**
     * Xóa template (SIMPLIFIED - chỉ custom templates)
     */
    async deleteTemplate(templateId) {
        const template = this.templates[templateId];

        if (!template) {
            alert('Không tìm thấy template!');
            return;
        }

        if (template.isSystemDefault) {
            alert('Không thể xóa template mặc định của hệ thống!\nBạn có thể Reset nếu muốn khôi phục về trạng thái ban đầu.');
            return;
        }

        if (!confirm(`Bạn có chắc chắn muốn xóa template "${template.name}"?\n\nHành động này không thể hoàn tác!`)) {
            return;
        }

        try {
            await db.collection('permission_templates').doc(templateId).delete();

            delete this.templates[templateId];

            if (window.notify) {
                window.notify.success(`Đã xóa template "${template.name}"`);
            }

            this.renderTemplatesList();
            this.refreshAllTemplateButtons();

        } catch (error) {
            console.error('[TemplateManager] Error deleting template:', error);
            alert('Lỗi xóa template: ' + error.message);
        }
    }

    /**
     * Hiển thị modal editor (SIMPLIFIED)
     */
    showEditorModal(data = null, mode = 'create') {
        const modalContainer = document.getElementById('templateEditorModal');
        if (!modalContainer) return;

        const isEdit = mode === 'edit';
        const isSystemDefault = data?.isSystemDefault || false;
        const title = isEdit
            ? (isSystemDefault ? `Chỉnh Sửa Template Hệ Thống: ${data?.name || ''}` : 'Chỉnh Sửa Template')
            : 'Tạo Template Mới';

        // Default values
        const templateData = data || {
            id: '',
            name: '',
            description: '',
            icon: 'sliders',
            color: '#6366f1',
            detailedPermissions: {}
        };

        const icons = ['crown', 'briefcase', 'shopping-cart', 'package', 'users', 'eye', 'sliders', 'shield', 'star', 'zap'];
        const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#6b7280'];

        modalContainer.innerHTML = `
            <div class="modal-overlay" onclick="templateManager.closeModal()">
                <div class="modal-content template-editor-modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3><i data-lucide="layout-template"></i> ${title}</h3>
                        <button class="btn-close" onclick="templateManager.closeModal()">
                            <i data-lucide="x"></i>
                        </button>
                    </div>
                    ${isSystemDefault ? `
                        <div class="modal-notice">
                            <i data-lucide="info"></i>
                            <span>Bạn đang chỉnh sửa template hệ thống. Thay đổi sẽ được lưu và có thể Reset về mặc định bất cứ lúc nào.</span>
                        </div>
                    ` : ''}
                    <div class="modal-body">
                        <div class="form-row">
                            <div class="form-group">
                                <label>ID (không dấu, không khoảng trắng)</label>
                                <input type="text" id="templateId" value="${templateData.id || ''}"
                                       placeholder="vd: my-custom-template"
                                       ${isEdit ? 'readonly style="background: var(--gray-100)"' : ''} />
                            </div>
                            <div class="form-group">
                                <label>Tên hiển thị</label>
                                <input type="text" id="templateName" value="${templateData.name || ''}"
                                       placeholder="vd: Nhóm Bán Hàng Mới" />
                            </div>
                        </div>
                        <input type="hidden" id="templateIsSystemDefault" value="${isSystemDefault}" />

                        <div class="form-group">
                            <label>Mô tả</label>
                            <input type="text" id="templateDesc" value="${templateData.description || ''}"
                                   placeholder="Mô tả ngắn về template này" />
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label>Icon</label>
                                <div class="icon-picker">
                                    ${icons.map(icon => `
                                        <button type="button" class="icon-option ${icon === templateData.icon ? 'selected' : ''}"
                                                data-icon="${icon}" onclick="templateManager.selectIcon('${icon}')">
                                            <i data-lucide="${icon}"></i>
                                        </button>
                                    `).join('')}
                                </div>
                                <input type="hidden" id="templateIcon" value="${templateData.icon || 'sliders'}" />
                            </div>
                            <div class="form-group">
                                <label>Màu sắc</label>
                                <div class="color-picker">
                                    ${colors.map(color => `
                                        <button type="button" class="color-option ${color === templateData.color ? 'selected' : ''}"
                                                style="background: ${color}" data-color="${color}"
                                                onclick="templateManager.selectColor('${color}')"></button>
                                    `).join('')}
                                </div>
                                <input type="hidden" id="templateColor" value="${templateData.color || '#6366f1'}" />
                            </div>
                        </div>

                        <div class="form-group">
                            <label>Quyền hạn</label>
                            <div id="templatePermissionsEditor" class="template-permissions-editor"></div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="templateManager.closeModal()">
                            <i data-lucide="x"></i> Hủy
                        </button>
                        <button class="btn btn-primary" onclick="templateManager.saveTemplate('${mode}')">
                            <i data-lucide="check"></i> ${isEdit ? 'Cập Nhật' : 'Tạo Template'}
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Initialize permissions editor in modal
        this.initModalPermissionsUI(templateData.detailedPermissions || {});

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    /**
     * Initialize permissions UI trong modal
     */
    initModalPermissionsUI(permissions) {
        const container = document.getElementById('templatePermissionsEditor');
        if (!container) return;

        // Create a simple DetailedPermissionsUI instance for the modal
        this.modalPermUI = new DetailedPermissionsUI('templatePermissionsEditor', 'tplEdit');
        this.modalPermUI.render(permissions);

        // Store window reference for event handlers
        window.tplEditDetailedPermUI = this.modalPermUI;
    }

    /**
     * Chọn icon
     */
    selectIcon(icon) {
        document.querySelectorAll('.icon-option').forEach(btn => btn.classList.remove('selected'));
        document.querySelector(`.icon-option[data-icon="${icon}"]`)?.classList.add('selected');
        document.getElementById('templateIcon').value = icon;
    }

    /**
     * Chọn màu
     */
    selectColor(color) {
        document.querySelectorAll('.color-option').forEach(btn => btn.classList.remove('selected'));
        document.querySelector(`.color-option[data-color="${color}"]`)?.classList.add('selected');
        document.getElementById('templateColor').value = color;
    }

    /**
     * Đóng modal
     */
    closeModal() {
        const modalContainer = document.getElementById('templateEditorModal');
        if (modalContainer) {
            modalContainer.innerHTML = '';
        }
        this.modalPermUI = null;
        window.tplEditDetailedPermUI = null;
    }

    /**
     * Lưu template (SIMPLIFIED)
     */
    async saveTemplate(mode) {
        const id = document.getElementById('templateId').value.trim().toLowerCase().replace(/\s+/g, '-');
        const name = document.getElementById('templateName').value.trim();
        const description = document.getElementById('templateDesc').value.trim();
        const icon = document.getElementById('templateIcon').value;
        const color = document.getElementById('templateColor').value;
        const isSystemDefault = document.getElementById('templateIsSystemDefault')?.value === 'true';

        // Validation
        if (!id) {
            alert('Vui lòng nhập ID cho template!');
            return;
        }

        if (!/^[a-z0-9-]+$/.test(id)) {
            alert('ID chỉ được chứa chữ thường, số và dấu gạch ngang!');
            return;
        }

        if (!name) {
            alert('Vui lòng nhập tên cho template!');
            return;
        }

        // Check if ID already exists (for create mode only)
        if (mode === 'create') {
            if (this.templates[id]) {
                alert('ID này đã tồn tại! Vui lòng chọn ID khác.');
                return;
            }
        }

        // Get permissions from UI
        const detailedPermissions = this.modalPermUI
            ? this.modalPermUI.getPermissions()
            : {};

        const templateData = {
            name: name,
            description: description,
            icon: icon,
            color: color,
            detailedPermissions: detailedPermissions,
            isSystemDefault: isSystemDefault, // Preserve system default flag
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: JSON.parse(localStorage.getItem('loginindex_auth') || sessionStorage.getItem('loginindex_auth') || '{}')?.username || 'unknown'
        };

        if (mode === 'create') {
            templateData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            templateData.createdBy = JSON.parse(localStorage.getItem('loginindex_auth') || sessionStorage.getItem('loginindex_auth') || '{}')?.username || 'unknown';
            templateData.isSystemDefault = false; // New templates are never system defaults
        }

        try {
            await db.collection('permission_templates').doc(id).set(templateData, { merge: true });

            // Update local cache
            this.templates[id] = { id, ...templateData };

            const actionText = mode === 'edit' ? 'cập nhật' : 'tạo';
            if (window.notify) {
                window.notify.success(`Đã ${actionText} template "${name}"`);
            }

            this.closeModal();
            this.renderTemplatesList();

            // Update PERMISSION_TEMPLATES for DetailedPermissionsUI to pick up
            this.updateGlobalTemplates();

            // Refresh template buttons in all DetailedPermissionsUI instances
            this.refreshAllTemplateButtons();

        } catch (error) {
            console.error('[TemplateManager] Error saving template:', error);
            alert('Lỗi lưu template: ' + error.message);
        }
    }

    // =====================================================
    // USER ASSIGNMENT FEATURE - Gán nhân viên vào template
    // =====================================================

    /**
     * Load all users từ Firebase
     */
    async loadAllUsers() {
        if (!db) return [];

        try {
            const snapshot = await db.collection('users').get();
            this.allUsers = [];
            snapshot.forEach(doc => {
                this.allUsers.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            // Sort by displayName
            this.allUsers.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));

            console.log('[TemplateManager] Loaded', this.allUsers.length, 'users');
            return this.allUsers;
        } catch (error) {
            console.error('[TemplateManager] Error loading users:', error);
            return [];
        }
    }

    /**
     * Show user assignment panel for a template (SIMPLIFIED)
     */
    async showUserAssignment(templateId) {
        // Toggle - if same template clicked, close panel
        if (this.selectedTemplateId === templateId) {
            this.closeUserAssignment();
            return;
        }

        this.selectedTemplateId = templateId;

        // Load users if not already loaded
        if (this.allUsers.length === 0) {
            await this.loadAllUsers();
        }

        const template = this.templates[templateId];

        if (!template) {
            alert('Không tìm thấy template!');
            return;
        }

        // Remove existing panel
        this.closeUserAssignment();

        // Mark selected card
        document.querySelectorAll('.template-card').forEach(card => card.classList.remove('active'));
        const selectedCard = document.querySelector(`.template-card[data-template-id="${templateId}"]`);
        if (selectedCard) selectedCard.classList.add('active');

        // Create assignment panel
        const panelHtml = `
            <div class="user-assignment-panel" id="userAssignmentPanel">
                <div class="assignment-header">
                    <div class="assignment-title">
                        <i data-lucide="users"></i>
                        <span>Gán Nhân Viên cho Template: <strong>${template.name}</strong></span>
                    </div>
                    <button class="btn-close-panel" onclick="templateManager.closeUserAssignment()">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                <p class="assignment-desc">
                    Click vào nhân viên để <strong style="color: #10b981">gán</strong> hoặc <strong style="color: #ef4444">bỏ gán</strong> template này.
                    Nhân viên đang sử dụng template này sẽ hiển thị màu xanh.
                </p>
                <div class="assignment-stats">
                    <span id="assignedCount">0</span> / ${this.allUsers.length} nhân viên đang sử dụng template này
                </div>
                <div class="user-badges-container" id="userBadgesContainer">
                    ${this.renderUserBadges(templateId)}
                </div>
            </div>
        `;

        // Insert after the templates-section
        const container = document.getElementById('templatesList');
        if (container) {
            container.insertAdjacentHTML('beforeend', panelHtml);
            if (typeof lucide !== 'undefined') lucide.createIcons();
            this.updateAssignedCount(templateId);
        }
    }

    /**
     * Render user badges
     */
    renderUserBadges(templateId) {
        if (this.allUsers.length === 0) {
            return '<div class="no-users">Không có nhân viên nào</div>';
        }

        return this.allUsers.map(user => {
            const isAssigned = user.roleTemplate === templateId;
            const badgeClass = isAssigned ? 'assigned' : '';

            return `
                <button class="user-badge ${badgeClass}"
                        data-user-id="${user.id}"
                        data-assigned="${isAssigned}"
                        onclick="templateManager.toggleUserAssignment('${user.id}', '${templateId}')"
                        title="${user.displayName} (${user.id})${isAssigned ? ' - Click để bỏ gán' : ' - Click để gán'}">
                    ${user.displayName || user.id}
                </button>
            `;
        }).join('');
    }

    /**
     * Toggle user assignment to template (SIMPLIFIED)
     */
    async toggleUserAssignment(userId, templateId) {
        const user = this.allUsers.find(u => u.id === userId);
        if (!user) return;

        const isCurrentlyAssigned = user.roleTemplate === templateId;
        const badge = document.querySelector(`.user-badge[data-user-id="${userId}"]`);

        // Show loading state
        if (badge) {
            badge.classList.add('loading');
            badge.disabled = true;
        }

        try {
            const userRef = db.collection('users').doc(userId);

            if (isCurrentlyAssigned) {
                // Remove from template - set to custom
                await userRef.update({
                    roleTemplate: 'custom',
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: JSON.parse(localStorage.getItem('loginindex_auth') || sessionStorage.getItem('loginindex_auth') || '{}').username || 'unknown'
                });

                // Update local cache
                user.roleTemplate = 'custom';

                if (badge) {
                    badge.classList.remove('assigned');
                    badge.dataset.assigned = 'false';
                }

                if (window.notify) {
                    window.notify.info(`Đã bỏ gán "${user.displayName}" khỏi template`);
                }
            } else {
                // Assign to template - get template permissions from Firebase
                const template = this.templates[templateId];
                const permissions = this.getTemplatePermissions(templateId);

                await userRef.update({
                    roleTemplate: templateId,
                    detailedPermissions: permissions,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: JSON.parse(localStorage.getItem('loginindex_auth') || sessionStorage.getItem('loginindex_auth') || '{}').username || 'unknown'
                });

                // Update local cache
                user.roleTemplate = templateId;
                user.detailedPermissions = permissions;

                if (badge) {
                    badge.classList.add('assigned');
                    badge.dataset.assigned = 'true';
                }

                if (window.notify) {
                    window.notify.success(`Đã gán "${user.displayName}" vào template "${template?.name || templateId}"`);
                }
            }

            this.updateAssignedCount(templateId);

        } catch (error) {
            console.error('[TemplateManager] Error toggling user assignment:', error);
            if (window.notify) {
                window.notify.error('Lỗi cập nhật: ' + error.message);
            }
        } finally {
            if (badge) {
                badge.classList.remove('loading');
                badge.disabled = false;
            }
        }
    }

    /**
     * Update assigned count display
     */
    updateAssignedCount(templateId) {
        const count = this.allUsers.filter(u => u.roleTemplate === templateId).length;
        const countEl = document.getElementById('assignedCount');
        if (countEl) {
            countEl.textContent = count;
        }
    }

    /**
     * Close user assignment panel
     */
    closeUserAssignment() {
        this.selectedTemplateId = null;
        const panel = document.getElementById('userAssignmentPanel');
        if (panel) panel.remove();
        document.querySelectorAll('.template-card').forEach(card => card.classList.remove('active'));
    }

    /**
     * Refresh template buttons trong tất cả DetailedPermissionsUI instances
     */
    refreshAllTemplateButtons() {
        // Refresh edit form
        if (typeof window.editDetailedPermUI !== 'undefined' && window.editDetailedPermUI?.refreshTemplateButtons) {
            window.editDetailedPermUI.refreshTemplateButtons();
        }

        // Refresh create form
        if (typeof window.newDetailedPermUI !== 'undefined' && window.newDetailedPermUI?.refreshTemplateButtons) {
            window.newDetailedPermUI.refreshTemplateButtons();
        }

        console.log('[TemplateManager] Refreshed template buttons in DetailedPermissionsUI');
    }

    /**
     * Cập nhật PERMISSION_TEMPLATES global để DetailedPermissionsUI sử dụng (SIMPLIFIED)
     */
    updateGlobalTemplates() {
        if (typeof window.PERMISSION_TEMPLATES !== 'undefined') {
            // Add all templates to global PERMISSION_TEMPLATES
            Object.entries(this.templates).forEach(([id, template]) => {
                window.PERMISSION_TEMPLATES[id] = {
                    id: id,
                    name: template.name,
                    icon: template.icon,
                    description: template.description,
                    color: template.color,
                    isSystemDefault: template.isSystemDefault,
                    detailedPermissions: template.detailedPermissions
                };
            });
        }
    }

    // Backward compatibility: alias for old property names
    get customTemplates() { return this.templates; }
    get builtInTemplates() { return this.templates; }
    get allTemplates() { return this.templates; }
}

// =====================================================
// GLOBAL INSTANCE & STYLES
// =====================================================
const templateManager = new TemplateManager();
window.templateManager = templateManager;

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    templateManager.init();
});

// =====================================================
// CSS STYLES
// =====================================================
const templateManagerStyle = document.createElement('style');
templateManagerStyle.textContent = `
/* Templates Section */
.templates-section {
    margin-bottom: 24px;
}

.templates-section .section-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary, #111827);
    margin: 0 0 8px 0;
}

.templates-section .section-title i {
    width: 20px;
    height: 20px;
    color: var(--accent-color, #6366f1);
}

.templates-section .section-desc {
    color: var(--text-tertiary, #6b7280);
    font-size: 13px;
    margin: 0 0 16px 0;
}

/* Templates Grid */
.templates-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 16px;
}

/* Template Card */
.template-card {
    background: white;
    border: 1px solid var(--border-color, #e5e7eb);
    border-radius: 12px;
    overflow: hidden;
    transition: all 0.2s;
}

.template-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    border-color: var(--template-color, var(--accent-color, #6366f1));
}

.template-card-header {
    display: flex;
    gap: 14px;
    padding: 16px;
    background: linear-gradient(135deg, color-mix(in srgb, var(--template-color) 8%, white), white);
    border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.template-icon {
    width: 48px;
    height: 48px;
    background: var(--template-color, #6366f1);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.template-icon i {
    width: 24px;
    height: 24px;
    color: white;
}

.template-info {
    flex: 1;
    min-width: 0;
}

.template-name {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary, #111827);
    margin: 0 0 4px 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.template-desc {
    font-size: 12px;
    color: var(--text-tertiary, #6b7280);
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.template-card-body {
    padding: 14px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.template-stats {
    display: flex;
    gap: 16px;
}

.template-stats .stat {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-secondary, #374151);
}

.template-stats .stat i {
    width: 14px;
    height: 14px;
    color: var(--text-tertiary, #6b7280);
}

.template-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 500;
}

.template-badge i {
    width: 12px;
    height: 12px;
}

.template-badge.builtin {
    background: #f3f4f6;
    color: #6b7280;
}

.template-badge.custom {
    background: #eff6ff;
    color: #3b82f6;
}

.template-badge.modified {
    background: #fef3c7;
    color: #d97706;
}

.template-badge.admin {
    background: #fef2f2;
    color: #dc2626;
}

.template-card-actions {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    background: var(--bg-secondary, #f9fafb);
    border-top: 1px solid var(--border-color, #e5e7eb);
}

.template-card-actions .btn-sm {
    padding: 6px 12px;
    font-size: 12px;
}

.template-card-actions .btn-danger {
    background: #fef2f2;
    color: #dc2626;
    border-color: #fecaca;
}

.template-card-actions .btn-danger:hover {
    background: #dc2626;
    color: white;
}

.template-card-actions .btn-warning {
    background: #fffbeb;
    color: #d97706;
    border-color: #fde68a;
}

.template-card-actions .btn-warning:hover {
    background: #f59e0b;
    color: white;
}

.template-card.modified {
    border-color: #f59e0b;
}

.template-card.admin-template {
    opacity: 0.9;
}

/* Modal Styles */
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
}

.modal-content {
    background: white;
    border-radius: 16px;
    max-width: 900px;
    width: 100%;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.modal-header h3 {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    font-size: 18px;
}

.modal-header h3 i {
    width: 24px;
    height: 24px;
    color: var(--accent-color, #6366f1);
}

.modal-notice {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 24px;
    background: #eff6ff;
    border-bottom: 1px solid #bfdbfe;
    color: #1e40af;
    font-size: 13px;
}

.modal-notice i {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
}

.btn-close {
    width: 36px;
    height: 36px;
    background: transparent;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary, #374151);
    transition: all 0.2s;
}

.btn-close:hover {
    background: var(--bg-secondary, #f3f4f6);
    color: var(--text-primary, #111827);
}

.modal-body {
    padding: 24px;
    overflow-y: auto;
    flex: 1;
}

.modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 24px;
    border-top: 1px solid var(--border-color, #e5e7eb);
    background: var(--bg-secondary, #f9fafb);
}

/* Icon & Color Picker */
.icon-picker, .color-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.icon-option {
    width: 40px;
    height: 40px;
    border: 2px solid var(--border-color, #e5e7eb);
    background: white;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
}

.icon-option:hover {
    border-color: var(--accent-color, #6366f1);
    background: color-mix(in srgb, var(--accent-color, #6366f1) 5%, white);
}

.icon-option.selected {
    border-color: var(--accent-color, #6366f1);
    background: var(--accent-color, #6366f1);
    color: white;
}

.icon-option i {
    width: 18px;
    height: 18px;
}

.color-option {
    width: 32px;
    height: 32px;
    border: 3px solid transparent;
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.2s;
}

.color-option:hover {
    transform: scale(1.1);
}

.color-option.selected {
    border-color: var(--text-primary, #111827);
    box-shadow: 0 0 0 2px white, 0 0 0 4px var(--text-primary, #111827);
}

/* Template Permissions Editor */
.template-permissions-editor {
    background: var(--bg-secondary, #f9fafb);
    border-radius: 12px;
    padding: 16px;
    max-height: 400px;
    overflow-y: auto;
}

@media (max-width: 768px) {
    .templates-grid {
        grid-template-columns: 1fr;
    }

    .modal-content {
        max-width: 100%;
        margin: 10px;
    }

    .template-card-actions {
        flex-wrap: wrap;
    }
}

/* =====================================================
   USER ASSIGNMENT PANEL & BADGES
   ===================================================== */

/* Success button style */
.template-card-actions .btn-success {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    border: none;
}

.template-card-actions .btn-success:hover {
    background: linear-gradient(135deg, #059669 0%, #047857 100%);
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
}

/* Active template card */
.template-card.active {
    border: 2px solid var(--accent-color, #6366f1);
    box-shadow: 0 4px 20px rgba(99, 102, 241, 0.25);
}

/* User Assignment Panel */
.user-assignment-panel {
    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
    border: 2px solid var(--accent-color, #6366f1);
    border-radius: 16px;
    padding: 24px;
    margin-top: 24px;
    animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
    from {
        opacity: 0;
        transform: translateY(-10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.assignment-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
}

.assignment-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary, #111827);
}

.assignment-title i {
    width: 22px;
    height: 22px;
    color: var(--accent-color, #6366f1);
}

.btn-close-panel {
    width: 32px;
    height: 32px;
    background: white;
    border: 1px solid var(--border-color, #e5e7eb);
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
}

.btn-close-panel:hover {
    background: #fef2f2;
    border-color: #fecaca;
    color: #dc2626;
}

.assignment-desc {
    color: var(--text-secondary, #6b7280);
    font-size: 13px;
    margin: 0 0 12px 0;
    line-height: 1.5;
}

.assignment-stats {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: white;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 13px;
    color: var(--text-secondary, #6b7280);
    margin-bottom: 16px;
    border: 1px solid var(--border-color, #e5e7eb);
}

.assignment-stats span {
    font-weight: 700;
    color: var(--accent-color, #6366f1);
}

/* User Badges Container */
.user-badges-container {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 16px;
    background: white;
    border-radius: 12px;
    border: 1px solid var(--border-color, #e5e7eb);
    max-height: 300px;
    overflow-y: auto;
}

.no-users {
    width: 100%;
    text-align: center;
    color: var(--text-tertiary, #9ca3af);
    padding: 20px;
}

/* User Badge Button */
.user-badge {
    display: inline-flex;
    align-items: center;
    padding: 8px 16px;
    background: white;
    border: 2px solid var(--border-color, #e5e7eb);
    border-radius: 25px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary, #6b7280);
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
}

.user-badge:hover {
    border-color: var(--accent-color, #6366f1);
    background: color-mix(in srgb, var(--accent-color, #6366f1) 5%, white);
    color: var(--accent-color, #6366f1);
    transform: translateY(-1px);
}

/* Assigned state - green */
.user-badge.assigned {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border-color: #059669;
    color: white;
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
}

.user-badge.assigned:hover {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    border-color: #dc2626;
    color: white;
    box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
}

/* Loading state */
.user-badge.loading {
    opacity: 0.6;
    pointer-events: none;
}

.user-badge.loading::after {
    content: '';
    width: 12px;
    height: 12px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    margin-left: 8px;
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

/* Responsive */
@media (max-width: 768px) {
    .user-assignment-panel {
        padding: 16px;
    }

    .user-badges-container {
        max-height: 250px;
    }

    .user-badge {
        padding: 6px 12px;
        font-size: 12px;
    }
}
`;
document.head.appendChild(templateManagerStyle);

console.log('[Template Manager] Loaded - Custom template management ready');
