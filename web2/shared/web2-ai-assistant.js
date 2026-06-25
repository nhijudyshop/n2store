// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared module.
// =====================================================================
// Web2AiAssistant — TRỢ LÝ AI THEO TRANG (floating, dùng chung mọi trang Web 2.0).
//
// Đọc dữ liệu trang → AI FREE (backend /api/web2-ai, xoay key gemini/groq/openrouter/
// chatanywhere) phân tích: rà soát số liệu/phép tính, soát đơn, cảm xúc khách, giải thích.
//
// NGUỒN DỮ LIỆU (ưu tiên trên xuống):
//   1. DATA ĐẦY ĐỦ từ accessor cache/state trang (Web2AiPageRegistry) — KHÔNG bị phân
//      trang/bảng ảo. Resolve AN TOÀN bằng path-walk (KHÔNG eval chuỗi).
//   2. Bảng DOM nhìn thấy + cảnh báo virtual-scroll.
//   3. main.innerText (fallback).
//   → LỌC PII (SĐT/email/JWT/fb_id) trước khi gửi AI bên thứ 3. KHÔNG gửi localStorage/token.
//
// Gợi ý + model AI auto THEO TRANG lấy từ Web2AiPageRegistry; cho đổi model thủ công.
// Cấu hình localStorage `web2_ai_assistant`: { enabled, provider, model, autoModel }.
//
// API: Web2AiAssistant.open()/.close()/.ask(text)/.reloadConfig()/.pageContext()/.mount()
// Auto-mount qua web2-sidebar (load SAU web2-ai-page-registry.js).
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2AiAssistant) return;

    // ── Base resolve + lazy script loader (cho 3 công cụ: ghép đồ / card-video / viết mô tả) ──
    // currentScript = thẻ <script> của file này (web2/shared/) → suy ra base lazy-load.
    const SELF_SRC = (document.currentScript && document.currentScript.src) || '';
    function sharedBase() {
        if (SELF_SRC) return SELF_SRC.replace(/[^/]*$/, ''); // .../web2/shared/
        const tag = document.querySelector('script[src*="/web2/shared/"]');
        return tag ? tag.src.replace(/web2\/shared\/[^/]*$/, 'web2/shared/') : '';
    }
    const web2Base = () => sharedBase().replace(/shared\/$/, ''); // .../web2/
    const _ls = {};
    function loadScript(src) {
        if (!src) return Promise.reject(new Error('no src'));
        if (_ls[src]) return _ls[src];
        _ls[src] = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.async = false;
            s.onload = () => resolve();
            // Lỗi mạng tạm → XOÁ cache promise (không kẹt reject vĩnh viễn) → mở lại tool
            // sau còn retry được, khỏi phải F5.
            s.onerror = () => {
                delete _ls[src];
                reject(new Error('load ' + src));
            };
            (document.head || document.documentElement).appendChild(s);
        });
        return _ls[src];
    }

    // Công cụ ngoài chat (mount vào panel): Ghép đồ · Card/Video · AI viết mô tả.
    // Mỗi tool tự lazy-load module shared khi mở lần đầu (không nặng trang lúc boot).
    const TOOL_VER = '20260625b';
    const TOOL_DEFS = {
        tryon: {
            label: '👕 Ghép đồ',
            wide: true,
            async ensure() {
                if (!global.Web2Tryon)
                    await loadScript(sharedBase() + 'web2-tryon.js?v=' + TOOL_VER);
                if (!global.Web2VideoStock) {
                    try {
                        await loadScript(
                            web2Base() + 'video-maker/js/video-stock.js?v=' + TOOL_VER
                        );
                    } catch (_) {}
                }
            },
            mount: (pane) => global.Web2Tryon.mount(pane, { compact: true }),
        },
        content: {
            label: '🎬 Card/Video',
            wide: true,
            async ensure() {
                if (!global.Web2ContentMaker)
                    await loadScript(sharedBase() + 'web2-content-maker.js?v=' + TOOL_VER);
            },
            mount: (pane) => global.Web2ContentMaker.mount(pane, { compact: true }),
        },
        describe: {
            label: '✍️ Viết mô tả',
            wide: false,
            async ensure() {
                if (!global.Web2AiDescribe)
                    await loadScript(sharedBase() + 'web2-ai-describe.js?v=' + TOOL_VER);
            },
            mount: (pane) => global.Web2AiDescribe.mountPanel(pane, {}),
        },
    };
    let _mode = 'chat'; // 'chat' | 'tryon' | 'content' | 'describe'
    const _tools = {}; // mode → mounted instance (mount 1 lần, giữ lại)
    const _mounting = {}; // mode → đang lazy-load/mount (chặn double-mount khi click nhanh)

    const CFG_KEY = 'web2_ai_assistant';
    const HIST_PREFIX = 'web2_ai_hist:'; // + pathname (persist hội thoại theo trang)
    const MAX_CTX = 8000; // ký tự context tối đa gửi AI
    const ACCESSOR_BUDGET = 5000; // ký tự dành cho khối DATA ĐẦY ĐỦ (ưu tiên cao nhất)
    const MAX_HIST = 40; // cắt history tránh phình DOM/lag

    // Trang nhạy cảm / không phù hợp → KHÔNG mount (tránh lộ token/secret qua innerText).
    const HIDE_RE =
        /\/web2\/(login|ai-assistant|pancake-settings|zalo|system|services-dashboard|admin-sse-monitor|users-permissions|printer-settings)\//;

    // Model free hiển thị trong dropdown nhanh (đổi thủ công). '' provider = Auto theo trang.
    const MODEL_OPTIONS = [
        { v: 'auto', label: '🤖 Auto (theo trang)' },
        { v: 'gemini|gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
        { v: 'groq|openai/gpt-oss-120b', label: 'GPT-OSS 120B (mạnh)' },
        { v: 'groq|llama-3.1-8b-instant', label: 'Llama 3.1 8B (nhanh)' },
        { v: 'openrouter|deepseek/deepseek-r1-0528:free', label: 'DeepSeek R1 (suy luận)' },
        { v: 'chatanywhere|gpt-4o-mini', label: 'GPT-4o mini' },
    ];

    function workerBase() {
        return (
            (global.WEB2_CONFIG && global.WEB2_CONFIG.WORKER_URL) ||
            (global.API_CONFIG && global.API_CONFIG.WORKER_URL) ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        );
    }
    const API = () => workerBase() + '/api/web2-ai';

    function authHeaders(json) {
        const h = json ? { 'Content-Type': 'application/json' } : {};
        try {
            const a = (global.Web2Auth?.authHeaders && global.Web2Auth.authHeaders()) || {};
            Object.assign(h, a);
        } catch {}
        return h;
    }

    function loadCfg() {
        try {
            const c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
            return {
                enabled: c.enabled !== false,
                provider: c.provider || '',
                model: c.model || '',
                // autoModel: nếu cấu hình có cờ → dùng; nếu chưa (config cũ) → manual khi đã
                // chọn provider, ngược lại auto theo trang. Tránh đè lựa chọn thủ công cũ.
                autoModel: c.autoModel != null ? c.autoModel !== false : !c.provider,
            };
        } catch {
            return { enabled: true, provider: '', model: '', autoModel: true };
        }
    }
    function saveCfg(patch) {
        cfg = { ...cfg, ...patch };
        try {
            localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
        } catch {}
    }
    let cfg = loadCfg();

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ───────── Registry helpers (defensive — registry có thể chưa load) ─────────
    const reg = () => global.Web2AiPageRegistry;
    function pageSuggestions() {
        try {
            return reg()?.suggestionsFor?.(location.pathname) || reg()?.GENERIC || GENERIC_FALLBACK;
        } catch {
            return GENERIC_FALLBACK;
        }
    }
    function pageModel() {
        // Thủ công (autoModel=false + có provider) → dùng cfg; ngược lại Auto theo trang.
        if (!cfg.autoModel && cfg.provider) return { provider: cfg.provider, model: cfg.model };
        try {
            return (
                reg()?.modelFor?.(location.pathname) || {
                    provider: 'gemini',
                    model: 'gemini-2.5-flash',
                }
            );
        } catch {
            return { provider: 'gemini', model: 'gemini-2.5-flash' };
        }
    }
    const GENERIC_FALLBACK = [
        {
            label: '📊 Rà soát số liệu',
            prompt: 'Rà soát số liệu đang hiển thị: dòng nào cộng/trừ sai, lệch tổng, bất thường? Chỉ rõ dòng và số đúng.',
        },
        {
            label: '🧮 Kiểm tra phép tính',
            prompt: 'Tự tính lại các phép cộng/trừ/tổng trong bảng. Liệt kê dòng sai và giá trị đúng.',
        },
        {
            label: '❓ Giải thích trang',
            prompt: 'Giải thích ngắn gọn trang này hiển thị gì và các cột/số liệu chính nghĩa là gì.',
        },
    ];

    // ───────── Resolve accessor AN TOÀN (path-walk, KHÔNG eval chuỗi) ─────────
    // Hỗ trợ: window.A?.b?.c, window.A?.method?.(), ...().length. Bọc try/catch.
    function resolveExpr(expr) {
        try {
            const path = String(expr || '')
                .replace(/^window\.?/, '')
                .replace(/\?\./g, '.') // optional-chain → '.'
                .replace(/\.\(\)/g, '()') // '.()' (từ '?.()') → gắn '()' vào token trước
                .split('.')
                .filter(Boolean);
            let owner = null;
            let cur = global;
            for (let seg of path) {
                if (cur == null) return undefined;
                const isCall = /\(\)$/.test(seg);
                const key = seg.replace(/\(\)$/, '');
                owner = cur;
                cur = cur[key];
                if (isCall) {
                    if (typeof cur !== 'function') return undefined;
                    cur = cur.call(owner);
                }
            }
            return cur;
        } catch {
            return undefined;
        }
    }

    // ───────── Lọc PII trước khi gửi AI bên thứ 3 (audit HIGH) ─────────
    function redactPII(s) {
        return String(s || '')
            .replace(/eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g, '«token»') // JWT
            .replace(/\b0\d{9}\b/g, '«sđt»') // SĐT VN 10 số
            .replace(/(\+?84)\d{9}\b/g, '«sđt»')
            .replace(/\b\d{15,}\b/g, '«id»') // fb_id / số rất dài
            .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '«email»');
    }

    // ───────── ĐỌC DỮ LIỆU TỪ DATABASE qua API đọc sẵn (Option B) ─────────
    // _dbData[pathname] = [{ data:[], label, desc }] — cache sau khi user bấm "Đọc DB".
    const _dbData = {};
    const DB_BUDGET = 5200; // ký tự cho khối dữ liệu DB (ưu tiên cao nhất)

    const MAX_DB_ROWS = 5000; // cap tổng dòng tải về (tránh tải vô hạn DB cực lớn)

    function _dataAt(j, dataPath) {
        let data = j;
        for (const k of String(dataPath || '')
            .split('.')
            .filter(Boolean))
            data = data?.[k];
        return Array.isArray(data) ? data : null;
    }

    function _hasMore(j, field) {
        let v = j;
        for (const k of String(field || '')
            .split('.')
            .filter(Boolean))
            v = v?.[k];
        return !!v;
    }

    // Đọc full bảng: CHỈ loop nhiều trang khi spec có hasMoreField (page-based + backend báo
    // còn trang); endpoint offset/không phân trang → fetch 1 lần với limit lớn (tránh refetch
    // trùng). Cap MAX_DB_ROWS.
    async function fetchDbSource(spec) {
        try {
            const limit = (spec.params && spec.params.limit) || 1500;
            let page = (spec.params && spec.params.page) || 1;
            const canPage = !!spec.hasMoreField;
            const all = [];
            for (let i = 0; i < 30 && all.length < MAX_DB_ROWS; i++) {
                const url = new URL(workerBase() + spec.endpoint);
                Object.entries(spec.params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
                if (canPage) url.searchParams.set('page', page);
                url.searchParams.set('limit', limit);
                const r = await fetch(url.toString(), { headers: authHeaders(false) });
                if (r.status === 401) throw authErr();
                if (!r.ok) break;
                const j = await r.json().catch(() => null);
                if (!j) break;
                const data = _dataAt(j, spec.dataPath);
                if (!data || !data.length) break;
                all.push(...data);
                if (!canPage || !_hasMore(j, spec.hasMoreField)) break;
                page++;
            }
            return all.length ? all : null;
        } catch (e) {
            if (e.code === 401) throw e;
            return null;
        }
    }

    // Tải toàn bộ DB cho trang hiện tại rồi hỏi AI (gắn vào _dbData → mọi câu sau vẫn thấy).
    async function loadDbThenAsk() {
        if (_busy) return;
        const path = location.pathname;
        const specs = (() => {
            try {
                return reg()?.dbSourcesFor?.(path) || [];
            } catch {
                return [];
            }
        })();
        if (!specs.length) return;
        ensureUi();
        _root.querySelector('.w2aa-panel').classList.add('open');
        if (_mode !== 'chat') showMode('chat');
        history.push({
            role: 'ai',
            content: '⏳ Đang đọc toàn bộ dữ liệu từ database…',
            pending: true,
        });
        render();
        try {
            const loaded = [];
            for (const spec of specs) {
                const data = await fetchDbSource(spec);
                if (data) loaded.push({ data, label: spec.label, desc: spec.desc });
            }
            history.pop(); // bỏ placeholder
            if (!loaded.length) {
                history.push({
                    role: 'ai',
                    content: '⚠️ Không đọc được dữ liệu từ database (thử lại sau).',
                });
                render();
                return;
            }
            _dbData[path] = loaded;
            const total = loaded.reduce((s, x) => s + x.data.length, 0);
            ask(
                `Tôi vừa tải TOÀN BỘ dữ liệu từ database (${total} bản ghi) — xem khối "DỮ LIỆU TỪ DATABASE". Phân tích tổng quan + nêu các điểm cần chú ý: số liệu bất thường, thiếu thông tin, lệch tổng, trạng thái cần xử lý. Trả lời gọn, có số cụ thể.`
            );
        } catch (e) {
            history.pop();
            history.push({ role: 'ai', content: '⚠️ ' + (e.message || 'Lỗi đọc DB') });
            if (e.code === 401 && !_authRedirecting && global.Web2Auth?.requireAuth) {
                _authRedirecting = true;
                setTimeout(() => global.Web2Auth.requireAuth(), 1500);
            }
            render();
        }
    }

    // Encode mảng data THÔNG MINH:
    //  - Nhỏ (raw JSON vừa budget) → gửi RAW đầy đủ (AI thấy mọi dòng).
    //  - Lớn → TÓM TẮT THỐNG KÊ (tổng/min/max/đếm theo trạng thái + đếm bất thường) +
    //    MẪU dòng "có vấn đề" (số âm / nhiều ô trống), thay vì cắt cụt 30 dòng đầu.
    // → AI thấy bức tranh TOÀN BẢNG dù DB lớn, không phụ thuộc số dòng.
    function encodeArray(arr, label, desc, budget) {
        const N = arr.length;
        if (!N) return `${label}: 0 bản ghi.`;
        const raw = JSON.stringify(arr);
        if (raw.length <= budget) {
            return `${label} (${N} bản ghi — ĐẦY ĐỦ) — ${(desc || '').slice(0, 150)}:\n${raw}`;
        }
        return summarizeDataset(arr, label, desc, budget);
    }

    function summarizeDataset(arr, label, desc, budget) {
        const N = arr.length;
        const sample = arr.slice(0, 1000); // phân tích trên tối đa 1000 dòng
        const fields = {};
        for (const row of sample) {
            if (!row || typeof row !== 'object') continue;
            for (const k of Object.keys(row)) {
                const v = row[k];
                const f =
                    fields[k] ||
                    (fields[k] = {
                        n: 0,
                        nullc: 0,
                        num: 0,
                        sum: 0,
                        min: Infinity,
                        max: -Infinity,
                        neg: 0,
                        zero: 0,
                        vals: {},
                    });
                f.n++;
                if (v == null || v === '') {
                    f.nullc++;
                    continue;
                }
                if (typeof v === 'number' && isFinite(v)) {
                    f.num++;
                    f.sum += v;
                    if (v < f.min) f.min = v;
                    if (v > f.max) f.max = v;
                    if (v < 0) f.neg++;
                    if (v === 0) f.zero++;
                } else {
                    const s = String(v).slice(0, 30);
                    if (Object.keys(f.vals).length < 25) f.vals[s] = (f.vals[s] || 0) + 1;
                }
            }
        }
        const lines = [
            `${label} — TỔNG ${N} bản ghi${N > sample.length ? ` (thống kê trên ${sample.length} đầu)` : ''}. ${(desc || '').slice(0, 150)}`,
        ];
        for (const k of Object.keys(fields)) {
            const f = fields[k];
            if (f.num > f.n * 0.6) {
                lines.push(
                    `• ${k} (số): tổng=${Math.round(f.sum).toLocaleString('vi-VN')}, min=${f.min}, max=${f.max}` +
                        (f.neg ? `, ÂM=${f.neg}` : '') +
                        (f.zero ? `, =0:${f.zero}` : '') +
                        (f.nullc ? `, trống:${f.nullc}` : '')
                );
            } else {
                const distinct = Object.keys(f.vals);
                if (distinct.length && distinct.length <= 15) {
                    const top = distinct
                        .sort((a, b) => f.vals[b] - f.vals[a])
                        .map((v) => `${v}:${f.vals[v]}`)
                        .join(', ');
                    lines.push(`• ${k}: ${top}` + (f.nullc ? ` (trống:${f.nullc})` : ''));
                } else if (f.nullc) {
                    lines.push(`• ${k}: ${f.nullc}/${f.n} trống`);
                }
            }
        }
        // Mẫu dòng "có vấn đề" (số âm / nhiều ô trống) + vài dòng đầu.
        const flagged = arr
            .filter(
                (r) =>
                    r &&
                    typeof r === 'object' &&
                    Object.values(r).some((v) => typeof v === 'number' && v < 0)
            )
            .slice(0, 8);
        const head = arr.slice(0, 5);
        const seen = new Set();
        const samples = [...flagged, ...head]
            .filter((r) => {
                const k = JSON.stringify(r);
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
            })
            .slice(0, 12);
        if (samples.length)
            lines.push(
                `Mẫu dòng${flagged.length ? ' (gồm dòng có số ÂM)' : ''}: ${JSON.stringify(samples)}`
            );
        let out = lines.join('\n');
        if (out.length > budget) out = out.slice(0, budget) + '…';
        return out;
    }

    // ───────── Thu thập NGỮ CẢNH trang ─────────
    function _tableText(tb, cap) {
        const rows = [...tb.querySelectorAll('tr')].slice(0, 40);
        const lines = rows.map((tr) =>
            [...tr.querySelectorAll('th,td')]
                .slice(0, 12)
                .map((c) => (c.innerText || '').replace(/\s+/g, ' ').trim())
                .join(' | ')
        );
        let out = lines.filter((l) => l).join('\n');
        if (out.length > cap) out = out.slice(0, cap) + '…';
        return out;
    }

    function pageContext() {
        const parts = [];
        const title = (
            document.querySelector('h1, .aih-title, .page-title')?.innerText ||
            document.title ||
            ''
        ).trim();
        parts.push('TRANG: ' + title + '  (' + location.pathname + ')');
        const note = (() => {
            try {
                return reg()?.noteFor?.(location.pathname) || '';
            } catch {
                return '';
            }
        })();

        // Vùng bôi đen → ưu tiên.
        const sel = String(window.getSelection ? window.getSelection() : '').trim();
        if (sel && sel.length > 4) parts.push('ĐOẠN ĐANG CHỌN:\n' + sel.slice(0, 2500));

        // (0) DỮ LIỆU TỪ DATABASE (nếu user đã bấm "Đọc DB") — nguồn ĐẦY ĐỦ NHẤT, ưu tiên cao nhất.
        const dbLoaded = _dbData[location.pathname];
        if (dbLoaded && dbLoaded.length) {
            let dbBudget = DB_BUDGET;
            for (const src of dbLoaded) {
                if (dbBudget <= 200) break;
                const txt = encodeArray(
                    src.data,
                    '═══ DỮ LIỆU TỪ DATABASE: ' + src.label,
                    src.desc,
                    dbBudget
                );
                parts.push(txt);
                dbBudget -= txt.length;
            }
        }

        // (1) DATA ĐẦY ĐỦ từ accessor cache/state (ưu tiên TRÊN bảng DOM).
        let accBudget = ACCESSOR_BUDGET;
        let gotAccessor = false;
        const accs = (() => {
            try {
                return reg()?.accessorsFor?.(location.pathname) || [];
            } catch {
                return [];
            }
        })();
        for (const a of accs) {
            if (accBudget <= 200) break;
            const val = resolveExpr(a.expr);
            if (val == null) continue;
            let txt;
            if (Array.isArray(val)) {
                if (!val.length) continue;
                // encodeArray: nhỏ → raw đầy đủ; lớn → tóm tắt thống kê + mẫu (không cắt cụt).
                const lbl =
                    'DỮ LIỆU ĐẦY ĐỦ' + (a.shape ? ' [shape: ' + a.shape.slice(0, 180) + ']' : '');
                txt = encodeArray(val, lbl, a.desc, accBudget);
            } else {
                txt =
                    'DỮ LIỆU ĐẦY ĐỦ — ' +
                    (a.desc || '').slice(0, 90) +
                    ':\n' +
                    (typeof val === 'object' ? JSON.stringify(val) : String(val));
                if (txt.length > accBudget) txt = txt.slice(0, accBudget) + '…';
            }
            parts.push(txt);
            accBudget -= txt.length;
            gotAccessor = true;
        }

        // (2) Bảng DOM nhìn thấy (chỉ trong main, loại bảng ẩn) + cảnh báo virtual.
        const allTb = [...document.querySelectorAll('main table, .web2-main table')].filter(
            (tb) => tb.offsetParent !== null && tb.getClientRects().length
        );
        let tbBudget = gotAccessor ? 1500 : 3500; // có accessor rồi thì bảng DOM chỉ phụ
        allTb.slice(0, 4).forEach((tb, i) => {
            if (tbBudget <= 0) return;
            const trCount = tb.querySelectorAll('tr').length;
            const virtual =
                trCount >= 40 ||
                tb.closest('[data-total],.pagination,.virtual,.cv-auto') ||
                tb.querySelector('tfoot');
            const t = _tableText(tb, Math.min(tbBudget, 1500));
            if (t) {
                parts.push(
                    'BẢNG ' +
                        (i + 1) +
                        (virtual ? ' (⚠ có thể chỉ là MỘT PHẦN — bảng phân trang/cuộn ảo)' : '') +
                        ':\n' +
                        t
                );
                tbBudget -= t.length;
            }
        });

        // (3) main.innerText (fallback gom KPI/card/hội thoại).
        const main = document.querySelector('main, .web2-main') || document.body;
        let mainTxt = (main.innerText || '').replace(/\n{2,}/g, '\n').trim();
        const used = parts.join('\n').length;
        const room = Math.max(0, MAX_CTX - used - 200);
        if (room > 300) parts.push('NỘI DUNG HIỂN THỊ:\n' + mainTxt.slice(0, room));

        let ctx = parts.join('\n\n');
        ctx = redactPII(ctx); // bỏ PII trước khi gửi AI bên thứ 3
        if (ctx.length > MAX_CTX) ctx = ctx.slice(0, MAX_CTX) + '…';
        return note ? ctx + '\n\n(Lưu ý nguồn dữ liệu: ' + note.slice(0, 300) + ')' : ctx;
    }

    function systemPrompt() {
        return (
            'Bạn là TRỢ LÝ AI hỗ trợ nhân viên hệ thống quản lý bán hàng Web 2.0 (shop thời trang nữ N2Store). ' +
            'Người dùng đang xem 1 trang; bên dưới là DỮ LIỆU của trang đó. ' +
            'CHỈ dựa vào dữ liệu này — KHÔNG bịa số liệu/đơn/khách không có. ' +
            'Khối "DỮ LIỆU ĐẦY ĐỦ" là nguồn CHÍNH (đọc từ cache/state, đầy đủ hơn bảng hiển thị); ' +
            'ưu tiên dùng nó. Nếu bảng DOM ghi "MỘT PHẦN/phân trang/cuộn ảo", KHÔNG kết luận "tổng sai" ' +
            'chỉ vì cộng các dòng nhìn thấy — chỉ dùng khối DỮ LIỆU ĐẦY ĐỦ để tính tổng. ' +
            'Khi rà soát phép tính: tự cộng/trừ lại, chỉ rõ dòng sai và số đúng. ' +
            'Trả lời tiếng Việt, NGẮN GỌN, đi thẳng vấn đề, gạch đầu dòng khi liệt kê. ' +
            'Nếu dữ liệu không đủ để kết luận, nói rõ thiếu gì.\n\n===== DỮ LIỆU TRANG =====\n' +
            pageContext()
        );
    }

    // ───────── Gọi AI: streaming (P0) + fallback non-stream ─────────
    function authErr() {
        const e = new Error('Phiên Web 2.0 hết hạn — đăng nhập lại.');
        e.code = 401;
        return e;
    }

    async function callAiStream(messages, onDelta) {
        const m = pageModel();
        const body = JSON.stringify({
            provider: m.provider || 'gemini',
            model: m.model || undefined,
            messages,
            system: systemPrompt(),
            maxTokens: 1100,
        });
        let res;
        try {
            res = await fetch(API() + '/chat/stream', {
                method: 'POST',
                headers: authHeaders(true),
                body,
                signal: _abort?.signal,
            });
        } catch (e) {
            if (e.name === 'AbortError') throw e;
            return callAiOnce(messages); // mạng lỗi → thử non-stream
        }
        if (res.status === 401) throw authErr();
        if (!res.ok || !res.body) return callAiOnce(messages);
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        let acc = '';
        let errored = null;
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let i;
            while ((i = buf.indexOf('\n\n')) >= 0) {
                const block = buf.slice(0, i);
                buf = buf.slice(i + 2);
                const ev = /event:\s*(\w+)/.exec(block);
                const dm = /data:\s*(.*)/s.exec(block);
                if (!ev || !dm) continue;
                let data = {};
                try {
                    data = JSON.parse(dm[1]);
                } catch {}
                if (ev[1] === 'delta') {
                    acc += data.text || '';
                    onDelta && onDelta(acc);
                } else if (ev[1] === 'error') {
                    errored = data;
                }
            }
        }
        if (errored) {
            if (errored.code === 401 || /unauthor|hết hạn|token/i.test(errored.error || ''))
                throw authErr();
            throw new Error(errored.error || 'Lỗi AI');
        }
        if (!acc.trim()) return callAiOnce(messages); // stream rỗng → thử non-stream
        return acc;
    }

    async function callAiOnce(messages) {
        const m = pageModel();
        const body = {
            provider: m.provider || undefined,
            model: m.model || undefined,
            messages,
            system: systemPrompt(),
            maxTokens: 1000,
        };
        const path = m.provider ? '/chat' : '/complete';
        const r = await fetch(API() + path, {
            method: 'POST',
            headers: authHeaders(true),
            body: JSON.stringify(body),
            signal: _abort?.signal,
        });
        if (r.status === 401) throw authErr();
        const j = await r.json().catch(() => ({}));
        if (j && (j.code === 401 || /unauthor|hết hạn|token/i.test(j.error || ''))) throw authErr();
        if (!r.ok || j.error) throw new Error(j.error || 'AI lỗi (HTTP ' + r.status + ')');
        const text = j.text || j.reply || j.content || (j.message && j.message.content);
        if (!text || !String(text).trim()) throw new Error('AI không trả nội dung.');
        return text;
    }

    // ───────── History (persist theo trang) ─────────
    let history = []; // {role:'user'|'ai', content, pending?}
    function histKey() {
        return HIST_PREFIX + location.pathname;
    }
    function loadHistory() {
        try {
            const a = JSON.parse(localStorage.getItem(histKey()) || '[]');
            history = Array.isArray(a)
                ? a.filter((m) => m && m.content && !m.pending).slice(-MAX_HIST)
                : [];
        } catch {
            history = [];
        }
    }
    function saveHistory() {
        try {
            localStorage.setItem(
                histKey(),
                JSON.stringify(history.filter((m) => !m.pending).slice(-MAX_HIST))
            );
        } catch {}
    }
    function capHistory() {
        if (history.length > MAX_HIST) history.splice(0, history.length - MAX_HIST);
    }

    // ───────── UI ─────────
    let _root = null;

    function injectCss() {
        if (document.getElementById('web2-ai-assistant-css')) return;
        const st = document.createElement('style');
        st.id = 'web2-ai-assistant-css';
        st.textContent = `
.w2aa-fab{position:fixed;right:18px;bottom:18px;z-index:9400;width:54px;height:54px;border-radius:50%;border:none;cursor:pointer;
  background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:24px;box-shadow:0 8px 24px rgba(99,102,241,.42);
  display:flex;align-items:center;justify-content:center;transition:transform .15s,box-shadow .15s}
.w2aa-fab:hover{transform:translateY(-2px) scale(1.05);box-shadow:0 12px 30px rgba(99,102,241,.5)}
.w2aa-fab[hidden]{display:none!important}
.w2aa-panel{position:fixed;right:18px;bottom:84px;z-index:9401;width:min(430px,calc(100vw - 28px));height:min(640px,calc(100vh - 120px));
  background:#fff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.26);display:none;flex-direction:column;overflow:hidden}
.w2aa-panel.open{display:flex}
.w2aa-head{display:flex;align-items:center;gap:8px;padding:11px 13px;border-bottom:1px solid #eef2f5;background:linear-gradient(135deg,#eef2ff,#faf5ff)}
.w2aa-head b{font-size:.94rem;color:#0f172a;flex:1;line-height:1.2}
.w2aa-head .w2aa-sub{font-size:.66rem;color:#64748b;font-weight:500}
.w2aa-ico{width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px}
.w2aa-x,.w2aa-gear{border:none;background:#fff;width:30px;height:30px;border-radius:8px;cursor:pointer;color:#475569;font-size:16px}
.w2aa-x:hover,.w2aa-gear:hover{background:#eef2f5}
.w2aa-modelbar{display:flex;align-items:center;gap:6px;padding:6px 13px;border-bottom:1px solid #f1f5f9;background:#fafbff}
.w2aa-modelbar label{font-size:.66rem;color:#94a3b8;font-weight:600}
.w2aa-model{flex:1;border:1px solid #e2e8f0;border-radius:8px;padding:4px 7px;font-size:.72rem;color:#334155;background:#fff;cursor:pointer}
.w2aa-body{flex:1;overflow:auto;padding:12px 14px;display:flex;flex-direction:column;gap:10px;background:#f8fafc}
.w2aa-quicks-bar{display:flex;gap:6px;padding:8px 12px;overflow-x:auto;border-bottom:1px solid #f1f5f9;background:#fff;flex:0 0 auto;scrollbar-width:thin}
.w2aa-quicks-bar::-webkit-scrollbar{height:5px}.w2aa-quicks-bar::-webkit-scrollbar-thumb{background:#e2e8f0;border-radius:3px}
.w2aa-quicks-bar:empty{display:none}
.w2aa-quick{border:1px solid #dbe2ea;background:#fff;border-radius:999px;padding:6px 11px;font-size:.74rem;cursor:pointer;color:#334155;white-space:nowrap;flex:0 0 auto}
.w2aa-quick-db{border-color:#c7d2fe;background:linear-gradient(135deg,#eef2ff,#faf5ff);color:#4f46e5;font-weight:600}
.w2aa-quick-db:hover{border-color:#6366f1;background:#e0e7ff}
.w2aa-quick:hover{border-color:#6366f1;color:#4f46e5;background:#eef2ff}
.w2aa-msg{position:relative;max-width:90%;padding:9px 12px;border-radius:13px;font-size:.84rem;line-height:1.5;word-break:break-word}
.w2aa-msg.user{align-self:flex-end;background:#6366f1;color:#fff;border-bottom-right-radius:4px;white-space:pre-wrap}
.w2aa-msg.ai{align-self:flex-start;background:#fff;border:1px solid #e6e9ef;color:#0f172a;border-bottom-left-radius:4px}
.w2aa-msg.ai b{font-weight:700}.w2aa-msg.ai code{background:#f1f5f9;padding:1px 5px;border-radius:5px;font-size:.8em}
.w2aa-msg.ai ul{margin:5px 0;padding-left:18px}.w2aa-msg.ai li{margin:2px 0}
.w2aa-msg.ai h4{margin:6px 0 3px;font-size:.86rem}.w2aa-msg.ai pre{background:#0f172a;color:#e2e8f0;padding:8px;border-radius:8px;overflow:auto;font-size:.76rem}
.w2aa-copy{position:absolute;top:4px;right:4px;border:none;background:#f1f5f9;color:#64748b;width:22px;height:22px;border-radius:6px;cursor:pointer;font-size:11px;opacity:0;transition:opacity .12s}
.w2aa-msg.ai:hover .w2aa-copy{opacity:1}.w2aa-copy:hover{background:#e2e8f0;color:#334155}
.w2aa-typing{display:inline-flex;gap:3px}.w2aa-typing i{width:6px;height:6px;border-radius:50%;background:#a5b4fc;animation:w2aaBlink 1s infinite}
.w2aa-typing i:nth-child(2){animation-delay:.2s}.w2aa-typing i:nth-child(3){animation-delay:.4s}
@keyframes w2aaBlink{0%,80%,100%{opacity:.3}40%{opacity:1}}
.w2aa-empty{color:#94a3b8;font-size:.8rem;text-align:center;padding:10px 4px}
.w2aa-foot{padding:10px 12px;border-top:1px solid #eef2f5;display:flex;gap:8px;align-items:flex-end;background:#fff}
.w2aa-input{flex:1;resize:none;max-height:110px;min-height:40px;border:1px solid #d6dee2;border-radius:11px;padding:9px 11px;font:inherit;font-size:.86rem;outline:none}
.w2aa-input:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.14)}
.w2aa-send{border:none;background:#6366f1;color:#fff;width:40px;height:40px;border-radius:11px;cursor:pointer;font-size:17px;flex:0 0 auto}
.w2aa-send:disabled{opacity:.5;cursor:not-allowed}
.w2aa-modes{display:flex;gap:5px;padding:7px 10px;border-bottom:1px solid #eef2f5;background:#fff;overflow-x:auto;flex:0 0 auto;scrollbar-width:none}
.w2aa-modes::-webkit-scrollbar{display:none}
.w2aa-mode{border:1px solid #e2e8f0;background:#fff;border-radius:999px;padding:5px 11px;font-size:.74rem;font-weight:600;color:#475569;cursor:pointer;white-space:nowrap;flex:0 0 auto;transition:background .12s,border-color .12s,color .12s}
.w2aa-mode:hover{border-color:#c7d2fe;color:#4f46e5}
.w2aa-mode.is-on{border-color:transparent;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff}
.w2aa-chat{flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden}
.w2aa-chat[hidden]{display:none}
.w2aa-tool{flex:1;display:flex;min-height:0;overflow:hidden}
.w2aa-tool[hidden]{display:none}
.w2aa-toolpane{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.w2aa-toolpane[hidden]{display:none}
.w2aa-toolload,.w2aa-toolerr{padding:26px 18px;text-align:center;font-size:.84rem;color:#64748b}
.w2aa-toolerr{color:#dc2626}
.w2aa-panel--wide{width:min(880px,calc(100vw - 28px));height:min(720px,calc(100vh - 92px))}
@media(max-width:560px){.w2aa-panel,.w2aa-panel--wide{right:10px;left:10px;width:auto;bottom:78px;height:min(78vh,calc(100vh - 96px))}.w2aa-fab{right:12px;bottom:12px}}`;
        document.head.appendChild(st);
    }

    // markdown nhẹ + AN TOÀN (escape TRƯỚC, format SAU).
    function _md(s) {
        let t = esc(s);
        const blocks = [];
        t = t.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, l, c) => {
            blocks.push('<pre>' + c.replace(/\n$/, '') + '</pre>');
            return ' ' + (blocks.length - 1) + ' ';
        });
        t = t
            .replace(/^### (.+)$/gm, '<h4>$1</h4>')
            .replace(/^## (.+)$/gm, '<h4>$1</h4>')
            .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>');
        t = t.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>');
        t = t.replace(/\n/g, '<br>').replace(/ (\d+) /g, (_, i) => blocks[+i] || '');
        return t;
    }

    function bubbleHtml(m, i) {
        if (m.role === 'user') return `<div class="w2aa-msg user">${esc(m.content)}</div>`;
        const inner = m.pending
            ? '<span class="w2aa-typing"><i></i><i></i><i></i></span>'
            : _md(m.content);
        const copy = m.pending
            ? ''
            : `<button class="w2aa-copy" data-copy="${i}" title="Sao chép">⧉</button>`;
        return `<div class="w2aa-msg ai" data-mi="${i}">${inner}${copy}</div>`;
    }

    // Thanh gợi ý CỐ ĐỊNH (luôn hiện, cuộn ngang) — không mất sau khi chat.
    function renderQuicks() {
        const bar = _root && _root.querySelector('.w2aa-quicks-bar');
        if (!bar) return;
        const sugs = pageSuggestions();
        // Chip ĐỌC DB (nếu trang có nguồn DB) — đứng đầu, nổi bật.
        let dbSpecs = [];
        try {
            dbSpecs = reg()?.dbSourcesFor?.(location.pathname) || [];
        } catch {}
        const dbLoaded = !!_dbData[location.pathname];
        let html = '';
        if (dbSpecs.length) {
            const lbl = dbLoaded
                ? '✓ Đã tải DB — tải lại'
                : dbSpecs[0].label || '🗄️ Đọc toàn bộ từ DB';
            html += `<button class="w2aa-quick w2aa-quick-db" data-db="1" title="Đọc TOÀN BỘ bảng từ database (không chỉ trang hiện tại)">${esc(lbl)}</button>`;
        }
        html += sugs
            .map(
                (q, i) =>
                    `<button class="w2aa-quick" data-q="${i}" title="${esc(q.prompt).slice(0, 120)}">${esc(q.label)}</button>`
            )
            .join('');
        bar.innerHTML = html;
        const dbBtn = bar.querySelector('[data-db]');
        if (dbBtn) dbBtn.addEventListener('click', () => loadDbThenAsk());
        bar.querySelectorAll('[data-q]').forEach((b) =>
            b.addEventListener('click', () => ask(sugs[+b.dataset.q].prompt))
        );
    }

    function render() {
        renderQuicks(); // gợi ý luôn hiện ở thanh cố định
        const body = _root.querySelector('.w2aa-body');
        const msgs = history.length
            ? history.map((m, i) => bubbleHtml(m, i)).join('')
            : '<div class="w2aa-empty">Hỏi bất cứ gì về dữ liệu trang — hoặc bấm gợi ý phía trên.</div>';
        body.innerHTML = msgs;
        body.querySelectorAll('[data-copy]').forEach((b) =>
            b.addEventListener('click', () => {
                const m = history[+b.dataset.copy];
                if (m) {
                    navigator.clipboard?.writeText(m.content).then(() => {
                        b.textContent = '✓';
                        setTimeout(() => (b.textContent = '⧉'), 1200);
                    });
                }
            })
        );
        body.scrollTop = body.scrollHeight;
    }

    // cập nhật riêng bubble cuối (streaming) — không rebuild toàn body.
    function patchLast() {
        const body = _root && _root.querySelector('.w2aa-body');
        if (!body) return;
        const i = history.length - 1;
        const el = body.querySelector(`[data-mi="${i}"]`);
        const m = history[i];
        if (el && m) {
            el.innerHTML = m.pending
                ? '<span class="w2aa-typing"><i></i><i></i><i></i></span>'
                : _md(m.content) +
                  `<button class="w2aa-copy" data-copy="${i}" title="Sao chép">⧉</button>`;
            const cp = el.querySelector('[data-copy]');
            cp &&
                cp.addEventListener('click', () =>
                    navigator.clipboard?.writeText(m.content).then(() => {
                        cp.textContent = '✓';
                        setTimeout(() => (cp.textContent = '⧉'), 1200);
                    })
                );
            body.scrollTop = body.scrollHeight;
        }
    }

    function buildModelBar() {
        const cur = cfg.autoModel || !cfg.provider ? 'auto' : cfg.provider + '|' + cfg.model;
        return (
            '<label>Model</label><select class="w2aa-model">' +
            MODEL_OPTIONS.map(
                (o) =>
                    `<option value="${o.v}"${o.v === cur ? ' selected' : ''}>${esc(o.label)}</option>`
            ).join('') +
            '</select>'
        );
    }

    function ensureUi() {
        if (_root) return _root;
        injectCss();
        const wrap = document.createElement('div');
        wrap.innerHTML = `
          <button class="w2aa-fab" title="Trợ lý AI cho trang này" aria-label="Trợ lý AI">✨</button>
          <section class="w2aa-panel" role="dialog" aria-label="Trợ lý AI theo trang">
            <div class="w2aa-head">
              <div class="w2aa-ico">✨</div>
              <b>Trợ lý AI trang này<div class="w2aa-sub">Đọc dữ liệu trang • AI miễn phí</div></b>
              <button class="w2aa-gear" title="Cấu hình AI">⚙️</button>
              <button class="w2aa-x" title="Đóng">×</button>
            </div>
            <nav class="w2aa-modes" role="tablist" aria-label="Chế độ trợ lý AI">
              <button class="w2aa-mode is-on" data-mode="chat">💬 Hỏi đáp</button>
              <button class="w2aa-mode" data-mode="tryon">👕 Ghép đồ</button>
              <button class="w2aa-mode" data-mode="content">🎬 Card/Video</button>
              <button class="w2aa-mode" data-mode="describe">✍️ Viết mô tả</button>
            </nav>
            <div class="w2aa-chat">
              <div class="w2aa-modelbar">${buildModelBar()}</div>
              <div class="w2aa-quicks-bar"></div>
              <div class="w2aa-body"></div>
              <div class="w2aa-foot">
                <textarea class="w2aa-input" rows="1" placeholder="Hỏi về số liệu / khách / đơn trên trang…"></textarea>
                <button class="w2aa-send" title="Gửi">➤</button>
              </div>
            </div>
            <div class="w2aa-tool" hidden>
              <div class="w2aa-toolpane" data-tool="tryon" hidden></div>
              <div class="w2aa-toolpane" data-tool="content" hidden></div>
              <div class="w2aa-toolpane" data-tool="describe" hidden></div>
            </div>
          </section>`;
        document.body.appendChild(wrap);
        _root = wrap;

        const fab = wrap.querySelector('.w2aa-fab');
        const panel = wrap.querySelector('.w2aa-panel');
        const input = wrap.querySelector('.w2aa-input');
        const send = wrap.querySelector('.w2aa-send');
        const modelSel = wrap.querySelector('.w2aa-model');

        fab.addEventListener('click', () => (panel.classList.contains('open') ? close() : open()));
        wrap.querySelector('.w2aa-x').addEventListener('click', close);
        wrap.querySelector('.w2aa-gear').addEventListener('click', () => {
            const base = location.pathname.includes('/web2/')
                ? '../ai-assistant/index.html'
                : '/web2/ai-assistant/index.html';
            location.href = base;
        });
        modelSel.addEventListener('change', () => {
            const v = modelSel.value;
            if (v === 'auto') saveCfg({ autoModel: true, provider: '', model: '' });
            else {
                const [provider, model] = v.split('|');
                saveCfg({ autoModel: false, provider, model: model || '' });
            }
        });
        // Chuyển chế độ: Hỏi đáp ↔ Ghép đồ ↔ Card/Video ↔ Viết mô tả.
        wrap.querySelectorAll('.w2aa-mode').forEach((b) =>
            b.addEventListener('click', () => showMode(b.dataset.mode))
        );
        send.addEventListener('click', () => {
            const v = input.value.trim();
            if (v) {
                input.value = '';
                input.style.height = 'auto';
                ask(v);
            }
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send.click();
            }
        });
        input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = Math.min(110, input.scrollHeight) + 'px';
        });
        return _root;
    }

    function open() {
        if (!cfg.enabled) return;
        ensureUi();
        loadHistory();
        _root.querySelector('.w2aa-panel').classList.add('open');
        showMode(_mode); // khôi phục chế độ đang chọn (chat hoặc 1 công cụ)
    }
    function close() {
        if (_root) _root.querySelector('.w2aa-panel').classList.remove('open');
    }

    // Chuyển chế độ panel: 'chat' (hỏi đáp) hoặc 1 công cụ (tryon/content/describe).
    // Công cụ lazy-load module shared + mount 1 lần vào toolpane riêng (giữ state).
    async function showMode(mode) {
        if (!_root) return;
        if (!TOOL_DEFS[mode] && mode !== 'chat') mode = 'chat';
        _mode = mode;
        const panel = _root.querySelector('.w2aa-panel');
        const chat = _root.querySelector('.w2aa-chat');
        const tool = _root.querySelector('.w2aa-tool');
        _root
            .querySelectorAll('.w2aa-mode')
            .forEach((b) => b.classList.toggle('is-on', b.dataset.mode === mode));
        const wide = mode !== 'chat' && TOOL_DEFS[mode]?.wide;
        panel.classList.toggle('w2aa-panel--wide', !!wide);

        if (mode === 'chat') {
            chat.hidden = false;
            tool.hidden = true;
            render();
            setTimeout(() => _root.querySelector('.w2aa-input')?.focus(), 40);
            return;
        }
        chat.hidden = true;
        tool.hidden = false;
        tool.querySelectorAll('.w2aa-toolpane').forEach(
            (p) => (p.hidden = p.dataset.tool !== mode)
        );
        // Đã mount HOẶC đang mount (lazy-load dở) → KHÔNG mount lần 2 (click nhanh 2 lần
        // khi đang tải module qua mạng sẽ tạo 2 instance, instance đầu bị mồ côi listener/abort).
        if (_tools[mode] || _mounting[mode]) return;
        const pane = tool.querySelector(`.w2aa-toolpane[data-tool="${mode}"]`);
        const def = TOOL_DEFS[mode];
        _mounting[mode] = true;
        pane.innerHTML = '<div class="w2aa-toolload">Đang tải công cụ…</div>';
        try {
            await def.ensure();
            if (_mode !== mode || _tools[mode]) return; // user đã đổi chế độ / đã mount khi đang tải
            pane.innerHTML = '';
            _tools[mode] = def.mount(pane);
        } catch (e) {
            pane.innerHTML = `<div class="w2aa-toolerr">⚠️ Không tải được công cụ: ${esc(
                e.message || e
            )}</div>`;
        } finally {
            _mounting[mode] = false;
        }
    }

    let _busy = false;
    let _abort = null;
    let _authRedirecting = false;
    async function ask(text) {
        if (_busy || !text || !cfg.enabled) return;
        _busy = true;
        ensureUi();
        _root.querySelector('.w2aa-panel').classList.add('open');
        if (_mode !== 'chat') showMode('chat'); // câu hỏi luôn hiển thị ở chế độ Hỏi đáp
        const askedPath = location.pathname;
        history.push({ role: 'user', content: text });
        history.push({ role: 'ai', content: '', pending: true });
        capHistory();
        render();
        _abort = new AbortController();
        let rafPending = false;
        const onDelta = (acc) => {
            history[history.length - 1] = { role: 'ai', content: acc, pending: true };
            if (!rafPending) {
                rafPending = true;
                requestAnimationFrame(() => {
                    rafPending = false;
                    patchLast();
                });
            }
        };
        try {
            const msgs = history
                .filter((m) => m.content && !m.pending)
                .slice(-8)
                .map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }));
            const reply = await callAiStream(msgs, onDelta);
            history[history.length - 1] = { role: 'ai', content: reply };
        } catch (e) {
            if (e.name === 'AbortError')
                history[history.length - 1] = { role: 'ai', content: '⏹ Đã dừng.' };
            else {
                history[history.length - 1] = {
                    role: 'ai',
                    content: '⚠️ ' + (e.message || 'Lỗi gọi AI'),
                };
                if (e.code === 401 && !_authRedirecting && global.Web2Auth?.requireAuth) {
                    _authRedirecting = true;
                    setTimeout(() => global.Web2Auth.requireAuth(), 1500);
                }
            }
        } finally {
            _busy = false;
            _abort = null;
            // Trang đã đổi giữa lúc chờ → KHÔNG ghi đè vào trang mới.
            if (location.pathname === askedPath) {
                capHistory();
                saveHistory();
                render();
            }
        }
    }

    // bật/tắt thật sự (đóng panel + ẩn FAB + chặn open/ask khi tắt).
    function applyEnabledState() {
        if (!_root) return;
        _root.querySelector('.w2aa-fab').hidden = !cfg.enabled;
        if (!cfg.enabled) close();
    }
    function reloadConfig() {
        cfg = loadCfg();
        applyEnabledState();
        // cập nhật dropdown model nếu panel đang mở
        const sel = _root && _root.querySelector('.w2aa-model');
        if (sel)
            sel.value = cfg.autoModel || !cfg.provider ? 'auto' : cfg.provider + '|' + cfg.model;
    }

    function mount() {
        cfg = loadCfg();
        if (!cfg.enabled) return;
        if (/\/web2\/login\//.test(location.pathname) || HIDE_RE.test(location.pathname)) return;
        ensureUi();
        applyEnabledState();
    }

    global.Web2AiAssistant = {
        open,
        close,
        ask,
        mount,
        reloadConfig,
        pageContext,
        loadCfg,
        CFG_KEY,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(mount, 300));
    } else {
        setTimeout(mount, 300);
    }
})(window);
