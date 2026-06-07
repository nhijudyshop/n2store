// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — nhận diện SĐT + địa chỉ trong tin nhắn chat (Feature 3).
// =====================================================================
// Web2ChatEntityDetect — quét text tin nhắn KH để rút SĐT + địa chỉ VN.
//   Web2ChatEntityDetect.phones(text)    -> ['0912345678', ...] (chuẩn hoá 0xxxxxxxxx)
//   Web2ChatEntityDetect.addresses(text) -> ['64/47 Nguyễn Phúc Chu, P15, Tân Bình', ...]
//   Web2ChatEntityDetect.scan(text)      -> { phones:[], addresses:[] }
//   Web2ChatEntityDetect.scanMessages(msgs, {onlyIncoming,pageId}) -> gộp từ nhiều tin
// Không phụ thuộc DOM. Heuristic — ưu tiên ít false-positive (chip để user xác nhận).
// =====================================================================
(function (global) {
    // SĐT VN: di động 10 số (đầu 03/05/07/08/09) hoặc +84/84. Bắt cả khi dính chữ
    // số khác bằng cách normalize rồi validate. Cho phép dấu cách/.- giữa cụm.
    const PHONE_RE = /(?:\+?84|0)\s?(?:\d[\s.\-]?){9}/g;
    function normalizePhone(raw) {
        let d = String(raw).replace(/\D/g, '');
        if (d.startsWith('84')) d = '0' + d.slice(2);
        if (d.length === 11 && d.startsWith('00')) d = d.slice(1);
        // hợp lệ: 10 số, đầu 0, số thứ 2 ∈ 3/5/7/8/9 (di động VN)
        if (/^0[35789]\d{8}$/.test(d)) return d;
        // landline 11 số (0 + mã vùng) — chấp nhận 10-11 số đầu 0
        if (/^0\d{9,10}$/.test(d) && d.length === 11) return d;
        return null;
    }

    function phones(text) {
        if (!text) return [];
        const out = [];
        const seen = new Set();
        const m = String(text).match(PHONE_RE) || [];
        for (const raw of m) {
            const p = normalizePhone(raw);
            if (p && !seen.has(p)) {
                seen.add(p);
                out.push(p);
            }
        }
        return out;
    }

    // Từ khoá địa chỉ VN. ≥1 từ khoá cấp hành chính + có số nhà / tên đường ⇒ là địa chỉ.
    const ADDR_KW =
        /(số nhà|đường|phố|ngõ|hẻm|ấp|thôn|tổ|khu phố|kp\b|phường|p\.?\s?\d|quận|q\.?\s?\d|huyện|thị xã|thị trấn|xã|tỉnh|thành phố|tp\.?|tp\b|hcm|hà nội|đà nẵng)/i;
    function addresses(text) {
        if (!text) return [];
        const out = [];
        const seen = new Set();
        // Tách theo xuống dòng; địa chỉ thường nằm trọn 1 dòng.
        const lines = String(text)
            .split(/[\n\r]+/)
            .map((s) => s.trim())
            .filter(Boolean);
        for (const line of lines) {
            // bỏ dòng quá ngắn hoặc thuần SĐT
            if (line.length < 8) continue;
            const kwHits = (line.match(new RegExp(ADDR_KW, 'gi')) || []).length;
            const hasNum = /\d/.test(line);
            const hasComma = /,/.test(line);
            // Tiêu chí: (≥2 từ khoá) HOẶC (≥1 từ khoá + có số + có dấu phẩy phân cấp)
            if (kwHits >= 2 || (kwHits >= 1 && hasNum && hasComma)) {
                // bỏ nhãn SĐT + chính số ĐT khỏi địa chỉ (để fill đơn cho sạch)
                const cleaned = line
                    .replace(/[-–,.\s]*\b(s[đd]t|đt|phone|tel|sđt)\b\s*:?.*$/i, '')
                    .replace(PHONE_RE, '')
                    .replace(/\s*[-–,.]+\s*$/g, '')
                    .replace(/\s{2,}/g, ' ')
                    .trim();
                if (cleaned.length >= 8 && !seen.has(cleaned.toLowerCase())) {
                    seen.add(cleaned.toLowerCase());
                    out.push(cleaned);
                }
            }
        }
        return out;
    }

    function scan(text) {
        return { phones: phones(text), addresses: addresses(text) };
    }

    // Gộp entity từ 1 mảng tin nhắn. Mặc định chỉ quét tin KH (incoming) — tin shop
    // gửi đi thường chứa địa chỉ xác nhận (không phải KH cung cấp). Ưu tiên tin mới nhất.
    function scanMessages(msgs, opts) {
        opts = opts || {};
        const pageId = opts.pageId;
        const onlyIncoming = opts.onlyIncoming !== false;
        const ph = [];
        const ad = [];
        const seenP = new Set();
        const seenA = new Set();
        const list = (msgs || []).slice().reverse(); // mới nhất trước
        for (const m of list) {
            if (onlyIncoming && pageId) {
                const isOut =
                    (m.from && String(m.from.id) === String(pageId)) || m.from_admin || m.is_admin;
                if (isOut) continue;
            }
            const text = m.message || m.text || m.content || '';
            for (const p of phones(text)) if (!seenP.has(p)) (seenP.add(p), ph.push(p));
            for (const a of addresses(text)) {
                const k = a.toLowerCase();
                if (!seenA.has(k)) (seenA.add(k), ad.push(a));
            }
            if (ph.length >= 3 && ad.length >= 2) break; // đủ dùng
        }
        return { phones: ph, addresses: ad };
    }

    global.Web2ChatEntityDetect = {
        phones,
        addresses,
        scan,
        scanMessages,
        normalizePhone,
    };
})(window);
