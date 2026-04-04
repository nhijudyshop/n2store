// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// TEMPLATE MANAGER - Render API Version
// =====================================================

const TEMPLATE_PERMISSIONS_VERSION = 2;

class TemplateManager {
    constructor() {
        this.templates = {};
        this.isLoading = false;
        this.allUsers = [];
        this.selectedTemplateId = null;
        this.defaultTemplateIds = ['admin', 'manager', 'sales-team', 'warehouse-team', 'staff', 'viewer'];
    }

    init() {
        console.log('[TemplateManager] Initialized - Render API mode');
    }

    // Seed default templates via API
    async migrateDefaultTemplates() {
        try {
            const data = await UserAPI.fetch('/templates/list');
            if (data.templates && data.templates.length > 0) {
                return false;
            }

            console.log('[TemplateManager] No templates found, seeding defaults...');
            const templateMeta = typeof PERMISSION_TEMPLATES !== 'undefined' ? PERMISSION_TEMPLATES : {};

            for (const templateId of this.defaultTemplateIds) {
                const meta = templateMeta[templateId] || {};
                let detailedPermissions = {};
                if (typeof PermissionsRegistry !== 'undefined' && PermissionsRegistry.generateTemplatePermissions) {
                    const result = PermissionsRegistry.generateTemplatePermissions(templateId);
                    detailedPermissions = result.detailedPermissions || {};
                }

                await UserAPI.fetch('/templates', {
                    method: 'POST',
                    body: JSON.stringify({
                        id: templateId,
                        name: meta.name || templateId,
                        icon: meta.icon || 'sliders',
                        color: meta.color || '#6366f1',
                        description: meta.description || '',
                        detailedPermissions,
                        isSystemDefault: true,
                        permissionsVersion: TEMPLATE_PERMISSIONS_VERSION
                    })
                });
            }

            console.log('[TemplateManager] Seeded', this.defaultTemplateIds.length, 'templates');
            return true;
        } catch (error) {
            console.error('[TemplateManager] Migration error:', error);
            return false;
        }
    }

    async loadTemplates() {
        if (this.isLoading) return;
        this.isLoading = true;

        const container = document.getElementById('templatesList');
        if (container) {
            container.innerHTML = '<div class="empty-state show"><i data-lucide="loader" class="spinning"></i><h3>Dang tai templates...</h3></div>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        try {
            await this.migrateDefaultTemplates();

            const data = await UserAPI.fetch('/templates/list');
            this.templates = {};

            if (data.templates) {
                data.templates.forEach(t => {
                    this.templates[t.id] = t;
                });
            }

            console.log('[TemplateManager] Loaded', Object.keys(this.templates).length, 'templates');
            this.renderTemplatesList();
            this.refreshAllTemplateButtons();

        } catch (error) {
            console.error('[TemplateManager] Error loading templates:', error);
            if (container) {
                container.innerHTML = `<div class="empty-state show"><i data-lucide="alert-circle"></i><h3>Loi tai templates</h3><p>${error.message}</p></div>`;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        }

        this.isLoading = false;
    }

    renderTemplatesList() {
        const container = document.getElementById('templatesList');
        if (!container) return;

        const templateKeys = Object.keys(this.templates);

        if (templateKeys.length === 0) {
            container.innerHTML = '<div class="empty-state show"><i data-lucide="layout-template"></i><h3>Chua co template nao</h3><p>Nhan "Tao Template Moi" de bat dau</p></div>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        let html = `
            <div class="templates-section">
                <h3 class="section-title"><i data-lucide="layout-template"></i> Tat ca Templates (${templateKeys.length})</h3>
                <p class="section-desc">Tat ca templates deu co the chinh sua va xoa tu do.</p>
                <div class="templates-grid">
        `;

        templateKeys.forEach(key => {
            html += this.renderTemplateCard(key, this.templates[key]);
        });

        html += '</div></div>';
        container.innerHTML = html;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    renderTemplateCard(id, template) {
        const permissions = this.getTemplatePermissions(id);
        const permCount = this.countPermissions(permissions);
        const totalPerms = typeof PermissionsRegistry !== 'undefined' ? PermissionsRegistry.getTotalPermissionsCount() : 101;
        const isAdmin = id === 'admin';

        let badgeHtml = isAdmin
            ? '<span class="template-badge admin"><i data-lucide="crown"></i> Admin</span>'
            : '<span class="template-badge custom"><i data-lucide="user"></i> Tuy chinh</span>';

        return `
            <div class="template-card" data-template-id="${id}">
                <div class="template-card-header" style="--template-color: ${template.color || '#6366f1'}">
                    <div class="template-icon"><i data-lucide="${template.icon || 'sliders'}"></i></div>
                    <div class="template-info">
                        <h4 class="template-name">${template.name || id}</h4>
                        <p class="template-desc">${template.description || 'Khong co mo ta'}</p>
                    </div>
                </div>
                <div class="template-card-body">
                    <div class="template-stats">
                        <span class="stat"><i data-lucide="shield-check"></i> ${permCount}/${totalPerms} quyen</span>
                        <span class="stat"><i data-lucide="layout-grid"></i> ${this.countAccessiblePages(permissions)} trang</span>
                    </div>
                    ${badgeHtml}
                </div>
                <div class="template-card-actions" style="display:flex;flex-wrap:wrap;gap:8px;padding:12px 16px;background:#f9fafb;border-top:1px solid #e5e7eb;">
                    <button class="btn btn-sm btn-success" onclick="templateManager.showUserAssignment('${id}')"><i data-lucide="users"></i> Gan NV</button>
                    <button class="btn btn-sm btn-secondary" onclick="templateManager.previewTemplate('${id}')"><i data-lucide="eye"></i> Xem</button>
                    <button class="btn btn-sm btn-primary" onclick="templateManager.editTemplate('${id}')"><i data-lucide="edit"></i> Sua</button>
                    <button class="btn btn-sm btn-info" onclick="templateManager.syncUsersWithTemplate('${id}')" title="Dong bo quyen"><i data-lucide="refresh-cw"></i></button>
                    <button class="btn btn-sm btn-secondary" onclick="templateManager.duplicateTemplate('${id}')"><i data-lucide="copy"></i></button>
                    <button class="btn btn-sm" onclick="templateManager.deleteTemplate('${id}')" style="background:#fee2e2;color:#dc2626;border:1px solid #fecaca;padding:6px 12px;font-size:12px;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;"><i data-lucide="trash-2"></i> Xoa</button>
                </div>
            </div>
        `;
    }

    getTemplatePermissions(templateId) {
        const template = this.templates[templateId];
        return template?.detailedPermissions || {};
    }

    countPermissions(permissions) {
        let count = 0;
        Object.values(permissions).forEach(pagePerms => {
            count += Object.values(pagePerms).filter(v => v === true).length;
        });
        return count;
    }

    countAccessiblePages(permissions) {
        let count = 0;
        Object.values(permissions).forEach(pagePerms => {
            if (Object.values(pagePerms).some(v => v === true)) count++;
        });
        return count;
    }

    previewTemplate(templateId) {
        const template = this.templates[templateId];
        if (!template) { alert('Khong tim thay template!'); return; }

        const permissions = this.getTemplatePermissions(templateId);
        const totalPerms = typeof PermissionsRegistry !== 'undefined' ? PermissionsRegistry.getTotalPermissionsCount() : 101;

        let report = `CHI TIET TEMPLATE: ${template.name}\n${'='.repeat(50)}\n\n`;
        report += `Mo ta: ${template.description || 'Khong co'}\n`;
        report += `Tong quyen: ${this.countPermissions(permissions)}/${totalPerms}\n\n`;
        report += `DANH SACH QUYEN:\n${'─'.repeat(50)}\n`;

        const pages = typeof PAGES_REGISTRY !== 'undefined' ? PAGES_REGISTRY : {};
        Object.entries(permissions).forEach(([pageId, pagePerms]) => {
            const grantedPerms = Object.entries(pagePerms).filter(([_, v]) => v === true);
            if (grantedPerms.length > 0) {
                const page = pages[pageId];
                report += `\n${page?.name || pageId}\n`;
                grantedPerms.forEach(([permKey, _]) => {
                    const permInfo = page?.detailedPermissions?.[permKey];
                    report += `   * ${permInfo?.name || permKey}\n`;
                });
            }
        });

        alert(report);
    }

    showCreateModal() { this.showEditorModal(null, 'create'); }

    duplicateTemplate(templateId) {
        const source = this.templates[templateId];
        if (!source) { alert('Khong tim thay template goc!'); return; }

        this.showEditorModal({
            name: `${source.name} (Copy)`,
            description: source.description,
            icon: source.icon,
            color: source.color,
            detailedPermissions: this.getTemplatePermissions(templateId)
        }, 'create');
    }

    editTemplate(templateId) {
        const template = this.templates[templateId];
        if (!template) { alert('Khong tim thay template!'); return; }

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

    async resetToDefault(templateId) {
        const template = this.templates[templateId];
        if (!template) { alert('Khong tim thay template!'); return; }
        if (!confirm(`Khoi phuc template "${template.name}" ve mac dinh?`)) return;

        try {
            let defaultPermissions = {};
            if (typeof PermissionsRegistry !== 'undefined' && PermissionsRegistry.generateTemplatePermissions) {
                const result = PermissionsRegistry.generateTemplatePermissions(templateId);
                defaultPermissions = result.detailedPermissions || {};
            }

            const templateMeta = typeof PERMISSION_TEMPLATES !== 'undefined' ? PERMISSION_TEMPLATES[templateId] : {};

            await UserAPI.fetch(`/templates/${templateId}`, {
                method: 'PUT',
                body: JSON.stringify({
                    detailedPermissions: defaultPermissions,
                    name: templateMeta.name || template.name,
                    description: templateMeta.description || template.description,
                    icon: templateMeta.icon || template.icon,
                    color: templateMeta.color || template.color
                })
            });

            this.templates[templateId] = {
                ...this.templates[templateId],
                detailedPermissions: defaultPermissions,
                name: templateMeta.name || template.name,
                description: templateMeta.description || template.description,
                icon: templateMeta.icon || template.icon,
                color: templateMeta.color || template.color
            };

            if (window.notify) window.notify.success(`Da khoi phuc template "${template.name}" ve mac dinh`);
            this.renderTemplatesList();
            this.refreshAllTemplateButtons();
        } catch (error) {
            console.error('[TemplateManager] Error resetting template:', error);
            alert('Loi khoi phuc template: ' + error.message);
        }
    }

    async syncUsersWithTemplate(templateId) {
        const template = this.templates[templateId];
        if (!template) { alert('Khong tim thay template!'); return; }
        if (!template.detailedPermissions || Object.keys(template.detailedPermissions).length === 0) {
            alert('Template chua co permissions nao!');
            return;
        }

        // Load users to check who uses this template
        if (this.allUsers.length === 0) await this.loadAllUsers();

        const usersWithTemplate = this.allUsers.filter(u => u.roleTemplate === templateId);
        if (usersWithTemplate.length === 0) {
            alert(`Khong co user nao dang su dung template "${template.name}"`);
            return;
        }

        if (!confirm(`Cap nhat quyen cho ${usersWithTemplate.length} user dang su dung template "${template.name}"?`)) return;

        try {
            const loadingId = window.notify?.loading?.(`Dang cap nhat ${usersWithTemplate.length} users...`);

            await UserAPI.fetch('/batch-template', {
                method: 'POST',
                body: JSON.stringify({
                    userIds: usersWithTemplate.map(u => u.id),
                    templateId: templateId,
                    permissions: template.detailedPermissions
                })
            });

            if (loadingId && window.notify?.remove) window.notify.remove(loadingId);
            window.notify?.success?.(`Da cap nhat quyen cho ${usersWithTemplate.length} user`);
            if (typeof loadUsers === 'function') setTimeout(loadUsers, 500);
        } catch (error) {
            console.error('[TemplateManager] Error syncing users:', error);
            alert('Loi cap nhat users: ' + error.message);
        }
    }

    async deleteTemplate(templateId) {
        const template = this.templates[templateId];
        if (!template) { alert('Khong tim thay template!'); return; }
        if (!confirm(`Xoa template "${template.name}"?\n\nHanh dong nay khong the hoan tac!`)) return;

        try {
            await UserAPI.fetch(`/templates/${templateId}`, { method: 'DELETE' });
            delete this.templates[templateId];
            if (window.notify) window.notify.success(`Da xoa template "${template.name}"`);
            this.renderTemplatesList();
            this.refreshAllTemplateButtons();
        } catch (error) {
            console.error('[TemplateManager] Error deleting template:', error);
            alert('Loi xoa template: ' + error.message);
        }
    }

    showEditorModal(data = null, mode = 'create') {
        const modalContainer = document.getElementById('templateEditorModal');
        if (!modalContainer) return;

        const isEdit = mode === 'edit';
        const isSystemDefault = data?.isSystemDefault || false;
        const title = isEdit
            ? (isSystemDefault ? `Chinh Sua Template He Thong: ${data?.name || ''}` : 'Chinh Sua Template')
            : 'Tao Template Moi';

        const templateData = data || { id: '', name: '', description: '', icon: 'sliders', color: '#6366f1', detailedPermissions: {} };
        const icons = ['crown', 'briefcase', 'shopping-cart', 'package', 'users', 'eye', 'sliders', 'shield', 'star', 'zap'];
        const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#6b7280'];

        modalContainer.innerHTML = `
            <div class="modal-overlay" onclick="templateManager.closeModal()">
                <div class="modal-content template-editor-modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3><i data-lucide="layout-template"></i> ${title}</h3>
                        <button class="btn-close" onclick="templateManager.closeModal()"><i data-lucide="x"></i></button>
                    </div>
                    ${isSystemDefault ? '<div class="modal-notice"><i data-lucide="info"></i><span>Ban dang chinh sua template he thong.</span></div>' : ''}
                    <div class="modal-body">
                        <div class="form-row">
                            <div class="form-group">
                                <label>ID</label>
                                <input type="text" id="templateId" value="${templateData.id || ''}" placeholder="vd: my-custom-template" ${isEdit ? 'readonly style="background: var(--gray-100)"' : ''} />
                            </div>
                            <div class="form-group">
                                <label>Ten hien thi</label>
                                <input type="text" id="templateName" value="${templateData.name || ''}" placeholder="vd: Nhom Ban Hang Moi" />
                            </div>
                        </div>
                        <input type="hidden" id="templateIsSystemDefault" value="${isSystemDefault}" />
                        <div class="form-group">
                            <label>Mo ta</label>
                            <input type="text" id="templateDesc" value="${templateData.description || ''}" placeholder="Mo ta ngan" />
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Icon</label>
                                <div class="icon-picker">
                                    ${icons.map(icon => `<button type="button" class="icon-option ${icon === templateData.icon ? 'selected' : ''}" data-icon="${icon}" onclick="templateManager.selectIcon('${icon}')"><i data-lucide="${icon}"></i></button>`).join('')}
                                </div>
                                <input type="hidden" id="templateIcon" value="${templateData.icon || 'sliders'}" />
                            </div>
                            <div class="form-group">
                                <label>Mau sac</label>
                                <div class="color-picker">
                                    ${colors.map(color => `<button type="button" class="color-option ${color === templateData.color ? 'selected' : ''}" style="background: ${color}" data-color="${color}" onclick="templateManager.selectColor('${color}')"></button>`).join('')}
                                </div>
                                <input type="hidden" id="templateColor" value="${templateData.color || '#6366f1'}" />
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Quyen han</label>
                            <div id="templatePermissionsEditor" class="template-permissions-editor"></div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="templateManager.closeModal()"><i data-lucide="x"></i> Huy</button>
                        <button class="btn btn-primary" onclick="templateManager.saveTemplate('${mode}')"><i data-lucide="check"></i> ${isEdit ? 'Cap Nhat' : 'Tao Template'}</button>
                    </div>
                </div>
            </div>
        `;

        this.initModalPermissionsUI(templateData.detailedPermissions || {});
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    initModalPermissionsUI(permissions) {
        const container = document.getElementById('templatePermissionsEditor');
        if (!container) return;
        this.modalPermUI = new DetailedPermissionsUI('templatePermissionsEditor', 'tplEdit');
        this.modalPermUI.render(permissions);
        window.tplEditDetailedPermUI = this.modalPermUI;
    }

    selectIcon(icon) {
        document.querySelectorAll('.icon-option').forEach(btn => btn.classList.remove('selected'));
        document.querySelector(`.icon-option[data-icon="${icon}"]`)?.classList.add('selected');
        document.getElementById('templateIcon').value = icon;
    }

    selectColor(color) {
        document.querySelectorAll('.color-option').forEach(btn => btn.classList.remove('selected'));
        document.querySelector(`.color-option[data-color="${color}"]`)?.classList.add('selected');
        document.getElementById('templateColor').value = color;
    }

    closeModal() {
        const modalContainer = document.getElementById('templateEditorModal');
        if (modalContainer) modalContainer.innerHTML = '';
        this.modalPermUI = null;
        window.tplEditDetailedPermUI = null;
    }

    async saveTemplate(mode) {
        const id = document.getElementById('templateId').value.trim().toLowerCase().replace(/\s+/g, '-');
        const name = document.getElementById('templateName').value.trim();
        const description = document.getElementById('templateDesc').value.trim();
        const icon = document.getElementById('templateIcon').value;
        const color = document.getElementById('templateColor').value;
        const isSystemDefault = document.getElementById('templateIsSystemDefault')?.value === 'true';

        if (!id || !/^[a-z0-9-]+$/.test(id)) { alert('ID chi duoc chua chu thuong, so va dau gach ngang!'); return; }
        if (!name) { alert('Vui long nhap ten cho template!'); return; }
        if (mode === 'create' && this.templates[id]) { alert('ID nay da ton tai!'); return; }

        const detailedPermissions = this.modalPermUI ? this.modalPermUI.getPermissions() : {};

        try {
            if (mode === 'create') {
                await UserAPI.fetch('/templates', {
                    method: 'POST',
                    body: JSON.stringify({ id, name, description, icon, color, detailedPermissions, isSystemDefault: false, permissionsVersion: TEMPLATE_PERMISSIONS_VERSION })
                });
            } else {
                await UserAPI.fetch(`/templates/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify({ name, description, icon, color, detailedPermissions, permissionsVersion: TEMPLATE_PERMISSIONS_VERSION })
                });
            }

            this.templates[id] = { id, name, description, icon, color, detailedPermissions, isSystemDefault: mode === 'edit' ? isSystemDefault : false };

            if (window.notify) window.notify.success(`Da ${mode === 'edit' ? 'cap nhat' : 'tao'} template "${name}"`);
            this.closeModal();
            this.renderTemplatesList();
            this.updateGlobalTemplates();
            this.refreshAllTemplateButtons();
        } catch (error) {
            console.error('[TemplateManager] Error saving template:', error);
            alert('Loi luu template: ' + error.message);
        }
    }

    // =====================================================
    // USER ASSIGNMENT
    // =====================================================

    async loadAllUsers() {
        try {
            const data = await UserAPI.fetch('/');
            this.allUsers = data.users || [];
            this.allUsers.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
            return this.allUsers;
        } catch (error) {
            console.error('[TemplateManager] Error loading users:', error);
            return [];
        }
    }

    async showUserAssignment(templateId) {
        if (this.selectedTemplateId === templateId) { this.closeUserAssignment(); return; }
        this.selectedTemplateId = templateId;
        if (this.allUsers.length === 0) await this.loadAllUsers();

        const template = this.templates[templateId];
        if (!template) { alert('Khong tim thay template!'); return; }

        this.closeUserAssignment();

        document.querySelectorAll('.template-card').forEach(card => card.classList.remove('active'));
        document.querySelector(`.template-card[data-template-id="${templateId}"]`)?.classList.add('active');

        const panelHtml = `
            <div class="user-assignment-panel" id="userAssignmentPanel">
                <div class="assignment-header">
                    <div class="assignment-title"><i data-lucide="users"></i><span>Gan Nhan Vien cho Template: <strong>${template.name}</strong></span></div>
                    <button class="btn-close-panel" onclick="templateManager.closeUserAssignment()"><i data-lucide="x"></i></button>
                </div>
                <p class="assignment-desc">Click vao nhan vien de <strong style="color: #10b981">gan</strong> hoac <strong style="color: #ef4444">bo gan</strong> template nay.</p>
                <div class="assignment-stats"><span id="assignedCount">0</span> / ${this.allUsers.length} nhan vien dang su dung template nay</div>
                <div class="user-badges-container" id="userBadgesContainer">${this.renderUserBadges(templateId)}</div>
            </div>
        `;

        const container = document.getElementById('templatesList');
        if (container) {
            container.insertAdjacentHTML('beforeend', panelHtml);
            if (typeof lucide !== 'undefined') lucide.createIcons();
            this.updateAssignedCount(templateId);
        }
    }

    renderUserBadges(templateId) {
        if (this.allUsers.length === 0) return '<div class="no-users">Khong co nhan vien nao</div>';

        return this.allUsers.map(user => {
            const isAssigned = user.roleTemplate === templateId;
            return `<button class="user-badge ${isAssigned ? 'assigned' : ''}" data-user-id="${user.id}" data-assigned="${isAssigned}" onclick="templateManager.toggleUserAssignment('${user.id}', '${templateId}')" title="${user.displayName} (${user.id})">${user.displayName || user.id}</button>`;
        }).join('');
    }

    async toggleUserAssignment(userId, templateId) {
        const user = this.allUsers.find(u => u.id === userId);
        if (!user) return;

        const isCurrentlyAssigned = user.roleTemplate === templateId;
        const badge = document.querySelector(`.user-badge[data-user-id="${userId}"]`);

        if (badge) { badge.classList.add('loading'); badge.disabled = true; }

        try {
            if (isCurrentlyAssigned) {
                await UserAPI.fetch(`/${userId}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        displayName: user.displayName,
                        identifier: user.identifier,
                        roleTemplate: 'custom',
                        isAdmin: user.isAdmin,
                        detailedPermissions: user.detailedPermissions
                    })
                });
                user.roleTemplate = 'custom';
                if (badge) { badge.classList.remove('assigned'); badge.dataset.assigned = 'false'; }
                if (window.notify) window.notify.info(`Da bo gan "${user.displayName}" khoi template`);
            } else {
                const permissions = this.getTemplatePermissions(templateId);
                await UserAPI.fetch(`/${userId}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        displayName: user.displayName,
                        identifier: user.identifier,
                        roleTemplate: templateId,
                        isAdmin: user.isAdmin,
                        detailedPermissions: permissions
                    })
                });
                user.roleTemplate = templateId;
                user.detailedPermissions = permissions;
                if (badge) { badge.classList.add('assigned'); badge.dataset.assigned = 'true'; }
                if (window.notify) window.notify.success(`Da gan "${user.displayName}" vao template "${this.templates[templateId]?.name || templateId}"`);
            }

            this.updateAssignedCount(templateId);
        } catch (error) {
            console.error('[TemplateManager] Error toggling user assignment:', error);
            if (window.notify) window.notify.error('Loi cap nhat: ' + error.message);
        } finally {
            if (badge) { badge.classList.remove('loading'); badge.disabled = false; }
        }
    }

    updateAssignedCount(templateId) {
        const count = this.allUsers.filter(u => u.roleTemplate === templateId).length;
        const countEl = document.getElementById('assignedCount');
        if (countEl) countEl.textContent = count;
    }

    closeUserAssignment() {
        this.selectedTemplateId = null;
        const panel = document.getElementById('userAssignmentPanel');
        if (panel) panel.remove();
        document.querySelectorAll('.template-card').forEach(card => card.classList.remove('active'));
    }

    refreshAllTemplateButtons() {
        if (window.editDetailedPermUI?.refreshTemplateButtons) window.editDetailedPermUI.refreshTemplateButtons();
        if (window.newDetailedPermUI?.refreshTemplateButtons) window.newDetailedPermUI.refreshTemplateButtons();
    }

    updateGlobalTemplates() {
        if (typeof window.PERMISSION_TEMPLATES !== 'undefined') {
            Object.entries(this.templates).forEach(([id, template]) => {
                window.PERMISSION_TEMPLATES[id] = {
                    id, name: template.name, icon: template.icon,
                    description: template.description, color: template.color,
                    isSystemDefault: template.isSystemDefault,
                    detailedPermissions: template.detailedPermissions
                };
            });
        }
    }

    get customTemplates() { return this.templates; }
    get builtInTemplates() { return this.templates; }
    get allTemplates() { return this.templates; }
}

const templateManager = new TemplateManager();
window.templateManager = templateManager;

document.addEventListener('DOMContentLoaded', () => {
    templateManager.init();
});

// CSS STYLES (same as before)
const templateManagerStyle = document.createElement('style');
templateManagerStyle.textContent = `
.templates-section { margin-bottom: 24px; }
.templates-section .section-title { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 600; color: var(--text-primary, #111827); margin: 0 0 8px 0; }
.templates-section .section-title i { width: 20px; height: 20px; color: var(--accent-color, #6366f1); }
.templates-section .section-desc { color: var(--text-tertiary, #6b7280); font-size: 13px; margin: 0 0 16px 0; }
.templates-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.template-card { background: white; border: 1px solid var(--border-color, #e5e7eb); border-radius: 12px; overflow: hidden; transition: all 0.2s; }
.template-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-color: var(--template-color, var(--accent-color, #6366f1)); }
.template-card-header { display: flex; gap: 14px; padding: 16px; background: linear-gradient(135deg, color-mix(in srgb, var(--template-color) 8%, white), white); border-bottom: 1px solid var(--border-color, #e5e7eb); }
.template-icon { width: 48px; height: 48px; background: var(--template-color, #6366f1); border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.template-icon i { width: 24px; height: 24px; color: white; }
.template-info { flex: 1; min-width: 0; }
.template-name { font-size: 15px; font-weight: 600; color: var(--text-primary, #111827); margin: 0 0 4px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.template-desc { font-size: 12px; color: var(--text-tertiary, #6b7280); margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.template-card-body { padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; }
.template-stats { display: flex; gap: 16px; }
.template-stats .stat { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-secondary, #374151); }
.template-stats .stat i { width: 14px; height: 14px; color: var(--text-tertiary, #6b7280); }
.template-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 500; }
.template-badge i { width: 12px; height: 12px; }
.template-badge.custom { background: #eff6ff; color: #3b82f6; }
.template-badge.admin { background: #fef2f2; color: #dc2626; }
.template-card-actions .btn-sm { padding: 6px 12px; font-size: 12px; }
.template-card-actions .btn-success { background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; }
.template-card-actions .btn-success:hover { background: linear-gradient(135deg, #059669, #047857); box-shadow: 0 2px 8px rgba(16,185,129,0.4); }
.template-card.active { border: 2px solid var(--accent-color, #6366f1); box-shadow: 0 4px 20px rgba(99,102,241,0.25); }
.modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
.modal-content { background: white; border-radius: 16px; max-width: 900px; width: 100%; max-height: 90vh; overflow: hidden; display: flex; flex-direction: column; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid var(--border-color, #e5e7eb); }
.modal-header h3 { display: flex; align-items: center; gap: 10px; margin: 0; font-size: 18px; }
.modal-header h3 i { width: 24px; height: 24px; color: var(--accent-color, #6366f1); }
.modal-notice { display: flex; align-items: center; gap: 12px; padding: 14px 24px; background: #eff6ff; border-bottom: 1px solid #bfdbfe; color: #1e40af; font-size: 13px; }
.modal-notice i { width: 18px; height: 18px; flex-shrink: 0; }
.btn-close { width: 36px; height: 36px; background: transparent; border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--text-secondary, #374151); transition: all 0.2s; }
.btn-close:hover { background: var(--bg-secondary, #f3f4f6); }
.modal-body { padding: 24px; overflow-y: auto; flex: 1; }
.modal-footer { display: flex; justify-content: flex-end; gap: 12px; padding: 16px 24px; border-top: 1px solid var(--border-color, #e5e7eb); background: var(--bg-secondary, #f9fafb); }
.icon-picker, .color-picker { display: flex; flex-wrap: wrap; gap: 8px; }
.icon-option { width: 40px; height: 40px; border: 2px solid var(--border-color, #e5e7eb); background: white; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
.icon-option:hover { border-color: var(--accent-color, #6366f1); }
.icon-option.selected { border-color: var(--accent-color, #6366f1); background: var(--accent-color, #6366f1); color: white; }
.icon-option i { width: 18px; height: 18px; }
.color-option { width: 32px; height: 32px; border: 3px solid transparent; border-radius: 50%; cursor: pointer; transition: all 0.2s; }
.color-option:hover { transform: scale(1.1); }
.color-option.selected { border-color: var(--text-primary, #111827); box-shadow: 0 0 0 2px white, 0 0 0 4px var(--text-primary, #111827); }
.template-permissions-editor { background: var(--bg-secondary, #f9fafb); border-radius: 12px; padding: 16px; max-height: 400px; overflow-y: auto; }
.user-assignment-panel { background: linear-gradient(135deg, #f8fafc, #f1f5f9); border: 2px solid var(--accent-color, #6366f1); border-radius: 16px; padding: 24px; margin-top: 24px; animation: slideDown 0.3s ease-out; }
@keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
.assignment-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.assignment-title { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 600; }
.assignment-title i { width: 22px; height: 22px; color: var(--accent-color, #6366f1); }
.btn-close-panel { width: 32px; height: 32px; background: white; border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
.btn-close-panel:hover { background: #fef2f2; border-color: #fecaca; color: #dc2626; }
.assignment-desc { color: var(--text-secondary, #6b7280); font-size: 13px; margin: 0 0 12px 0; }
.assignment-stats { display: inline-flex; align-items: center; gap: 6px; background: white; padding: 8px 16px; border-radius: 20px; font-size: 13px; color: var(--text-secondary, #6b7280); margin-bottom: 16px; border: 1px solid var(--border-color, #e5e7eb); }
.assignment-stats span { font-weight: 700; color: var(--accent-color, #6366f1); }
.user-badges-container { display: flex; flex-wrap: wrap; gap: 8px; padding: 16px; background: white; border-radius: 12px; border: 1px solid var(--border-color, #e5e7eb); max-height: 300px; overflow-y: auto; }
.no-users { width: 100%; text-align: center; color: var(--text-tertiary, #9ca3af); padding: 20px; }
.user-badge { display: inline-flex; align-items: center; padding: 8px 16px; background: white; border: 2px solid var(--border-color, #e5e7eb); border-radius: 25px; font-size: 13px; font-weight: 500; color: var(--text-secondary, #6b7280); cursor: pointer; transition: all 0.2s ease; white-space: nowrap; }
.user-badge:hover { border-color: var(--accent-color, #6366f1); color: var(--accent-color, #6366f1); transform: translateY(-1px); }
.user-badge.assigned { background: linear-gradient(135deg, #10b981, #059669); border-color: #059669; color: white; box-shadow: 0 2px 8px rgba(16,185,129,0.3); }
.user-badge.assigned:hover { background: linear-gradient(135deg, #ef4444, #dc2626); border-color: #dc2626; }
.user-badge.loading { opacity: 0.6; pointer-events: none; }
.user-badge.loading::after { content: ''; width: 12px; height: 12px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; margin-left: 8px; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 768px) { .templates-grid { grid-template-columns: 1fr; } .modal-content { max-width: 100%; margin: 10px; } .user-assignment-panel { padding: 16px; } .user-badge { padding: 6px 12px; font-size: 12px; } }
`;
document.head.appendChild(templateManagerStyle);
