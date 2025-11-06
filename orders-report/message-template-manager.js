// =====================================================
// MESSAGE TEMPLATE MANAGER - IMPROVED VERSION WITH DEBUG
// =====================================================

class MessageTemplateManager {
    constructor() {
        this.templates = [];
        this.filteredTemplates = [];
        this.selectedTemplate = null;
        this.isLoading = false;
        this.API_URL = 'https://tomato.tpos.vn/odata/MailTemplate?$filter=(Active+eq+true)';
        this.currentOrder = null;
        this.selectedOrders = [];
        this.DEBUG_MODE = true; // Enable debug logging
        this.init();
    }

    log(...args) {
        if (this.DEBUG_MODE) {
            console.log('[MESSAGE]', ...args);
        }
    }

    init() {
        this.log('🚀 MessageTemplateManager initialized');
        this.log('API URL:', this.API_URL);
        this.log('TokenManager available:', !!window.tokenManager);
        this.createModalDOM();
        this.attachEventListeners();
    }

    createModalDOM() {
        if (document.getElementById('messageTemplateModal')) {
            this.log('⚠️ Modal DOM already exists, skipping creation');
            return;
        }

        this.log('📝 Creating modal DOM...');

        const modalHTML = `
            <div class="message-modal-overlay" id="messageTemplateModal">
                <div class="message-modal">
                    <!-- Header -->
                    <div class="message-modal-header">
                        <h3>
                            <i class="fab fa-facebook-messenger"></i>
                            Gửi tin nhắn Facebook
                        </h3>
                        <button class="message-modal-close" id="closeMessageModal">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <!-- Search Section -->
                    <div class="message-search-section">
                        <div class="message-search-wrapper">
                            <div class="message-search-input-wrapper">
                                <i class="fas fa-search message-search-icon"></i>
                                <input 
                                    type="text" 
                                    class="message-search-input" 
                                    id="messageSearchInput"
                                    placeholder="Tìm kiếm template..."
                                    autocomplete="off"
                                />
                                <button class="message-clear-search" id="messageClearSearch">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                            <button class="message-new-template-btn" id="messageNewTemplate">
                                <i class="fas fa-plus"></i>
                                Mẫu mới
                            </button>
                        </div>
                    </div>

                    <!-- Body -->
                    <div class="message-modal-body" id="messageModalBody">
                        <div class="message-loading">
                            <i class="fas fa-spinner fa-spin"></i>
                            <p>Đang tải danh sách template...</p>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="message-modal-footer">
                        <div class="message-result-count" id="messageResultCount">
                            <strong>0</strong> template
                        </div>
                        <div class="message-modal-actions">
                            <button class="message-btn-cancel" id="messageBtnCancel">
                                Đóng
                            </button>
                            <button class="message-btn-send" id="messageBtnSend" disabled>
                                <i class="fas fa-paper-plane"></i>
                                Gửi tin nhắn
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.log('✅ Modal DOM created');
    }

    attachEventListeners() {
        this.log('🔗 Attaching event listeners...');

        document.getElementById('closeMessageModal')?.addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('messageBtnCancel')?.addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('messageTemplateModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'messageTemplateModal') {
                this.closeModal();
            }
        });

        const searchInput = document.getElementById('messageSearchInput');
        searchInput?.addEventListener('input', (e) => {
            this.handleSearch(e.target.value);
        });

        document.getElementById('messageClearSearch')?.addEventListener('click', () => {
            searchInput.value = '';
            this.handleSearch('');
            document.getElementById('messageClearSearch').classList.remove('show');
        });

        document.getElementById('messageNewTemplate')?.addEventListener('click', () => {
            this.openNewTemplateForm();
        });

        document.getElementById('messageBtnSend')?.addEventListener('click', () => {
            this.sendMessage();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isModalOpen()) {
                this.closeModal();
            }
        });

        this.log('✅ Event listeners attached');
    }

    async openModal(orderData = null) {
        this.log('📂 Opening modal...');
        
        if (Array.isArray(orderData)) {
            this.selectedOrders = orderData;
            this.currentOrder = orderData[0];
            this.log('📦 Selected orders:', orderData.length);
        } else if (orderData) {
            this.selectedOrders = [orderData];
            this.currentOrder = orderData;
            this.log('📦 Single order:', orderData);
        } else {
            this.selectedOrders = this.getSelectedOrdersFromTable();
            this.currentOrder = this.selectedOrders[0];
            this.log('📦 Orders from table:', this.selectedOrders.length);
        }

        const modal = document.getElementById('messageTemplateModal');
        modal?.classList.add('active');
        document.body.style.overflow = 'hidden';

        // IMPORTANT: Always reload templates when opening modal
        this.log('🔄 Force reloading templates...');
        await this.loadTemplates();
    }

    closeModal() {
        this.log('🚪 Closing modal...');
        const modal = document.getElementById('messageTemplateModal');
        modal?.classList.remove('active');
        document.body.style.overflow = 'auto';
        this.selectedTemplate = null;
        this.currentOrder = null;
        this.selectedOrders = [];
        
        const searchInput = document.getElementById('messageSearchInput');
        if (searchInput) searchInput.value = '';
        document.getElementById('messageClearSearch')?.classList.remove('show');
    }

    isModalOpen() {
        return document.getElementById('messageTemplateModal')?.classList.contains('active');
    }

    async loadTemplates() {
        this.log('');
        this.log('='.repeat(60));
        this.log('🔄 LOADING TEMPLATES FROM API');
        this.log('='.repeat(60));
        
        this.isLoading = true;
        const bodyEl = document.getElementById('messageModalBody');

        // Show loading
        bodyEl.innerHTML = `
            <div class="message-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Đang tải danh sách template từ API...</p>
                <p style="font-size: 12px; color: #9ca3af; margin-top: 8px;">
                    Check Network tab để xem request
                </p>
            </div>
        `;

        try {
            this.log('🌐 API URL:', this.API_URL);
            this.log('🔑 TokenManager:', window.tokenManager ? 'Available' : 'NOT FOUND');
            
            let response;
            let fetchMethod = 'unknown';

            if (window.tokenManager && typeof window.tokenManager.authenticatedFetch === 'function') {
                this.log('✅ Using TokenManager.authenticatedFetch()');
                fetchMethod = 'TokenManager';
                
                try {
                    this.log('📡 Calling API with Bearer token...');
                    response = await window.tokenManager.authenticatedFetch(this.API_URL, {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });
                    this.log('📥 Response received:', response.status, response.statusText);
                } catch (tokenError) {
                    this.log('❌ TokenManager error:', tokenError);
                    throw new Error(`Token authentication failed: ${tokenError.message}`);
                }
            } else {
                this.log('⚠️ TokenManager not available');
                this.log('⚠️ Trying direct fetch (will likely fail due to CORS/Auth)...');
                fetchMethod = 'Direct Fetch';
                
                response = await fetch(this.API_URL, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                this.log('📥 Response received:', response.status, response.statusText);
            }

            this.log('📊 Response status:', response.status);
            this.log('📊 Response ok:', response.ok);
            this.log('📊 Fetch method used:', fetchMethod);

            if (!response.ok) {
                const errorText = await response.text();
                this.log('❌ Response error:', errorText);
                throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
            }

            this.log('📄 Parsing JSON response...');
            const data = await response.json();
            
            this.log('📊 Response data structure:');
            this.log('  - @odata.context:', data['@odata.context'] ? 'Present' : 'Missing');
            this.log('  - value:', Array.isArray(data.value) ? `Array[${data.value.length}]` : typeof data.value);

            if (!data.value || !Array.isArray(data.value)) {
                this.log('❌ Invalid data structure');
                this.log('   Expected: { value: [...] }');
                this.log('   Received:', typeof data);
                throw new Error('Invalid API response: expected data.value array');
            }

            this.templates = data.value;
            this.filteredTemplates = [...this.templates];

            this.log('');
            this.log('✅ SUCCESS! Templates loaded:');
            this.log('  - Total templates:', this.templates.length);
            
            if (this.templates.length > 0) {
                this.log('  - Sample template names:');
                this.templates.slice(0, 3).forEach((t, i) => {
                    this.log(`    ${i + 1}. ${t.Name} (${t.TypeId})`);
                });
            }
            
            this.log('='.repeat(60));
            this.log('');

            // Show success notification
            if (window.notificationManager) {
                window.notificationManager.success(
                    `Đã tải ${this.templates.length} template từ API`,
                    2000
                );
            }

            // Render templates
            this.renderTemplates();

        } catch (error) {
            this.log('');
            this.log('❌ ERROR LOADING TEMPLATES');
            this.log('='.repeat(60));
            this.log('Error type:', error.name);
            this.log('Error message:', error.message);
            this.log('Error stack:', error.stack);
            this.log('='.repeat(60));
            this.log('');
            
            // Show error in modal
            bodyEl.innerHTML = `
                <div class="message-no-results">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ef4444; margin-bottom: 16px;"></i>
                    <p style="font-weight: 600; color: #111827; margin-bottom: 8px;">
                        Không thể tải danh sách template
                    </p>
                    <p style="color: #6b7280; font-size: 14px; margin-bottom: 16px;">
                        ${this.escapeHtml(error.message)}
                    </p>
                    <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 12px; border-radius: 8px; margin-bottom: 16px; text-align: left;">
                        <p style="font-size: 13px; color: #991b1b; margin: 0;">
                            <strong>Có thể do:</strong><br>
                            • TokenManager chưa được khởi tạo<br>
                            • Token hết hạn (refresh trang)<br>
                            • API không phản hồi<br>
                            • Lỗi network/CORS
                        </p>
                    </div>
                    <button 
                        onclick="messageTemplateManager.loadTemplates()" 
                        style="
                            padding: 10px 20px;
                            background: #6366f1;
                            color: white;
                            border: none;
                            border-radius: 8px;
                            cursor: pointer;
                            font-weight: 500;
                        "
                    >
                        <i class="fas fa-redo"></i> Thử lại
                    </button>
                </div>
            `;

            // Show error notification
            if (window.notificationManager) {
                window.notificationManager.error(
                    `Lỗi tải template: ${error.message}`,
                    5000
                );
            }

        } finally {
            this.isLoading = false;
        }
    }

    renderTemplates(templatesToRender = null) {
        const templates = templatesToRender || this.filteredTemplates;
        const bodyEl = document.getElementById('messageModalBody');
        const countEl = document.getElementById('messageResultCount');

        this.log('🎨 Rendering', templates.length, 'templates');

        if (countEl) {
            countEl.innerHTML = `<strong>${templates.length}</strong> template`;
        }

        if (templates.length === 0) {
            bodyEl.innerHTML = `
                <div class="message-no-results">
                    <i class="fas fa-search"></i>
                    <p>Không tìm thấy template nào</p>
                </div>
            `;
            return;
        }

        const templatesHTML = templates.map(template => {
            // CHỈ LẤY BodyPlain, không lấy BodyHtml
            const content = template.BodyPlain || 'Không có nội dung';
            const date = new Date(template.DateCreated).toLocaleDateString('vi-VN');
            
            // Convert \n thành <br> để giữ line breaks
            const contentWithBreaks = this.escapeHtml(content).replace(/\n/g, '<br>');
            
            // Kiểm tra nếu content dài (nhiều hơn 8 dòng ~ 200 chars)
            // để hiển thị nút "Xem thêm"
            const needsExpand = content.length > 200;

            return `
                <div class="message-template-item ${this.selectedTemplate?.Id === template.Id ? 'selected' : ''}" 
                     data-template-id="${template.Id}"
                     onclick="messageTemplateManager.selectTemplate(${template.Id})">
                    <div class="message-template-header">
                        <div class="message-template-name">
                            ${this.escapeHtml(template.Name)}
                        </div>
                        <span class="message-template-type ${this.getTypeClass(template.TypeId)}">
                            ${template.TypeId}
                        </span>
                    </div>
                    <div class="message-template-content" data-full-content="${this.escapeHtml(content)}">
                        ${contentWithBreaks}
                    </div>
                    <div class="message-template-actions">
                        ${needsExpand ? `
                            <button class="message-expand-btn" onclick="event.stopPropagation(); messageTemplateManager.toggleExpand(${template.Id})">
                                <i class="fas fa-chevron-down"></i>
                                <span class="expand-text">Xem thêm</span>
                            </button>
                        ` : '<div></div>'}
                        <div class="message-template-meta">
                            <span>
                                <i class="fas fa-calendar"></i>
                                ${date}
                            </span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        bodyEl.innerHTML = `<div class="message-template-list">${templatesHTML}</div>`;
        this.log('✅ Templates rendered to DOM');
    }

    selectTemplate(templateId) {
        const template = this.templates.find(t => t.Id === templateId);
        if (!template) {
            this.log('❌ Template not found:', templateId);
            return;
        }

        this.selectedTemplate = template;
        this.log('✅ Template selected:', template.Name);

        document.querySelectorAll('.message-template-item').forEach(item => {
            item.classList.remove('selected');
        });
        document.querySelector(`[data-template-id="${templateId}"]`)?.classList.add('selected');

        const sendBtn = document.getElementById('messageBtnSend');
        if (sendBtn) {
            sendBtn.disabled = false;
        }
    }

    toggleExpand(templateId) {
        const item = document.querySelector(`[data-template-id="${templateId}"]`);
        if (!item) return;

        const contentEl = item.querySelector('.message-template-content');
        const expandBtn = item.querySelector('.message-expand-btn');
        const expandText = expandBtn?.querySelector('.expand-text');
        const expandIcon = expandBtn?.querySelector('i');
        
        // Get original content with line breaks preserved
        const fullContent = contentEl.dataset.fullContent;
        const fullContentWithBreaks = this.escapeHtml(fullContent).replace(/\n/g, '<br>');

        if (contentEl.classList.contains('expanded')) {
            // Collapse - hiển thị lại với max-height từ CSS
            contentEl.innerHTML = fullContentWithBreaks;
            contentEl.classList.remove('expanded');
            if (expandText) expandText.textContent = 'Xem thêm';
            expandIcon?.classList.replace('fa-chevron-up', 'fa-chevron-down');
        } else {
            // Expand - bỏ max-height, hiển thị full
            contentEl.innerHTML = fullContentWithBreaks;
            contentEl.classList.add('expanded');
            if (expandText) expandText.textContent = 'Thu gọn';
            expandIcon?.classList.replace('fa-chevron-down', 'fa-chevron-up');
        }
    }

    handleSearch(query) {
        const clearBtn = document.getElementById('messageClearSearch');
        
        if (query.length > 0) {
            clearBtn?.classList.add('show');
        } else {
            clearBtn?.classList.remove('show');
        }

        if (!query.trim()) {
            this.filteredTemplates = [...this.templates];
        } else {
            const searchLower = query.toLowerCase();
            this.filteredTemplates = this.templates.filter(template => {
                const name = (template.Name || '').toLowerCase();
                // CHỈ TÌM TRONG BodyPlain
                const content = (template.BodyPlain || '').toLowerCase();
                const type = (template.TypeId || '').toLowerCase();
                
                return name.includes(searchLower) || 
                       content.includes(searchLower) || 
                       type.includes(searchLower);
            });
        }

        this.log('🔍 Search:', query, '→', this.filteredTemplates.length, 'results');
        this.renderTemplates(this.filteredTemplates);
    }

    async sendMessage() {
        if (!this.selectedTemplate) {
            if (window.notificationManager) {
                window.notificationManager.warning('Vui lòng chọn một template');
            }
            return;
        }

        try {
            const ordersCount = this.selectedOrders.length;
            this.log('📤 Sending message to', ordersCount, 'order(s)');

            // CHỈ LẤY BodyPlain
            let messageContent = this.selectedTemplate.BodyPlain || 'Không có nội dung';

            if (this.currentOrder) {
                messageContent = this.replacePlaceholders(messageContent, this.currentOrder);
                this.log('✅ Placeholders replaced');
            }

            this.log('📋 Message content length:', messageContent.length, 'chars');

            await this.copyToClipboard(messageContent);

            if (window.notificationManager) {
                window.notificationManager.success(
                    `Template "${this.selectedTemplate.Name}" đã được copy vào clipboard`,
                    3000,
                    ordersCount > 1 ? `${ordersCount} đơn hàng` : 'Thành công'
                );
            }

            this.closeModal();

        } catch (error) {
            this.log('❌ Error sending message:', error);
            if (window.notificationManager) {
                window.notificationManager.error(
                    `Lỗi: ${error.message}`,
                    4000
                );
            }
        }
    }

    replacePlaceholders(content, orderData) {
        let result = content;

        if (orderData.customerName) {
            result = result.replace(/{partner\.name}/g, orderData.customerName);
        }
        if (orderData.address) {
            result = result.replace(/{partner\.address}/g, orderData.address);
        }
        if (orderData.phone) {
            result = result.replace(/{partner\.phone}/g, orderData.phone);
        }

        if (orderData.products && Array.isArray(orderData.products)) {
            const productList = orderData.products
                .map(p => `- ${p.name} x${p.quantity} = ${this.formatCurrency(p.total)}`)
                .join('\n');
            result = result.replace(/{order\.details}/g, productList);
        }

        if (orderData.code) {
            result = result.replace(/{order\.code}/g, orderData.code);
        }

        if (orderData.totalAmount) {
            result = result.replace(/{order\.total}/g, this.formatCurrency(orderData.totalAmount));
        }

        return result;
    }

    async copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                this.log('✅ Copied to clipboard');
                return true;
            } catch (err) {
                this.log('⚠️ Clipboard API failed:', err);
                return this.fallbackCopyToClipboard(text);
            }
        } else {
            return this.fallbackCopyToClipboard(text);
        }
    }

    fallbackCopyToClipboard(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            this.log(successful ? '✅ Fallback copy successful' : '❌ Fallback copy failed');
            return successful;
        } catch (err) {
            this.log('❌ Fallback copy error:', err);
            document.body.removeChild(textArea);
            return false;
        }
    }

    getSelectedOrdersFromTable() {
        const selectedOrders = [];
        const checkboxes = document.querySelectorAll('tbody input[type="checkbox"]:checked');
        
        checkboxes.forEach(checkbox => {
            const row = checkbox.closest('tr');
            if (row) {
                const orderData = {
                    code: row.querySelector('td:nth-child(3)')?.textContent?.trim(),
                    customerName: row.querySelector('td:nth-child(4)')?.textContent?.trim(),
                    phone: row.querySelector('td:nth-child(5)')?.textContent?.trim(),
                    address: row.querySelector('td:nth-child(6)')?.textContent?.trim(),
                    totalAmount: row.querySelector('td:nth-child(8)')?.textContent?.trim(),
                };
                selectedOrders.push(orderData);
            }
        });

        return selectedOrders;
    }

    openNewTemplateForm() {
        if (window.notificationManager) {
            window.notificationManager.info(
                'Chức năng tạo template mới đang được phát triển',
                3000
            );
        }
    }

    getTypeClass(typeId) {
        const normalizedType = (typeId || '').toLowerCase();
        
        if (normalizedType.includes('messenger')) return 'type-messenger';
        if (normalizedType.includes('general')) return 'type-general';
        if (normalizedType.includes('email')) return 'type-email';
        
        return 'type-general';
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatCurrency(amount) {
        const numericAmount = typeof amount === 'string' 
            ? parseFloat(amount.replace(/[^\d.-]/g, ''))
            : amount;

        if (isNaN(numericAmount)) return '0đ';

        return new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND'
        }).format(numericAmount);
    }

    async refresh() {
        this.log('🔄 Manual refresh requested');
        this.templates = [];
        this.filteredTemplates = [];
        await this.loadTemplates();
    }
}

// =====================================================
// INITIALIZE
// =====================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMessageTemplateManager);
} else {
    initMessageTemplateManager();
}

function initMessageTemplateManager() {
    console.log('%c🚀 MESSAGE TEMPLATE MANAGER - IMPROVED VERSION', 'background: #10b981; color: white; padding: 8px; font-weight: bold;');
    const messageTemplateManager = new MessageTemplateManager();
    window.messageTemplateManager = messageTemplateManager;
    console.log('✅ MessageTemplateManager initialized and ready');
    console.log('📊 Debug mode:', messageTemplateManager.DEBUG_MODE);
    console.log('');
}

function openMessageTemplateModal(orderData = null) {
    if (window.messageTemplateManager) {
        window.messageTemplateManager.openModal(orderData);
    } else {
        console.error('❌ MessageTemplateManager not initialized');
        if (window.notificationManager) {
            window.notificationManager.error('Hệ thống chưa sẵn sàng, vui lòng thử lại');
        }
    }
}

window.openMessageTemplateModal = openMessageTemplateModal;
