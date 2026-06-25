// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared module.
// =====================================================================
// Web2AiPageRegistry — REGISTRY THEO TRANG cho trợ lý AI (Web2AiAssistant).
//
// Pure-data (auto-gen từ workflow audit 2026-06-25, 32 trang). Mỗi entry:
//   { match:  pathname-substring để khớp trang (longest-prefix thắng),
//     model:  { provider, model } AI free hợp trang (auto theo trang),
//     accessors: [{ expr, desc, shape }] — biểu thức ĐỌC window.* trả FULL dataset
//                (cache/state trang, KHÔNG bị phân trang/bảng ảo). Widget resolve AN TOÀN
//                bằng path-walk (KHÔNG eval chuỗi), bọc try/catch từng cái.
//     suggestions: [{ label, prompt }] — lệnh mẫu theo NGỮ CẢNH trang,
//     note:   hướng AI ưu tiên accessor nào / fallback khi cache chưa init. }
//
// Tách module riêng (rule "tách nhỏ + share 1 nguồn"): thêm trang = thêm 1 entry data,
// KHÔNG đụng core widget. Load TRƯỚC web2-ai-assistant.js (sidebar autoload).
//
// API: Web2AiPageRegistry.matchPage(path) | .suggestionsFor(path) | .modelFor(path)
//      | .accessorsFor(path) | .noteFor(path) | .GENERIC | .DEFAULT_MODEL
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2AiPageRegistry) return;

    // Model free mặc định (xoay key, tiếng Việt tốt). Trang nặng tính toán → groq gpt-oss-120b;
    // chat/cảm xúc → gemini; trang nhẹ → llama-8b (xem field model mỗi entry).
    const DEFAULT_MODEL = { provider: 'gemini', model: 'gemini-2.5-flash' };

    // Gợi ý CHUNG (fallback khi trang không có trong registry).
    const GENERIC = [
        {
            label: '📊 Rà soát số liệu',
            prompt: 'Rà soát toàn bộ số liệu đang hiển thị trên trang. Có dòng nào cộng/trừ sai, lệch tổng, hoặc bất thường không? Chỉ rõ dòng và số đúng.',
        },
        {
            label: '🧮 Kiểm tra phép tính',
            prompt: 'Tự tính lại các phép cộng/trừ/tổng trong các bảng trên trang. Liệt kê dòng nào sai và giá trị đúng.',
        },
        {
            label: '🙂 Cảm xúc khách',
            prompt: 'Dựa vào hội thoại đang hiển thị, khách đang vui / bình thường / khó chịu? Vì sao? Gợi ý câu trả lời phù hợp.',
        },
        {
            label: '🧾 Soát đơn hàng',
            prompt: 'Rà soát dữ liệu đơn hàng đang hiển thị: thiếu thông tin, số tiền lệch, trạng thái bất thường? Tóm tắt cần kiểm tra.',
        },
        {
            label: '❓ Giải thích trang',
            prompt: 'Giải thích ngắn gọn trang này đang hiển thị gì và các số liệu/cột chính nghĩa là gì.',
        },
    ];

    // Registry 32 trang (mỗi dòng 1 trang).
    const PAGES = [
        {
            match: '/web2/products/',
            model: { provider: 'gemini', model: 'gemini-2.5-flash' },
            accessors: [
                {
                    expr: 'window.Web2ProductsCache?.getAll?.()',
                    desc: 'FULL kho SP đang nạp trong cache dùng chung (KHÔNG bị giới hạn bởi phân trang/bảng ảo của DOM). Đây là nguồn ĐẦY ĐỦ nhất — trả về toàn bộ sản phẩm đã load. Mỗi item là 1 object SP. Dùng accessor này TRƯỚC tiên để phân tích tồn kho/giá/biến thể toàn kho.',
                    shape: "Array<{ code:string, name:string, variant:string, stock:number, pendingQty:number, returnQty:number, price:number /*giá bán VND*/, originalPrice:number /*giá mua VND*/, isActive:boolean, status:string /*'CHO_MUA'|'DANG_BAN'|'MUA_1_PHAN'…*/, supplier:string, imageUrl:string, printCount:number, originCurrency?:string, originRate?:number }>",
                },
                {
                    expr: 'window.Web2ProductsCache?.getAll?.()?.length',
                    desc: 'Tổng số sản phẩm trong kho (để biết quy mô dataset trước khi phân tích).',
                    shape: 'number',
                },
                {
                    expr: 'window.Web2ProductsCore?.STATE?.products',
                    desc: 'Danh sách SP của TRANG/bộ lọc hiện tại (đã áp search + activeOnly + phân trang, mặc định limit 200). Dùng khi cần phân tích đúng những gì user đang xem/lọc thay vì toàn kho. Cùng shape với getAll().',
                    shape: 'Array<Product> (subset đã filter/paginate; cùng field như getAll)',
                },
                {
                    expr: 'window.Web2ProductsCore?.STATE?.search',
                    desc: 'Từ khoá tìm kiếm hiện tại user đang nhập (rỗng nếu không lọc) — giúp AI biết ngữ cảnh bộ lọc đang áp.',
                    shape: 'string',
                },
                {
                    expr: 'window.Web2ProductsCore?.STATE?.activeOnly',
                    desc: 'Trạng thái bộ lọc: true = chỉ hiện SP đang bán; false = hiện tất cả.',
                    shape: 'boolean',
                },
            ],
            suggestions: [
                {
                    label: '📉 SP tồn kho âm/0',
                    prompt: "Quét toàn bộ kho SP qua window.Web2ProductsCache.getAll(). Liệt kê các sản phẩm có stock < 0 (lỗi dữ liệu) hoặc stock = 0 nhưng status đang là 'DANG_BAN' (đang bán mà hết hàng). Với mỗi SP nêu: mã (code), tên, biến thể, tồn, NCC. Sắp xếp tồn âm lên đầu.",
                },
                {
                    label: '🏷️ SP thiếu giá',
                    prompt: 'Dùng window.Web2ProductsCache.getAll() tìm các SP có price (giá bán) = 0 hoặc null, hoặc giá bán <= giá mua (originalPrice) — tức bán lỗ/sai giá. Liệt kê mã, tên, giá mua, giá bán, chênh lệch. Cảnh báo rõ những SP bán dưới giá vốn.',
                },
                {
                    label: '🔁 SP trùng tên/biến thể',
                    prompt: 'Quét window.Web2ProductsCache.getAll() phát hiện các sản phẩm bị trùng (cùng name + variant nhưng khác code, hoặc mã code lặp). Gom nhóm trùng lại, nêu các mã liên quan và gợi ý nên gộp/xoá cái nào để kho gọn.',
                },
                {
                    label: '⏳ SP chờ hàng từ NCC',
                    prompt: "Từ window.Web2ProductsCache.getAll(), liệt kê các SP có status 'CHO_MUA' hoặc pendingQty > 0 (đang chờ mua/về hàng từ NCC). Nhóm theo supplier, tính tổng số lượng chờ mỗi NCC, và chỉ ra NCC nào đang có nhiều hàng chờ nhất cần đẩy nhanh.",
                },
                {
                    label: '📦 SP tồn thấp cần nhập',
                    prompt: 'Dùng window.Web2ProductsCache.getAll() lọc SP đang bán (isActive true) có stock < 5 và pendingQty = 0 (sắp hết mà chưa có hàng chờ về). Liệt kê mã, tên, tồn, NCC; ưu tiên tồn thấp nhất lên đầu để lên đơn nhập.',
                },
                {
                    label: '📊 Tổng quan giá trị kho',
                    prompt: 'Từ window.Web2ProductsCache.getAll(), tính: tổng số SP, số đang bán vs tạm dừng, tổng giá trị tồn theo giá mua (sum stock*originalPrice) và theo giá bán (sum stock*price). Liệt kê top 5 NCC theo số lượng SP. Trình bày gọn dạng bảng.',
                },
            ],
            note: "Trang này widget phân tích dữ liệu RẤT hữu ích (kho SP có cấu trúc rõ ràng). DOM hiện chỉ đủ context yếu (bảng phân trang/virtual, mỗi lần ~200 dòng filter), nên widget BẮT BUỘC ưu tiên đọc qua dataAccessor `window.Web2ProductsCache.getAll()` — đây là cache dùng chung giữ TOÀN BỘ kho SP đã nạp, không bị cắt bởi phân trang. Field đã verify trong code (web2-products-render.js + web2-products-cache.js + web2-products-state.js): code, name, variant, stock, pendingQty, returnQty, price (giá bán VND), originalPrice (giá mua VND), isActive, status ('CHO_MUA'/'DANG_BAN'/'MUA_1_PHAN'…), supplier, image",
        },
        {
            match: '/web2/variants/',
            model: { provider: 'gemini', model: 'gemini-2.5-flash' },
            accessors: [
                {
                    expr: 'window.Web2VariantsCache?.getAllIncludingInactive?.()',
                    desc: 'Mảng ĐẦY ĐỦ mọi biến thể (cả active + đã ẩn) từ cache dùng chung 1 nguồn (web2-variants-cache.js). Đầy đủ hơn DOM vì bảng có thể filter/ẩn. Đây là accessor nên dùng để rà soát toàn kho.',
                    shape: "Array<{ id:number, value:string (vd 'Màu Xanh Dương'/'Size M'/'Size 3'), groupName:string|null (vd 'Màu'/'Size'), shortCode:string|null (viết tắt A-Z0-9 dùng cho mã SP, phải duy nhất; null = chưa có), sortOrder:number, isActive:boolean }>",
                },
                {
                    expr: 'window.Web2VariantsCache?.getAll?.()',
                    desc: 'Chỉ các biến thể ĐANG DÙNG (isActive=true) — tập con của accessor trên. Dùng khi chỉ quan tâm biến thể còn hiệu lực.',
                    shape: 'Array<{ id, value, groupName, shortCode, sortOrder, isActive:true }> (cùng shape, đã lọc active)',
                },
                {
                    expr: 'window.Web2VariantsCache?.getColorShortMap?.()',
                    desc: 'Map { TÊN_MÀU_ASCII_HOA : shortCode } chỉ cho nhóm Màu — soi nhanh quy ước viết tắt màu đang khoá cho mã SP.',
                    shape: '{ [colorNameUpper:string]: shortCode:string }',
                },
            ],
            suggestions: [
                {
                    label: '⚠️ Biến thể thiếu viết tắt',
                    prompt: "Dựa trên window.Web2VariantsCache.getAllIncludingInactive(), liệt kê các biến thể có shortCode null/rỗng (cột Viết tắt hiện '⚠ chưa có'). Đây là biến thể chưa thể dùng để sinh mã SP. Gom theo nhóm, đề xuất viết tắt phù hợp (A-Z/0-9, ngắn gọn) cho từng cái.",
                },
                {
                    label: '🔁 Viết tắt bị trùng',
                    prompt: 'Quét toàn bộ biến thể qua window.Web2VariantsCache.getAllIncludingInactive() và tìm các shortCode bị TRÙNG nhau (cùng viết tắt cho 2+ biến thể khác giá trị). Viết tắt phải duy nhất vì dùng sinh mã SP — chỉ ra cặp/nhóm trùng và gợi ý đổi cái nào.',
                },
                {
                    label: '📋 Giá trị biến thể trùng lặp',
                    prompt: "Tìm các biến thể có giá trị (value) gần giống hoặc trùng nhau (vd 'Size M' và 'M', 'Màu Xanh' và 'Xanh', viết hoa/thường khác nhau) trong window.Web2VariantsCache.getAllIncludingInactive(). Liệt kê cặp dễ gây nhầm và gợi ý hợp nhất.",
                },
                {
                    label: '🗂️ Biến thể chưa gán nhóm',
                    prompt: 'Liệt kê các biến thể có groupName null/rỗng từ window.Web2VariantsCache.getAllIncludingInactive(). Suy ra nhóm hợp lý (Màu hay Size) từ giá trị của chúng và đề xuất gán nhóm để dễ lọc.',
                },
                {
                    label: '🎨 Soát quy ước màu/size',
                    prompt: 'Phân nhóm toàn bộ biến thể đang dùng (window.Web2VariantsCache.getAll()) theo groupName. Với nhóm Màu và Size, kiểm tra tính nhất quán đặt tên + viết tắt (vd Size chữ S/M/L/XL, Size số, tên màu), chỉ ra chỗ lệch quy ước và biến thể nên ẩn vì lỗi thời.',
                },
                {
                    label: '📊 Tổng quan kho biến thể',
                    prompt: 'Tóm tắt kho biến thể từ window.Web2VariantsCache.getAllIncludingInactive(): tổng số, số đang dùng vs đã ẩn, số nhóm, số biến thể thiếu viết tắt, top nhóm nhiều biến thể nhất. Nêu 3 việc cần dọn dẹp ưu tiên.',
                },
            ],
            note: 'Trang dùng IIFE: state thật `STATE.variants` (shape { id, value, groupName, shortCode, sortOrder, isActive }) bị đóng trong closure, KHÔNG expose trên window — `window.Web2VariantsApp` chỉ có { openEdit, toggleActive, remove }. Nguồn FULL dataset duy nhất trên window là cache dùng chung `window.Web2VariantsCache` (web2/shared/web2-variants-cache.js): `getAllIncludingInactive()` trả mảng MỌI biến thể (active+ẩn) — đầy đủ hơn DOM, accessor ưu tiên; `getAll()` chỉ active; `getColorShortMap()` cho nhóm Màu. Cache load qua Web2SmartCache (TTL 5 phút, SSE topic web2:variants, IDB persist) — gọi acce',
        },
        {
            match: '/native-orders/',
            model: { provider: 'groq', model: 'openai/gpt-oss-120b' },
            accessors: [
                {
                    expr: 'window.NativeOrders?.STATE?.orders',
                    desc: 'Mảng ĐẦY ĐỦ các đơn web đang hiển thị (đã lọc theo tab kênh + chiến dịch + trạng thái + tìm kiếm). Nguồn từ API /load (resp.orders) gán tại render.js:894 — full dataset, KHÔNG bị giới hạn bởi DOM/bảng ảo. Đây là accessor chính.',
                    shape: "Array<{code, customerName, phone, address, status:'draft'|'confirmed'|'cancelled'|'delivered', totalAmount, totalQuantity, channel:'web2_inbox'|'web2_livestream', createdAt(ms), employee, fbUserId, walletBalance, printCount, lastPrintedAt, customerComment, userNote, products:Array<{name, productCode, quantity, price, source, imageUrl}>, autoTags:Array<{trigger, name}>, tags:Array<string>, ckSignal:{status:'pending'|'confirmed', keyword, id}|null, pbhTotal, pbhResidual, pbhFulfillmentState, pbhCarrierName}>",
                },
                {
                    expr: 'window.NativeOrders?.STATE',
                    desc: 'State trang: status (bộ lọc trạng thái), channel (tab kênh đang xem), search (từ khoá tìm), selectedCampaignIds + availableCampaigns (chiến dịch/bài viết đang lọc), total/page/limit (phân trang). Dùng để AI biết NGỮ CẢNH bộ lọc hiện tại của danh sách.',
                    shape: '{orders:[], total, page, limit, status, channel, search, selectedCampaignIds:[], availableCampaigns:Array<{id,name,count,lastOrderAt}>}',
                },
            ],
            suggestions: [
                {
                    label: '💸 Đơn chưa nhận CK',
                    prompt: "Quét window.NativeOrders.STATE.orders: liệt kê các đơn CHƯA nhận chuyển khoản (totalAmount > 0 nhưng KHÔNG có ckSignal.status==='confirmed', KHÔNG (pbhTotal>0 && pbhResidual<=0), và walletBalance < totalAmount). Với mỗi đơn ghi: mã đơn, tên khách, SĐT, tổng tiền, số dư ví. Sắp xếp tổng tiền giảm dần, tính tổng số tiền đang chờ thu.",
                },
                {
                    label: '🏷️ Đơn SP chờ/âm mã',
                    prompt: "Quét autoTags của từng đơn trong window.NativeOrders.STATE.orders: liệt kê các đơn có thẻ cảnh báo (trigger liên quan 'SP chờ hàng' hoặc 'SP âm mã'). Ghi mã đơn, tên khách, tên thẻ và các sản phẩm (products[].name + productCode) đang vướng. Nhóm theo loại thẻ để biết đơn nào cần chờ hàng, đơn nào bị âm kho.",
                },
                {
                    label: '📦 Đơn nháp chưa lên PBH',
                    prompt: "Từ window.NativeOrders.STATE.orders, lọc đơn status==='draft' hoặc status==='confirmed' nhưng chưa có pbhTotal (chưa tạo phiếu bán hàng). Liệt kê mã đơn, khách, SĐT, tổng tiền, số SP (totalQuantity). Chỉ ra đơn nào đã đủ điều kiện lên PBH (có SP, có địa chỉ) và đơn nào còn thiếu địa chỉ/SĐT.",
                },
                {
                    label: '🚩 Đơn thiếu thông tin',
                    prompt: 'Soát window.NativeOrders.STATE.orders tìm đơn thiếu dữ liệu giao hàng: phone rỗng/không đúng định dạng SĐT VN (10 số bắt đầu 0), address rỗng, hoặc products rỗng (đơn không có sản phẩm). Liệt kê theo từng loại thiếu kèm mã đơn + tên khách để nhân viên bổ sung trước khi chốt.',
                },
                {
                    label: '💰 Tổng kết doanh số',
                    prompt: 'Tính trên window.NativeOrders.STATE.orders: tổng tiền và tổng số đơn theo từng status (draft/confirmed/cancelled/delivered). Tổng SP đã bán (sum totalQuantity, bỏ đơn cancelled). Top 5 khách mua nhiều tiền nhất (gộp theo SĐT). Top 5 sản phẩm bán chạy nhất theo số lượng (gộp products theo productCode).',
                },
                {
                    label: '🖨️ Đơn đã in nhưng chưa giao',
                    prompt: "Từ window.NativeOrders.STATE.orders, tìm đơn đã in phiếu (printCount > 0) nhưng status chưa phải 'delivered'. Ghi mã đơn, khách, lần in cuối (lastPrintedAt), trạng thái hiện tại. Đây là các đơn đã soạn hàng/in bill nhưng còn tồn chưa hoàn tất giao để nhân viên theo dõi.",
                },
            ],
            note: 'Trang "Đơn Web" có global đầy đủ: dùng window.NativeOrders.STATE.orders làm nguồn dữ liệu CHÍNH thay vì cào DOM. Mỗi phần tử là 1 đơn web với đủ trường nghiệp vụ (status, totalAmount, totalQuantity, walletBalance, ckSignal, pbh*, autoTags, tags, products[] line, printCount, customerComment/userNote). Widget nên: (1) đọc STATE.orders để có TOÀN BỘ đơn kể cả hàng chưa render trong bảng; (2) đọc STATE.status/channel/search/selectedCampaignIds để báo cho AI biết danh sách đang được lọc theo tab kênh (web2_inbox/web2_livestream) + chiến dịch + trạng thái nào (tránh kết luận sai trên tập đã lọc); (3',
        },
        {
            match: '/web2/balance-history/',
            model: { provider: 'groq', model: 'openai/gpt-oss-120b' },
            accessors: [
                {
                    expr: 'window.W2BH?.state?.rows',
                    desc: 'Mảng giao dịch CK của TRANG HIỆN TẠI (server-side paginate, mặc định 50 dòng/trang, đã áp filter trạng thái + ngày + tìm kiếm). Mỗi phần tử là 1 giao dịch SePay. Là nguồn data đầy đủ hơn DOM cho các dòng đang hiển thị.',
                    shape: "[{ id, transaction_date (ISO, GMT+7), transfer_amount (number), transfer_type: 'in'|'out', content (nội dung CK), linked_customer_phone (SĐT KH đã gán hoặc null), display_name (tên KH/NCC), match_method ('manual_deposit'|'manual_withdraw'|'manual_link'|'manual_resolve'|'manual_reassign'|'pending_match'|'pending_low_confidence'|null), verification_status ('AUTO_APPROVED'|...), debt_added (bool — đã cộng ví chưa), verified_by (user), verified_at, sepay_id, extraction_preview: { type:'qr_code'|'exact_phone'|'phone_suffix'|'none', value } }]",
                },
                {
                    expr: 'window.W2BH?.state?.stats',
                    desc: 'Thống kê TOÀN BẢNG web2_balance_history (KHÔNG bị giới hạn theo trang, áp theo filter ngày hiện tại) — chính xác hơn nhiều so với đếm trên DOM. Dùng cho mọi câu hỏi tổng quan.',
                    shape: '{ total (tổng số GD), auto_approved (số GD tự động khớp), no_phone (số GD chưa gán KH), pending_match (số GD trùng SĐT cần chọn), manual (nạp/rút tay), manual_all (mọi thao tác thủ công), total_in (tổng tiền vào), total_out (tổng tiền ra) }',
                },
                {
                    expr: 'window.W2BH?.state',
                    desc: 'State đầy đủ của trang: filter + phân trang. Cho AI biết KH đang xem khoảng nào / lọc gì.',
                    shape: "{ rows: [...], total (tổng GD khớp filter), page, pageSize, status (chip lọc đang chọn: 'all'|'MANUAL'|'MANUAL_ALL'|'AUTO_APPROVED'|'PENDING_MATCH'|'NO_PHONE'), search, dateFrom (YYYY-MM-DD), dateTo, loading, stats: {...} }",
                },
                {
                    expr: 'window.Web2BalanceHistoryApp?.state',
                    desc: 'Alias public — cùng tham chiếu tới W2BH.state (an toàn dùng làm fallback nếu W2BH chưa expose).',
                    shape: 'Giống window.W2BH.state',
                },
            ],
            suggestions: [
                {
                    label: '🔴 GD chưa gán khách',
                    prompt: 'Dựa vào window.W2BH.state.rows và state.stats, liệt kê các giao dịch CK CHƯA gán khách hàng (linked_customer_phone rỗng và match_method không phải nạp/rút tay). Với mỗi GD nêu ngày, số tiền, nội dung CK và gợi ý SĐT/đuôi SĐT trích được từ extraction_preview để gán nhanh. Cuối cùng cho biết tổng số GD chưa gán toàn bảng (stats.no_phone).',
                },
                {
                    label: '⚠️ Trùng SĐT cần chọn',
                    prompt: "Lọc trong window.W2BH.state.rows các giao dịch có match_method === 'pending_match' (trùng đuôi SĐT nhiều khách). Liệt kê ngày, số tiền, nội dung từng GD và nhắc rằng cần bấm '⚠ Trùng SĐT' để chọn đúng khách. Báo tổng số GD trùng SĐT toàn bảng từ stats.pending_match.",
                },
                {
                    label: '💸 GD chưa cộng ví',
                    prompt: 'Trong window.W2BH.state.rows, tìm các giao dịch ĐÃ có linked_customer_phone nhưng debt_added !== true (đang chờ cộng ví / kẹt xử lý). Liệt kê ngày, tên khách, SĐT, số tiền và cảnh báo đây là tiền khách đã chuyển nhưng ví chưa được cộng — cần kiểm tra ngay.',
                },
                {
                    label: '📊 Tổng kết tiền vào/ra',
                    prompt: 'Dựa vào window.W2BH.state.stats và state.dateFrom/dateTo, tổng kết khoảng thời gian đang lọc: tổng tiền VÀO (total_in), tổng tiền RA (total_out), số dư ròng, tổng số giao dịch (total), tỷ lệ tự động khớp (auto_approved/total). Trình bày gọn cho kế toán dễ đọc.',
                },
                {
                    label: '👤 Ai thao tác tay nhiều',
                    prompt: "Quét window.W2BH.state.rows các giao dịch thủ công (match_method bắt đầu bằng 'manual_'), nhóm theo verified_by để xem nhân viên nào nạp/rút/gán/đổi khách nhiều nhất trong trang hiện tại. Liệt kê từng người kèm loại thao tác (Nạp tay/Rút tay/Gán KH/Đổi KH) và số lượng.",
                },
                {
                    label: '🔎 GD lạ cần soát',
                    prompt: "Rà soát window.W2BH.state.rows tìm giao dịch bất thường cần kế toán kiểm tra: số tiền lớn bất thường, nội dung CK trống hoặc khó hiểu, GD ra (transfer_type='out') không rõ lý do, hoặc gán khách mà nội dung không khớp. Giải thích vì sao mỗi GD đáng ngờ.",
                },
            ],
            note: 'Trang quản lý giao dịch chuyển khoản SePay rồi gán vào ví KH Web 2.0. Widget hiện chỉ đọc DOM (bảng phân trang ~50 dòng). NÊN nâng cấp đọc 2 global đã verify trong code: (1) window.W2BH.state.rows = mảng giao dịch trang hiện tại với field đầy đủ (transfer_amount/type, content, linked_customer_phone, display_name, match_method, debt_added, verified_by, extraction_preview) — phong phú hơn DOM nhiều, nhất là extraction_preview và debt_added không hiện rõ trên bảng; (2) window.W2BH.state.stats = aggregate TOÀN BẢNG (total, auto_approved, no_phone, pending_match, manual, total_in, total_out) áp the',
        },
        {
            match: '/web2/customer-wallet/',
            model: { provider: 'groq', model: 'openai/gpt-oss-120b' },
            accessors: [
                {
                    expr: 'window.Web2CustomerWalletApp?.state?.rows',
                    desc: 'Mảng KH của TRANG HIỆN TẠI (server-paged, ~50/trang) đã merge ví + công nợ. Đây là dữ liệu đang render thành các card. Dùng cho phân tích theo trang đang xem.',
                    shape: "Array<{phone, name, customerId, web2Status:'Normal'|'VIP'|'Warning'|'Bom', web2Active, totalPurchased, paidAmount, returnedAmount, balance, walletBalance, totalDeposited, totalWithdrawn, pbhCount, nativeCount}>",
                },
                {
                    expr: 'Object.values(window.Web2CustomerWalletApp?.state?.cache || {})',
                    desc: 'TOÀN BỘ KH đã tải qua các trang (cache tích lũy keyed theo SĐT) — rộng hơn rows của 1 trang. Ưu tiên dùng cái này khi cần phân tích nhiều KH hơn 1 trang. balance>0 = còn nợ; walletBalance>0 = còn dư ví.',
                    shape: 'Array<{phone, name, totalPurchased, paidAmount, returnedAmount, balance, walletBalance, totalDeposited, totalWithdrawn, pbhCount, nativeCount, web2Status}>',
                },
                {
                    expr: 'window.Web2CustomerWalletApp?.state?.stats',
                    desc: 'Số liệu TỔNG HỢP TOÀN BỘ KH (aggregate server-side, KHÔNG chỉ trang hiện tại) — dùng cho câu hỏi tổng quan toàn shop.',
                    shape: '{total, total_debt, total_wallet_balance, total_paid, debt_count, has_balance_count}',
                },
                {
                    expr: 'window.W2CW?.state',
                    desc: 'State dùng chung đầy đủ (cùng tham chiếu với Web2CustomerWalletApp.state) — gồm rows, cache, stats, web2Partners (enrich nhà mạng/trạng thái theo SĐT), page, pageSize, total, quickFilter, search, sort.',
                    shape: '{rows:[], cache:{}, stats:{}, web2Partners:{}, total, page, pageSize, quickFilter, search, sort}',
                },
            ],
            suggestions: [
                {
                    label: '💰 Top khách nợ nhiều nhất',
                    prompt: "Từ dữ liệu ví khách hàng (window.Web2CustomerWalletApp.state.cache hoặc rows), liệt kê 15 khách có 'Còn nợ' (balance) cao nhất kèm SĐT, tên, tổng mua, đã thu và số nợ. Sắp xếp giảm dần theo số nợ và tính tổng nợ của nhóm này.",
                },
                {
                    label: '👛 Còn dư ví chưa dùng',
                    prompt: 'Tìm các khách có walletBalance > 0 (còn tiền dư trong ví) NHƯNG vẫn còn nợ (balance > 0). Đây là tiền đã thu nhưng chưa trừ vào công nợ — liệt kê SĐT, tên, dư ví, số nợ để nhắc nhân viên đối soát/trừ ví.',
                },
                {
                    label: '⚠️ Khách bom / cảnh báo',
                    prompt: "Lọc các khách có web2Status là 'Bom' hoặc 'Warning' trong dữ liệu ví. Liệt kê tên, SĐT, công nợ còn lại và đánh giá mức rủi ro thu hồi nợ cho từng người.",
                },
                {
                    label: '🧮 Soát thu vs mua',
                    prompt: 'Đối chiếu paidAmount (đã thu) + returnedAmount (đã trả) so với totalPurchased (tổng mua) cho từng khách. Chỉ ra các trường hợp bất thường: đã thu vượt tổng mua, hoặc balance âm, hoặc số liệu không khớp công thức Còn nợ = Tổng mua − Đã thu − Đã trả.',
                },
                {
                    label: '📊 Tổng quan công nợ shop',
                    prompt: 'Dựa trên window.Web2CustomerWalletApp.state.stats, tóm tắt sức khỏe công nợ toàn shop: tổng công nợ (total_debt), tổng dư ví (total_wallet_balance), tổng đã thu (total_paid), số khách còn nợ (debt_count), số khách có dư ví (has_balance_count). Nhận xét ngắn về tỉ lệ thu hồi.',
                },
                {
                    label: '🎯 Khách VIP nhiều đơn',
                    prompt: 'Tìm các khách mua nhiều (totalPurchased cao) hoặc nhiều đơn (pbhCount + nativeCount lớn) trong dữ liệu ví. Liệt kê top khách giá trị nhất kèm tổng mua, số PBH, số đơn web và tình trạng công nợ hiện tại.',
                },
            ],
            note: 'Trang "Ví Khách Hàng" render server-paged (~50 KH/trang) nên DOM chỉ show 1 trang — widget PHẢI ưu tiên đọc global thay vì DOM. Nguồn tốt nhất: window.Web2CustomerWalletApp.state.cache (object keyed theo SĐT, tích lũy MỌI KH đã tải qua các trang → rộng hơn DOM rất nhiều) → dùng Object.values() để ra mảng. Nếu chỉ cần trang hiện tại dùng state.rows. Số liệu tổng toàn shop (không phụ thuộc paging) nằm ở state.stats (total_debt, total_wallet_balance, total_paid, debt_count, has_balance_count). Lưu ý Web2CustomerWalletApp.state === W2CW.state (cùng tham chiếu). Mỗi row đã merge sẵn: balance = Còn ',
        },
        {
            match: '/web2/supplier-wallet/',
            model: { provider: 'groq', model: 'openai/gpt-oss-120b' },
            accessors: [
                {
                    expr: 'Object.values(window.__SW?.walletState?.wallets || {})',
                    desc: 'FULL danh sách ví NCC (mọi NCC, không bị giới hạn bởi search/sort/scroll của DOM). Mỗi NCC: tổng mua / đã trả / trả hàng / còn nợ + toàn bộ giao dịch. Đây là nguồn ĐẦY ĐỦ nhất — bảng card trên trang chỉ hiển thị bản đã lọc/sắp xếp.',
                    shape: "Array<{ supplier:string, totalPurchased:number, paidAmount:number, returnedAmount:number, balance:number, returnedRowIds:{[rowId]:{qty,amount,ts}}, transactions:Array<{id,ts,type:'payment'|'return'|'purchase',amount:number,note:string,ref:object|null,performedBy:string|null}> }>",
                },
                {
                    expr: 'Object.values(window.__SW?.suppliers || {})',
                    desc: "Aggregation derive từ Sổ Order: từng dòng đã MUA (nhận hàng) per NCC — chi tiết SP/biến thể/SL/giá nhập đã quy đổi VND. Dùng để soi cấu thành 'Tổng mua', SP nào, đơn giá, ngày nhận.",
                    shape: "Array<{ supplier:string, totalPurchased:number, purchases:Array<{rowId,date,productName,variant,qty,costVnd,subtotal,status:'received'|'partial_received'}> }>",
                },
                {
                    expr: 'window.SupplierWalletStorage?.loadCached?.()',
                    desc: 'State ví NCC đang cache (đồng bộ, không async). Fallback khi __SW.walletState chưa gán. Trả emptyState {wallets:{},lastUpdated:0} nếu chưa load.',
                    shape: '{ wallets:{[supplier]:{supplier,totalPurchased,paidAmount,returnedAmount,balance,transactions:[...]}}, lastUpdated:number, lastDepositSync?:number }',
                },
            ],
            suggestions: [
                {
                    label: '💸 NCC còn nợ nhiều nhất',
                    prompt: 'Từ dữ liệu ví NCC (window.__SW.walletState.wallets), liệt kê các NCC đang CÒN NỢ (balance > 0), sắp xếp giảm dần theo số còn nợ. Ghi rõ tên NCC, tổng mua, đã trả, trả hàng và còn nợ. Tính tổng công nợ toàn bộ.',
                },
                {
                    label: '🔍 Balance lệch công thức',
                    prompt: "Kiểm tra từng NCC: balance có đúng = totalPurchased − paidAmount − returnedAmount không? Liệt kê NCC nào số 'Còn nợ' bị lệch so với công thức, kèm số đúng.",
                },
                {
                    label: '⚠️ Trả/hoàn vượt tiền mua',
                    prompt: 'Tìm NCC có dấu hiệu bất thường: đã trả + trả hàng (paidAmount + returnedAmount) VƯỢT tổng mua (totalPurchased), hoặc balance âm. Đây là rủi ro trả dư / over-refund. Liệt kê tên NCC và chênh lệch.',
                },
                {
                    label: '🧾 Giao dịch SePay gần đây',
                    prompt: "Duyệt transactions của các NCC, lọc giao dịch loại 'payment' có ref.source = 'sepay' (refund SePay khớp tự động). Liệt kê NCC, số tiền, ngày và nội dung — soát xem có khớp NHẦM NCC không.",
                },
                {
                    label: '📦 Soi cấu thành Tổng mua',
                    prompt: 'Với NCC có tổng mua lớn nhất (window.__SW.suppliers), liệt kê các dòng đã mua: SP, biến thể, số lượng, đơn giá VND, thành tiền và ngày nhận. Cộng lại xem có khớp totalPurchased không.',
                },
                {
                    label: '🤝 NCC không phát sinh',
                    prompt: 'Liệt kê các NCC đã tạo nhưng totalPurchased = 0 và transactions rỗng (chưa mua, chưa giao dịch) — ứng viên dọn dẹp hoặc chưa nhập đơn vào Sổ Order.',
                },
            ],
            note: 'Trang Ví NCC có global FULL dataset rõ ràng — widget NÊN đọc qua dataAccessors thay vì DOM. Nguồn chính: window.__SW.walletState.wallets (object keyed theo tên NCC) chứa MỌI ví NCC với đủ totalPurchased/paidAmount/returnedAmount/balance + mảng transactions đầy đủ — KHÔNG bị giới hạn bởi ô search/sort/scroll như các card hiển thị. Dùng Object.values() để có mảng. Bổ sung: window.__SW.suppliers (aggregation derive từ Sổ Order) cho chi tiết từng dòng MUA (SP/biến thể/SL/giá nhập/ngày). Cả hai gán sau init() async + cập nhật realtime qua SSE (web2:supplier-wallet, web2:so-order, web2:wallet:*), nê',
        },
        {
            match: '/so-order/',
            model: { provider: 'groq', model: 'openai/gpt-oss-120b' },
            accessors: [
                {
                    expr: 'window.SoOrder?.state',
                    desc: 'FULL dataset Sổ Order: object gốc giữ TẤT CẢ tab + đợt nhập + dòng hàng (kể cả tab không active và đợt đang thu gọn — không nằm trong DOM). Đây là nguồn đầy đủ nhất, widget nên đọc cái này thay vì DOM.',
                    shape: "{ activeTabId: string, tabs: [{ id, label (vd 'HÀ NỘI'/'HƯƠNG CHÂU'), currency ('VND'|'CNY'), rate, footer:{discount,shipping}, columnVisibility:{}, shipments: [{ id, date:'YYYY-MM-DD', batch, caseCount, weightKg, contractAmount, contractCurrency, collapsed, rows: [{ id, supplier, productName, variant, qty, sellPrice, costPrice, productImage, invoiceImage, note, costNote, status:'draft'|'partial_received'|'received'|'cancelled', createdAt, updatedAt }] }] }] }",
                },
                {
                    expr: '(window.SoOrder?.state?.tabs||[]).flatMap(t=>(t.shipments||[]).flatMap(s=>(s.rows||[]).map(r=>({...r, tabLabel:t.label, currency:t.currency, rate:t.rate, shipDate:s.date, batch:s.batch}))))',
                    desc: 'Mảng PHẲNG mọi dòng hàng của mọi tab/đợt, đã kèm tabLabel/currency/rate/shipDate/batch — tiện cho AI lọc/đếm/tính tổng (vd SP thiếu giá nhập, SL âm, trùng tên, tổng tiền theo NCC).',
                    shape: '[{ id, supplier, productName, variant, qty:number, sellPrice:number, costPrice:number, status, note, costNote, tabLabel, currency, rate, shipDate, batch }]',
                },
                {
                    expr: 'window.SoOrderStorage?.getActiveTab?.(window.SoOrder?.state)',
                    desc: "Tab đang xem (đúng dữ liệu hiển thị trên màn). Dùng khi user hỏi 'tab này' / 'đang xem'.",
                    shape: '{ id, label, currency, rate, footer, shipments:[...] } (cùng shape tab ở trên)',
                },
                {
                    expr: 'window.SoOrderStorage?.getTrash?.(window.SoOrder?.state)',
                    desc: "Thùng rác — các đợt nhập đã xoá mềm (để hỏi 'đợt nào vừa bị xoá').",
                    shape: '[{ id, ...shipment, deletedAt }]',
                },
                {
                    expr: 'window.Web2ProductsCache?.getAll?.()',
                    desc: "Kho SP Web 2.0 (cache) — để đối chiếu tồn kho / 'đã có ở kho' với SP trong Sổ Order (vd SP order nhưng chưa có mã kho, hoặc đã có để cảnh báo nhập trùng).",
                    shape: '[{ code, name, variant, stock|qtyOnHand, sellPrice, ... }]',
                },
            ],
            suggestions: [
                {
                    label: '💸 SP thiếu giá nhập',
                    prompt: 'Đọc window.SoOrder.state, liệt kê mọi dòng hàng có costPrice = 0 hoặc trống (thiếu giá nhập) nhưng qty > 0. Nhóm theo NCC (supplier) và tab, cho biết tên SP + biến thể + đợt nhập (date/batch) để mình điền giá.',
                },
                {
                    label: '🔁 SP trùng tên/biến thể',
                    prompt: 'Quét toàn bộ dòng hàng trong Sổ Order, tìm các SP bị NHẬP TRÙNG (cùng productName + variant + NCC) ở nhiều dòng/đợt khác nhau. Liệt kê nhóm trùng kèm số lượng mỗi dòng để mình kiểm tra có đặt dư không.',
                },
                {
                    label: '🧮 Tổng tiền nhập theo NCC',
                    prompt: 'Tính tổng tiền nhập (qty × costPrice) gom theo từng NCC trên tab đang xem, và tổng cộng cuối cùng. Quy đổi theo rate của tab nếu currency khác VND. Sắp xếp NCC từ cao xuống thấp.',
                },
                {
                    label: '⚠️ SL hoặc giá bất thường',
                    prompt: 'Tìm các dòng có dữ liệu bất thường: qty ≤ 0, qty quá lớn (>500), giá bán (sellPrice) thấp hơn giá nhập (costPrice), hoặc giá nhập bằng 0 mà giá bán có. Liệt kê rõ từng dòng để mình soát lại.',
                },
                {
                    label: '📦 Đợt chưa nhận hàng',
                    prompt: 'Liệt kê các đợt nhập (shipment) còn dòng ở trạng thái draft hoặc partial_received (chưa nhận đủ). Với mỗi đợt cho biết NCC, ngày, số dòng chưa nhận và tổng SL còn lại, để mình theo dõi hàng về.',
                },
                {
                    label: '🏷️ SP chưa có ở kho',
                    prompt: 'Đối chiếu các SP trong Sổ Order (window.SoOrder.state) với kho SP (window.Web2ProductsCache.getAll()). Liệt kê SP đã order nhưng CHƯA có mã/khớp trong kho để mình tạo mã kho trước khi nhận hàng.',
                },
            ],
            note: 'Trang này có FULL dataset trên window, không cần dựa vào DOM (DOM chỉ render tab active + đợt không thu gọn, thiếu nhiều dữ liệu). Nguồn chuẩn: window.SoOrder.state (object gốc tabs/shipments/rows). Helper window.SoOrderStorage.getActiveTab(state) trả tab đang xem; getTrash(state) trả thùng rác. Để AI phân tích dễ nhất, dùng accessor flatMap (#2) để có mảng phẳng mọi dòng hàng kèm tabLabel/currency/rate/shipDate/batch. Row shape verified trong so-order-storage.js: { id, supplier, productName, variant, qty, sellPrice, costPrice, productImage, invoiceImage, note(GHI CHÚ bán), costNote(GHI CHÚ CP',
        },
        {
            match: '/web2/kpi/',
            model: { provider: 'groq', model: 'openai/gpt-oss-120b' },
            accessors: [],
            suggestions: [
                {
                    label: '🏆 Ai KPI thấp nhất',
                    prompt: 'Dựa trên bảng xếp hạng KPI đang hiển thị, liệt kê nhân viên có cột Thực (SP) thấp nhất và cao nhất, kèm số SP và số tiền. Chỉ ra ai đang tụt lại phía sau trong chiến dịch này.',
                },
                {
                    label: '📊 So Dự báo vs Thực',
                    prompt: 'So sánh cột Dự báo (SP) với Thực (SP) của từng nhân viên trong bảng. Nhân viên nào có chênh lệch lớn nhất (dự báo cao nhưng thực thấp), nghĩa là nhiều đơn chưa chốt thành đơn hàng? Liệt kê top 3.',
                },
                {
                    label: '⚠️ Đơn chưa gán NV',
                    prompt: "Xem dòng 'Chưa gán NV (ngoài khoảng STT)' trong bảng. Có bao nhiêu SP dự báo và thực đang chưa được phân công cho nhân viên nào? Nhắc admin cần vào Phân công khoảng STT để gán.",
                },
                {
                    label: '💰 Tổng tiền KPI',
                    prompt: 'Cộng tổng cột Thực (đ) của tất cả nhân viên trong bảng để ra tổng tiền KPI thực tế của chiến dịch. So với tổng Dự báo (đ) để biết tỷ lệ chốt đơn (%).',
                },
                {
                    label: '📈 Khoảng cách top 3',
                    prompt: 'Tính khoảng cách số SP Thực giữa nhân viên hạng 1, 2, 3 trong bảng xếp hạng. Cuộc đua có sát sao không, hay người dẫn đầu bỏ xa phần còn lại?',
                },
                {
                    label: '🎯 Nhắc nhở đẩy đơn',
                    prompt: 'Dựa trên bảng KPI, soạn 1 lời nhắc ngắn gọn động viên nhân viên có cột Thực thấp tăng tốc chốt đơn, và khen nhân viên đang dẫn đầu.',
                },
            ],
            note: "Trang KPI (web2/kpi/index.html) KHÔNG expose dataset lên window. STATE chứa leaderboard (campaigns, rows: beneficiary_name + forecast_qty/amount + actual_qty/amount) nằm trong IIFE private của js/kpi-dashboard.js, không gắn vào window. Window global duy nhất là window.Web2Kpi nhưng chỉ có HÀM helper (fmtVnd, escapeHtml, fetchKpi, authHeaders, RATE_PER_SP) — KHÔNG có cache data, nên dataAccessors=[]. Cách enrich: widget đọc TRỰC TIẾP bảng đã render trong DOM '#kpiContent table.data-table' (mỗi <tr> = 1 nhân viên với 6 cột: #, Nhân viên, Dự báo SP, Dự báo đ, Thực SP, Thực đ; dòng cuối có thể là ",
        },
        {
            match: '/web2/reconcile/',
            model: { provider: 'groq', model: 'openai/gpt-oss-120b' },
            accessors: [
                {
                    expr: 'window.RC?.STATE?.items || []',
                    desc: 'Danh sách ĐẦY ĐỦ các PBH đang hiển thị theo tab+search hiện tại (mỗi PBH có cả lines SP — KHÔNG bị ảo hoá, giàu hơn DOM nhiều). Dùng để phân tích toàn bộ đơn trong tab: tiến độ pick, đơn nào còn thiếu hàng, đơn nào pick đủ chưa đóng gói.',
                    shape: "Array<{ number: string, displayStt: number, partner: { name: string, phone: string, address: string }, fulfillmentState: 'pending'|'picking'|'picked'|'packed'|'shipped'|'delivered'|'cancelled', totals: { quantity: number, picked: number, isComplete: boolean }, lines: Array<{ productCode: string, productName: string, quantity: number, picked_qty: number, imageUrl: string|null }>, amountTotal: number, dateInvoice: string }>",
                },
                {
                    expr: 'window.RC?.STATE?.currentPbh || null',
                    desc: 'Chi tiết PBH đang được chọn/mở (null nếu chưa chọn). Chứa từng dòng SP cần pick + số đã pick — dùng để soát đơn cụ thể đang đối soát.',
                    shape: '{ number: string, partner: { name, phone, address }, fulfillmentState: string, totals: { quantity, picked, isComplete }, lines: Array<{ productCode, productName, quantity, picked_qty, imageUrl }>, amountTotal: number, dateInvoice: string } | null',
                },
                {
                    expr: "window.RC?.STATE?.filterState || 'active'",
                    desc: 'Tab trạng thái đang lọc (active/pending/picking/picked/packed/shipped/delivered) — cho AI biết items đang ứng với trạng thái nào.',
                    shape: 'string',
                },
            ],
            suggestions: [
                {
                    label: '🚚 Đơn còn thiếu hàng',
                    prompt: 'Dựa trên window.RC.STATE.items, liệt kê các PBH CHƯA pick đủ (totals.picked < totals.quantity). Với mỗi đơn ghi: mã PBH, tên khách, đã pick X/Y, và những dòng SP còn thiếu (productCode + productName + thiếu mấy cái). Sắp xếp đơn gần đủ nhất lên trước.',
                },
                {
                    label: '📦 Pick đủ chưa đóng gói',
                    prompt: "Từ window.RC.STATE.items, tìm các PBH đã pick ĐỦ hàng (totals.isComplete=true) nhưng fulfillmentState vẫn là 'picking' hoặc 'picked' (chưa 'packed'). Đây là đơn cần bấm Đóng gói ngay. Liệt kê mã PBH + khách + tổng SL.",
                },
                {
                    label: '🔫 SP cần quét nhiều nhất',
                    prompt: 'Gộp tất cả lines trong window.RC.STATE.items của các đơn chưa đóng gói, tính tổng số SP còn cần pick theo từng productCode (quantity - picked_qty). Liệt kê top sản phẩm cần soạn nhiều nhất để gom hàng 1 lượt — kèm productName và tổng số còn thiếu.',
                },
                {
                    label: '⏱️ Đơn tồn lâu chưa giao',
                    prompt: "Phân tích window.RC.STATE.items: đơn nào đã 'packed' hoặc 'shipped' lâu mà chưa 'delivered'? Dựa vào dateInvoice và fulfillmentState, chỉ ra các đơn có nguy cơ tồn kho/chậm giao cần xử lý. Ghi mã PBH + khách + trạng thái + ngày hoá đơn.",
                },
                {
                    label: '🔍 Soát đơn đang chọn',
                    prompt: 'Soát PBH đang mở (window.RC.STATE.currentPbh): liệt kê từng dòng SP chưa pick đủ (picked_qty < quantity) kèm productCode + productName + còn thiếu mấy cái, và cho biết đơn đã đủ điều kiện đóng gói chưa.',
                },
                {
                    label: '📊 Tổng quan tiến độ tab',
                    prompt: 'Thống kê nhanh window.RC.STATE.items của tab hiện tại: tổng số PBH, bao nhiêu đã pick đủ, bao nhiêu còn thiếu, tổng SL cần pick và đã pick, tỉ lệ % hoàn tất chung. Gợi ý nên ưu tiên soạn đơn nào trước.',
                },
            ],
            note: 'Trang reconcile là trang đối soát/đóng gói PBH (1 PBH = 1 đơn bán hàng cần soạn hàng + verify pick). Widget PHẢI ưu tiên đọc dataset đầy đủ qua window.RC.STATE thay vì DOM, vì: (1) DOM danh sách chỉ render các PBH thuộc TAB đang chọn, còn STATE.items đã chứa toàn bộ kèm lines SP của từng đơn; (2) DOM chi tiết chỉ hiện khi user đã CHỌN 1 PBH — khi chưa chọn, DOM gần như rỗng (context yếu như mô tả), nhưng STATE.items vẫn đầy đủ. Namespace window.RC là nội bộ (không phải public API) nhưng vẫn gắn trên window và tồn tại ở runtime — đọc được an toàn bằng optional chaining. Mỗi item/currentPbh có c',
        },
        {
            match: '/web2/customers/',
            model: { provider: 'gemini', model: 'gemini-2.5-flash' },
            accessors: [
                {
                    expr: 'window.__wcApp?.state?.rows',
                    desc: 'Mảng FULL các khách hàng đang hiển thị (trang hiện tại, server-paginated limit 50). Giàu hơn DOM: chứa cả field không render ra bảng (tier, tags, globalId, aliases…). Đây là nguồn chính cho widget phân tích.',
                    shape: "Array<{ id, name, phone, altPhones:string[], address, altAddresses:string[], status:'Normal'|'Bom'|'Warning'|'Danger'|'VIP', source, note, globalId, fbId, fbPageId, aliases:string[], totalOrders:number, totalSpent:number, bomCount:number, tier, tags:string[] }>",
                },
                {
                    expr: 'window.__wcApp?.state',
                    desc: 'State điều phối trang: total (tổng KH toàn kho qua mọi trang), page, limit, search (từ khoá đang lọc), status (filter trạng thái), source (filter nguồn), selected (Set id đang chọn). Dùng để biết widget đang xem subset nào.',
                    shape: '{ rows:[], total:number, page:number, limit:number, search:string, status:string, source:string, selected:Set<id> }',
                },
                {
                    expr: 'window.__wcApp?._pancakeRows',
                    desc: 'Kết quả fallback Pancake (khi tìm 1 SĐT không có trong kho) — KH ngoài kho chưa import. Có thể rỗng nếu không chạy fallback.',
                    shape: 'Array<{ name, phone, avatarUrl, isInbox:boolean, pageId }>',
                },
            ],
            suggestions: [
                {
                    label: '📵 KH thiếu SĐT/FB',
                    prompt: 'Từ danh sách khách trong window.__wcApp.state.rows, liệt kê các khách thiếu số điện thoại (phone rỗng) HOẶC thiếu cả fbId/globalId (không gửi tin được). Nêu tên + nguồn (source) từng người và cảnh báo đây là KH khó liên hệ lại.',
                },
                {
                    label: '💣 KH bom hàng / nguy hiểm',
                    prompt: "Lọc trong state.rows các khách có status là 'Bom' hoặc 'Danger', hoặc bomCount > 0. Xếp theo bomCount giảm dần, hiển thị tên + SĐT + số lần bom + tổng số đơn, và gợi ý có nên chặn/đặt cọc trước khi chốt đơn không.",
                },
                {
                    label: '👑 Top KH chi nhiều nhất',
                    prompt: 'Từ state.rows, sắp xếp khách theo totalSpent giảm dần, lấy top 10. Hiển thị tên, SĐT, tổng chi (định dạng đồng), số đơn, trạng thái. Chỉ ra khách VIP nhưng chưa gắn tier/status VIP để mình chăm sóc.',
                },
                {
                    label: '📑 SĐT trùng / nghi trùng KH',
                    prompt: 'Quét state.rows tìm các khách nghi bị trùng: cùng tên gần giống nhau, hoặc SĐT của người này nằm trong altPhones của người khác. Liệt kê các cặp nghi trùng để mình gộp (merge) lại, tránh 1 khách thành nhiều thẻ.',
                },
                {
                    label: '📍 KH thiếu địa chỉ giao',
                    prompt: 'Liệt kê trong state.rows các khách đã có đơn (totalOrders > 0) nhưng address rỗng và không có altAddresses. Đây là KH cần bổ sung địa chỉ trước khi giao — nêu tên + SĐT từng người.',
                },
                {
                    label: '📊 Tổng quan tệp KH',
                    prompt: 'Phân tích state.rows: đếm khách theo từng trạng thái (Bình thường/VIP/Cảnh báo/Bom/Nguy hiểm), theo nguồn (source), tổng doanh thu (sum totalSpent), tổng số đơn. So state.rows.length với state.total để nhắc mình rằng đây chỉ là trang đang xem, còn bao nhiêu khách chưa tải.',
                },
            ],
            note: "Trang KHÔNG expose global public; toàn bộ state nằm ở namespace nội bộ window.__wcApp (đặt bởi customers-state.js). Accessor CHÍNH = window.__wcApp.state.rows — mảng KH đầy đủ field (richer than DOM: gồm tier, tags, globalId, aliases, totalSpent, bomCount… không hiện hết trên bảng). Lưu ý QUAN TRỌNG: trang server-paginated (limit 50 / trang), nên state.rows CHỈ chứa trang hiện tại, KHÔNG phải toàn bộ kho; state.total mới là tổng KH toàn kho. Widget khi phân tích nên nói rõ 'đang xét N khách trang này (state.rows.length) trên tổng state.total' để không gây hiểu nhầm. Nếu muốn phân tích nhiều hơ",
        },
        {
            match: '/web2/fastsaleorder-invoice/',
            model: { provider: 'groq', model: 'openai/gpt-oss-120b' },
            accessors: [
                {
                    expr: 'window.PbhState?.STATE?.orders',
                    desc: 'Mảng FULL các PBH (phiếu bán hàng) đang load theo trang+scope hiện tại — nguồn đầy đủ hơn DOM (gồm cả field không hiển thị: customerId, sourceLink.type, totals.quantity). Đây là single source of truth của bảng (pbh-state.js STATE.orders, đổ vào từ /api/fast-sale-orders/load).',
                    shape: "Array<{ number: string, displayStt?: number, mergedDisplayStt?: number[], splitIndex?: number, state: 'done'|'cancel'|'draft'|'confirmed', dateInvoice: string, customerId?: number, partner: { name?: string, phone?: string, address?: string }, addressDetail?: { wardName?, districtName?, cityName? }, totals: { total: number, quantity?: number }, sourceLink: { code?: string, type?: 'native_order'|string } }>",
                },
                {
                    expr: 'window.PbhState?.STATE',
                    desc: 'State tổng của trang: total (tổng số PBH khớp filter ở backend), page, limit, state (filter trạng thái), search (từ khoá), customerId (đang lọc theo KH 360 nào). Dùng để biết bối cảnh lọc/phân trang khi phân tích orders.',
                    shape: '{ orders: Array, total: number, page: number, limit: number, state: string, search: string, customerId: number|null }',
                },
            ],
            suggestions: [
                {
                    label: '💰 Tổng tiền theo trạng thái',
                    prompt: "Dựa trên window.PbhState.STATE.orders, tính tổng doanh thu (cộng totals.total) cho các PBH state='done' (Hoàn thành) và tách riêng phần state='cancel' (Đã hủy). Cho biết số lượng PBH mỗi nhóm và % giá trị đơn hủy trên tổng.",
                },
                {
                    label: '🚫 Đơn hủy đáng chú ý',
                    prompt: "Liệt kê các PBH có state='cancel' từ window.PbhState.STATE.orders: số phiếu (number), tên + SĐT khách (partner), tổng tiền (totals.total), đơn nguồn (sourceLink.code). Sắp xếp giá trị giảm dần để biết đơn hủy nào tiếc nhất.",
                },
                {
                    label: '👥 Khách mua nhiều nhất',
                    prompt: "Gom window.PbhState.STATE.orders theo partner.phone, tính số PBH và tổng totals.total mỗi khách (chỉ tính state khác 'cancel'). Liệt kê top 5 khách chi nhiều nhất kèm tên và SĐT.",
                },
                {
                    label: '📞 PBH thiếu SĐT/tên',
                    prompt: 'Rà soát window.PbhState.STATE.orders, tìm các PBH thiếu partner.phone hoặc partner.name hoặc partner.address (trống/—). Liệt kê số phiếu để nhân viên bổ sung thông tin giao hàng.',
                },
                {
                    label: '🔗 PBH tạo tay (Manual)',
                    prompt: 'Lọc window.PbhState.STATE.orders các phiếu KHÔNG có sourceLink.code (đơn Manual, không gắn đơn Web nguồn). Đếm số lượng, tổng tiền và liệt kê số phiếu — đây là các PBH cần kiểm tra vì không truy được về đơn gốc.',
                },
                {
                    label: '📊 Tổng quan trang này',
                    prompt: 'Tóm tắt nhanh dữ liệu đang xem từ window.PbhState.STATE: tổng số PBH (total), đang lọc gì (state/search/customerId), trong số orders đã load có bao nhiêu Hoàn thành vs Đã hủy, tổng giá trị, và đơn giá trị cao nhất.',
                },
            ],
            note: "Trang \"Phiếu bán hàng (PBH)\" = danh sách hóa đơn bán hàng (fast_sale_orders) Web 2.0. Widget NÊN ưu tiên đọc window.PbhState.STATE.orders thay vì DOM: STATE.orders là mảng FULL các PBH đang load (theo page+scope+filter backend), giàu field hơn cells hiển thị — gồm customerId, sourceLink.type ('native_order' vs Manual), totals.quantity, addressDetail. Mỗi order list-level CÓ: number, partner{name,phone,address}, state ('done'=Hoàn thành / 'cancel'=Đã hủy; legacy 'draft'/'confirmed' cũng = Hoàn thành), totals{total,quantity}, sourceLink{code,type}, dateInvoice, displayStt/mergedDisplayStt/splitI",
        },
        {
            match: '/web2/fastsaleorder-delivery/',
            model: { provider: 'groq', model: 'openai/gpt-oss-120b' },
            accessors: [],
            suggestions: [
                {
                    label: '📦 Đơn chờ giao lâu',
                    prompt: 'Trong bảng phiếu giao đang hiển thị, liệt kê các phiếu có trạng thái "Chờ giao" và "Đang giao", sắp theo Ngày giao cũ nhất lên đầu — chỉ ra phiếu nào bị tồn lâu chưa chuyển sang Đã giao để shop xử lý gấp. Ghi rõ số phiếu, khách hàng, SĐT, hãng vận chuyển, tracking.',
                },
                {
                    label: '↩️ Thống kê đơn bị trả',
                    prompt: 'Đếm và liệt kê các phiếu giao trạng thái "Bị trả" và "Đã hủy" trong bảng. Nhóm theo hãng vận chuyển để xem hãng nào bị trả/hủy nhiều nhất, kèm tổng số lượng SP và danh sách khách hàng tương ứng.',
                },
                {
                    label: '🚚 So sánh hãng vận chuyển',
                    prompt: 'Dựa trên dữ liệu bảng phiếu giao, tổng hợp theo từng Hãng VC: số phiếu đang giao, đã giao, bị trả, đã hủy. Tính tỷ lệ giao thành công của mỗi hãng và nhận xét hãng nào đang giao hiệu quả nhất.',
                },
                {
                    label: '⚠️ Phiếu thiếu tracking',
                    prompt: 'Soát các phiếu giao đang ở trạng thái "Đang giao" hoặc "Chờ giao" mà cột Tracking trống hoặc hiển thị "—". Liệt kê số phiếu + khách hàng + SĐT để shop bổ sung mã vận đơn.',
                },
                {
                    label: '📞 Gom theo khách hàng',
                    prompt: 'Tìm các khách hàng (theo SĐT) có nhiều hơn 1 phiếu giao trong bảng. Liệt kê từng khách kèm danh sách số phiếu, trạng thái và tổng số lượng SP để gộp giao hoặc kiểm tra trùng đơn.',
                },
                {
                    label: '📊 Tổng quan trạng thái',
                    prompt: 'Đếm số phiếu giao theo từng trạng thái (Chờ giao, Đang giao, Đã giao, Bị trả, Đã hủy) đang hiển thị và tính tổng số lượng SP. Đưa ra bức tranh nhanh về tình hình giao hàng hôm nay.',
                },
            ],
            note: 'KHÔNG có global trên window giữ full dataset. Toàn bộ data nằm trong biến module-private `const STATE = { orders, total, page, limit:200, state, search }` bên trong IIFE của dlv-app.js — không expose ra window. `window.DlvApp` chỉ export METHODS (detail, openHistory, ship, deliver, return_, cancel, goPage), KHÔNG có accessor trả về mảng/object data. Vì vậy dataAccessors=[] và widget phải dựa vào DOM bảng (`#dlvTbody` trong `#dlvTable`). Lưu ý: bảng đã render đầy đủ các dòng của trang hiện tại (server-side pagination, limit=200/trang) — KHÔNG ảo hóa, nên `main.innerText`/DOM table phản ánh đủ d',
        },
        {
            match: '/web2/fastsaleorder-refund/',
            model: { provider: 'groq', model: 'openai/gpt-oss-120b' },
            accessors: [],
            suggestions: [
                {
                    label: '💸 Tổng tiền hoàn',
                    prompt: 'Dựa trên bảng phiếu trả đang hiển thị, tính tổng tiền hoàn (cột Tiền hoàn) và tổng SL trả của tất cả phiếu, rồi tách riêng theo từng trạng thái (Nháp, Đã duyệt, Hoàn thành, Đã hủy). Trả về dạng bảng ngắn gọn kèm số phiếu mỗi nhóm.',
                },
                {
                    label: '⏳ Phiếu nháp tồn đọng',
                    prompt: 'Liệt kê các phiếu trả đang ở trạng thái Nháp hoặc Đã duyệt (chưa Hoàn thành) trong bảng. Sắp xếp theo Ngày cũ nhất trước để biết phiếu nào tồn lâu chưa xử lý, kèm tên khách + tiền hoàn từng phiếu.',
                },
                {
                    label: '🔁 So sánh hình thức hoàn',
                    prompt: 'Phân loại các phiếu trả đang hiển thị theo Mode (Tiền mặt, Ví, Đổi). Đếm số phiếu và cộng tổng tiền hoàn cho mỗi hình thức, chỉ ra hình thức nào chiếm nhiều nhất.',
                },
                {
                    label: '👤 Khách trả nhiều lần',
                    prompt: 'Tìm trong bảng những khách hàng (theo SĐT hoặc tên) xuất hiện ở từ 2 phiếu trả trở lên. Liệt kê khách đó cùng số phiếu, tổng SL trả và tổng tiền hoàn để nhận diện khách hay trả hàng.',
                },
                {
                    label: '⚠️ Phiếu tiền hoàn lớn',
                    prompt: 'Lọc các phiếu trả có tiền hoàn cao bất thường so với mặt bằng các phiếu khác trong bảng (ví dụ top cao nhất hoặc lệch hẳn). Nêu số phiếu, khách, PBH gốc và tiền hoàn để kiểm tra lại.',
                },
                {
                    label: '📋 Tóm tắt ca làm',
                    prompt: 'Tóm tắt nhanh tình hình trả hàng đang hiển thị: tổng số phiếu, bao nhiêu đã hoàn thành / đã hủy / còn chờ xử lý, tổng tiền đã hoàn cho khách, và 2-3 điểm cần chú ý nếu có.',
                },
            ],
            note: 'KHÔNG có window global nào giữ full dataset trên trang này. Toàn bộ danh sách phiếu trả nằm trong biến `STATE.orders` ĐÓNG KÍN trong IIFE của rf-app.js (`(function(){ const STATE = {orders:[],...} })()`), không gán lên window. Window chỉ export `window.RfApp` = các method hành động (detail/openHistory/approve/complete/cancel/goPage), KHÔNG có accessor trả về data. Vì vậy dataAccessors=[] — widget phải dựa vào DOM. May mắn là DOM-context trang này ĐỦ TỐT để phân tích: bảng `#rfTable` render đầy đủ mọi cột cần (STT, Số phiếu, PBH gốc, Khách hàng, SĐT, Mode hoàn [Tiền mặt/Ví/Đổi], SL trả, Tiền ho',
        },
        {
            match: '/web2/supplier-debt/',
            model: { provider: 'groq', model: 'openai/gpt-oss-120b' },
            accessors: [
                {
                    expr: 'window.__SupplierDebt?.STATE?.rows',
                    desc: 'Mảng dòng công nợ NCC ĐÃ tổng hợp + lọc theo khoảng ngày/tìm kiếm đang hiển thị (đầy đủ, không bị giới hạn phân trang/DOM 6 dòng). Mỗi dòng = 1 nhà cung cấp với nợ đầu kỳ, phát sinh mua, đã thanh toán/trả hàng, nợ cuối kỳ + chi tiết phiếu mua & giao dịch trong kỳ. Đây là nguồn chính cho mọi phân tích công nợ.',
                    shape: "Array<{ supplier: string (tên NCC, có thể kèm mã ở đầu), code: string (mã NCC vd 'B5'), opening: number (nợ đầu kỳ VND), debit: number (phát sinh mua trong kỳ VND), credit: number (tổng thanh toán+trả hàng trong kỳ VND), creditPayment: number (riêng tiền đã trả NCC), creditReturn: number (riêng trả hàng), ending: number (nợ cuối kỳ VND = opening+debit-credit), purchasesInPeriod: Array<{date, productName, variant, qty, costVnd, subtotal, tabLabel}>, txInPeriod: Array<{ts, type:'payment'|'return', amount, note, moveName}>, source: 'web2' }>",
                },
                {
                    expr: 'window.__SupplierDebt?.STATE?.filters',
                    desc: 'Bộ lọc đang áp dụng cho báo cáo: khoảng ngày from/to (yyyy-mm-dd), từ khoá tìm, chế độ hiển thị. Dùng để biết số liệu rows đang thuộc kỳ nào khi tóm tắt.',
                    shape: "{ from: string, to: string, search: string, display: 'all'|'endnonzero', sourceWeb2: boolean }",
                },
                {
                    expr: 'window.__SupplierDebt?.STATE?.suppliersList',
                    desc: 'Danh sách meta toàn bộ NCC (kể cả NCC chưa phát sinh công nợ trong kỳ): tên, mã, ghi chú. Hữu ích khi cần đối chiếu mã/ghi chú hoặc liệt kê NCC chưa có giao dịch.',
                    shape: 'Array<{ name: string, code: string, note: string, createdAt: number }>',
                },
            ],
            suggestions: [
                {
                    label: '💰 NCC nợ nhiều nhất',
                    prompt: 'Dựa trên dữ liệu công nợ đang hiển thị (window.__SupplierDebt.STATE.rows), liệt kê TOP 10 nhà cung cấp có nợ cuối kỳ (ending) lớn nhất theo thứ tự giảm dần. Với mỗi NCC ghi: mã, tên, nợ cuối kỳ. Tính tổng nợ cuối kỳ của toàn bộ NCC.',
                },
                {
                    label: '⚠️ NCC nợ âm (trả dư)',
                    prompt: 'Tìm các nhà cung cấp có nợ cuối kỳ (ending) ÂM trong dữ liệu rows — tức shop đã thanh toán hoặc trả hàng nhiều hơn số tiền mua. Liệt kê mã, tên, số tiền âm và gợi ý nguyên nhân (trả dư, ghi nhầm, hoặc còn hàng chưa nhận).',
                },
                {
                    label: '🧾 NCC chưa thanh toán đồng nào',
                    prompt: 'Trong kỳ đang xem, liệt kê các NCC có phát sinh mua hàng (debit > 0) nhưng credit = 0 (chưa thanh toán và chưa trả hàng đồng nào). Sắp xếp theo số phát sinh giảm dần — đây là nhóm cần ưu tiên thanh toán.',
                },
                {
                    label: '📊 Tổng quan công nợ kỳ này',
                    prompt: 'Tóm tắt tổng quan công nợ NCC kỳ đang lọc: tổng nợ đầu kỳ, tổng phát sinh mua, tổng đã thanh toán, tổng đã trả hàng, tổng nợ cuối kỳ, số lượng NCC còn nợ (ending khác 0). Nêu khoảng ngày đang áp dụng từ STATE.filters.',
                },
                {
                    label: '🔁 NCC trả hàng nhiều',
                    prompt: 'Liệt kê các NCC có creditReturn (giá trị trả hàng) cao nhất trong kỳ. Với mỗi NCC, so sánh giá trị trả hàng với giá trị mua (debit) để phát hiện NCC có tỷ lệ trả hàng bất thường cao — dấu hiệu hàng lỗi/sai mẫu.',
                },
                {
                    label: '✅ Đối chiếu thanh toán bất thường',
                    prompt: 'Rà soát từng dòng trong rows: kiểm tra ending có đúng bằng opening + debit - credit không, và phát hiện NCC nào có giao dịch (txInPeriod) lớn bất thường so với phiếu mua (purchasesInPeriod). Cảnh báo các trường hợp số liệu nghi sai để soát lại sổ NCC.',
                },
            ],
            note: 'Widget nên đọc FULL dataset qua window.__SupplierDebt.STATE.rows thay vì DOM (bảng phân trang 50 dòng/trang + DOM cap 7000 ký tự bỏ sót phần lớn NCC và toàn bộ chi tiết phiếu mua/giao dịch). STATE.rows đã được tổng hợp + lọc theo đúng khoảng ngày/tìm kiếm đang hiển thị nên khớp ngữ cảnh người dùng. Mỗi row là dữ liệu số tài chính (opening/debit/credit/ending VND) cộng mảng chi tiết purchasesInPeriod[] và txInPeriod[] — đủ để AI phân tích công nợ, phát hiện NCC nợ nhiều/nợ âm/chưa thanh toán/trả hàng bất thường. Kèm STATE.filters để nêu rõ kỳ báo cáo và STATE.suppliersList để đối chiếu mã/ghi c',
        },
        {
            match: '/web2/returns/',
            model: { provider: 'groq', model: 'openai/gpt-oss-120b' },
            accessors: [
                {
                    expr: 'window.ReturnsCore?.STATE?.list || []',
                    desc: "Mảng phiếu thu về của tab 'Danh sách' (chỉ có data SAU khi user mở tab Danh sách; tab mặc định 'create' để rỗng). Nguồn từ api.list().returns. Đầy đủ hơn DOM: có mã code lý do/trạng thái dạng raw.",
                    shape: "[{code, customerName, phone, method('khach_gui'|'shipper_gui'), issue('van_de_khach'|'van_de_shipper'), subType('thu_ve_1_phan'|'khong_nhan_hang'), reason, items:[{productCode,productName,quantity,price}], walletCredited(number, shipper có thể âm), codReduction, stockStatus('applied'|'pending'|'approved'), billStatus('queued'|'consumed'|null), status('active'|'cancelled')}]",
                },
                {
                    expr: 'window.ReturnsCore?.STATE?.pending || []',
                    desc: "Mảng phiếu CHỜ DUYỆT vào kho thật (chỉ có data SAU khi mở tab 'Chờ duyệt'). Nguồn api.pending().items. Có ageDays + overdue để soát phiếu tồn lâu.",
                    shape: '[{code, customerName, phone, items:[{productCode,quantity}], walletCredited(number), ageDays(number), overdue(bool)}]',
                },
                {
                    expr: "window.ReturnsCore?.STATE?.tab || 'create'",
                    desc: "Tab đang mở: 'create' (tạo phiếu), 'list' (danh sách), 'pending' (chờ duyệt). Dùng để biết list/pending đã được nạp data chưa.",
                    shape: 'string',
                },
                {
                    expr: 'window.ReturnsCore?.STATE?.customer || null',
                    desc: 'KH đang chọn ở tab tạo phiếu (chỉ có khi đang soạn 1 phiếu mới).',
                    shape: '{phone, name, customerId} | null',
                },
                {
                    expr: 'window.ReturnsCore?.STATE?.sourceOrder || null',
                    desc: 'Đơn nguồn đang được chọn để thu về (tab create), kèm items/COD/ship.',
                    shape: '{code, type, totalAmount, items, walletDeducted, cod, ship} | null',
                },
            ],
            suggestions: [
                {
                    label: '⏰ Phiếu chờ duyệt quá hạn',
                    prompt: 'Trong danh sách phiếu CHỜ DUYỆT (window.ReturnsCore.STATE.pending), liệt kê các phiếu có overdue=true hoặc ageDays lớn nhất, kèm mã phiếu, tên KH, số ngày tồn và số SP chờ vào kho. Sắp xếp tồn lâu nhất lên đầu để nhắc duyệt gấp.',
                },
                {
                    label: '💰 Ví cộng bất thường',
                    prompt: 'Rà soát STATE.list: tìm phiếu thu về có walletCredited âm (shipper trừ ví) hoặc walletCredited lệch bất thường so với codReduction. Liệt kê mã phiếu, tên KH, số tiền ví, lý do — chỉ ra phiếu nào cần kiểm tra lại số tiền hoàn/trừ.',
                },
                {
                    label: '📦 Lý do thu về nhiều nhất',
                    prompt: 'Thống kê STATE.list theo trường reason (khach_boom, khong_lien_lac, sai_dia_chi, doi_y...) và issue (vấn đề khách / shipper). Cho biết lý do nào khiến hàng bị thu về nhiều nhất, kèm % và số phiếu, để biết nên xử lý khâu nào trước.',
                },
                {
                    label: '🏷️ Phiếu kẹt chờ lên bill',
                    prompt: "Trong STATE.list tìm phiếu billStatus='queued' (chờ bill 0đ) còn tồn chưa lên bill đổi. Liệt kê mã phiếu, KH, SP — nhắc nhân viên hoàn tất bill đổi cho các phiếu này.",
                },
                {
                    label: '🔁 KH trả hàng nhiều lần',
                    prompt: 'Gom STATE.list theo phone/customerName: chỉ ra khách nào có từ 2 phiếu thu về trở lên (boom/đổi ý nhiều). Liệt kê tên, SĐT, số phiếu và tổng tiền ví đã hoàn — cảnh báo khách hay boom hàng.',
                },
                {
                    label: '📊 Tổng quan phiếu hôm nay',
                    prompt: 'Tóm tắt nhanh dữ liệu phiếu thu về đang hiển thị (STATE.list): tổng số phiếu, bao nhiêu đã vào kho thật / chờ duyệt, tổng tiền ví đã cộng, số phiếu vấn đề shipper vs vấn đề khách. Nêu điểm cần chú ý.',
                },
            ],
            note: "Trang dùng 1 nguồn state chung window.ReturnsCore.STATE (mutable). Widget nên đọc STATE.list (phiếu thu về) + STATE.pending (chờ duyệt) thay vì chỉ DOM, vì 2 mảng này giàu field hơn bảng render (walletCredited có dấu âm cho shipper, stockStatus/billStatus/reason dạng raw, ageDays/overdue chỉ có trong pending — không hiện đủ trên DOM). LƯU Ý QUAN TRỌNG: data nạp LAZY theo tab — STATE.list chỉ có sau khi user mở tab 'Danh sách', STATE.pending sau tab 'Chờ duyệt'; tab mặc định 'create' để cả hai RỖNG. Widget nên kiểm tra STATE.tab và nếu mảng rỗng thì gợi ý user mở tab tương ứng (hoặc fallback DO",
        },
        {
            match: '/web2/purchase-refund/',
            model: { provider: 'groq', model: 'openai/gpt-oss-120b' },
            accessors: [
                {
                    expr: 'window.PurchaseRefund?.state?.SOURCE_STATE?.items',
                    desc: 'Section A — DS hàng đã NHẬN từ Sổ Order còn tồn kho (>0), có thể trả lại NCC. Gom theo ĐƠN (NCC + đợt/shipment). Đây là dữ liệu CHÍNH của trang. Đầy đủ hơn DOM vì DOM group/cắt theo filter.',
                    shape: '[{ aggId, supplier (tên NCC), shipmentId, shipBatch (đợt), shipDate, tabLabel, code (mã SP), name, variant (biến thể), imageUrl, stock (tồn = max trả được), price (giá), orderedQty (đã đặt), sources:[{tab,ship,qty}] }]',
                },
                {
                    expr: 'window.PurchaseRefund?.state?.STATE?.items',
                    desc: 'Section B — DS PHIẾU trả hàng NCC đã tạo (limit 200, đầy đủ hơn DOM <ul> bị lọc theo status/search). Mỗi phiếu = 1 lần trả đã chốt (auto-approve + trừ kho + ghi ví NCC).',
                    shape: '[{ code, name, status (draft|sent|approved|refunded|rejected|cancelled), supplierName, supplierCode, supplierPhone, reason (defect|wrong_item|excess|quality|other), refundMethod (cash|bank|debt_offset|replace), refundDate, totalQty, totalAmount, products, stock_deducted, sourcePurchaseCode, approved_at, refunded_at, rejected_at, note, history }]',
                },
                {
                    expr: 'window.Web2ProductsCache?.getAll?.()',
                    desc: 'Kho SP Web 2.0 (nguồn tồn kho thật để đối chiếu). Section A join với cache này để biết stock = số lượng tối đa được trả NCC.',
                    shape: '[{ code, name, variant, stock (tồn), price, imageUrl, supplier }]',
                },
            ],
            suggestions: [
                {
                    label: '📦 Hàng trả được nhiều nhất',
                    prompt: 'Từ SOURCE_STATE.items (hàng nhận từ Sổ Order còn tồn), liệt kê 10 SP có giá trị tồn kho (stock × price) cao nhất đang có thể trả lại NCC, kèm NCC, đợt nhập, tồn và thành tiền. Sắp giảm dần.',
                },
                {
                    label: '🏭 Tổng tồn theo NCC',
                    prompt: 'Gom SOURCE_STATE.items theo từng nhà cung cấp (supplier): tính tổng số SP, tổng số lượng tồn và tổng giá trị tồn (stock × price) mỗi NCC. Cho biết NCC nào đang giữ nhiều hàng có thể trả nhất.',
                },
                {
                    label: '💰 Tổng tiền đã trả NCC',
                    prompt: 'Từ STATE.items (DS phiếu trả), tính tổng số phiếu và tổng totalAmount theo từng trạng thái (đã hoàn tiền / NCC duyệt / từ chối / nháp). Nêu rõ tổng tiền NCC đã thực hoàn (status=refunded).',
                },
                {
                    label: '⚠️ Phiếu chưa hoàn tiền',
                    prompt: "Lọc STATE.items những phiếu status khác 'refunded' và khác 'rejected' (đang chờ NCC hoàn tiền). Liệt kê mã phiếu, NCC, tổng tiền, ngày trả, số ngày đã treo. Sắp theo tiền giảm dần để đòi NCC.",
                },
                {
                    label: '🔁 Lý do trả hàng',
                    prompt: 'Thống kê STATE.items theo lý do trả (reason): mỗi lý do bao nhiêu phiếu, tổng SL, tổng tiền. Chỉ ra lý do gây thiệt hại nhiều nhất (vd hàng lỗi, sai mã) để báo NCC cải thiện.',
                },
                {
                    label: '🧮 Soát SL trả vs tồn',
                    prompt: 'Đối chiếu STATE.items với SOURCE_STATE.items theo mã SP: kiểm tra có phiếu nào trả số lượng vượt tồn kho hiện có không, hoặc SP đã trả hết nhưng vẫn còn trong DS có thể trả. Chỉ rõ dòng bất thường.',
                },
            ],
            note: 'Trang Trả hàng NCC có 2 dataset đầy đủ trên window, RẤT hợp cho widget đọc trực tiếp thay vì DOM. (1) window.PurchaseRefund.state.SOURCE_STATE.items = Section A, hàng đã nhận từ Sổ Order còn tồn>0 (có thể trả NCC), gom theo ĐƠN — DOM hiển thị dạng group đã lọc theo search/supplier nên thiếu; accessor cho FULL list với supplier/stock/price/orderedQty/variant. (2) window.PurchaseRefund.state.STATE.items = Section B, DS phiếu trả đã tạo (loadList limit 200) — DOM <ul id=prList> bị applyFilters cắt theo status+search và chỉ show code/NCC/tên/tiền, accessor cho đủ field gồm reason/refundMethod/tota',
        },
        {
            match: '/live-chat/',
            model: { provider: 'gemini', model: 'gemini-2.5-flash' },
            accessors: [
                {
                    expr: 'window.LiveState?.comments',
                    desc: 'FULL mảng comment livestream đang load của (các) bài live đang chọn — sort newest-first, đã dedup. ĐÂY là nguồn đầy đủ nhất: list comment được virtualize (chỉ render ~N dòng mới nhất ra DOM theo _renderLimit), nên DOM CHỈ thấy phần đầu — accessor này có toàn bộ. Mỗi item: {id, message (nội dung khách gõ), from:{id,name,picture}, created_time, is_hidden, phone, address, _pageName, _pageId, post_id}.',
                    shape: 'Array<{ id:string, message:string, from:{ id:string, name:string }, created_time:string, is_hidden:boolean, phone?:string, address?:string, _pageName?:string, post_id?:string }>',
                },
                {
                    expr: 'window.LiveCommentList?._filteredAll?.()',
                    desc: 'Như LiveState.comments nhưng ĐÃ loại bỏ comment của người bị ẩn (mặc định 2 page shop NhiJudyStore/NhiJudyHouse). Sạch hơn cho AI phân tích cảm xúc/khách thật — không lẫn comment của shop. Trả mảng cùng shape comment.',
                    shape: 'Array<comment>  (= LiveState.comments trừ người bị ẩn)',
                },
                {
                    expr: 'Array.from((window.LiveState?.sessionIndexMap)?.values?.() || [])',
                    desc: "Bản đồ commenter → đơn web (native-orders) đã tạo trong livestream. Key gốc = fromId (FB id). Lọc item.source==='NATIVE_WEB' để biết khách nào đã có đơn (item.code = mã đơn, item.index = STT, item.commentIds = comment đã gộp vào đơn). Dùng để soát 'khách comment chốt đơn nhưng chưa lên đơn web'.",
                    shape: 'Array<{ source:string, code?:string, index?:number, commentIds?:string[] }>',
                },
            ],
            suggestions: [
                {
                    label: '🛒 Khách chốt chưa lên đơn',
                    prompt: "Đọc window.LiveState.comments. Liệt kê các khách có comment thể hiện ý ĐỊNH MUA / CHỐT đơn (vd 'lấy', 'chốt', 'mua', '1 cái', gọi size/màu, để lại SĐT) nhưng fromId của họ KHÔNG có trong sessionIndexMap với source NATIVE_WEB (tức chưa tạo đơn web). Trả tên + nội dung comment + SĐT (nếu có), nhóm theo bài live.",
                },
                {
                    label: '😊 Cảm xúc + gợi ý trả lời',
                    prompt: 'Phân tích cảm xúc khách qua các comment trong window.LiveCommentList._filteredAll() (đã bỏ comment shop). Nhóm vui / bình thường / khó chịu - bực; với mỗi khách khó chịu nêu lý do và gợi ý 1 câu trả lời lịch sự, hợp shop thời trang nữ N2Store.',
                },
                {
                    label: '📞 SĐT khách trong comment',
                    prompt: 'Rà window.LiveState.comments tìm các comment khách tự gõ SĐT (chuỗi 10 số 0xxxxxxxxx) hoặc có field phone. Liệt kê tên khách + SĐT + nội dung comment, loại trùng. Đánh dấu SĐT không hợp lệ (không đúng định dạng 10 số).',
                },
                {
                    label: '🔥 Hỏi nhiều về SP nào',
                    prompt: 'Đọc message của toàn bộ window.LiveState.comments. Tổng hợp khách đang hỏi/quan tâm nhiều nhất về sản phẩm / mẫu / màu / size nào (đếm số lượt nhắc). Trả top mặt hàng được hỏi nhiều kèm số comment, để biết nên ưu tiên giới thiệu gì trong livestream.',
                },
                {
                    label: '❓ Câu hỏi chưa trả lời',
                    prompt: 'Quét window.LiveCommentList._filteredAll() lọc các comment là CÂU HỎI của khách (giá bao nhiêu, còn hàng không, ship sao, size nào...). Liệt kê từng câu hỏi + tên người hỏi để nhân viên không bỏ sót khách cần tư vấn.',
                },
                {
                    label: '📊 Tóm tắt phiên live',
                    prompt: 'Từ window.LiveState.comments cho tôi tóm tắt nhanh phiên live đang xem: tổng số comment (không tính người ẩn), số khách riêng biệt, bao nhiêu khách để lại SĐT, bao nhiêu khách đã có đơn web (sessionIndexMap source NATIVE_WEB), và 3 điểm đáng chú ý nhất về tương tác khách.',
                },
            ],
            note: 'Trang live-chat = bình luận livestream Facebook 3 cột. Comment list bị VIRTUALIZE: chỉ ~N dòng mới nhất (state._renderLimit) render ra DOM, infinite-scroll mới nạp thêm — nên context CHỈ-DOM của widget hiện tại (main.innerText cap 7000) chỉ thấy một phần nhỏ + thiếu cấu trúc (SĐT/địa chỉ/trạng thái nằm trong data-* và pill async). Widget NÊN ưu tiên đọc window.LiveState.comments (full set, đã verify gán tại live-init-wiring.js dòng 380 `state.comments = allComments`) thay vì DOM. Dùng window.LiveCommentList._filteredAll() khi muốn loại comment của 2 page shop (sạch hơn cho phân tích khách). Để',
        },
        {
            match: '/web2/fb-ads-stats/',
            model: { provider: 'groq', model: 'openai/gpt-oss-120b' },
            accessors: [],
            suggestions: [
                {
                    label: '💸 Ngày lỗ nhất',
                    prompt: 'Dựa trên bảng số liệu quảng cáo đang hiển thị, tìm những ngày/đợt có chi phí trên mỗi đơn (CP/đơn) cao nhất hoặc ROAS thấp nhất (lỗ). Liệt kê ngày, tiền QC, số đơn, CP/đơn, ROAS và chỉ rõ đợt nào đang đốt tiền không hiệu quả.',
                },
                {
                    label: '📊 So ROAS các đợt',
                    prompt: 'So sánh ROAS (doanh thu ÷ chi QC) và CP/đơn giữa tất cả các ngày/tuần/bài đang hiển thị. Xếp hạng từ hiệu quả nhất tới kém nhất, nêu rõ đợt live/bài nào nên tăng ngân sách và đợt nào nên dừng.',
                },
                {
                    label: '🎯 CP/đơn vượt ngưỡng',
                    prompt: 'Quét số liệu đang hiển thị, liệt kê các bản ghi có chi phí mỗi đơn (CP/đơn) cao bất thường so với mặt bằng các ngày khác. Gợi ý ngưỡng CP/đơn hợp lý cho shop thời trang nữ và cảnh báo bản ghi nào vượt.',
                },
                {
                    label: '🧮 Soát phép tính',
                    prompt: 'Kiểm tra lại các phép tính trong bảng: CP/đơn = chi QC ÷ số đơn, ROAS = doanh thu ÷ chi QC. Đối chiếu với số đang hiển thị, chỉ ra dòng nào tính sai, thiếu doanh thu, hoặc số đơn = 0 mà vẫn tốn tiền QC.',
                },
                {
                    label: '📈 Tổng kết tháng',
                    prompt: 'Tổng hợp toàn bộ số liệu đang hiển thị: tổng chi QC, tổng đơn, CP/đơn trung bình, tổng doanh thu, ROAS chung. Nhận xét hiệu quả quảng cáo tháng này và đề xuất nên phân bổ ngân sách thế nào cho tháng tới.',
                },
                {
                    label: '🚀 Bài chạy tốt nhất',
                    prompt: 'Dựa trên các bản ghi gắn bài/đợt live đang hiển thị, xác định bài hoặc đợt live nào ra nhiều đơn nhất với chi phí thấp nhất. Gợi ý nên nhân rộng nội dung/khung giờ nào cho các đợt sau.',
                },
            ],
            note: 'KHÔNG có window global giữ full dataset trên trang này → dataAccessors=[]. Cả 2 module đều là IIFE giữ dữ liệu trong biến local: fb-ads-manual.js dùng `_entries` (sổ QC nhập tay, fetch qua FBPostsApi.adEntries()), fb-ads-stats.js dùng `_accounts`/`_pages` + dữ liệu insights render trực tiếp (FBPostsApi.adInsights()/adAccounts()). Global duy nhất là `window.FBAdsManual` (chỉ expose `{ mount }`, KHÔNG có data) và `window.FBPostsApi` (chỉ là API client functions). Đã verify đọc code: không có .getAll()/.state/.all/._cache nào trỏ tới mảng data. → Widget tiếp tục dựa vào DOM context, và DOM contex',
        },
        {
            match: '/web2/fb-insights/',
            model: { provider: 'gemini', model: 'gemini-2.5-flash' },
            accessors: [],
            suggestions: [
                {
                    label: '⏰ Khung giờ đăng tốt nhất',
                    prompt: 'Dựa trên bảng "Khung giờ đăng hiệu quả" và "Thứ trong tuần hiệu quả" của page đang chọn, cho biết 3 khung giờ + thứ nào có TB tương tác/bài cao nhất. Đề xuất lịch đăng bài tối ưu cho shop thời trang nữ (giờ vàng nên đăng).',
                },
                {
                    label: '🏆 Vì sao top bài hot',
                    prompt: 'Phân tích danh sách "Top bài tương tác cao nhất": loại bài (live/video/hình/bài viết) nào hút tương tác nhất, nội dung/caption có điểm gì chung. Rút ra 3 gợi ý nội dung nên làm nhiều hơn.',
                },
                {
                    label: '📊 Loại bài nào hiệu quả',
                    prompt: 'So sánh số lượng từng loại bài (Livestream/Video/Hình/Bài viết) ở mục "Phân loại bài" với TB tương tác/bài. Loại nào đang đăng nhiều nhưng tương tác thấp, loại nào ít mà hiệu quả? Khuyến nghị nên dồn sức vào đâu.',
                },
                {
                    label: '📺 Hiệu quả livestream',
                    prompt: 'Xem mục "Livestream gần đây — người xem": buổi live nào đông người xem nhất, lượt xem video ra sao. Nhận xét xu hướng người xem live tăng hay giảm và gợi ý khung giờ live tốt.',
                },
                {
                    label: '📈 Đánh giá sức khỏe page',
                    prompt: 'Từ "Tổng quan page" (người theo dõi, đang nói đến) và "Số liệu trang THẬT 28 ngày" (reach, follow mới, bỏ follow), đánh giá page đang tăng trưởng hay chững. Nêu chỉ số đáng lo và việc cần làm.',
                },
                {
                    label: '🎯 Báo cáo tuần ngắn gọn',
                    prompt: 'Tổng hợp toàn bộ số liệu trang này thành báo cáo ngắn cho chủ shop: tổng tương tác, bài hiệu quả nhất, giờ vàng nên đăng, và 3 việc nên làm tuần tới. Viết tiếng Việt, gạch đầu dòng.',
                },
            ],
            note: 'KHÔNG có global window giữ dataset. Trang web2/fb-insights/js/fb-insights.js là IIFE đóng kín: state chỉ ở biến module-private (_pages, _pageId, _limit) và đối số `data` truyền vào hàm render() — KHÔNG gán lên window. API client window.FBPostsApi (alias window.Web2FbClient, file web2/shared/web2-fb-client.js) là wrapper STATELESS: engagement(pageId, limit) chỉ fetch `/engagement` rồi return JSON thẳng cho render(), KHÔNG cache lên window/this. Do đó dataAccessors=[] — widget chỉ đọc được DOM.\\n\\nTIN TỐT cho DOM-context: trang KHÔNG có bảng ảo / virtualization / lazy-load. render() đổ TOÀN BỘ k',
        },
        {
            match: '/web2/ck-dashboard/',
            model: { provider: 'groq', model: 'openai/gpt-oss-120b' },
            accessors: [],
            suggestions: [
                {
                    label: '🔴 Tín hiệu CK quá hạn',
                    prompt: "Xem cột 'Chờ duyệt' đang hiển thị: tín hiệu CK nào để quá lâu (theo phần 'giờ'/'ngày' trên mỗi thẻ)? Liệt kê khách + tin nhắn của tín hiệu cũ nhất cần duyệt gấp trước, sắp xếp từ lâu nhất xuống.",
                },
                {
                    label: '💸 CK chưa khớp đơn',
                    prompt: "Trong các thẻ đang hiển thị, tín hiệu CK nào ghi 'Chưa khớp đơn'? Liệt kê khách + nội dung tin nhắn báo CK của họ để nhân viên đối chiếu tìm đơn thủ công.",
                },
                {
                    label: '⏳ Đơn chờ tiền về lâu',
                    prompt: "Xem cột 'Đã duyệt · chờ tiền về': đơn nào đã duyệt nhưng chờ tiền về quá lâu (xem phần thời gian trên thẻ)? Nêu khách + mã đơn + số tiền để theo dõi, ưu tiên lâu nhất.",
                },
                {
                    label: '🙂 Cảm xúc khách báo CK',
                    prompt: "Đọc nội dung tin nhắn trong các thẻ 'Chờ duyệt' và 'Yêu cầu khác của KH'. Khách nào có vẻ sốt ruột / khó chịu (giục, hỏi nhiều lần)? Gợi ý câu trả lời trấn an phù hợp cho từng khách.",
                },
                {
                    label: '📨 Yêu cầu khác cần xử lý',
                    prompt: "Tóm tắt các thẻ trong cột 'Yêu cầu khác của KH' đang hiển thị: mỗi khách muốn gì (đổi/huỷ/hỏi ship/khiếu nại…)? Sắp theo mức độ gấp và đề xuất việc cần làm cho từng yêu cầu.",
                },
                {
                    label: '📊 Tổng quan đối soát',
                    prompt: 'Dựa vào 3 cột đang hiển thị (Chờ duyệt, Chờ tiền về, Yêu cầu khác), tóm tắt tình hình đối soát hiện tại: bao nhiêu việc tồn, nhóm nào đáng lo nhất, nhân viên nên xử lý gì trước.',
                },
            ],
            note: 'KHÔNG có global window giữ full dataset → dataAccessors=[]. Toàn bộ app (web2/ck-dashboard/js/ck-dashboard-app.js) chạy trong IIFE; biến `state` (3 cột: pending/wait/intents, mỗi cột {offset, items[], hasMore}) và `hist` (Lịch sử CK) đều là biến closure, KHÔNG gán lên window. 2 shared module được dùng chỉ expose hàm, không expose data: window.Web2CkReview = { openSignalList, openReview } (web2-ck-review.js:492) và window.Web2UnreadPanel = { mount, reload } (web2-unread-panel.js:149). Đã verify bằng grep: không có `window.<X> =` nào trỏ tới dữ liệu CK.\n\nVì vậy widget vẫn chỉ đọc được DOM hiển t',
        },
        {
            match: '/web2/dashboard/',
            model: { provider: 'groq', model: 'llama-3.1-8b-instant' },
            accessors: [
                {
                    expr: "(()=>{const c=window.Chart?.getChart?.('chartRevenue');if(!c)return null;const ds=c.data?.datasets?.[0]?.data||[];return (c.data?.labels||[]).map((date,i)=>({date,amount:ds[i]??0}));})()",
                    desc: 'Doanh thu 7 ngày gần nhất (mảng {date, amount}). Dữ liệu này vẽ trên <canvas> nên KHÔNG đọc được qua DOM innerText — chỉ lấy được qua Chart.getChart.',
                    shape: "[{date:'2026-06-19', amount:12500000}, {date:'2026-06-20', amount:9800000}, ...] (7 phần tử)",
                },
                {
                    expr: "(()=>{const c=window.Chart?.getChart?.('chartState');if(!c)return null;const ds=c.data?.datasets?.[0]?.data||[];return (c.data?.labels||[]).map((state,i)=>({state,count:ds[i]??0}));})()",
                    desc: 'Phân bố PBH theo trạng thái trong 30 ngày (mảng {state, count}: done/cancel/draft/...). Vẽ trên canvas doughnut, KHÔNG có trong DOM text.',
                    shape: "[{state:'done', count:142}, {state:'draft', count:23}, {state:'cancel', count:5}]",
                },
                {
                    expr: "(()=>{const g=(id)=>document.getElementById(id)?.textContent?.trim()||null;return {revenue_today:g('kpiRevenue'),pbh_done_today:g('kpiRevSub'),pbh_pending_pack:g('kpiPending'),stock_low_count:g('kpiStock'),wallet_overdraft:g('kpiWallet'),so_unreceived_shipments:g('kpiSoUnrecv'),so_sub:g('kpiSoSub')};})()",
                    desc: '5 chỉ số KPI chính đang hiển thị trên thẻ (doanh thu hôm nay, PBH cần đóng gói, SP sắp hết, ví KH âm, đợt chưa nhận đủ). Đọc từ DOM card — gom gọn lại cho AI khỏi phải tự dò.',
                    shape: "{revenue_today:'12.500.000đ', pbh_done_today:'8 đơn', pbh_pending_pack:'3', stock_low_count:'12', wallet_overdraft:'2', so_unreceived_shipments:'4', so_sub:'6 đợt · 18 SP chờ'}",
                },
            ],
            suggestions: [
                {
                    label: '📊 Tóm tắt sức khỏe shop',
                    prompt: 'Dựa trên 5 chỉ số KPI và 2 biểu đồ trên trang, tóm tắt nhanh tình hình shop hôm nay: doanh thu, đơn cần đóng gói, hàng sắp hết, ví khách âm, đợt order chưa nhận đủ. Chỉ ra 2-3 việc cần ưu tiên xử lý ngay.',
                },
                {
                    label: '📈 Xu hướng doanh thu 7 ngày',
                    prompt: 'Phân tích dữ liệu doanh thu 7 ngày: ngày nào cao nhất, thấp nhất, xu hướng tăng hay giảm, mức biến động bao nhiêu %. Dự đoán doanh thu hôm nay có đang tốt hơn trung bình tuần không và đề xuất hành động.',
                },
                {
                    label: '⚠️ Cảnh báo cần xử lý',
                    prompt: 'Soát các con số rủi ro: SP sắp hết hàng (stock < 5), ví khách âm (balance < 0), đợt Sổ Order chưa nhận đủ. Cái nào nghiêm trọng nhất cần làm trước? Gợi ý bước xử lý cụ thể cho từng cái.',
                },
                {
                    label: '🧾 Đơn cần đóng gói',
                    prompt: 'Có bao nhiêu PBH đã done nhưng chưa giao (cần đóng gói)? Đối chiếu với 10 PBH gần nhất trong bảng, chỉ ra đơn nào đang chờ đóng gói và nhắc nhân viên ưu tiên giao trong ngày.',
                },
                {
                    label: '🍩 PBH theo trạng thái',
                    prompt: 'Phân tích biểu đồ PBH theo trạng thái 30 ngày: tỉ lệ done/draft/cancel là bao nhiêu? Tỉ lệ hủy (cancel) hoặc nháp (draft) có cao bất thường không? Nếu cao thì cảnh báo và gợi ý nguyên nhân.',
                },
                {
                    label: '🔍 Soát 10 PBH gần nhất',
                    prompt: 'Xem bảng 10 PBH gần nhất: có đơn nào số tiền bất thường (quá lớn/bằng 0), trạng thái lạ, hoặc thiếu tên khách không? Liệt kê các đơn cần kiểm tra lại.',
                },
            ],
            note: "Trang dashboard là IIFE đóng kín: response API /api/web2/dashboard-kpi nằm trong biến closure `d` (load()), KHÔNG expose ra window.* — đã verify toàn file, không có global custom nào giữ dataset. Vì vậy KHÔNG có accessor kiểu window.XxxCore.getAll(). Tuy nhiên 2 biểu đồ vẽ trên <canvas> (chartRevenue 7-ngày, chartState PBH-30-ngày) nên dữ liệu chuỗi thời gian + phân bố trạng thái HOÀN TOÀN VÔ HÌNH với main.innerText — widget chỉ-DOM sẽ bỏ sót. Hai accessor đầu dùng Chart.getChart('chartRevenue'|'chartState') (API chuẩn Chart.js v4, lib đã load qua <script> dòng 12, guard bằng window.Chart?.get",
        },
        {
            match: '/web2/overview/',
            model: { provider: 'groq', model: 'llama-3.1-8b-instant' },
            accessors: [],
            suggestions: [
                {
                    label: '🗺️ Tóm tắt kiến trúc',
                    prompt: 'Dựa vào nội dung trang Tổng quan đang hiển thị, tóm tắt kiến trúc hệ thống Web 2.0: các trang chính, luồng dữ liệu, và cách dữ liệu chảy giữa các trang (native-orders → reconcile, so-order → tồn kho, ví → balance-history). Trả lời ngắn gọn dễ hiểu cho nhân viên không rành kỹ thuật.',
                },
                {
                    label: '🔗 Trang nào liên kết nhau',
                    prompt: "Đọc phần 'Luồng dữ liệu chính' và 'Bản đồ data flow' trên trang. Liệt kê từng cặp trang có liên kết dữ liệu với nhau và giải thích dữ liệu đi từ trang nào sang trang nào, để biết khi sửa 1 chỗ thì ảnh hưởng tới đâu.",
                },
                {
                    label: '🧪 Kết quả kiểm thử',
                    prompt: "Đọc phần 'Kết quả kiểm thử liên kết dữ liệu giữa các trang' và mục bug đã sửa. Tóm tắt: pipeline nào đã test, bug gì đã được tìm và sửa, còn rủi ro liên kết dữ liệu nào cần để ý.",
                },
                {
                    label: '🗂️ Kho dữ liệu dùng chung',
                    prompt: "Dựa vào phần 'Kho dữ liệu dùng chung' đang hiển thị, liệt kê các kho dữ liệu 1 nguồn (sản phẩm, khách, NCC, ví...) và giải thích mỗi kho phục vụ trang nào, để tránh tạo trùng dữ liệu.",
                },
                {
                    label: '📐 Quy ước khi thêm trang',
                    prompt: "Đọc phần 'Quy ước Web 2.0 — ĐỌC TRƯỚC KHI CODE'. Tóm tắt thành checklist ngắn các quy ước bắt buộc khi thêm trang/route/bảng mới của Web 2.0 (đặt tên DB, route, realtime SSE, pool).",
                },
                {
                    label: '🚀 Gợi ý nên làm tiếp',
                    prompt: "Đọc phần 'Gợi ý phát triển' trên trang. Tóm tắt các hạng mục đề xuất phát triển tiếp và xếp theo mức độ ưu tiên dễ làm trước cho 1 shop thời trang nữ.",
                },
            ],
            note: 'Trang web2/overview/index.html là trang TÀI LIỆU/KIẾN TRÚC TĨNH — toàn bộ nội dung (test report, danh sách audit trang, pipelines, chi tiết 13 trang, bản đồ data flow, bảng DB/router, quy ước, kho dữ liệu, gợi ý phát triển) đều là HTML hardcode. JS duy nhất chỉ render thẻ đăng nhập (window.Web2Auth.getStored() — danh tính user, KHÔNG phải dataset nghiệp vụ). KHÔNG có global window nào giữ FULL dataset (không có Web2ProductsCore/NativeOrders/CustomersApi/getAll/.state/_cache), không fetch, không SSE, không bảng động. Vì vậy dataAccessors=[] — widget chỉ nên đọc DOM hiển thị (vốn đã đầy đủ ~text',
        },
        {
            match: '/web2/report-delivery/',
            model: { provider: 'groq', model: 'openai/gpt-oss-120b' },
            accessors: [],
            suggestions: [
                {
                    label: '🚚 Shipper nào ôm nhiều đơn nhất',
                    prompt: "Dựa vào bảng 'Phân chia theo shipper / nhóm' đang hiển thị, xếp hạng các shipper/nhóm theo Số đơn từ cao xuống thấp. Nêu rõ ai đang ôm nhiều đơn nhất, ai ít nhất, và chênh lệch giữa người cao nhất với thấp nhất có bị mất cân đối không.",
                },
                {
                    label: '📦 Tỷ lệ giao thành công',
                    prompt: 'Với mỗi shipper/nhóm trong bảng, tính tỷ lệ Đã giao / Số đơn (%) và tỷ lệ Huỷ / Số đơn (%). Chỉ ra shipper nào có tỷ lệ giao thành công thấp hoặc tỷ lệ huỷ cao bất thường cần lưu ý.',
                },
                {
                    label: '💰 Đối soát COD theo shipper',
                    prompt: 'Dựa trên bảng chia đơn, liệt kê tổng tiền COD mỗi shipper/nhóm đang cầm và tổng COD toàn bộ. Sắp xếp giảm dần theo COD để biết cần thu hồi tiền COD từ ai nhiều nhất hôm nay.',
                },
                {
                    label: '🏷️ So sánh nhà vận chuyển',
                    prompt: "Dựa vào bảng 'Phân chia theo nhà vận chuyển', so sánh các nhà vận chuyển theo Số đơn, Tổng tiền và COD. Nhà vận chuyển nào đang xử lý phần lớn đơn, nhà nào ít? Gợi ý có nên cân đối lại lượng đơn giữa các nhà vận chuyển không.",
                },
                {
                    label: '📊 Tóm tắt báo cáo ngày',
                    prompt: 'Tóm tắt nhanh báo cáo giao hàng hiện tại: tổng Số đơn, Tổng tiền, COD, số Đã giao và số Huỷ. Cho biết tỷ lệ giao xong trên tổng đơn và đánh giá tình hình giao hàng hôm nay tốt hay cần đẩy nhanh.',
                },
                {
                    label: '⚠️ Đơn còn tồn chưa giao',
                    prompt: 'Dựa trên KPI (Số đơn vs Đã giao) và bảng chia theo shipper, tính số đơn còn tồn chưa giao của từng shipper/nhóm (Số đơn trừ Đã giao, trừ Huỷ). Chỉ ra shipper nào đang tồn nhiều đơn chưa giao nhất cần nhắc đẩy hàng.',
                },
            ],
            note: "KHÔNG có global nào trên window giữ dataset của trang này. Toàn bộ logic nằm trong 1 IIFE inline `(function(){'use strict';...})()` có 'use strict' trong index.html (trang không có file JS riêng *-state.js/*-app.js/*-core.js/*-api.js). Dữ liệu fetch từ `GET {WORKER}/api/pbh-reports/delivery?from&to` trả `{success, totals, byGroup, byCarrier}` và được gán vào biến cục bộ `data` bên trong closure — KHÔNG bao giờ expose ra window (đã grep verify: 0 dòng `window.<x> =`). Vì vậy dataAccessors=[].\\n\\nTIN TỐT cho widget: DOM context của trang này ĐẦY ĐỦ và đủ dùng — đây là báo cáo TỔNG HỢP đã group-b",
        },
        {
            match: '/web2/report-revenue/',
            model: { provider: 'groq', model: 'openai/gpt-oss-120b' },
            accessors: [],
            suggestions: [
                {
                    label: '📉 Ngày doanh thu thấp',
                    prompt: 'Nhìn biểu đồ doanh thu theo ngày đang hiển thị: ngày nào doanh thu thấp bất thường hoặc bằng 0? Liệt kê các ngày đó kèm số tiền, và chỉ ra xu hướng (tăng/giảm) trong khoảng đang xem.',
                },
                {
                    label: '🏆 Top khách chi nhiều',
                    prompt: 'Dựa vào bảng Top khách hàng đang hiển thị, liệt kê 5 khách chi nhiều nhất kèm số đơn và doanh thu. Khách nào số đơn ít nhưng doanh thu cao (giá trị đơn lớn)? Gợi ý nên chăm sóc ai.',
                },
                {
                    label: '📣 Chiến dịch hiệu quả',
                    prompt: 'Dựa vào bảng Theo chiến dịch, chiến dịch nào ra doanh thu cao nhất và thấp nhất? Tính doanh thu trung bình mỗi đơn của từng chiến dịch, chỉ ra chiến dịch nào hiệu quả nhất.',
                },
                {
                    label: '💸 Đơn còn nợ',
                    prompt: "Xem KPI 'Tổng còn nợ' và 'Trả hàng hoàn thành' đang hiển thị. Số tiền còn nợ có lớn so với doanh thu kỳ này không? Nhận xét rủi ro công nợ và tỉ lệ trả hàng.",
                },
                {
                    label: '📦 Đơn theo trạng thái',
                    prompt: 'Dựa vào phần Phân loại đơn theo trạng thái (Nháp / Đã XN / Hoàn thành / Đã hủy): tính tỉ lệ % từng trạng thái. Số đơn nháp hoặc đã hủy có nhiều bất thường không? Cảnh báo nếu tỉ lệ hủy cao.',
                },
                {
                    label: '🌐 Soát khách 360°',
                    prompt: 'Dựa vào bảng Top khách 360° (NW + PBH) và dòng ghi chú số đơn chưa liên kết customer: bao nhiêu đơn web + PBH chưa gắn khách? Khách nào có cả đơn web lẫn PBH (mua nhiều kênh)? Nhắc cần liên kết các đơn còn thiếu.',
                },
            ],
            note: 'Trang là dashboard báo cáo doanh thu PBH READ-ONLY, backed by /api/pbh-reports/* (summary, revenue, top-customers, by-campaign, top-customers-360). KHÔNG có global nào trên window giữ full dataset: mọi response fetch được lưu vào biến cục bộ `const d` trong từng hàm load* (loadSummary/loadRevenueChart/loadTopCustomers/loadByCampaign/loadTopCustomers360) rồi render thẳng ra DOM bằng innerHTML — không gán window.*. Vì vậy dataAccessors=[]. May mắn là DOM-context CHẤT LƯỢNG TỐT cho trang này: tất cả bảng render đầy đủ (không virtual scroll), pageContext() của widget đã bắt được 6 KPI card + 4 bản',
        },
        {
            match: '/web2/order-tags/',
            model: { provider: 'gemini', model: 'gemini-2.5-flash' },
            accessors: [],
            suggestions: [
                {
                    label: '🔍 Trigger chưa dùng',
                    prompt: 'Đây là trang cấu hình thẻ TAG đơn hàng, mỗi thẻ gắn 1 trigger. Dựa trên danh sách thẻ đang hiển thị và phần "Tham chiếu trigger" bên dưới, liệt kê những trigger nào CHƯA được thẻ nào sử dụng (còn trống), kèm mô tả của từng trigger đó, để gợi ý nên tạo thêm thẻ cho trigger nào.',
                },
                {
                    label: '⚖️ Soát mức ưu tiên',
                    prompt: 'Rà soát cột "Ưu tiên" của tất cả các thẻ tag đang hiển thị. Chỉ ra các thẻ bị TRÙNG mức ưu tiên (dễ gây mâu thuẫn khi 1 đơn khớp nhiều trigger), và đề xuất lại thang ưu tiên hợp lý (cách đều, thẻ quan trọng/cảnh báo ưu tiên cao hơn).',
                },
                {
                    label: '🚦 Thẻ đang tắt',
                    prompt: 'Liệt kê các thẻ đang ở trạng thái "Tạm tắt" (is-off). Với mỗi thẻ, nêu tên + trigger + mô tả và giải thích hệ quả khi tắt (đơn khớp trigger đó sẽ KHÔNG được gắn thẻ). Gợi ý có nên bật lại thẻ nào không.',
                },
                {
                    label: '🏷️ Đặt tên & màu nhất quán',
                    prompt: 'Xem tên, màu và icon của các thẻ tag. Đánh giá độ nhất quán: tên có ngắn gọn dễ hiểu cho nhân viên không, màu có phân biệt rõ giữa nhóm cảnh báo (đỏ/cam) và trạng thái bình thường (xanh) không, có 2 thẻ nào màu quá giống nhau dễ nhầm không. Đề xuất chỉnh sửa cụ thể.',
                },
                {
                    label: '📖 Giải thích bộ thẻ',
                    prompt: 'Giải thích ngắn gọn cho nhân viên mới: mỗi thẻ tag hiện có nghĩa là gì, được tự động gắn vào đơn khi nào (dựa trên trigger + mô tả), và khi thấy thẻ đó trên đơn thì nên xử lý ra sao.',
                },
                {
                    label: '🧩 Thiếu thẻ quan trọng',
                    prompt: 'So sánh các trigger có sẵn (phần Tham chiếu trigger) với các thẻ đã tạo. Đề xuất 2-3 thẻ tag NÊN bổ sung cho shop thời trang nữ N2Store (ví dụ: đơn quá hạn gửi, đơn thiếu địa chỉ/SĐT, đơn đã gộp chưa chốt, đơn giá trị cao) nếu chưa có, kèm trigger phù hợp, màu và icon gợi ý.',
                },
            ],
            note: 'Trang web2/order-tags là trang CẤU HÌNH (admin CRUD) cho bảng web2_order_tags — KHÔNG phải trang phân tích dữ liệu lớn, nhưng vẫn có dữ liệu cấu hình có cấu trúc đáng để AI soát (tên/trigger/màu/icon/ưu tiên/trạng thái bật-tắt của từng thẻ). KHÔNG có global nào trên window giữ dataset: toàn bộ dữ liệu nằm trong biến closure-private `STATE` (STATE.records = danh sách thẻ, STATE.triggers = registry trigger) bên trong IIFE của js/order-tags-app.js — không expose ra window, không có accessor (đã đọc & verify toàn file + grep HTML; window.Web2OrderTagPill chỉ là renderer pill, không chứa data). Vì ',
        },
        {
            match: '/web2/cham-cong/',
            model: { provider: 'groq', model: 'openai/gpt-oss-120b' },
            accessors: [
                {
                    expr: 'window.ChamCong?.state',
                    desc: 'Toàn bộ state trang chấm công cho THÁNG đang xem (window.ChamCong.state). Chứa danh sách NV máy + bản ghi chấm công đầy đủ + ghi chú/nghỉ phép/payroll điều chỉnh + trạng thái máy + khoá kỳ. Giàu hơn DOM rất nhiều: bảng công chỉ vẽ chấm tròn (không có số giờ/số tiền), dữ liệu thật nằm hết ở đây.',
                    shape: "{ monthKey:'YYYY-MM', tab:'timesheet|payroll|employees', deviceUsers:[{ device_user_id, employee_id, display_name, name, daily_rate, work_start:'08:00', work_end:'20:00', late_penalty_per_min, ot_multiplier, salary_type:'daily|monthly', grace_minutes, active }], employees:[{ id, username, displayName }], recordsByUserDate:{ [device_user_id]: { [dateKey:'YYYY-MM-DD']: [{ id, device_user_id, date_key, check_time, type:0|1, source }] } }, dayNotes:{ '<uid>_<dateKey>': note }, fulldaySet:Set('<empId>_<dateKey>'), holidaySet:Set('dateKey'), payrollById:{ '<uid>_<monthKey>': { thuong_items:[{label,amount}], giam_tru_items, allowances, da_tra_items, salary_days_override, ot_hours_override, giam_tru_late_override, ghi_chu } }, sync:{ connected, last_sync_time, last_error }, lock:{ locked_by, locked_at, snapshot:{ rows:[...], total } }|null }",
                },
                {
                    expr: 'window.ChamCongSalary',
                    desc: 'Hàm tính lương THUẦN (no DOM/network) để suy ra giờ công / đi muộn / OT / lương tháng từ recordsByUserDate. Dùng calcMonth(monthKey, recordsByDate, cfg, payrollRow, fulldaySet, holidaySet) → { workedDays, luongChinh, lamThem(OT), giamTru, lateDays:[{dateKey,minutes,amount}], otDays:[{dateKey,minutes,pay}], tongLuong, conCanTra }. cfg lấy từ deviceUser: { dailyRate, workStart, workEnd, latePenaltyPerMin, otMultiplier, salaryType, graceMinutes }.',
                    shape: '{ calcMonth(fn), processDay(fn), calcDay(fn), dayStatus(fn), daysOfMonth(fn), hmToMinutes(fn), STATUS_LABEL:{ontime,lateearly,missing,absent}, fmtVnd(fn) }',
                },
            ],
            suggestions: [
                {
                    label: '⏰ Đi muộn nhiều nhất',
                    prompt: 'Dựa trên window.ChamCong.state (recordsByUserDate + deviceUsers cfg), liệt kê nhân viên đi muộn/về sớm nhiều nhất tháng này: tên NV, số ngày muộn, tổng phút muộn, tổng tiền phạt. Dùng ChamCongSalary.calcMonth để lấy lateDays. Sắp giảm dần.',
                },
                {
                    label: '🚪 Quên bấm ra / chấm thiếu',
                    prompt: 'Quét recordsByUserDate trong window.ChamCong.state, tìm các ngày nhân viên CHỈ có 1 lượt chấm (quên bấm vào hoặc ra — status incomplete), theo từng NV và ngày cụ thể. Đây là ngày cần admin chỉnh tay để không mất công.',
                },
                {
                    label: '✗ Vắng không phép',
                    prompt: 'Với mỗi NV đang hiển thị (employee_id hoặc PIN thủ công, active), liệt kê các ngày làm việc trong tháng KHÔNG có lượt chấm nào và KHÔNG nằm trong fulldaySet/holidaySet (vắng không phép). Loại Chủ nhật nếu shop nghỉ CN. Gom theo NV + tổng số ngày vắng.',
                },
                {
                    label: '💰 Soát bảng lương tháng',
                    prompt: 'Dùng ChamCongSalary.calcMonth cho từng deviceUser hiển thị, dựng bảng lương tháng này: tên, số công, lương chính, OT, thưởng, giảm trừ, tổng lương, còn phải trả. Tính tổng quỹ lương + tổng còn phải trả. Chỉ rõ NV nào còn nợ lương lớn nhất.',
                },
                {
                    label: '⚠ Gán trùng PIN / lỗi cấu hình',
                    prompt: 'Kiểm tra deviceUsers trong window.ChamCong.state: (1) employee_id nào bị gán cho NHIỀU PIN máy (lương tính trùng), (2) NV lương tháng (salary_type monthly) mà 0 ngày công, (3) NV thiếu daily_rate (=0) hoặc thiếu giờ ca. Liệt kê từng lỗi kèm tên NV và PIN.',
                },
                {
                    label: '📊 Tổng quan công tháng',
                    prompt: 'Tóm tắt tình hình chấm công tháng window.ChamCong.state.monthKey: tổng số NV, tổng ngày công đã chấm, số NV đi đủ công, số ca đi muộn, số ca quên bấm, số ngày nghỉ phép. Nêu 3 điểm bất thường cần admin xử lý.',
                },
            ],
            note: 'Trang admin-only quản lý chấm công máy DG-600 + bảng lương (3 tab: Bảng công / Bảng lương / Nhân viên). Widget AI RẤT hữu ích ở đây để dò bất thường chấm công và soát lương — DOM nghèo (bảng công chỉ vẽ chấm tròn màu, KHÔNG có số giờ/tiền; bảng lương chỉ render khi ở tab đó). Nguồn dữ liệu ĐẦY ĐỦ là global window.ChamCong.state (deviceUsers + recordsByUserDate + payrollById + dayNotes + fulldaySet/holidaySet + lock), CHỈ cho THÁNG đang xem (state.monthKey) — không phải toàn lịch sử. Payroll KHÔNG lưu thẳng trong state mà được TÍNH; widget nên gọi window.ChamCongSalary.calcMonth(monthKey, recor',
        },
        {
            match: '/web2/chi-tieu/',
            model: { provider: 'groq', model: 'openai/gpt-oss-120b' },
            accessors: [
                {
                    expr: 'window.ChiTieu?.state?.vouchers',
                    desc: 'Mảng phiếu thu/chi đang hiển thị (trang hiện tại, mặc định 50 phiếu/trang theo filter). Đây là dữ liệu chi tiết dòng tiền — đầy đủ field hơn bảng DOM (có id, fund_type, category, source_code, status, amount số nguyên).',
                    shape: "[{ id, code, voucher_time(ISO TIMESTAMPTZ), type:'receipt'|'payment_cn'|'payment_kd', fund_type:'cash'|'bank'|'ewallet', category, source_code, person_name, collector, amount(number), note, status:'paid'|'cancelled', image_id }]",
                },
                {
                    expr: 'window.ChiTieu?.state?.summary',
                    desc: 'Dải số dư kỳ hiện tại do server tính: tồn đầu kỳ, tổng thu, chi cá nhân, chi kinh doanh, tồn cuối kỳ.',
                    shape: '{ opening:number, receipts:number, paymentsCN:number, paymentsKD:number, closing:number }',
                },
                {
                    expr: 'window.ChiTieu?.state?.filter',
                    desc: 'Bộ lọc đang áp dụng — quan trọng để AI biết phạm vi dữ liệu (khoảng ngày, loại, quỹ, trạng thái, trang).',
                    shape: "{ start:'YYYY-MM-DD', end:'YYYY-MM-DD', type, fund, status:'paid'|'cancelled'|'', q, page:number, limit:number }",
                },
                {
                    expr: 'window.ChiTieu?.state?.meta?.total',
                    desc: 'Tổng số phiếu khớp filter (toàn bộ, không chỉ trang hiện tại) — để AI biết còn bao nhiêu phiếu chưa load.',
                    shape: 'number',
                },
                {
                    expr: 'window.ChiTieu?.state?.categories',
                    desc: 'Danh mục thu/chi đã khai báo, gom theo loại phiếu.',
                    shape: '{ receipt:[{id,name}], payment_cn:[{id,name}], payment_kd:[{id,name}] }',
                },
                {
                    expr: 'window.ChiTieu?.state?.sources',
                    desc: 'Danh sách nguồn tiền (gắn vào phiếu thu / chi kinh doanh).',
                    shape: '[{ code, name, is_default }]',
                },
            ],
            suggestions: [
                {
                    label: '📊 Tổng quan dòng tiền',
                    prompt: 'Dựa vào window.ChiTieu.state.summary và state.filter, tóm tắt dòng tiền kỳ này: tồn đầu kỳ, tổng thu, chi cá nhân, chi kinh doanh, tồn cuối kỳ. Cho biết kỳ này dương hay âm, và đâu là khoản chiếm tỉ trọng lớn nhất.',
                },
                {
                    label: '💸 Khoản chi lớn nhất',
                    prompt: "Từ window.ChiTieu.state.vouchers, lọc các phiếu type='payment_cn' và 'payment_kd' status='paid', sắp xếp giảm dần theo amount. Liệt kê 10 khoản chi lớn nhất kèm danh mục, đối tượng, ghi chú và nhận xét khoản nào bất thường.",
                },
                {
                    label: '🏷️ Chi theo danh mục',
                    prompt: 'Từ window.ChiTieu.state.vouchers, gom tổng amount theo category cho từng loại (thu / chi cá nhân / chi kinh doanh), tính % mỗi danh mục. Chỉ ra danh mục đang ngốn nhiều tiền nhất và gợi ý nên kiểm soát khoản nào.',
                },
                {
                    label: '🧾 Phiếu thiếu thông tin',
                    prompt: 'Quét window.ChiTieu.state.vouchers tìm phiếu chưa đầy đủ: thiếu category, thiếu person_name lẫn collector, thiếu ghi chú, hoặc thiếu ảnh hoá đơn (image_id rỗng) với khoản chi lớn. Liệt kê mã phiếu cần bổ sung để sổ quỹ minh bạch.',
                },
                {
                    label: '🏦 Cân đối theo quỹ',
                    prompt: 'Từ window.ChiTieu.state.vouchers, tính thu - chi ròng theo fund_type (tiền mặt / ngân hàng / ví điện tử). Cho biết quỹ nào đang âm hoặc lệch nhiều, và cảnh báo nếu chi vượt thu ở một quỹ.',
                },
                {
                    label: '❌ Soát phiếu đã huỷ',
                    prompt: "Lọc window.ChiTieu.state.vouchers có status='cancelled'. Thống kê số lượng và tổng tiền bị huỷ, nhóm theo nhân viên xử lý (collector) và lý do/ghi chú. Chỉ ra nếu có nhân viên huỷ phiếu nhiều bất thường.",
                },
            ],
            note: 'Trang Sổ quỹ Web 2.0 (admin-only) — widget NÊN ưu tiên đọc window.ChiTieu.state thay vì DOM. State giữ dữ liệu đầy đủ field hơn bảng hiển thị: state.vouchers (mảng phiếu trang hiện tại, mỗi phiếu có amount số nguyên, fund_type/category/source_code/status/image_id mà DOM chỉ render rút gọn), state.summary (số dư đầu/cuối kỳ + tổng thu/chi do server tính), state.filter (phạm vi ngày/loại/quỹ đang lọc), state.meta.total (tổng phiếu khớp filter), state.categories và state.sources (danh mục + nguồn tiền). LƯU Ý GIỚI HẠN: list phân trang limit=50/trang nên state.vouchers chỉ là TRANG HIỆN TẠI — nếu ',
        },
        {
            match: '/web2/audit-log/',
            model: { provider: 'gemini', model: 'gemini-2.5-flash' },
            accessors: [],
            suggestions: [
                {
                    label: '🕵️ Bất thường',
                    prompt: 'Dựa vào bảng lịch sử thao tác đang hiển thị, chỉ ra các thao tác có dấu hiệu bất thường hoặc rủi ro: sửa/xóa nhiều lần liên tiếp trên cùng 1 ID, chỉnh ví (Ví/Ví NCC), xóa PBH, hoặc thay đổi giá trị lớn. Nêu rõ dòng nào (thời gian + user + entity + ID) và vì sao đáng chú ý.',
                },
                {
                    label: '👤 Ai làm nhiều nhất',
                    prompt: 'Tổng hợp theo cột User trong bảng: mỗi người đã thực hiện bao nhiêu thao tác và chủ yếu trên loại entity nào (Sản phẩm, PBH, Ví, Đối soát...). Liệt kê xếp hạng từ nhiều đến ít.',
                },
                {
                    label: '📋 Tóm tắt hoạt động',
                    prompt: 'Tóm tắt ngắn gọn các thao tác đang hiển thị: tổng số thao tác, phân bố theo Entity, theo Action (tạo/sửa/xóa), và khoảng thời gian. Nêu 3-5 điểm đáng chú ý nhất.',
                },
                {
                    label: '🔍 Soi 1 mã/ID',
                    prompt: 'Trong bảng lịch sử, gom tất cả thao tác liên quan đến cùng một ID (ví dụ một mã SP hoặc số PBH), sắp theo thời gian, và mô tả ID đó đã bị thay đổi gì qua từng bước (đọc cột Changes).',
                },
                {
                    label: '✏️ Thao tác xóa/sửa',
                    prompt: 'Lọc và liệt kê riêng các thao tác mang tính xóa hoặc sửa quan trọng (delete, update giá/số lượng/ví) trong bảng đang hiển thị, kèm ai làm và lúc nào. Cảnh báo những thao tác cần kiểm tra lại.',
                },
                {
                    label: '💰 Đụng tới tiền/ví',
                    prompt: 'Lọc các dòng entity là Ví, Ví NCC, Giao dịch CK, Tín hiệu CK, Hoàn NCC trong bảng. Với mỗi dòng nêu user, thời gian và tóm tắt thay đổi số tiền (đọc cột Changes) để rà soát chỉnh ví có hợp lý không.',
                },
            ],
            note: "KHÔNG có global dataset accessor cho trang này — dataAccessors=[]. Trang `web2/audit-log/index.html` chỉ gọi `window.Web2AuditLog.mount('#auditMount', { limit: 200 })`; toàn bộ logic nằm trong IIFE `web2/shared/web2-audit-log.js`. Module fetch dữ liệu qua `fetch(WORKER + '/api/web2/audit-log/list?...')`, map thẳng thành HTML rồi render vào `<tbody class=\"w2al-body\">`. Mảng `items` (line 260) là biến local trong hàm `load()`, dùng xong vứt — KHÔNG lưu lên window. Global duy nhất `window.Web2AuditLog` chỉ chứa method (mount/reload/openRecord) + biến nội bộ `_last = { host, opts }` (KHÔNG có data",
        },
        {
            match: '/web2/jt-tracking/',
            model: { provider: 'gemini', model: 'gemini-2.5-flash' },
            accessors: [
                {
                    expr: 'window.JtTrackingState?.state?.list',
                    desc: 'Mảng FULL các vận đơn J&T đang hiển thị (đã lọc theo status/search hiện tại). Nguồn chuẩn thay cho việc đọc DOM bảng — có sẵn billcode 12 số, status code, thời gian epoch, ghi chú, trạng thái duyệt. Là object reference live: load() gán lại state.list nhưng .state vẫn cùng tham chiếu nên luôn đọc được bản mới nhất.',
                    shape: "Array<{ billcode: string(12 số), status: 'delivered'|'delivering'|'transit'|'returned'|'problem'|'pending'|'not_found', latest_event: string, src_message: string (tin nhắn nhóm Zalo chứa mã + tên + SĐT khách), src_at: number(epoch ms), latest_at: number, latest_at_text: string, source: 'zalo'|'manual', note: string, approved_at: number|null, zalo_conv_id: string|null, events?: Array<{time,date,desc}> }>",
                },
                {
                    expr: 'window.JtTrackingState?.state?.kpi',
                    desc: 'Object đếm số vận đơn theo từng trạng thái (khớp các thẻ KPI trên đầu trang) — dùng để AI tóm tắt nhanh tỉ lệ giao/hoàn/vấn đề mà không cần đếm lại từ list.',
                    shape: '{ total?: number, delivering?: number, transit?: number, returned?: number, problem?: number, delivered?: number, pending?: number, not_found?: number, approved?: number }',
                },
                {
                    expr: 'window.JtTrackingState?.state?.status',
                    desc: "Bộ lọc trạng thái đang áp dụng ('all' hoặc 1 status code) — cho AI biết list đang xem là toàn bộ hay đã lọc.",
                    shape: 'string',
                },
                {
                    expr: 'window.JtTrackingState?.state?.search',
                    desc: 'Từ khoá tìm kiếm đang áp dụng (rỗng nếu không lọc).',
                    shape: 'string',
                },
                {
                    expr: 'Array.from(window.JtTrackingState?.taggedPhones || [])',
                    desc: "Tập SĐT khách đã gắn thẻ 'XỬ LÝ BC' (bồi thường/khiếu nại) — đồng bộ đa máy. Dùng để AI biết khách nào đã/chưa được xử lý sự cố.",
                    shape: 'string[]',
                },
            ],
            suggestions: [
                {
                    label: '🚨 Đơn có vấn đề',
                    prompt: "Dựa trên window.JtTrackingState.state.list, liệt kê tất cả vận đơn có status='problem' hoặc 'returned'. Với mỗi đơn ghi rõ mã 12 số, sự kiện mới nhất (latest_event), tên + SĐT khách (tách từ src_message), và đề xuất hành động: liên hệ khách, gắn thẻ xử lý BC, hay giao lại.",
                },
                {
                    label: '📦 Đơn kẹt chưa cập nhật',
                    prompt: "Quét state.list tìm các vận đơn status='transit' hoặc 'delivering' nhưng src_at đã quá 3 ngày trước (so với hiện tại). Đây là đơn nghi bị kẹt/chậm. Liệt kê mã + tên khách + thời gian gần nhất + số ngày đã trôi, sắp xếp lâu nhất lên đầu.",
                },
                {
                    label: '🔁 Hoàn chưa gắn thẻ',
                    prompt: "Tìm trong state.list các đơn status='returned' mà SĐT khách CHƯA có trong danh sách đã gắn thẻ (Array.from(window.JtTrackingState.taggedPhones)). Đây là đơn hoàn cần xử lý bồi thường nhưng chưa được đánh dấu. Liệt kê mã + tên + SĐT để nhân viên xử lý.",
                },
                {
                    label: '❓ Đơn chưa tra được',
                    prompt: "Liệt kê các vận đơn có status='pending' (chưa tra) hoặc 'not_found' (J&T không thấy) trong state.list. Với not_found, cảnh báo khả năng sai mã hoặc gửi nhầm SĐT. Ghi rõ mã + nguồn (source: zalo/nhập tay) + tên khách.",
                },
                {
                    label: '📊 Tổng quan giao hàng',
                    prompt: 'Dùng window.JtTrackingState.state.kpi tóm tắt tình hình giao hàng hôm nay: tổng số đơn, tỉ lệ % đã giao, đang giao, hoàn, vấn đề. Nêu cảnh báo nếu tỉ lệ hoàn (returned) + vấn đề (problem) vượt 10% tổng đơn, và gợi ý nhân viên nên ưu tiên xử lý nhóm nào trước.',
                },
                {
                    label: '📞 Khách cần liên hệ gấp',
                    prompt: "Từ state.list, lọc các đơn status='problem'/'returned'/'not_found' rồi tách tên + SĐT khách từ src_message. Tạo danh sách gọi điện ưu tiên: mỗi dòng gồm tên, SĐT, mã đơn, lý do cần gọi (giao thất bại/hoàn/không tìm thấy) và 1 câu mở đầu gợi ý để nhắn Zalo cho khách.",
                },
            ],
            note: 'Trang có global đầy đủ: nguồn chuẩn là window.JtTrackingState.state.list (mảng FULL vận đơn đang lọc) + .kpi (đếm theo trạng thái) + .taggedPhones (Set SĐT đã gắn thẻ xử lý BC). Đây là IIFE expose qua window.JtTrackingState — đã verify trong jt-tracking-state.js (dòng 109-123) và app.js gán S.state.list = j.data (object reference giữ nguyên nên đọc luôn ra bản mới). Widget nên ƯU TIÊN đọc state.list thay vì DOM vì: (1) fields đã structured (status code chuẩn delivered/delivering/transit/returned/problem/pending/not_found thay vì nhãn tiếng Việt trong DOM), (2) có epoch src_at/latest_at/approve',
        },
        {
            match: '/web2/notifications/',
            model: { provider: 'gemini', model: 'gemini-2.5-flash' },
            accessors: [],
            suggestions: [
                {
                    label: '🔴 Cảnh báo nguy cấp',
                    prompt: "Lọc các thông báo mức độ 'danger' (ví KH âm, hàng đã hết sạch) đang hiển thị. Liệt kê từng cái kèm đối tượng liên quan và xếp theo độ ưu tiên cần xử lý ngay.",
                },
                {
                    label: '📦 Hàng sắp hết / hết',
                    prompt: "Quét các thông báo loại 'Hàng sắp hết' và 'hết hàng' trong danh sách. Liệt kê mã SP, tên, số tồn còn lại; tách rõ SP đã hết (0) cần nhập gấp với SP sắp hết.",
                },
                {
                    label: '🧾 PBH quá hạn xác nhận',
                    prompt: 'Tìm các thông báo PBH (hóa đơn) chờ xác nhận quá 24h. Liệt kê số PBH, thời điểm cảnh báo, và nhắc cần vào xác nhận hay hủy.',
                },
                {
                    label: '💰 Ví khách âm',
                    prompt: 'Liệt kê các cảnh báo ví khách hàng đang âm: SĐT khách và số tiền âm. Sắp xếp theo số tiền âm nhiều nhất để ưu tiên thu hồi.',
                },
                {
                    label: '↩️ Thu về tồn lâu',
                    prompt: "Tìm thông báo 'Thu về chờ duyệt > 20 ngày'. Liệt kê mã phiếu, tên khách, và đề xuất nhân viên cần duyệt/đóng phiếu nào trước.",
                },
                {
                    label: '📊 Tổng quan chưa đọc',
                    prompt: 'Đếm và phân nhóm các thông báo CHƯA ĐỌC theo loại (PBH, hàng tồn, ví âm, thu về) và mức độ. Cho biết nhóm nào nhiều nhất và việc nào nên xử lý đầu tiên hôm nay.',
                },
            ],
            note: "Trang notifications/index.html là 1 IIFE khép kín, KHÔNG expose global nào trên window giữ dataset. Dữ liệu thông báo nằm trong biến cục bộ `items` bên trong closure hàm `load()` (đọc từ fetch API rồi render thẳng ra DOM), không có accessor đồng bộ → dataAccessors=[]. DOM-context HIỆN TẠI khá ĐỦ cho AI: mỗi `.noti-row` render đầy đủ title + body + meta (thời gian · severity: info/warning/danger) và class read/unread, nên widget đọc DOM vẫn nắm được nội dung từng cảnh báo. Hạn chế: list cap limit=100 và filter 'Chưa đọc' lọc client-side. Nếu muốn dữ liệu ĐẦY ĐỦ + cấu trúc (type, entity_type, en",
        },
        {
            match: '/web2/payment-confirm/',
            model: { provider: 'groq', model: 'openai/gpt-oss-120b' },
            accessors: [],
            suggestions: [
                {
                    label: '💸 Lọc tín hiệu CK chờ',
                    prompt: 'Từ danh sách tín hiệu "KH báo đã CK" đang hiển thị, liệt kê các tín hiệu trạng thái CHỜ XỬ LÝ (pending): tên KH, nội dung tin nhắn báo CK, thời gian, SĐT. Sắp theo thời gian cũ nhất trước để xử lý kịp.',
                },
                {
                    label: '⚠️ CK chưa khớp đơn',
                    prompt: 'Rà các tín hiệu CK đang hiển thị xem cái nào CHƯA gán/khớp đơn (hiện cảnh báo "Chưa khớp đơn"). Liệt kê tên KH + SĐT + nội dung tin để nhân viên gán đơn thủ công.',
                },
                {
                    label: '🔎 Tin nhắn nghi đã CK',
                    prompt: 'Trong tab "Tin nhắn chưa đọc", lọc các hội thoại có dấu hiệu khách báo đã chuyển khoản (gắn nhãn "CÓ THỂ ĐÃ CK" hoặc nội dung kiểu "ck xong", "đã ck"). Liệt kê KH + snippet + thời gian để ưu tiên xác nhận.',
                },
                {
                    label: '✅ Đối chiếu đã xác nhận',
                    prompt: 'Thống kê nhanh số tín hiệu CK đã XÁC NHẬN vs CHỜ vs BỎ QUA đang hiển thị, và ai là người xác nhận (nếu có). Chỉ ra tín hiệu nào đã xác nhận nhưng vẫn chưa khớp mã đơn.',
                },
                {
                    label: '💬 Soạn lời nhắc KH',
                    prompt: 'Với khách báo đã CK nhưng tin nhắn không rõ số tiền/nội dung CK, gợi ý câu trả lời lịch sự nhờ khách gửi ảnh biên lai hoặc xác nhận lại số tiền + nội dung chuyển khoản.',
                },
                {
                    label: '🧮 Soát giá trị đơn khớp',
                    prompt: 'Với các tín hiệu CK đã gắn đơn (hiển thị mã đơn + tổng tiền), kiểm tra xem nội dung khách báo có khớp giá trị đơn không, nêu trường hợp đáng ngờ (giá trị lệch, thiếu thông tin).',
                },
            ],
            note: 'QUAN TRỌNG: `web2/payment-confirm/index.html` là TRANG ĐÃ RETIRE (2026-06-06) — chỉ là stub `<meta http-equiv=refresh>` + `location.replace(\'../ck-dashboard/index.html\')`, KHÔNG load `payment-confirm-app.js`. Người dùng vào path này sẽ bị chuyển ngay sang ck-dashboard. Vì vậy widget trên path `web2/payment-confirm` gần như chỉ flash 1 nhịp rồi mất; nội dung thật (2 tab \\"KH báo đã CK\\" + \\"Tin nhắn chưa đọc\\") nằm ở ck-dashboard — nên áp các suggestion/enrich tương tự cho match `web2/ck-dashboard`.\\n\\nKHÔNG có global dataset trên window. File `payment-confirm-app.js` (legacy, không còn chạy) b',
        },
        {
            match: '/web2/users/',
            model: { provider: 'groq', model: 'llama-3.1-8b-instant' },
            accessors: [],
            suggestions: [
                {
                    label: '🔑 User chưa đặt mật khẩu',
                    prompt: 'Trong bảng người dùng đang hiển thị, liệt kê các tài khoản có cột Mật khẩu là "Đặt MK" (mật khẩu cũ chỉ lưu mã hoá, chưa đặt lại) — đây là các NV nên đặt mật khẩu mới để admin đọc/giao được. Liệt kê theo username + họ tên.',
                },
                {
                    label: '😴 Tài khoản lâu không đăng nhập',
                    prompt: 'Dựa vào cột "Đăng nhập gần nhất", chỉ ra các tài khoản chưa đăng nhập bao giờ (—) hoặc đã lâu không đăng nhập. Gợi ý nên vô hiệu hay nhắc NV nào. Sắp xếp từ lâu nhất.',
                },
                {
                    label: '🛡️ Quyền bất thường',
                    prompt: 'Soát vai trò + dấu phân quyền tùy chỉnh (●) trong bảng. Chỉ ra tài khoản nào có vai trò Admin/Quản lý mà có thể thừa quyền, hoặc Nhân viên/Chỉ xem nhưng lại có phân quyền tùy chỉnh đáng chú ý. Cảnh báo rủi ro nếu có quá nhiều Admin.',
                },
                {
                    label: '🚫 User đã vô hiệu nên dọn',
                    prompt: 'Liệt kê các tài khoản đang ở trạng thái "Đã vô hiệu" trong bảng. Đề xuất tài khoản nào nên xoá vĩnh viễn để dọn danh sách, và lưu ý tài khoản nào nên giữ lại.',
                },
                {
                    label: '📇 Thiếu email/SĐT',
                    prompt: 'Rà soát cột Email/SĐT, liệt kê các tài khoản đang để trống (—) thông tin liên hệ. Đây là các NV cần bổ sung email/SĐT để liên lạc và khôi phục tài khoản khi cần.',
                },
                {
                    label: '📊 Thống kê nhân sự',
                    prompt: 'Tổng hợp nhanh: tổng số tài khoản, số đang hoạt động vs đã vô hiệu, và phân bố theo vai trò (Admin / Quản lý / Nhân viên / Chỉ xem). Nêu nhận xét nếu cơ cấu quyền mất cân đối.',
                },
            ],
            note: 'KHÔNG có global window nào giữ full dataset của trang này — đã đọc & verify code. Toàn bộ dữ liệu nằm trong closure IIFE riêng tư (`const STATE = { users, pages, actionLabels, ... }` ở web2/users/js/users-app.js dòng 21), KHÔNG bao giờ gán lên window; không có accessor kiểu getAll()/.all/.state. Module window duy nhất là `window.Web2Auth.getStored()` (chỉ session user hiện tại, KHÔNG phải danh sách user). Vì vậy dataAccessors=[].\n\nHệ quả cho widget: trang render bảng đầy đủ (không ảo hoá) — mọi user (tới limit 200) đều nằm trong DOM `#uTableBody`, nên path đọc DOM hiện tại của widget VẪN lấy đ',
        },
    ];

    // Khớp trang theo pathname — longest-prefix (match dài nhất thắng để /web2/x ưu tiên hơn /web2).
    function matchPage(pathname) {
        const p = String(pathname || (global.location && global.location.pathname) || '');
        let best = null;
        for (const e of PAGES) {
            if (p.indexOf(e.match) >= 0 && (!best || e.match.length > best.match.length)) best = e;
        }
        return best;
    }
    function suggestionsFor(pathname) {
        const e = matchPage(pathname);
        return e && e.suggestions && e.suggestions.length ? e.suggestions : GENERIC;
    }
    function modelFor(pathname) {
        const e = matchPage(pathname);
        return (e && e.model) || DEFAULT_MODEL;
    }
    function accessorsFor(pathname) {
        const e = matchPage(pathname);
        return (e && e.accessors) || [];
    }
    function noteFor(pathname) {
        const e = matchPage(pathname);
        return (e && e.note) || '';
    }

    global.Web2AiPageRegistry = {
        PAGES,
        GENERIC,
        DEFAULT_MODEL,
        matchPage,
        suggestionsFor,
        modelFor,
        accessorsFor,
        noteFor,
    };
})(window);
