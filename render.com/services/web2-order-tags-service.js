// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
//
// Web 2.0 — Order auto-tag ENGINE (single source of truth).
// =========================================================
// Tag đơn hàng = AUTO-only, mỗi tag gắn 1 "trigger". Engine này là 1 NGUỒN cho:
//   - Trang Cấu hình "TAG đơn hàng" (web2/order-tags): danh sách trigger + mô tả.
//   - native-orders /load: tính autoTags + hasChoHang cho mỗi đơn (server-side,
//     authoritative, tự lành — KHÔNG lưu vào DB nên không drift).
//   - fast-sale-orders /from-native-order: chặn PBH khi đơn có SP "chờ hàng".
//
// Vì sao server-side: "âm mã" cần aggregate tồn kho + tổng SL giữ ở mọi đơn nháp;
// trạng thái SP (CHO_MUA) nằm ở web2_products. Client không có sẵn 2 thứ này →
// tính ở /load (cùng pool web2Db) là đúng chỗ. Xem CLAUDE.md "TAG đơn hàng".

// NGUỒN DUY NHẤT toán KPI (rate/sanitize/productMap/beneficiaryByStt/computeKpiQty).
// Trước 2026-06-21 file này FORK lại logic của routes/v2/kpi.js → drift. Giờ dùng core.
const kpiCore = require('./web2-kpi-core');

const _ensured = new WeakSet();

// ---------------------------------------------------------------------------
// TRIGGER REGISTRY — metadata cho UI config + key của predicate. Toàn diện
// ("lấy hết trigger bên native-orders"). Thêm trigger mới: thêm vào đây + thêm
// predicate tương ứng ở PREDICATES. Trang config đọc qua GET /triggers (1 nguồn).
// ---------------------------------------------------------------------------
const TRIGGERS = [
    // Tồn kho / Sản phẩm
    {
        id: 'cho_hang',
        label: 'Chờ hàng',
        group: 'Tồn kho / Sản phẩm',
        desc: 'Giỏ hàng có ≥1 SP đang chờ hàng (web2_products.status = CHO_MUA — tồn 0, chờ NCC giao). Giỏ này KHÔNG tạo được PBH, chỉ tạo Phiếu soạn hàng.',
    },
    {
        id: 'am_ma',
        label: 'Âm mã',
        group: 'Tồn kho / Sản phẩm',
        desc: 'Giỏ hàng có SP mà tổng SL đang giữ ở các giỏ hàng + đã lên PBH vượt tồn kho (over-sell). Vd tồn 2, giỏ A giữ 1 + PBH B 2 → âm mã.',
    },
    {
        id: 'het_hang',
        label: 'Hết hàng (tồn 0)',
        group: 'Tồn kho / Sản phẩm',
        desc: 'Đơn/giỏ có ≥1 SP tồn kho ≤ 0 (không tính SP chờ hàng).',
    },
    {
        id: 'mua_1_phan',
        label: 'Mua 1 phần',
        group: 'Tồn kho / Sản phẩm',
        desc: 'Đơn/giỏ có ≥1 SP trạng thái MUA_1_PHAN (đã nhận một phần từ NCC, còn chờ phần còn lại).',
    },
    // PBH / Trạng thái
    {
        id: 'pbh_created',
        label: 'Phiếu bán hàng',
        group: 'PBH / Trạng thái',
        desc: 'Đã tạo PBH thành công cho đơn (đơn chuyển trạng thái "Đơn hàng" / có PBH liên kết).',
    },
    {
        id: 'pbh_chua_tt',
        label: 'PBH chưa thu đủ',
        group: 'PBH / Trạng thái',
        desc: 'Đơn đã có PBH nhưng số tiền còn lại (COD/residual) > 0 — chưa thu đủ tiền.',
    },
    {
        id: 'is_draft',
        label: 'Giỏ hàng',
        group: 'PBH / Trạng thái',
        desc: 'Bản ghi đang ở trạng thái Giỏ hàng (chưa tạo PBH).',
    },
    {
        id: 'soan_hang',
        label: 'Soạn hàng',
        group: 'PBH / Trạng thái',
        desc: 'GIỎ đã in Phiếu Soạn Hàng (chờ NCC giao). CHỈ ở giỏ — khi thành đơn/PBH thì mất. ⚙ TẮT thẻ này = KHOÁ luôn nút "In Phiếu Soạn Hàng" (toggle bật/tắt chức năng in, admin chỉnh).',
    },
    {
        id: 'is_confirmed',
        label: 'Đã xác nhận',
        group: 'PBH / Trạng thái',
        desc: 'Đơn đã xác nhận (trạng thái "Đơn hàng").',
    },
    {
        id: 'is_cancelled',
        label: 'Đã huỷ',
        group: 'PBH / Trạng thái',
        desc: 'Đơn/giỏ đã huỷ.',
    },
    {
        id: 'gio_trong',
        label: 'Giỏ trống',
        group: 'PBH / Trạng thái',
        desc: 'Giỏ hàng chưa có sản phẩm nào (SL = 0, chưa huỷ). Ngược với điều kiện hiện pill KPI — giỏ rỗng không được tính KPI nên không có người phụ trách.',
    },
    {
        id: 'da_doi_soat',
        label: 'Đã đối soát',
        group: 'PBH / Trạng thái',
        desc: 'PBH của đơn đã đóng gói/giao (fulfillment ∈ packed / shipped / delivered) — đã đối soát đóng gói xong.',
    },
    // Thanh toán
    {
        id: 'chua_nhan_ck',
        label: 'Chưa thanh toán',
        group: 'Thanh toán',
        desc: 'Giỏ hàng chưa thanh toán đủ (chưa có CK xác nhận + số dư ví KH < tổng giỏ).',
    },
    {
        id: 'da_nhan_ck',
        label: 'Đã thanh toán',
        group: 'Thanh toán',
        desc: 'Đơn/giỏ đã thanh toán đủ — có CK xác nhận hoặc số dư ví KH ≥ tổng tiền (CK / ví / cọc nạp sẵn).',
    },
    {
        id: 'co_coc',
        label: 'Có đặt cọc',
        group: 'Thanh toán',
        desc: 'Đơn/giỏ có tiền đặt cọc > 0.',
    },
    // Giao hàng / Địa chỉ
    {
        id: 'thieu_dia_chi',
        label: 'Thiếu địa chỉ',
        group: 'Giao hàng',
        desc: 'Đơn/giỏ chưa có địa chỉ giao hàng.',
    },
    {
        id: 'thieu_sdt',
        label: 'Thiếu SĐT',
        group: 'Giao hàng',
        desc: 'Đơn/giỏ chưa có số điện thoại.',
    },
    {
        id: 'ship_tinh',
        label: 'Ship tỉnh',
        group: 'Giao hàng',
        desc: 'Phương thức giao hàng là ship tỉnh (auto-detect theo địa chỉ).',
    },
    {
        id: 'ship_tp',
        label: 'Ship nội thành',
        group: 'Giao hàng',
        desc: 'Phương thức giao hàng nội thành / trung tâm TP.',
    },
    // Cấu trúc đơn
    {
        id: 'gop_don',
        label: 'Đơn gộp',
        group: 'Cấu trúc đơn',
        desc: 'Đơn/giỏ được gộp từ nhiều bản ghi (merge).',
    },
    {
        id: 'don_tach',
        label: 'Đơn tách',
        group: 'Cấu trúc đơn',
        desc: 'Đơn/giỏ tách (split_index ≥ 2 — vd 31-2, 31-3).',
    },
    {
        id: 'da_in',
        label: 'Đã in bill',
        group: 'Cấu trúc đơn',
        desc: 'Đơn/giỏ đã in bill/phiếu ≥ 1 lần (chống in trùng).',
    },
    // Kênh
    {
        id: 'tu_livestream',
        label: 'Từ Livestream',
        group: 'Kênh',
        desc: 'Đơn/giỏ từ kênh livestream (web2_livestream).',
    },
    {
        id: 'tu_inbox',
        label: 'Từ Inbox',
        group: 'Kênh',
        desc: 'Đơn/giỏ từ kênh inbox (web2_inbox).',
    },
    // KPI
    {
        id: 'kpi_user',
        label: 'KPI User (người nhận KPI)',
        group: 'KPI',
        desc: 'Pill ĐỘNG hiện TÊN nhân viên được tính KPI cho đơn/giỏ. Livestream: theo dải STT đã phân công ở web2_kpi_assignments (khớp 100% dashboard KPI). Inbox: người tạo đơn (created_by, tính 100% SL). Bấm pill xem nguồn, cách resolve, base (lúc chốt) vs SL hiện tại, SL upsell + tiền KPI (×5.000đ/SP). Bản ghi livestream có STT KHÔNG nằm trong dải nào → pill ĐỎ báo lỗi chia dải (admin cần chia lại range cho đủ).',
    },
    // Khách hàng
    {
        id: 'khach_la',
        label: 'Khách lạ',
        group: 'Khách hàng',
        desc: 'Khách KHÔNG có thông tin ở kho KH (đơn chưa gán customer_id — chưa khớp hồ sơ web2_customers).',
    },
    // Nội dung / Tương tác
    {
        id: 'co_ghi_chu',
        label: 'Có ghi chú đơn',
        group: 'Nội dung / Tương tác',
        desc: 'Đơn/giỏ có ghi chú đơn do NV tự nhập (userNote — modal sửa đơn). KHÔNG tính cột `note` (đó là log comment livestream/inbox tự ghi, gần như đơn nào cũng có → không phải ghi chú thật). Khác với "Có ghi chú SP" (ghi chú ở từng dòng sản phẩm).',
    },
    {
        id: 'co_ghi_chu_sp',
        label: 'Có ghi chú SP',
        group: 'Nội dung / Tương tác',
        desc: 'Đơn/giỏ có ≥1 DÒNG SẢN PHẨM kèm ghi chú riêng (vd size/màu/yêu cầu KH cho từng SP). Khác với "Có ghi chú đơn" (ghi chú cấp đơn).',
    },
    {
        id: 'co_binh_luan',
        label: 'Có bình luận',
        group: 'Nội dung / Tương tác',
        desc: 'Đơn/giỏ có thêm bình luận (commentCount > 1). Lưu ý: mỗi bản ghi mặc định đã tính 1 bình luận gốc nên ngưỡng là > 1 (≥2) để lọc đơn thực sự có bình luận bổ sung/gộp.',
    },
];

const TRIGGER_IDS = new Set(TRIGGERS.map((t) => t.id));

// ---------------------------------------------------------------------------
// Predicate: (order, productFlags, ctx) → boolean. order là object đã enrich ở
// /load (có pbhResidual/pbhTotal/ckSignal/walletBalance/...). productFlags là
// kết quả orderProductFlags(). Không throw — engine bọc try/catch ở ngoài.
// ---------------------------------------------------------------------------
function _hasText(s) {
    return !!(s && String(s).trim());
}
function _deliveryText(o) {
    return `${o.deliveryMethod || ''} ${o.deliveryMethodLabel || ''}`.toLowerCase();
}

// Ship zone — port GỌN DeliveryMethodPicker.pickOffline (web2/shared/delivery-method-picker.js):
// quận/huyện HCM → 'tp' (nội/ven thành), còn lại có địa chỉ → 'tinh' (fallback ship tỉnh).
// Ưu tiên delivery_method nếu NV đã chọn tay; trống thì DERIVE từ địa chỉ (vì cột
// delivery_method để trống khi chưa pick → trước đây ship_tinh/ship_tp im lặng false,
// bug 2026-06-29). Danh sách quận HCM đồng bộ thủ công với client (HCM geography ổn định).
const _HCM_KEYWORDS = [
    'tphcm',
    'ho chi minh',
    'sai gon',
    'saigon',
    'binh chanh',
    'q9',
    'quan 9',
    'nha be',
    'hoc mon', // ven
    'q2',
    'quan 2',
    'q12',
    'quan 12',
    'binh tan',
    'thu duc',
    'q1',
    'q3',
    'q4',
    'q5',
    'q6',
    'q7',
    'q8',
    'q10',
    'q11',
    'quan 1',
    'quan 3',
    'quan 4',
    'quan 5',
    'quan 6',
    'quan 7',
    'quan 8',
    'quan 10',
    'quan 11',
    'phu nhuan',
    'binh thanh',
    'tan phu',
    'tan binh',
    'go vap',
];
function _normAddr(s) {
    if (s == null) return '';
    let out = String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
    out = out
        .replace(/\bq\.?\s*(\d{1,2})\b/g, 'quan $1 q$1') // Q.12 → "quan 12 q12"
        .replace(/\btp\.?\s*hcm\b/g, 'tphcm')
        .replace(/\btp\.?\s*ho\s+chi\s+minh\b/g, 'tphcm');
    return out
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function _hasAddrKw(tokens, needle) {
    const parts = needle.split(' ');
    for (let i = 0; i <= tokens.length - parts.length; i++) {
        let ok = true;
        for (let j = 0; j < parts.length; j++) {
            if (tokens[i + j] !== parts[j]) {
                ok = false;
                break;
            }
        }
        if (ok) return true;
    }
    return false;
}
function _addrIsHCM(o) {
    const tokens = _normAddr(o.address).split(' ').filter(Boolean);
    if (!tokens.length) return false;
    return _HCM_KEYWORDS.some((k) => _hasAddrKw(tokens, k));
}
// → 'tp' | 'tinh' | null. delivery_method (NV chọn tay) ưu tiên; trống → derive địa chỉ.
function _shipZone(o) {
    const dt = _deliveryText(o);
    if (dt.trim()) {
        if (/tp|thanh\s*pho|thành\s*phố|noi\s*thanh|nội\s*thành|trung\s*tam|trung\s*tâm/i.test(dt))
            return 'tp';
        if (/tinh|tỉnh/i.test(dt)) return 'tinh';
        return null; // PT giao khác (vd shop) → không gán ship tỉnh/tp
    }
    if (!_hasText(o.address)) return null;
    return _addrIsHCM(o) ? 'tp' : 'tinh';
}

const PREDICATES = {
    cho_hang: (o, f) => f.choHang,
    am_ma: (o, f) => f.amMa,
    het_hang: (o, f) => f.hetHang,
    mua_1_phan: (o, f) => f.mua1Phan,

    // PBH đã tạo: CHỈ khi có fast_sale_order (pbhTotal>0). KHÔNG tính
    // status==='confirmed' — đơn confirm qua /confirm KHÔNG tạo PBH (PBH lập sau)
    // → nhánh status fire nhầm "Phiếu bán hàng" + trùng is_confirmed (bug 2026-06-29).
    pbh_created: (o) => Number(o.pbhTotal || 0) > 0,
    pbh_chua_tt: (o) => Number(o.pbhTotal || 0) > 0 && Number(o.pbhResidual || 0) > 0,
    is_draft: (o) => o.status === 'draft',
    // Soạn hàng: GIỎ (draft) đã in Phiếu Soạn Hàng (soan_hang_print_count > 0). CHỈ ở giỏ →
    // khi thành đơn (status ≠ draft) predicate false → tag tự mất (derived mỗi /load).
    soan_hang: (o) => o.status === 'draft' && Number(o.soanHangPrintCount || 0) > 0,
    is_confirmed: (o) => o.status === 'confirmed',
    is_cancelled: (o) => o.status === 'cancelled',
    // Giỏ trống: giỏ (chưa huỷ) KHÔNG có sản phẩm nào. Đối nghịch kpi_user
    // (kpi_user cần products.length > 0) → giỏ rỗng có pill "Giỏ trống", không có pill KPI.
    gio_trong: (o) =>
        o.status !== 'cancelled' && (!Array.isArray(o.products) || o.products.length === 0),
    // Đã đối soát: MỌI PBH (kể cả bill tách) đã đóng gói/giao xong. FIX audit R3 (#1):
    // dùng pbhAllReconciled (BOOL_AND mọi bill) thay vì 1 bill → đơn tách còn bill chưa
    // đóng gói KHÔNG bị tag nhầm 'Đã đối soát'. Fallback bill đơn nếu thiếu cờ (an toàn).
    da_doi_soat: (o) =>
        o.pbhAllReconciled === true ||
        (o.pbhAllReconciled === undefined &&
            ['packed', 'shipped', 'delivered'].includes(o.pbhFulfillmentState)),
    // Khách lạ: chưa gán customer_id (chưa khớp hồ sơ KH).
    khach_la: (o) => o.customerId == null,
    // Có ghi chú đơn: CHỈ ghi chú NV tự nhập (userNote, modal sửa đơn — UI gọi là
    // "Ghi chú đơn"). KHÔNG tính cột `note`: đó là log comment livestream/inbox
    // auto-ghi ("[time][Page] message"), set trên ~mọi đơn live → tag firing khắp
    // bảng, vô nghĩa (bug 2026-06-29). userNote là ghi chú đơn THẬT.
    co_ghi_chu: (o) => _hasText(o.userNote),
    // Có ghi chú SP: ≥1 dòng sản phẩm có note riêng (size/màu/yêu cầu KH). products là
    // JSONB, mỗi line lưu field `note` (client setLineNote → line.note).
    co_ghi_chu_sp: (o) =>
        Array.isArray(o.products) && o.products.some((p) => p && _hasText(p.note)),
    // 'co_tin_nhan' (Có tin nhắn) ĐÃ GỠ 2026-06-29: message_count chỉ tăng theo
    // COMMENT merge (không có nguồn tin nhắn riêng trong native_orders) → fire y hệt
    // 'co_binh_luan' (trùng tag). Cột "Tin nhắn" (count pill) vẫn dùng message_count
    // ở client — không đụng. Predicate/trigger/seed gỡ, row xoá qua migration ensureTable.
    // Có bình luận bổ sung. comment_count mặc định 1 (bình luận gốc) → ngưỡng > 1.
    co_binh_luan: (o) => Number(o.commentCount || 0) > 1,

    chua_nhan_ck: (o) =>
        o.status === 'draft' &&
        !(o.ckSignal && o.ckSignal.status === 'confirmed') &&
        Number(o.walletBalance || 0) < Number(o.totalAmount || 0),
    da_nhan_ck: (o) =>
        (o.ckSignal && o.ckSignal.status === 'confirmed') ||
        (Number(o.totalAmount || 0) > 0 &&
            Number(o.walletBalance || 0) >= Number(o.totalAmount || 0)),
    co_coc: (o) => Number(o.deposit || 0) > 0,

    thieu_dia_chi: (o) => !_hasText(o.address),
    thieu_sdt: (o) => !_hasText(o.phone),
    // Ship tỉnh / nội thành: ưu tiên PT giao NV chọn tay; trống → derive từ địa chỉ
    // (_shipZone). Trước đây chỉ đọc delivery_method (im lặng false khi chưa pick).
    ship_tinh: (o) => _shipZone(o) === 'tinh',
    ship_tp: (o) => _shipZone(o) === 'tp',

    gop_don: (o) => Array.isArray(o.mergedCodes) && o.mergedCodes.length > 0,
    don_tach: (o) => Number(o.splitIndex || 0) >= 2,
    da_in: (o) => Number(o.printCount || 0) > 0,

    tu_livestream: (o) =>
        !o.channel || o.channel === 'web2_livestream' || o.channel === 'livestream',
    tu_inbox: (o) => o.channel === 'web2_inbox' || o.channel === 'inbox',

    // KPI User: pill động (mọi đơn còn sống có SP). Nhãn/màu/đỏ-lỗi tính ở
    // computeAutoTags qua kpiUserDetail() — predicate chỉ quyết định CÓ hiện hay không.
    kpi_user: (o) => o.status !== 'cancelled' && Array.isArray(o.products) && o.products.length > 0,
};

// ---------------------------------------------------------------------------
// Per-order product flags từ ctx (status map + held map). 1 lần / đơn.
//   - choHang : có SP status CHO_MUA.
//   - mua1Phan: có SP status MUA_1_PHAN.
//   - hetHang : có SP (không phải CHO_MUA) tồn ≤ 0.
//   - amMa    : giỏ hàng (chưa PBH) có SP (không phải CHO_MUA) mà tổng SL giữ ở các giỏ
//               > tồn kho hiện tại. Lưu ý: tạo PBH ĐÃ trừ web2_products.stock →
//               held_drafts > stock_hiện_tại ⇔ (held_drafts + đã_lên_PBH) > tồn_gốc.
// ---------------------------------------------------------------------------
function orderProductFlags(o, ctx) {
    const lines = Array.isArray(o.products) ? o.products : [];
    let choHang = false,
        hetHang = false,
        mua1Phan = false,
        amMa = false;
    for (const l of lines) {
        const code = l.productCode || l.product_code || l.code;
        if (!code) continue;
        const ps = ctx.productStatus.get(code);
        if (!ps) continue;
        if (ps.status === 'CHO_MUA') {
            choHang = true;
            continue; // SP chờ hàng: KHÔNG tính hết hàng / âm mã (tồn 0 là cố ý).
        }
        if (ps.status === 'MUA_1_PHAN') mua1Phan = true;
        if (ps.stock <= 0) hetHang = true;
        const held = ctx.heldByCode.get(code) || 0;
        if (held > ps.stock) amMa = true;
    }
    if (o.status !== 'draft') amMa = false; // âm mã chỉ áp cho giỏ hàng (chưa PBH) đang tranh tồn.
    return { choHang, hetHang, mua1Phan, amMa };
}

// Trigger có "lý do chi tiết" theo SẢN PHẨM → đính kèm tag.detail.products để client
// bấm pill xem (chờ hàng: SP nào chờ; âm mã: SP nào vượt tồn + tồn/đang-giữ).
const PRODUCT_DETAIL_TRIGGERS = new Set(['cho_hang', 'am_ma', 'het_hang', 'mua_1_phan']);

// Danh sách SP liên quan tới 1 trigger trong đơn này (để hiển thị lý do khi bấm pill).
// Dedupe theo code. Trả null nếu không có SP nào (tag vẫn hiện nhưng không có detail SP).
function tagDetail(trigger, o, ctx) {
    const lines = Array.isArray(o.products) ? o.products : [];
    const byCode = new Map();
    for (const l of lines) {
        const code = l.productCode || l.product_code || l.code;
        if (!code) continue;
        const ps = ctx.productStatus.get(code);
        if (!ps) continue;
        const name = l.name || l.productName || l.product_name || code;
        const orderQty = Number(l.quantity || l.qty || 0);
        // Ảnh SP: ưu tiên catalog web2_products (current), fallback snapshot dòng đơn.
        const imageUrl = ps.imageUrl || l.imageUrl || l.image_url || null;
        if (trigger === 'cho_hang' && ps.status === 'CHO_MUA') {
            byCode.set(code, { code, name, imageUrl, pendingQty: ps.pending, orderQty });
        } else if (trigger === 'mua_1_phan' && ps.status === 'MUA_1_PHAN') {
            byCode.set(code, {
                code,
                name,
                imageUrl,
                stock: ps.stock,
                pendingQty: ps.pending,
                orderQty,
            });
        } else if (trigger === 'het_hang' && ps.status !== 'CHO_MUA' && ps.stock <= 0) {
            byCode.set(code, { code, name, imageUrl, stock: ps.stock, orderQty });
        } else if (trigger === 'am_ma' && ps.status !== 'CHO_MUA') {
            const held = ctx.heldByCode.get(code) || 0;
            if (held > ps.stock) {
                byCode.set(code, { code, name, imageUrl, stock: ps.stock, held, orderQty });
            }
        }
    }
    const products = [...byCode.values()];
    return products.length ? { products } : null;
}

// ---------------------------------------------------------------------------
// KPI USER — resolve "ai được tính KPI cho đơn này" + breakdown. MIRROR logic
// render.com/routes/v2/kpi.js (resolveBeneficiary + _orderKpiQty) để pill KHỚP
// 100% dashboard KPI:
//   • Livestream: hưởng = NV theo dải STT (web2_kpi_assignments). KPI qty = base-delta
//     (Σ max(0, SL_hiện_tại − kpi_base)) = phần UPSELL sau khi chốt. STT ngoài mọi dải
//     = LỖI chia dải (pill đỏ). kpi_base null (chưa chốt) → qty 0.
//   • Inbox: hưởng = người tạo đơn (createdBy). KPI qty = 100% SL.
//   • Tiền = qty × 5.000đ/SP.
// ---------------------------------------------------------------------------
// kpiUserDetail(order, ctx) → object mô tả người hưởng + breakdown (gắn vào tag.detail.kpiUser).
// Toán KPI (qty/lines/beneficiary/sanitize/rate) DÙNG kpiCore — KHÔNG fork. ctx.productStatus
// (Map code→{imageUrl}) truyền làm metaMap để override ảnh SP từ catalog web2_products.
function kpiUserDetail(o, ctx) {
    const isInbox = o.channel === 'web2_inbox' || o.channel === 'inbox';
    const RATE = kpiCore.RATE_PER_SP;
    const meta = ctx.productStatus; // Map(code→{imageUrl,...})

    if (isInbox) {
        const name = o.createdByName || o.createdBy || 'NV inbox';
        const { qty, lines } = kpiCore.computeKpiQty(o.products, null, 'inbox', meta);
        return {
            source: 'inbox',
            state: 'ok',
            label: name,
            color: '#0068ff',
            beneficiaryName: name,
            beneficiaryId: Number.isFinite(Number(o.createdBy)) ? Number(o.createdBy) : null,
            resolveText: 'Đơn Inbox → người tạo đơn nhận KPI (tính 100% số lượng).',
            campaignName: o.liveCampaignName || null,
            campaignStt: o.campaignStt ?? null,
            kpiQty: qty,
            kpiAmount: qty * RATE,
            notChoted: false,
            rate: RATE,
            orderStatus: o.status,
            lines,
        };
    }

    // Livestream
    const ranges =
        ctx.kpiRanges && o.liveCampaignName
            ? ctx.kpiRanges.get(kpiCore.sanitizeCampaignName(o.liveCampaignName)) || []
            : [];
    const stt = o.campaignStt ?? null;
    const base = o.kpiBase || null;
    const { qty, lines } = kpiCore.computeKpiQty(o.products, base, 'live', meta);
    const b = kpiCore.resolveBeneficiaryBySTT(stt, ranges);

    if (!b) {
        const hasRanges = Array.isArray(ranges) && ranges.length > 0;
        return {
            source: 'livestream',
            state: 'error',
            label: stt != null ? `⚠ STT ${stt} chưa gán NV` : '⚠ Đơn chưa có STT',
            color: '#dc2626',
            beneficiaryName: null,
            beneficiaryId: null,
            resolveText: hasRanges
                ? `STT ${stt} không nằm trong dải phân công nào của chiến dịch "${o.liveCampaignName || ''}". Dải STT phải chia ĐỦ — vào Cấu hình KPI chia lại range cho NV.`
                : `Chiến dịch "${o.liveCampaignName || '(không chiến dịch)'}" chưa phân công dải STT cho nhân viên. Vào Cấu hình KPI để chia range.`,
            campaignName: o.liveCampaignName || null,
            campaignStt: stt,
            kpiQty: qty,
            kpiAmount: qty * RATE,
            notChoted: base == null,
            rate: RATE,
            orderStatus: o.status,
            lines,
        };
    }

    const toLabel = b.to === Infinity || !Number.isFinite(b.to) ? '∞' : b.to;
    return {
        source: 'livestream',
        state: 'ok',
        label: b.name,
        color: '#16a34a',
        beneficiaryName: b.name,
        beneficiaryId: Number.isFinite(b.id) ? b.id : 0,
        resolveText: `STT ${stt} ∈ dải ${b.from}–${toLabel} → ${b.name} (livestream${base == null ? ', CHƯA chốt đơn' : ', tính phần upsell sau chốt'}).`,
        campaignName: o.liveCampaignName || null,
        campaignStt: stt,
        kpiQty: qty,
        kpiAmount: qty * RATE,
        notChoted: base == null,
        rate: RATE,
        orderStatus: o.status,
        lines,
    };
}

// computeAutoTags(order, ctx, tagDefs, opts) → { tags:[...], hasChoHang }
// tagDefs đã sort theo priority ASC (loadActiveTagDefs) → output giữ thứ tự.
// opts.viewerUser = { id, role } để CHE pill kpi_user của NV khác (NV chỉ thấy KPI mình).
function computeAutoTags(o, ctx, tagDefs, opts) {
    const viewer = (opts && opts.viewerUser) || null;
    const f = orderProductFlags(o, ctx);
    const tags = [];
    // 1 tag / trigger: 2 thẻ cùng trigger = cùng điều kiện = pill trùng (vô nghĩa).
    // Route đã chặn tạo trùng; dedupe ở đây là phòng thủ (data cũ/seed chồng). Giữ
    // thẻ ưu tiên thấp nhất (tagDefs đã sort priority ASC).
    const seenTriggers = new Set();
    for (const def of tagDefs || []) {
        if (seenTriggers.has(def.trigger)) continue;
        seenTriggers.add(def.trigger);
        const pred = PREDICATES[def.trigger];
        if (!pred) continue;
        let match = false;
        try {
            match = !!pred(o, f, ctx);
        } catch {
            match = false;
        }
        if (match) {
            const tag = {
                code: def.code,
                name: def.name,
                color: def.color || '#6b7280',
                icon: def.icon || null,
                trigger: def.trigger,
            };
            if (PRODUCT_DETAIL_TRIGGERS.has(def.trigger)) {
                const detail = tagDetail(def.trigger, o, ctx);
                if (detail) tag.detail = detail;
            } else if (def.trigger === 'kpi_user') {
                // Pill động: nhãn = tên NV hưởng (hoặc "⚠ STT n chưa gán"); màu đỏ khi lỗi
                // chia dải, còn lại theo state. detail.kpiUser cho popup breakdown.
                try {
                    const info = kpiUserDetail(o, ctx);
                    // SCOPE: NV (role≠admin) CHỈ thấy KPI của CHÍNH MÌNH. Đơn của NV khác →
                    // CHE: nhãn '👤 KPI', màu trung tính, KHÔNG đính detail (tên/tiền NV khác).
                    // Đây là tầng DUY NHẤT đáng tin (frontend không thể tin). Admin thấy đủ.
                    // Che KHI có beneficiary thật khác viewer. Đơn "chưa gán" (beneficiaryId
                    // null) KHÔNG che — không lộ ai, staff thấy lỗi config là vô hại.
                    const masked =
                        viewer &&
                        viewer.role !== 'admin' &&
                        info.beneficiaryId != null &&
                        Number(info.beneficiaryId) !== Number(viewer.id);
                    if (masked) {
                        tag.name = '👤 KPI';
                        tag.color = '#94a3b8';
                        tag.kpiMasked = true;
                    } else {
                        tag.name = info.label || def.name;
                        // Màu: đỏ = lỗi chia dải; hổ phách = đã gán NV nhưng đơn CHƯA chốt
                        // (base chưa khóa → KPI tạm 0); còn lại = màu thẻ (xanh, đã chốt/inbox).
                        tag.color =
                            info.state === 'error'
                                ? '#dc2626'
                                : info.notChoted
                                  ? '#f59e0b'
                                  : def.color || info.color;
                        tag.kpiState = info.state;
                        tag.notChoted = !!info.notChoted;
                        tag.detail = { kpiUser: info };
                    }
                } catch {
                    /* để nguyên def.name/color nếu resolve lỗi */
                }
            }
            tags.push(tag);
        }
    }
    return { tags, hasChoHang: f.choHang };
}

// ---------------------------------------------------------------------------
// Context builder: query web2_products status/stock + held-in-drafts cho tập
// product code xuất hiện ở các đơn đang load. Bounded theo codes của trang.
// ---------------------------------------------------------------------------
async function buildContext(pool, orders, opts = {}) {
    const productStatus = new Map();
    const heldByCode = new Map();
    // kpiRanges: sanitized campaign_name → ranges[]. Chỉ load khi có tag kpi_user active
    // (opts.needKpi) — tránh query thừa mỗi /load. 1 nguồn ở kpiCore (load FULL mọi NV để
    // resolve đúng beneficiary; che NV-khác làm ở tầng tag, KHÔNG lọc range — xem masking).
    const kpiRanges = opts.needKpi ? await kpiCore.loadKpiRanges(pool) : new Map();
    const codeSet = new Set();
    for (const o of orders || []) {
        for (const l of o.products || []) {
            const c = l.productCode || l.product_code || l.code;
            if (c) codeSet.add(c);
        }
    }
    const codes = [...codeSet];
    if (!codes.length) return { productStatus, heldByCode, kpiRanges };

    const pr = await pool.query(
        `SELECT code, status, stock, pending_qty, image_url FROM web2_products WHERE code = ANY($1::text[])`,
        [codes]
    );
    for (const r of pr.rows) {
        productStatus.set(r.code, {
            status: r.status || 'DANG_BAN',
            stock: Number(r.stock) || 0,
            pending: Number(r.pending_qty) || 0,
            imageUrl: r.image_url || null,
        });
    }

    // Tổng SL "giữ" ở MỌI đơn nháp (global, không giới hạn trang) cho các code này.
    // COALESCE 2 shape products[] (productCode/code, quantity/qty) như /usage.
    const hr = await pool.query(
        `SELECT COALESCE(prod->>'productCode', prod->>'code') AS code,
                SUM(COALESCE((prod->>'quantity')::numeric, (prod->>'qty')::numeric, 0)) AS held
         FROM native_orders n, jsonb_array_elements(n.products) prod
         WHERE COALESCE(prod->>'productCode', prod->>'code') = ANY($1::text[])
           AND n.status = 'draft'
         GROUP BY 1`,
        [codes]
    );
    for (const r of hr.rows) {
        if (r.code) heldByCode.set(r.code, Number(r.held) || 0);
    }
    return { productStatus, heldByCode, kpiRanges };
}

// ---------------------------------------------------------------------------
// Table + seed (web2Db). web2_order_tags: 1 dòng = 1 tag (code immutable),
// gắn 1 trigger. Seed 3 tag mặc định CHỈ khi bảng rỗng (xoá hết → reseed; tắt
// is_active thì giữ row → không reseed).
// ---------------------------------------------------------------------------
async function ensureTable(pool) {
    if (_ensured.has(pool)) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_order_tags (
            code        VARCHAR(60)  PRIMARY KEY,
            name        VARCHAR(120) NOT NULL,
            trigger     VARCHAR(40)  NOT NULL,
            color       VARCHAR(20)  DEFAULT '#6b7280',
            icon        VARCHAR(40),
            priority    INTEGER      NOT NULL DEFAULT 0,
            is_active   BOOLEAN      NOT NULL DEFAULT true,
            created_by  VARCHAR(100),
            created_at  BIGINT       NOT NULL,
            updated_at  BIGINT       NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_web2_order_tags_active ON web2_order_tags(is_active);
        -- 2026-06-30: print_enabled — toggle bật/tắt CHỨC NĂNG IN (riêng thẻ soan_hang).
        -- TÁCH khỏi is_active: is_active ẩn/hiện thẻ; print_enabled chỉ chặn IN RA GIẤY
        -- (tag VẪN gắn + hiện khi tắt in). Cột chung nhưng chỉ soan_hang dùng.
        ALTER TABLE web2_order_tags ADD COLUMN IF NOT EXISTS print_enabled BOOLEAN NOT NULL DEFAULT true;
    `);
    try {
        const cnt = await pool.query(`SELECT COUNT(*)::int AS n FROM web2_order_tags`);
        if (cnt.rows[0].n === 0) {
            const now = Date.now();
            await pool.query(
                `INSERT INTO web2_order_tags (code, name, trigger, color, icon, priority, created_by, created_at, updated_at)
                 VALUES
                   ('kpi_user',    'KPI User',       'kpi_user',    '#16a34a', 'user-check',     5,  'system', $1, $1),
                   ('pbh_created', 'Phiếu bán hàng', 'pbh_created', '#16a34a', 'receipt',        10, 'system', $1, $1),
                   ('cho_hang',    'Chờ hàng',       'cho_hang',    '#f59e0b', 'clock',          20, 'system', $1, $1),
                   ('am_ma',       'Âm mã',          'am_ma',       '#dc2626', 'alert-triangle', 30, 'system', $1, $1)
                 ON CONFLICT (code) DO NOTHING`,
                [now]
            );
            console.log(
                '[WEB2-ORDER-TAGS] Seeded 4 default tags (kpi_user, pbh_created, cho_hang, am_ma)'
            );
        }
        // Default tag 'Giỏ trống' (2026-06-26): ensure tồn tại KỂ CẢ khi bảng đã có data
        // (block seed-4-default ở trên chỉ chạy lúc bảng RỖNG). ON CONFLICT DO NOTHING →
        // idempotent, KHÔNG đè nếu admin đã đổi tên/màu/priority. Muốn ẩn → đặt is_active=false
        // (XOÁ thì lần restart sau sẽ seed lại vì code không còn tồn tại).
        await pool.query(
            `INSERT INTO web2_order_tags (code, name, trigger, color, icon, priority, created_by, created_at, updated_at)
             VALUES ('gio_trong', 'Giỏ trống', 'gio_trong', '#94a3b8', 'shopping-cart', 15, 'system', $1, $1)
             ON CONFLICT (code) DO NOTHING`,
            [Date.now()]
        );
        // Default tags bổ sung (2026-06-26 — user yêu cầu thêm trigger): Khách lạ, Có
        // ghi chú, Có tin nhắn, Có bình luận, Đã đối soát. Cùng cơ chế idempotent như
        // 'Giỏ trống' (ON CONFLICT DO NOTHING — không đè nếu admin đã chỉnh; muốn ẩn → is_active=false).
        await pool.query(
            `INSERT INTO web2_order_tags (code, name, trigger, color, icon, priority, created_by, created_at, updated_at)
             VALUES
               ('da_doi_soat',  'Đã đối soát',  'da_doi_soat',  '#16a34a', 'package-check',  12, 'system', $1, $1),
               ('khach_la',     'Khách lạ',     'khach_la',     '#f59e0b', 'user-x',          8, 'system', $1, $1),
               ('co_ghi_chu',    'Có ghi chú đơn', 'co_ghi_chu',    '#0ea5e9', 'sticky-note',    40, 'system', $1, $1),
               ('co_ghi_chu_sp', 'Có ghi chú SP',  'co_ghi_chu_sp', '#0d9488', 'notebook-pen',   43, 'system', $1, $1),
               ('co_binh_luan',  'Có bình luận',   'co_binh_luan',  '#8b5cf6', 'message-square', 42, 'system', $1, $1)
             ON CONFLICT (code) DO NOTHING`,
            [Date.now()]
        );
        // FIX mislabel (2026-06-26): thẻ code='khach_la' (tên "KHÁCH LẠ") trước đây gắn
        // NHẦM trigger='thieu_dia_chi' → pill "KHÁCH LẠ" thực ra fire theo THIẾU ĐỊA CHỈ.
        // User định nghĩa: khách lạ = KH không có thông tin ở kho KH (chưa gán customer_id).
        // → Trả trigger về 'khach_la'. Idempotent: chỉ flip khi còn nhầm (chạy 1 lần).
        await pool.query(
            `UPDATE web2_order_tags SET trigger = 'khach_la', updated_at = $1
             WHERE code = 'khach_la' AND trigger = 'thieu_dia_chi'`,
            [Date.now()]
        );
        // Trả 'thieu_dia_chi' cho 1 thẻ ĐÚNG TÊN riêng (sau khi giải phóng khỏi thẻ KHÁCH LẠ).
        await pool.query(
            `INSERT INTO web2_order_tags (code, name, trigger, color, icon, priority, created_by, created_at, updated_at)
             VALUES ('thieu_dia_chi', 'Thiếu địa chỉ', 'thieu_dia_chi', '#ef4444', 'map-pin-off', 35, 'system', $1, $1)
             ON CONFLICT (code) DO NOTHING`,
            [Date.now()]
        );
        // Đổi tên thẻ co_ghi_chu 'Có ghi chú' → 'Có ghi chú đơn' (phân biệt với 'Có ghi chú SP'
        // vừa thêm). Chỉ đổi khi còn tên default hệ thống — KHÔNG đè nếu admin đã đổi tên.
        await pool.query(
            `UPDATE web2_order_tags SET name = 'Có ghi chú đơn', updated_at = $1
             WHERE code = 'co_ghi_chu' AND name = 'Có ghi chú'`,
            [Date.now()]
        );
        // 2026-06-29: GỠ HẲN thẻ 'Có tin nhắn' — message_count chỉ tăng theo COMMENT
        // merge (không có nguồn tin nhắn riêng) → fire trùng y hệt 'Có bình luận'.
        // Predicate + trigger + seed đã gỡ; xoá row để admin không thấy trigger chết.
        // Idempotent (no-op nếu đã xoá).
        await pool.query(`DELETE FROM web2_order_tags WHERE code = 'co_tin_nhan'`);
        // 2026-06-29: ACTIVATE 'Có đặt cọc' + 'Ship Tỉnh' + 'Ship nội thành' — trước
        // chỉ là trigger có sẵn (chưa seed → không hiện). co_coc giờ đọc o.deposit đã
        // enrich từ PBH; ship_* derive zone từ địa chỉ (server-side). ON CONFLICT DO
        // NOTHING (idempotent, không đè nếu admin đã chỉnh).
        await pool.query(
            `INSERT INTO web2_order_tags (code, name, trigger, color, icon, priority, created_by, created_at, updated_at)
             VALUES
               ('co_coc',     'Có đặt cọc',   'co_coc',     '#0891b2', 'hand-coins', 39, 'system', $1, $1),
               ('ship_tinh',  'Ship Tỉnh',    'ship_tinh',  '#f59e0b', 'truck',      36, 'system', $1, $1),
               ('ship_tp',    'Ship nội thành','ship_tp',   '#10b981', 'truck',      37, 'system', $1, $1)
             ON CONFLICT (code) DO NOTHING`,
            [Date.now()]
        );
        // 2026-06-30: seed thẻ 'Soạn hàng' — giỏ (draft) đã in Phiếu Soạn Hàng. is_active=true
        // mặc định; admin TẮT = ẩn thẻ + KHOÁ nút In Phiếu Soạn Hàng. ON CONFLICT idempotent.
        await pool.query(
            `INSERT INTO web2_order_tags (code, name, trigger, color, icon, priority, created_by, created_at, updated_at)
             VALUES ('soan_hang', 'Soạn hàng', 'soan_hang', '#7c3aed', 'clipboard-list', 47, 'system', $1, $1)
             ON CONFLICT (code) DO NOTHING`,
            [Date.now()]
        );
    } catch (e) {
        console.warn('[WEB2-ORDER-TAGS] seed warn:', e.message);
    }
    _ensured.add(pool);
}

// Đọc tag def đang bật, sort theo priority ASC. Lỗi/bảng thiếu → [] (không vỡ /load).
async function loadActiveTagDefs(pool) {
    try {
        await ensureTable(pool);
        const r = await pool.query(
            `SELECT code, name, trigger, color, icon, priority
             FROM web2_order_tags WHERE is_active = true
             ORDER BY priority ASC, name ASC`
        );
        return r.rows.map((x) => ({
            code: x.code,
            name: x.name,
            trigger: x.trigger,
            color: x.color || '#6b7280',
            icon: x.icon || null,
            priority: Number(x.priority) || 0,
        }));
    } catch (e) {
        console.warn('[WEB2-ORDER-TAGS] loadActiveTagDefs warn:', e.message);
        return [];
    }
}

// Tiện ích cho /load: enrich mảng orders tại chỗ (o.autoTags + o.hasChoHang).
// opts.viewerUser = { id, role } (từ req.kpiUser) → CHE pill kpi_user của NV khác cho
// staff (server-side mask, nguồn-tin-duy-nhất). Defensive — lỗi → autoTags=[] không vỡ list.
async function enrichOrdersWithTags(pool, orders, opts) {
    if (!Array.isArray(orders) || !orders.length) return;
    const viewerUser = (opts && opts.viewerUser) || null;
    try {
        const tagDefs = await loadActiveTagDefs(pool);
        const needKpi = tagDefs.some((d) => d.trigger === 'kpi_user');
        const ctx = await buildContext(pool, orders, { needKpi });
        for (const o of orders) {
            const { tags, hasChoHang } = computeAutoTags(o, ctx, tagDefs, { viewerUser });
            o.autoTags = tags;
            o.hasChoHang = hasChoHang;
        }
    } catch (e) {
        console.warn('[WEB2-ORDER-TAGS] enrichOrdersWithTags warn:', e.message);
        for (const o of orders) {
            if (!o.autoTags) o.autoTags = [];
            if (o.hasChoHang == null) o.hasChoHang = false;
        }
    }
}

module.exports = {
    TRIGGERS,
    TRIGGER_IDS,
    PREDICATES,
    orderProductFlags,
    tagDetail,
    kpiUserDetail,
    computeAutoTags,
    buildContext,
    ensureTable,
    loadActiveTagDefs,
    enrichOrdersWithTags,
};
