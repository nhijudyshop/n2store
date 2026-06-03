// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * =====================================================
 * TPOS CUSTOMER SERVICE
 * =====================================================
 *
 * Dịch vụ gọi API TPOS để tìm kiếm và lấy thông tin khách hàng
 *
 * Functions:
 *   - searchCustomerByPhone(phone) - Tìm khách hàng theo SĐT
 *   - getCustomerById(tposId) - Lấy thông tin khách hàng theo TPOS ID
 *
 * Created: 2026-01-12
 * =====================================================
 */

const tposTokenManager = require('./tpos-token-manager');
const { fetchWithRetry } = require('../../shared/node/fetch-utils.cjs');

/**
 * Normalize phone number to 10-digit format (0XXXXXXXXX)
 * @param {string} phone - Raw phone number
 * @returns {string|null} Normalized phone or null
 */
function normalizePhone(phone) {
    if (!phone) return null;
    let normalized = phone.replace(/\D/g, ''); // Remove non-digits

    // If phone starts with +84, remove it
    if (normalized.startsWith('84') && normalized.length === 11) {
        normalized = '0' + normalized.substring(2);
    }

    // Take last 10 digits if longer
    if (normalized.length > 10) {
        normalized = normalized.slice(-10);
    }

    // Ensure it starts with 0
    if (!normalized.startsWith('0') && normalized.length === 9) {
        normalized = '0' + normalized;
    }

    return normalized.length === 10 ? normalized : null;
}

// =====================================================
// TPOS API FUNCTIONS
// =====================================================

/**
 * Search TPOS customer by phone number
 * @param {string} phone - Phone number to search (will be normalized)
 * @returns {Promise<{success: boolean, customer: object|null, totalResults: number, error?: string}>}
 */
async function searchCustomerByPhone(phone) {
    const fullPhone = normalizePhone(phone);

    if (!fullPhone) {
        return {
            success: false,
            error: 'Invalid phone number',
            customer: null,
            totalResults: 0,
        };
    }

    try {
        console.log(`[TPOS-CUSTOMER] Searching for phone: ${fullPhone}`);

        // Get TPOS token
        const token = await tposTokenManager.getToken();

        // Call TPOS Partner API with full phone
        const tposUrl = `https://tomato.tpos.vn/odata/Partner/ODataService.GetViewV2?Type=Customer&Active=true&Phone=${fullPhone}&$top=10&$orderby=DateCreated+desc&$count=true`;

        const response = await fetchWithRetry(
            tposUrl,
            {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            },
            2,
            1000,
            15000
        );

        if (!response.ok) {
            throw new Error(`TPOS API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const totalResults = data['@odata.count'] || 0;

        console.log(`[TPOS-CUSTOMER] Found ${totalResults} total results for ${fullPhone}`);

        if (!data.value || !Array.isArray(data.value) || data.value.length === 0) {
            return {
                success: true,
                customer: null,
                totalResults: 0,
            };
        }

        // Find EXACT match with full phone
        for (const customer of data.value) {
            const customerPhone = customer.Phone?.replace(/\D/g, '').slice(-10);

            // Check for exact match
            if (customerPhone === fullPhone) {
                console.log(
                    `[TPOS-CUSTOMER] ✅ Found exact match: ${customer.Name || customer.DisplayName}`
                );
                return {
                    success: true,
                    customer: {
                        id: customer.Id,
                        name: customer.Name || customer.DisplayName,
                        phone: customerPhone,
                        email: customer.Email,
                        address: customer.FullAddress || customer.Street,
                        network: customer.NameNetwork,
                        status: customer.StatusText, // Use StatusText, not Status
                        dateCreated: customer.DateCreated,
                        // Raw data for backup
                        raw: {
                            DateCreated: customer.DateCreated,
                            DateModified: customer.DateModified,
                            Active: customer.Active,
                        },
                    },
                    totalResults,
                };
            }
        }

        // No exact match found, return first result as best match
        const firstCustomer = data.value[0];
        console.log(
            `[TPOS-CUSTOMER] No exact match, using first result: ${firstCustomer.Name || firstCustomer.DisplayName}`
        );

        return {
            success: true,
            customer: {
                id: firstCustomer.Id,
                name: firstCustomer.Name || firstCustomer.DisplayName,
                phone: firstCustomer.Phone?.replace(/\D/g, '').slice(-10),
                email: firstCustomer.Email,
                address: firstCustomer.FullAddress || firstCustomer.Street,
                network: firstCustomer.NameNetwork,
                status: firstCustomer.StatusText, // Use StatusText, not Status
                dateCreated: firstCustomer.DateCreated,
                raw: {
                    DateCreated: firstCustomer.DateCreated,
                    DateModified: firstCustomer.DateModified,
                    Active: firstCustomer.Active,
                },
            },
            totalResults,
            exactMatch: false,
        };
    } catch (error) {
        console.error('[TPOS-CUSTOMER] Error:', error);
        return {
            success: false,
            error: error.message,
            customer: null,
            totalResults: 0,
        };
    }
}

/**
 * Get TPOS customer by ID
 * @param {number|string} tposId - TPOS customer ID
 * @returns {Promise<{success: boolean, customer: object|null, error?: string}>}
 */
async function getCustomerById(tposId) {
    if (!tposId) {
        return {
            success: false,
            error: 'TPOS ID is required',
            customer: null,
        };
    }

    try {
        console.log(`[TPOS-CUSTOMER] Fetching customer by ID: ${tposId}`);

        // Get TPOS token
        const token = await tposTokenManager.getToken();

        // Call TPOS Partner API with ID filter
        const tposUrl = `https://tomato.tpos.vn/odata/Partner/ODataService.GetViewV2?Type=Customer&$filter=Id eq ${tposId}`;

        const response = await fetchWithRetry(
            tposUrl,
            {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            },
            2,
            1000,
            15000
        );

        if (!response.ok) {
            throw new Error(`TPOS API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.value || !Array.isArray(data.value) || data.value.length === 0) {
            console.log(`[TPOS-CUSTOMER] Customer not found with ID: ${tposId}`);
            return {
                success: true,
                customer: null,
            };
        }

        const customer = data.value[0];
        console.log(`[TPOS-CUSTOMER] ✅ Found customer: ${customer.Name || customer.DisplayName}`);

        return {
            success: true,
            customer: {
                id: customer.Id,
                name: customer.Name || customer.DisplayName,
                phone: customer.Phone?.replace(/\D/g, '').slice(-10),
                email: customer.Email,
                address: customer.FullAddress || customer.Street,
                network: customer.NameNetwork,
                status: customer.StatusText, // Use StatusText, not Status
                dateCreated: customer.DateCreated,
                raw: {
                    DateCreated: customer.DateCreated,
                    DateModified: customer.DateModified,
                    Active: customer.Active,
                },
            },
        };
    } catch (error) {
        console.error('[TPOS-CUSTOMER] Error:', error);
        return {
            success: false,
            error: error.message,
            customer: null,
        };
    }
}

/**
 * Search multiple customers by phone (returns all matches, not just first)
 * @param {string} phone - Phone number to search
 * @returns {Promise<{success: boolean, customers: array, totalResults: number, error?: string}>}
 */
async function searchAllCustomersByPhone(phone) {
    const fullPhone = normalizePhone(phone);

    if (!fullPhone) {
        return {
            success: false,
            error: 'Invalid phone number',
            customers: [],
            totalResults: 0,
        };
    }

    try {
        console.log(`[TPOS-CUSTOMER] Searching all customers for phone: ${fullPhone}`);

        const token = await tposTokenManager.getToken();

        const tposUrl = `https://tomato.tpos.vn/odata/Partner/ODataService.GetViewV2?Type=Customer&Active=true&Phone=${fullPhone}&$top=50&$orderby=DateCreated+desc&$count=true`;

        const response = await fetchWithRetry(
            tposUrl,
            {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            },
            2,
            1000,
            15000
        );

        if (!response.ok) {
            throw new Error(`TPOS API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const totalResults = data['@odata.count'] || 0;

        if (!data.value || !Array.isArray(data.value) || data.value.length === 0) {
            return {
                success: true,
                customers: [],
                totalResults: 0,
            };
        }

        const customers = data.value.map((customer) => ({
            id: customer.Id,
            name: customer.Name || customer.DisplayName,
            phone: customer.Phone?.replace(/\D/g, '').slice(-10),
            email: customer.Email,
            address: customer.FullAddress || customer.Street,
            network: customer.NameNetwork,
            status: customer.StatusText, // Use StatusText, not Status
            dateCreated: customer.DateCreated,
        }));

        console.log(`[TPOS-CUSTOMER] Found ${customers.length} customers for ${fullPhone}`);

        return {
            success: true,
            customers,
            totalResults,
        };
    } catch (error) {
        console.error('[TPOS-CUSTOMER] Error:', error);
        return {
            success: false,
            error: error.message,
            customers: [],
            totalResults: 0,
        };
    }
}

/**
 * Push customer info (name, phone, address) lên TPOS Partner — for 2-way sync.
 *
 * Per user spec 2026-06-01: tên/SĐT/địa chỉ sync 2 chiều giữa Web 2.0 và TPOS.
 * Native-orders gọi hàm này khi user PATCH customer info → đẩy lên TPOS.
 *
 * @param {string} phone — phone normalized
 * @param {object} fields — { name?, address?, tposId? } — phải có ít nhất name HOẶC address
 * @returns {Promise<{success, tposId?, error?}>}
 *
 * Strategy:
 *   1. Nếu fields.tposId có sẵn → call UpdatePartner trực tiếp
 *   2. Else → lookup TPOS by phone trước; nếu match thì UpdatePartner, không thì CreatePartner
 *
 * Fire-and-forget OK: caller không cần await response để continue. Errors logged.
 */
async function pushCustomerToTPOS(phone, fields = {}) {
    const normalized = normalizePhone(phone);
    if (!normalized) return { success: false, error: 'Invalid phone' };
    const { name, address } = fields;
    if (!name && !address) return { success: false, error: 'name or address required' };

    try {
        const token = await tposTokenManager.getToken();
        let tposId = fields.tposId || null;

        // Lookup existing TPOS partner nếu chưa biết tposId
        if (!tposId) {
            try {
                const lookup = await searchCustomerByPhone(normalized);
                if (lookup.success && lookup.customer?.id) {
                    tposId = lookup.customer.id;
                }
            } catch (e) {
                console.warn(`[TPOS-PUSH] lookup fail for ${normalized}: ${e.message}`);
            }
        }

        // Build CreateUpdatePartner payload — minimal fields chỉ KH info
        const payload = {
            model: {
                Id: tposId || null,
                Name: name || undefined,
                Phone: normalized,
                Street: address || undefined,
                CustomerTypeId: 1, // Customer (not Vendor)
                IsCustomer: true,
            },
        };
        const url =
            'https://tomato.tpos.vn/odata/SaleOnline_Order/ODataService.CreateUpdatePartner';
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json;charset=UTF-8',
            },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const txt = await response.text().catch(() => '');
            throw new Error(`HTTP ${response.status} ${txt.slice(0, 200)}`);
        }
        const result = await response.json().catch(() => ({}));
        const updatedId = result?.Id || result?.value?.Id || tposId;
        console.log(
            `[TPOS-PUSH] ${tposId ? 'Updated' : 'Created'} partner ${normalized} → tposId=${updatedId}`
        );
        return { success: true, tposId: updatedId };
    } catch (e) {
        console.warn(`[TPOS-PUSH] failed for ${normalized}: ${e.message}`);
        return { success: false, error: e.message };
    }
}

/**
 * Lookup TPOS customer info qua FB User ID (Facebook_ASUserId field trên
 * SaleOnline_Order). Trả về Partner expand từ order mới nhất → có name,
 * phone, address.
 *
 * Per user 2026-06-01: tpos-pancake tạo đơn từ comment → cần lấy phone +
 * address của KH từ TPOS. FB comments không có phone/address; phải lookup
 * qua SaleOnline_Order existed của KH (lastest order's Partner).
 *
 * @param {string} fbUserId — Facebook_ASUserId
 * @returns {Promise<{success, customer?: {id, name, phone, address, fbUserId}, error?}>}
 */
async function searchCustomerByFbUserId(fbUserId, crmTeamId) {
    if (!fbUserId) return { success: false, error: 'fbUserId required' };
    try {
        const token = await tposTokenManager.getToken();
        // TPOS có endpoint chuyên dụng: `/rest/v2.0/chatomni/info/{crmTeamId}_{fbUserId}`
        // trả về Partner đầy đủ (Name, Phone, Street, FullAddress). Đây là endpoint
        // tpos-pancake browser dùng để load partner cache → proven works.
        //
        // SaleOnline_Order GetViewV2 với $filter=Facebook_ASUserId KHÔNG hoạt động:
        // - $expand=Partner → 400 "Could not find a property named 'Partner'"
        // - bỏ $expand → 500 "Lỗi hệ thống cơ sở dữ liệu" (TPOS DB error)
        // → fallback dùng chatomni/info.
        //
        // crmTeamId fallback: nếu không truyền, dùng env var (mặc định Pancake page chính).
        const teamId = crmTeamId || process.env.TPOS_DEFAULT_CRM_TEAM_ID || '10037'; // 10037 = Nhi Judy House
        const tposUrl = `https://tomato.tpos.vn/rest/v2.0/chatomni/info/${encodeURIComponent(teamId)}_${encodeURIComponent(String(fbUserId))}`;
        const response = await fetchWithRetry(
            tposUrl,
            {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                },
            },
            2,
            1000,
            15000
        );
        if (!response.ok) {
            let detail = '';
            try {
                const j = await response.json();
                detail = j?.error?.message || JSON.stringify(j).slice(0, 200);
            } catch {}
            console.warn(
                `[TPOS-CUSTOMER] searchCustomerByFbUserId(${fbUserId}, team=${teamId}) → ${response.status}${detail ? ': ' + detail : ''}`
            );
            return {
                success: false,
                error: `TPOS API ${response.status}${detail ? ': ' + detail : ''}`,
            };
        }
        const data = await response.json();
        const partner = data?.Partner || data?.partner || null;
        if (!partner) {
            return { success: true, customer: null };
        }
        const phone = partner.Phone || partner.Mobile || null;
        const address =
            partner.FullAddress ||
            partner.Street ||
            [partner.Street, partner.Ward, partner.District, partner.City]
                .filter(Boolean)
                .join(', ') ||
            null;
        const customer = {
            id: partner.Id || null,
            name: partner.Name || partner.DisplayName || null,
            phone: phone ? String(phone).replace(/\D/g, '').slice(-10) : null,
            address,
            fbUserId,
            tposPartnerId: partner.Id || null,
            tposPartner: partner,
        };
        console.log(
            `[TPOS-CUSTOMER] FB ID ${fbUserId} (team ${teamId}) → PartnerId ${partner.Id} (${customer.name}, ${customer.phone || 'no phone'})`
        );
        return { success: true, customer };
    } catch (e) {
        console.error('[TPOS-CUSTOMER] searchCustomerByFbUserId error:', e.message);
        return { success: false, error: e.message };
    }
}

/**
 * Search KH theo TEXT tự do (tên HOẶC SĐT) — TPOS GetViewV2 &search=.
 * Dùng cho web2_customers self-populate + fallback live khi local trống.
 * @param {string} text
 * @param {number} top
 * @returns {Promise<{success, customers:[{id,name,phone,email,address,status,dateCreated}], totalResults}>}
 */
async function searchCustomersByText(text, top = 20) {
    const q = String(text || '').trim();
    if (q.length < 2) return { success: true, customers: [], totalResults: 0 };
    try {
        const token = await tposTokenManager.getToken();
        const tposUrl =
            `https://tomato.tpos.vn/odata/Partner/ODataService.GetViewV2?Type=Customer&Active=true` +
            `&search=${encodeURIComponent(q)}&$top=${top}&$orderby=DateCreated+desc&$count=true`;
        const response = await fetchWithRetry(
            tposUrl,
            {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            },
            2,
            1000,
            15000
        );
        if (!response.ok) throw new Error(`TPOS API error: ${response.status}`);
        const data = await response.json();
        const customers = (data.value || []).map((c) => ({
            id: c.Id,
            name: c.Name || c.DisplayName,
            phone: c.Phone?.replace(/\D/g, '').slice(-10),
            email: c.Email,
            address: c.FullAddress || c.Street,
            status: c.StatusText,
            dateCreated: c.DateCreated,
        }));
        return { success: true, customers, totalResults: data['@odata.count'] || customers.length };
    } catch (error) {
        console.error('[TPOS-CUSTOMER] searchCustomersByText error:', error.message);
        return { success: false, error: error.message, customers: [], totalResults: 0 };
    }
}

module.exports = {
    searchCustomerByPhone,
    searchCustomerByFbUserId,
    getCustomerById,
    searchAllCustomersByPhone,
    searchCustomersByText,
    normalizePhone,
    pushCustomerToTPOS,
};
