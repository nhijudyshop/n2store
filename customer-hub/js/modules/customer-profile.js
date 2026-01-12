// customer-hub/js/modules/customer-profile.js
import apiService from '../api-service.js';
import { PermissionHelper } from '../utils/permissions.js';
import { WalletPanelModule } from './wallet-panel.js';

export class CustomerProfileModule {
    constructor(containerId, permissionHelper) {
        this.container = document.getElementById(containerId);
        this.permissionHelper = permissionHelper;
        this.customerPhone = null;
        this.walletPanelModule = null;
        this.customerData = null;
    }

    initUI() {
        this.container.innerHTML = `
            <!-- Modal Header -->
            <header class="shrink-0 px-6 py-3 bg-surface-light dark:bg-surface-dark border-b border-border-light dark:border-border-dark">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <h1 id="modal-customer-name" class="text-lg font-bold text-slate-900 dark:text-white">Customer Profile: <span id="modal-name-value">Loading...</span></h1>
                        <span id="modal-customer-id" class="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium rounded-lg">ID: #000000</span>
                        <span class="text-slate-400">|</span>
                        <span id="modal-phone-display" class="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-1">
                            <span class="material-symbols-outlined text-base">call</span>
                            <span id="modal-phone-value"></span>
                        </span>
                        <span class="text-slate-400">|</span>
                        <span id="modal-address-display" class="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-1">
                            <span class="material-symbols-outlined text-base">location_on</span>
                            <span id="modal-address-value">Chưa có địa chỉ</span>
                        </span>
                    </div>
                    <div class="flex items-center gap-2">
                        <button id="audit-log-btn" class="inline-flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">
                            <span class="material-symbols-outlined text-lg">history</span>
                            Audit Log
                        </button>
                        <button id="reset-password-btn" class="inline-flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">
                            <span class="material-symbols-outlined text-lg">lock_reset</span>
                            Reset Password
                        </button>
                        <button onclick="window.closeCustomerModal()" class="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                            <span class="material-symbols-outlined text-2xl">close</span>
                        </button>
                    </div>
                </div>
            </header>

            <!-- Modal Body - Scrollable -->
            <div class="flex-1 overflow-y-auto p-6 bg-background-light dark:bg-background-dark" style="height: calc(100% - 60px);">
                <!-- Loading State -->
                <div id="modal-loader" class="flex flex-col items-center justify-center py-20">
                    <div class="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                        <span class="material-symbols-outlined text-primary text-3xl animate-spin">progress_activity</span>
                    </div>
                    <p class="text-slate-500 dark:text-slate-400 font-medium">Đang tải thông tin khách hàng...</p>
                </div>

                <!-- Content - Hidden until loaded -->
                <div id="modal-content-loaded" class="hidden" style="height: 100%;">
                    <!-- 3 Columns Layout - Side by Side -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; height: 100%;">
                        <!-- Column 1: Wallet Summary + Internal Notes -->
                        <div style="display: flex; flex-direction: column; gap: 20px; height: 100%;">
                            <!-- Wallet Summary Card -->
                            <div id="customer-wallet-panel" class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-sm">
                                <!-- Will be rendered by WalletPanelModule -->
                            </div>
                            <!-- Internal Notes Card -->
                            <div id="internal-notes-section" class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-sm overflow-hidden" style="flex: 1; display: flex; flex-direction: column;">
                                <!-- Will be rendered dynamically -->
                            </div>
                        </div>

                        <!-- Column 2: Recent Activities -->
                        <div id="recent-activities-card" class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-sm overflow-hidden" style="display: flex; flex-direction: column; height: 100%;">
                            <!-- Will be rendered dynamically -->
                        </div>

                        <!-- Column 3: RFM Analysis -->
                        <div id="rfm-analysis-card" class="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-sm overflow-hidden" style="height: 100%;">
                            <!-- Will be rendered dynamically -->
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.loader = this.container.querySelector('#modal-loader');
        this.contentLoaded = this.container.querySelector('#modal-content-loaded');
    }

    async render(phone) {
        this.customerPhone = phone;
        this.initUI();

        this.loader.classList.remove('hidden');
        this.contentLoaded.classList.add('hidden');

        try {
            const data = await apiService.getCustomer360(phone);
            // apiService.getCustomer360 returns result.data directly (already unwrapped)
            if (data && data.customer) {
                this.customerData = data;

                // Render all sections
                this._renderHeader(data.customer);
                this._renderRFMCard(data.customer);
                this._renderActivitiesCard(data.recentActivities || []);
                this._renderNotesSection(data.notes || []);

                // Initialize wallet panel module
                this.walletPanelModule = new WalletPanelModule('customer-wallet-panel', this.permissionHelper);
                this.walletPanelModule.render(phone);

                this.loader.classList.add('hidden');
                this.contentLoaded.classList.remove('hidden');
            } else {
                this._showError(`Không tìm thấy khách hàng với SĐT: ${phone}`);
            }
        } catch (error) {
            this._showError(`Lỗi khi tải thông tin: ${error.message}`);
            console.error('Lỗi tải hồ sơ khách hàng:', error);
        }
    }

    _showError(message) {
        this.loader.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20">
                <div class="w-14 h-14 rounded-full bg-danger/10 flex items-center justify-center mb-4">
                    <span class="material-symbols-outlined text-danger text-3xl">error</span>
                </div>
                <p class="text-danger font-medium mb-2">Không thể tải hồ sơ</p>
                <p class="text-sm text-slate-500 dark:text-slate-400">${message}</p>
                <button onclick="window.closeCustomerModal()" class="mt-6 px-5 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl text-sm font-medium transition-colors">
                    Đóng
                </button>
            </div>
        `;
    }

    _renderHeader(customer) {
        const nameEl = this.container.querySelector('#modal-name-value');
        const idEl = this.container.querySelector('#modal-customer-id');
        const phoneEl = this.container.querySelector('#modal-phone-value');
        const addressEl = this.container.querySelector('#modal-address-value');

        nameEl.textContent = customer.name || 'Unknown';
        idEl.textContent = `ID: #${customer.id || customer.phone?.replace(/\D/g, '').slice(-6) || '000000'}`;
        phoneEl.textContent = customer.phone;
        addressEl.textContent = customer.address || 'Chưa có địa chỉ';
    }

    _renderCustomerInfoCard(customer) {
        const container = this.container.querySelector('#customer-info-card');
        const initials = this._getInitials(customer.name);
        const avatarColor = this._getAvatarColor(customer.name);
        const statusBadge = this._getStatusBadge(customer.status);
        const tierBadge = this._getTierBadge(customer.tier);

        container.innerHTML = `
            <!-- Header with Avatar -->
            <div class="p-6 pb-0 flex items-start justify-between">
                <div class="w-16 h-16 rounded-full ${avatarColor.bg} flex items-center justify-center ${avatarColor.text} text-2xl font-bold border-2 border-white dark:border-slate-600 shadow-soft">
                    ${initials}
                </div>
                <div class="flex gap-2">
                    ${statusBadge}
                    ${tierBadge}
                </div>
            </div>

            <!-- Info Content -->
            <div class="p-6 flex flex-col gap-5">
                <div class="space-y-4">
                    <!-- Email -->
                    <div class="group">
                        <label class="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Email</label>
                        <div class="flex items-center justify-between">
                            <span class="text-sm font-medium text-slate-900 dark:text-white select-all">${customer.email || 'Chưa có email'}</span>
                            ${customer.email ? `
                                <button class="opacity-0 group-hover:opacity-100 text-primary transition-opacity" onclick="navigator.clipboard.writeText('${customer.email}')">
                                    <span class="material-symbols-outlined text-lg">content_copy</span>
                                </button>
                            ` : ''}
                        </div>
                    </div>

                    <!-- Address -->
                    <div class="group">
                        <label class="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Địa chỉ</label>
                        <span class="text-sm font-medium text-slate-900 dark:text-white block">${customer.address || 'Chưa có địa chỉ'}</span>
                    </div>

                    <!-- Tags -->
                    <div>
                        <label class="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Nhãn</label>
                        <div class="flex flex-wrap gap-2">
                            ${this._renderTags(customer.tags)}
                            <button class="w-7 h-7 flex items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-slate-400 hover:text-primary hover:border-primary transition-colors">
                                <span class="material-symbols-outlined text-base">add</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Action Buttons -->
                ${this.permissionHelper.hasPermission('customer-hub', 'editCustomer') || this.permissionHelper.hasPermission('customer-hub', 'addNote') ? `
                    <div class="mt-auto grid grid-cols-2 gap-3 pt-5 border-t border-border-light dark:border-border-dark">
                        ${this.permissionHelper.hasPermission('customer-hub', 'editCustomer') ? `
                            <button id="edit-customer-btn" class="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">
                                <span class="material-symbols-outlined text-lg">edit</span>
                                Sửa
                            </button>
                        ` : ''}
                        ${this.permissionHelper.hasPermission('customer-hub', 'addNote') ? `
                            <button id="add-note-shortcut-btn" class="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 border border-border-light dark:border-border-dark rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">
                                <span class="material-symbols-outlined text-lg">note_add</span>
                                Ghi chú
                            </button>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    }

    _renderRFMCard(customer) {
        const container = this.container.querySelector('#rfm-analysis-card');
        const rfm = customer.rfm || {};
        const score = rfm.score || 0;
        const recency = rfm.recency_days || 'N/A';
        const frequency = rfm.frequency || 0;
        const monetary = rfm.monetary || 0;
        const yoyChange = rfm.yoy_change || 12;

        // Calculate score percentage for the circular chart
        const scorePercent = (score / 5) * 100;
        const circumference = 2 * Math.PI * 45; // radius = 45
        const strokeDashoffset = circumference - (scorePercent / 100) * circumference;

        container.innerHTML = `
            <div class="p-5 h-full flex flex-col">
                <!-- Header -->
                <div class="flex items-center gap-2 mb-5">
                    <span class="material-symbols-outlined text-purple-500 text-xl">analytics</span>
                    <h3 class="text-base font-bold text-slate-900 dark:text-white">RFM Analysis</h3>
                </div>

                <!-- Overall Score with Circular Chart -->
                <div class="flex items-center gap-5 mb-6">
                    <div class="relative w-28 h-28 flex-shrink-0">
                        <svg class="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
                            <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="8" class="text-slate-100 dark:text-slate-700"></circle>
                            <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="8"
                                stroke-dasharray="${circumference}"
                                stroke-dashoffset="${strokeDashoffset}"
                                stroke-linecap="round"
                                class="text-purple-500 transition-all duration-500"></circle>
                        </svg>
                        <div class="absolute inset-0 flex flex-col items-center justify-center">
                            <span class="text-2xl font-bold text-slate-900 dark:text-white">${score.toFixed(1)}</span>
                            <span class="text-xs text-slate-400">/5</span>
                        </div>
                    </div>
                    <div>
                        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Overall Score</p>
                        <p class="text-sm text-slate-600 dark:text-slate-300">Customer value rating based on purchase behavior</p>
                    </div>
                </div>

                <!-- RFM Metrics Grid -->
                <div class="grid grid-cols-2 gap-3 mb-5">
                    <!-- Recency -->
                    <div class="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                        <div class="flex items-center gap-1.5 text-slate-500 mb-2">
                            <span class="material-symbols-outlined text-base">schedule</span>
                            <span class="text-xs font-bold uppercase">Recency</span>
                        </div>
                        <p class="text-xl font-bold text-slate-900 dark:text-white">${typeof recency === 'number' ? recency : recency} <span class="text-sm font-normal text-slate-400">${typeof recency === 'number' ? 'days' : ''}</span></p>
                    </div>

                    <!-- Frequency -->
                    <div class="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                        <div class="flex items-center gap-1.5 text-slate-500 mb-2">
                            <span class="material-symbols-outlined text-base">repeat</span>
                            <span class="text-xs font-bold uppercase">Frequency</span>
                        </div>
                        <p class="text-xl font-bold text-slate-900 dark:text-white">${frequency} <span class="text-sm font-normal text-slate-400">orders</span></p>
                    </div>
                </div>

                <!-- Monetary / LTV -->
                <div class="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800/30 mb-5">
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center gap-1.5 text-emerald-600">
                            <span class="material-symbols-outlined text-base">payments</span>
                            <span class="text-xs font-bold uppercase">Monetary / LTV</span>
                        </div>
                        <span class="px-2 py-0.5 rounded text-xs font-bold ${yoyChange >= 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400' : 'bg-red-100 text-red-700'}">${yoyChange >= 0 ? '+' : ''}${yoyChange}% YoY</span>
                    </div>
                    <p class="text-2xl font-bold text-emerald-600">${this.formatCurrency(monetary)}</p>
                </div>

                <!-- Spending Trend Chart (Simple SVG) -->
                <div class="flex-1 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                    <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Spending Trend</p>
                    <div class="h-20 flex items-end gap-1">
                        ${this._generateSpendingBars()}
                    </div>
                    <div class="flex justify-between mt-2 text-xs text-slate-400">
                        <span>Jan</span>
                        <span>Feb</span>
                        <span>Mar</span>
                        <span>Apr</span>
                        <span>May</span>
                        <span>Jun</span>
                    </div>
                </div>
            </div>
        `;
    }

    _generateSpendingBars() {
        // Generate random-ish bars for demo
        const heights = [40, 65, 45, 80, 55, 90];
        return heights.map((h, i) => `
            <div class="flex-1 bg-purple-${i === heights.length - 1 ? '500' : '200'} dark:bg-purple-${i === heights.length - 1 ? '500' : '700'} rounded-t transition-all" style="height: ${h}%"></div>
        `).join('');
    }

    _renderActivitiesCard(activities) {
        const container = this.container.querySelector('#recent-activities-card');

        let activitiesHtml = '';
        if (!activities || activities.length === 0) {
            activitiesHtml = `
                <div class="flex flex-col items-center justify-center py-10 text-slate-400">
                    <span class="material-symbols-outlined text-4xl mb-3">history</span>
                    <p class="text-sm font-medium">No recent activities</p>
                </div>
            `;
        } else {
            activitiesHtml = activities.slice(0, 8).map((activity, index) => {
                const iconInfo = this._getActivityIcon(activity.type || activity.event_type);
                const timeAgo = this._getTimeAgo(activity.created_at || activity.timestamp);

                return `
                    <div class="relative pl-9 ${index !== activities.slice(0, 8).length - 1 ? 'pb-5' : ''}">
                        <!-- Timeline Line -->
                        ${index !== activities.slice(0, 8).length - 1 ? `<div class="absolute left-[11px] top-6 bottom-0 w-px bg-slate-200 dark:bg-slate-700"></div>` : ''}

                        <!-- Icon -->
                        <div class="absolute left-0 top-0 w-6 h-6 rounded-full ${iconInfo.bgColor} flex items-center justify-center z-10">
                            <span class="material-symbols-outlined text-xs ${iconInfo.iconColor}">${iconInfo.icon}</span>
                        </div>

                        <!-- Content -->
                        <div class="flex justify-between items-start gap-2">
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-medium text-slate-900 dark:text-white truncate">${activity.title || activity.description || 'Activity'}</p>
                                ${activity.details ? `<p class="text-xs text-slate-500 mt-0.5 truncate">${activity.details}</p>` : ''}
                            </div>
                            <span class="text-xs text-slate-400 whitespace-nowrap flex-shrink-0">${timeAgo}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }

        container.innerHTML = `
            <!-- Header -->
            <div class="px-5 py-4 border-b border-border-light dark:border-border-dark flex items-center gap-2">
                <span class="material-symbols-outlined text-blue-500 text-xl">history</span>
                <h3 class="text-base font-bold text-slate-900 dark:text-white">Recent Activities</h3>
            </div>

            <!-- Timeline Content - Scrollable -->
            <div class="p-5 overflow-y-auto flex-1">
                ${activitiesHtml}
            </div>
        `;
    }

    _renderNotesSection(notes) {
        const container = this.container.querySelector('#internal-notes-section');

        let notesHtml = '';
        if (!notes || notes.length === 0) {
            notesHtml = `
                <div class="text-center py-8 text-slate-400">
                    <span class="material-symbols-outlined text-3xl mb-2">speaker_notes_off</span>
                    <p class="text-sm">No internal notes yet</p>
                </div>
            `;
        } else {
            notesHtml = notes.slice(0, 5).map(note => {
                const date = new Date(note.created_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                const initials = this._getInitials(note.created_by || 'System');

                return `
                    <div class="flex gap-3">
                        <div class="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 text-xs font-bold shrink-0">
                            ${initials}
                        </div>
                        <div class="flex-1 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                            <div class="flex justify-between items-baseline mb-1">
                                <span class="text-xs font-bold text-slate-700 dark:text-slate-300">${note.created_by || 'System'}</span>
                                <span class="text-xs text-slate-400">${date}</span>
                            </div>
                            <p class="text-sm text-slate-600 dark:text-slate-300">${note.content}</p>
                        </div>
                    </div>
                `;
            }).join('');
        }

        container.innerHTML = `
            <!-- Header -->
            <div class="px-5 py-4 border-b border-border-light dark:border-border-dark flex items-center gap-2">
                <span class="material-symbols-outlined text-amber-500 text-xl">speaker_notes</span>
                <h3 class="text-base font-bold text-slate-900 dark:text-white">Internal Notes</h3>
            </div>

            <!-- Notes List - Scrollable -->
            <div class="p-5 space-y-3 overflow-y-auto flex-1">
                ${notesHtml}
            </div>

            <!-- Add Note Input -->
            ${this.permissionHelper.hasPermission('customer-hub', 'addNote') ? `
                <div class="p-4 border-t border-border-light dark:border-border-dark bg-slate-50 dark:bg-slate-800/50">
                    <div class="flex gap-2">
                        <input type="text" id="new-note-input"
                            class="flex-1 rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary px-3 py-2 placeholder-slate-400"
                            placeholder="Add a note...">
                        <button id="add-note-btn" class="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg text-sm font-medium transition-colors">
                            Add
                        </button>
                    </div>
                </div>
            ` : ''}
        `;

        // Setup add note button
        if (this.permissionHelper.hasPermission('customer-hub', 'addNote')) {
            const addNoteBtn = container.querySelector('#add-note-btn');
            const noteInput = container.querySelector('#new-note-input');
            if (addNoteBtn && noteInput) {
                addNoteBtn.onclick = () => this._addCustomerNote(noteInput.value);
                noteInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this._addCustomerNote(noteInput.value);
                    }
                });
            }
        }
    }

    // Helper methods
    _getInitials(name) {
        if (!name) return '?';
        const parts = name.trim().split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }

    _getAvatarColor(name) {
        const colors = [
            { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-400' },
            { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400' },
            { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-600 dark:text-purple-400' },
            { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-400' },
            { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-600 dark:text-rose-400' },
            { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-600 dark:text-cyan-400' },
        ];
        const hash = (name || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return colors[hash % colors.length];
    }

    _getStatusBadge(status) {
        const statusLower = (status || 'active').toLowerCase();
        const statusMap = {
            'active': { bg: 'bg-success-light', text: 'text-success', label: 'Active' },
            'inactive': { bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-600 dark:text-slate-400', label: 'Inactive' },
            'pending': { bg: 'bg-warning-light', text: 'text-warning', label: 'Pending' },
            'blocked': { bg: 'bg-danger-light', text: 'text-danger', label: 'Blocked' },
        };
        const s = statusMap[statusLower] || statusMap['active'];
        return `<span class="inline-flex items-center px-2.5 py-1 rounded-lg ${s.bg} ${s.text} text-xs font-semibold">${s.label}</span>`;
    }

    _getTierBadge(tier) {
        const tierLower = (tier || 'new').toLowerCase();
        const tierMap = {
            'gold': { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', label: 'Gold', icon: 'star' },
            'silver': { bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-600 dark:text-slate-300', label: 'Silver', icon: 'star_half' },
            'bronze': { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400', label: 'Bronze', icon: 'star_outline' },
            'platinum': { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400', label: 'Platinum', icon: 'diamond' },
            'new': { bg: 'bg-primary/10', text: 'text-primary', label: 'New', icon: 'person' },
        };
        const t = tierMap[tierLower] || tierMap['new'];
        return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg ${t.bg} ${t.text} text-xs font-semibold">
            <span class="material-symbols-outlined text-sm" style="font-variation-settings: 'FILL' 1;">${t.icon}</span>
            ${t.label}
        </span>`;
    }

    _renderTags(tags) {
        if (!tags || tags.length === 0) {
            return `<span class="text-sm text-slate-400">Chưa có nhãn</span>`;
        }
        return tags.map(tag => `
            <span class="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium border border-border-light dark:border-border-dark">${tag}</span>
        `).join('');
    }

    _getActivityIcon(type) {
        const typeMap = {
            'purchase': { icon: 'shopping_cart', bgColor: 'bg-primary/10', borderColor: 'border-primary/20', iconColor: 'text-primary' },
            'order': { icon: 'shopping_cart', bgColor: 'bg-primary/10', borderColor: 'border-primary/20', iconColor: 'text-primary' },
            'login': { icon: 'login', bgColor: 'bg-slate-100 dark:bg-slate-700', borderColor: 'border-slate-200 dark:border-slate-600', iconColor: 'text-slate-500' },
            'email': { icon: 'mail', bgColor: 'bg-amber-100 dark:bg-amber-900/20', borderColor: 'border-amber-200 dark:border-amber-800', iconColor: 'text-amber-600' },
            'wallet': { icon: 'account_balance_wallet', bgColor: 'bg-success-light', borderColor: 'border-success/20', iconColor: 'text-success' },
            'deposit': { icon: 'add_circle', bgColor: 'bg-success-light', borderColor: 'border-success/20', iconColor: 'text-success' },
            'withdraw': { icon: 'remove_circle', bgColor: 'bg-danger-light', borderColor: 'border-danger/20', iconColor: 'text-danger' },
            'ticket': { icon: 'support_agent', bgColor: 'bg-purple-100 dark:bg-purple-900/20', borderColor: 'border-purple-200 dark:border-purple-800', iconColor: 'text-purple-600' },
            'note': { icon: 'note', bgColor: 'bg-cyan-100 dark:bg-cyan-900/20', borderColor: 'border-cyan-200 dark:border-cyan-800', iconColor: 'text-cyan-600' },
        };
        return typeMap[type] || { icon: 'event', bgColor: 'bg-slate-100 dark:bg-slate-700', borderColor: 'border-slate-200 dark:border-slate-600', iconColor: 'text-slate-500' };
    }

    _getTimeAgo(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Vừa xong';
        if (diffMins < 60) return `${diffMins} phút trước`;
        if (diffHours < 24) return `${diffHours} giờ trước`;
        if (diffDays === 1) return 'Hôm qua';
        if (diffDays < 7) return `${diffDays} ngày trước`;
        return date.toLocaleDateString('vi-VN', { day: 'numeric', month: 'short' });
    }

    async _addCustomerNote(content) {
        if (!content || !content.trim()) {
            alert('Vui lòng nhập nội dung ghi chú.');
            return;
        }

        const addNoteBtn = this.container.querySelector('#add-note-btn');
        if (addNoteBtn) {
            addNoteBtn.disabled = true;
            addNoteBtn.innerHTML = `<span class="material-symbols-outlined text-lg animate-spin">progress_activity</span>`;
        }

        try {
            const response = await apiService.addCustomerNote(this.customerPhone, content.trim());
            if (response.success) {
                // Reload profile to show new note
                this.render(this.customerPhone);
            } else {
                alert('Lỗi khi thêm ghi chú: ' + (response.error || 'Lỗi không xác định'));
            }
        } catch (error) {
            alert('Lỗi khi thêm ghi chú: ' + error.message);
            console.error('Lỗi thêm ghi chú:', error);
        } finally {
            if (addNoteBtn) {
                addNoteBtn.disabled = false;
                addNoteBtn.innerHTML = `<span class="material-symbols-outlined text-lg">send</span> Thêm`;
            }
        }
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
    }
}
