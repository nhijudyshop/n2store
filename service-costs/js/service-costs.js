/**
 * Service Costs Dashboard - Chi Phi Dich Vu
 * Dữ liệu THỰC từ API calls (2026-03-30)
 *
 * Render API: 4 web services + 1 PostgreSQL = $70/mo (verified)
 * Firebase: Blaze plan, 67 Firestore collections, 39 RTDB nodes, 3.58GB storage (verified via API)
 * DeepSeek: balance $9.27 (verified)
 * Gemini: active, free tier (verified)
 * Google Vision: API DISABLED in project (verified)
 * Google Places: Legacy + New API DISABLED (verified)
 * Goong: active, working (verified)
 * Telegram: @N2Store_bot, webhook active (verified)
 * SePay: key placeholder (verified)
 */

(function () {
    'use strict';

    // =========================================================
    // DATA: Dữ liệu thực từ API calls ngày 2026-03-30
    // =========================================================
    const SERVICES = [
        // ===================== RENDER.COM =====================
        // Owner: nhijudyshop@gmail.com (team: My Workspace)
        // Team ID: tea-d3fn6ok9c44c73d9g59g
        {
            id: 'render-fallback',
            name: 'n2store-fallback',
            type: 'Web Service (Node.js)',
            icon: 'server',
            account: 'nhijudyshop@gmail.com',
            plan: 'Standard',
            costType: 'paid',
            monthlyCost: 25,
            billingDay: 1,
            costNote: 'Server chính - API, webhooks, SSE realtime, Telegram webhook',
            region: 'Singapore',
            freeTier: 'Standard: 2GB RAM, 1 CPU, always-on',
            details: [
                { label: 'Service ID', value: 'srv-d4e5pd3gk3sc73bgv600' },
                { label: 'URL', value: 'https://n2store-fallback.onrender.com' },
                { label: 'Root Dir', value: 'render.com' },
                { label: 'Plan', value: 'Standard ($25/mo) - 2GB RAM, 1 CPU' },
                { label: 'Auto Deploy', value: 'Yes (main branch)' },
                { label: 'Created', value: '18/11/2025' },
                { label: 'Telegram Webhook', value: 'Active → /api/telegram/webhook' },
                { label: 'Routes', value: 'customers, return-orders, goong, gemini, sepay, realtime-sse, tpos-saved...' },
            ],
            consoleUrl: 'https://dashboard.render.com/web/srv-d4e5pd3gk3sc73bgv600',
            status: 'active',
        },
        {
            id: 'render-realtime',
            name: 'n2store-realtime',
            type: 'Web Service (Node.js)',
            icon: 'radio',
            account: 'nhijudyshop@gmail.com',
            plan: 'Standard',
            costType: 'paid',
            monthlyCost: 25,
            billingDay: 1,
            costNote: 'SSE Realtime server - cần always-on cho real-time connections',
            region: 'Singapore',
            freeTier: 'Standard: 2GB RAM, 1 CPU, always-on',
            details: [
                { label: 'Service ID', value: 'srv-d5doh26uk2gs739489k0' },
                { label: 'URL', value: 'https://n2store-realtime.onrender.com' },
                { label: 'Root Dir', value: 'n2store-realtime' },
                { label: 'Plan', value: 'Standard ($25/mo) - 2GB RAM, 1 CPU' },
                { label: 'Auto Deploy', value: 'Yes (main branch)' },
                { label: 'Created', value: '05/01/2026' },
            ],
            consoleUrl: 'https://dashboard.render.com/web/srv-d5doh26uk2gs739489k0',
            status: 'active',
        },
        {
            id: 'render-tpos-pancake',
            name: 'n2store-tpos-pancake',
            type: 'Web Service (Node.js)',
            icon: 'package',
            account: 'nhijudyshop@gmail.com',
            plan: 'Starter',
            costType: 'paid',
            monthlyCost: 7,
            billingDay: 1,
            costNote: 'TPOS-Pancake sync server',
            region: 'Singapore',
            freeTier: 'Starter: 512MB RAM, 0.5 CPU, always-on',
            details: [
                { label: 'Service ID', value: 'srv-d5fqb6s9c44c738q1800' },
                { label: 'URL', value: 'https://n2store-tpos-pancake.onrender.com' },
                { label: 'Root Dir', value: 'tpos-pancake/server' },
                { label: 'Plan', value: 'Starter ($7/mo) - 512MB RAM, 0.5 CPU' },
                { label: 'Auto Deploy', value: 'Yes (main branch)' },
                { label: 'Created', value: '08/01/2026' },
            ],
            consoleUrl: 'https://dashboard.render.com/web/srv-d5fqb6s9c44c738q1800',
            status: 'active',
        },
        {
            id: 'render-facebook',
            name: 'n2store-facebook',
            type: 'Web Service (Node.js)',
            icon: 'message-circle',
            account: 'nhijudyshop@gmail.com',
            plan: 'Starter',
            costType: 'paid',
            monthlyCost: 7,
            billingDay: 1,
            costNote: 'Facebook integration server',
            region: 'Singapore',
            freeTier: 'Starter: 512MB RAM, 0.5 CPU, always-on',
            details: [
                { label: 'Service ID', value: 'srv-d5g6p6uuk2gs739b3u1g' },
                { label: 'URL', value: 'https://n2store-facebook.onrender.com' },
                { label: 'Root Dir', value: 'n2store-facebook/server' },
                { label: 'Plan', value: 'Starter ($7/mo) - 512MB RAM, 0.5 CPU' },
                { label: 'Auto Deploy', value: 'Yes (main branch)' },
                { label: 'Created', value: '09/01/2026' },
            ],
            consoleUrl: 'https://dashboard.render.com/web/srv-d5g6p6uuk2gs739b3u1g',
            status: 'active',
        },
        {
            id: 'render-db',
            name: 'n2store-chat-db',
            type: 'PostgreSQL Database',
            icon: 'database',
            account: 'nhijudyshop@gmail.com',
            plan: 'Basic 256MB',
            costType: 'paid',
            monthlyCost: 6,
            billingDay: 1,
            costNote: 'PostgreSQL v18, 256MB RAM, 1GB SSD',
            region: 'Singapore',
            freeTier: 'Free tier hết hạn sau 30 ngày. Basic 256MB: $6/mo',
            details: [
                { label: 'Database ID', value: 'dpg-d4kr80npm1nc738em3j0-a' },
                { label: 'Database Name', value: 'n2store_chat' },
                { label: 'User', value: 'n2store_user' },
                { label: 'Host', value: 'dpg-d4kr80npm1nc738em3j0-a.singapore-postgres.render.com' },
                { label: 'PostgreSQL', value: 'Version 18' },
                { label: 'Disk Size', value: '1 GB SSD' },
                { label: 'Plan', value: 'Basic 256MB ($6/mo) - 256MB RAM, 0.1 CPU' },
                { label: 'Created', value: '28/11/2025' },
                { label: 'Tables', value: '~30+ (customers, balance_history, return_orders, tickets...)' },
            ],
            consoleUrl: 'https://dashboard.render.com/d/dpg-d4kr80npm1nc738em3j0-a',
            status: 'active',
        },

        // ===================== FIREBASE =====================
        // GCP Project: n2shop-69e37 (project number: 598906493303)
        // Created: 2023-10-14, Blaze plan (pay as you go)
        // Firestore: NATIVE mode, nam5, STANDARD edition
        // Hosting: n2shop-69e37.web.app
        {
            id: 'firebase',
            name: 'Firebase (Blaze Plan)',
            type: 'Backend-as-a-Service',
            icon: 'flame',
            account: 'n2shop-69e37 (nhijudyshop@gmail.com)',
            plan: 'Blaze (Pay as you go)',
            costType: 'usage-based',
            monthlyCost: 0,
            costNote: 'Blaze plan - trả theo usage. Kiểm tra console để xem chi phí thực tế hàng tháng',
            region: 'nam5 (US) / asia-southeast1 (SG)',
            freeTier: 'Firestore: 50K reads, 20K writes, 20K deletes/ngày. RTDB: 1GB stored, 10GB/tháng. Storage: 5GB. Auth: 10K/tháng',
            details: [
                { label: 'GCP Project', value: 'n2shop-69e37 (#598906493303)' },
                { label: 'Created', value: '14/10/2023' },
                { label: 'Firestore', value: '67 collections, ~10K+ documents (NATIVE mode, nam5)' },
                { label: 'Top collections', value: 'edit_history: 5,979 | kpi_base: 1,382 | attendance_records: 571 | soquy_edit_history: 488' },
                { label: 'Realtime DB', value: '39 nodes (asia-southeast1, Singapore)' },
                { label: 'Storage', value: '3 buckets, 10,021 files = 3.58 GB / 5 GB free' },
                { label: 'Main bucket', value: 'n2shop-69e37-ne0q1 (ASIA1, dual-region)' },
                { label: 'Hosting', value: 'n2shop-69e37.web.app (DEFAULT_SITE)' },
                { label: 'Auth', value: 'Anonymous Auth' },
                { label: 'Giá Firestore', value: '$0.06/100K reads, $0.18/100K writes, $0.02/100K deletes' },
                { label: 'Giá Realtime DB', value: '$5/GB stored (sau 1GB), $1/GB download (sau 10GB)' },
                { label: 'Giá Storage', value: '$0.026/GB/tháng (sau 5GB), $0.12/GB download' },
            ],
            consoleUrl: 'https://console.firebase.google.com/project/n2shop-69e37/usage',
            status: 'active',
        },

        // ===================== CLOUDFLARE =====================
        // Account: 27170a8625bb696ad1c253e6b221f59e
        // Owner: TRUONG GIANG VO TR (nhijudyshop@gmail.com)
        // Subdomain: nhijudyshop.workers.dev
        // Plan: Workers Paid $5/mo (since 13/12/2025, Stripe)
        {
            id: 'cloudflare',
            name: 'Cloudflare Workers',
            type: 'Edge Computing / Proxy',
            icon: 'cloud',
            account: 'nhijudyshop@gmail.com (TRUONG GIANG VO TR)',
            plan: 'Workers Paid ($5/mo)',
            costType: 'paid',
            monthlyCost: 5,
            billingDay: 13,
            costNote: '$5/mo qua Stripe. Tháng 3/2026: ~615K requests, 0 errors. Included: 10M req/mo',
            region: 'Global Edge (auto)',
            freeTier: 'Workers Paid: 10M requests/tháng included, sau đó $0.30/1M. 30ms CPU/request',
            details: [
                { label: 'Account ID', value: '27170a8625bb696ad1c253e6b221f59e' },
                { label: 'Plan', value: 'Workers Paid - $5/tháng (Stripe)' },
                { label: 'Billing cycle', value: '13 hàng tháng (next: 13/04/2026)' },
                { label: 'Subscribe từ', value: '13/12/2025' },
                { label: 'Owner', value: 'TRUONG GIANG VO TR (HCM, VN)' },
                { label: 'Worker Name', value: 'chatomni-proxy' },
                { label: 'Subdomain', value: 'nhijudyshop.workers.dev' },
                { label: 'Usage Model', value: 'Standard' },
                { label: 'Included', value: '10M requests/tháng, 30ms CPU/req' },
                { label: 'Tháng 3/2026', value: '~615,195 requests / 0 errors (6.2% of 10M)' },
                { label: 'Peak ngày', value: '71,970 req (18/03)' },
                { label: 'Avg/ngày', value: '~20,500 requests' },
                { label: 'Handlers', value: 'tpos, pancake, facebook, ai, image-proxy, token' },
                { label: 'Deploy', value: 'Wrangler CLI, compatibility: 2025-11-27' },
                { label: 'Lịch sử billing', value: '12/2025: $5, 01/2026: $5, 02/2026: $5, 03/2026: $5' },
            ],
            consoleUrl: 'https://dash.cloudflare.com/27170a8625bb696ad1c253e6b221f59e/workers/services/view/chatomni-proxy/production',
            status: 'active',
        },

        // ===================== AI / LLM =====================
        {
            id: 'deepseek',
            name: 'DeepSeek API',
            type: 'AI / LLM',
            icon: 'brain',
            account: 'DeepSeek Platform',
            plan: 'Pay as you go',
            costType: 'usage-based',
            monthlyCost: 1,
            costNote: 'Số dư hiện tại: $9.27 (topped up). Dùng rất ít mỗi tháng',
            region: 'Global',
            freeTier: 'Không free tier. Giá rất rẻ: $0.14/1M input, $0.28/1M output tokens',
            details: [
                { label: 'Số dư hiện tại', value: '$9.27 USD (topped up)' },
                { label: 'Granted balance', value: '$0.00' },
                { label: 'Status', value: 'Available (is_available: true)' },
                { label: 'Giá Input', value: '$0.14/1M tokens' },
                { label: 'Giá Output', value: '$0.28/1M tokens' },
                { label: 'API Key', value: 'sk-319cef4faabf413aa84beb51c383e9b1', masked: true },
            ],
            consoleUrl: 'https://platform.deepseek.com/',
            status: 'active',
        },
        {
            id: 'gemini',
            name: 'Gemini API',
            type: 'AI / LLM (Google)',
            icon: 'sparkles',
            account: 'Google AI Studio',
            plan: 'Free tier',
            costType: 'free',
            monthlyCost: 0,
            costNote: 'API hoạt động. Models: Gemini 2.5 Flash, 2.5 Pro, 2.0 Flash...',
            region: 'Global',
            freeTier: '15 RPM, 1M tokens/phút, 1500 requests/ngày (free)',
            details: [
                { label: 'API Status', value: 'ACTIVE (verified)' },
                { label: 'Models available', value: 'Gemini 2.5 Flash, 2.5 Pro, 2.0 Flash, 1.5 Flash/Pro...' },
                { label: 'Google Project', value: '51754929973' },
                { label: 'Free tier', value: '15 RPM, 1M TPM, 1500 RPD' },
                { label: 'API Key', value: 'AIzaSyCuo0e3Gpgvo8n30ZDSowc_jORy59r9pZs', masked: true },
                { label: 'Sử dụng', value: 'AI route trên Render server (/api/gemini)' },
            ],
            consoleUrl: 'https://aistudio.google.com/',
            status: 'active',
        },

        // ===================== GOOGLE APIS =====================
        {
            id: 'vision',
            name: 'Google Cloud Vision',
            type: 'AI / OCR',
            icon: 'scan',
            account: 'Google Cloud (Project 51754929973)',
            plan: 'DISABLED',
            costType: 'free',
            monthlyCost: 0,
            costNote: 'API CHƯA ĐƯỢC BẬT trong project. Cần enable nếu muốn dùng',
            region: 'Global',
            freeTier: '1,000 units/tháng free (nếu enable). $1.50/1000 units sau đó',
            details: [
                { label: 'API Status', value: 'DISABLED (SERVICE_DISABLED)' },
                { label: 'Error', value: 'Cloud Vision API has not been used in project 51754929973' },
                { label: 'Key dùng chung', value: 'Chung key Gemini (AIzaSyCuo0e...)' },
                { label: 'Enable tại', value: 'console.developers.google.com/apis/api/vision.googleapis.com' },
                { label: 'Chi phí nếu bật', value: 'Free 1000 units/tháng, sau đó $1.50/1K units' },
            ],
            consoleUrl: 'https://console.developers.google.com/apis/api/vision.googleapis.com/overview?project=51754929973',
            status: 'disabled',
        },
        {
            id: 'places',
            name: 'Google Places API',
            type: 'Maps / Geocoding',
            icon: 'map-pin',
            account: 'Google Cloud (Project 598906493303)',
            plan: 'DISABLED',
            costType: 'free',
            monthlyCost: 0,
            costNote: 'Cả Legacy API lẫn New API đều DISABLED. Key tồn tại nhưng không hoạt động',
            region: 'Global',
            freeTier: '$200 credit/tháng nếu enable. Autocomplete: $2.83/1K requests',
            details: [
                { label: 'API Status', value: 'DISABLED (cả Legacy + New)' },
                { label: 'Legacy API', value: 'REQUEST_DENIED - "calling a legacy API, not enabled"' },
                { label: 'Places API (New)', value: 'SERVICE_DISABLED - project 598906493303' },
                { label: 'API Key', value: 'AIzaSyD8m0umxhwIy1BdW7MJ9wve1IxGjZVh8Vw', masked: true },
                { label: 'Lưu ý', value: 'Key khác project với Gemini (598906493303 vs 51754929973)' },
                { label: 'Enable tại', value: 'console.developers.google.com/apis/api/places.googleapis.com' },
            ],
            consoleUrl: 'https://console.developers.google.com/apis/api/places.googleapis.com/overview?project=598906493303',
            status: 'disabled',
        },

        // ===================== MAPS =====================
        {
            id: 'goong',
            name: 'Goong.io',
            type: 'Maps / Geocoding (VN)',
            icon: 'map',
            account: 'Goong.io',
            plan: 'Free tier',
            costType: 'free',
            monthlyCost: 0,
            costNote: 'API hoạt động tốt (verified - trả về kết quả geocoding)',
            region: 'Vietnam',
            freeTier: '5,000 API calls/tháng free',
            details: [
                { label: 'API Status', value: 'ACTIVE (verified - geocoding OK)' },
                { label: 'APIs', value: 'Autocomplete, Geocoding, Place Detail' },
                { label: 'Free tier', value: '5,000 requests/tháng' },
                { label: 'API Key', value: 'QgXlM7CixnRBZD8OUcN4hgVTPTL6cHP8kXr7sTi2', masked: true },
                { label: 'Sử dụng', value: 'Tìm địa chỉ VN qua Render server (/api/goong-places)' },
            ],
            consoleUrl: 'https://account.goong.io/',
            status: 'active',
        },

        // ===================== MESSAGING =====================
        {
            id: 'telegram',
            name: 'Telegram Bot',
            type: 'Messaging / Notification',
            icon: 'send',
            account: '@N2Store_bot (N2Shop)',
            plan: 'Free',
            costType: 'free',
            monthlyCost: 0,
            costNote: 'Bot hoạt động. Webhook → n2store-fallback.onrender.com',
            region: 'Global',
            freeTier: 'Hoàn toàn miễn phí, không giới hạn',
            details: [
                { label: 'Bot Status', value: 'ACTIVE (verified)' },
                { label: 'Bot ID', value: '8546129159' },
                { label: 'Bot Username', value: '@N2Store_bot' },
                { label: 'Bot Name', value: 'N2Shop' },
                { label: 'Webhook URL', value: 'https://n2store-fallback.onrender.com/api/telegram/webhook' },
                { label: 'Webhook IP', value: '216.24.57.251' },
                { label: 'Pending Updates', value: '0' },
                { label: 'Max Connections', value: '40' },
                { label: 'Bot Token', value: '8546129159:AAGcQQqcSZJZ0K_saqLsXLGP8V5aqtWE3EI', masked: true },
            ],
            consoleUrl: 'https://t.me/N2Store_bot',
            status: 'active',
        },

        // ===================== PAYMENT =====================
        // SePay: ACB 75918, tên LAI THUY YEN NHI
        // Tổng 2,355 giao dịch. Jan: 1,253 | Feb: 181 | Mar (30/03): 509
        // Real API key từ Render env SEPAY_API
        {
            id: 'sepay',
            name: 'SePay',
            type: 'Payment Gateway',
            icon: 'banknote',
            account: 'ACB - 75918 (LAI THUY YEN NHI)',
            plan: 'VIP - 589,000đ/tháng (1,000 GD)',
            costType: 'paid',
            monthlyCost: 589000,
            monthlyCostVND: true,
            billingDay: 28,
            costNote: 'Đang tải dữ liệu từ API...',
            region: 'Vietnam',
            freeTier: 'Free: 50 GD/tháng. VIP 589K đ/tháng: 1,000 GD',
            details: [
                { label: 'G\u00F3i d\u1ECBch v\u1EE5', value: '\u0110ang t\u1EA3i...', _liveKey: 'plan' },
                { label: 'Gi\u00E1', value: '589,000 \u0111/th\u00E1ng' },
                { label: '\u0110\u00E3 d\u00F9ng', value: '\u0110ang t\u1EA3i...', _liveKey: 'txCount' },
                { label: 'Ng\u00E0y h\u1EBFt h\u1EA1n', value: '\u0110ang t\u1EA3i...', _liveKey: 'expiry' },
                { label: 'H\u00F3a \u0111\u01A1n', value: '\u0110ang t\u1EA3i...', _liveKey: 'invoices' },
                { label: 'Tr\u1EA1ng th\u00E1i', value: '\u0110ang t\u1EA3i...', _liveKey: 'status' },
                { label: 'S\u1ED1 d\u01B0 ng\u00E2n h\u00E0ng', value: '\u0110ang t\u1EA3i...', _liveKey: 'balance' },
                { label: 'GD g\u1EA7n nh\u1EA5t', value: '\u0110ang t\u1EA3i...', _liveKey: 'lastTx' },
                { label: 'Ng\u00E2n h\u00E0ng', value: '\u0110ang t\u1EA3i...', _liveKey: 'bankName' },
                { label: 'Ch\u1EE7 TK', value: '\u0110ang t\u1EA3i...', _liveKey: 'accountHolder' },
                { label: 'API Key', value: 'E0ZG...OTBY (t\u1EEB Render env)', masked: true },
            ],
            consoleUrl: 'https://my.sepay.vn/',
            status: 'active',
        },

        // ===================== AUTOFB =====================
        // AutoFB.pro - Facebook automation service
        // Account: n2shop, balance in credits (1 credit ≈ 25,000 VND)
        {
            id: 'autofb',
            name: 'AutoFB.pro',
            type: 'Facebook Automation',
            icon: 'bot',
            account: 'n2shop (level 1)',
            plan: 'Pay as you go',
            costType: 'usage-based',
            monthlyCost: 0,
            costNote: '\u0110ang t\u1EA3i d\u1EEF li\u1EC7u...',
            region: 'Vietnam',
            freeTier: 'Kh\u00F4ng c\u00F3 free tier. N\u1EA1p ti\u1EC1n d\u00F9ng d\u1EA7n',
            details: [
                { label: 'S\u1ED1 d\u01B0', value: '\u0110ang t\u1EA3i...', _liveKey: 'balance' },
                { label: 'S\u1ED1 d\u01B0 (VN\u0110)', value: '\u0110ang t\u1EA3i...', _liveKey: 'balanceVND' },
                { label: 'Username', value: 'n2shop' },
                { label: 'H\u1EA1ng th\u00E0nh vi\u00EAn', value: 'Level 1' },
                { label: 'Thanh to\u00E1n', value: 'Vietcombank (n\u1EA1p qua web)' },
                { label: 'C\u1EADp nh\u1EADt', value: '\u0110ang t\u1EA3i...', _liveKey: 'fetchedAt' },
            ],
            consoleUrl: 'https://autofb.pro/vi/wallet',
            status: 'active',
        },

        // ===================== POS =====================
        {
            id: 'tpos',
            name: 'TPOS',
            type: 'Point of Sale System',
            icon: 'shopping-cart',
            account: 'tomato.tpos.vn / nvkt',
            plan: 'Gói LS10 (LIVESTREAM) — hết hạn 29/06/2026',
            costType: 'paid',
            monthlyCost: 0,
            costNote: 'Gói LS10 LIVESTREAM. Còn 3 tháng (hết 29/06/2026). Đã thanh toán trước.',
            region: 'Vietnam',
            freeTier: 'Không có free tier',
            details: [
                { label: 'Gói', value: 'LS10 (LIVESTREAM)' },
                { label: 'Ngày bắt đầu', value: '24/05/2025' },
                { label: 'Ngày hết hạn', value: '29/06/2026 (còn 3 tháng)' },
                { label: 'Trạng thái', value: 'Đang hoạt động' },
                { label: 'Phiên bản', value: '6.3.29.1 (cập nhật 29/03/2026)' },
                { label: 'Chi nhánh', value: '2 / 1 (vượt giới hạn)' },
                { label: 'Tài khoản', value: '31 / 200' },
                { label: 'Sản phẩm', value: '2,043 / 200,000' },
                { label: 'Khách hàng', value: '90,176 / 200,000' },
                { label: 'Facebook Page', value: '6 / 50' },
                { label: 'Facebook User', value: '5 / 20' },
                { label: 'Client ID', value: 'tmtWebApp' },
                { label: 'Username', value: 'nvkt' },
                { label: 'Password', value: 'Aa@123456789', masked: true },
                { label: 'Tích hợp', value: 'API qua Cloudflare Worker (chatomni-proxy)' },
            ],
            consoleUrl: 'https://tomato.tpos.vn/#/app/user/pack-of-data',
            status: 'active',
        },
    ];

    const QUICK_LINKS = [
        { name: 'Firebase Console', url: 'https://console.firebase.google.com/project/n2shop-69e37/overview', icon: 'flame' },
        { name: 'Firebase Billing', url: 'https://console.firebase.google.com/project/n2shop-69e37/usage', icon: 'bar-chart-2' },
        { name: 'Render Dashboard', url: 'https://dashboard.render.com/', icon: 'server' },
        { name: 'Render: n2store-fallback', url: 'https://dashboard.render.com/web/srv-d4e5pd3gk3sc73bgv600', icon: 'server' },
        { name: 'Render: n2store-realtime', url: 'https://dashboard.render.com/web/srv-d5doh26uk2gs739489k0', icon: 'radio' },
        { name: 'Render: tpos-pancake', url: 'https://dashboard.render.com/web/srv-d5fqb6s9c44c738q1800', icon: 'package' },
        { name: 'Render: facebook', url: 'https://dashboard.render.com/web/srv-d5g6p6uuk2gs739b3u1g', icon: 'message-circle' },
        { name: 'Render: PostgreSQL DB', url: 'https://dashboard.render.com/d/dpg-d4kr80npm1nc738em3j0-a', icon: 'database' },
        { name: 'Cloudflare Workers', url: 'https://dash.cloudflare.com/27170a8625bb696ad1c253e6b221f59e/workers/services/view/chatomni-proxy/production', icon: 'cloud' },
        { name: 'Cloudflare Analytics', url: 'https://dash.cloudflare.com/27170a8625bb696ad1c253e6b221f59e/workers/analytics', icon: 'bar-chart-2' },
        { name: 'DeepSeek Platform', url: 'https://platform.deepseek.com/', icon: 'brain' },
        { name: 'Google AI Studio', url: 'https://aistudio.google.com/', icon: 'sparkles' },
        { name: 'Google Cloud Console', url: 'https://console.cloud.google.com/', icon: 'settings' },
        { name: 'Goong Account', url: 'https://account.goong.io/', icon: 'map' },
        { name: 'SePay Dashboard', url: 'https://my.sepay.vn/', icon: 'banknote' },
        { name: 'AutoFB Wallet', url: 'https://autofb.pro/vi/wallet', icon: 'bot' },
        { name: 'Telegram @N2Store_bot', url: 'https://t.me/N2Store_bot', icon: 'send' },
        { name: 'Firebase Stats (local)', url: '../firebase-stats/index.html', icon: 'database' },
    ];

    const API_KEYS = [
        { name: 'RENDER_API_KEY', service: 'Render', value: 'rnd_AcWEm67JDpbHEuAcWWALokwJ7Di9', sensitive: true },
        { name: 'RENDER_DB_URL', service: 'Render DB', value: 'postgresql://n2store_user:iKxWmQEh1PcUSRRJXrlMueaGci1Id6Z0@dpg-d4kr80npm1nc738em3j0-a.singapore-postgres.render.com/n2store_chat', sensitive: true },
        { name: 'CLOUDFLARE_GLOBAL_API', service: 'Cloudflare', value: 'f9cbd30e5a04a651f20b263f137b53b28b0a3', sensitive: true },
        { name: 'FIREBASE_PROJECT_ID', service: 'Firebase', value: 'n2shop-69e37', sensitive: false },
        { name: 'FIREBASE_CLIENT_EMAIL', service: 'Firebase', value: 'firebase-adminsdk-cmdro@n2shop-69e37.iam.gserviceaccount.com', sensitive: false },
        { name: 'DEEPSEEK_API_KEY', service: 'DeepSeek', value: 'sk-319cef4faabf413aa84beb51c383e9b1', sensitive: true },
        { name: 'GEMINI_API_KEY', service: 'Google (project 51754929973)', value: 'AIzaSyCuo0e3Gpgvo8n30ZDSowc_jORy59r9pZs', sensitive: true },
        { name: 'GOOGLE_CLOUD_VISION_API_KEY', service: 'Google (DISABLED)', value: 'AIzaSyCuo0e3Gpgvo8n30ZDSowc_jORy59r9pZs', sensitive: true },
        { name: 'GOOGLE_PLACES_API_KEY', service: 'Google (project 598906493303, DISABLED)', value: 'AIzaSyD8m0umxhwIy1BdW7MJ9wve1IxGjZVh8Vw', sensitive: true },
        { name: 'GOONG_API_KEY', service: 'Goong.io', value: 'QgXlM7CixnRBZD8OUcN4hgVTPTL6cHP8kXr7sTi2', sensitive: true },
        { name: 'TELEGRAM_BOT_TOKEN', service: 'Telegram (@N2Store_bot)', value: '8546129159:AAGcQQqcSZJZ0K_saqLsXLGP8V5aqtWE3EI', sensitive: true },
        { name: 'SEPAY_API', service: 'SePay (ACB 75918)', value: 'E0ZGXZSECWKPFPNKJNYOXJGHQ1ODYCDH2U0WIIIBWRUVCMC8DMTUS5HQMYVZOTBY', sensitive: true },
        { name: 'TPOS_CLIENT_ID', service: 'TPOS', value: 'tmtWebApp', sensitive: false },
        { name: 'TPOS_USERNAME', service: 'TPOS', value: 'nvkt', sensitive: false },
        { name: 'TPOS_PASSWORD', service: 'TPOS', value: 'Aa@123456789', sensitive: true },
    ];

    // =========================================================
    // RENDER FUNCTIONS
    // =========================================================

    let keysVisible = false;

    function maskValue(value) {
        if (!value) return '---';
        if (value.length <= 10) return '*'.repeat(value.length);
        return value.substring(0, 6) + '••••••••' + value.substring(value.length - 4);
    }

    function formatCurrency(amount) {
        if (amount === 0) return '$0';
        return `$${amount}`;
    }

    function renderSummary() {
        const totalUSD = SERVICES.reduce((sum, s) => sum + (s.monthlyCostVND ? 0 : (s.monthlyCost || 0)), 0);
        const totalVND = SERVICES.reduce((sum, s) => sum + (s.monthlyCostVND ? (s.monthlyCost || 0) : 0), 0);
        const freeCount = SERVICES.filter(s => s.costType === 'free').length;
        const paidCount = SERVICES.filter(s => s.costType === 'paid').length;
        const usageCount = SERVICES.filter(s => s.costType === 'usage-based').length;

        const costStr = totalVND > 0
            ? `~$${totalUSD} + ${totalVND.toLocaleString('vi-VN')}đ/tháng`
            : `~$${totalUSD}/tháng`;
        document.getElementById('totalMonthlyCost').textContent = costStr;
        document.getElementById('totalMonthlyCost').title = `USD: $${totalUSD} (Render $70 + CF $5 + DeepSeek ~$1) | VND: ${totalVND.toLocaleString('vi-VN')}đ (SePay)`;
        document.getElementById('freeServicesCount').textContent = `${freeCount} dịch vụ`;
        document.getElementById('paidServicesCount').textContent = `${paidCount} paid + ${usageCount} usage`;
        document.getElementById('totalServicesCount').textContent = SERVICES.length;
    }

    function getStatusBadge(status) {
        const map = {
            active: { cls: 'active', label: 'Active' },
            disabled: { cls: 'warning', label: 'Disabled' },
            unknown: { cls: 'usage', label: 'Chưa xác nhận' },
        };
        const s = map[status] || map.active;
        return `<span class="badge ${s.cls}">${s.label}</span>`;
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
                    <span class="service-cost-badge ${s.costType === 'free' ? 'free' : s.costType === 'paid' ? 'paid' : 'usage-based'}">
                        ${s.costType === 'free' ? 'FREE' : s.costType === 'paid' ? (s.monthlyCost > 0 ? (s.monthlyCostVND ? `${s.monthlyCost.toLocaleString('vi-VN')}đ/mo` : `$${s.monthlyCost}/mo`) : 'Paid (TBD)') : 'Usage-based'}
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
                            <span class="detail-label">Ghi ch&uacute;</span>
                            <span class="detail-value" style="color:var(--warning); font-size:0.78rem">${s.costNote}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="service-card-footer">
                    <a href="${s.consoleUrl}" target="_blank">
                        <i data-lucide="external-link"></i> M&#7903; Console
                    </a>
                    ${getStatusBadge(s.status)}
                </div>
            </div>
        `).join('');
    }

    function formatCost(s) {
        if (s.monthlyCost <= 0) return '<span style="color:var(--success)">$0</span>';
        if (s.monthlyCostVND) return `<strong style="color:var(--danger)">${s.monthlyCost.toLocaleString('vi-VN')}\u0111</strong>`;
        return `<strong style="color:var(--danger)">$${s.monthlyCost}</strong>`;
    }

    function renderCostTable() {
        const tbody = document.getElementById('costTable');
        let totalUSD = 0;
        let totalVND = 0;

        tbody.innerHTML = SERVICES.map(s => {
            if (s.monthlyCostVND) totalVND += s.monthlyCost || 0;
            else totalUSD += s.monthlyCost || 0;
            const costTypeClass = s.costType === 'free' ? 'free' : s.costType === 'paid' ? 'paid' : 'usage';
            const costTypeLabel = s.costType === 'free' ? 'Free' : s.costType === 'paid' ? 'Paid' : 'Usage';
            return `
                <tr>
                    <td><strong>${s.name}</strong></td>
                    <td>${s.type}</td>
                    <td style="font-size:0.78rem">${s.account}</td>
                    <td>${s.plan}</td>
                    <td>${formatCost(s)}</td>
                    <td style="font-size:0.75rem; max-width:200px">${s.freeTier}</td>
                    <td>${getStatusBadge(s.status)}</td>
                </tr>
            `;
        }).join('');

        const totalStr = totalVND > 0
            ? `~$${totalUSD} + ${totalVND.toLocaleString('vi-VN')}\u0111/th\u00E1ng`
            : `~$${totalUSD}/th\u00E1ng`;
        document.getElementById('totalCostCell').innerHTML = `<strong style="color:var(--danger)">${totalStr}</strong>`;
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
    // RENDER DOWNGRADE DETECTION
    // Render auto-pay → chỉ warning khi service bị downgrade
    // =========================================================
    const RENDER_EXPECTED_PLANS = {
        'n2store-fallback': 'standard',
        'n2store-realtime': 'standard',
        'n2store-tpos-pancake': 'starter',
        'n2store-facebook': 'starter',
    };

    async function checkRenderPlans() {
        try {
            const res = await fetch('https://n2store-fallback.onrender.com/api/admin/render/services');
            if (!res.ok) return;
            const { success, services } = await res.json();
            if (!success || !services) return;

            const downgraded = [];
            for (const svc of services) {
                const expected = RENDER_EXPECTED_PLANS[svc.name];
                if (!expected) continue;
                const actual = (svc.plan || '').toLowerCase();
                if (actual !== expected) {
                    downgraded.push({
                        name: svc.name,
                        expected,
                        actual: svc.plan || 'unknown',
                        suspended: svc.status !== 'active',
                    });
                }
            }

            if (downgraded.length > 0) {
                showRenderDowngradeWarning(downgraded);
            }
        } catch (e) {
            console.warn('[ServiceCosts] Render plan check failed:', e.message);
        }
    }

    function showRenderDowngradeWarning(downgraded) {
        const contentArea = document.querySelector('.content-area');
        if (!contentArea || document.getElementById('renderDowngradeBanner')) return;

        const banner = document.createElement('div');
        banner.id = 'renderDowngradeBanner';
        banner.className = 'billing-alert-banner';
        banner.innerHTML = `
            <div class="billing-alert-header">
                <div class="billing-alert-icon"><i data-lucide="alert-triangle"></i></div>
                <div class="billing-alert-content">
                    <strong>Render bị downgrade - Kiểm tra thanh toán!</strong>
                    <div class="billing-alert-items">
                        ${downgraded.map(d => `
                        <div class="billing-alert-item">
                            <span>${d.name}</span>
                            <span class="billing-alert-due overdue">${d.expected} → ${d.actual}${d.suspended ? ' (suspended)' : ''}</span>
                        </div>`).join('')}
                    </div>
                </div>
                <a href="https://dashboard.render.com/billing" target="_blank" class="billing-alert-toggle" style="text-decoration:none">
                    <i data-lucide="external-link"></i> Render Billing
                </a>
            </div>
        `;

        // Insert at top
        contentArea.insertBefore(banner, contentArea.firstChild);
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // =========================================================
    // BILLING ALERTS
    // =========================================================
    function getBillingAlerts() {
        // warnBefore: 0 = only on/after billing day (overdue), 3 = warn 3 days before
        // showDays: how many days to keep showing after billing day
        // Render + Firebase auto-pay → chỉ warning khi downgrade (check via API)
        // Chỉ giữ các dịch vụ cần nhắc thanh toán thủ công
        const BILLING_SCHEDULE = [
            { name: 'Cloudflare Workers', amount: 5, billingDay: 13, warnBefore: 0, showDays: 3 },
            { name: 'SePay VIP (589K \u0111)', amount: 589000, amountVND: true, billingDay: 27, warnBefore: 3, showDays: 3 },
        ];

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const alerts = [];

        BILLING_SCHEDULE.forEach(bill => {
            const billingThisMonth = new Date(today.getFullYear(), today.getMonth(), bill.billingDay);
            const daysDiff = Math.round((billingThisMonth - today) / (1000 * 60 * 60 * 24));

            let shouldAlert = false;
            let isOverdue = false;

            // Before billing day: alert if within warnBefore days
            if (bill.warnBefore > 0 && daysDiff > 0 && daysDiff <= bill.warnBefore) {
                shouldAlert = true;
            }
            // On or after billing day: alert if within showDays
            if (bill.showDays > 0 && daysDiff <= 0 && daysDiff >= -bill.showDays) {
                shouldAlert = true;
                isOverdue = true;
            }

            if (shouldAlert) {
                alerts.push({
                    name: bill.name,
                    amount: bill.amount,
                    amountVND: bill.amountVND || false,
                    daysLeft: daysDiff,
                    isOverdue,
                    note: bill.note || '',
                    dateStr: `${billingThisMonth.getDate()}/${billingThisMonth.getMonth() + 1}/${billingThisMonth.getFullYear()}`,
                    payment: bill.payment || null,
                });
            }
        });
        return alerts;
    }

    function renderBillingAlerts() {
        const alerts = getBillingAlerts();
        if (alerts.length === 0) return;

        const contentArea = document.querySelector('.content-area');
        if (!contentArea) return;

        const paymentAlerts = alerts.filter(a => a.payment);

        const banner = document.createElement('div');
        banner.className = 'billing-alert-banner';
        banner.innerHTML = `
            <div class="billing-alert-header">
                <div class="billing-alert-icon"><i data-lucide="alert-triangle"></i></div>
                <div class="billing-alert-content">
                    <strong>${alerts.some(a => a.isOverdue) ? 'T\u1EDBi h\u1EA1n thanh to\u00E1n!' : 'S\u1EAFp t\u1EDBi h\u1EA1n thanh to\u00E1n!'}</strong>
                    <div class="billing-alert-items">
                        ${alerts.map(a => {
                            const amountStr = a.amount > 0 ? (a.amountVND ? `${a.amount.toLocaleString('vi-VN')}\u0111` : `$${a.amount}`) : '';
                            let timeStr;
                            if (a.isOverdue) {
                                timeStr = a.daysLeft === 0 ? 'H\u00D4M NAY' : `qu\u00E1 h\u1EA1n ${Math.abs(a.daysLeft)} ng\u00E0y`;
                            } else {
                                timeStr = a.daysLeft === 0 ? 'H\u00D4M NAY' : `c\u00F2n ${a.daysLeft} ng\u00E0y (${a.dateStr})`;
                            }
                            const noteStr = a.note ? ` <small style="opacity:0.7">${a.note}</small>` : '';
                            return `
                            <div class="billing-alert-item">
                                <span>${a.name}</span>
                                ${amountStr ? `<span class="billing-alert-amount">${amountStr}</span>` : ''}
                                <span class="billing-alert-due ${a.isOverdue ? 'overdue' : ''}">${timeStr}</span>
                                ${noteStr}
                            </div>`;
                        }).join('')}
                    </div>
                </div>
                ${paymentAlerts.length > 0 ? '<button class="billing-alert-toggle" id="billingToggle"><i data-lucide="chevron-down"></i> Chi ti\u1EBFt thanh to\u00E1n</button>' : ''}
            </div>
            ${paymentAlerts.length > 0 ? `
            <div class="billing-payment-details" id="billingPaymentDetails" style="display:none">
                ${paymentAlerts.map(a => {
                    const p = a.payment;
                    return `
                    <div class="billing-payment-card">
                        <div class="billing-payment-qr">
                            <img src="${p.qrUrl}" alt="QR thanh to\u00E1n" />
                        </div>
                        <div class="billing-payment-info">
                            <div class="billing-payment-title">H\u00F3a \u0111\u01A1n ${p.invoiceId} \u2014 ${p.amountVND.toLocaleString('vi-VN')}\u0111</div>
                            <table class="billing-payment-table">
                                <tr><td>Ng\u00E2n h\u00E0ng</td><td><b>${p.bank}</b></td></tr>
                                <tr><td>S\u1ED1 t\u00E0i kho\u1EA3n</td><td><b class="billing-copy" data-copy="${p.acc}">${p.acc} <i data-lucide="copy" style="width:14px;height:14px"></i></b></td></tr>
                                <tr><td>Th\u1EE5 h\u01B0\u1EDFng</td><td><b>${p.beneficiary}</b></td></tr>
                                <tr><td>N\u1ED9i dung CK</td><td><b class="billing-copy" data-copy="${p.content}">${p.content} <i data-lucide="copy" style="width:14px;height:14px"></i></b></td></tr>
                                <tr><td>S\u1ED1 ti\u1EC1n</td><td><b>${p.amountVND.toLocaleString('vi-VN')}\u0111</b></td></tr>
                            </table>
                            <a href="${p.invoiceUrl}" target="_blank" class="billing-invoice-link"><i data-lucide="external-link" style="width:14px;height:14px"></i> Xem tr\u00EAn SePay</a>
                        </div>
                    </div>`;
                }).join('')}
            </div>` : ''}
        `;

        contentArea.insertBefore(banner, contentArea.firstChild);

        // Toggle payment details
        const toggleBtn = banner.querySelector('#billingToggle');
        const details = banner.querySelector('#billingPaymentDetails');
        if (toggleBtn && details) {
            toggleBtn.addEventListener('click', () => {
                const isOpen = details.style.display !== 'none';
                details.style.display = isOpen ? 'none' : 'flex';
                toggleBtn.innerHTML = isOpen
                    ? '<i data-lucide="chevron-down"></i> Chi ti\u1EBFt thanh to\u00E1n'
                    : '<i data-lucide="chevron-up"></i> Thu g\u1ECDn';
                if (typeof lucide !== 'undefined') lucide.createIcons();
            });
        }

        // Copy to clipboard
        banner.querySelectorAll('.billing-copy').forEach(el => {
            el.style.cursor = 'pointer';
            el.addEventListener('click', () => {
                navigator.clipboard.writeText(el.dataset.copy).then(() => {
                    const orig = el.innerHTML;
                    el.innerHTML = '<span style="color:#16a34a">\u0110\u00E3 copy!</span>';
                    setTimeout(() => { el.innerHTML = orig; if (typeof lucide !== 'undefined') lucide.createIcons(); }, 1500);
                });
            });
        });

        // Re-render lucide icons for new elements
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // =========================================================
    // LIVE DATA: Fetch SePay data via Cloudflare Worker
    // CF Worker logs into my.sepay.vn + calls SePay API
    // =========================================================
    const CF_WORKER_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev';

    async function fetchSepayLiveData() {
        try {
            const res = await fetch(`${CF_WORKER_BASE}/api/sepay-dashboard`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: 'nhijudyshop@gmail.com',
                    password: 'PBqRhge5~!',
                    api_key: 'E0ZGXZSECWKPFPNKJNYOXJGHQ1ODYCDH2U0WIIIBWRUVCMC8DMTUS5HQMYVZOTBY',
                }),
            });
            if (!res.ok) return null;
            const json = await res.json();
            if (!json.success) return null;
            return json.data;
        } catch (e) {
            console.warn('[SePay Live] Failed to fetch:', e.message);
            return null;
        }
    }

    function updateSepayCard(liveData) {
        if (!liveData) return;

        const sepayService = SERVICES.find(s => s.id === 'sepay');
        if (!sepayService) return;

        const { plans, invoices, month } = liveData;

        // Plans data (from CF Worker /company/plans scrape)
        const plan = plans?.plan || 'VIP';
        const expiry = plans?.expiryDate || null;
        const txUsed = plans?.transactionUsed || 0;
        const txQuota = plans?.transactionQuota || 1000;

        // Update details with live data
        sepayService.details.forEach(d => {
            if (d._liveKey === 'txCount') {
                d.value = `${txUsed} / ${txQuota.toLocaleString('vi-VN')} GD (T${month || new Date().getMonth() + 1})`;
            } else if (d._liveKey === 'status') {
                d.value = '\u0110ang ho\u1EA1t \u0111\u1ED9ng';
            } else if (d._liveKey === 'balance') {
                d.value = plans?.firstPayment || '589,000 \u0111/th\u00E1ng';
            } else if (d._liveKey === 'lastTx') {
                d.value = plans?.billingCycle || 'Theo th\u00E1ng';
            } else if (d._liveKey === 'bankName') {
                d.value = 'ACB - TK 75918';
            } else if (d._liveKey === 'accountHolder') {
                d.value = 'LAI THUY YEN NHI';
            } else if (d._liveKey === 'plan') {
                d.value = plan;
            } else if (d._liveKey === 'expiry') {
                if (expiry) {
                    const expiryDate = new Date(expiry);
                    const daysLeft = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
                    d.value = `${expiry} (c\u00F2n ${daysLeft} ng\u00E0y)`;
                } else {
                    d.value = 'Ch\u01B0a l\u1EA5y \u0111\u01B0\u1EE3c';
                }
            } else if (d._liveKey === 'invoices') {
                if (invoices?.length > 0) {
                    const latest = invoices[0];
                    d.value = `#${latest.id || '?'} - ${latest.amount || '?'} - ${latest.status || '?'}`;
                } else {
                    d.value = 'Kh\u00F4ng c\u00F3 h\u00F3a \u0111\u01A1n';
                }
            }
        });

        // Update costNote
        const statusParts = [];
        statusParts.push(`G\u00F3i ${plan} 589K \u0111/th\u00E1ng`);
        statusParts.push(`\u0110\u00E3 d\u00F9ng ${txUsed}/${txQuota.toLocaleString('vi-VN')} GD`);
        if (expiry) {
            const daysLeft = Math.ceil((new Date(expiry) - new Date()) / (1000 * 60 * 60 * 24));
            statusParts.push(`H\u1EBFt h\u1EA1n ${expiry} (${daysLeft} ng\u00E0y)`);
        }
        sepayService.costNote = statusParts.join('. ');

        // Update plan display
        if (plan) {
            sepayService.plan = `${plan} - 589,000\u0111/th\u00E1ng (${txQuota.toLocaleString('vi-VN')} GD)`;
        }

        // Re-render
        renderServicesGrid();
        renderCostTable();
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Log debug info
        if (liveData._debug) {
            console.log('[SePay] CF Worker debug:', liveData._debug);
        }
    }

    // =========================================================
    // LIVE DATA: AutoFB balance via CF Worker
    // CF Worker fetches captcha, solves with Gemini, logs in
    // =========================================================
    const AUTOFB_WARNING_THRESHOLD = 800000; // VND

    async function fetchAutofbLiveData() {
        // Try Render server directly first (has sharp + Gemini Vision for captcha solving)
        const RENDER_URL = 'https://n2store-fallback.onrender.com/api/autofb/balance';
        const payload = { username: 'n2shop', password: 'nhijudyMS23' };

        try {
            const res = await fetch(RENDER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                const json = await res.json();
                if (json.success) return json.data;
                console.warn('[AutoFB] Render server failed:', json.error);
            }
        } catch (e) {
            console.warn('[AutoFB] Render server error:', e.message);
        }

        // Fallback: try CF Worker proxy
        try {
            const res = await fetch(`${CF_WORKER_BASE}/api/autofb-balance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                const json = await res.json();
                if (json.success) return json.data;
                console.warn('[AutoFB] CF Worker failed:', json.error);
            }
        } catch (e) {
            console.warn('[AutoFB] CF Worker error:', e.message);
        }

        return null;
    }

    function updateAutofbCard(liveData) {
        if (!liveData) return;

        const autofbService = SERVICES.find(s => s.id === 'autofb');
        if (!autofbService) return;

        const { balance, balanceVND, username } = liveData;

        // Update details with live data
        autofbService.details.forEach(d => {
            if (d._liveKey === 'balance') {
                d.value = `$${balance.toFixed(2)} USD (credits)`;
            } else if (d._liveKey === 'balanceVND') {
                const formatted = balanceVND.toLocaleString('vi-VN');
                const isLow = balanceVND < AUTOFB_WARNING_THRESHOLD;
                d.value = `${formatted} vn\u0111${isLow ? ' \u26A0\uFE0F TH\u1EA4P' : ''}`;
            } else if (d._liveKey === 'fetchedAt') {
                const date = new Date(liveData.fetchedAt);
                d.value = date.toLocaleString('vi-VN');
            }
        });

        // Update costNote
        const formatted = balanceVND.toLocaleString('vi-VN');
        if (balanceVND < AUTOFB_WARNING_THRESHOLD) {
            autofbService.costNote = `S\u1ED1 d\u01B0: ${formatted} vn\u0111 - C\u1EA6N N\u1EA0P TH\u00CAM! (d\u01B0\u1EDBi ${AUTOFB_WARNING_THRESHOLD.toLocaleString('vi-VN')}\u0111)`;
        } else {
            autofbService.costNote = `S\u1ED1 d\u01B0: ${formatted} vn\u0111`;
        }

        // Update account
        autofbService.account = `${username || 'n2shop'} (level ${liveData.level || 1})`;

        // Re-render
        renderServicesGrid();
        renderCostTable();
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Show warning banner if balance is low
        if (balanceVND < AUTOFB_WARNING_THRESHOLD) {
            showAutofbLowBalanceWarning(balanceVND);
        }
    }

    function showAutofbLowBalanceWarning(balanceVND) {
        const contentArea = document.querySelector('.content-area');
        if (!contentArea) return;

        // Don't add duplicate
        if (document.getElementById('autofbWarningBanner')) return;

        const banner = document.createElement('div');
        banner.id = 'autofbWarningBanner';
        banner.className = 'autofb-warning-banner';
        banner.innerHTML = `
            <div class="autofb-warning-content">
                <div class="autofb-warning-icon"><i data-lucide="alert-triangle"></i></div>
                <div>
                    <strong>AutoFB.pro - S\u1ED1 d\u01B0 th\u1EA5p!</strong>
                    <div>S\u1ED1 d\u01B0 hi\u1EC7n t\u1EA1i: <strong>${balanceVND.toLocaleString('vi-VN')} vn\u0111</strong> (d\u01B0\u1EDBi ng\u01B0\u1EE1ng ${AUTOFB_WARNING_THRESHOLD.toLocaleString('vi-VN')}\u0111)</div>
                    <div style="margin-top:4px"><a href="https://autofb.pro/vi/wallet" target="_blank" style="color:#fbbf24;text-decoration:underline">N\u1EA1p ti\u1EC1n ngay →</a></div>
                </div>
                <button onclick="this.parentElement.parentElement.remove()" style="margin-left:auto;background:none;border:none;color:#fbbf24;cursor:pointer;font-size:1.2rem">\u00D7</button>
            </div>
        `;

        // Insert after billing alerts (or at top)
        const billingBanner = contentArea.querySelector('.billing-alert-banner');
        if (billingBanner) {
            billingBanner.after(banner);
        } else {
            contentArea.insertBefore(banner, contentArea.firstChild);
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // =========================================================
    // INIT
    // =========================================================
    function init() {
        const mainContainer = document.getElementById('mainContainer');
        if (mainContainer) mainContainer.style.display = 'block';

        renderBillingAlerts();
        renderSummary();
        renderServicesGrid();
        renderCostTable();
        renderAPIKeys();
        renderQuickLinks();

        // Timestamp
        const now = new Date();
        document.getElementById('lastUpdated').textContent =
            `Data verified: ${now.toLocaleDateString('vi-VN')} (via API calls)`;

        // Toggle keys
        document.getElementById('btnToggleKeys').addEventListener('click', function () {
            keysVisible = !keysVisible;
            this.innerHTML = keysVisible
                ? '<i data-lucide="eye"></i> \u1EA8n keys'
                : '<i data-lucide="eye-off"></i> Hi\u1EC3n th\u1ECB keys';
            renderAPIKeys();
            renderServicesGrid();
            if (typeof lucide !== 'undefined') lucide.createIcons();
        });

        // Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                if (typeof lucide !== 'undefined') lucide.createIcons();
            });
        }

        // Fetch live SePay data
        fetchSepayLiveData().then(data => {
            if (data) updateSepayCard(data);
        });

        // Fetch live AutoFB balance
        fetchAutofbLiveData().then(data => {
            if (data) updateAutofbCard(data);
        });

        // Check Render plans for downgrade
        checkRenderPlans();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
