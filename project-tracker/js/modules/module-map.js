// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Module Map Tab - Mermaid.js dependency graph
 */

export class ModuleMap {
    constructor(store, container) {
        this.store = store;
        this.container = container;
    }

    render() {
        const modules = this.store.getModules();

        this.container.innerHTML = `
            <!-- Controls -->
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-sm font-semibold text-slate-700">Sơ đồ quan hệ giữa các Module</h3>
                <div class="flex items-center gap-2">
                    <button id="mm-refresh" class="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200 transition-colors border border-slate-200 flex items-center gap-1">
                        <span class="material-symbols-outlined text-[16px]">refresh</span>
                        Làm mới
                    </button>
                    <button id="mm-bp-view" class="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-xs font-medium hover:bg-purple-200 transition-colors border border-purple-200 flex items-center gap-1">
                        <span class="material-symbols-outlined text-[16px]">account_tree</span>
                        Theo Quy Trình
                    </button>
                </div>
            </div>

            <!-- Mermaid Container -->
            <div class="mermaid-container" id="mermaid-graph">
                ${modules.length > 0 ? '' : `
                    <div class="empty-state">
                        <span class="material-symbols-outlined">hub</span>
                        <p class="text-lg font-medium">Chưa có dữ liệu module</p>
                        <p class="text-sm mt-1">Đồng bộ từ MD để tạo sơ đồ</p>
                    </div>
                `}
            </div>

            <!-- Legend -->
            <div class="mt-4 bg-white rounded-xl border border-slate-200 p-4">
                <h4 class="text-xs font-semibold text-slate-500 uppercase mb-2">Chú thích</h4>
                <div class="flex flex-wrap gap-4 text-xs">
                    <div class="flex items-center gap-1.5">
                        <div class="w-3 h-3 rounded-full bg-green-500"></div>
                        <span class="text-slate-600">Done (≥90%)</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <div class="w-3 h-3 rounded-full bg-amber-500"></div>
                        <span class="text-slate-600">In Progress</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <div class="w-3 h-3 rounded-full bg-blue-500"></div>
                        <span class="text-slate-600">Planned</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <div class="w-3 h-3 rounded-full bg-red-500"></div>
                        <span class="text-slate-600">Blocked</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <span class="text-slate-400">→</span>
                        <span class="text-slate-600">Phụ thuộc</span>
                    </div>
                </div>
            </div>
        `;

        if (modules.length > 0) {
            this._renderMermaid(modules);
        }
        this._bindEvents();
    }

    _renderMermaid(modules) {
        const graphDef = this._buildGraph(modules);
        const container = this.container.querySelector('#mermaid-graph');
        if (!container) return;

        container.innerHTML = `<pre class="mermaid">${graphDef}</pre>`;

        if (typeof mermaid !== 'undefined') {
            try {
                mermaid.initialize({
                    startOnLoad: false,
                    theme: 'default',
                    flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
                    securityLevel: 'loose'
                });
                mermaid.run({ nodes: container.querySelectorAll('.mermaid') });
            } catch (err) {
                console.warn('Mermaid render error:', err);
                container.innerHTML = `<pre class="text-xs text-slate-500 whitespace-pre-wrap p-4">${this._escapeHtml(graphDef)}</pre>`;
            }
        } else {
            container.innerHTML = `<pre class="text-xs text-slate-500 whitespace-pre-wrap p-4">${this._escapeHtml(graphDef)}</pre>`;
        }
    }

    _buildGraph(modules) {
        const catColors = {
            sales: '#7c3aed', warehouse: '#3b82f6', admin: '#64748b', system: '#6b7280',
            live: '#ec4899', customer: '#06b6d4', finance: '#16a34a', returns: '#f97316',
            integration: '#6366f1', auth: '#14b8a6', report: '#f59e0b', other: '#94a3b8'
        };

        let graph = 'graph TD\n';

        // Group modules by category using subgraphs
        const groups = {};
        modules.forEach(m => {
            const cat = m.category || 'other';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(m);
        });

        const catLabels = {
            sales: 'Bán Hàng', warehouse: 'Kho & Nhập Hàng', report: 'Báo Cáo',
            admin: 'Quản Trị', system: 'Hệ Thống', live: 'Live', customer: 'Khách Hàng',
            finance: 'Tài Chính', returns: 'Hàng Hoàn & CSKH', integration: 'Tích Hợp',
            auth: 'Xác Thực', other: 'Khác'
        };

        for (const [cat, mods] of Object.entries(groups)) {
            const label = catLabels[cat] || cat;
            graph += `    subgraph ${this._sanitizeId(cat)}["${label}"]\n`;
            mods.forEach(m => {
                const shape = this._getNodeShape(m);
                graph += `        ${this._sanitizeId(m.id)}${shape}\n`;
            });
            graph += `    end\n`;
        }

        // Add dependency edges
        modules.forEach(m => {
            if (m.dependencies && Array.isArray(m.dependencies)) {
                m.dependencies.forEach(dep => {
                    const depMod = modules.find(x => x.id === dep);
                    if (depMod) {
                        graph += `    ${this._sanitizeId(dep)} --> ${this._sanitizeId(m.id)}\n`;
                    }
                });
            }
        });

        // Add styles
        modules.forEach(m => {
            const pct = m.completionPercent || 0;
            let color;
            if (m.status === 'blocked') color = '#ef4444';
            else if (pct >= 90) color = '#22c55e';
            else if (pct >= 50) color = '#f59e0b';
            else color = '#3b82f6';
            graph += `    style ${this._sanitizeId(m.id)} fill:${color}20,stroke:${color},color:#334155\n`;
        });

        return graph;
    }

    _getNodeShape(mod) {
        const name = (mod.name || mod.id).replace(/"/g, "'");
        const pct = mod.completionPercent || 0;
        return `["${name} (${pct}%)"]`;
    }

    _sanitizeId(id) {
        return (id || 'unknown').replace(/[^a-zA-Z0-9_]/g, '_');
    }

    _renderBPView(modules) {
        const bpFlow = `graph TD
    BP1["BP1: Nhập hàng & Làm mã"] --> BP2["BP2: Live Sale"]
    BP2 --> BP3["BP3: Trả hàng theo phiếu"]
    BP3 --> BP4["BP4: Chốt đơn"]
    BP4 --> BP5["BP5: Đi chợ & Đối soát"]
    BP5 --> BP6["BP6: Đóng đơn & Giao ship"]
    BP6 --> BP7["BP7: CSKH"]
    BP7 --> BP8["BP8: Check IB"]
    BP8 --> BP1

    style BP1 fill:#dbeafe,stroke:#3b82f6,color:#1e40af
    style BP2 fill:#fce7f3,stroke:#ec4899,color:#9d174d
    style BP3 fill:#fed7aa,stroke:#f97316,color:#9a3412
    style BP4 fill:#ede9fe,stroke:#7c3aed,color:#5b21b6
    style BP5 fill:#d1fae5,stroke:#16a34a,color:#166534
    style BP6 fill:#e0e7ff,stroke:#6366f1,color:#3730a3
    style BP7 fill:#fef3c7,stroke:#f59e0b,color:#92400e
    style BP8 fill:#ccfbf1,stroke:#14b8a6,color:#115e59`;

        const container = this.container.querySelector('#mermaid-graph');
        container.innerHTML = `<pre class="mermaid">${bpFlow}</pre>`;

        if (typeof mermaid !== 'undefined') {
            try {
                mermaid.run({ nodes: container.querySelectorAll('.mermaid') });
            } catch (err) {
                container.innerHTML = `<pre class="text-xs text-slate-500 whitespace-pre-wrap p-4">${this._escapeHtml(bpFlow)}</pre>`;
            }
        }
    }

    _bindEvents() {
        const refreshBtn = this.container.querySelector('#mm-refresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.render());
        }

        const bpBtn = this.container.querySelector('#mm-bp-view');
        if (bpBtn) {
            bpBtn.addEventListener('click', () => {
                const modules = this.store.getModules();
                this._renderBPView(modules);
            });
        }
    }

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
