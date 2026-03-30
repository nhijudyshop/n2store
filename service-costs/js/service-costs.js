/**
 * Service Costs Dashboard - Chi Phi Dich Vu
 * Thống kê toàn bộ dịch vụ, chi phí, API keys
 */

(function () {
    'use strict';

    // =========================================================
    // DATA: Tất cả dịch vụ đang sử dụng
    // =========================================================
    const SERVICES = [
        {
            id: 'firebase',
            name: 'Firebase',
            type: 'Backend-as-a-Service',
            icon: 'flame',
            account: 'n2shop-69e37',
            email: 'firebase-adminsdk-cmdro@n2shop-69e37.iam.gserviceaccount.com',
            plan: 'Blaze (Pay as you go)',
            costType: 'usage-based',
            monthlyCost: 0,
            costNote: 'Miễn phí nếu dưới free tier',
            region: 'nam5 (US) / asia-southeast1 (SG)',
            freeTier: 'Firestore: 50K reads, 20K writes, 20K deletes/ngày. Realtime DB: 1GB stored, 10GB/tháng download. Storage: 5GB. Auth: 10K/tháng',
            details: [
                { label: 'Project ID', value: 'n2shop-69e37' },
                { label: 'Firestore', value: 'Active - nam5' },
                { label: 'Realtime DB', value: 'Active - asia-southeast1' },
                { label: 'Storage', value: 'n2shop-69e37-ne0q1' },
                { label: 'Auth', value: 'Anonymous Auth' },
                { label: 'Hosting', value: 'Active' },
                { label: 'Giá Firestore', value: '$0.06/100K reads, $0.18/100K writes' },
                { label: 'Giá Storage', value: '$0.026/GB/tháng' },
                { label: 'Giá Bandwidth', value: '$0.12/GB (sau 10GB free)' },
            ],
            consoleUrl: 'https://console.firebase.google.com/project/n2shop-69e37/overview',
            status: 'active',
        },
        {
            id: 'render-db',
            name: 'Render PostgreSQL',
            type: 'Database',
            icon: 'database',
            account: 'n2store_user',
            plan: 'Free → Starter ($7/mo)',
            costType: 'paid',
            monthlyCost: 7,
            costNote: 'Free tier: 256MB, 97 ngày rồi expire. Starter: $7/mo, 1GB RAM, 1GB SSD',
            region: 'Singapore',
            freeTier: 'Free: 256MB storage, expires sau 97 ngày. Starter: 1GB RAM, 1GB SSD',
            details: [
                { label: 'Database', value: 'n2store_chat' },
                { label: 'User', value: 'n2store_user' },
                { label: 'Host', value: 'dpg-d4kr80npm1nc738em3j0-a.singapore-postgres.render.com' },
                { label: 'Region', value: 'Singapore' },
                { label: 'Plan hiện tại', value: 'Cần kiểm tra (Free hết hạn → nên dùng Starter $7/mo)' },
                { label: 'Tables', value: '~30+ tables (customers, balance_history, return_orders...)' },
            ],
            consoleUrl: 'https://dashboard.render.com/',
            status: 'active',
        },
        {
            id: 'render',
            name: 'Render Web Service',
            type: 'Web Server (Node.js)',
            icon: 'server',
            account: 'Render.com',
            plan: 'Free → Starter ($7/mo)',
            costType: 'paid',
            monthlyCost: 7,
            costNote: 'Free tier: spin down sau 15 phút idle. Starter: $7/mo always-on',
            region: 'Singapore',
            freeTier: 'Free: 750 hours/tháng, spin down sau 15 phút. Starter: always-on, 512MB RAM',
            details: [
                { label: 'Chức năng', value: 'API server, webhooks, image proxy, SSE realtime' },
                { label: 'Routes', value: 'customers, return-orders, goong-places, gemini, tpos-saved, sepay...' },
                { label: 'Node.js', value: 'Express.js server' },
                { label: 'API Key', value: 'rnd_AcWE...7Di9', masked: true },
            ],
            consoleUrl: 'https://dashboard.render.com/',
            status: 'active',
        },
        {
            id: 'cloudflare',
            name: 'Cloudflare Workers',
            type: 'Edge Computing / Proxy',
            icon: 'cloud',
            account: 'Cloudflare',
            plan: 'Free',
            costType: 'free',
            monthlyCost: 0,
            costNote: 'Free tier rất lớn, đủ dùng',
            region: 'Global Edge',
            freeTier: '100K requests/ngày, 10ms CPU/request. Workers KV: 100K reads/ngày, 1K writes/ngày',
            details: [
                { label: 'Chức năng', value: 'TPOS proxy, Facebook proxy, AI proxy, Image proxy' },
                { label: 'Handlers', value: 'tpos, pancake, facebook, ai, image-proxy, token' },
                { label: 'Request/ngày', value: '100,000 free' },
                { label: 'CPU time', value: '10ms/request (free)' },
            ],
            consoleUrl: 'https://dash.cloudflare.com/',
            status: 'active',
        },
        {
            id: 'deepseek',
            name: 'DeepSeek API',
            type: 'AI / LLM',
            icon: 'brain',
            account: 'DeepSeek',
            plan: 'Pay as you go',
            costType: 'usage-based',
            monthlyCost: 0,
            costNote: 'Rất rẻ, ~$0.14/1M input tokens, $0.28/1M output tokens',
            region: 'Global',
            freeTier: 'Không có free tier cố định, nhưng giá rất rẻ',
            details: [
                { label: 'Model', value: 'DeepSeek Chat / Coder' },
                { label: 'Giá Input', value: '$0.14/1M tokens (~1₫/1000 tokens)' },
                { label: 'Giá Output', value: '$0.28/1M tokens' },
                { label: 'API Key', value: 'sk-319c...e9b1', masked: true },
                { label: 'Sử dụng', value: 'AI features trong app' },
            ],
            consoleUrl: 'https://platform.deepseek.com/',
            status: 'active',
        },
        {
            id: 'gemini',
            name: 'Gemini API',
            type: 'AI / LLM',
            icon: 'sparkles',
            account: 'Google Cloud',
            plan: 'Free tier + Pay as you go',
            costType: 'free',
            monthlyCost: 0,
            costNote: 'Free tier: 15 RPM, 1M tokens/phút, 1500 requests/ngày',
            region: 'Global',
            freeTier: 'Gemini 1.5 Flash: 15 RPM, 1M TPM, 1500 RPD miễn phí',
            details: [
                { label: 'Model', value: 'Gemini 1.5 Flash / Pro' },
                { label: 'Free tier', value: '15 requests/phút, 1500 requests/ngày' },
                { label: 'Giá (vượt free)', value: '$0.075/1M input, $0.30/1M output (Flash)' },
                { label: 'API Key', value: 'AIzaSyCu...pZs', masked: true },
                { label: 'Sử dụng', value: 'AI route trên Render server' },
            ],
            consoleUrl: 'https://aistudio.google.com/',
            status: 'active',
        },
        {
            id: 'vision',
            name: 'Google Cloud Vision',
            type: 'AI / OCR',
            icon: 'scan',
            account: 'Google Cloud',
            plan: 'Free tier + Pay as you go',
            costType: 'usage-based',
            monthlyCost: 0,
            costNote: '1000 units/tháng miễn phí',
            region: 'Global',
            freeTier: '1,000 units/tháng free. Sau đó: $1.50/1000 units',
            details: [
                { label: 'Features', value: 'TEXT_DETECTION, LABEL_DETECTION' },
                { label: 'Free tier', value: '1,000 units/tháng' },
                { label: 'Giá vượt', value: '$1.50/1000 units (1001-5M)' },
                { label: 'API Key', value: 'Dùng chung key Gemini', masked: false },
                { label: 'Sử dụng', value: 'OCR hóa đơn, nhận diện text' },
            ],
            consoleUrl: 'https://console.cloud.google.com/apis/dashboard',
            status: 'active',
        },
        {
            id: 'places',
            name: 'Google Places API',
            type: 'Maps / Geocoding',
            icon: 'map-pin',
            account: 'Google Cloud',
            plan: '$200 credit/tháng',
            costType: 'free',
            monthlyCost: 0,
            costNote: 'Google cho $200 credit/tháng miễn phí',
            region: 'Global',
            freeTier: '$200 credit/tháng (~28,000 Autocomplete requests). Place Autocomplete: $2.83/1000 req',
            details: [
                { label: 'API', value: 'Places Autocomplete, Place Details' },
                { label: 'Monthly credit', value: '$200/tháng (miễn phí)' },
                { label: 'Giá Autocomplete', value: '$2.83/1000 requests' },
                { label: 'Giá Place Details', value: '$17/1000 requests' },
                { label: 'API Key', value: 'AIzaSyD8...8Vw', masked: true },
                { label: 'Sử dụng', value: 'Tìm địa chỉ giao hàng' },
            ],
            consoleUrl: 'https://console.cloud.google.com/apis/dashboard',
            status: 'active',
        },
        {
            id: 'goong',
            name: 'Goong.io',
            type: 'Maps / Geocoding (VN)',
            icon: 'map',
            account: 'Goong',
            plan: 'Free tier',
            costType: 'free',
            monthlyCost: 0,
            costNote: '5,000 requests/tháng miễn phí',
            region: 'Vietnam',
            freeTier: '5,000 API calls/tháng free. Sau đó: liên hệ',
            details: [
                { label: 'API', value: 'Autocomplete, Geocoding, Place Detail' },
                { label: 'Free tier', value: '5,000 requests/tháng' },
                { label: 'API Key', value: 'QgXlM7...sTi2', masked: true },
                { label: 'Sử dụng', value: 'Tìm địa chỉ VN (thay thế/bổ sung Google Places)' },
            ],
            consoleUrl: 'https://account.goong.io/',
            status: 'active',
        },
        {
            id: 'telegram',
            name: 'Telegram Bot API',
            type: 'Messaging / Notification',
            icon: 'send',
            account: 'Bot: @n2store_bot',
            plan: 'Free',
            costType: 'free',
            monthlyCost: 0,
            costNote: 'Hoàn toàn miễn phí',
            region: 'Global',
            freeTier: 'Không giới hạn (miễn phí hoàn toàn)',
            details: [
                { label: 'Bot Token', value: '8546129...tWE3EI', masked: true },
                { label: 'Giá', value: 'MIỄN PHÍ (không giới hạn)' },
                { label: 'Rate limit', value: '30 messages/giây (tổng), 1 msg/giây/chat' },
                { label: 'Sử dụng', value: 'Thông báo đơn hàng, cảnh báo hệ thống' },
            ],
            consoleUrl: 'https://t.me/BotFather',
            status: 'active',
        },
        {
            id: 'sepay',
            name: 'SePay',
            type: 'Payment Gateway',
            icon: 'banknote',
            account: 'SePay.vn',
            plan: 'Free (webhook)',
            costType: 'free',
            monthlyCost: 0,
            costNote: 'Webhook nhận thông báo chuyển khoản miễn phí',
            region: 'Vietnam',
            freeTier: 'Miễn phí nhận webhook thông báo giao dịch ngân hàng',
            details: [
                { label: 'API Key', value: 'sepay_sk_abc...456', masked: true },
                { label: 'Chức năng', value: 'Webhook nhận thông báo giao dịch ngân hàng' },
                { label: 'Giá', value: 'Miễn phí (tier cơ bản)' },
                { label: 'Sử dụng', value: 'Tự động xác nhận thanh toán đơn hàng' },
            ],
            consoleUrl: 'https://my.sepay.vn/',
            status: 'active',
        },
        {
            id: 'tpos',
            name: 'TPOS (POS System)',
            type: 'Point of Sale',
            icon: 'shopping-cart',
            account: 'tmtWebApp',
            plan: 'Thuê bao hàng tháng',
            costType: 'paid',
            monthlyCost: 0,
            costNote: 'Phí POS (kiểm tra hợp đồng)',
            region: 'Vietnam',
            freeTier: 'Không có free tier',
            details: [
                { label: 'Client ID', value: 'tmtWebApp' },
                { label: 'Username', value: 'nvkt' },
                { label: 'Chức năng', value: 'Quản lý đơn hàng, sản phẩm, tồn kho, khách hàng' },
                { label: 'Tích hợp', value: 'API qua Cloudflare Worker proxy' },
            ],
            consoleUrl: 'https://www.tpos.dev/',
            status: 'active',
        },
    ];

    const QUICK_LINKS = [
        { name: 'Firebase Console', url: 'https://console.firebase.google.com/project/n2shop-69e37/overview', icon: 'flame' },
        { name: 'Firebase Usage', url: 'https://console.firebase.google.com/project/n2shop-69e37/usage', icon: 'bar-chart-2' },
        { name: 'Render Dashboard', url: 'https://dashboard.render.com/', icon: 'server' },
        { name: 'Cloudflare Dash', url: 'https://dash.cloudflare.com/', icon: 'cloud' },
        { name: 'Google Cloud Console', url: 'https://console.cloud.google.com/', icon: 'settings' },
        { name: 'DeepSeek Platform', url: 'https://platform.deepseek.com/', icon: 'brain' },
        { name: 'Google AI Studio', url: 'https://aistudio.google.com/', icon: 'sparkles' },
        { name: 'Goong Account', url: 'https://account.goong.io/', icon: 'map' },
        { name: 'SePay Dashboard', url: 'https://my.sepay.vn/', icon: 'banknote' },
        { name: 'Telegram BotFather', url: 'https://t.me/BotFather', icon: 'send' },
        { name: 'TPOS Admin', url: 'https://www.tpos.dev/', icon: 'shopping-cart' },
        { name: 'Firebase Stats (local)', url: '../firebase-stats/index.html', icon: 'database' },
    ];

    const API_KEYS = [
        { name: 'FIREBASE_PROJECT_ID', service: 'Firebase', value: 'n2shop-69e37', sensitive: false },
        { name: 'FIREBASE_CLIENT_EMAIL', service: 'Firebase', value: 'firebase-adminsdk-cmdro@n2shop-69e37.iam.gserviceaccount.com', sensitive: false },
        { name: 'DEEPSEEK_API_KEY', service: 'DeepSeek', value: 'sk-319cef4faabf413aa84beb51c383e9b1', sensitive: true },
        { name: 'GEMINI_API_KEY', service: 'Google', value: 'AIzaSyCuo0e3Gpgvo8n30ZDSowc_jORy59r9pZs', sensitive: true },
        { name: 'GOOGLE_CLOUD_VISION_API_KEY', service: 'Google', value: 'AIzaSyCuo0e3Gpgvo8n30ZDSowc_jORy59r9pZs (same as Gemini)', sensitive: true },
        { name: 'GOOGLE_PLACES_API_KEY', service: 'Google', value: 'AIzaSyD8m0umxhwIy1BdW7MJ9wve1IxGjZVh8Vw', sensitive: true },
        { name: 'GOONG_API_KEY', service: 'Goong', value: 'QgXlM7CixnRBZD8OUcN4hgVTPTL6cHP8kXr7sTi2', sensitive: true },
        { name: 'TELEGRAM_BOT_TOKEN', service: 'Telegram', value: '8546129159:AAGcQQqcSZJZ0K_saqLsXLGP8V5aqtWE3EI', sensitive: true },
        { name: 'SEPAY_API_KEY', service: 'SePay', value: 'sepay_sk_abc123xyz456', sensitive: true },
        { name: 'TPOS_CLIENT_ID', service: 'TPOS', value: 'tmtWebApp', sensitive: false },
        { name: 'TPOS_USERNAME', service: 'TPOS', value: 'nvkt', sensitive: false },
        { name: 'TPOS_PASSWORD', service: 'TPOS', value: 'Aa@123456789', sensitive: true },
        { name: 'RENDER_API_KEY', service: 'Render', value: 'rnd_AcWEm67JDpbHEuAcWWALokwJ7Di9', sensitive: true },
        { name: 'RENDER_DB_URL', service: 'Render', value: 'postgresql://n2store_user:***@dpg-d4kr80npm1nc738em3j0-a.singapore-postgres.render.com/n2store_chat', sensitive: true },
    ];

    // =========================================================
    // RENDER FUNCTIONS
    // =========================================================

    let keysVisible = false;

    function maskValue(value) {
        if (!value) return '---';
        if (value.length <= 10) return '*'.repeat(value.length);
        return value.substring(0, 6) + '•'.repeat(8) + value.substring(value.length - 4);
    }

    function renderSummary() {
        const totalMonthly = SERVICES.reduce((sum, s) => sum + (s.monthlyCost || 0), 0);
        const freeCount = SERVICES.filter(s => s.costType === 'free').length;
        const paidCount = SERVICES.filter(s => s.costType === 'paid').length;
        const usageCount = SERVICES.filter(s => s.costType === 'usage-based').length;

        document.getElementById('totalMonthlyCost').textContent = `~$${totalMonthly}/tháng`;
        document.getElementById('freeServicesCount').textContent = `${freeCount} dịch vụ`;
        document.getElementById('paidServicesCount').textContent = `${paidCount} paid + ${usageCount} usage`;
        document.getElementById('totalServicesCount').textContent = SERVICES.length;
    }

    function renderServicesGrid() {
        const grid = document.getElementById('servicesGrid');
        grid.innerHTML = SERVICES.map(s => `
            <div class="service-card" data-service="${s.id}">
                <div class="service-card-header">
                    <div class="service-card-header-left">
                        <div class="service-logo">
                            <i data-lucide="${s.icon}"></i>
                        </div>
                        <div>
                            <div class="service-name">${s.name}</div>
                            <div class="service-type">${s.type}</div>
                        </div>
                    </div>
                    <span class="service-cost-badge ${s.costType}">
                        ${s.costType === 'free' ? 'FREE' : s.costType === 'paid' ? `$${s.monthlyCost}/mo` : 'Usage-based'}
                    </span>
                </div>
                <div class="service-card-body">
                    <div class="service-detail-row">
                        <span class="detail-label">Account</span>
                        <span class="detail-value">${s.account}</span>
                    </div>
                    <div class="service-detail-row">
                        <span class="detail-label">Plan</span>
                        <span class="detail-value">${s.plan}</span>
                    </div>
                    <div class="service-detail-row">
                        <span class="detail-label">Region</span>
                        <span class="detail-value">${s.region}</span>
                    </div>
                    <div class="service-detail-row">
                        <span class="detail-label">Free tier</span>
                        <span class="detail-value" style="font-size:0.78rem">${s.freeTier}</span>
                    </div>
                    ${s.details.map(d => `
                        <div class="service-detail-row">
                            <span class="detail-label">${d.label}</span>
                            <span class="detail-value ${d.masked ? 'masked' : ''}">${d.masked && !keysVisible ? maskValue(d.value) : d.value}</span>
                        </div>
                    `).join('')}
                    ${s.costNote ? `
                        <div class="service-detail-row" style="border-bottom:none; padding-top:0.75rem">
                            <span class="detail-label">Ghi chú</span>
                            <span class="detail-value" style="color:var(--warning); font-size:0.78rem">${s.costNote}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="service-card-footer">
                    <a href="${s.consoleUrl}" target="_blank">
                        <i data-lucide="external-link"></i> Mở Console
                    </a>
                    <span class="badge ${s.status === 'active' ? 'active' : 'inactive'}">
                        ${s.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                </div>
            </div>
        `).join('');
    }

    function renderCostTable() {
        const tbody = document.getElementById('costTable');
        let totalCost = 0;

        tbody.innerHTML = SERVICES.map(s => {
            totalCost += s.monthlyCost || 0;
            const costTypeClass = s.costType === 'free' ? 'free' : s.costType === 'paid' ? 'paid' : 'usage';
            const costTypeLabel = s.costType === 'free' ? 'Free' : s.costType === 'paid' ? 'Paid' : 'Usage';
            return `
                <tr>
                    <td><strong>${s.name}</strong></td>
                    <td>${s.type}</td>
                    <td>${s.account}</td>
                    <td>${s.plan}</td>
                    <td>${s.monthlyCost > 0 ? `<strong>$${s.monthlyCost}</strong>` : '<span style="color:var(--success)">$0</span>'}</td>
                    <td style="font-size:0.78rem; max-width:200px">${s.freeTier}</td>
                    <td><span class="badge ${costTypeClass}">${costTypeLabel}</span></td>
                </tr>
            `;
        }).join('');

        document.getElementById('totalCostCell').innerHTML = `<strong>~$${totalCost}/tháng</strong>`;
    }

    function renderAPIKeys() {
        const grid = document.getElementById('keysGrid');
        grid.innerHTML = API_KEYS.map(k => `
            <div class="key-item">
                <div class="key-header">
                    <span class="key-name">${k.name}</span>
                    <span class="key-service">${k.service}</span>
                </div>
                <div class="key-value ${!keysVisible && k.sensitive ? 'hidden' : ''}" data-value="${k.value}" data-sensitive="${k.sensitive}">
                    ${k.sensitive && !keysVisible ? maskValue(k.value) : k.value}
                </div>
            </div>
        `).join('');
    }

    function renderQuickLinks() {
        const grid = document.getElementById('quickLinksGrid');
        grid.innerHTML = QUICK_LINKS.map(l => `
            <a href="${l.url}" target="${l.url.startsWith('../') ? '_self' : '_blank'}" class="quick-link">
                <i data-lucide="${l.icon}"></i>
                <span>${l.name}</span>
            </a>
        `).join('');
    }

    // =========================================================
    // INIT
    // =========================================================
    function init() {
        // Show main container
        const mainContainer = document.getElementById('mainContainer');
        if (mainContainer) mainContainer.style.display = 'flex';

        // Render all sections
        renderSummary();
        renderServicesGrid();
        renderCostTable();
        renderAPIKeys();
        renderQuickLinks();

        // Update timestamp
        const now = new Date();
        document.getElementById('lastUpdated').textContent =
            `Cập nhật: ${now.toLocaleDateString('vi-VN')} ${now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;

        // Toggle keys visibility
        document.getElementById('btnToggleKeys').addEventListener('click', function () {
            keysVisible = !keysVisible;
            this.innerHTML = keysVisible
                ? '<i data-lucide="eye"></i> Ẩn keys'
                : '<i data-lucide="eye-off"></i> Hiển thị keys';
            renderAPIKeys();
            renderServicesGrid();
            if (typeof lucide !== 'undefined') lucide.createIcons();
        });

        // Init lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                if (typeof lucide !== 'undefined') lucide.createIcons();
            });
        }
    }

    // Wait for DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
