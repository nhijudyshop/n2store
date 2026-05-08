// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// AIKOL PROMPT GENERATOR — local template combinator
//
// Tạo prompt portrait đa dạng cho Gemini Image gen. Logic combination từ
// pool đặc trưng: demographics × outfit × lighting × backdrop × framing ×
// style. Mỗi vibe (beauty/lifestyle/business/fitness/luxury) có pool
// riêng để giữ coherence (vibe beauty không pair tailored business suit).
//
// Pure JS — no API calls, instant. Output: tiếng Anh (Gemini hiệu quả hơn).
// =====================================================

(function (global) {
    'use strict';

    // Pick random element from array
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const shuffle = (arr) => arr.slice().sort(() => Math.random() - 0.5);

    // ===== Pools =====
    const AGE_RANGES = {
        female: ['age 22', 'age 24', 'age 26', 'age 28', 'age 30', 'in her late 20s'],
        male: ['age 24', 'age 27', 'age 30', 'age 32', 'age 35', 'in his early 30s'],
    };

    const ETHNICITY = [
        'Vietnamese',
        'Vietnamese with subtle East Asian features',
        'Southeast Asian Vietnamese',
        'modern urban Vietnamese',
    ];

    const HAIR_FEMALE = [
        'long flowing black hair',
        'shoulder-length wavy hair with center part',
        'sleek straight black hair pulled into a low ponytail',
        'soft layered bob with side bangs',
        'voluminous wavy hair with subtle highlights',
        'short pixie cut with face-framing fringe',
        'half-up half-down style with loose waves',
        'elegant chignon updo',
    ];
    const HAIR_MALE = [
        'short side-parted hair, neatly groomed',
        'modern textured crop with slight quiff',
        'short slick-back style',
        'natural medium-length hair, casually tousled',
        'taper fade with longer top',
        'clean undercut with combed-over top',
    ];

    const VIBES = {
        beauty: {
            label: 'Beauty / Cosmetic',
            outfit: {
                female: [
                    'minimal cream silk blouse',
                    'off-white satin top with delicate jewelry',
                    'soft pastel ribbed knit sweater',
                    'sheer chiffon top in blush tone',
                ],
                male: [
                    'crisp white tee with thin gold chain',
                    'minimal beige knit top',
                    'soft cream cashmere sweater',
                ],
            },
            makeup: [
                'dewy glass-skin makeup, soft glossy lips',
                'natural fresh-faced makeup, peach-toned cheeks',
                'glowing nude makeup, subtle shimmer eyeshadow',
            ],
            lighting: [
                'beauty ring light, soft even illumination',
                'soft north-facing window light, glowing skin',
                'clean studio softbox, even key light, no harsh shadows',
            ],
            backdrop: [
                'plain pastel pink studio backdrop',
                'soft cream gradient backdrop',
                'minimalist neutral beige backdrop',
                'clean white seamless paper backdrop',
            ],
            framing: [
                'tight beauty close-up shot',
                'head-and-shoulders portrait',
                'shoulder-up beauty headshot',
            ],
            mood: [
                'serene confident expression',
                'gentle inviting smile',
                'soft contemplative gaze',
            ],
        },
        lifestyle: {
            label: 'Lifestyle / Daily',
            outfit: {
                female: [
                    'casual oversized cream knit sweater',
                    'simple white t-shirt and denim jacket',
                    'flowy summer dress in muted tones',
                    'cozy beige cardigan over white tee',
                ],
                male: [
                    'casual gray hoodie',
                    'plain white tee with denim jacket',
                    'olive utility shirt rolled at sleeves',
                    'navy crewneck sweatshirt',
                ],
            },
            makeup: [
                'natural everyday makeup',
                'fresh barely-there makeup',
                'no-makeup makeup look',
            ],
            lighting: [
                'warm golden hour light streaming through window',
                'soft afternoon daylight, slightly hazy',
                'natural overcast daylight, even tones',
                'cozy interior tungsten light',
            ],
            backdrop: [
                'cozy café interior, soft bokeh background',
                'modern apartment with plants in soft focus',
                'sun-drenched bedroom with white linens, blurred',
                'minimalist living room, defocused warm tones',
                'urban street with bokeh of city lights',
            ],
            framing: [
                'half-body portrait',
                'environmental candid composition',
                'medium shot, slight environmental context',
            ],
            mood: [
                'relaxed candid expression',
                'soft natural smile, looking off-camera',
                'thoughtful daydreaming look',
            ],
        },
        business: {
            label: 'Business / Professional',
            outfit: {
                female: [
                    'tailored beige blazer over white blouse',
                    'sharp navy blazer with crisp white shirt',
                    'minimalist black blazer over silk camisole',
                    'pearl-toned silk blouse with subtle gold accessories',
                ],
                male: [
                    'navy tailored suit with white dress shirt',
                    'charcoal blazer over light blue oxford shirt',
                    'sharp black suit with subtle tie',
                    'modern slim-fit gray blazer over white tee',
                ],
            },
            makeup: ['polished professional makeup', 'minimal natural makeup, defined brows'],
            lighting: [
                'corporate softbox lighting, balanced and clean',
                'cinematic three-point studio lighting',
                'modern office natural light through floor-to-ceiling window',
            ],
            backdrop: [
                'sleek modern office, blurred glass walls',
                'minimalist studio with neutral gray backdrop',
                'corporate boardroom with shallow depth of field',
                'urban cityscape skyline through window, defocused',
            ],
            framing: [
                'professional headshot',
                'corporate portrait, head and shoulders',
                'half-body executive portrait',
            ],
            mood: [
                'confident assertive expression',
                'warm professional smile',
                'composed authoritative gaze',
            ],
        },
        fitness: {
            label: 'Fitness / Sport',
            outfit: {
                female: [
                    'matching athleisure set in slate gray',
                    'sports bra and high-waist leggings, neutral tones',
                    'oversized workout tee with bike shorts',
                    'modern activewear in monochrome black',
                ],
                male: [
                    'fitted athletic tank top, neutral gym shorts',
                    'compression long-sleeve in slate, joggers',
                    'oversized vintage gym tee, training shorts',
                ],
            },
            makeup: [
                'fresh sweaty natural look, minimal makeup',
                'no makeup, healthy glowing skin',
            ],
            lighting: [
                'dramatic gym studio lighting, light rim from behind',
                'cinematic side-light, defined muscle tone',
                'golden hour outdoor sunset light',
                'moody dim gym ambient with key light',
            ],
            backdrop: [
                'modern gym interior, blurred equipment background',
                'concrete training studio with soft bokeh',
                'urban rooftop at sunset, sky in background',
                'outdoor track at dusk, defocused stadium',
            ],
            framing: [
                'three-quarter body sport portrait',
                'half-body action-ready stance',
                'dynamic mid-shot',
            ],
            mood: [
                'focused determined gaze',
                'confident athletic posture',
                'energetic post-workout glow',
            ],
        },
        luxury: {
            label: 'Luxury / Editorial',
            outfit: {
                female: [
                    'silk áo dài in deep emerald green with gold embroidery',
                    'tailored black evening gown with subtle pearl accents',
                    'cream cashmere coat over silk slip dress',
                    'modern Vietnamese áo dài in burgundy',
                    'minimalist designer black blazer with statement gold earrings',
                ],
                male: [
                    'tailored black tuxedo with bow tie',
                    'classic three-piece charcoal suit',
                    'modern Vietnamese áo dài for men in deep navy',
                    'cream double-breasted blazer over black turtleneck',
                ],
            },
            makeup: [
                'editorial high-fashion makeup, defined contour',
                'classic red lip with sleek eyeliner',
                'sophisticated smoky eye',
            ],
            lighting: [
                'cinematic moody chiaroscuro lighting',
                'editorial fashion magazine lighting, dramatic key light',
                'soft directional studio light with deep shadows',
                'warm golden ambient with single accent light',
            ],
            backdrop: [
                'opulent hotel lobby with chandelier bokeh',
                'velvet draped studio backdrop in deep tones',
                'classical architecture interior, defocused marble',
                'Vietnamese traditional setting with hanging lanterns',
                'minimalist black gallery wall',
            ],
            framing: [
                'editorial fashion portrait',
                'three-quarter elegant pose',
                'tight portrait with strong negative space',
            ],
            mood: [
                'poised aloof expression',
                'mysterious confident gaze',
                'sophisticated knowing smile',
            ],
        },
        casual: {
            label: 'Casual / Streetwear',
            outfit: {
                female: [
                    'oversized vintage band tee with mom jeans',
                    'cropped hoodie with cargo pants',
                    'bucket hat with relaxed flannel shirt',
                    'streetwear hoodie with statement chain',
                ],
                male: [
                    'oversized graphic tee with baggy jeans',
                    'cropped bomber jacket with techwear pants',
                    'vintage windbreaker with casual joggers',
                    'streetwear hoodie with denim jacket',
                ],
            },
            makeup: ['minimal urban makeup', 'natural fresh look'],
            lighting: [
                'urban natural daylight, slight shadows',
                'cinematic overcast street light',
                'neon street signs creating colorful rim light',
                'late afternoon golden hour street light',
            ],
            backdrop: [
                'graffiti-covered alley with bokeh',
                'urban street crossing, blurred pedestrians',
                'vintage Saigon district 1 street, soft focus',
                'modern Hanoi old quarter alley',
                'neon-lit night market street',
            ],
            framing: [
                'half-body street portrait',
                'casual environmental shot',
                'three-quarter urban candid',
            ],
            mood: [
                'cool confident street vibe',
                'casual relaxed expression',
                'playful candid mood',
            ],
        },
    };

    // Universal quality terms always appended
    const QUALITY = [
        'photorealistic, ultra detailed',
        'professional photography, sharp focus, high detail',
        '85mm lens, shallow depth of field, photorealistic',
        'editorial photo, sharp focus, ultra detailed skin texture',
        'cinematic photography, sharp focus, professional grade',
    ];

    /**
     * Generate a single coherent portrait prompt.
     * @param {object} opts
     * @param {'female'|'male'} [opts.gender='female']
     * @param {string} [opts.vibe] - vibe key; random if omitted
     * @returns {string}
     */
    function generateOne(opts) {
        const o = opts || {};
        const gender = o.gender === 'male' ? 'male' : 'female';
        const vibeKey = o.vibe && VIBES[o.vibe] ? o.vibe : pick(Object.keys(VIBES));
        const vibe = VIBES[vibeKey];

        const subj = gender === 'female' ? 'A Vietnamese woman' : 'A Vietnamese man';
        const age = pick(AGE_RANGES[gender]);
        const hair = pick(gender === 'female' ? HAIR_FEMALE : HAIR_MALE);
        const outfit = pick(vibe.outfit[gender]);
        const makeup = vibe.makeup ? pick(vibe.makeup) : null;
        const mood = pick(vibe.mood);
        const lighting = pick(vibe.lighting);
        const backdrop = pick(vibe.backdrop);
        const framing = pick(vibe.framing);
        const quality = pick(QUALITY);

        const parts = [
            subj,
            age,
            `with ${hair}`,
            `wearing ${outfit}`,
            gender === 'female' && makeup ? makeup : null,
            mood,
            lighting,
            `${backdrop} background`,
            framing,
            quality,
        ].filter(Boolean);

        return parts.join(', ');
    }

    /**
     * Generate N distinct prompts. If both gender + vibe specified, varies the
     * sub-elements (hair, outfit, lighting, backdrop) to avoid duplicates.
     * @param {object} opts
     * @param {number} [opts.count=6]
     * @param {'female'|'male'|'all'} [opts.gender='all']
     * @param {string} [opts.vibe='all']
     * @returns {Array<{prompt: string, vibe: string, vibeLabel: string, gender: string}>}
     */
    function generateMany(opts) {
        const o = opts || {};
        const count = Math.max(1, Math.min(o.count || 6, 12));
        const wantedGender = o.gender || 'all';
        const wantedVibe = o.vibe || 'all';
        const out = [];
        const seen = new Set();

        const vibeKeys = wantedVibe === 'all' ? Object.keys(VIBES) : [wantedVibe];
        const genders = wantedGender === 'all' ? ['female', 'male'] : [wantedGender];

        // Try to spread vibes across results when 'all'
        const orderedVibes = shuffle(vibeKeys);
        let attempts = 0;
        while (out.length < count && attempts < count * 6) {
            const v = orderedVibes[out.length % orderedVibes.length] || pick(vibeKeys);
            const g = pick(genders);
            const prompt = generateOne({ gender: g, vibe: v });
            const key = prompt.slice(0, 40);
            if (!seen.has(key)) {
                seen.add(key);
                out.push({
                    prompt,
                    vibe: v,
                    vibeLabel: VIBES[v].label,
                    gender: g,
                });
            }
            attempts++;
        }
        return out;
    }

    function listVibes() {
        return Object.keys(VIBES).map((k) => ({ key: k, label: VIBES[k].label }));
    }

    // ===== Scene Note Generator =====
    // Output: ngắn gọn, dùng làm "Note" addendum trong generate-panel + bulk
    // (Fal.ai image clone + Kling video clone). Khác với generateOne (portrait
    // mô tả full subject), scene note CHỈ thêm context scene/atmosphere/light
    // để rewrite cảnh quay model vào.
    const SCENE_LOCATIONS = {
        cafe: [
            'cozy Saigon café with warm tungsten light',
            'modern minimalist café, exposed concrete walls',
            'rustic specialty coffee shop, wooden interior',
            'rooftop café overlooking the city skyline',
        ],
        street: [
            'bustling Saigon district 1 street at dusk',
            'narrow Hanoi old quarter alley with hanging lanterns',
            'wet rainy night street, neon reflections on pavement',
            'morning Saigon street market with fresh produce',
            'modern Hồ Chí Minh boulevard at golden hour',
        ],
        nature: [
            'beach at sunset with soft pastel sky',
            'lush tropical garden with morning mist',
            'mountain viewpoint with rolling clouds',
            'rice paddy field at golden hour, Hội An',
            'pine forest with sun rays through trees',
        ],
        indoor: [
            'modern apartment with soft natural daylight',
            'minimalist studio with white drapery',
            'cozy bedroom with sheer white curtains',
            'industrial loft with concrete and warm wood',
            'traditional Vietnamese house with wooden beams',
        ],
        urban: [
            'sleek modern office with floor-to-ceiling windows',
            'rooftop terrace at blue hour, city lights below',
            'contemporary art gallery, white walls and high ceilings',
            'underground parking with dramatic neon strip lights',
            'luxury hotel lobby with marble and chandeliers',
        ],
        editorial: [
            'high-fashion editorial set, deep moody backdrop',
            'minimalist black gallery, single key spotlight',
            'monochrome white seamless studio',
            'warm sepia-toned vintage interior',
        ],
    };

    const SCENE_LIGHTING = [
        'soft golden hour light',
        'warm afternoon sunlight through window',
        'cool blue hour ambient',
        'dramatic chiaroscuro side light',
        'cinematic three-point lighting',
        'overcast natural daylight, soft shadows',
        'neon-lit moody atmosphere',
        'beauty ring light, even glow',
    ];

    const SCENE_MOOD = [
        'cozy intimate atmosphere',
        'dreamy ethereal mood',
        'confident editorial energy',
        'serene contemplative tone',
        'vibrant playful vibe',
        'sophisticated luxurious feel',
        'candid documentary realism',
        'cinematic dramatic atmosphere',
    ];

    const SCENE_COLOR = [
        'warm earth tones',
        'cool cinematic teal-and-orange',
        'soft pastel palette',
        'high-contrast monochrome',
        'rich saturated jewel tones',
        'muted vintage film aesthetic',
        'clean minimalist neutrals',
    ];

    const VIDEO_CAMERA = [
        'slow dolly-in toward subject',
        'gentle pan from left to right',
        'static shot with subtle handheld feel',
        'slow zoom out revealing scene',
        'cinematic tracking shot',
        'high-angle establishing shot then settle',
    ];

    /**
     * Generate a scene/atmosphere note for image or video generation.
     * Output ~60-160 chars, fits the 500-char Note limit comfortably and
     * combines: location × lighting × mood × color (+ camera for video).
     *
     * @param {object} [opts]
     * @param {'image'|'video'} [opts.type='image']
     * @param {string} [opts.locationSet] - one of cafe/street/nature/indoor/urban/editorial
     * @returns {string}
     */
    function generateSceneNote(opts) {
        const o = opts || {};
        const type = o.type === 'video' ? 'video' : 'image';
        const locKey =
            o.locationSet && SCENE_LOCATIONS[o.locationSet]
                ? o.locationSet
                : pick(Object.keys(SCENE_LOCATIONS));
        const location = pick(SCENE_LOCATIONS[locKey]);
        const lighting = pick(SCENE_LIGHTING);
        const mood = pick(SCENE_MOOD);
        const color = pick(SCENE_COLOR);

        const parts = [location, lighting, mood, color];
        if (type === 'video') parts.push(pick(VIDEO_CAMERA));
        return parts.join(', ');
    }

    function generateSceneNotes(opts) {
        const o = opts || {};
        const count = Math.max(1, Math.min(o.count || 6, 12));
        const type = o.type === 'video' ? 'video' : 'image';
        const out = [];
        const seen = new Set();
        const locKeys = shuffle(Object.keys(SCENE_LOCATIONS));
        let i = 0;
        let attempts = 0;
        while (out.length < count && attempts < count * 6) {
            const locationSet = locKeys[i % locKeys.length];
            const note = generateSceneNote({ type, locationSet });
            const key = note.slice(0, 30);
            if (!seen.has(key)) {
                seen.add(key);
                out.push({ note, locationSet });
                i++;
            }
            attempts++;
        }
        return out;
    }

    function listLocationSets() {
        const labels = {
            cafe: 'Cafe / Quán',
            street: 'Đường phố VN',
            nature: 'Thiên nhiên',
            indoor: 'Trong nhà',
            urban: 'Đô thị / Office',
            editorial: 'Editorial studio',
        };
        return Object.keys(SCENE_LOCATIONS).map((k) => ({ key: k, label: labels[k] || k }));
    }

    global.aikolPromptGenerator = {
        generateOne,
        generateMany,
        listVibes,
        generateSceneNote,
        generateSceneNotes,
        listLocationSets,
    };
})(typeof window !== 'undefined' ? window : globalThis);
