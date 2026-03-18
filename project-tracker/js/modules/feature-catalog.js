/**
 * Feature Catalog Tab - Hierarchical feature tree with filters and inline editing
 */

export class FeatureCatalog {
    constructor(store, container) {
        this.store = store;
        this.container = container;
        this.filters = { module: '', status: '', priority: '', search: '' };
        this.collapsed = new Set();
    }

    render() {
        const modules = this.store.getModules().sort((a, b) => (a.order || 0) - (b.order || 0));
        const features = this.store.getFeatures();

        this.container.innerHTML = `
            <!-- Filter Bar -->
            <div class="filter-bar mb-4">
                <select id="fc-filter-module" class="flex-1 min-w-[120px]">
                    <option value="">Tất cả modules</option>
                    ${modules.map(m => `<option value="${m.id}" ${this.filters.module === m.id ? 'selected' : ''}>${m.name || m.id}</option>`).join('')}
                </select>
                <select id="fc-filter-status">
                    <option value="">Tất cả status</option>
                    <option value="done" ${this.filters.status === 'done' ? 'selected' : ''}>Done</option>
                    <option value="in-progress" ${this.filters.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
                    <option value="planned" ${this.filters.status === 'planned' ? 'selected' : ''}>Planned</option>
                    <option value="blocked" ${this.filters.status === 'blocked' ? 'selected' : ''}>Blocked</option>
                </select>
                <select id="fc-filter-priority">
                    <option value="">Tất cả priority</option>
                    <option value="high" ${this.filters.priority === 'high' ? 'selected' : ''}>High</option>
                    <option value="medium" ${this.filters.priority === 'medium' ? 'selected' : ''}>Medium</option>
                    <option value="low" ${this.filters.priority === 'low' ? 'selected' : ''}>Low</option>
                </select>
                <input type="text" id="fc-filter-search" placeholder="Tìm kiếm tính năng..."
                    value="${this.escapeAttr(this.filters.search)}" class="flex-1 min-w-[150px]">
            </div>

            <!-- Feature Count -->
            <div class="text-xs text-slate-400 mb-3">
                ${this._getFilteredCount(modules, features)} tính năng
            </div>

            <!-- Feature Tree -->
            <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
                ${this._renderTree(modules, features)}
            </div>

            ${features.length === 0 ? `
                <div class="empty-state mt-8">
                    <span class="material-symbols-outlined">category</span>
                    <p class="text-lg font-medium">Chưa có tính năng</p>
                    <p class="text-sm mt-1">Đồng bộ từ MD để tải danh mục tính năng</p>
                </div>
            ` : ''}
        `;

        this._bindEvents();
    }

    _getFilteredCount(modules, features) {
        const filtered = this._applyFilters(features, modules);
        return `${filtered.length} / ${features.length}`;
    }

    _applyFilters(features, modules) {
        let result = [...features];
        if (this.filters.module) {
            result = result.filter(f => f.moduleId === this.filters.module);
        }
        if (this.filters.status) {
            result = result.filter(f => f.status === this.filters.status);
        }
        if (this.filters.priority) {
            result = result.filter(f => f.priority === this.filters.priority);
        }
        if (this.filters.search) {
            const q = this.filters.search.toLowerCase();
            result = result.filter(f => (f.name || '').toLowerCase().includes(q) || (f.id || '').toLowerCase().includes(q));
        }
        return result;
    }

    _renderTree(modules, allFeatures) {
        const filteredModules = this.filters.module
            ? modules.filter(m => m.id === this.filters.module)
            : modules;

        if (filteredModules.length === 0) {
            return '<div class="p-4 text-sm text-slate-400">Không có module phù hợp</div>';
        }

        let html = '';
        filteredModules.forEach(mod => {
            const modFeatures = allFeatures.filter(f => f.moduleId === mod.id);
            const filtered = this._applyFilters(modFeatures, modules);
            if (this.filters.search || this.filters.status || this.filters.priority) {
                if (filtered.length === 0) return;
            }

            const isCollapsed = this.collapsed.has(mod.id);
            const pct = mod.completionPercent || 0;
            const doneCount = modFeatures.filter(f => f.status === 'done').length;
            const statusClass = `badge-${mod.status || 'planned'}`;

            html += `
                <div class="tree-node depth-0">
                    <div class="accordion-header tree-toggle ${isCollapsed ? 'collapsed' : ''}" data-module="${mod.id}">
                        <div class="flex items-center gap-2 min-w-0">
                            <span class="material-symbols-outlined text-slate-400">expand_more</span>
                            <span class="font-semibold text-sm text-slate-800 truncate">${mod.name || mod.id}</span>
                            <span class="badge ${statusClass}">${mod.status || 'planned'}</span>
                            <span class="text-xs text-slate-400">${doneCount}/${modFeatures.length}</span>
                        </div>
                        <span class="text-xs font-semibold text-purple-600">${pct}%</span>
                    </div>
                    <div class="accordion-content ${isCollapsed ? 'collapsed' : ''}" data-module-content="${mod.id}">
                        ${this._renderFeatureList(filtered, 1)}
                    </div>
                </div>
            `;
        });

        return html || '<div class="p-4 text-sm text-slate-400">Không có kết quả</div>';
    }

    _renderFeatureList(features, depth) {
        if (features.length === 0) {
            return '<div class="px-4 py-2 text-xs text-slate-300">Không có tính năng</div>';
        }

        // Group: top-level features (no parent), then sub-features
        const topLevel = features.filter(f => !f.parentFeatureId);
        const byParent = {};
        features.forEach(f => {
            if (f.parentFeatureId) {
                if (!byParent[f.parentFeatureId]) byParent[f.parentFeatureId] = [];
                byParent[f.parentFeatureId].push(f);
            }
        });

        let html = '';
        topLevel.forEach(f => {
            html += this._renderFeatureItem(f, depth, byParent);
        });
        return html;
    }

    _renderFeatureItem(feature, depth, childMap) {
        const children = childMap[feature.id] || [];
        const hasChildren = children.length > 0;
        const isCollapsed = this.collapsed.has(feature.id);
        const statusIcon = this._statusIcon(feature.status);
        const priorityClass = feature.priority ? `priority-${feature.priority}` : '';

        let html = `
            <div class="tree-node depth-${depth}">
                <div class="flex items-center gap-2 py-1.5 px-2 hover:bg-slate-50 rounded group">
                    ${hasChildren ? `
                        <span class="material-symbols-outlined text-slate-300 text-[16px] cursor-pointer tree-toggle ${isCollapsed ? 'collapsed' : ''}"
                              data-feature="${feature.id}">expand_more</span>
                    ` : '<span class="w-4"></span>'}
                    <span class="inline-edit-status cursor-pointer" data-feature-id="${feature.id}" data-status="${feature.status || 'planned'}" title="Click để đổi status">
                        ${statusIcon}
                    </span>
                    <span class="text-sm text-slate-700 flex-1 min-w-0 truncate">${feature.name || feature.id}</span>
                    ${feature.priority ? `<span class="text-[10px] font-semibold ${priorityClass} uppercase">${feature.priority}</span>` : ''}
                    ${feature.autoChecked ? '<span class="text-[10px] text-purple-500 font-medium">AUTO</span>' : ''}
                </div>
        `;

        if (hasChildren && !isCollapsed) {
            children.forEach(child => {
                html += this._renderFeatureItem(child, depth + 1, {});
            });
        }

        html += '</div>';
        return html;
    }

    _statusIcon(status) {
        const icons = {
            'done': '<span class="material-symbols-outlined text-green-500 text-[18px]">check_circle</span>',
            'in-progress': '<span class="material-symbols-outlined text-amber-500 text-[18px]">pending</span>',
            'planned': '<span class="material-symbols-outlined text-slate-300 text-[18px]">radio_button_unchecked</span>',
            'blocked': '<span class="material-symbols-outlined text-red-500 text-[18px]">block</span>',
        };
        return icons[status] || icons['planned'];
    }

    _bindEvents() {
        // Filters
        ['module', 'status', 'priority'].forEach(key => {
            const el = this.container.querySelector(`#fc-filter-${key}`);
            if (el) el.addEventListener('change', () => { this.filters[key] = el.value; this.render(); });
        });

        const searchEl = this.container.querySelector('#fc-filter-search');
        if (searchEl) {
            let timer;
            searchEl.addEventListener('input', () => {
                clearTimeout(timer);
                timer = setTimeout(() => { this.filters.search = searchEl.value; this.render(); }, 300);
            });
        }

        // Toggle collapse - module level
        this.container.querySelectorAll('.accordion-header.tree-toggle').forEach(el => {
            el.addEventListener('click', () => {
                const id = el.dataset.module;
                if (this.collapsed.has(id)) this.collapsed.delete(id); else this.collapsed.add(id);
                this.render();
            });
        });

        // Toggle collapse - feature level
        this.container.querySelectorAll('span.tree-toggle[data-feature]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = el.dataset.feature;
                if (this.collapsed.has(id)) this.collapsed.delete(id); else this.collapsed.add(id);
                this.render();
            });
        });

        // Inline status edit
        this.container.querySelectorAll('.inline-edit-status').forEach(el => {
            el.addEventListener('click', () => {
                const featureId = el.dataset.featureId;
                const currentStatus = el.dataset.status;
                const next = this._nextStatus(currentStatus);
                this._updateFeatureStatus(featureId, next);
            });
        });
    }

    _nextStatus(current) {
        const cycle = ['planned', 'in-progress', 'done', 'blocked', 'planned'];
        const idx = cycle.indexOf(current);
        return cycle[(idx + 1) % (cycle.length - 1)];
    }

    async _updateFeatureStatus(featureId, newStatus) {
        const features = this.store.getFeatures();
        const feat = features.find(f => f.id === featureId);
        if (!feat) return;
        feat.status = newStatus;
        await this.store.saveFeature(feat);
        this.render();
    }

    escapeAttr(str) {
        return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
}
