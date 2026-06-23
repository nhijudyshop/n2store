// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE — tạo caption + hashtag bán hàng (FREE template, optional AI).
// =====================================================================
// Web 2.0 — Sinh nội dung bài đăng Facebook tiếng Việt cho shop thời trang.
//
// MẶC ĐỊNH = template offline (FREE, tức thì, KHÔNG gọi API) → trả lời đúng yêu
// cầu user "có github nào miễn phí không, Gemini mất tiền/lâu".
//
// AI rewrite (TUỲ CHỌN, chỉ khi user bấm) ưu tiên Groq (FREE + cực nhanh,
// llama-3.3-70b) → fallback DeepSeek → Gemini. Key đọc từ env (KHÔNG hardcode).
//   - GROQ_API_KEY   (free, nhanh nhất)  → set ở Render env (giá trị #38 serect_dont_push.txt)
//   - DEEPSEEK_API_KEY / GEMINI_API_KEY (đã có sẵn)
// =====================================================================

'use strict';

const ai = require('./web2-ai-service'); // group xoay nhiều key TẬP TRUNG (Groq/Gemini/OpenRouter)

// ── Hashtag bank (offline, FREE) — theo từ khoá danh mục thời trang VN ──────
const HASHTAG_BASE = ['#NhiJudy', '#thoitrang', '#shoponline', '#sale', '#xinhxan'];
const HASHTAG_MAP = [
    {
        kw: ['áo', 'sơ mi', 'thun', 'croptop', 'kiểu'],
        tags: ['#ao', '#aodep', '#aothun', '#aosomi'],
    },
    { kw: ['quần', 'jean', 'short', 'tây', 'baggy'], tags: ['#quan', '#quanjean', '#quandep'] },
    { kw: ['váy', 'đầm', 'maxi'], tags: ['#vay', '#dam', '#vaydep', '#damdep'] },
    { kw: ['set', 'bộ', 'jumpsuit'], tags: ['#setbo', '#dobo', '#bodep'] },
    { kw: ['giày', 'dép', 'sandal', 'sneaker'], tags: ['#giay', '#dep', '#giaydep'] },
    { kw: ['túi', 'balo', 'ví'], tags: ['#tui', '#tuixach', '#balo'] },
    { kw: ['phụ kiện', 'kính', 'nón', 'mũ', 'dây'], tags: ['#phukien', '#accessories'] },
    { kw: ['đông', 'len', 'khoác', 'hoodie', 'nỉ'], tags: ['#aokhoac', '#dodong', '#len'] },
];

// ── Caption templates (offline, FREE) — nhiều phong cách ──────────────────
// ⚠ Tránh engagement-bait (cmt từ khoá / xin SĐT công khai), ALL-CAPS hô hào,
// khan hiếm giả ("kẻo hết", "số lượng có hạn"). FB demote reach các kiểu này.
// CTA "Inbox shop" = an toàn (thao tác mua bán cốt lõi) → giữ.
const TEMPLATES = {
    sale: (p) =>
        `🛍️ ${p.name}${p.price ? ` – ${fmtMoney(p.price)}` : ''}${
            p.discount ? ` (giảm ${p.discount})` : ''
        }\n` +
        `✨ Chất đẹp, form chuẩn, lên dáng xinh.\n` +
        `🛒 Inbox shop để được tư vấn & chốt đơn nha cả nhà ơi 💕`,
    new: (p) =>
        `🆕 Hàng mới về: ${p.name}\n` +
        `${p.price ? `💸 Giá: ${fmtMoney(p.price)}\n` : ''}` +
        `😍 Mẫu mới xinh lắm nè.\n` +
        `📩 Inbox shop để được tư vấn size + màu nhé.`,
    livestream: (p) =>
        `📣 ĐANG LIVE 📣 Hôm nay shop có ${p.name}${
            p.price ? ` giá chỉ từ ${fmtMoney(p.price)}` : ''
        }!\n` +
        `😍 Vào live xem mẫu mới + tư vấn size/màu trực tiếp nha.\n` +
        `📩 Inbox shop để được chốt đơn nhanh.`,
    restock: (p) =>
        `🔁 Có hàng lại: ${p.name}\n` +
        `${p.price ? `Giá: ${fmtMoney(p.price)}\n` : ''}` +
        `Lần này về đủ size đủ màu, inbox shop để được tư vấn nha 💕`,
    simple: (p) =>
        `${p.name}${p.price ? ` – ${fmtMoney(p.price)}` : ''}\n` +
        `${p.desc || 'Inbox shop để được tư vấn nhé!'} 💕`,
};

// Ghi giá kiểu shop livestream (vui nhộn) — KHÔNG ghi "14.000đ". Hậu tố ngẫu nhiên
// k/xu/kk/kkk để mỗi bài hơi khác (user chốt 2026-06-19). Triệu → "1tr"/"1tr5".
const _PRICE_SUFFIX = ['k', 'xu', 'kk', 'kkk'];
function fmtMoney(v) {
    const n = Number(String(v).replace(/[^\d]/g, ''));
    if (!n) return String(v || '');
    if (n >= 1000000) {
        const tr = n / 1000000;
        const whole = Math.floor(tr);
        const dec = Math.round((tr - whole) * 10);
        return dec ? `${whole}tr${dec}` : `${whole}tr`;
    }
    const suf = _PRICE_SUFFIX[Math.floor(Math.random() * _PRICE_SUFFIX.length)];
    const k = n / 1000;
    if (Number.isInteger(k)) return `${k}${suf}`; // 14000 → 14k / 14xu / 14kkk
    const wholeK = Math.floor(k);
    const dec = Math.round((k - wholeK) * 10);
    return `${wholeK}k${dec}`; // 14500 → 14k5
}

/** Sinh hashtag offline từ tên/danh mục SP. */
function buildHashtags(text) {
    const low = (text || '').toLowerCase();
    const set = new Set(HASHTAG_BASE);
    for (const grp of HASHTAG_MAP) {
        if (grp.kw.some((k) => low.includes(k))) grp.tags.forEach((t) => set.add(t));
    }
    // ≤6 hashtag: FB (4/2025) coi 7+ là spam → chỉ hiện cho follower + mất đề xuất.
    return [...set].slice(0, 6);
}

/**
 * Sinh caption + hashtag bằng TEMPLATE (FREE, offline, tức thì).
 * @param {object} product {name, price, discount, desc, category}
 * @param {string} style sale|new|livestream|restock|simple
 * @returns {{caption, hashtags, text}}
 */
function generateTemplate(product = {}, style = 'sale') {
    const p = {
        name: (product.name || 'Sản phẩm').trim(),
        price: product.price || '',
        discount: product.discount || '',
        desc: product.desc || '',
    };
    const tpl = TEMPLATES[style] || TEMPLATES.sale;
    const caption = tpl(p);
    const hashtags = buildHashtags(`${p.name} ${product.category || ''} ${p.desc}`);
    return { caption, hashtags, text: `${caption}\n\n${hashtags.join(' ')}` };
}

// ── AI rewrite (tuỳ chọn) ──────────────────────────────────────────────────

const SYSTEM_VI =
    'Bạn là chủ shop thời trang nữ dễ thương trên Facebook (giọng văn Việt Nam, ' +
    'thân thiện, gần gũi, dùng emoji vừa phải, kêu gọi inbox/chốt đơn). ' +
    'XƯNG HÔ: shop tự xưng "em" / "bọn em" / "shop". Gọi khách bằng "chị" thân mật + khen nhẹ: ' +
    '"các chị" / "mấy chị" / "chị đẹp" / "chị dễ thương" / "các nàng" / "cả nhà" (đa dạng, tự nhiên). ' +
    'TUYỆT ĐỐI KHÔNG xưng "chúng tôi" / "chúng tớ" / "công ty"; KHÔNG gọi khách là "các bạn" / "bạn" ' +
    '(dùng "chị" thay thế). ' +
    'Viết caption NGẮN GỌN, cuốn hút, KHÔNG bịa thông tin sai. Trả về chỉ phần caption (không kèm giải thích). ' +
    'KHÔNG dùng mồi tương tác (đừng yêu cầu tag bạn bè / share / comment từ khoá / để lại ' +
    'SĐT công khai). KHÔNG bịa khuyến mãi/giá. Tránh viết HOA toàn bộ và câu khẩn cấp giả tạo ' +
    '("kẻo hết", "số lượng có hạn"). CTA an toàn: mời inbox shop. ' +
    'GIÁ ghi kiểu rút gọn shop (14k / 14xu / 14kkk cho 14.000; 150k cho 150.000; 1tr cho 1 triệu) ' +
    '— TUYỆT ĐỐI KHÔNG ghi "14.000đ" hay "đ".';

// Lưới an toàn: ép tông thân thiện — thay xưng hô trang trọng nếu AI lỡ dùng.
function _friendlyTone(text) {
    if (!text) return text;
    return (
        text
            .replace(/Chúng tôi/g, 'Bọn em')
            .replace(/chúng tôi/g, 'bọn em')
            .replace(/Chúng tớ/g, 'Bọn em')
            .replace(/chúng tớ/g, 'bọn em')
            .replace(/của công ty/gi, 'của shop')
            .replace(/Các bạn/g, 'Các chị')
            .replace(/các bạn/g, 'các chị')
            // "bạn ơi"/"bạn nhé" → "chị ơi"/"chị nhé" (giữ "shop"/"em" nguyên)
            .replace(/\bbạn ơi/g, 'chị ơi')
            .replace(/\bBạn ơi/g, 'Chị ơi')
    );
}

/** Gọi AI theo chuỗi ưu tiên Groq → DeepSeek → Gemini. Trả {out, provider} (out=null nếu thiếu key/lỗi). */
async function aiComplete(prompt) {
    let out = await callGroq(prompt).catch(() => null);
    if (out) return { out: _friendlyTone(out), provider: 'groq' };
    out = await callDeepSeek(prompt).catch(() => null);
    if (out) return { out: _friendlyTone(out), provider: 'deepseek' };
    out = await callGemini(prompt).catch(() => null);
    if (out) return { out: _friendlyTone(out), provider: 'gemini' };
    return { out: null, provider: 'template' };
}

/**
 * Viết lại / sinh caption bằng AI. Ưu tiên Groq (free+nhanh) → DeepSeek → Gemini.
 * Nếu KHÔNG có key nào → fallback template (vẫn FREE, không lỗi).
 * @returns {{caption, hashtags, text, provider}}
 */
async function generateAI(product = {}, style = 'sale') {
    const base = generateTemplate(product, style);
    const prompt =
        `Viết caption Facebook bán hàng phong cách "${style}" cho sản phẩm:\n` +
        `- Tên: ${product.name || ''}\n` +
        (product.price
            ? `- Giá (ghi y nguyên kiểu rút gọn này, KHÔNG đổi sang đ): ${fmtMoney(product.price)}\n`
            : '') +
        (product.discount ? `- Khuyến mãi: ${product.discount}\n` : '') +
        (product.desc ? `- Mô tả: ${product.desc}\n` : '') +
        `\nYêu cầu: 3-5 dòng, có emoji, có lời kêu gọi inbox/chốt đơn. Giá ghi rút gọn (vd 14k/150k/1tr), KHÔNG ghi "đ".`;

    const { out, provider } = await aiComplete(prompt);
    if (!out) return { ...base, provider: 'template' };
    return {
        caption: out,
        hashtags: base.hashtags,
        text: `${out}\n\n${base.hashtags.join(' ')}`,
        provider,
    };
}

// ── NHIỀU sản phẩm (1 bài tổng hợp / album / livestream nhiều mẫu) ──────────
const MULTI_HEAD = {
    sale: '🛍️ SALE NHIỀU MẪU HOT',
    new: '🆕 LOẠT MẪU MỚI VỀ',
    livestream: '📣 ĐANG LIVE — NHIỀU MẪU XINH',
    restock: '🔁 VỀ HÀNG NHIỀU MẪU',
    simple: '✨ Mẫu shop tuyển chọn',
};

/** Caption TEMPLATE cho nhiều SP (offline, FREE). */
function generateMultiTemplate(products = [], style = 'sale') {
    const list = (products || []).filter((p) => p && p.name);
    if (!list.length) return generateTemplate({}, style);
    if (list.length === 1) return generateTemplate(list[0], style);
    const head = MULTI_HEAD[style] || MULTI_HEAD.sale;
    const lines = list.map(
        (p) =>
            `• ${p.name}${p.price ? ` – ${fmtMoney(p.price)}` : ''}${p.discount ? ` (giảm ${p.discount})` : ''}`
    );
    const caption =
        `${head}\n${lines.join('\n')}\n` +
        `✨ Chất đẹp, form chuẩn, lên dáng xinh.\n` +
        `🛒 Inbox shop để được tư vấn size/màu & chốt đơn nha cả nhà ơi 💕`;
    const hashtags = buildHashtags(list.map((p) => `${p.name} ${p.category || ''}`).join(' '));
    return { caption, hashtags, text: `${caption}\n\n${hashtags.join(' ')}` };
}

/** Caption AI cho nhiều SP (1 bài giới thiệu loạt mẫu). Fallback template nếu không có key. */
async function generateMultiAI(products = [], style = 'sale') {
    const list = (products || []).filter((p) => p && p.name);
    if (list.length <= 1) return generateAI(list[0] || {}, style);
    const base = generateMultiTemplate(list, style);
    const items = list
        .map(
            (p, i) =>
                `${i + 1}. ${p.name}${p.price ? ` — giá ${fmtMoney(p.price)}` : ''}${p.discount ? ` (KM ${p.discount})` : ''}`
        )
        .join('\n');
    const prompt =
        `Viết MỘT caption Facebook bán hàng phong cách "${style}" giới thiệu NHIỀU sản phẩm sau trong CÙNG 1 bài ` +
        `(bài tổng hợp/album/livestream nhiều mẫu):\n${items}\n\n` +
        `Yêu cầu: mở đầu hấp dẫn, liệt kê gọn các mẫu (kèm giá rút gọn 14k/150k/1tr nếu có, KHÔNG ghi "đ"), ` +
        `kết bằng 1 lời kêu gọi inbox/chốt đơn. Emoji vừa phải. KHÔNG bịa giá/khuyến mãi, KHÔNG mồi tương tác.`;
    const { out, provider } = await aiComplete(prompt);
    if (!out) return { ...base, provider: 'template' };
    return {
        caption: out,
        hashtags: base.hashtags,
        text: `${out}\n\n${base.hashtags.join(' ')}`,
        provider,
    };
}

function hasAnyAiKey() {
    return !!(
        process.env.GROQ_API_KEY ||
        process.env.DEEPSEEK_API_KEY ||
        process.env.GEMINI_API_KEY
    );
}

module.exports = {
    generateTemplate,
    generateAI,
    generateMultiTemplate,
    generateMultiAI,
    buildHashtags,
    hasAnyAiKey,
    STYLES: Object.keys(TEMPLATES),
};
