/**
 * Dashboard Tab - Overview with stats cards and module progress
 */

export class Dashboard {
    constructor(store, container) {
        this.store = store;
        this.container = container;
    }

    render() {
        const stats = this.store.getStats();
        const modules = this.store.getModules().sort((a, b) => (a.order || 0) - (b.order || 0));
        const features = this.store.getFeatures();

        const totalCompletion = modules.length > 0
            ? Math.round(modules.reduce((sum, m) => sum + (m.completionPercent || 0), 0) / modules.length)
            : 0;

        const categoryGroups = {};
        modules.forEach(m => {
            const cat = m.category || 'other';
            if (!categoryGroups[cat]) categoryGroups[cat] = [];
            categoryGroups[cat].push(m);
        });

        this.container.innerHTML = `
            <!-- Stats Cards -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
                <div class="stat-card">
                    <div class="stat-value text-purple-600">${stats.modules}</div>
                    <div class="stat-label">Modules</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value text-green-600">${stats.completedFeatures}</div>
                    <div class="stat-label">Features hoàn thành</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value text-blue-600">${stats.totalTasks}</div>
                    <div class="stat-label">Tổng Tasks</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value text-amber-600">${stats.inProgressTasks}</div>
                    <div class="stat-label">Đang làm</div>
                </div>
            </div>

            <!-- Overall Progress -->
            <div class="bg-white rounded-xl border border-slate-200 p-4 mb-6">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-sm font-semibold text-slate-700">Tiến độ tổng thể</span>
                    <span class="text-sm font-bold text-purple-600">${totalCompletion}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill bg-purple-500" style="width: ${totalCompletion}%"></div>
                </div>
            </div>

            <!-- Module List by Category -->
            <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div class="px-4 py-3 border-b border-slate-100">
                    <h3 class="text-sm font-semibold text-slate-700">Modules theo nhóm</h3>
                </div>
                ${this._renderModulesByCategory(categoryGroups, features)}
            </div>

            ${modules.length === 0 ? `
                <div class="empty-state mt-8">
                    <span class="material-symbols-outlined">sync</span>
                    <p class="text-lg font-medium">Chưa có dữ liệu</p>
                    <p class="text-sm mt-1">Bấm "Đồng bộ từ MD" để tải dữ liệu từ file PROJECT-TRACKER.md</p>
                </div>
            ` : ''}
        `;
    }

    _renderModulesByCategory(groups, features) {
        const catLabels = {
            sales: 'Bán Hàng', warehouse: 'Kho & Nhập Hàng', report: 'Báo Cáo',
            admin: 'Quản Trị', system: 'Hệ Thống', live: 'Live', customer: 'Khách Hàng',
            finance: 'Tài Chính', returns: 'Hàng Hoàn & CSKH', integration: 'Tích Hợp',
            auth: 'Xác Thực', other: 'Khác'
        };
        const catColors = {
            sales: 'purple', warehouse: 'blue', admin: 'slate', system: 'gray',
            live: 'pink', customer: 'cyan', finance: 'green', returns: 'orange',
            integration: 'indigo', auth: 'teal', report: 'amber', other: 'slate'
        };

        let html = '';
        for (const [cat, mods] of Object.entries(groups)) {
            html += `<div class="category-header">${catLabels[cat] || cat}</div>`;
            mods.forEach(m => {
                const pct = m.completionPercent || 0;
                const modFeatures = features.filter(f => f.moduleId === m.id && !f.parentFeatureId);
                const doneCount = modFeatures.filter(f => f.status === 'done').length;
                const color = catColors[cat] || 'slate';
                const statusClass = `badge-${m.status || 'planned'}`;

                html += `
                    <div class="module-row">
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2">
                                <span class="font-medium text-sm text-slate-800 truncate">${m.name || m.id}</span>
                                <span class="badge ${statusClass}">${m.status || 'planned'}</span>
                            </div>
                            <div class="text-xs text-slate-400 mt-0.5">${m.id}/ — ${doneCount}/${modFeatures.length} features</div>
                        </div>
                        <div class="flex items-center gap-3 flex-shrink-0">
                            <span class="text-xs font-semibold text-${color}-600">${pct}%</span>
                            <div class="progress-bar w-20">
                                <div class="progress-fill bg-${color}-500" style="width: ${pct}%"></div>
                            </div>
                        </div>
                    </div>
                `;
            });
        }
        return html || '<div class="p-4 text-sm text-slate-400">Không có modules</div>';
    }
}
