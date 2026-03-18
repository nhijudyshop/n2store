/**
 * Project Tracker - Main Entry Point
 * Initializes tabs, Firebase, and module instances
 */

import { ProjectStore } from './stores/project-store.js';
import { Dashboard } from './modules/dashboard.js';
import { FeatureCatalog } from './modules/feature-catalog.js';
import { TodoSystem } from './modules/todo-system.js';
import { ModuleMap } from './modules/module-map.js';
import { MdParser } from './utils/md-parser.js';
import { MdSerializer } from './utils/md-serializer.js';

class ProjectTracker {
    constructor() {
        this.store = new ProjectStore();
        this.modules = {};
        this.activeTab = 'dashboard';
    }

    async init() {
        // Create modules immediately so UI renders even before data loads
        this.modules = {
            dashboard: new Dashboard(this.store, document.getElementById('tab-dashboard')),
            featureCatalog: new FeatureCatalog(this.store, document.getElementById('tab-feature-catalog')),
            todoSystem: new TodoSystem(this.store, document.getElementById('tab-todo-system')),
            moduleMap: new ModuleMap(this.store, document.getElementById('tab-module-map')),
        };

        this.setupTabs();
        this.setupSyncButtons();
        this.restoreTab();

        // Render empty state immediately
        this.renderActiveTab();

        // Then load data async (with timeout to prevent hanging)
        try {
            await this.store.init();
            // Re-render with loaded data
            this.renderActiveTab();
        } catch (err) {
            console.warn('Store init error (non-blocking):', err);
        }
    }

    setupTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                this.switchTab(tab);
            });
        });
    }

    switchTab(tab) {
        this.activeTab = tab;
        localStorage.setItem('project-tracker-tab', tab);

        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            const isActive = btn.dataset.tab === tab;
            btn.classList.toggle('active', isActive);
            btn.classList.toggle('border-purple-600', isActive);
            btn.classList.toggle('text-purple-700', isActive);
            btn.classList.toggle('border-transparent', !isActive);
            btn.classList.toggle('text-slate-500', !isActive);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(el => {
            el.classList.toggle('hidden', el.id !== `tab-${tab}`);
        });

        this.renderActiveTab();
    }

    restoreTab() {
        const saved = localStorage.getItem('project-tracker-tab');
        if (saved && document.querySelector(`[data-tab="${saved}"]`)) {
            this.switchTab(saved);
        }
    }

    renderActiveTab() {
        const map = {
            'dashboard': 'dashboard',
            'feature-catalog': 'featureCatalog',
            'todo-system': 'todoSystem',
            'module-map': 'moduleMap',
        };
        const mod = this.modules[map[this.activeTab]];
        if (mod && typeof mod.render === 'function') {
            mod.render();
        }
    }

    setupSyncButtons() {
        const btnSync = document.getElementById('btnSyncMd');
        const btnExport = document.getElementById('btnExportMd');

        if (btnSync) {
            btnSync.addEventListener('click', () => this.syncFromMd());
        }
        if (btnExport) {
            btnExport.addEventListener('click', () => this.exportToMd());
        }
    }

    async syncFromMd() {
        try {
            const resp = await fetch('../docs/PROJECT-TRACKER.md');
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const mdText = await resp.text();
            const data = MdParser.parse(mdText);
            await this.store.importFromParsed(data);
            this.renderActiveTab();
            this.showNotification('Đồng bộ từ MD thành công!', 'success');
        } catch (err) {
            console.error('Sync from MD failed:', err);
            this.showNotification('Lỗi đồng bộ: ' + err.message, 'error');
        }
    }

    exportToMd() {
        const data = this.store.getAllData();
        const mdText = MdSerializer.serialize(data);

        // Show modal with MD content
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-card">
                <div class="modal-header">
                    <h3 class="font-semibold text-lg">Xuất ra Markdown</h3>
                    <button class="modal-close text-slate-400 hover:text-slate-600">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div class="modal-body">
                    <textarea readonly id="mdExportContent">${this.escapeHtml(mdText)}</textarea>
                </div>
                <div class="modal-footer">
                    <button class="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200" id="btnCloseExport">Đóng</button>
                    <button class="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700" id="btnCopyMd">Copy to Clipboard</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
        overlay.querySelector('#btnCloseExport').addEventListener('click', () => overlay.remove());
        overlay.querySelector('#btnCopyMd').addEventListener('click', () => {
            navigator.clipboard.writeText(mdText).then(() => {
                this.showNotification('Đã copy vào clipboard!', 'success');
            });
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showNotification(message, type = 'info') {
        const colors = {
            success: 'bg-green-500',
            error: 'bg-red-500',
            info: 'bg-blue-500',
        };
        const toast = document.createElement('div');
        toast.className = `fixed bottom-4 right-4 ${colors[type] || colors.info} text-white px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium z-50 transition-opacity`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Init when DOM ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new ProjectTracker();
    app.init().catch(err => console.error('ProjectTracker init failed:', err));
});
