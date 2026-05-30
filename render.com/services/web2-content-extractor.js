// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — self-contained content extractor + TPOS partner search.
// =====================================================================
// Web2ContentExtractor — Extract customer identifier từ SePay transaction
// content + tìm KH trên TPOS Partner API. Self-contained Web 2.0 module,
// zero coupling với route khác trong repo.
// =====================================================================
// Identifier ưu tiên:
//   1. QR Code N2 (N2 + 16 alphanumeric) — match qua web2_payment_qr_codes
//   2. Exact 10-digit phone (0xxxxxxxxx) — auto-credit nếu TPOS có match
//   3. Partial phone 5–10 digits — TPOS partial lookup, single/multi match
// =====================================================================

const tposTokenManager = require('./tpos-token-manager');

// Số tài khoản shop & các số trong content cần bỏ qua. Append vào đây khi
// phát hiện noise mới (vd số tài khoản ngân hàng khác của shop).
const PHONE_EXTRACTION_BLACKLIST = ['75918'];

/**
 * Extract customer identifier từ transaction content.
 * Priority: QR → exact_phone → partial_phone (5–10 digits).
 *
 * @param {string} content - SePay transaction content/description
 * @returns {{
 *   type: 'qr_code' | 'exact_phone' | 'partial_phone' | 'none',
 *   value: string | null,
 *   uniqueCode: string | null,
 *   note: string
 * }}
 */
function extractIdentifier(content) {
    if (!content) {
        return { type: 'none', value: null, uniqueCode: null, note: 'NO_CONTENT' };
    }

    let textToParse = content;
    let isMomo = false;

    // Step 1: Strip noise tokens trước khi parse number.
    // Date-time DDMMYY-HH:MM:SS — giữ colon để tránh over-match 6-6 digit
    // pattern (vd 936769-250526 — common trong content). FT/GD bank refs.
    textToParse = textToParse
        .replace(/\b\d{6}-\d{2}:\d{2}:\d{2}\b/g, ' ')
        .replace(/\bFT\d{8,}\b/gi, ' ')
        .replace(/\bGD\s+\d+[A-Z]{2,}[A-Z0-9]+\b/gi, ' ');

    // Step 2: Momo pattern — {12d}-{10d sender}-{customer content}
    // Extract phần customer content (bỏ sender phone).
    const momoMatch = textToParse.match(/^(\d{12})-(0\d{9})-(.+)$/);
    if (momoMatch) {
        isMomo = true;
        textToParse = momoMatch[3].trim();
    }

    // Step 3: Vietcombank (MBVCB.x.x.x.CT) pattern — phone sau dấu chấm trước .CT
    const mbvcbMatch = textToParse.match(/MBVCB\.[^.]+\.[^.]+\.(\d{5,10})\.CT/i);
    if (mbvcbMatch) {
        return {
            type: 'partial_phone',
            value: mbvcbMatch[1],
            uniqueCode: null,
            note: 'VCB:PARTIAL_PHONE_EXTRACTED',
        };
    }

    // Step 4: QR Code N2 (18 chars: N2 + 16 alphanumeric).
    // Generator: native-orders gửi VietQR cho khách — content kèm qr_code.
    // Lookup table web2_payment_qr_codes (KHÔNG dùng table Web 1.0 cũ).
    const qrMatch = textToParse.match(/\bN2[A-Z0-9]{16}\b/);
    if (qrMatch) {
        return {
            type: 'qr_code',
            value: qrMatch[0],
            uniqueCode: qrMatch[0],
            note: 'QR_CODE_FOUND',
        };
    }

    // Step 5: Exact 10-digit phone (0xxxxxxxxx). Skip TPOS partial lookup —
    // chỉ cần verify customer tồn tại trên TPOS để lấy name.
    const exactPhones = textToParse.match(/\b0\d{9}\b/g);
    if (exactPhones && exactPhones.length > 0) {
        const exactPhone = exactPhones[exactPhones.length - 1];
        const baseNote =
            exactPhones.length > 1 ? 'MULTIPLE_EXACT_PHONES_FOUND' : 'EXACT_PHONE_EXTRACTED';
        return {
            type: 'exact_phone',
            value: exactPhone,
            uniqueCode: `PHONE${exactPhone}`,
            note: isMomo ? `MOMO:${baseNote}` : baseNote,
        };
    }

    // Step 6: Partial phone — number 5–10 digits, blacklist filtered.
    // Sort priority: 6 > 7-10 > 5 (6-digit là pattern KH phổ biến nhất ở VN).
    // BOOST: phone trong '-GD-<digit>-' pattern (customer-typed) ưu tiên cao nhất.
    const allNumbers = textToParse.match(/\d{5,}/g);
    if (allNumbers && allNumbers.length > 0) {
        const phoneLikeNumbers = allNumbers.filter((num) => {
            const validLen = num.length >= 5 && num.length <= 10;
            const blacklisted = PHONE_EXTRACTION_BLACKLIST.includes(num);
            return validLen && !blacklisted;
        });
        if (phoneLikeNumbers.length > 0) {
            const lengthScore = (n) =>
                n.length === 6
                    ? 0
                    : n.length === 7
                      ? 1
                      : n.length === 8
                        ? 2
                        : n.length === 9
                          ? 3
                          : n.length === 10
                            ? 4
                            : n.length === 5
                              ? 5
                              : 6;
            const dashGdRe = /[-\s]GD[-\s](\d{5,7})(?:[-\s]|$)/gi;
            const dashGdSet = new Set();
            let mGd;
            while ((mGd = dashGdRe.exec(content)) !== null) {
                dashGdSet.add(mGd[1]);
            }
            const sorted = [...phoneLikeNumbers].sort((a, b) => {
                const ga = dashGdSet.has(a) ? 0 : 1;
                const gb = dashGdSet.has(b) ? 0 : 1;
                if (ga !== gb) return ga - gb;
                const sa = lengthScore(a);
                const sb = lengthScore(b);
                if (sa !== sb) return sa - sb;
                return phoneLikeNumbers.indexOf(a) - phoneLikeNumbers.indexOf(b);
            });
            const baseNote =
                phoneLikeNumbers.length > 1 ? 'MULTIPLE_NUMBERS_FOUND' : 'PARTIAL_PHONE_EXTRACTED';
            return {
                type: 'partial_phone',
                value: sorted[0],
                uniqueCode: null,
                note: isMomo ? `MOMO:${baseNote}` : baseNote,
            };
        }
    }

    return {
        type: 'none',
        value: null,
        uniqueCode: null,
        note: isMomo ? 'MOMO:NO_PHONE_FOUND' : 'NO_PHONE_FOUND',
    };
}

/**
 * Normalize phone từ raw TPOS Phone field về dạng VN canonical (0xxxxxxxxx).
 * Handle cả format "84xxxxxxxxx" / "+84 ..." (TPOS đôi khi lưu cả 2).
 *
 * @param {string} rawPhone
 * @returns {string|null} 10-digit VN phone or null nếu invalid
 */
function normalizePhone(rawPhone) {
    if (!rawPhone) return null;
    let s = String(rawPhone).replace(/\D/g, '');
    if (!s) return null;
    // Strip "84" prefix nếu có (TPOS lưu "84368900611" → "0368900611")
    if (s.startsWith('84') && s.length >= 11) {
        s = '0' + s.slice(2);
    }
    s = s.slice(-10);
    if (s.length === 10 && s.startsWith('0')) return s;
    return null;
}

/**
 * Search TPOS Partner API by partial/exact phone. Returns grouped unique
 * customers by 10-digit phone. Accept any partial 5–10 digits.
 *
 * @param {string} partialPhone - 5–10 digit substring
 * @param {Function} fetchWithTimeout
 * @returns {Promise<{
 *   success: boolean,
 *   uniquePhones: Array<{phone: string, customers: Array, count: number}>,
 *   totalResults: number,
 *   error?: string
 * }>}
 */
async function searchTposByPhone(partialPhone, fetchWithTimeout) {
    try {
        const token = await tposTokenManager.getToken();
        const tposUrl = `https://tomato.tpos.vn/odata/Partner/ODataService.GetViewV2?Type=Customer&Active=true&Phone=${partialPhone}&$top=50&$orderby=DateCreated+desc&$count=true`;
        const response = await fetchWithTimeout(
            tposUrl,
            {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            },
            15000
        );
        if (!response.ok) {
            throw new Error(`TPOS API error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        const totalResults = data['@odata.count'] || 0;
        if (!data.value || !Array.isArray(data.value) || data.value.length === 0) {
            return { success: true, uniquePhones: [], totalResults: 0 };
        }
        const phoneMap = new Map();
        for (const customer of data.value) {
            const phone = normalizePhone(customer.Phone);
            if (!phone) continue;
            if (!phoneMap.has(phone)) phoneMap.set(phone, []);
            phoneMap.get(phone).push({
                id: customer.Id,
                name: customer.Name || customer.DisplayName,
                phone,
                email: customer.Email,
                address: customer.FullAddress || customer.Street,
                network: customer.NameNetwork,
                status: customer.Status,
                credit: customer.Credit,
                debit: customer.Debit,
            });
        }
        const all = Array.from(phoneMap.entries()).map(([phone, customers]) => ({
            phone,
            customers,
            count: customers.length,
        }));
        // Filter: chỉ giữ phone có suffix khớp partialPhone (endsWith).
        // VD partialPhone='81118' → giữ 0938281118, loại 0938811182.
        const filtered = all.filter(({ phone }) => phone.endsWith(partialPhone));
        return { success: true, uniquePhones: filtered, totalResults };
    } catch (error) {
        console.error('[Web2ContentExtractor] TPOS search error:', error.message);
        return {
            success: false,
            error: error.message,
            uniquePhones: [],
            totalResults: 0,
        };
    }
}

module.exports = {
    extractIdentifier,
    searchTposByPhone,
    normalizePhone,
    PHONE_EXTRACTION_BLACKLIST,
};
