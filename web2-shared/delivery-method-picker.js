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
        { value: 'thanh-pho-gop', label: 'THÀNH PHỐ GỘP', manual: true, price: 0 },
        { value: 'tinh-gop', label: 'TỈNH GỘP', manual: true, price: 0 },
        { value: 'ban-hang-shop', label: 'BÁN HÀNG SHOP', manual: true, price: 0 },
        {
            value: 'tp-bien',
            label: 'THÀNH PHỐ (Bình Chánh- Q9, Nhà Bè, Hốc Môn)',
            price: 35000,
            // Outer districts of HCMC
            keywords: ['binh chanh', 'q9', 'quan 9', 'nha be', 'hoc mon'],
        },
        {
            value: 'tp-q2-12-bt-tdu',
            label: 'THÀNH PHỐ (Q2-12-Bình Tân-Thủ Đức)',
            price: 30000,
            keywords: ['q2', 'quan 2', 'q12', 'quan 12', 'binh tan', 'thu duc'],
        },
        {
            value: 'tp-trung-tam',
            label: 'THÀNH PHỐ (1 3 4 5 6 7 8 10 11 Phú Nhuận, Bình Thạnh, Tân Phú, Tân Bình, Gò Vấp)',
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
        { value: 'ship-tinh', label: 'SHIP TỈNH', price: 35000, isFallback: true },
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
    // Single source of truth = /api/web2/deliverycarrier/list, so admin can
    // manage zones + prices + keywords from web2/delivery-carrier/ UI.
    let _liveOptions = null; // set on successful fetch
    let _liveOptionsPromise = null;

    function _normalizeFromRecord(rec) {
        const d = rec.data || {};
        return {
            value: rec.code,
            label: rec.name || d.Name || rec.code,
            price: Number(d.fee || 0),
            keywords: Array.isArray(d.keywords) ? d.keywords : [],
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
                    `${base}/api/web2/deliverycarrier/list?limit=100&activeOnly=true`
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

    window.DeliveryMethodPicker = {
        OPTIONS,
        pick,
        normalize,
        // Phase 17: backend-driven options (fetches from
        // /api/web2/deliverycarrier/list — single source of truth)
        fetchFromBackend,
        pickAsync,
        getOptionsAsync,
    };
})();
