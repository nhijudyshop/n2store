/**
 * SePay Dashboard Handler
 * Login to my.sepay.vn via Cloudflare Worker (bypass CORS)
 * Scrape dashboard + invoices + fetch API data
 *
 * @module cloudflare-worker/modules/handlers/sepay-dashboard-handler
 */

import { errorResponse, corsResponse } from '../utils/cors-utils.js';

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

// =========================================================
// Cookie helpers
// =========================================================

function extractCookies(response, existing = {}) {
    const cookies = { ...existing };
    // CF Workers support getAll('set-cookie')
    const setCookieHeaders = response.headers.getAll('set-cookie');
    for (const header of setCookieHeaders) {
        const [nameValue] = header.split(';');
        const eqIdx = nameValue.indexOf('=');
        if (eqIdx > 0) {
            cookies[nameValue.substring(0, eqIdx).trim()] = nameValue.substring(eqIdx + 1).trim();
        }
    }
    return cookies;
}

function cookieString(cookies) {
    return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

// =========================================================
// SePay Login
// =========================================================

async function sepayLogin(email, password) {
    // Step 1: GET login page → csrf_ap cookie
    const loginPage = await fetch('https://my.sepay.vn/login', {
        headers: {
            'User-Agent': BROWSER_UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        redirect: 'manual',
    });

    const cookies = extractCookies(loginPage);
    const csrfToken = cookies.csrf_ap;

    if (!csrfToken) {
        const body = await loginPage.text().catch(() => '');
        throw new Error(`No CSRF token. Status: ${loginPage.status}, len: ${body.length}, cf: ${body.includes('cf-challenge') || body.includes('__cf_chl')}`);
    }

    // Step 2: POST login
    const loginRes = await fetch('https://my.sepay.vn/login/do_login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': cookieString(cookies),
            'User-Agent': BROWSER_UA,
            'Referer': 'https://my.sepay.vn/login',
            'Origin': 'https://my.sepay.vn',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
            'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        body: `csrf_main=${encodeURIComponent(csrfToken)}&email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
        redirect: 'manual',
    });

    const sessionCookies = extractCookies(loginRes, cookies);
    const loginData = await loginRes.json().catch(() => ({ status: 0, message: 'Invalid JSON' }));

    if (!loginData || !loginData.status) {
        throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
    }

    return sessionCookies;
}

// =========================================================
// HTML Parsers
// =========================================================

function parseDashboard(html) {
    if (!html || html.length < 100) return { _error: 'Empty or too short' };
    if (html.includes('cf-challenge') || html.includes('__cf_chl')) {
        return { _error: 'Cloudflare challenge' };
    }

    const data = {};

    // Try to extract plan/package name
    // SePay dashboard shows subscription info in various formats
    const planPatterns = [
        /G[oó]i\s*(?:d[iị]ch\s*v[uụ])?[:\s]*<[^>]*>\s*([^<]+)/i,
        /class="[^"]*plan[^"]*"[^>]*>\s*([^<]+)/i,
        /(VIP|PROFESSIONAL|BUSINESS|FREE|BASIC|STARTER)\b/i,
        /G[oó]i\s+(VIP|chuy[eê]n\s*nghi[eệ]p|doanh\s*nghi[eệ]p)/i,
    ];
    for (const pat of planPatterns) {
        const m = html.match(pat);
        if (m) { data.plan = m[1].trim(); break; }
    }

    // Expiry date
    const expiryPatterns = [
        /(?:Ng[aà]y\s*h[eế]t\s*h[aạ]n|H[eế]t\s*h[aạ]n|Expir)[^<]*?(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
        /(\d{4}-\d{2}-\d{2})\s*(?:h[eế]t|expir)/i,
        /(?:Ng[aà]y\s*h[eế]t\s*h[aạ]n|Expir)[^<]*<[^>]*>\s*([^<]+)/i,
    ];
    for (const pat of expiryPatterns) {
        const m = html.match(pat);
        if (m) { data.expiryDate = m[1].trim(); break; }
    }

    // Transaction usage
    const txPatterns = [
        /(\d[\d,.]*)\s*\/\s*(\d[\d,.]*)\s*(?:giao\s*d[iị]ch|GD|transaction)/i,
        /(?:[ĐD][aã]\s*d[uù]ng|Used)[^<]*?(\d[\d,.]*)\s*\/?\s*(\d[\d,.]*)?/i,
    ];
    for (const pat of txPatterns) {
        const m = html.match(pat);
        if (m) {
            data.transactionUsed = parseInt(m[1].replace(/[,.]/g, ''));
            if (m[2]) data.transactionQuota = parseInt(m[2].replace(/[,.]/g, ''));
            break;
        }
    }

    return data;
}

function parseInvoices(html) {
    if (!html || html.length < 100) return [];
    if (html.includes('cf-challenge') || html.includes('__cf_chl')) return [];

    const invoices = [];

    // Find table rows
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
        const row = rowMatch[1];
        if (row.includes('<th')) continue;

        // Extract cells
        const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        const cells = [];
        let cellMatch;
        while ((cellMatch = cellRegex.exec(row)) !== null) {
            cells.push(cellMatch[1].replace(/<[^>]+>/g, '').trim());
        }

        // Expect: ID, Amount/Description, Status, Date, ...
        if (cells.length >= 3) {
            const invoice = {};
            // Try to find invoice ID (numeric)
            for (let i = 0; i < cells.length; i++) {
                if (/^\d+$/.test(cells[i]) && !invoice.id) {
                    invoice.id = cells[i];
                } else if (/[\d,.]+\s*[đd₫]/i.test(cells[i]) && !invoice.amount) {
                    invoice.amount = cells[i];
                } else if (/(?:paid|unpaid|[đĐ][aã]\s*thanh|ch[uư]a|pending|ho[aà]n\s*t[aấ]t)/i.test(cells[i]) && !invoice.status) {
                    invoice.status = cells[i];
                } else if (/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/.test(cells[i]) && !invoice.date) {
                    invoice.date = cells[i];
                }
            }
            if (invoice.id || invoice.amount) {
                invoices.push(invoice);
            }
        }
    }

    return invoices;
}

function parsePlansPage(html) {
    if (!html || html.length < 100 || html.startsWith('ERROR:')) return { _error: 'No data' };

    const data = {};

    // Extract table rows: <td>label</td><td>value</td>
    // SePay plans page uses a simple table with label-value pairs
    function extractTableValue(label) {
        // Match: <td>label</td> ... <td class="...">value</td>
        const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pat = new RegExp(`<td[^>]*>[^<]*${escapedLabel}[^<]*</td>[\\s\\S]*?<td[^>]*>\\s*([\\s\\S]*?)</td>`, 'i');
        const m = html.match(pat);
        if (m) return m[1].replace(/<[^>]+>/g, '').trim();
        return null;
    }

    // Plan name: "Gói của bạn" → "VIP"
    const plan = extractTableValue('Gói của bạn') || extractTableValue('Gói dịch vụ');
    if (plan) data.plan = plan.split(/\s+/)[0]; // Take first word (VIP, Pro, etc.)

    // Billing cycle
    const cycle = extractTableValue('Chu kỳ thanh toán');
    if (cycle) data.billingCycle = cycle;

    // Transaction quota: "Hạn mức giao dịch" → "1,000"
    const quota = extractTableValue('Hạn mức giao dịch');
    if (quota) {
        const num = quota.replace(/[^\d]/g, '');
        if (num) data.transactionQuota = parseInt(num);
    }

    // Used: "Đã sử dụng" → "83"
    const used = extractTableValue('Đã sử dụng');
    if (used) {
        const num = used.replace(/[^\d]/g, '');
        if (num) data.transactionUsed = parseInt(num);
    }

    // First payment: "Thanh toán lần đầu" → "589,000 đ"
    const firstPayment = extractTableValue('Thanh toán lần đầu');
    if (firstPayment) data.firstPayment = firstPayment;

    // Renewal: "Gia hạn" → amount/date
    const renewal = extractTableValue('Gia hạn');
    if (renewal) data.renewal = renewal;

    // Expiry: "Ngày hết hạn" or "Hết hạn"
    const expiry = extractTableValue('Ngày hết hạn') || extractTableValue('Hết hạn') || extractTableValue('Expiry');
    if (expiry) {
        // Extract date only: "2026-04-27(còn lại 27 ngày)" → "2026-04-27"
        const dateMatch = expiry.match(/(\d{4}-\d{2}-\d{2})/);
        data.expiryDate = dateMatch ? dateMatch[1] : expiry;
    }

    // Next billing: "Chu kỳ tiếp theo" or "Ngày gia hạn"
    const nextBilling = extractTableValue('Chu kỳ tiếp theo') || extractTableValue('Ngày gia hạn') || extractTableValue('Gia hạn tiếp');
    if (nextBilling) data.nextBilling = nextBilling;

    return data;
}

// =========================================================
// Main Handler
// =========================================================

/**
 * Handle POST /api/sepay-dashboard
 * Body: { email, password, api_key? }
 * Returns: { dashboard, invoices, bankAccount?, transactionCount?, month? }
 */
export async function handleSepayDashboard(request, url) {
    let email, password, apiKey;

    if (request.method === 'POST') {
        try {
            const body = await request.json();
            email = body.email;
            password = body.password;
            apiKey = body.api_key;
        } catch {
            return errorResponse('Invalid JSON body', 400);
        }
    } else {
        // GET: credentials from query params (for testing)
        email = url.searchParams.get('email');
        password = url.searchParams.get('password');
        apiKey = url.searchParams.get('api_key');
    }

    if (!email || !password) {
        return errorResponse('Missing email or password', 400, {
            usage: 'POST /api/sepay-dashboard with { email, password, api_key? }'
        });
    }

    console.log('[SEPAY-DASHBOARD] Starting login for:', email);

    try {
        // Login to SePay
        const cookies = await sepayLogin(email, password);
        const ck = cookieString(cookies);

        console.log('[SEPAY-DASHBOARD] Login OK, fetching pages...');

        const pageHeaders = {
            'Cookie': ck,
            'User-Agent': BROWSER_UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        };

        // Parallel fetch: dashboard, invoices, company/plans, and optionally API data
        const fetches = [
            fetch('https://my.sepay.vn/', { headers: pageHeaders }).then(r => r.text()).catch(e => `ERROR:${e.message}`),
            fetch('https://my.sepay.vn/invoices', { headers: pageHeaders }).then(r => r.text()).catch(e => `ERROR:${e.message}`),
            fetch('https://my.sepay.vn/company/plans', { headers: pageHeaders }).then(r => r.text()).catch(e => `ERROR:${e.message}`),
        ];

        // Note: SePay API calls (/userapi/bankaccounts, /userapi/transactions/count)
        // are rate-limited (429) when called from CF Worker. Plans page scraping
        // already provides plan, quota, used, expiry — API data is not needed.

        const results = await Promise.all(fetches);
        const dashboardHtml = results[0];
        const invoicesHtml = results[1];
        const plansHtml = results[2];

        const data = {
            dashboard: parseDashboard(dashboardHtml),
            plans: parsePlansPage(plansHtml),
            invoices: parseInvoices(invoicesHtml),
            fetchedAt: new Date().toISOString(),
        };

        // Month info
        const now = new Date();
        data.month = `${now.getMonth() + 1}/${now.getFullYear()}`;

        console.log('[SEPAY-DASHBOARD] Done. Dashboard:', JSON.stringify(data.dashboard));
        return corsResponse({ success: true, data });

    } catch (error) {
        console.error('[SEPAY-DASHBOARD] Error:', error.message);
        return errorResponse('SePay dashboard failed: ' + error.message, 500);
    }
}
