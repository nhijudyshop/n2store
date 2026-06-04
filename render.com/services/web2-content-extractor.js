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
const PHONE_EXTRACTION_BLACKLIST = [
    '75918', // shop ACB account
    '0123456788', // test customer mặc định "Huỳnh Thành Đạt"
    '0912121212', // test phone all-repeat pattern
    '0123456789', // test phone sequential
    // Pattern-based test phones detected runtime qua isObviousTestPhone()
];

// Detect obviously fake/test phone patterns to skip extraction.
// Pure pattern check — không catch real customers having unusual phones.
function isObviousTestPhone(s) {
    const digits = String(s).replace(/\D/g, '');
    if (digits.length !== 10) return false;
    // All same digit: 0000000000, 1111111111, …
    if (/^(\d)\1{9}$/.test(digits)) return true;
    // Sequential ascending: 0123456789
    if (digits === '0123456789') return true;
    // Repeating 2-digit pattern: 0xyxyxyxyxy (vd 0912121212)
    if (/^(\d)(\d)\1\2\1\2\1\2\1\2$/.test(digits)) return true;
    return false;
}

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
        return {
            type: 'none',
            value: null,
            uniqueCode: null,
            note: 'NO_CONTENT',
            qrCandidates: [],
            phoneCandidates: [],
        };
    }

    let textToParse = content;
    let isMomo = false;

    // Extract qr_code candidates upfront (independent of type).
    // Format: [A-Z]{2,15}\d{1,15} (uppercase name slug + numeric id) matches
    // generator format <slug(name)><partner_id>, vd 'ANHNGOCHOANG571046'.
    // Legacy 'N2[A-Z0-9]{16}' cũng match. Matcher tries each candidate qua
    // single DB query `WHERE qr_code = ANY($1)`.
    const qrCandidateSet = new Set();
    const upperContent = String(content).toUpperCase();
    const flexibleRe = /\b[A-Z]{2,15}\d{1,15}\b/g;
    let mFlex;
    while ((mFlex = flexibleRe.exec(upperContent)) !== null) {
        const tok = mFlex[0];
        if (tok.length >= 5 && tok.length <= 50) qrCandidateSet.add(tok);
    }
    const legacyRe = /\bN2[A-Z0-9]{16}\b/g;
    let mLeg;
    while ((mLeg = legacyRe.exec(upperContent)) !== null) {
        qrCandidateSet.add(mLeg[0]);
    }
    const qrCandidates = Array.from(qrCandidateSet);

    // Step 1: Strip noise tokens trước khi parse number.
    // Date-time DDMMYY-HH:MM:SS — giữ colon để tránh over-match 6-6 digit
    // pattern (vd 936769-250526 — common trong content). FT/GD bank refs.
    // Chỉ strip GD bank ref dạng có CHỮ (`GD <digits><letters>`, vd
    // 'GD 6151IBT1kCV8PCIK') — đó mới là mã giao dịch ngân hàng.
    textToParse = textToParse
        .replace(/\b\d{6}-\d{2}:\d{2}:\d{2}\b/g, ' ')
        .replace(/\bFT\d{8,}\b/gi, ' ')
        .replace(/\bGD\s+\d+[A-Z]{2,}[A-Z0-9]+\b/gi, ' ');
    // 2026-06-04: KHÔNG strip dash-GD pure-digit (`-GD-<digits>-`) nữa.
    // Trong data shop, dãy số đó CHÍNH LÀ đuôi SĐT khách tự gõ (vd
    // 'coc shop nhi judy-GD-387721-...' → 387721 = đuôi SĐT). User rule:
    // mọi dãy 5–10 digit đều lấy làm phone candidate để tìm KH. Đồng bộ với
    // web2-content-parser.findDashGdPhones (badge đã boost dash-GD). dashGd
    // prioritization ở Step 6 (dashGdRe) sẽ đẩy các số này lên đầu candidate.

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
            qrCandidates,
            phoneCandidates: [mbvcbMatch[1]],
        };
    }

    // Step 4: QR Code path REMOVED từ exclusive return — đã đẩy lên top-level
    // qrCandidates array để matcher có thể check DB cho cả format mới
    // (<slug><partner_id>) lẫn legacy (N2 + 16 chars). Matcher quyết định
    // dùng QR path hay phone path dựa trên DB hit.

    // Step 5: Exact 10-digit phone (0xxxxxxxxx). Skip TPOS partial lookup —
    // chỉ cần verify customer tồn tại trên TPOS để lấy name.
    // Filter out test phone patterns + blacklist.
    const exactPhonesRaw = textToParse.match(/\b0\d{9}\b/g) || [];
    const exactPhones = exactPhonesRaw.filter(
        (p) => !PHONE_EXTRACTION_BLACKLIST.includes(p) && !isObviousTestPhone(p)
    );
    if (exactPhones.length > 0) {
        const exactPhone = exactPhones[exactPhones.length - 1];
        const baseNote =
            exactPhones.length > 1 ? 'MULTIPLE_EXACT_PHONES_FOUND' : 'EXACT_PHONE_EXTRACTED';
        // Phối hợp exact_phone vào phoneCandidates → matcher có thể aggregate
        // với các partial phone trong content (vd vừa có exact 0xxx vừa có
        // partial 6-digit cùng KH).
        return {
            type: 'exact_phone',
            value: exactPhone,
            uniqueCode: `PHONE${exactPhone}`,
            note: isMomo ? `MOMO:${baseNote}` : baseNote,
            qrCandidates,
            phoneCandidates: Array.from(new Set(exactPhones)),
        };
    }

    // Step 6: Phone candidates — LUẬT (user chốt 2026-06-04):
    //   • Chỉ lấy dãy số độ dài 5–10 làm đuôi SĐT candidate.
    //   • Dãy > 10 số = KHÔNG phải SĐT → BỎ QUA hẳn (không cắt 10 số cuối).
    //     vd '0111000157612'(13), '14472716252'(11) = số tài khoản → skip.
    //   • Khớp KH theo ĐUÔI (searchTposByPhone dùng phone.endsWith) → "từ sau
    //     ra trước". Blacklist (STK shop) + test phone filtered.
    // Matcher search từng candidate qua TPOS, aggregate unique phones (dedup),
    // 1 → auto credit, >1 → pending, 0 → no_match.
    const allNumbers = textToParse.match(/\d{5,}/g);
    let phoneCandidates = [];
    if (allNumbers && allNumbers.length > 0) {
        const phoneLikeNumbers = allNumbers.filter((num) => {
            // Dãy > 10 số: không phải SĐT, loại (KHÔNG slice last-10).
            const validLen = num.length >= 5 && num.length <= 10;
            const blacklisted = PHONE_EXTRACTION_BLACKLIST.includes(num);
            const testPattern = num.length === 10 && isObviousTestPhone(num);
            return validLen && !blacklisted && !testPattern;
        });
        if (phoneLikeNumbers.length > 0) {
            // Priority score (smaller = higher priority):
            //   10-digit starting "0" (exact phone) = -1 — highest signal
            //   6 = 0 (most common KH suffix pattern)
            //   7-10 = 1-4
            //   5 = 5
            const lengthScore = (n) => {
                if (n.length === 10 && n.startsWith('0')) return -1;
                if (n.length === 6) return 0;
                if (n.length === 7) return 1;
                if (n.length === 8) return 2;
                if (n.length === 9) return 3;
                if (n.length === 10) return 4;
                if (n.length === 5) return 5;
                return 6;
            };
            const dashGdRe = /[-\s]GD[-\s](\d{5,7})(?:[-\s]|$)/gi;
            const dashGdSet = new Set();
            let mGd;
            while ((mGd = dashGdRe.exec(content)) !== null) {
                dashGdSet.add(mGd[1]);
            }
            const sorted = [...new Set(phoneLikeNumbers)].sort((a, b) => {
                const ga = dashGdSet.has(a) ? 0 : 1;
                const gb = dashGdSet.has(b) ? 0 : 1;
                if (ga !== gb) return ga - gb;
                const sa = lengthScore(a);
                const sb = lengthScore(b);
                if (sa !== sb) return sa - sb;
                return phoneLikeNumbers.indexOf(a) - phoneLikeNumbers.indexOf(b);
            });
            phoneCandidates = sorted;
        }
    }

    if (phoneCandidates.length === 0) {
        return {
            type: 'none',
            value: null,
            uniqueCode: null,
            note: isMomo ? 'MOMO:NO_PHONE_FOUND' : 'NO_PHONE_FOUND',
            qrCandidates,
            phoneCandidates: [],
        };
    }

    // Determine type của best candidate (cho backward compat)
    const best = phoneCandidates[0];
    const bestIsExact = best.length === 10 && best.startsWith('0');
    const baseNote =
        phoneCandidates.length > 1 ? 'MULTIPLE_NUMBERS_FOUND' : 'PARTIAL_PHONE_EXTRACTED';
    return {
        type: bestIsExact ? 'exact_phone' : 'partial_phone',
        value: best,
        uniqueCode: bestIsExact ? `PHONE${best}` : null,
        note: isMomo ? `MOMO:${baseNote}` : baseNote,
        qrCandidates,
        phoneCandidates,
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
