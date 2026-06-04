// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// Web 2.0 — Delivery method picker (Vietnam-aware)
// =====================================================
//
// Goal: parse a customer address string (free-text) and auto-pick the
// best matching delivery option from a configurable list.
//
// Each option carries `keywords` (district / quận / huyện hints). The
// address is normalized (lowercased, diacritics stripped, Q1→quan 1
// expanded) then scanned for each keyword. The option with the most
// keyword hits wins; ties broken by option order (first wins).
// If nothing matches, falls back to the option marked `isFallback`.
//
// API:
//   window.DeliveryMethodPicker.OPTIONS                  → default list
//   window.DeliveryMethodPicker.pick(address, options?)  → option (or null)
//   window.DeliveryMethodPicker.normalize(s)             → utility
//
// Third-party note: for advanced geocoding (typo tolerance, lat/lng,
// auto-completion), integrate Goong Maps API (https://goong.io —
// free 100k req/day, VN-localised). Inject result into `address`
// before calling `pick()` and the keyword match works the same.

(function () {
    'use strict';

    if (window.DeliveryMethodPicker) return; // idempotent

    // Default option set — matches the TPOS dropdown user provided.
    // Admin/UI can override by passing a custom `options` array to pick().
    // Order matters when keyword counts tie: earlier wins.
    const OPTIONS = [
        { value: 'thanh-pho-gop', label: 'THÀNH PHỐ GỘP', short: 'TP Gộp', manual: true, price: 0 },
        { value: 'tinh-gop', label: 'TỈNH GỘP', short: 'Tỉnh Gộp', manual: true, price: 0 },
        { value: 'ban-hang-shop', label: 'BÁN HÀNG SHOP', short: 'Shop', manual: true, price: 0 },
        {
            value: 'tp-bien',
            label: 'THÀNH PHỐ (Bình Chánh- Q9, Nhà Bè, Hốc Môn)',
            short: 'TP·Ven (35k)',
            price: 35000,
            // Outer districts of HCMC
            keywords: ['binh chanh', 'q9', 'quan 9', 'nha be', 'hoc mon'],
        },
        {
            value: 'tp-q2-12-bt-tdu',
            label: 'THÀNH PHỐ (Q2-12-Bình Tân-Thủ Đức)',
            short: 'TP·Q2-12-BT-TĐ (30k)',
            price: 30000,
            keywords: ['q2', 'quan 2', 'q12', 'quan 12', 'binh tan', 'thu duc'],
        },
        {
            value: 'tp-trung-tam',
            label: 'THÀNH PHỐ (1 3 4 5 6 7 8 10 11 Phú Nhuận, Bình Thạnh, Tân Phú, Tân Bình, Gò Vấp)',
            short: 'TP·Trung tâm (20k)',
            price: 20000,
            // Inner districts of HCMC
            keywords: [
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
            ],
        },
        // Fallback when no district keyword matches — out-of-HCMC shipments.
        {
            value: 'ship-tinh',
            label: 'SHIP TỈNH',
            short: 'Ship Tỉnh (35k)',
            price: 35000,
            isFallback: true,
        },
    ];

    // Strip Vietnamese diacritics + lowercase + collapse whitespace + normalize
    // common district abbreviations (Q.1 → quan 1, P.5 → phuong 5, etc.).
    function normalize(s) {
        if (s == null) return '';
        let out = String(s)
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '') // remove combining marks
            .replace(/đ/g, 'd');
        // Expand abbreviations BEFORE removing punctuation so "Q.12" becomes "quan 12"
        out = out
            .replace(/\bq\.?\s*(\d{1,2})\b/g, 'quan $1 q$1') // both forms for keyword match
            .replace(/\bp\.?\s*(\d{1,2})\b/g, 'phuong $1')
            .replace(/\bh\.?\s*(\D)/g, 'huyen $1') // h. → huyen (only if next char non-digit)
            .replace(/\btp\.?\s*hcm\b/g, 'tphcm')
            .replace(/\btp\.?\s*ho\s+chi\s+minh\b/g, 'tphcm');
        // Replace non-word with spaces, then collapse
        out = out
            .replace(/[^a-z0-9]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return out;
    }

    // Word-boundary search — avoid substring false positives (e.g. keyword
    // "q1" inside "q10"). We rely on the normalised whitespace separators.
    function hasKeyword(haystackTokens, needle) {
        if (!needle) return false;
        const parts = needle.split(/\s+/);
        // Slide a window over tokens
        for (let i = 0; i <= haystackTokens.length - parts.length; i++) {
            let ok = true;
            for (let j = 0; j < parts.length; j++) {
                if (haystackTokens[i + j] !== parts[j]) {
                    ok = false;
                    break;
                }
            }
            if (ok) return true;
        }
        return false;
    }

    /**
     * Pick the best matching delivery option for a given address.
     * @param {string} address - free-text address (may contain diacritics)
     * @param {Array} options - optional override of OPTIONS
     * @returns {{option: object, hits: number, matched: string[]}|null}
     */
    function pick(address, options) {
        const opts = options || OPTIONS;
        const norm = normalize(address);
        const tokens = norm ? norm.split(' ') : [];

        let best = null;
        let bestHits = 0;
        let bestMatched = [];

        for (const opt of opts) {
            if (opt.manual || opt.isFallback || !Array.isArray(opt.keywords)) continue;
            const matched = opt.keywords.filter((k) => hasKeyword(tokens, normalize(k)));
            if (matched.length > bestHits) {
                best = opt;
                bestHits = matched.length;
                bestMatched = matched;
            }
        }

        if (best) return { option: best, hits: bestHits, matched: bestMatched };

        // No district match → fallback
        const fallback = opts.find((o) => o.isFallback);
        return fallback ? { option: fallback, hits: 0, matched: [] } : null;
    }

    // Backend-loaded options (replaces hardcoded OPTIONS when fetch succeeds).
    // Single source of truth = /api/web2/deliveryzone/list — entity RIÊNG cho
    // vùng giao hàng (KHÔNG dùng `deliverycarrier` vì entity đó bị TPOS sync
    // ghi đè record không có keyword/fee). Admin quản lý ở web2/delivery-zone/.
    const BACKEND_ENTITY = 'deliveryzone';
    let _liveOptions = null; // set on successful fetch
    let _liveOptionsPromise = null;

    // keywords có thể là array (seed) hoặc chuỗi phân tách , / xuống dòng / ;
    // (nhập từ textarea ở trang cấu hình) → luôn chuẩn hoá về array.
    function _parseKeywords(k) {
        if (Array.isArray(k)) return k.map((s) => String(s).trim()).filter(Boolean);
        if (typeof k === 'string')
            return k
                .split(/[,\n;]+/)
                .map((s) => s.trim())
                .filter(Boolean);
        return [];
    }
    function _normalizeFromRecord(rec) {
        const d = rec.data || {};
        return {
            value: rec.code,
            label: rec.name || d.Name || rec.code,
            short: d.short || '',
            price: Number(d.fee || 0),
            keywords: _parseKeywords(d.keywords),
            manual: !!d.manual,
            isFallback: !!d.isFallback,
        };
    }

    async function fetchFromBackend(workerUrl) {
        if (_liveOptions) return _liveOptions;
        if (_liveOptionsPromise) return _liveOptionsPromise;
        const base =
            workerUrl ||
            window.API_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev';
        _liveOptionsPromise = (async () => {
            try {
                const r = await fetch(
                    `${base}/api/web2/${BACKEND_ENTITY}/list?limit=100&activeOnly=true`
                );
                const data = await r.json();
                if (!data?.success || !Array.isArray(data.records)) return null;
                // Filter rows that have any price/keyword/manual/isFallback hint
                // (skips legacy rows that never got seeded with fee). Records
                // are returned newest-first; sort by Id ASC for deterministic order.
                const opts = data.records
                    .map(_normalizeFromRecord)
                    .filter(
                        (o) =>
                            o.label &&
                            (o.price > 0 || o.manual || o.isFallback || o.keywords.length)
                    )
                    .sort((a, b) => {
                        // manuals first, then zones by price asc, then fallback last
                        if (a.manual !== b.manual) return a.manual ? -1 : 1;
                        if (a.isFallback !== b.isFallback) return a.isFallback ? 1 : -1;
                        return a.price - b.price;
                    });
                _liveOptions = opts.length ? opts : null;
                return _liveOptions;
            } catch (e) {
                console.warn('[DeliveryMethodPicker] backend fetch failed:', e.message);
                return null;
            }
        })();
        return _liveOptionsPromise;
    }

    // Async variant: tries backend first, falls back to hardcoded OPTIONS.
    async function pickAsync(address) {
        const backend = await fetchFromBackend();
        const opts = backend && backend.length ? backend : OPTIONS;
        return pick(address, opts);
    }

    // Async variant: returns the live options list (or fallback).
    async function getOptionsAsync() {
        const backend = await fetchFromBackend();
        return backend && backend.length ? backend : OPTIONS;
    }

    // =====================================================================
    // 2026-06-04: AUTO-DETECT ĐỊA CHỈ MẠNH HƠN — 2 method cross-validate.
    //   Method A (offline): keyword zone + province VN + fuzzy (typo tolerant).
    //   Method B (online):  Goong geocode qua backend proxy /api/web2/geocode
    //                       (deprecated_compound.district + compound.province).
    //   A === B → confidence 'high'; lệch → 'conflict' (cờ cần kiểm tra).
    // Địa chỉ VN nhập tự do nhiều format → 2 nguồn khớp = tỉ lệ đúng cao.
    // =====================================================================

    // HCMC aliases (địa chỉ thuộc TP.HCM).
    const HCMC_ALIASES = [
        'ho chi minh',
        'tphcm',
        'tp hcm',
        'hcm',
        'sai gon',
        'saigon',
        'tphochiminh',
    ];

    // Tỉnh/thành VN (KHÔNG gồm HCMC) — normalized. Gồm 62 tỉnh cũ + tên gộp
    // 2025 phổ biến → phát hiện "đơn ngoài HCMC" dù địa chỉ thiếu/khác format.
    const PROVINCES_NON_HCM = [
        'ha noi',
        'hai phong',
        'da nang',
        'can tho',
        'hue',
        'thua thien hue',
        'an giang',
        'ba ria vung tau',
        'vung tau',
        'bac giang',
        'bac kan',
        'bac lieu',
        'bac ninh',
        'ben tre',
        'binh dinh',
        'binh duong',
        'binh phuoc',
        'binh thuan',
        'ca mau',
        'cao bang',
        'dak lak',
        'dak nong',
        'dien bien',
        'dong nai',
        'dong thap',
        'gia lai',
        'ha giang',
        'ha nam',
        'ha tinh',
        'hai duong',
        'hau giang',
        'hoa binh',
        'hung yen',
        'khanh hoa',
        'nha trang',
        'kien giang',
        'kon tum',
        'lai chau',
        'lam dong',
        'da lat',
        'lang son',
        'lao cai',
        'long an',
        'nam dinh',
        'nghe an',
        'vinh',
        'ninh binh',
        'ninh thuan',
        'phan rang',
        'phu tho',
        'phu yen',
        'tuy hoa',
        'quang binh',
        'quang nam',
        'quang ngai',
        'quang ninh',
        'ha long',
        'quang tri',
        'soc trang',
        'son la',
        'tay ninh',
        'thai binh',
        'thai nguyen',
        'thanh hoa',
        'tien giang',
        'my tho',
        'tra vinh',
        'tuyen quang',
        'vinh long',
        'vinh phuc',
        'yen bai',
    ];

    // Levenshtein (typo tolerance) — chỉ dùng cho token ngắn (tên quận/tỉnh).
    function _lev(a, b) {
        const m = a.length,
            n = b.length;
        if (Math.abs(m - n) > 2) return 3;
        const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
        for (let j = 0; j <= n; j++) dp[0][j] = j;
        for (let i = 1; i <= m; i++)
            for (let j = 1; j <= n; j++)
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1,
                    dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
                );
        return dp[m][n];
    }

    // Tìm tên (multi-word) trong tokens với fuzzy (edit distance ≤1 cho từ ≥4 ký tự).
    function _hasFuzzy(tokens, needleNorm) {
        if (hasKeyword(tokens, needleNorm)) return true; // exact trước
        const parts = needleNorm.split(' ');
        // Fuzzy chỉ cho từ ≥5 ký tự. Từ 4 ký tự (binh/vinh/ninh/dinh/minh/hoa…)
        // collide nặng trong tiếng Việt → CHỈ exact, tránh false-positive
        // (vd "Bình Thạnh" HCM bị nhận nhầm tỉnh "Vinh").
        if (parts.length === 1 && parts[0].length >= 5) {
            return tokens.some((t) => t.length >= 5 && _lev(t, parts[0]) <= 1);
        }
        // multi-word: mỗi part khớp (exact hoặc fuzzy) trong cửa sổ liên tiếp
        for (let i = 0; i <= tokens.length - parts.length; i++) {
            let ok = true;
            for (let j = 0; j < parts.length; j++) {
                const t = tokens[i + j],
                    p = parts[j];
                if (t === p) continue;
                if (p.length >= 5 && t.length >= 5 && _lev(t, p) <= 1) continue;
                ok = false;
                break;
            }
            if (ok) return true;
        }
        return false;
    }

    function _detectProvince(tokens) {
        for (const prov of PROVINCES_NON_HCM) {
            if (_hasFuzzy(tokens, normalize(prov))) return prov;
        }
        return null;
    }
    function _isHcmc(tokens) {
        return HCMC_ALIASES.some((a) => hasKeyword(tokens, normalize(a)));
    }

    // METHOD A nâng cấp: keyword zone + province awareness + fuzzy.
    // Trả { option, hits, matched, confidence, note, province }.
    function pickOffline(address, options) {
        const opts = options || OPTIONS;
        const norm = normalize(address);
        const tokens = norm ? norm.split(' ') : [];
        const fallback = opts.find((o) => o.isFallback) || null;

        // Zone keyword match — EXACT thắng FUZZY (score = exact×2 + fuzzy×1).
        // Tránh "binh thanh" (Q.Bình Thạnh, exact của tp-trung-tam) thua fuzzy
        // "binh chanh" (tp-bien) do thanh↔chanh edit-distance 1.
        let best = null,
            bestScore = 0,
            bestHits = 0,
            bestMatched = [];
        for (const opt of opts) {
            if (opt.manual || opt.isFallback || !Array.isArray(opt.keywords)) continue;
            let exact = 0,
                fuzzy = 0;
            const matched = [];
            for (const k of opt.keywords) {
                const nk = normalize(k);
                if (hasKeyword(tokens, nk)) {
                    exact++;
                    matched.push(k);
                } else if (_hasFuzzy(tokens, nk)) {
                    fuzzy++;
                    matched.push(k);
                }
            }
            const score = exact * 2 + fuzzy;
            if (score > bestScore) {
                best = opt;
                bestScore = score;
                bestHits = exact + fuzzy;
                bestMatched = matched;
            }
        }

        const province = _detectProvince(tokens);
        const hcmc = _isHcmc(tokens);

        if (best) {
            // Có district HCMC NHƯNG cũng có tên tỉnh ngoài rõ ràng + không thấy "HCM".
            // Tên tỉnh tường minh là tín hiệu mạnh hơn 1 keyword quận (có thể trùng
            // mờ, vd "An Bình" ~ "Bình Chánh") → ưu tiên SHIP TỈNH, cờ low để soát.
            if (province && !hcmc) {
                return {
                    option: fallback,
                    hits: 0,
                    matched: [province],
                    confidence: 'low',
                    province,
                    note: `Có tỉnh "${province}" (kèm từ khoá HCM "${bestMatched[0]}") → ưu tiên SHIP TỈNH, cần kiểm tra`,
                };
            }
            return {
                option: best,
                hits: bestHits,
                matched: bestMatched,
                confidence: 'high',
                province: null,
            };
        }
        // Không có district HCMC.
        if (province) {
            return {
                option: fallback,
                hits: 0,
                matched: [province],
                confidence: 'high',
                province,
                note: `Tỉnh "${province}" → SHIP TỈNH`,
            };
        }
        return {
            option: fallback,
            hits: 0,
            matched: [],
            confidence: 'low',
            province: null,
            note: 'Không nhận diện được khu vực — mặc định SHIP TỈNH',
        };
    }

    // METHOD B: Goong geocode qua backend proxy (ẩn key). Cache theo norm address.
    const _geoCache = new Map();
    async function geocodeGoong(address) {
        const key = normalize(address);
        if (!key) return null;
        if (_geoCache.has(key)) return _geoCache.get(key);
        const base =
            window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        try {
            const r = await fetch(
                `${base}/api/web2/geocode?address=${encodeURIComponent(address)}`,
                {
                    credentials: 'include',
                }
            );
            const j = await r.json();
            const out =
                j && j.success
                    ? { province: j.province || '', district: j.district || '', ward: j.ward || '' }
                    : null;
            _geoCache.set(key, out);
            return out;
        } catch (e) {
            console.warn('[DeliveryMethodPicker] Goong geocode failed:', e.message);
            return null;
        }
    }

    // Map kết quả Goong (district + province) → option zone.
    function _goongToOption(geo, options) {
        const opts = options || OPTIONS;
        const fallback = opts.find((o) => o.isFallback) || null;
        if (!geo) return null;
        const provNorm = normalize(geo.province || '');
        const isHcm =
            HCMC_ALIASES.some((a) => provNorm.includes(a)) || provNorm.includes('ho chi minh');
        if (!isHcm && geo.province) return { option: fallback, matched: [geo.province] }; // tỉnh khác → SHIP TỈNH
        // HCMC → match district vào keyword zone
        const r = pickOffline(geo.district || geo.province || '', opts);
        return { option: r.option, matched: r.matched };
    }

    // PICK ROBUST: chạy A + B, cross-validate.
    async function pickRobust(address, options) {
        const opts = options || (await getOptionsAsync());
        const a = pickOffline(address, opts);
        let b = null,
            bOpt = null;
        try {
            b = await geocodeGoong(address);
            bOpt = _goongToOption(b, opts);
        } catch (_) {}

        let confidence = a.confidence;
        let conflict = false;
        let source = 'offline';
        if (bOpt && bOpt.option) {
            source = 'both';
            if (a.option && bOpt.option.value === a.option.value) {
                confidence = 'high'; // 2 bên khớp → tỉ lệ đúng cao
            } else if (a.option) {
                conflict = true;
                confidence = 'conflict';
            }
        }
        return {
            option: a.option,
            hits: a.hits,
            matched: a.matched,
            confidence,
            conflict,
            source,
            note: a.note || '',
            methods: {
                offline: a.option
                    ? { value: a.option.value, label: a.option.label, matched: a.matched }
                    : null,
                goong: b
                    ? {
                          province: b.province,
                          district: b.district,
                          zone: bOpt?.option?.label || null,
                      }
                    : null,
            },
        };
    }

    window.DeliveryMethodPicker = {
        OPTIONS,
        pick,
        pickOffline,
        normalize,
        // Phase 17: backend-driven options (fetches from
        // /api/web2/deliverycarrier/list — single source of truth)
        fetchFromBackend,
        pickAsync,
        getOptionsAsync,
        // 2026-06-04: 2-method robust auto-detect (offline + Goong cross-validate)
        geocodeGoong,
        pickRobust,
        PROVINCES_NON_HCM,
    };
})();
