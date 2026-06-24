// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Trợ lý AI — THƯ VIỆN MẪU CÂU LỆNH (preset library) dùng chung cho tab Tạo ảnh / Ghép đồ
 * và Vai trò chat.
 *
 * Nguồn (curated, có ghi nguồn — license CC BY 4.0 / community):
 *   • Câu lệnh ảnh: github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts (10k+ prompt,
 *     16 ngôn ngữ) + github.com/PicoTrex/Awesome-Nano-Banana-images (case + prompt thực tế).
 *     Đã CHỌN LỌC + Việt hoá nhóm hợp shop thời trang (sản phẩm, người mẫu, mặc-lên-người,
 *     đổi nền, flat-lay, avatar, poster).
 *   • Vai trò chat: cảm hứng từ pattern kỹ thuật của
 *     github.com/x1xhlol/system-prompts-and-models-of-ai-tools (định nghĩa vai trò rõ ràng,
 *     liệt kê năng lực, quy tắc giọng điệu + định dạng output) — viết riêng cho shop N2Store.
 *
 * API:
 *   window.AiPresets.image            → [{id, cat, title, prompt, needsImage, source}]
 *   window.AiPresets.roles            → [{id, title, desc, system}]
 *   window.AiPresets.DEFAULT_ROLE     → system prompt mặc định cho cuộc chat shop mới
 *   window.AiPresets.pickImage(cb,opts) → mở modal chọn câu lệnh ảnh → cb(prompt, preset)
 *   window.AiPresets.pickRole(cb)       → mở modal chọn vai trò chat → cb(systemPrompt, role)
 */
(function (global) {
    'use strict';

    // ───────────────────────── Câu lệnh tạo ảnh ─────────────────────────
    // needsImage=true → câu lệnh SỬA/GHÉP ảnh tải lên (chỉ chạy tốt với Nano Banana).
    const CATS = [
        { id: 'all', label: 'Tất cả' },
        { id: 'product', label: '🛍️ Ảnh sản phẩm' },
        { id: 'fashion', label: '👗 Thời trang / Người mẫu' },
        { id: 'onmodel', label: '🧥 Mặc lên người (cần ảnh)' },
        { id: 'scene', label: '🖼️ Đổi nền / Phong cảnh (cần ảnh)' },
        { id: 'avatar', label: '👤 Ảnh đại diện (cần ảnh)' },
        { id: 'layout', label: '📐 Flat-lay / Bố cục' },
        { id: 'poster', label: '🎉 Poster / Khuyến mãi' },
    ];

    const IMAGE = [
        // ── Ảnh sản phẩm (text→ảnh, không cần ảnh gốc) ──
        {
            id: 'prod-white',
            cat: 'product',
            title: 'Sản phẩm nền trắng (ảnh chính sàn TMĐT)',
            prompt: 'Ảnh sản phẩm thương mại chuyên nghiệp: [tên sản phẩm] đặt chính giữa trên nền trắng tinh sạch sẽ, ánh sáng studio đều dịu, bóng đổ mềm tự nhiên, độ nét cao, không watermark, phong cách ảnh bìa sản phẩm sàn thương mại điện tử, 8K.',
            needsImage: false,
            source: 'youmind/awesome-nano-banana-pro-prompts',
        },
        {
            id: 'prod-podium',
            cat: 'product',
            title: 'Sản phẩm trên bục đá cẩm thạch sang trọng',
            prompt: '[tên sản phẩm] cao cấp đặt trên bục đá cẩm thạch nhiều tầng, bao quanh bởi hoa tươi và dải lụa mềm mại, ánh sáng điện ảnh dịu, bóng đổ nhẹ, phong cách quảng cáo sang trọng siêu thực, thẩm mỹ tối giản cao cấp, 8K.',
            needsImage: false,
            source: 'youmind (No.94 Rose Gold)',
        },
        {
            id: 'prod-spa',
            cat: 'product',
            title: 'Mỹ phẩm / skincare phong cách spa Nhật',
            prompt: 'Chai/hũ [tên sản phẩm] đặt trên bục đá, xung quanh là nguyên liệu thiên nhiên (lá xanh, bọt kem mịn, lát trái cây), thẩm mỹ spa kiểu Nhật, bố cục sang trọng tối giản, ánh sáng tự nhiên dịu nhẹ, quảng cáo chăm sóc da chân thực cao, 8K.',
            needsImage: false,
            source: 'youmind (No.88 Matcha)',
        },
        {
            id: 'prod-splash',
            cat: 'product',
            title: 'Sản phẩm với hiệu ứng nước/giọt bắn tươi mát',
            prompt: '[tên sản phẩm] thanh lịch, bao quanh bởi các giọt nước lấp lánh và bong bóng trong suốt, nền tối giản sang trọng với tia nắng dịu nhẹ, bục trưng bày bóng bẩy, không khí mùa hè tươi mới, quảng cáo siêu thực, nhiếp ảnh thương mại cao cấp, 8K.',
            needsImage: false,
            source: 'youmind (No.97 Lemon skincare)',
        },
        // ── Thời trang / người mẫu (text→ảnh) ──
        {
            id: 'fashion-studio',
            cat: 'fashion',
            title: 'Người mẫu studio tối giản (lookbook)',
            prompt: 'Ảnh studio toàn thân chính diện của một người mẫu nữ trẻ Đông Á, tóc bob thời thượng, mặc [mô tả trang phục], đứng trước phông nền màu kem trung tính sạch sẽ, ánh sáng studio dịu, tập trung hoàn toàn vào người mẫu và trang phục, phong cách lookbook thời trang cao cấp.',
            needsImage: false,
            source: 'youmind (No.105/109 lookbook)',
        },
        {
            id: 'fashion-store',
            cat: 'fashion',
            title: 'Người mẫu trong cửa hàng tối giản hiện đại',
            prompt: 'Ảnh chân dung thời trang toàn thân của một cô gái trẻ sành điệu đứng tự tin trong cửa hàng quần áo tối giản hiện đại, mặc [mô tả trang phục], phông nền nội thất gỗ ấm áp với giá treo quần áo tông trung tính, ánh sáng dịu, sàn sáng bóng, phong cách thương mại điện tử.',
            needsImage: false,
            source: 'youmind (No.108)',
        },
        {
            id: 'fashion-home',
            cat: 'fashion',
            title: 'Đồ mặc nhà / homewear ngoài trời gần gũi',
            prompt: 'Ảnh chân dung cận cảnh chân thực của một phụ nữ trẻ châu Á da trắng, đứng ngoài trời trong không gian nhà ở (hiên trước/sân vườn), cơ thể hơi nghiêng, đầu quay về máy ảnh, biểu cảm dịu dàng, mặc bộ [đồ mặc nhà / homewear] đồng bộ, ánh sáng tự nhiên ban ngày, phong cách đời thường sang trọng.',
            needsImage: false,
            source: 'youmind (No.104)',
        },
        {
            id: 'fashion-riviera',
            cat: 'fashion',
            title: 'Thời trang phong cách Riviera Địa Trung Hải',
            prompt: 'Ảnh thời trang biên tập của một [nam/nữ] mặc [mô tả trang phục] vải lanh, đứng trên ban công khu nghỉ dưỡng ven biển, ánh nắng vàng ấm, gió nhẹ, phong cách Mediterranean Riviera sang trọng thư thái, tông màu ấm điện ảnh.',
            needsImage: false,
            source: 'youmind (No.21/85)',
        },
        // ── Mặc lên người (cần ảnh gốc) ──
        {
            id: 'onmodel-keepface',
            cat: 'onmodel',
            title: 'Mặc trang phục lên ảnh người (giữ nguyên mặt)',
            prompt: 'Dùng hình ảnh đã tải lên, GIỮ NGUYÊN khuôn mặt, kiểu tóc và tông màu da của người. Cho người này mặc [mô tả trang phục], dáng vừa vặn tự nhiên, nếp vải và ánh sáng chân thực, thay thế trang phục cũ. Ảnh thời trang toàn thân chân thực, chuyên nghiệp.',
            needsImage: true,
            source: 'youmind (No.96) + ghép đồ',
        },
        {
            id: 'onmodel-product',
            cat: 'onmodel',
            title: 'Đưa sản phẩm (áo/váy) lên người mẫu',
            prompt: 'Lấy món trang phục trong ảnh và cho một người mẫu [nữ/nam] mặc lên người một cách tự nhiên, vừa vặn, nếp vải và đổ bóng chân thực, người mẫu đứng tạo dáng trong studio ánh sáng dịu nền trung tính, ảnh thời trang thương mại điện tử chất lượng cao.',
            needsImage: true,
            source: 'PicoTrex (multi-image fusion)',
        },
        {
            id: 'onmodel-flatlay-to-model',
            cat: 'onmodel',
            title: 'Từ ảnh phẳng quần áo → mặc lên người thật',
            prompt: 'Từ ảnh chụp phẳng (flat-lay) của bộ trang phục này, dựng một người mẫu thật mặc đúng bộ đồ đó, giữ nguyên màu sắc, hoạ tiết và kiểu dáng, dáng đứng tự nhiên, ánh sáng studio, nền sạch, ảnh sản phẩm thời trang chuyên nghiệp.',
            needsImage: true,
            source: 'PicoTrex',
        },
        // ── Đổi nền / phong cảnh (cần ảnh) ──
        {
            id: 'scene-white',
            cat: 'scene',
            title: 'Tách nền → nền trắng studio sạch',
            prompt: 'Giữ nguyên chủ thể trong ảnh, thay nền thành nền trắng studio sạch sẽ với bóng đổ mềm tự nhiên dưới chân, ánh sáng đều, phong cách ảnh sản phẩm thương mại điện tử.',
            needsImage: true,
            source: 'nano-banana editing',
        },
        {
            id: 'scene-beach',
            cat: 'scene',
            title: 'Đổi nền → bãi biển hoàng hôn',
            prompt: 'Giữ nguyên người và trang phục trong ảnh, đổi phông nền thành bãi biển hoàng hôn ánh vàng ấm, ánh sáng ngược dịu, không khí thư thái sang trọng, hoà sáng tự nhiên giữa chủ thể và nền.',
            needsImage: true,
            source: 'nano-banana editing',
        },
        {
            id: 'scene-street',
            cat: 'scene',
            title: 'Đổi nền → phố thời trang đường phố',
            prompt: 'Giữ nguyên người và trang phục, đặt vào bối cảnh phố thị thời trang đường phố (street style), ánh sáng ban ngày tự nhiên, hậu cảnh mờ nhẹ (bokeh), phong cách lookbook năng động.',
            needsImage: true,
            source: 'nano-banana editing',
        },
        {
            id: 'scene-restore',
            cat: 'scene',
            title: 'Phục hồi & nâng nét ảnh cũ/mờ',
            prompt: 'Phục hồi và nâng cấp ảnh này lên độ phân giải cao: làm rõ nét chi tiết, khử nhiễu, cân bằng màu tự nhiên, giữ nguyên bố cục và nhận diện chủ thể, kết quả sắc nét chân thực.',
            needsImage: true,
            source: 'PicoTrex (No.74 restoration)',
        },
        // ── Ảnh đại diện (cần ảnh) ──
        {
            id: 'avatar-studio',
            cat: 'avatar',
            title: 'Ảnh đại diện studio thanh lịch',
            prompt: 'Từ ảnh khuôn mặt đã tải lên, tạo ảnh chân dung studio chuyên nghiệp: ánh sáng mềm thanh lịch, phông nền trơn trung tính, biểu cảm tự nhiên thân thiện, giữ nguyên đặc điểm khuôn mặt, chất lượng ảnh thẻ cao cấp.',
            needsImage: true,
            source: 'youmind (Profile/Avatar)',
        },
        {
            id: 'avatar-id',
            cat: 'avatar',
            title: 'Ảnh thẻ chuyên nghiệp (hồ sơ)',
            prompt: 'Từ ảnh đã tải lên, tạo ảnh thẻ chuyên nghiệp độ phân giải cao: trang phục lịch sự, nền xanh/xám trơn, ánh sáng đều, giữ nguyên khuôn mặt, phù hợp hồ sơ công việc.',
            needsImage: true,
            source: 'youmind (No.17 ID photo)',
        },
        {
            id: 'avatar-pixar',
            cat: 'avatar',
            title: 'Chân dung phong cách Pixar 3D',
            prompt: 'Từ ảnh đã tải lên, vẽ lại chân dung theo phong cách hoạt hình Pixar 3D dễ thương: giữ nét nhận diện khuôn mặt, ánh sáng mềm, màu sắc tươi, biểu cảm thân thiện.',
            needsImage: true,
            source: 'PicoTrex (No.110 Pixar)',
        },
        // ── Flat-lay / bố cục (text→ảnh) ──
        {
            id: 'layout-flatlay',
            cat: 'layout',
            title: 'Flat-lay knolling sản phẩm chụp từ trên',
            prompt: 'Ảnh flat-lay knolling chụp từ trên xuống, sắp xếp gọn gàng [danh sách sản phẩm/phụ kiện] theo lưới 90° đều nhau, bóng đổ studio mềm, bề mặt lì đồng nhất, đèn softbox phẳng từ trên, thẩm mỹ sắp xếp ngăn nắp, ảnh sản phẩm thương mại điện tử.',
            needsImage: false,
            source: 'youmind (No.95 knolling)',
        },
        {
            id: 'layout-bento',
            cat: 'layout',
            title: 'Infographic Bento sản phẩm cao cấp',
            prompt: 'Đồ hoạ thông tin (infographic) bố cục lưới Bento kính lỏng (glassmorphism) cao cấp giới thiệu [tên sản phẩm] với các mô-đun: ảnh sản phẩm, tính năng nổi bật, thông số, giá. Phong cách hiện đại sạch sẽ, tông màu thương hiệu, chữ rõ ràng.',
            needsImage: false,
            source: 'youmind (No.2 Bento)',
        },
        // ── Poster / khuyến mãi (text→ảnh) ──
        {
            id: 'poster-sale',
            cat: 'poster',
            title: 'Poster khuyến mãi / SALE bắt mắt',
            prompt: 'Poster quảng cáo khuyến mãi cho [shop/sản phẩm], tiêu đề lớn "[SALE 50%]", bố cục cân đối hiện đại, màu sắc nổi bật thu hút, có chỗ đặt ảnh sản phẩm và thông tin ưu đãi, chữ tiếng Việt rõ ràng dễ đọc, phong cách thương mại chuyên nghiệp.',
            needsImage: false,
            source: 'youmind (Poster/Flyer)',
        },
        {
            id: 'poster-tet',
            cat: 'poster',
            title: 'Banner ưu đãi Tết / dịp lễ',
            prompt: 'Banner ưu đãi dịp [Tết/lễ] cho shop thời trang, không khí lễ hội ấm áp, hoạ tiết truyền thống tinh tế, tiêu đề chúc mừng + ưu đãi, có chỗ đặt sản phẩm, tông màu đỏ-vàng sang trọng, chữ tiếng Việt rõ ràng.',
            needsImage: false,
            source: 'youmind (No.5 New Year)',
        },
        {
            id: 'poster-social',
            cat: 'poster',
            title: 'Ảnh đăng mạng xã hội (square 1:1)',
            prompt: 'Ảnh quảng cáo mạng xã hội tỉ lệ vuông cho [sản phẩm], bố cục thu hút trên feed, người mẫu hoặc sản phẩm nổi bật, màu sắc thương hiệu, khoảng trống cho caption, phong cách hiện đại sạch sẽ.',
            needsImage: false,
            source: 'youmind (Social Media Post)',
        },
    ];

    // ───────────────────────── Vai trò chat (system prompt) ─────────────────────────
    // Pattern (theo x1xhlol/system-prompts): (1) định nghĩa vai trò, (2) năng lực, (3) giọng
    // điệu/ngôn ngữ, (4) ràng buộc, (5) định dạng output. Viết riêng cho shop thời trang VN.
    const DEFAULT_ROLE =
        'Bạn là trợ lý AI của shop thời trang nữ N2Store (bán online qua Facebook/Pancake & sàn TMĐT). ' +
        'Nhiệm vụ: hỗ trợ nhân viên soạn nội dung bán hàng, tư vấn khách, viết caption, mô tả sản phẩm, xử lý tình huống. ' +
        'Giọng điệu: thân thiện, gần gũi, chuyên nghiệp, dùng tiếng Việt tự nhiên (xưng "shop"/"em", gọi khách "mình"/"chị"). ' +
        'Quy tắc: trả lời ngắn gọn đi thẳng vấn đề; KHÔNG bịa thông tin sản phẩm/giá/khuyến mãi không có; ' +
        'khi thiếu dữ kiện thì hỏi lại; ưu tiên chốt đơn lịch sự, không spam. ' +
        'Định dạng: dùng emoji vừa phải, xuống dòng rõ ràng, có thể gạch đầu dòng khi liệt kê.';

    const ROLES = [
        {
            id: 'default',
            title: '🛍️ Trợ lý bán hàng N2Store (mặc định)',
            desc: 'Trợ lý chung cho shop thời trang nữ: tư vấn, soạn nội dung, hỗ trợ nhân viên.',
            system: DEFAULT_ROLE,
        },
        {
            id: 'caption',
            title: '✍️ Viết caption Facebook bán hàng',
            desc: 'Caption bắt trend, vui tươi, có emoji + lời kêu gọi chốt đơn.',
            system:
                'Bạn là chuyên gia viết caption bán hàng Facebook cho shop thời trang nữ N2Store. ' +
                'Khi nhận tên/mô tả sản phẩm, viết 1 caption tiếng Việt: mở đầu thu hút, nêu 2-3 điểm nổi bật, ' +
                'thêm cảm xúc + emoji hợp lý, kết bằng lời kêu gọi hành động (inbox/giá/đặt hàng). ' +
                'Độ dài 3-6 dòng, tự nhiên như người thật viết, KHÔNG sến cứng, KHÔNG bịa giá nếu không được cho. ' +
                'Có thể gợi ý 2-3 hashtag cuối bài.',
        },
        {
            id: 'reply',
            title: '💬 Trả lời tin nhắn khách',
            desc: 'Soạn câu trả lời lịch sự, đúng trọng tâm cho tin nhắn khách hỏi.',
            system:
                'Bạn là nhân viên chăm sóc khách hàng của shop thời trang nữ N2Store. ' +
                'Nhận câu hỏi/tin nhắn của khách → soạn câu trả lời tiếng Việt: lịch sự, thân thiện, ngắn gọn, đúng trọng tâm. ' +
                'Xưng "shop"/"em", gọi khách "mình"/"chị". Nếu khách hỏi còn hàng/size/giá mà chưa có dữ liệu, ' +
                'hãy hỏi lại lịch sự để lấy thông tin. Luôn hướng tới hỗ trợ khách chốt đơn nhẹ nhàng, không ép.',
        },
        {
            id: 'describe',
            title: '📝 Viết mô tả sản phẩm',
            desc: 'Mô tả sản phẩm chuẩn SEO cho sàn TMĐT/website.',
            system:
                'Bạn là chuyên gia viết mô tả sản phẩm thời trang cho sàn TMĐT. ' +
                'Nhận tên + đặc điểm sản phẩm → viết mô tả tiếng Việt có cấu trúc: câu mở giới thiệu, ' +
                'danh sách đặc điểm (chất liệu, form dáng, màu, size), gợi ý phối đồ/dịp mặc, và lý do nên mua. ' +
                'Văn phong rõ ràng, thuyết phục, chuẩn SEO (tự nhiên chèn từ khoá), KHÔNG bịa thông số không có.',
        },
        {
            id: 'complaint',
            title: '🙏 Xử lý khiếu nại / phàn nàn',
            desc: 'Soạn phản hồi xoa dịu khách khi giao trễ, lỗi sản phẩm…',
            system:
                'Bạn là nhân viên CSKH xử lý khiếu nại của shop thời trang nữ N2Store. ' +
                'Nhận tình huống khách phàn nàn (giao trễ, lỗi hàng, sai mẫu…) → soạn phản hồi tiếng Việt: ' +
                'đồng cảm + xin lỗi chân thành trước, nêu hướng giải quyết cụ thể (đổi/trả/hỗ trợ), giữ thái độ bình tĩnh lịch sự, ' +
                'giữ chân khách. Tuyệt đối không đổ lỗi cho khách, không hứa điều không chắc chắn.',
        },
        {
            id: 'ideas',
            title: '💡 Brainstorm ý tưởng bán hàng',
            desc: 'Gợi ý ý tưởng content, chương trình, combo, tên sản phẩm.',
            system:
                'Bạn là cố vấn marketing cho shop thời trang nữ N2Store. ' +
                'Khi được hỏi, đưa ra các ý tưởng cụ thể, khả thi, hợp thị trường Việt Nam: ' +
                'ý tưởng content/livestream, chương trình khuyến mãi, combo sản phẩm, tên gọi/slogan, cách tăng tương tác. ' +
                'Trình bày dạng danh sách ngắn gọn, mỗi ý kèm 1 câu giải thích vì sao hiệu quả.',
        },
        {
            id: 'custom',
            title: '✏️ Tự nhập vai trò…',
            desc: 'Tự viết định hướng riêng cho AI (system prompt tuỳ chỉnh).',
            system: '', // sentinel — caller mở ô nhập tự do
        },
    ];

    // ───────────────────────── Modal picker (tự chứa CSS) ─────────────────────────
    let _cssInjected = false;
    function _injectCss() {
        if (_cssInjected) return;
        _cssInjected = true;
        const css = `
        .aip-overlay{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;
            background:rgba(15,23,42,.55);padding:16px}
        .aip-overlay.open{display:flex}
        .aip-modal{background:var(--web2-surface,#fff);color:var(--web2-text,#0f172a);width:min(860px,96vw);
            max-height:88vh;border-radius:16px;display:flex;flex-direction:column;overflow:hidden;
            box-shadow:0 24px 60px rgba(0,0,0,.28)}
        .aip-head{display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--web2-border,#e2e8f0)}
        .aip-head h3{margin:0;font-size:1.02rem;font-weight:700;flex:1}
        .aip-x{border:none;background:transparent;font-size:22px;line-height:1;cursor:pointer;color:var(--web2-text-3,#94a3b8);padding:2px 6px;border-radius:8px}
        .aip-x:hover{background:var(--web2-bg,#f1f5f9)}
        .aip-cats{display:flex;flex-wrap:wrap;gap:6px;padding:10px 18px 4px}
        .aip-cat{border:1px solid var(--web2-border,#e2e8f0);background:var(--web2-bg,#f8fafc);border-radius:999px;
            padding:5px 12px;font-size:.78rem;cursor:pointer;white-space:nowrap}
        .aip-cat.active{background:var(--web2-primary,#6366f1);border-color:var(--web2-primary,#6366f1);color:#fff}
        .aip-grid{overflow:auto;padding:12px 18px 18px;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}
        .aip-card{border:1px solid var(--web2-border,#e2e8f0);border-radius:12px;padding:12px;cursor:pointer;
            background:var(--web2-surface,#fff);transition:border-color .15s,transform .12s,box-shadow .15s;display:flex;flex-direction:column;gap:6px}
        .aip-card:hover{border-color:var(--web2-primary,#6366f1);transform:translateY(-2px);box-shadow:0 6px 18px rgba(99,102,241,.14)}
        .aip-card h4{margin:0;font-size:.86rem;font-weight:700;line-height:1.3}
        .aip-card p{margin:0;font-size:.74rem;color:var(--web2-text-2,#64748b);line-height:1.4;
            display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
        .aip-tag{align-self:flex-start;font-size:.66rem;padding:2px 8px;border-radius:999px;background:#eef2ff;color:#4f46e5;font-weight:600}
        .aip-tag.need{background:#fef3c7;color:#b45309}
        .aip-empty{padding:30px;text-align:center;color:var(--web2-text-3,#94a3b8);grid-column:1/-1}`;
        const s = document.createElement('style');
        s.textContent = css;
        document.head.appendChild(s);
    }

    function _esc(s) {
        return String(s == null ? '' : s).replace(
            /[&<>"]/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
        );
    }

    let _overlay = null;
    function _ensureOverlay() {
        if (_overlay) return _overlay;
        _injectCss();
        const ov = document.createElement('div');
        ov.className = 'aip-overlay';
        ov.innerHTML = `<div class="aip-modal" role="dialog" aria-modal="true">
            <div class="aip-head"><h3 data-aip-title>Mẫu câu lệnh</h3><button class="aip-x" data-aip-x>×</button></div>
            <div class="aip-cats" data-aip-cats></div>
            <div class="aip-grid" data-aip-grid></div>
        </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', (e) => {
            if (e.target === ov || e.target.closest('[data-aip-x]')) close();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && ov.classList.contains('open')) close();
        });
        _overlay = ov;
        return ov;
    }
    function close() {
        if (_overlay) _overlay.classList.remove('open');
    }

    // pickImage(cb, opts) — opts.onlyCats: lọc danh mục (vd ['scene','onmodel'] cho tab Ghép đồ).
    function pickImage(cb, opts) {
        opts = opts || {};
        const ov = _ensureOverlay();
        ov.querySelector('[data-aip-title]').textContent = opts.title || 'Mẫu câu lệnh tạo ảnh';
        const onlyCats = opts.onlyCats || null;
        const items = onlyCats ? IMAGE.filter((p) => onlyCats.includes(p.cat)) : IMAGE;
        const cats = CATS.filter((c) => c.id === 'all' || items.some((p) => p.cat === c.id));
        let active = 'all';
        const catBox = ov.querySelector('[data-aip-cats]');
        const grid = ov.querySelector('[data-aip-grid]');
        function renderCats() {
            catBox.innerHTML = cats
                .map(
                    (c) =>
                        `<button type="button" class="aip-cat ${c.id === active ? 'active' : ''}" data-cat="${c.id}">${_esc(c.label)}</button>`
                )
                .join('');
            catBox.querySelectorAll('[data-cat]').forEach((b) =>
                b.addEventListener('click', () => {
                    active = b.dataset.cat;
                    renderCats();
                    renderGrid();
                })
            );
        }
        function renderGrid() {
            const list = active === 'all' ? items : items.filter((p) => p.cat === active);
            grid.innerHTML = list.length
                ? list
                      .map(
                          (p) =>
                              `<div class="aip-card" data-id="${p.id}">
                                <span class="aip-tag ${p.needsImage ? 'need' : ''}">${p.needsImage ? '🖼 cần ảnh gốc' : '✏️ tạo mới'}</span>
                                <h4>${_esc(p.title)}</h4>
                                <p>${_esc(p.prompt)}</p>
                            </div>`
                      )
                      .join('')
                : '<div class="aip-empty">Không có mẫu phù hợp</div>';
            grid.querySelectorAll('[data-id]').forEach((el) =>
                el.addEventListener('click', () => {
                    const p = items.find((x) => x.id === el.dataset.id);
                    if (p) {
                        close();
                        cb(p.prompt, p);
                    }
                })
            );
        }
        renderCats();
        renderGrid();
        ov.classList.add('open');
    }

    function pickRole(cb) {
        const ov = _ensureOverlay();
        ov.querySelector('[data-aip-title]').textContent = 'Chọn vai trò cho AI';
        ov.querySelector('[data-aip-cats]').innerHTML = '';
        const grid = ov.querySelector('[data-aip-grid]');
        grid.innerHTML = ROLES.map(
            (r) =>
                `<div class="aip-card" data-id="${r.id}">
                    <h4>${_esc(r.title)}</h4>
                    <p>${_esc(r.desc)}</p>
                </div>`
        ).join('');
        grid.querySelectorAll('[data-id]').forEach((el) =>
            el.addEventListener('click', () => {
                const r = ROLES.find((x) => x.id === el.dataset.id);
                if (r) {
                    close();
                    cb(r.system, r);
                }
            })
        );
        ov.classList.add('open');
    }

    global.AiPresets = {
        image: IMAGE,
        roles: ROLES,
        cats: CATS,
        DEFAULT_ROLE,
        pickImage,
        pickRole,
        close,
    };
})(window);
