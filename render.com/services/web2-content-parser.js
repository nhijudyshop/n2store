// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — comprehensive Vietnamese bank content parser.
// =====================================================================
// Web2ContentParser — strip noise + extract phone candidates + score
// confidence cho SePay webhook content. Tách khỏi sepay-transaction-
// matching.js để dùng được trong audit + retry queue.
//
// Patterns covered (production-verified):
//   • Bank noise: GD <ref> YYMMDD-HH:MM:SS (NAPAS append)
//   • FT bank tx ID: FT26024971003124
//   • Vietcombank: MBVCB.<x>.<y>.<z>.CT tu <fromAcc> <name> toi <acc> <note>
//   • ACB: ACB;<shopAcc>;<content>
//   • MoMo: <txid>-<phone>-<6digit>
//   • IB / IBFT / IBT prefixes (Internet Banking)
//   • QR transfer: QR - <6digit>
//   • Date-time: DDMMYY-HH:MM:SS (require colons)
//
// Confidence scoring:
//   phone_match (weight 0.6) + name_match (weight 0.3) + amount_anchor (0.1)
//   token_set_ratio inline (~30 LOC, no fuzzball dep)
//   diacritic strip inline (5 LOC, no remove-accents dep)
//
// Industry thresholds:
//   ≥85 = auto-credit safe
//   70-85 = pending review (single match nhưng confidence thấp)
//   <70 = always pending_match (multi-candidate)
// =====================================================================

// ────────────── Diacritic + normalize ──────────────
function stripDiacritics(s) {
    if (!s) return '';
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

function normalize(s) {
    return stripDiacritics(String(s || ''))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function tokenize(s) {
    return normalize(s)
        .split(/\s+/)
        .filter((t) => t.length > 0);
}

// ────────────── Levenshtein (for short-string distance) ──────────────
function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array(b.length + 1).fill(0);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    let curr = Array(b.length + 1).fill(0);
    for (let i = 1; i <= a.length; i++) {
        curr[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        }
        [prev, curr] = [curr, prev];
    }
    return prev[b.length];
}

// ────────────── token_set_ratio (fuzzball-style) ──────────────
// 1. Tokenize both strings
// 2. Find intersection (common tokens, sorted)
// 3. Compute 3 ratios: ratio(t1,t2), ratio(intersect+diff1, intersect+diff2), ratio(t1.full, t2.full)
// 4. Return max — handles word reorder + partial overlap well
function tokenSetRatio(a, b) {
    const ta = new Set(tokenize(a));
    const tb = new Set(tokenize(b));
    if (!ta.size || !tb.size) return 0;
    const intersect = [...ta].filter((t) => tb.has(t)).sort();
    const diffA = [...ta].filter((t) => !tb.has(t)).sort();
    const diffB = [...tb].filter((t) => !ta.has(t)).sort();
    const s1 = intersect.join(' ');
    const s2 = intersect.concat(diffA).join(' ');
    const s3 = intersect.concat(diffB).join(' ');
    const ratio = (x, y) => {
        if (!x.length && !y.length) return 100;
        if (!x.length || !y.length) return 0;
        const dist = levenshtein(x, y);
        return Math.round(100 * (1 - dist / Math.max(x.length, y.length)));
    };
    return Math.max(ratio(s1, s2), ratio(s1, s3), ratio(s2, s3));
}

// ────────────── Noise stripping ──────────────
function stripBankNoise(content) {
    if (!content) return '';
    let s = String(content);
    // Date-time: DDMMYY-HH:MM:SS (require colons in time)
    s = s.replace(/\b\d{6}-\d{2}:\d{2}:\d{2}\b/g, ' ');
    // FT bank tx ID: FT26145253410062
    s = s.replace(/\bFT\d{8,}\b/gi, ' ');
    // GD bank ref: GD 6024IBT1fWHRBQYL, GD 6022VBAAA2YPZSU3
    s = s.replace(/\bGD\s+\d+[A-Z]{2,}[A-Z0-9]+\b/gi, ' ');
    // Standalone bank ref code (digit-letters-alnum): 6065IBT1cWT8PVX9
    s = s.replace(/\b\d{4}[A-Z]{3,}[A-Z0-9]{5,}\b/g, ' ');
    return s;
}

// ────────────── Bank-specific extractors ──────────────
function extractMomoCustomerContent(content) {
    // MoMo: <12digit>-<phone>-<customer-content>
    const m = String(content || '').match(/^\s*(\d{12})-(0\d{9})-(.+?)(?:\s|$)/);
    if (!m) return null;
    return {
        momoCode: m[1],
        senderPhone: m[2], // sender's phone — DON'T use as customer
        customerContent: m[3].trim(),
    };
}

function extractMBVCB(content) {
    // Vietcombank: MBVCB.<x>.<y>.<z>.CT tu <fromAcc> <name> toi <toAcc> <note>
    const m = String(content || '').match(
        /MBVCB\.[^.]+\.[^.]+\.(\d{5,10})\.CT(?:\s+tu\s+\d+\s+([^\d]+))?/i
    );
    if (!m) return null;
    return {
        customerPhone: m[1],
        fromName: (m[2] || '').trim(),
    };
}

function extractACBPrefix(content) {
    // ACB;<shopAcc>;<rest>
    const m = String(content || '').match(/^ACB;(\d+);(.+)$/);
    if (!m) return null;
    return { shopAcc: m[1], rest: m[2] };
}

// ────────────── Dash-GD phone hint ──────────────
// Pattern: '<x>-GD-<digit5-7>-<date>' where the middle digit is the
// customer phone suffix (verified prod: MeiguiHuang47908-GD-936769-...,
// TRUONG THI KIM SA size1 252464-GD-820543-...). The legacy bank ref
// pattern is 'GD <digits><letters>' (with space + alnum letters); only
// the dash-wrapped pure-numeric one is customer-typed.
function findDashGdPhones(content) {
    const out = [];
    if (!content) return out;
    const re = /[-\s]GD[-\s](\d{5,7})(?:[-\s]|$)/gi;
    let m;
    while ((m = re.exec(content)) !== null) {
        out.push(m[1]);
    }
    return out;
}

// ────────────── Phone candidate extraction ──────────────
// Returns sorted candidates with priority hint
function extractPhoneCandidates(content, blacklist = []) {
    if (!content) return [];
    let textToParse = content;
    const isMomo = extractMomoCustomerContent(content);
    if (isMomo) {
        // Use customer content (drop sender phone — not the buyer)
        textToParse = isMomo.customerContent;
    }
    const isVCB = extractMBVCB(content);
    if (isVCB) {
        // VCB pattern — use the phone we extracted directly
        return [{ value: isVCB.customerPhone, source: 'mbvcb', priority: 0 }];
    }
    const isACB = extractACBPrefix(textToParse);
    if (isACB) {
        textToParse = isACB.rest; // drop ACB;<shopAcc>; prefix
    }

    // Strip noise tokens
    const cleaned = stripBankNoise(textToParse);

    // QR code check (highest priority)
    const qrMatch = cleaned.toUpperCase().match(/N2[A-Z0-9]{16}/);
    if (qrMatch) {
        return [{ value: qrMatch[0], source: 'qr', priority: 0, type: 'qr_code' }];
    }

    // Exact 10-digit Vietnamese phone (0xxxxxxxxx)
    const exactMatches = cleaned.match(/\b0\d{9}\b/g) || [];

    // Partial: 5-10 digit runs (excluding the 10-digit ones already captured)
    const allDigitRuns = cleaned.match(/\b\d{5,10}\b/g) || [];

    const blacklistSet = new Set(blacklist || []);
    const candidates = [];

    // Boost: phones in '-GD-<digit>-' pattern (customer-typed)
    const dashGdHints = new Set(findDashGdPhones(content));

    // Add exact phones first (priority by appearance order)
    for (const p of exactMatches) {
        if (blacklistSet.has(p)) continue;
        candidates.push({ value: p, source: 'exact_phone', priority: 0, type: 'exact_phone' });
    }
    // Add partial phones (filter out exact-matched ones to avoid dup)
    const exactSet = new Set(exactMatches);
    for (const p of allDigitRuns) {
        if (exactSet.has(p)) continue; // already added as exact
        if (blacklistSet.has(p)) continue;
        if (p.length > 10) continue; // tx IDs
        // priority: 6-digit = 10, 7-10 = 20, 5 = 30 (lower = higher priority)
        let priority =
            p.length === 6
                ? 10
                : p.length === 7
                  ? 20
                  : p.length === 8
                    ? 21
                    : p.length === 9
                      ? 22
                      : p.length === 5
                        ? 30
                        : 99;
        // BOOST: appears in '-GD-<digit>-' pattern → much higher priority
        if (dashGdHints.has(p)) priority = 5;
        const src = dashGdHints.has(p) ? 'dash_gd_phone' : 'partial_phone';
        candidates.push({ value: p, source: src, priority, type: 'partial_phone' });
    }

    // Sort by priority asc (lower wins)
    candidates.sort((a, b) => a.priority - b.priority);

    return candidates;
}

// ────────────── Name extraction from content ──────────────
// Strip noise + digits, return remaining text as candidate "name" segments
function extractNameSegments(content) {
    if (!content) return '';
    let s = stripBankNoise(content);
    // Drop ACB; prefix
    s = s.replace(/^ACB;\d+;/, '');
    // Drop common prefix words
    s = s.replace(/\b(IB|IBFT|IBT|QR|CT|GD|TT|MBVCB|CHUYEN|KHOAN|CK|gop|don)\b/gi, ' ');
    // Drop digits
    s = s.replace(/\d+/g, ' ');
    // Drop punctuation
    s = s.replace(/[^\p{L}\s]/gu, ' ');
    // Collapse whitespace
    s = s.replace(/\s+/g, ' ').trim();
    return s;
}

// ────────────── Confidence scoring ──────────────
// Inputs:
//   - content: raw SePay content
//   - candidate: TPOS partner record with Name, Phone, Status
//   - phoneMatchType: 'exact_phone' | 'partial_phone' | 'qr_code' | 'name_only'
// Returns: { score: 0-100, breakdown: {phone, name, ...} }
function scoreConfidence({ content, candidate, phoneMatchType, multiMatchCount = 1 }) {
    if (!candidate) {
        return { score: 0, breakdown: { reason: 'no_candidate' } };
    }

    // PHONE component (60%)
    let phoneScore = 0;
    if (phoneMatchType === 'qr_code' || phoneMatchType === 'exact_phone') {
        phoneScore = 100; // QR + exact 10-digit = direct match
    } else if (phoneMatchType === 'partial_phone') {
        phoneScore = multiMatchCount === 1 ? 85 : Math.max(40, 85 - multiMatchCount * 10);
    } else if (phoneMatchType === 'mbvcb') {
        phoneScore = 90; // VCB-specific pattern strong signal
    } else {
        phoneScore = 30; // name-only is weak signal
    }

    // NAME component (30%)
    const nameSegments = extractNameSegments(content);
    const candidateName = candidate.Name || '';
    let nameScore = 0;
    if (nameSegments && candidateName) {
        nameScore = tokenSetRatio(nameSegments, candidateName);
    }

    // MULTI-MATCH PENALTY (downgrade aggressively)
    const multiPenalty = multiMatchCount > 1 ? Math.min(40, (multiMatchCount - 1) * 15) : 0;

    // Final weighted
    const weighted = Math.round(phoneScore * 0.6 + nameScore * 0.3 + 10 - multiPenalty);
    const finalScore = Math.max(0, Math.min(100, weighted));

    return {
        score: finalScore,
        breakdown: {
            phoneScore,
            nameScore,
            multiPenalty,
            phoneMatchType,
            multiMatchCount,
            nameSegments: nameSegments.slice(0, 80),
            candidateName: candidateName.slice(0, 80),
        },
    };
}

// ────────────── Decision tiers ──────────────
// Returns: 'auto_high' | 'auto_safe' | 'review_low' | 'pending_ambiguous'
function decisionTier(score, multiMatchCount) {
    if (multiMatchCount > 1) return 'pending_ambiguous';
    if (score >= 85) return 'auto_high';
    if (score >= 70) return 'auto_safe';
    if (score >= 50) return 'review_low'; // single match but low confidence → review
    return 'pending_ambiguous';
}

module.exports = {
    stripDiacritics,
    normalize,
    tokenize,
    levenshtein,
    tokenSetRatio,
    stripBankNoise,
    extractMomoCustomerContent,
    extractMBVCB,
    extractACBPrefix,
    extractPhoneCandidates,
    extractNameSegments,
    scoreConfidence,
    decisionTier,
};
