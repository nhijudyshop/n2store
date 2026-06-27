// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Trợ lý AI — THƯ VIỆN MẪU CÂU LỆNH (preset library) dùng chung cho tab Tạo ảnh / Ghép đồ
 * và Vai trò chat.
 *
 * Nguồn (curated 2026-06-27, ~49 prompt CHỌN LỌC từ repo Nano Banana nhiều sao + Việt hoá
 * cho shop thời trang nữ N2Store):
 *   • PicoTrex/Awesome-Nano-Banana-images (23k★) — case ảnh sản phẩm / ghép đồ / đổi nền / phục hồi.
 *   • YouMind-OpenLab/awesome-nano-banana-pro-prompts (12.7k★) — công thức ánh sáng 85mm/f2.8,
 *     flat-lay knolling, infographic Bento, giữ danh tính khuôn mặt.
 *   • JimmyLv/awesome-nano-banana (8.8k★) — bìa tạp chí, chân dung B&W, 3D chibi, anime.
 *   Nhóm: 🛍️ sản phẩm · 👗 người mẫu · 🧥 thử đồ (try-on Pro) · 🧑‍🤝‍🧑 GHÉP MẶT · 🖼️ đổi nền ·
 *   👤 avatar · 📐 flat-lay · 🎉 poster. Prompt try-on/ghép-mặt viết TIẾNG ANH (giữ danh tính tốt hơn).
 *   • Vai trò chat: cảm hứng từ pattern kỹ thuật của
 *     github.com/x1xhlol/system-prompts-and-models-of-ai-tools — viết riêng cho shop N2Store.
 *
 * API:
 *   window.AiPresets.image            → [{id, cat, title, prompt, needsImage, inputImages, source}]
 *   window.AiPresets.roles            → [{id, title, desc, system}]
 *   window.AiPresets.DEFAULT_ROLE     → system prompt mặc định cho cuộc chat shop mới
 *   window.AiPresets.pickImage(cb,opts) → mở modal chọn câu lệnh ảnh → cb(prompt, preset)
 *   window.AiPresets.pickRole(cb)       → mở modal chọn vai trò chat → cb(systemPrompt, role)
 */
(function (global) {
    'use strict';

    // ───────────────────────── Câu lệnh tạo ảnh ─────────────────────────
    // needsImage=true → câu lệnh SỬA/GHÉP ảnh tải lên (chỉ chạy tốt với Nano Banana / tab
    // "Ghép đồ" / sidecar gemini-tryon). inputImages = mô tả ảnh cần + THỨ TỰ (ảnh 1, ảnh 2…).
    const CATS = [
        { id: 'all', label: 'Tất cả' },
        { id: 'product', label: '🛍️ Ảnh sản phẩm' },
        { id: 'fashion', label: '👗 Thời trang / Người mẫu' },
        { id: 'onmodel', label: '🧥 Thử đồ / Mặc lên người (cần ảnh)' },
        { id: 'faceswap', label: '🧑‍🤝‍🧑 Ghép mặt (cần ảnh)' },
        { id: 'scene', label: '🖼️ Đổi nền / Phong cảnh (cần ảnh)' },
        { id: 'avatar', label: '👤 Ảnh đại diện (cần ảnh)' },
        { id: 'layout', label: '📐 Flat-lay / Bố cục' },
        { id: 'poster', label: '🎉 Poster / Khuyến mãi' },
    ];

    const IMAGE = [
        // ── product ──
        {
            id: 'prod-white-ecom',
            cat: 'product',
            title: 'Nền trắng TMĐT chuẩn sàn',
            prompt: 'High-resolution e-commerce product photo of {sản phẩm thời trang, ví dụ: chiếc túi xách da nữ màu be} on a seamless pure-white background (#FFFFFF), studio softbox lighting from top-left, gentle wraparound fill so there are no harsh shadows, a faint soft contact shadow directly under the product for grounding. Product perfectly centered, sharp focus edge-to-edge, true-to-life colors, every stitch, zipper and material texture crisp. Clean commercial catalog style, front three-quarter angle, square 1:1, ready for Shopee/Lazada/TikTok Shop listing. No text, no props, no reflection.',
            needsImage: false,
            inputImages: 'Không cần ảnh — text sang ảnh',
            source: 'PicoTrex/Awesome-Nano-Banana-images (23.1k★) — product photography conventions',
        },
        {
            id: 'prod-marble-podium',
            cat: 'product',
            title: 'Bục đá cẩm thạch sang trọng',
            prompt: 'Luxury product photography of {sản phẩm, ví dụ: lọ nước hoa nữ thủy tinh} resting on a polished white Carrara marble podium with soft grey veining. Cylindrical stone pedestal, beige plaster wall behind with a long warm window-light streak falling across it. Directional late-afternoon sunlight casting a soft elongated shadow to the right, shallow depth of field, high-end editorial mood. Minimalist, premium beauty-brand aesthetic, warm neutral palette, fine material detail in razor-sharp focus, vertical 3:4. No text.',
            needsImage: false,
            inputImages: 'Không cần ảnh — text sang ảnh',
            source: 'YouMind-OpenLab/awesome-nano-banana-pro-prompts (12.7k★) — high-end product/marble lighting',
        },
        {
            id: 'prod-water-splash',
            cat: 'product',
            title: 'Nước bắn động lực kịch tính',
            prompt: 'Dynamic commercial product shot of {sản phẩm, ví dụ: chai sữa rửa mặt} in a dramatic modern scene with an explosive outward burst of crystal-clear water splashes and droplets frozen mid-air around the product, suggesting freshness and purity. High-speed flash freeze-motion, water crowns and ribbons swirling outward, key brand color (soft aqua-blue) gradient background, promotional advertising still, no text, product emphasized razor-sharp in the center, glossy highlights catching the light, vertical 9:16. Cinematic, high-detail.',
            needsImage: false,
            inputImages: 'Không cần ảnh — text sang ảnh',
            source: 'PicoTrex/Awesome-Nano-Banana-images (23.1k★) — splash; YouMind No.14 cinematic splash',
        },
        {
            id: 'prod-spa-skincare',
            cat: 'product',
            title: 'Spa skincare nền thiên nhiên',
            prompt: 'Serene spa-style skincare product photo of {sản phẩm, ví dụ: hũ kem dưỡng da} on a wet smooth river stone surrounded by fresh green eucalyptus leaves, a few water droplets on the jar, soft morning daylight diffused through a sheer curtain. Calm wellness atmosphere, muted sage-green and cream palette, gentle steam haze in the background, soft natural shadows, dewy fresh feel. Macro-clean focus on the product label and cream texture, shallow depth of field, vertical 3:4. Premium clean-beauty editorial, no text.',
            needsImage: false,
            inputImages: 'Không cần ảnh — text sang ảnh',
            source: 'PicoTrex/Awesome-Nano-Banana-images (23.1k★) — skincare/cosmetic styling',
        },
        {
            id: 'prod-pastel-color',
            cat: 'product',
            title: 'Nền pastel khối màu kẹo',
            prompt: 'Playful flat-color product photo of {sản phẩm, ví dụ: đôi giày sneaker nữ} floating slightly above a two-tone pastel backdrop (soft pink curving into baby-blue), studio lighting with a clean soft gradient shadow beneath. Candy-color minimalist set, smooth seamless paper sweep, one geometric pastel prop (a cube or arch) for depth, bright cheerful Gen-Z e-commerce mood. Product centered and sharp, vibrant true colors, even soft shadows, square 1:1. Modern, fun, no text.',
            needsImage: false,
            inputImages: 'Không cần ảnh — text sang ảnh',
            source: 'YouMind-OpenLab/awesome-nano-banana-pro-prompts (12.7k★) — pastel/brand-color background styling',
        },
        {
            id: 'prod-flatlay-set',
            cat: 'product',
            title: 'Flatlay bộ sản phẩm đồng bộ',
            prompt: 'Top-down flat-lay product set of {bộ sản phẩm, ví dụ: phụ kiện thời trang nữ — túi, khăn lụa, kính mát, son} arranged neatly on a warm beige linen surface with intentional negative space and a balanced rhythm (not a uniform grid). Soft diffused overhead daylight, gentle natural shadows, a few styling accents (dried flowers, a folded scarf) framing the composition. Cohesive earthy-neutral palette, every item crisp and color-accurate, lifestyle editorial flat-lay for a fashion brand lookbook, square 1:1. No text.',
            needsImage: false,
            inputImages: 'Không cần ảnh — text sang ảnh',
            source: 'PicoTrex/Awesome-Nano-Banana-images (23.1k★) — merch/product display layouts',
        },
        {
            id: 'prod-macro-fabric',
            cat: 'product',
            title: 'Macro chất liệu vải cận cảnh',
            prompt: 'Extreme macro close-up of {chất liệu vải, ví dụ: vải lụa satin màu hồng phấn / vải tweed dệt / vải linen mộc} showing the weave structure, fiber texture and subtle sheen in fine detail. Soft raking side-light grazing across the surface to reveal every thread, shallow depth of field with creamy bokeh falloff, true fabric color, a single soft fold or drape adding dimension. Tactile premium textile feel, clean neutral surround, commercial material-detail shot for a fashion product page, horizontal 16:9. No text.',
            needsImage: false,
            inputImages: 'Không cần ảnh — text sang ảnh',
            source: 'YouMind-OpenLab/awesome-nano-banana-pro-prompts (12.7k★) — Macro: cận cảnh kết cấu sản phẩm',
        },
        {
            id: 'prod-miniature-hand',
            cat: 'product',
            title: 'Tay cầm sản phẩm tí hon sang chảnh',
            prompt: "High-resolution advertising photo of a woman delicately holding a realistic miniature {sản phẩm, ví dụ: chiếc đầm dạ hội / túi xách} between her thumb and forefinger. Clean fresh background, studio lighting, soft shadows. Elegant hand with natural skin tone and glossy manicured nails, positioned to highlight the product's shape and detail. The product looks tiny yet richly detailed with precise branding, centered in frame, shallow depth of field. Mimics luxury product photography and minimalist commercial style, vertical 3:4. No text.",
            needsImage: false,
            inputImages: 'Không cần ảnh — text sang ảnh',
            source: 'PicoTrex/Awesome-Nano-Banana-images (23.1k★) — 例 53 精致可爱的产品照片 (by @azed_ai)',
        },
        // ── fashion ──
        {
            id: 'fashion-studio-lookbook-asian',
            cat: 'fashion',
            title: 'Người mẫu nữ - Lookbook studio nền trơn',
            prompt: 'Full-body e-commerce lookbook photo of a young East Asian female fashion model, early 20s, natural glowing skin, soft neutral makeup, hair styled simply. She is wearing [trang phục], standing in a relaxed confident pose with one hand on her hip against a seamless soft beige studio backdrop. Three-point softbox studio lighting with a large key light at 45 degrees and gentle fill, crisp clean shadows. Shot on 85mm lens, f/4, eye-level, vertical 3:4 framing with headroom and full shoes visible. Fabric texture, seams and drape of the clothing rendered sharply. Editorial catalog aesthetic, true-to-color, high resolution, photorealistic.',
            needsImage: false,
            inputImages: 'không cần ảnh upload (text→ảnh)',
            source: 'YouMind-OpenLab (Elegant Studio Portraits) + cuigh editorial patterns',
        },
        {
            id: 'fashion-boutique-instore',
            cat: 'fashion',
            title: 'Người mẫu nữ - Trong cửa hàng boutique',
            prompt: 'Lifestyle fashion photo of a young East Asian woman, mid 20s, gentle natural makeup, wearing [trang phục], browsing inside a bright modern clothing boutique. Background has softly blurred clothing racks, warm wood shelves and a marble counter with shallow depth of field. Soft diffused daylight mixed with warm boutique spotlights, airy and inviting mood. Three-quarter body framing, candid mid-step pose looking slightly off camera. Shot on 50mm lens, f/2.0, vertical orientation. Warm cinematic color grade, realistic skin, clean fabric detail, photorealistic retail catalog feel.',
            needsImage: false,
            inputImages: 'không cần ảnh upload (text→ảnh)',
            source: "YouMind Use-Case 'E-commerce Main Image' + JimmyLv lifestyle patterns",
        },
        {
            id: 'fashion-outdoor-garden-daylight',
            cat: 'fashion',
            title: 'Người mẫu nữ - Ngoài trời nắng dịu sân vườn',
            prompt: 'Outdoor fashion editorial of a young East Asian female model wearing [trang phục], standing in a sunlit green garden with soft bokeh foliage and dappled sunlight behind her. Golden-hour backlight creating a gentle rim around her hair, warm soft fill on the face from a reflector. Full-body composition, natural relaxed walking pose, hair lightly moving in the breeze. Shot on 85mm lens, f/2.8, vertical 3:4 framing. Fresh airy color palette, true fabric colors, lifelike skin texture, professional outdoor catalog photography, photorealistic.',
            needsImage: false,
            inputImages: 'không cần ảnh upload (text→ảnh)',
            source: "PicoTrex/YouMind 'Urban Rooftop Sunset' golden-hour outdoor pattern",
        },
        {
            id: 'fashion-street-style-urban',
            cat: 'fashion',
            title: 'Người mẫu nữ - Street style đường phố',
            prompt: 'Candid street-style fashion shot of a stylish young East Asian woman wearing [trang phục], walking on a clean modern city sidewalk with softly blurred storefronts, glass facades and bokeh city lights behind her. Overcast soft daylight, even flattering illumination, slight motion energy in the stride. Full-body vertical composition shot slightly low angle to lengthen the silhouette. Shot on 35mm lens, f/2.5, documentary editorial look. Crisp clothing detail, accurate colors, natural confident expression, modern urban fashion magazine aesthetic, photorealistic.',
            needsImage: false,
            inputImages: 'không cần ảnh upload (text→ảnh)',
            source: "YouMind 'Cityscape/Street' subject + cuigh editorial street patterns",
        },
        {
            id: 'fashion-korean-minimalist-editorial',
            cat: 'fashion',
            title: 'Người mẫu nữ - Phong cách Hàn tối giản',
            prompt: 'Minimalist Korean editorial portrait of a young East Asian female model wearing [trang phục], styled with clean dewy glass-skin makeup, soft natural brows and tinted lips, hair neat and effortless. Standing against a soft off-white wall with subtle warm tones, gentle directional window light wrapping the face, clean low-contrast soft shadows. Three-quarter to full-body framing, calm serene expression, hands relaxed. Shot on 85mm lens, f/2.8, vertical. Soft film-like color grade, true fabric color, timeless minimalist K-fashion aesthetic, photorealistic high resolution.',
            needsImage: false,
            inputImages: 'không cần ảnh upload (text→ảnh)',
            source: "PicoTrex/YouMind 'Minimalist Korean Beauty Editorial'",
        },
        {
            id: 'fashion-luxury-magazine-editorial',
            cat: 'fashion',
            title: 'Người mẫu nữ - Sang trọng bìa tạp chí',
            prompt: 'High-fashion luxury magazine editorial of an elegant young East Asian woman wearing [trang phục], posed confidently in a sophisticated interior with marble columns, soft draped curtains and warm ambient glow. Dramatic directional studio lighting with a strong key light, sculpted highlights and deep refined shadows for a premium look. Full-body or three-quarter framing, poised graceful posture, captivating expression. Shot on 85mm lens, f/4, vertical cover-style composition. Rich cinematic color grade, luxurious atmosphere, immaculate fabric texture, glossy magazine-cover aesthetic, photorealistic.',
            needsImage: false,
            inputImages: 'không cần ảnh upload (text→ảnh)',
            source: "JimmyLv Case 49 'Fashion Magazine Cover' + YouMind 'Luxury Editorial'",
        },
        {
            id: 'fashion-everyday-cafe-casual',
            cat: 'fashion',
            title: 'Người mẫu nữ - Đời thường quán cà phê',
            prompt: 'Cozy everyday lifestyle photo of a relatable young East Asian woman wearing [trang phục], sitting and smiling naturally at a bright minimalist cafe table near a large window. Soft warm daylight from the side, gentle shadows, blurred wood interior and plants in the background. Three-quarter body candid pose, holding a coffee cup, warm friendly mood. Shot on 50mm lens, f/2.0, vertical orientation. Natural skin texture, true clothing color, soft warm color grade, approachable daily-wear catalog aesthetic, photorealistic.',
            needsImage: false,
            inputImages: 'không cần ảnh upload (text→ảnh)',
            source: "JimmyLv lifestyle/casual patterns + YouMind 'Influencer/Model' subject",
        },
        {
            id: 'fashion-white-studio-fullbody-clean',
            cat: 'fashion',
            title: 'Người mẫu nữ - Studio trắng full-body sàn TMĐT',
            prompt: 'Clean pure-white background full-body e-commerce model photo of a young East Asian female model wearing [trang phục], standing straight in a neutral catalog pose facing the camera, arms relaxed at the sides. Bright even high-key studio lighting from multiple softboxes, minimal soft shadow under the feet, no color cast. Whole body and shoes fully in frame with comfortable margins, vertical 3:4. Shot on 70mm lens, f/5.6, eye-level. Razor-sharp fabric detail, accurate true colors, marketplace product-listing standard, professional clean photorealistic.',
            needsImage: false,
            inputImages: 'không cần ảnh upload (text→ảnh)',
            source: "YouMind 'E-commerce Main Image' use-case standard (white-bg catalog)",
        },
        // ── onmodel ──
        {
            id: 'onmodel-tryon-pro',
            cat: 'onmodel',
            title: 'Thử đồ Pro - ghép hài hoà nhất (giữ mặt + dáng)',
            prompt: "Take the person from the FIRST image as the fixed model. Dress them in the exact clothing item(s) shown in the following image(s), replacing their original outfit completely. ABSOLUTELY preserve the person's face, facial structure, skin tone, hairstyle, body shape, height proportions and pose from the first image - do not alter their identity in any way. For each garment, faithfully reproduce its true colour, fabric texture, knit/weave, pattern, print, logo, embroidery, buttons, seams, collar and length exactly as in the product image - never invent or simplify details. Make the clothing drape and fit the body naturally with realistic fabric folds, gravity, tension at shoulders and waist, and correct garment proportions. CRITICAL for a seamless composite: match the lighting direction, colour temperature and intensity of the original photo so the garment, skin and face share one consistent light; cast soft, physically-correct contact shadows where fabric meets the body; keep skin tone uniform across face, neck, hands and arms with no colour seam at the neckline or wrists; render hands, fingers, neck and collarbone undistorted and anatomically correct. Full-body framing, photorealistic, sharp focus, natural matte skin texture with visible pores (no plastic smoothing), professional fashion e-commerce photography, high resolution, 4:5 aspect ratio.",
            needsImage: true,
            inputImages:
                'Ảnh 1: người mẫu (toàn thân, rõ mặt + dáng). Ảnh 2 trở đi: từng món đồ cần mặc (ảnh sản phẩm hoặc ảnh phẳng).',
            source: 'PicoTrex/Awesome-Nano-Banana-images (23k★) + YouMind-OpenLab/awesome-nano-banana-pro-prompts (12.6k★) - identity-lock + garment fidelity + light-matching',
        },
        {
            id: 'onmodel-flatlay-to-model',
            cat: 'onmodel',
            title: 'Đồ phẳng (flat-lay) lên người mẫu',
            prompt: "Use the FIRST image as the model and keep her face, hairstyle, skin tone, body shape and pose perfectly unchanged. The following image(s) are flat-lay product shots of clothing laid on a surface. Reconstruct each flat garment into a fully worn three-dimensional piece on the model's body: infer the natural drape, volume, sleeve and hem length, and how the fabric falls with gravity. Keep the exact colour, print, pattern, texture, trims and any logo from the flat-lay - do not alter the design. Replace her current outfit. Add realistic fabric folds, soft self-shadows inside the garment, and physically-correct contact shadows on the body. Match the model photo's existing lighting and white balance so skin and clothing look lit by the same source, with consistent skin tone from face to hands. Full-body, clean seamless light studio background, photorealistic fashion catalogue photo, sharp detail, natural skin texture, 4:5 aspect ratio.",
            needsImage: true,
            inputImages:
                'Ảnh 1: người mẫu toàn thân. Ảnh 2 trở đi: ảnh đồ chụp phẳng (flat-lay) trên mặt phẳng.',
            source: 'JimmyLv/awesome-nano-banana (8.7k★) figure-from-reference case + YouMind Fashion Item category',
        },
        {
            id: 'onmodel-product-shot-to-model',
            cat: 'onmodel',
            title: 'Áo từ ảnh sản phẩm (mannequin/treo) lên model',
            prompt: "FIRST image = the model whose face, hair, skin tone, body and pose must stay exactly the same. The following image(s) show a garment photographed on a mannequin, a hanger or worn by a different person. Transfer ONLY that garment onto the model, removing the mannequin/hanger and any other person entirely. Preserve the garment's precise cut, colour, fabric, knit, print, buttons, collar, cuffs, length and every logo or graphic exactly as shown. Fit it naturally to the model's frame with correct sizing, realistic folds and tension lines. Replace her original clothing. Ensure one coherent lighting setup: match light direction and colour temperature to the model photo, add gentle realistic shadows where the garment meets the neck, shoulders, waist and arms, and keep skin colour seamless with no visible mask edge at the collar or sleeves. Render neck, collarbone, hands and fingers anatomically correct and free of warping. Full-body photorealistic e-commerce shot, high resolution, sharp focus, natural skin pores, 4:5 aspect ratio.",
            needsImage: true,
            inputImages:
                'Ảnh 1: người mẫu. Ảnh 2 trở đi: ảnh sản phẩm trên ma-nơ-canh / móc treo / người khác mặc.',
            source: 'PicoTrex/Awesome-Nano-Banana-images (23k★) garment-transfer + YouMind pro prompts identity preservation',
        },
        {
            id: 'onmodel-full-outfit-stack',
            cat: 'onmodel',
            title: 'Phối nguyên set (áo + quần/váy + phụ kiện) lên model',
            prompt: 'Use the FIRST image as the fixed model - keep her face, hairstyle, skin tone, body proportions and pose identical. The following images are separate pieces of one outfit (e.g. top, bottom/skirt, outerwear, bag, shoes). Dress the model in all of them together as a complete coordinated look, replacing her original clothes. For each piece keep its exact colour, fabric, texture, pattern, hardware and logo from its product image. Layer the garments in a natural order (innermost to outermost) with believable overlap, realistic folds and correct proportions; place accessories naturally (bag on shoulder or hand, shoes on feet). Maintain one unified lighting setup matched to the model photo, with soft contact shadows between layers and on the floor, and a consistent skin tone across face, neck, arms and legs. Full-body styled lookbook composition, photorealistic, clean neutral studio backdrop, sharp editorial detail, natural matte skin, 4:5 aspect ratio.',
            needsImage: true,
            inputImages:
                'Ảnh 1: người mẫu toàn thân. Ảnh 2 trở đi: từng món trong set (áo, quần/váy, áo khoác, túi, giày...).',
            source: 'YouMind-OpenLab/awesome-nano-banana-pro-prompts (12.6k★) multi-item fashion lookbook + JimmyLv OOTD',
        },
        {
            id: 'onmodel-change-pose-keep-outfit',
            cat: 'onmodel',
            title: 'Đổi tư thế / góc chụp nhưng giữ nguyên bộ đồ',
            prompt: "Use the uploaded image only as the identity and wardrobe reference. Generate a NEW photo of the exact same woman wearing the exact same outfit, but in a different, natural full-body fashion pose: standing three-quarter turned, one hand relaxed at the side and the other lightly on the hip, weight shifted to one leg, looking softly toward the camera. Preserve her face, facial structure, skin tone, hairstyle and the garment's colour, fabric, print, cut, length, buttons and logo with maximum accuracy - same outfit, just a new angle and posture. Re-render fabric folds and shadows to suit the new pose realistically. Soft directional studio lighting from the front-side, seamless light-grey backdrop with a subtle gradient, gentle floor contact shadow. Photographed at eye level with an 85mm lens at f/2.8, photorealistic, sharp focus on the face, natural skin texture with visible pores, premium fashion e-commerce quality, 4:5 aspect ratio.",
            needsImage: true,
            inputImages: '1 ảnh: người mẫu đang mặc sẵn bộ đồ (toàn thân càng tốt).',
            source: "YouMind-OpenLab pro prompts (12.6k★) 'same person, multiple dynamic poses' + 85mm editorial recipe",
        },
        {
            id: 'onmodel-tryon-natural-light',
            cat: 'onmodel',
            title: 'Thử đồ - ánh nắng tự nhiên ngoài trời (lookbook đời thường)',
            prompt: "Take the person from the FIRST image as the model and keep her face, hair, skin tone, body shape and pose unchanged. Dress her in the clothing item(s) from the following image(s), replacing the original outfit and preserving each garment's exact colour, fabric, texture, pattern, trims and logo. Fit everything naturally with realistic folds and proportions. Re-light the whole scene as a candid outdoor lookbook: warm late-afternoon natural sunlight from a single side, soft diffused fill, gentle organic shadows, a softly blurred everyday street or cafe background with shallow depth of field. Crucially, light the garment, skin and face with this same warm directional sun so the composite is seamless, with consistent skin tone from face to hands and soft contact shadows where fabric meets the body. Full-body, photorealistic candid fashion photography, 85mm look with creamy bokeh, natural matte skin texture, no plastic smoothing, 4:5 aspect ratio.",
            needsImage: true,
            inputImages: 'Ảnh 1: người mẫu. Ảnh 2 trở đi: món đồ cần mặc (ảnh sản phẩm/flat-lay).',
            source: 'YouMind-OpenLab pro prompts (12.6k★) dappled-sunlight outdoor + Canon 85mm golden-light recipe',
        },
        {
            id: 'onmodel-tryon-clean-white',
            cat: 'onmodel',
            title: 'Thử đồ - nền trắng studio chuẩn sàn TMĐT',
            prompt: "FIRST image = the model; keep her face, hairstyle, skin tone, body proportions and pose exactly the same. Dress her in the clothing from the following image(s), replacing the original outfit and faithfully preserving each garment's true colour, fabric texture, weave, print, pattern, buttons, collar, hem and any logo. Fit it to the body naturally with correct sizing, realistic fabric folds and tension at the shoulders and waist. Present as a clean e-commerce product photo on a pure seamless white background (#FFFFFF), bright even softbox studio lighting from both sides with a soft frontal fill, a subtle natural floor contact shadow under the model for grounding. Keep one consistent lighting and white balance across garment, skin and face; uniform skin tone from face to hands with no seam at the neckline; undistorted neck, hands and fingers. Full-body centred composition, photorealistic, crisp focus, true-to-life colours suitable for a marketplace listing, natural skin texture, 4:5 aspect ratio.",
            needsImage: true,
            inputImages:
                'Ảnh 1: người mẫu toàn thân. Ảnh 2 trở đi: món đồ (ảnh sản phẩm hoặc flat-lay).',
            source: 'PicoTrex/Awesome-Nano-Banana-images (23k★) studio cases + YouMind seamless white-studio recipe',
        },
        // ── faceswap ──
        {
            id: 'faceswap-onto-model',
            cat: 'faceswap',
            title: 'Ghép mặt người vào model (giữ thân + đồ)',
            prompt: "You are given two images. IMAGE 1 is the FACE SOURCE: take this person's face, facial features, expression, skin tone and identity. IMAGE 2 is the TARGET MODEL: keep the model's hair, neck, body, pose, hands, outfit, background and the camera angle exactly as they are. Seamlessly place the face from IMAGE 1 onto the head of the person in IMAGE 2. Match the face to the model's head orientation and viewing angle, blend skin tone and lighting so the face inherits the exact same light direction, color temperature, soft shadows and highlights of IMAGE 2. Preserve the original face shape, eyes, nose, lips, eyebrows and natural facial proportions from IMAGE 1 with maximum accuracy — do not beautify or change the identity. The transition at the jawline, hairline and neck must be invisible. Keep every garment, fold, accessory and the entire scene of IMAGE 2 unchanged. Output one photorealistic, seamless full-resolution image with no visible compositing, no double edges and no blur.",
            needsImage: true,
            inputImages:
                '2 ảnh: ảnh mặt (nguồn, IMAGE 1) + ảnh model/thân hình mặc đồ (đích, IMAGE 2)',
            source: 'YouMind-OpenLab/awesome-nano-banana-pro-prompts (identity-preserve) + PicoTrex Case 22 (try-on harmonization)',
        },
        {
            id: 'faceswap-customer-on-shop-model',
            cat: 'faceswap',
            title: 'Ghép mặt khách lên ảnh mẫu mặc đồ shop',
            prompt: "Two images are provided. IMAGE 1 is the CUSTOMER'S FACE (identity source). IMAGE 2 is a SHOP LOOKBOOK photo of a model wearing the product outfit. Transfer the customer's exact face and identity from IMAGE 1 onto the model in IMAGE 2 so the customer appears to be the one wearing the shop's clothing. Preserve the customer's real facial identity — face shape, eye shape, eyebrows, nose, lips, skin tone and natural expression — without making them look like a different person. Keep the model's body, pose, hairstyle, the full outfit, every accessory, the studio set and the original lighting of IMAGE 2 completely intact. Re-render the face under the same key light, fill light and shadow pattern as IMAGE 2, matching head tilt and angle for a natural fit. Blend the hairline, jaw and neck flawlessly. Result: a clean photorealistic e-commerce-ready image, sharp facial detail, true-to-life skin texture, no plastic look, no seams.",
            needsImage: true,
            inputImages: '2 ảnh: ảnh mặt khách (nguồn) + ảnh model mặc đồ shop (đích)',
            source: 'YouMind-OpenLab/awesome-nano-banana-pro-prompts (No.98 keep exact real face) + PicoTrex Case 21 OOTD',
        },
        {
            id: 'faceswap-keep-face-change-hair',
            cat: 'faceswap',
            title: 'Giữ mặt, đổi kiểu tóc theo ảnh tham chiếu',
            prompt: "Two images are provided. IMAGE 1 is the PERSON whose face and identity must be fully preserved. IMAGE 2 is the HAIRSTYLE REFERENCE. Keep the exact face, facial features, expression, skin tone, head angle and body of the person in IMAGE 1 unchanged. Replace only the hair of the person in IMAGE 1 with the hairstyle, length, texture and color shown in IMAGE 2, fitting it naturally to the person's head shape and hairline. Render realistic strands, natural shine and soft shadows where the hair falls on the forehead, ears and shoulders, matching the lighting and color temperature of IMAGE 1. Do not alter the face, makeup, outfit or background. Output a single photorealistic portrait with a seamless, believable new hairstyle and no editing artifacts.",
            needsImage: true,
            inputImages: '2 ảnh: ảnh người (giữ mặt) + ảnh kiểu tóc tham chiếu',
            source: 'PicoTrex/Awesome-Nano-Banana-images Case 15 (Change Multiple Hairstyles) + Case 44 lighting consistency',
        },
        {
            id: 'faceswap-studio-portrait-from-face',
            cat: 'faceswap',
            title: 'Chân dung studio từ 1 ảnh mặt',
            prompt: "Use the uploaded photo as the primary identity reference. Preserve the person's exact facial identity, face shape, hairstyle, hair texture, skin tone, eye shape, eyebrows, nose and lips with maximum accuracy — do not change the face or make them look like a different person. Generate a high-end studio portrait of this same person from the shoulders up: clean seamless light-grey backdrop, soft large-softbox key light from 45 degrees with a gentle fill and a subtle rim light separating the hair from the background, natural luminous skin texture, catchlights in the eyes, calm confident expression, modern minimal styling. Shot on an 85mm lens at f/2.0, shallow depth of field, editorial beauty lighting, crisp focus on the eyes, true-to-life color, photorealistic, high resolution.",
            needsImage: true,
            inputImages: '1 ảnh: ảnh mặt rõ nét của khách/người mẫu',
            source: 'YouMind-OpenLab/awesome-nano-banana-pro-prompts (Preserve exact facial identity) + PicoTrex studio-lighting',
        },
        {
            id: 'faceswap-two-faces-into-couple-shot',
            cat: 'faceswap',
            title: 'Ghép 2 mặt vào ảnh đôi mặc đồ shop',
            prompt: "Three images are provided. IMAGE 1 and IMAGE 2 are two FACE SOURCES (two different people). IMAGE 3 is a TARGET photo showing two models wearing the shop's outfits together. Place the face from IMAGE 1 onto the model on the left and the face from IMAGE 2 onto the model on the right of IMAGE 3. Preserve each person's true facial identity, features, skin tone and natural expression. Keep both models' bodies, hairstyles, poses, the full outfits, every accessory, and the original background and lighting of IMAGE 3 unchanged. Match each face to its model's head angle and to the scene's light direction, color temperature, soft shadows and highlights. Blend both hairlines, jaws and necks invisibly. Output one cohesive photorealistic couple image with seamless face swaps, sharp facial detail and no visible compositing.",
            needsImage: true,
            inputImages: '3 ảnh: ảnh mặt người 1 + ảnh mặt người 2 + ảnh đôi model mặc đồ (đích)',
            source: 'YouMind-OpenLab/awesome-nano-banana-pro-prompts (multi-face identity) + PicoTrex Case 21/22',
        },
        {
            id: 'faceswap-harmonize-skin-tone',
            cat: 'faceswap',
            title: 'Ghép mặt + hoà tông da, ánh sáng tự nhiên',
            prompt: "Two images are provided. IMAGE 1 is the FACE to keep (identity source). IMAGE 2 is the TARGET body/scene. Composite the face from IMAGE 1 onto the person in IMAGE 2 and focus heavily on harmonization: re-light the face to exactly match IMAGE 2's lighting setup — same key light direction, intensity, color temperature, ambient bounce and shadow softness. Color-grade and blend the facial skin tone so it transitions smoothly into the neck and ears of IMAGE 2 with no tonal mismatch or visible seam. Preserve the identity, facial features and natural expression from IMAGE 1; keep the hair, body, pose, outfit, accessories and background of IMAGE 2 untouched. Add realistic micro-shadows under the jaw and matching specular highlights on the skin. Output one photorealistic, perfectly blended image — no halo, no edge artifacts, no over-smoothing, full resolution.",
            needsImage: true,
            inputImages: '2 ảnh: ảnh mặt (nguồn) + ảnh thân/model (đích)',
            source: 'PicoTrex/Awesome-Nano-Banana-images Case 44 (Lighting Control) + Case 22',
        },
        // ── scene ──
        {
            id: 'scene-tach-nen-trang',
            cat: 'scene',
            title: 'Tách nền sạch sang nền trắng studio',
            prompt: 'Cleanly extract the main subject (the person and their full outfit) from the photo and place them on a pure seamless white studio background (#FFFFFF). Keep every edge of hair, fabric, and accessories sharp and natural — no halo, no leftover background pixels. Preserve the original soft, even product-photography lighting on the clothing, recreate a subtle natural contact shadow under the feet so the subject does not look like it is floating. Do not change the outfit, pose, body or face. E-commerce catalog look, high resolution.',
            needsImage: true,
            inputImages: '1 ảnh người mặc đồ (nền bất kỳ)',
            source: 'PicoTrex/Awesome-Nano-Banana-images Case 49 (extract subject + transparent/white bg)',
        },
        {
            id: 'scene-nen-bai-bien',
            cat: 'scene',
            title: 'Đổi nền bãi biển hoàng hôn',
            prompt: 'Replace the background of this photo with a serene tropical beach at golden hour: soft turquoise sea, gentle waves, pale sand, and a warm low sun on the horizon. Keep the person and their outfit exactly as in the original. Relight the subject to match the scene — warm golden rim light from the sun direction, soft fill on the shadow side, gentle sand-reflected glow on the lower body. Match white balance to the warm sunset tone, add a faint natural breeze feel to loose fabric and hair. Realistic depth of field with the background slightly soft. Lifestyle fashion lookbook style.',
            needsImage: true,
            inputImages: '1 ảnh người mặc đồ',
            source: 'PicoTrex/Awesome-Nano-Banana-images Case 94 (background scene + warm ambient relight)',
        },
        {
            id: 'scene-nen-pho-thi',
            cat: 'scene',
            title: 'Đổi nền phố thị street-style',
            prompt: 'Place the person against a stylish urban street background: a clean European-style boulevard with soft-focus shopfronts, warm cafe awnings and bokeh city lights in the distance. Keep the subject, outfit, pose and face unchanged. Relight to match an overcast-to-soft-daylight street: even diffused key light, subtle cool ambient in the shadows, gentle reflections from the pavement. Shallow depth of field (background blurred at roughly f/2.8) so the outfit stays the hero. Editorial street-style fashion photography, natural color grading.',
            needsImage: true,
            inputImages: '1 ảnh người mặc đồ',
            source: 'PicoTrex/Awesome-Nano-Banana-images Case 94 + YouMind Profile/Avatar street-style portrait',
        },
        {
            id: 'scene-nen-quan-cafe',
            cat: 'scene',
            title: 'Đổi nền quán cafe ấm cúng',
            prompt: 'Set the person inside a cozy minimalist coffee shop: warm wooden tables, hanging Edison-bulb lights softly blurred, a window with diffused daylight behind. Keep the subject, outfit, pose and identity exactly the same. Relight with warm interior tones — soft window light as key from one side, gentle amber bounce on the shadow side. Comfortable lifestyle mood, shallow depth of field so the cafe background is creamy bokeh, the clothing remains crisp and well-lit. Natural cozy color grade, fashion lifestyle catalog look.',
            needsImage: true,
            inputImages: '1 ảnh người mặc đồ',
            source: 'JimmyLv/awesome-nano-banana Case 72 (neutral warm ambient bg) + PicoTrex background relight',
        },
        {
            id: 'scene-nen-san-vuon',
            cat: 'scene',
            title: 'Đổi nền sân vườn xanh mát',
            prompt: 'Replace the background with a bright, airy garden: lush green foliage, a few soft pastel flowers, and dappled morning sunlight filtering through leaves. Keep the person, outfit, pose and face untouched. Relight to match outdoor garden daylight — soft natural key light, gentle dappled highlights, fresh cool-green ambient fill. Slight breeze feel in light fabric. Background pleasantly out of focus so the dress/outfit stays sharp and vivid. Fresh, feminine lifestyle fashion mood, clean natural color grading.',
            needsImage: true,
            inputImages: '1 ảnh người mặc đồ',
            source: "YouMind-OpenLab Profile/Avatar 'enchanted garden' setting + PicoTrex Case 94 relight",
        },
        {
            id: 'scene-phuc-hoi-anh-cu',
            cat: 'scene',
            title: 'Phục hồi & tô màu ảnh cũ',
            prompt: 'Restore and colorize this old, faded photo. Remove scratches, dust, creases and noise, repair any torn or missing areas seamlessly, and recover lost detail in faces, hair and fabric. Apply natural, realistic colors true to skin tones and likely clothing colors. Improve sharpness and dynamic range while keeping the result believable and not over-processed. Preserve the original composition, pose and identity exactly. High-resolution archival-quality restoration.',
            needsImage: true,
            inputImages: '1 ảnh cũ (mờ/ố/rách)',
            source: 'PicoTrex/Awesome-Nano-Banana-images Case 20 (restore + colorize) + Example 74 (high-res restoration)',
        },
        {
            id: 'scene-nang-net-anh-mo',
            cat: 'scene',
            title: 'Nâng nét & cải thiện ảnh mờ',
            prompt: 'Enhance this dull, low-quality photo. Increase resolution and sharpness, recover fine texture in fabric weave, hair and skin, reduce blur and digital noise. Boost contrast and dynamic range moderately, balance the colors and improve the lighting so the image looks richer and more professional — without making it look artificial or over-saturated. Keep the subject, outfit, pose, face and proportions exactly the same. Clean, crisp e-commerce-ready result.',
            needsImage: true,
            inputImages: '1 ảnh mờ/tối/chất lượng thấp',
            source: 'PicoTrex/Awesome-Nano-Banana-images Case 7 (auto enhance) + Example 74 (high-res)',
        },
        // ── avatar ──
        {
            id: 'avatar-studio-chan-dung',
            cat: 'avatar',
            title: 'Avatar studio chuyên nghiệp',
            prompt: "Create a polished professional studio headshot from this photo while keeping the person's exact facial identity, features and expression. Frame as a clean upper-body portrait on a smooth neutral grey-to-white gradient studio backdrop. Use soft three-point studio lighting: large softbox key at 45 degrees, gentle fill, subtle hair/rim light for separation, catchlights in the eyes. Flattering, natural skin retouching (keep pores and realism, no plastic look), crisp focus on the eyes, shallow depth of field. Refined, premium personal-brand avatar look, high resolution.",
            needsImage: true,
            inputImages: '1 ảnh chân dung (thấy rõ mặt)',
            source: 'JimmyLv Case 99 (editorial portrait) + YouMind Profile/Avatar studio lighting',
        },
        {
            id: 'avatar-anh-the',
            cat: 'avatar',
            title: 'Ảnh thẻ 3x4 nền xanh',
            prompt: "Crop the head and shoulders and create a clean 3x4 ID/passport photo while preserving the person's exact face and identity. Requirements: solid even blue background (#3A6EA5), professional business attire, frontal upright pose facing the camera, neutral-to-slight friendly expression, both ears and full face clearly visible, flat even lighting with no harsh shadows and no glare, sharp focus, accurate natural skin tone. Standard formal ID-photo composition, high resolution.",
            needsImage: true,
            inputImages: '1 ảnh chân dung rõ mặt, nhìn thẳng',
            source: 'PicoTrex/Awesome-Nano-Banana-images Case 63 (Create an ID Photo, blue background)',
        },
        {
            id: 'avatar-chan-dung-nghe-thuat-bw',
            cat: 'avatar',
            title: 'Chân dung nghệ thuật đen trắng',
            prompt: "Transform this photo into a high-end black-and-white fine-art editorial portrait while keeping the person's exact facial identity and expression. Dramatic directional studio lighting with deep rich blacks and luminous highlights, soft gradient dark background, elegant fashion-campaign mood. Fine film grain for an analog, tactile feel, smooth tonal transitions, sharp detail in the eyes. Sophisticated, magazine-cover aesthetic. High resolution.",
            needsImage: true,
            inputImages: '1 ảnh chân dung rõ mặt',
            source: "JimmyLv Case 99 (B&W editorial portrait) + YouMind 'Luxury Editorial B&W Portrait'",
        },
        {
            id: 'avatar-3d-chibi',
            cat: 'avatar',
            title: 'Avatar 3D chibi giữ khuôn mặt',
            prompt: "Create a cute stylized 3D chibi character based on this photo, accurately preserving the subject's recognizable facial features, hairstyle, and outfit colors. Big head, small body proportions, soft rounded forms, glossy toy-like 3D render with clean studio lighting and soft shadows on a simple pastel background. Friendly charming expression. Keep the look clearly recognizable as the same person. High-quality 3D render, collectible-figure aesthetic.",
            needsImage: true,
            inputImages: '1 ảnh chân dung/nửa người rõ mặt + trang phục',
            source: 'JimmyLv Case 75 (3D chibi preserving face) + PicoTrex Case 45/46 (identity-preserving figure)',
        },
        {
            id: 'avatar-anime-giu-mat',
            cat: 'avatar',
            title: 'Avatar phong cách anime giữ danh tính',
            prompt: "Convert this photo into a polished Japanese anime-style portrait while keeping the person's identity clearly recognizable — same face shape, hairstyle, hair color, and outfit. Clean cel-shaded anime illustration with expressive eyes, soft gradient shading, delicate line art, and a gentle bokeh background. Rich detail and realistic fabric texture rendered in anime style, warm flattering lighting. Keep proportions natural (not over-deformed). High-quality anime art, profile-avatar ready.",
            needsImage: true,
            inputImages: '1 ảnh chân dung rõ mặt + trang phục',
            source: 'PicoTrex Case 11/57 (anime conversion) + JimmyLv Case 96 (anime figure preserving face/posture)',
        },
        // ── layout ──
        {
            id: 'layout-flatlay-knolling-thoitrang',
            cat: 'layout',
            title: 'Flat-lay knolling outfit nữ (chụp từ trên xuống)',
            prompt: 'Một bức ảnh flat-lay knolling chụp thẳng từ trên xuống (top-down 90 độ), sắp xếp hoàn hảo một bộ outfit nữ trọn vẹn cho shop thời trang: 1 áo (sơ mi lụa kem hoặc áo thun cotton trắng) gấp gọn ở trung tâm, 1 chân váy/quần ống rộng, 1 túi xách da, 1 đôi giày, kính mát, dây chuyền mảnh, son môi, đồng hồ, vài cành hoa khô trang trí. Tất cả vật phẩm căn theo lưới 90 độ nghiêm ngặt, khoảng cách đều nhau, lề rộng thoáng. Nền giấy phẳng màu be sữa (#F3F0E9) chất liệu mịn như giấy mỹ thuật. Ánh sáng softbox phẳng từ trên cao, bóng đổ studio mềm mại, không chói, không phản sáng gắt. Bố cục cân đối, gọn gàng, thẩm mỹ sắp xếp tối giản kiểu tạp chí thời trang. Tỷ lệ khung hình 1:1, độ phân giải cao, màu sắc trung thực phục vụ thương mại điện tử. KHÔNG để vật thể nghiêng, chồng chéo, lộn xộn hay nhòe.',
            needsImage: false,
            inputImages: 'Không cần ảnh — text sang ảnh',
            source: "YouMind-OpenLab/awesome-nano-banana-pro-prompts (12.7K★) — README_vi-VN No. 97 'E-commerce Knolling Flat-Lay'",
        },
        {
            id: 'layout-bento-infographic-sanpham',
            cat: 'layout',
            title: 'Infographic Bento grid giới thiệu sản phẩm (kính lỏng)',
            prompt: "Tạo một ảnh infographic giới thiệu sản phẩm thời trang dạng lưới Bento bất đối xứng 6 mô-đun, phong cách kính lỏng (liquid glass) cao cấp kiểu Apple. Tỷ lệ ngang 16:9. Thẻ chính chiếm 30% hiển thị ảnh chụp thật của sản phẩm (ví dụ chiếc đầm/áo) trên nền sạch + nhãn tên sản phẩm; các thẻ còn lại trong suốt 85-90% với đường viền mỏng như sợi tóc và đổ bóng nhẹ tạo chiều sâu nổi. Nội dung các mô-đun bằng tiếng Việt: (1) Tên & ảnh sản phẩm, (2) '4 lý do nên mua' kèm icon, (3) 'Chất liệu' (vải, định lượng, co giãn), (4) 'Bảng size' S/M/L/XL, (5) 'Cách phối đồ' 3 gợi ý, (6) 'Bảo quản' kèm icon. Bảng màu lấy từ màu chủ đạo của sản phẩm, độ bão hòa dịu 30-40%, không dùng màu đen tuyền. Nền phía sau thẻ làm mờ cao, hiệu ứng ánh sáng nhẹ trừu tượng. Font sans-serif hiện đại, chữ tiếng Việt rõ nét, dấu thanh chính xác. Đầu ra 1 ảnh siêu cao cấp.",
            needsImage: false,
            inputImages: 'Không cần ảnh — text sang ảnh',
            source: "YouMind-OpenLab/awesome-nano-banana-pro-prompts (12.7K★) — README_vi-VN No. 2 'Bento liquid glass infographic'",
        },
        {
            id: 'layout-bangsize-infographic',
            cat: 'layout',
            title: 'Bảng size / hướng dẫn chọn size dạng infographic',
            prompt: "Tạo infographic 'Bảng Hướng Dẫn Chọn Size' cho shop thời trang nữ, tỷ lệ dọc 4:5, nền trắng kem sạch sẽ. Bố cục lưới gọn gàng kiểu bản vẽ kỹ thuật nhẹ nhàng: bên trái là hình minh họa body nữ line-art mảnh với các đường đo và mũi tên chỉ vị trí 'Vòng ngực', 'Vòng eo', 'Vòng mông', 'Chiều cao'. Bên phải là bảng size rõ ràng tiếng Việt với các hàng S / M / L / XL và cột số đo (cm) + cân nặng gợi ý. Phía trên tiêu đề serif 'CHỌN SIZE CHUẨN', phía dưới ghi chú nhỏ '* Sai số 1-2cm tùy dáng người' và icon dấu kiểm xanh 'Tư vấn miễn phí nếu phân vân'. Phối màu kem (#F3F0E9), terracotta (#D67052) cho tiêu đề và đường viền, độ bão hòa dịu, không màu đen tuyền. Font sans-serif sạch sẽ, các đường kẻ phân cách mảnh, icon tối giản. Chữ tiếng Việt dấu thanh chính xác, bố cục cân đối chuyên nghiệp.",
            needsImage: false,
            inputImages: 'Không cần ảnh — text sang ảnh',
            source: "PicoTrex/Awesome-Nano-Banana-images (23K★) Case 14 'Article Infographic' + README_vi-VN No.21 technical grid infographic",
        },
        // ── poster ──
        {
            id: 'poster-sale-50-thoitrang',
            cat: 'poster',
            title: 'Poster SALE 50% thời trang nữ (dọc)',
            prompt: "Thiết kế poster khuyến mãi thời trang nữ, tỷ lệ dọc 4:5. Bố cục: nửa trái là người mẫu nữ mặc đầm/áo mùa mới đứng tạo dáng tự tin, ánh sáng studio mềm có độ tương phản nhẹ; nửa phải là khối chữ. Tiêu đề lớn in đậm tiếng Việt 'SALE CUỐI MÙA' màu trắng nổi trên khối màu pastel hồng đào, ngay dưới là con số khổng lồ 'GIẢM 50%' kiểu chữ sans-serif đậm. Bên dưới dòng phụ 'Toàn bộ đầm & áo - Số lượng có hạn'. Góc dưới có nút CTA bo tròn 'MUA NGAY' và dòng nhỏ 'Áp dụng đến hết Chủ Nhật'. Phối màu kem (#F3F0E9), hồng đào (#E8A4A0) và terracotta (#D67052) làm điểm nhấn, tránh màu neon. Bố cục lưới rõ ràng, khoảng trắng hợp lý, phân cấp thị giác mạnh, chữ tiếng Việt dấu thanh chính xác. Thẩm mỹ chiến dịch thời trang cao cấp, sạch sẽ, hiện đại.",
            needsImage: false,
            inputImages: 'Không cần ảnh — text sang ảnh',
            source: "PicoTrex/Awesome-Nano-Banana-images (23K★) Example 25 'Golden Quote Card' + Example 98 'Movie Poster'",
        },
        {
            id: 'poster-banner-tet-thoitrang',
            cat: 'poster',
            title: 'Banner Tết bộ sưu tập áo dài / xuân (ngang)',
            prompt: "Thiết kế banner Tết Nguyên Đán cho shop thời trang nữ, tỷ lệ ngang 16:9. Không khí Tết Việt ấm áp: nền đỏ đô và vàng kim sang trọng, hoa mai vàng và hoa đào hồng nở rải hai góc, lì xì đỏ, câu đối, đèn lồng mờ ở hậu cảnh. Bên trái là người mẫu nữ mặc áo dài/đầm xuân thanh lịch tạo dáng duyên dáng. Bên phải khối chữ: tiêu đề thư pháp cách điệu 'CHÀO XUÂN 2026' màu vàng kim, dòng phụ 'Bộ Sưu Tập Áo Dài & Đầm Xuân', và dải ưu đãi 'Ưu đãi đến 40% - Quà tặng kèm đơn từ 500K'. Góc dưới nút 'ĐẶT HÀNG NGAY'. Ánh sáng vàng ấm, bóng đổ mềm, chiều sâu điện ảnh. Phối màu đỏ-vàng truyền thống đậm chất Tết nhưng tinh tế cao cấp, tránh lòe loẹt. Chữ tiếng Việt rõ nét, dấu thanh chuẩn, bố cục cân đối, phân cấp thị giác rõ.",
            needsImage: false,
            inputImages: 'Không cần ảnh — text sang ảnh',
            source: "PicoTrex/Awesome-Nano-Banana-images (23K★) Example 98 'Movie Poster' + README_vi-VN No.1 Tết motif",
        },
        {
            id: 'poster-social-vuong-newdrop',
            cat: 'poster',
            title: "Ảnh vuông social 'Hàng mới về' (Instagram/Facebook)",
            prompt: "Thiết kế ảnh đăng mạng xã hội tỷ lệ vuông 1:1 cho shop thời trang nữ, chủ đề 'New Arrivals'. Bố cục editorial kiểu tạp chí: ảnh sản phẩm áo/đầm mới chiếm 2/3 khung, đặt trên nền màu kem hoặc xanh bạc hà nhạt. Khối chữ tiếng Việt phía trên hoặc dưới: badge nhỏ bo tròn 'HÀNG MỚI VỀ', tiêu đề serif thanh lịch 'Bộ Sưu Tập Tháng 6', dòng phụ sans-serif 'Linen mát - Tông màu mùa hè', và mã/giá nhỏ ở góc. Một dấu chấm/đường kẻ mảnh làm điểm nhấn đồ họa. Ánh sáng studio dịu, bóng đổ mềm, màu sắc hài hòa pastel. Phối hợp 2 font: serif cho tiêu đề + sans-serif cho nội dung. Khoảng trắng rộng rãi, phân cấp thị giác rõ, thẩm mỹ thương hiệu thời trang tối giản hiện đại. Chữ tiếng Việt dấu thanh chính xác, sắc nét.",
            needsImage: false,
            inputImages: 'Không cần ảnh — text sang ảnh',
            source: "PicoTrex/Awesome-Nano-Banana-images (23K★) Example 5 'Warm Academic Humanism' + Example 25 quote card",
        },
        {
            id: 'poster-voucher-quatang',
            cat: 'poster',
            title: 'Voucher / phiếu quà tặng thời trang',
            prompt: "Thiết kế voucher (phiếu giảm giá) thời trang nữ dạng thẻ ngang tỷ lệ 16:9, phong cách tối giản sang trọng. Bố cục thẻ chữ nhật bo góc với cạnh răng cưa (perforated edge) một bên như vé thật. Nửa trái: khối màu terracotta/hồng đào đậm in số tiền lớn màu trắng 'GIẢM 100K', dòng nhỏ 'Cho đơn từ 300K'. Nửa phải nền kem (#F3F0E9): logo/tên shop ở trên, dòng 'PHIẾU QUÀ TẶNG' chữ serif thanh lịch, ô mã code 'Mã: N2-WELCOME' trong khung viền mảnh, và dòng điều kiện nhỏ 'Hạn dùng đến 31/12/2026 - Mỗi khách 1 lần'. Góc có hoa văn mảnh hoặc icon túi xách trang trí. Phối màu kem + terracotta (#D67052) + vàng mù tạt nhấn nhẹ, đường viền mảnh tinh tế, đổ bóng nhẹ tạo chiều sâu thẻ. Chữ tiếng Việt rõ nét, dấu thanh chuẩn, bố cục cân đối kiểu thẻ thành viên cao cấp.",
            needsImage: false,
            inputImages: 'Không cần ảnh — text sang ảnh',
            source: "PicoTrex/Awesome-Nano-Banana-images (23K★) Case 64 'A6 Folding Card' + Example 25 'Golden Quote Card'",
        },
        {
            id: 'poster-flashsale-countdown',
            cat: 'poster',
            title: 'Poster Flash Sale đếm ngược khung giờ vàng (dọc)',
            prompt: "Thiết kế poster Flash Sale 'Khung Giờ Vàng' cho shop thời trang nữ, tỷ lệ dọc 4:5, năng lượng mạnh và khẩn cấp nhưng vẫn cao cấp. Nền gradient hồng đào sang cam san hô ấm, vài tia sáng/đốm bokeh nhẹ. Trung tâm phía trên: badge tròn 'FLASH SALE' chữ trắng trên nền đỏ, tiêu đề khổng lồ in đậm 'GIỜ VÀNG 20H-22H'. Giữa khung: dãy đồng hồ đếm ngược dạng 4 ô vuông bo góc hiển thị '02 : 15 : 47 : 09' (Ngày:Giờ:Phút:Giây) màu trắng nổi bật. Dưới đó dòng 'Đồng giá 99K - 199K - 299K' và 'Freeship toàn quốc'. Vài món thời trang (áo, đầm, túi) sắp xếp nổi quanh khối chữ tạo chiều sâu. Góc dưới nút CTA bo tròn 'SĂN NGAY'. Phối màu hồng đào + cam san hô + trắng, điểm nhấn đỏ, đổ bóng mềm, phân cấp typography rất mạnh. Chữ tiếng Việt rõ nét, dấu thanh chuẩn, bố cục kịch tính cân đối.",
            needsImage: false,
            inputImages: 'Không cần ảnh — text sang ảnh',
            source: "PicoTrex/Awesome-Nano-Banana-images (23K★) Example 98 'Movie Poster' + Example 81 'Wanted Poster'",
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
        // ── Bổ sung từ awesome-chatgpt-prompts (f/awesome-chatgpt-prompts), Việt hoá cho shop ──
        {
            id: 'ads',
            title: '📣 Viết quảng cáo / chạy Ads',
            desc: 'Soạn nội dung quảng cáo, target, thông điệp cho chiến dịch Ads.',
            system:
                'Bạn là chuyên gia quảng cáo cho shop thời trang nữ N2Store. ' +
                'Nhận sản phẩm/mục tiêu → đề xuất: thông điệp chính, đối tượng nhắm (tuổi/sở thích), ' +
                '2-3 mẫu nội dung quảng cáo ngắn (cho Facebook/TikTok Ads), và call-to-action. ' +
                'Văn phong tiếng Việt thu hút, đúng tâm lý khách mua sắm online, KHÔNG cường điệu sai sự thật.',
        },
        {
            id: 'social',
            title: '📱 Quản lý nội dung mạng xã hội',
            desc: 'Lên lịch & ý tưởng bài đăng, story, reel cho fanpage/TikTok.',
            system:
                'Bạn là người quản lý mạng xã hội cho shop thời trang nữ N2Store. ' +
                'Đề xuất ý tưởng bài đăng/story/reel theo tuần, lịch đăng hợp lý, hook mở đầu bắt mắt, ' +
                'và cách tăng tương tác (câu hỏi, mini-game, trend). Trình bày ngắn gọn, thực tế, hợp thị trường VN.',
        },
        {
            id: 'namer',
            title: '🏷️ Đặt tên / tiêu đề sản phẩm',
            desc: 'Gợi ý tên gọi, tiêu đề SP hấp dẫn, chuẩn tìm kiếm.',
            system:
                'Bạn là chuyên gia đặt tên sản phẩm thời trang. Nhận mô tả sản phẩm → gợi ý 5-8 ' +
                'tên gọi/tiêu đề tiếng Việt ngắn gọn, dễ nhớ, gợi cảm xúc và chứa từ khoá khách hay tìm. ' +
                'Mỗi tên kèm 1 ghi chú ngắn vì sao hợp. KHÔNG đặt tên gây hiểu lầm chất lượng/giá.',
        },
        {
            id: 'upsell',
            title: '📈 Tư vấn upsell / bán kèm',
            desc: 'Gợi ý phối đồ, combo, bán thêm để tăng giá trị đơn.',
            system:
                'Bạn là trợ lý bán hàng giỏi upsell/cross-sell cho shop thời trang nữ N2Store. ' +
                'Khi khách quan tâm 1 sản phẩm, gợi ý cách phối đồ + sản phẩm bán kèm hợp lý + combo ưu đãi, ' +
                'lời tư vấn tự nhiên, khéo léo, KHÔNG ép. Mục tiêu tăng giá trị đơn mà khách vẫn thấy có lợi.',
        },
        {
            id: 'proofread',
            title: '🔤 Sửa chính tả / văn phong',
            desc: 'Rà soát, sửa lỗi chính tả & làm mượt văn phong tiếng Việt.',
            system:
                'Bạn là biên tập viên tiếng Việt. Nhận đoạn văn (caption/tin nhắn/mô tả) → sửa lỗi chính tả, ' +
                'ngữ pháp, dấu câu và làm mượt văn phong cho tự nhiên, chuyên nghiệp NHƯNG giữ nguyên ý + giọng shop. ' +
                'Chỉ trả về bản đã sửa (không giải thích trừ khi được hỏi).',
        },
        {
            id: 'translate',
            title: '🌐 Dịch Việt ↔ Anh (bán hàng)',
            desc: 'Dịch nội dung bán hàng giữ ngữ cảnh, tự nhiên.',
            system:
                'Bạn là biên dịch viên chuyên nội dung thương mại điện tử thời trang. ' +
                'Dịch giữa tiếng Việt và tiếng Anh, giữ đúng ngữ cảnh bán hàng, tự nhiên, hấp dẫn (không dịch máy cứng). ' +
                'Giữ thuật ngữ sản phẩm/size/chất liệu chính xác. Chỉ trả về bản dịch.',
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
        .aip-search-row{padding:8px 18px 2px;display:flex}
        .aip-search-row[hidden]{display:none!important}
        .aip-search{flex:1;height:38px;border:1px solid var(--web2-border,#e2e8f0);border-radius:10px;padding:0 12px;
            font:inherit;font-size:.86rem;background:var(--web2-bg,#f8fafc);color:var(--web2-text,#0f172a);outline:none}
        .aip-search:focus{border-color:var(--web2-primary,#6366f1);box-shadow:0 0 0 3px rgba(99,102,241,.14)}
        .aip-grid{flex:1 1 auto;min-height:0;overflow:auto;padding:12px 18px 18px;display:grid;
            grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;align-content:start}
        .aip-card{border:1px solid var(--web2-border,#e2e8f0);border-radius:12px;padding:12px;cursor:pointer;
            background:var(--web2-surface,#fff);transition:border-color .15s,transform .12s,box-shadow .15s;display:flex;flex-direction:column;gap:6px}
        /* KHÔNG dùng overflow:hidden ở card — grid item là scroll-container sẽ thu
           chiều cao track về body-only (62px) làm thumb 150px bị cắt. Bo góc ở .aip-thumb. */
        .aip-card.has-thumb{padding:0}
        .aip-card.has-thumb .aip-card-body{padding:10px 12px 12px;display:flex;flex-direction:column;gap:5px}
        .aip-card:hover{border-color:var(--web2-primary,#6366f1);transform:translateY(-2px);box-shadow:0 6px 18px rgba(99,102,241,.14)}
        .aip-thumb{position:relative;width:100%;height:150px;flex:0 0 auto;overflow:hidden;border-radius:11px 11px 0 0;background:var(--web2-bg,#f1f5f9)}
        .aip-thumb img{width:100%;height:100%;object-fit:cover;display:block}
        .aip-card h4{margin:0;font-size:.86rem;font-weight:700;line-height:1.3}
        .aip-card p{margin:0;font-size:.74rem;color:var(--web2-text-2,#64748b);line-height:1.4;
            display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        /* Hộp prompt đầy đủ (giống YouMind) — hiện nội dung câu lệnh cho user dễ hình dung. */
        .aip-prompt{font-size:.72rem;color:var(--web2-text-2,#475569);line-height:1.45;white-space:pre-wrap;
            background:var(--web2-bg,#f8fafc);border:1px solid var(--web2-border,#eef2f7);border-radius:8px;
            padding:7px 9px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
        .aip-inputs{font-size:.68rem;color:var(--web2-text-2,#b45309);background:#fffbeb;border:1px solid #fde68a;
            border-radius:7px;padding:5px 8px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .aip-use{margin-top:1px;border:none;border-radius:8px;background:var(--web2-primary,#6366f1);color:#fff;
            font-weight:600;font-size:.76rem;padding:8px 10px;cursor:pointer;width:100%;transition:filter .12s}
        .aip-use:hover{filter:brightness(1.08)}
        .aip-loadmore{grid-column:1/-1;text-align:center;color:var(--web2-text-3,#94a3b8);font-size:.74rem;padding:8px 0 2px}
        .aip-tag{align-self:flex-start;font-size:.66rem;padding:2px 8px;border-radius:999px;background:#eef2ff;color:#4f46e5;font-weight:600}
        .aip-tag.need{background:#fef3c7;color:#b45309}
        .aip-tag.on-thumb{position:absolute;top:6px;left:6px;background:rgba(255,255,255,.92);box-shadow:0 1px 4px rgba(0,0,0,.18)}
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
    // Chuẩn hoá để tìm kiếm: thường + bỏ dấu tiếng Việt (gõ "ao" khớp "áo").
    function _norm(s) {
        return String(s == null ? '' : s)
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/đ/g, 'd');
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
            <div class="aip-search-row" data-aip-search-row><input type="search" class="aip-search" data-aip-search placeholder="🔎 Tìm câu lệnh theo tên / nội dung…"></div>
            <div class="aip-grid" data-aip-grid></div>
        </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', (e) => {
            if (e.target === ov || e.target.closest('[data-aip-x]')) close();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && ov.classList.contains('open')) close();
        });
        // Cuộn gần đáy → nạp thêm batch (infinite scroll). Handler đặt 1 lần, gọi
        // callback `_loadMore` mà pickImage gán (passive cho mượt — MODAL-ANTI-LAG).
        const grid = ov.querySelector('[data-aip-grid]');
        grid.addEventListener(
            'scroll',
            () => {
                if (
                    grid._loadMore &&
                    grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 140
                ) {
                    grid._loadMore();
                }
            },
            { passive: true }
        );
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
        let query = '';
        const catBox = ov.querySelector('[data-aip-cats]');
        const grid = ov.querySelector('[data-aip-grid]');
        const searchRow = ov.querySelector('[data-aip-search-row]');
        const searchInput = ov.querySelector('[data-aip-search]');
        if (searchRow) searchRow.hidden = false;
        if (searchInput) {
            searchInput.value = '';
            searchInput.oninput = () => {
                query = _norm(searchInput.value.trim());
                renderGrid();
            };
        }
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
        // ── Render theo batch (infinite scroll) — cuộn gần đáy nạp thêm ──
        const PAGE = 9; // số card mỗi batch
        let curList = [];
        let shown = 0;
        function cardHtml(p) {
            const tag = `<span class="aip-tag ${p.needsImage ? 'need' : ''}${p.thumb ? ' on-thumb' : ''}">${p.needsImage ? '🖼 cần ảnh gốc' : '✏️ tạo mới'}</span>`;
            const thumb = p.thumb
                ? `<div class="aip-thumb"><img src="${_esc(p.thumb)}" alt="" loading="lazy" onerror="this.style.display='none'">${tag}</div>`
                : tag;
            return `<div class="aip-card ${p.thumb ? 'has-thumb' : ''}" data-id="${_esc(p.id)}">
                ${thumb}
                <div class="aip-card-body">
                    <h4>${_esc(p.title)}</h4>
                    <div class="aip-prompt" title="${_esc(p.prompt)}">${_esc(p.prompt)}</div>
                    ${p.inputImages ? `<div class="aip-inputs" title="${_esc(p.inputImages)}">🖼 ${_esc(p.inputImages)}</div>` : ''}
                    <button type="button" class="aip-use">✨ Dùng mẫu này</button>
                </div>
            </div>`;
        }
        function syncMoreHint() {
            const old = grid.querySelector('.aip-loadmore');
            if (old) old.remove();
            if (shown < curList.length) {
                const d = document.createElement('div');
                d.className = 'aip-loadmore';
                d.textContent = `↓ Cuộn để xem thêm (${curList.length - shown} mẫu)`;
                grid.appendChild(d);
            }
        }
        function appendBatch() {
            const slice = curList.slice(shown, shown + PAGE);
            if (!slice.length) return;
            const tmp = document.createElement('div');
            tmp.innerHTML = slice.map(cardHtml).join('');
            const hint = grid.querySelector('.aip-loadmore');
            while (tmp.firstChild) grid.insertBefore(tmp.firstChild, hint);
            shown += slice.length;
            syncMoreHint();
        }
        function renderGrid() {
            curList = active === 'all' ? items : items.filter((p) => p.cat === active);
            if (query)
                curList = curList.filter((p) =>
                    (_norm(p.title) + ' ' + _norm(p.prompt)).includes(query)
                );
            shown = 0;
            grid.scrollTop = 0;
            if (!curList.length) {
                grid.innerHTML = '<div class="aip-empty">Không có mẫu phù hợp</div>';
                return;
            }
            grid.innerHTML = '';
            appendBatch();
        }
        // Click 1 card (cả nút "Dùng mẫu này") → áp dụng. Delegation đặt 1 lần.
        grid.onclick = (e) => {
            const el = e.target.closest('[data-id]');
            if (!el) return;
            const p = items.find((x) => x.id === el.dataset.id);
            if (p) {
                close();
                cb(p.prompt, p);
            }
        };
        grid._loadMore = appendBatch; // bật infinite-scroll cho lần mở này
        renderCats();
        renderGrid();
        ov.classList.add('open');
    }

    function pickRole(cb) {
        const ov = _ensureOverlay();
        ov.querySelector('[data-aip-title]').textContent = 'Chọn vai trò cho AI';
        ov.querySelector('[data-aip-cats]').innerHTML = '';
        const searchRow = ov.querySelector('[data-aip-search-row]');
        if (searchRow) searchRow.hidden = true;
        const grid = ov.querySelector('[data-aip-grid]');
        grid._loadMore = null; // tắt infinite-scroll của pickImage
        grid.onclick = null; // gỡ delegation ảnh để không bắt nhầm card vai trò
        grid.scrollTop = 0;
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

    const api = {
        image: IMAGE,
        roles: ROLES,
        cats: CATS,
        DEFAULT_ROLE,
        pickImage,
        pickRole,
        close,
    };
    // Shared module (web2/shared) — tên `Web2AiPresets` theo convention; giữ alias `AiPresets`
    // cho ai-hub (back-compat). Trang khác (fb-posts/video-maker) gọi được luôn khi autoload.
    global.Web2AiPresets = api;
    global.AiPresets = api;
})(window);
