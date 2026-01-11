// customer-hub/js/modules/customer-profile.js
import apiService from '../api-service.js';
import { PermissionHelper } from '../utils/permissions.js';
import { WalletPanelModule } from './wallet-panel.js';
import { TicketListModule } from './ticket-list.js';

export class CustomerProfileModule {
    constructor(containerId, permissionHelper) {
        this.container = document.getElementById(containerId);
        this.permissionHelper = permissionHelper;
        this.customerPhone = null;
        this.walletPanelModule = null;
        this.ticketListModule = null;
        this.customerData = null;
    }

    initUI() {
        this.container.innerHTML = `
            <!-- Modal Header -->
            <header class="shrink-0 px-6 py-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <h1 id="modal-customer-name" class="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Hồ sơ khách hàng</h1>
                        <span id="modal-customer-id" class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600"></span>
                    </div>
                    <p id="modal-customer-meta" class="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <span class="material-symbols-outlined text-[14px]">call</span>
                        <span id="modal-phone-display"></span>
                        <span class="w-1 h-1 rounded-full bg-slate-300"></span>
                        <span id="modal-address-display">Chưa có địa chỉ</span>
                    </p>
                </div>
                <div class="flex items-center gap-2">
                    <button id="audit-log-btn" class="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm">
                        <span class="material-symbols-outlined text-[18px]">history</span>
                        Lịch sử
                    </button>
                    <button onclick="window.closeCustomerModal()" class="ml-2 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
            </header>

            <!-- Modal Body - Scrollable -->
            <div class="flex-1 overflow-y-auto p-6 space-y-6 bg-background-light dark:bg-background-dark">
                <!-- Loading State -->
                <div id="modal-loader" class="flex flex-col items-center justify-center py-16">
                    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
                    <p class="text-slate-500 dark:text-slate-400">Đang tải thông tin khách hàng...</p>
                </div>

                <!-- Content - Hidden until loaded -->
                <div id="modal-content-loaded" class="hidden space-y-6">
                    <!-- Top Row: 3 Columns -->
                    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        <!-- Customer Info Card -->
                        <div id="customer-info-card" class="lg:col-span-4 flex flex-col bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                            <!-- Will be rendered dynamically -->
                        </div>

                        <!-- Wallet Summary Card -->
                        <div id="customer-wallet-panel" class="lg:col-span-4 flex flex-col bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden relative">
                            <!-- Will be rendered by WalletPanelModule -->
                        </div>

                        <!-- RFM Analysis Card -->
                        <div id="rfm-analysis-card" class="lg:col-span-4 flex flex-col bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                            <!-- Will be rendered dynamically -->
                        </div>
                    </div>

                    <!-- Bottom Row: 2 Columns -->
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <!-- Recent Tickets -->
                        <div id="customer-ticket-list" class="flex flex-col bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm min-h-[320px]">
                            <!-- Will be rendered by TicketListModule -->
                        </div>

                        <!-- Recent Activities -->
                        <div id="recent-activities-card" class="flex flex-col bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm min-h-[320px]">
                            <!-- Will be rendered dynamically -->
                        </div>
                    </div>

                    <!-- Internal Notes Section -->
                    <div id="internal-notes-section" class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
                        <!-- Will be rendered dynamically -->
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
            const response = await apiService.getCustomer360(phone);
            if (response.success && response.data) {
                this.customerData = response.data;

                // Render all sections
                this._renderHeader(response.data.customer);
                this._renderCustomerInfoCard(response.data.customer);
                this._renderRFMCard(response.data.customer);
                this._renderActivitiesCard(response.data.activities || []);
                this._renderNotesSection(response.data.customer.notes || []);

                // Initialize sub-modules
                this.walletPanelModule = new WalletPanelModule('customer-wallet-panel', this.permissionHelper);
                this.walletPanelModule.render(phone);

                this.ticketListModule = new TicketListModule('customer-ticket-list', this.permissionHelper);
                this.ticketListModule.render(phone);

                this.loader.classList.add('hidden');
                this.contentLoaded.classList.remove('hidden');
            } else {
                this._showError(`Không tìm thấy thông tin khách hàng cho SĐT: ${phone}`);
            }
        } catch (error) {
            this._showError(`Lỗi khi tải thông tin khách hàng: ${error.message}`);
            console.error('Customer profile load error:', error);
        }
    }

    _showError(message) {
        this.loader.innerHTML = `
            <div class="flex flex-col items-center justify-center py-16">
                <span class="material-symbols-outlined text-4xl text-red-500 mb-4">error</span>
                <p class="text-red-500">${message}</p>
                <button onclick="window.closeCustomerModal()" class="mt-4 px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                    Đóng
                </button>
            </div>
        `;
    }

    _renderHeader(customer) {
        const nameEl = this.container.querySelector('#modal-customer-name');
        const idEl = this.container.querySelector('#modal-customer-id');
        const phoneEl = this.container.querySelector('#modal-phone-display');
        const addressEl = this.container.querySelector('#modal-address-display');

        nameEl.textContent = `Hồ sơ: ${customer.name || 'Khách hàng'}`;
        idEl.textContent = `ID: #${customer.id || 'N/A'}`;
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
            <div class="p-6 pb-0 flex items-start justify-between">
                <div class="size-16 rounded-full ${avatarColor.bg} flex items-center justify-center ${avatarColor.text} text-2xl font-bold border-2 border-white dark:border-slate-600 shadow-sm">
                    ${initials}
                </div>
                <div class="flex gap-2">
                    ${statusBadge}
                    ${tierBadge}
                </div>
            </div>
            <div class="p-6 flex-1 flex flex-col gap-5">
                <div class="space-y-4">
                    <div class="group">
                        <label class="text-xs font-medium text-slate-500 uppercase tracking-wider block mb-1">Email</label>
                        <div class="flex items-center justify-between">
                            <span class="text-sm font-medium text-slate-900 dark:text-white select-all">${customer.email || 'Chưa có email'}</span>
                            ${customer.email ? `
                                <button class="opacity-0 group-hover:opacity-100 text-primary transition-opacity" onclick="navigator.clipboard.writeText('${customer.email}')">
                                    <span class="material-symbols-outlined text-[16px]">content_copy</span>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                    <div class="group">
                        <label class="text-xs font-medium text-slate-500 uppercase tracking-wider block mb-1">Địa chỉ</label>
                        <span class="text-sm font-medium text-slate-900 dark:text-white block">${customer.address || 'Chưa có địa chỉ'}</span>
                    </div>
                    <div>
                        <label class="text-xs font-medium text-slate-500 uppercase tracking-wider block mb-2">Tags</label>
                        <div class="flex flex-wrap gap-2">
                            ${this._renderTags(customer.tags)}
                            <button class="size-6 flex items-center justify-center rounded-full border border-dashed border-slate-300 text-slate-400 hover:text-primary hover:border-primary transition-colors">
                                <span class="material-symbols-outlined text-[14px]">add</span>
                            </button>
                        </div>
                    </div>
                </div>
                ${this.permissionHelper.hasPermission('customer-hub', 'editCustomer') || this.permissionHelper.hasPermission('customer-hub', 'addNote') ? `
                    <div class="mt-auto grid grid-cols-2 gap-3 pt-4 border-t border-slate-100 dark:border-slate-700">
                        ${this.permissionHelper.hasPermission('customer-hub', 'editCustomer') ? `
                            <button id="edit-customer-btn" class="flex items-center justify-center gap-2 px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 transition-all">
                                <span class="material-symbols-outlined text-[18px]">edit</span> Sửa
                            </button>
                        ` : ''}
                        ${this.permissionHelper.hasPermission('customer-hub', 'addNote') ? `
                            <button id="add-note-shortcut-btn" class="flex items-center justify-center gap-2 px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 transition-all">
                                <span class="material-symbols-outlined text-[18px]">note_add</span> Ghi chú
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
        const percentile = rfm.percentile || null;

        container.innerHTML = `
            <div class="p-6 h-full flex flex-col">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <span class="material-symbols-outlined text-purple-600 dark:text-purple-400">analytics</span>
                        Phân tích RFM
                    </h3>
                    ${percentile ? `
                        <div class="bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-[10px] font-bold px-2 py-0.5 rounded border border-purple-100 dark:border-purple-800">
                            TOP ${percentile}%
                        </div>
                    ` : ''}
                </div>
                <div class="flex-1 grid grid-cols-2 gap-4">
                    <!-- Overall Score -->
                    <div class="col-span-2 flex items-center justify-between bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg border border-slate-100 dark:border-slate-700">
                        <div>
                            <p class="text-xs text-slate-500 font-medium uppercase tracking-wide">Điểm tổng</p>
                            <p class="text-4xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">${score.toFixed(1)}<span class="text-lg text-slate-400 font-medium">/5</span></p>
                        </div>
                        <div class="h-12 w-24">
                            <svg class="w-full h-full text-purple-500 fill-current opacity-20" viewBox="0 0 100 40">
                                <path d="M0 30 Q 25 35 50 10 T 100 20 V 40 H 0 Z"></path>
                            </svg>
                        </div>
                    </div>

                    <!-- Recency -->
                    <div class="p-3 rounded-lg border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800">
                        <div class="flex items-center gap-1.5 text-slate-500 mb-1">
                            <span class="material-symbols-outlined text-[16px]">schedule</span>
                            <span class="text-[10px] font-bold uppercase">Recency</span>
                        </div>
                        <p class="text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                            ${typeof recency === 'number' ? recency : recency}
                            <span class="text-xs font-normal text-slate-500">${typeof recency === 'number' ? 'ngày trước' : ''}</span>
                        </p>
                    </div>

                    <!-- Frequency -->
                    <div class="p-3 rounded-lg border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800">
                        <div class="flex items-center gap-1.5 text-slate-500 mb-1">
                            <span class="material-symbols-outlined text-[16px]">repeat</span>
                            <span class="text-[10px] font-bold uppercase">Frequency</span>
                        </div>
                        <p class="text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                            ${frequency} <span class="text-xs font-normal text-slate-500">đơn hàng</span>
                        </p>
                    </div>

                    <!-- Monetary -->
                    <div class="col-span-2 p-3 rounded-lg border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between">
                        <div>
                            <div class="flex items-center gap-1.5 text-slate-500 mb-1">
                                <span class="material-symbols-outlined text-[16px]">payments</span>
                                <span class="text-[10px] font-bold uppercase">Monetary (LTV)</span>
                            </div>
                            <p class="text-xl font-bold text-slate-900 dark:text-white tabular-nums">${this.formatCurrency(monetary)}</p>
                        </div>
                        ${rfm.yoy_change ? `
                            <div class="h-8 w-20 ${rfm.yoy_change >= 0 ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'} rounded flex items-center justify-center text-xs font-bold">
                                ${rfm.yoy_change >= 0 ? '+' : ''}${rfm.yoy_change}% YoY
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    _renderActivitiesCard(activities) {
        const container = this.container.querySelector('#recent-activities-card');

        let activitiesHtml = '';
        if (!activities || activities.length === 0) {
            activitiesHtml = `
                <div class="flex flex-col items-center justify-center py-8 text-slate-400">
                    <span class="material-symbols-outlined text-4xl mb-2">history</span>
                    <p class="text-sm">Chưa có hoạt động nào</p>
                </div>
            `;
        } else {
            activitiesHtml = activities.slice(0, 5).map((activity, index) => {
                const iconInfo = this._getActivityIcon(activity.type || activity.event_type);
                const timeAgo = this._getTimeAgo(activity.created_at || activity.timestamp);

                return `
                    <div class="relative pl-10">
                        <div class="absolute left-0 top-1 size-7 rounded-full ${iconInfo.bgColor} border ${iconInfo.borderColor} flex items-center justify-center z-10">
                            <span class="material-symbols-outlined text-[14px] ${iconInfo.iconColor}">${iconInfo.icon}</span>
                        </div>
                        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start">
                            <div>
                                <p class="text-sm font-medium text-slate-900 dark:text-white">${activity.title || activity.description || 'Hoạt động'}</p>
                                ${activity.details ? `<p class="text-xs text-slate-500 mt-0.5">${activity.details}</p>` : ''}
                            </div>
                            <span class="text-xs text-slate-400 mt-1 sm:mt-0">${timeAgo}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }

        container.innerHTML = `
            <div class="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <h3 class="text-base font-bold text-slate-800 dark:text-white">Hoạt động gần đây</h3>
                <button class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                    <span class="material-symbols-outlined">filter_list</span>
                </button>
            </div>
            <div class="p-6 relative">
                ${activities && activities.length > 0 ? `<div class="absolute left-9 top-6 bottom-6 w-px bg-slate-200 dark:bg-slate-700"></div>` : ''}
                <div class="space-y-6">
                    ${activitiesHtml}
                </div>
            </div>
        `;
    }

    _renderNotesSection(notes) {
        const container = this.container.querySelector('#internal-notes-section');

        let notesHtml = '';
        if (!notes || notes.length === 0) {
            notesHtml = `
                <div class="text-center py-4 text-slate-400">
                    <p class="text-sm">Chưa có ghi chú nội bộ nào</p>
                </div>
            `;
        } else {
            notesHtml = notes.slice(0, 5).map(note => {
                const date = new Date(note.created_at).toLocaleString('vi-VN', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                const initials = this._getInitials(note.created_by || 'System');

                return `
                    <div class="flex gap-3">
                        <div class="size-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 text-xs font-bold shrink-0">
                            ${initials}
                        </div>
                        <div class="flex-1 bg-slate-50 dark:bg-slate-700/50 rounded-lg rounded-tl-none p-3 border border-slate-100 dark:border-slate-700">
                            <div class="flex justify-between items-baseline mb-1">
                                <span class="text-xs font-bold text-slate-700 dark:text-slate-300">${note.created_by || 'Hệ thống'}</span>
                                <span class="text-[10px] text-slate-400">${date}</span>
                            </div>
                            <p class="text-sm text-slate-600 dark:text-slate-300">${note.content}</p>
                        </div>
                    </div>
                `;
            }).join('');
        }

        container.innerHTML = `
            <h3 class="text-base font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                <span class="material-symbols-outlined text-slate-400">forum</span>
                Ghi chú nội bộ
            </h3>
            <div class="space-y-4 mb-6 max-h-60 overflow-y-auto pr-2">
                ${notesHtml}
            </div>
            ${this.permissionHelper.hasPermission('customer-hub', 'addNote') ? `
                <div class="relative">
                    <textarea id="new-note-textarea" class="w-full rounded-lg border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-primary focus:border-primary min-h-[80px] pr-24 resize-none placeholder-slate-400" placeholder="Thêm ghi chú nội bộ..."></textarea>
                    <div class="absolute bottom-3 right-3 flex gap-2">
                        <button class="p-1 text-slate-400 hover:text-slate-600 transition-colors" title="Đính kèm file">
                            <span class="material-symbols-outlined text-[20px]">attach_file</span>
                        </button>
                        <button id="add-note-btn" class="bg-primary hover:bg-primary-dark text-white px-3 py-1 rounded text-xs font-medium transition-colors">
                            Thêm
                        </button>
                    </div>
                </div>
            ` : ''}
        `;

        // Setup add note button
        if (this.permissionHelper.hasPermission('customer-hub', 'addNote')) {
            const addNoteBtn = container.querySelector('#add-note-btn');
            const noteTextarea = container.querySelector('#new-note-textarea');
            if (addNoteBtn && noteTextarea) {
                addNoteBtn.onclick = () => this._addCustomerNote(noteTextarea.value);
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
            { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-600 dark:text-green-400' },
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
            'active': { bg: 'bg-green-50 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', border: 'border-green-100 dark:border-green-800', label: 'Hoạt động' },
            'inactive': { bg: 'bg-slate-50 dark:bg-slate-700', text: 'text-slate-600 dark:text-slate-400', border: 'border-slate-200 dark:border-slate-600', label: 'Không hoạt động' },
            'pending': { bg: 'bg-amber-50 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-100 dark:border-amber-800', label: 'Chờ xử lý' },
            'blocked': { bg: 'bg-red-50 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', border: 'border-red-100 dark:border-red-800', label: 'Bị chặn' },
        };
        const s = statusMap[statusLower] || statusMap['active'];
        return `<span class="px-2.5 py-1 rounded-full ${s.bg} ${s.text} text-xs font-semibold border ${s.border}">${s.label}</span>`;
    }

    _getTierBadge(tier) {
        const tierLower = (tier || 'new').toLowerCase();
        const tierMap = {
            'gold': { bg: 'bg-amber-50 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800', label: 'Gold', icon: 'star' },
            'silver': { bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-600 dark:text-slate-300', border: 'border-slate-200 dark:border-slate-600', label: 'Silver', icon: 'star_half' },
            'bronze': { bg: 'bg-orange-50 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400', border: 'border-orange-200 dark:border-orange-800', label: 'Bronze', icon: 'star_outline' },
            'platinum': { bg: 'bg-purple-50 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-800', label: 'Platinum', icon: 'diamond' },
            'new': { bg: 'bg-primary/10', text: 'text-primary dark:text-blue-300', border: 'border-primary/20', label: 'Mới', icon: 'person' },
        };
        const t = tierMap[tierLower] || tierMap['new'];
        return `<span class="px-2.5 py-1 rounded-full ${t.bg} ${t.text} text-xs font-semibold border ${t.border} flex items-center gap-1">
            <span class="material-symbols-outlined text-[14px]">${t.icon}</span>${t.label}
        </span>`;
    }

    _renderTags(tags) {
        if (!tags || tags.length === 0) {
            return `<span class="text-sm text-slate-400">Chưa có tag</span>`;
        }
        return tags.map(tag => `
            <span class="px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium border border-slate-200 dark:border-slate-600">${tag}</span>
        `).join('');
    }

    _getActivityIcon(type) {
        const typeMap = {
            'purchase': { icon: 'shopping_cart', bgColor: 'bg-blue-50 dark:bg-blue-900/20', borderColor: 'border-blue-200 dark:border-blue-800', iconColor: 'text-primary' },
            'order': { icon: 'shopping_cart', bgColor: 'bg-blue-50 dark:bg-blue-900/20', borderColor: 'border-blue-200 dark:border-blue-800', iconColor: 'text-primary' },
            'login': { icon: 'login', bgColor: 'bg-slate-50 dark:bg-slate-700', borderColor: 'border-slate-200 dark:border-slate-600', iconColor: 'text-slate-500' },
            'email': { icon: 'mail', bgColor: 'bg-amber-50 dark:bg-amber-900/20', borderColor: 'border-amber-200 dark:border-amber-800', iconColor: 'text-amber-600' },
            'wallet': { icon: 'account_balance_wallet', bgColor: 'bg-green-50 dark:bg-green-900/20', borderColor: 'border-green-200 dark:border-green-800', iconColor: 'text-green-600' },
            'deposit': { icon: 'add_circle', bgColor: 'bg-green-50 dark:bg-green-900/20', borderColor: 'border-green-200 dark:border-green-800', iconColor: 'text-green-600' },
            'withdraw': { icon: 'remove_circle', bgColor: 'bg-red-50 dark:bg-red-900/20', borderColor: 'border-red-200 dark:border-red-800', iconColor: 'text-red-600' },
            'ticket': { icon: 'support_agent', bgColor: 'bg-purple-50 dark:bg-purple-900/20', borderColor: 'border-purple-200 dark:border-purple-800', iconColor: 'text-purple-600' },
            'note': { icon: 'note', bgColor: 'bg-cyan-50 dark:bg-cyan-900/20', borderColor: 'border-cyan-200 dark:border-cyan-800', iconColor: 'text-cyan-600' },
        };
        return typeMap[type] || { icon: 'event', bgColor: 'bg-slate-50 dark:bg-slate-700', borderColor: 'border-slate-200 dark:border-slate-600', iconColor: 'text-slate-500' };
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

        try {
            const response = await apiService.addCustomerNote(this.customerPhone, content.trim());
            if (response.success) {
                // Reload profile to show new note
                this.render(this.customerPhone);
            } else {
                alert('Lỗi khi thêm ghi chú: ' + (response.error || 'Unknown error'));
            }
        } catch (error) {
            alert('Lỗi khi thêm ghi chú: ' + error.message);
            console.error('Add note error:', error);
        }
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
    }
}
