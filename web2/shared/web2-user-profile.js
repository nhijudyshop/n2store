// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Hồ sơ user + đổi avatar DiceBear (dùng chung mọi trang).
// =====================================================================
// Web2UserProfile: modal "Thông tin tài khoản" mở từ footer sidebar.
//   - avatarUrl(stored) → URL DiceBear từ config JSON {style,seed,bg} (nguồn URL 1 chỗ).
//   - open() → xem info user hiện tại + đổi avatar (DiceBear) self-service.
// Lưu CẤU HÌNH {style,seed,bg} (KHÔNG lưu URL) → đổi version/base 1 chỗ. Render <img src>.
// Backend self-service: PATCH /api/web2-users/me/avatar (requireWeb2Auth, chỉ chính mình).
// DiceBear HTTP API 10.x, format SVG cho <img>. Chỉ dùng style KHÔNG cần ghi nguồn
// (CC0 + free-commercial Pablo Stanley): an toàn bản quyền cho tool nội bộ.
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2UserProfile) return;

    // Đường dẫn script này → suy ra path web2-dicebear-customizer.js (cùng folder shared)
    // để lazy-load khi user mở "Tuỳ chỉnh chi tiết" (không nạp ở trang không mở hồ sơ).
    const _selfSrc = (document.currentScript && document.currentScript.src) || '';
    function ensureCustomizer() {
        return new Promise((res) => {
            if (global.Web2DicebearCustomizer) return res(true);
            if (!_selfSrc) return res(false);
            const url = _selfSrc.replace(
                /web2-user-profile\.js.*$/,
                'web2-dicebear-customizer.js?v=20260624a'
            );
            const s = document.createElement('script');
            s.src = url;
            s.onload = () => res(!!global.Web2DicebearCustomizer);
            s.onerror = () => res(false);
            document.head.appendChild(s);
        });
    }

    const DICEBEAR_BASE = 'https://api.dicebear.com/10.x';
    // Style avatar MẶC ĐỊNH (user chưa tự đặt) — DÙNG CHUNG bảng users + footer sidebar +
    // preview hồ sơ để đồng nhất. Đổi 1 chỗ áp dụng mọi nơi.
    const DEFAULT_STYLE = 'lorelei';
    // style → nhãn. Nguồn: DiceBear (free, generator avatar chibi/hoạt hình bằng "seed",
    // KHÔNG tốn API — thay cho hướng "ảnh thật → chibi" của Nano Banana trả phí). Nhóm
    // 🎨 Chibi / Cute dẫn đầu (adventurer/big-smile/miniavs/micah/personas/croodles).
    const STYLES = [
        // ── Chibi / Cute (hoạt hình dễ thương) ──
        { id: 'adventurer', label: 'Chibi' },
        { id: 'big-smile', label: 'Cười tươi' },
        { id: 'miniavs', label: 'Mini' },
        { id: 'micah', label: 'Micah' },
        { id: 'personas', label: 'Nhân vật' },
        { id: 'croodles', label: 'Doodle' },
        // ── Hoạt hình / minh hoạ khác ──
        { id: 'lorelei', label: 'Lorelei' },
        { id: 'notionists', label: 'Notion' },
        { id: 'open-peeps', label: 'Peeps' },
        { id: 'avataaars', label: 'Avataaars' },
        { id: 'fun-emoji', label: 'Emoji' },
        { id: 'bottts', label: 'Robot' },
        // ── Trừu tượng / chữ ──
        { id: 'pixel-art', label: 'Pixel' },
        { id: 'thumbs', label: 'Thumbs' },
        { id: 'shapes', label: 'Shapes' },
        { id: 'identicon', label: 'Identicon' },
        { id: 'rings', label: 'Rings' },
        { id: 'initials', label: 'Chữ cái' },
    ];
    const BGS = [
        'transparent',
        'b6e3f4',
        'c0aede',
        'd1d4f9',
        'ffd5dc',
        'ffdfbf',
        'c7f0d8',
        'transparent',
    ];
    const BG_SWATCHES = ['transparent', 'b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf', 'c7f0d8'];

    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        return String(s == null ? '' : s).replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }

    // Build URL DiceBear từ config (string JSON / object / URL cũ).
    function avatarUrl(stored) {
        if (!stored) return null;
        let cfg = stored;
        if (typeof stored === 'string') {
            if (/^https?:\/\//.test(stored)) return stored; // back-compat nếu lỡ lưu URL
            try {
                cfg = JSON.parse(stored);
            } catch {
                return null;
            }
        }
        if (!cfg || !cfg.style || !cfg.seed) return null;
        const p = new URLSearchParams({ seed: String(cfg.seed) });
        // DiceBear chỉ chấp nhận backgroundColor là HEX (^#?[0-9a-f]{3,8}$). Giá trị
        // 'transparent' → API trả 400 (ảnh vỡ). Nền trong suốt = OMIT backgroundColor
        // (mặc định DiceBear vốn đã trong suốt). Chỉ set khi là mã màu hex hợp lệ.
        if (cfg.bg && cfg.bg !== 'transparent' && /^[0-9a-fA-F]{3,8}$/.test(cfg.bg)) {
            p.set('backgroundColor', cfg.bg);
        }
        // Tuỳ chỉnh chi tiết (tóc/mắt/kính/màu… từ Web2DicebearCustomizer) — mọi param
        // DiceBear hỗ trợ, lưu trong cfg.options. Bỏ giá trị rỗng.
        if (cfg.options && typeof cfg.options === 'object') {
            Object.keys(cfg.options).forEach((k) => {
                const v = cfg.options[k];
                if (v === null || v === undefined || v === '') return;
                p.set(k, String(v));
            });
        }
        return `${DICEBEAR_BASE}/${encodeURIComponent(cfg.style)}/svg?${p.toString()}`;
    }

    // Avatar cho 1 user: custom nếu đã đặt, KHÔNG thì sinh MẶC ĐỊNH từ username (style
    // DEFAULT_STYLE) → đồng nhất mọi nơi (bảng users, footer, preview). Trả null nếu
    // không có cả username (không suy ra được seed).
    function avatarUrlFor(user) {
        if (!user) return null;
        if (user.avatar) {
            const u = avatarUrl(user.avatar);
            if (u) return u;
        }
        const seed = user.username || user.id || '';
        if (!seed) return null;
        return avatarUrl({ style: DEFAULT_STYLE, seed: String(seed), bg: 'transparent' });
    }

    function randSeed() {
        // Không dùng Math.random nhạy cảm — chỉ seed avatar, ngẫu nhiên là OK.
        return Math.random().toString(36).slice(2, 10);
    }

    function fmtTs(ts) {
        if (!ts) return '—';
        try {
            return new Intl.DateTimeFormat('vi-VN', {
                timeZone: 'Asia/Ho_Chi_Minh',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            }).format(new Date(Number(ts)));
        } catch {
            return '—';
        }
    }

    const ROLE_LABEL = {
        admin: 'Quản trị viên',
        manager: 'Quản lý',
        staff: 'Nhân viên',
        viewer: 'Chỉ xem',
    };

    function injectCss() {
        if (document.getElementById('web2-user-profile-css')) return;
        const st = document.createElement('style');
        st.id = 'web2-user-profile-css';
        st.textContent = `
.w2up-backdrop{position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;}
.w2up-modal{background:#fff;border-radius:16px;width:min(560px,100%);max-height:90vh;overflow:auto;box-shadow:0 24px 60px rgba(0,0,0,.28);}
.w2up-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #eef2f5;position:sticky;top:0;background:#fff;z-index:1;}
.w2up-head h2{margin:0;font-size:1.1rem;font-weight:700;color:#0f172a;}
.w2up-x{border:none;background:#f1f5f9;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:18px;color:#475569;line-height:1;}
.w2up-x:hover{background:#e2e8f0;}
.w2up-body{padding:18px 20px;}
.w2up-hero{display:flex;flex-direction:column;align-items:center;gap:8px;margin-bottom:8px;}
.w2up-preview{width:96px;height:96px;border-radius:50%;background:#f1f5f9;border:1px solid #e2e8f0;object-fit:cover;}
.w2up-name{font-weight:700;font-size:1.05rem;color:#0f172a;}
.w2up-handle{font-size:.85rem;color:#64748b;}
.w2up-role-pill{display:inline-block;margin-top:2px;padding:2px 10px;border-radius:999px;font-size:.72rem;font-weight:600;background:#eef2ff;color:#4338ca;}
.w2up-sec{margin-top:18px;}
.w2up-sec-h{font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:#94a3b8;margin-bottom:8px;}
.w2up-styles{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;}
.w2up-style{border:2px solid transparent;border-radius:12px;padding:4px;background:#f8fafc;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;}
.w2up-style img{width:100%;aspect-ratio:1;border-radius:8px;background:#fff;}
.w2up-style span{font-size:.62rem;color:#64748b;line-height:1;}
.w2up-style.sel{border-color:#2563eb;background:#eff6ff;}
.w2up-row{display:flex;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap;}
.w2up-seed{flex:1;min-width:140px;height:38px;border:1px solid #d6dee2;border-radius:9px;padding:0 12px;font:inherit;}
.w2up-btn{height:38px;border-radius:9px;border:1px solid #d6dee2;background:#fff;padding:0 14px;cursor:pointer;font:inherit;font-weight:600;color:#334155;display:inline-flex;align-items:center;gap:6px;}
.w2up-btn:hover{background:#f1f5f9;}
.w2up-btn-primary{background:#2563eb;border-color:#2563eb;color:#fff;}
.w2up-btn-primary:hover{background:#1d4ed8;}
.w2up-bgs{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;}
.w2up-bg{width:30px;height:30px;border-radius:50%;border:2px solid #e2e8f0;cursor:pointer;background-size:cover;}
.w2up-bg.sel{border-color:#2563eb;box-shadow:0 0 0 2px #bfdbfe;}
.w2up-bg-transparent{background:linear-gradient(45deg,#e2e8f0 25%,transparent 25%,transparent 75%,#e2e8f0 75%),linear-gradient(45deg,#e2e8f0 25%,#fff 25%,#fff 75%,#e2e8f0 75%);background-size:10px 10px;background-position:0 0,5px 5px;}
.w2up-info{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:.9rem;}
.w2up-info dt{color:#94a3b8;}
.w2up-info dd{margin:0;color:#0f172a;font-weight:500;}
.w2up-adv-toggle{width:100%;text-align:left;border:1px dashed #cbd5e1;background:#f8fafc;border-radius:10px;padding:9px 12px;cursor:pointer;font:inherit;font-weight:600;font-size:.84rem;color:#334155;display:flex;align-items:center;justify-content:space-between;}
.w2up-adv-toggle:hover{background:#f1f5f9;border-color:#94a3b8;}
.w2up-adv-toggle .chev{transition:transform .15s;}
.w2up-adv-toggle[aria-expanded="true"] .chev{transform:rotate(180deg);}
.w2up-adv{margin-top:10px;}
.w2up-adv[hidden]{display:none!important;}
.w2up-foot{display:flex;align-items:center;gap:8px;padding:14px 20px;border-top:1px solid #eef2f5;position:sticky;bottom:0;background:#fff;}
.w2up-foot .spacer{flex:1;}
.w2up-reset{border:none;background:none;color:#64748b;cursor:pointer;font:inherit;text-decoration:underline;}
@media(max-width:560px){.w2up-styles{grid-template-columns:repeat(4,1fr);}}
`;
        document.head.appendChild(st);
    }

    function close() {
        document.querySelector('.w2up-backdrop')?.remove();
    }

    function toast(msg, type) {
        if (global.notificationManager?.show) global.notificationManager.show(msg, type || 'info');
        else if (global.Popup?.[type === 'error' ? 'error' : 'success'])
            global.Popup[type === 'error' ? 'error' : 'success'](msg);
    }

    async function saveAvatar(cfg) {
        const auth = global.Web2Auth;
        const stored = auth && auth.getStored && auth.getStored();
        if (!stored) throw new Error('Chưa đăng nhập');
        const headers = auth.authHeaders
            ? auth.authHeaders({ 'Content-Type': 'application/json' })
            : { 'Content-Type': 'application/json', 'x-web2-token': stored.token };
        const res = await fetch(`${auth.API}/me/avatar`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ avatar: cfg ? JSON.stringify(cfg) : null }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.success) {
            // Lỗi hay gặp nhất khi "lưu nhưng không cập nhật": token Web 2.0 hết hạn
            // → 401 (WEB2_AUTH_ENFORCE). Báo RÕ để user đăng nhập lại thay vì tưởng bug.
            if (res.status === 401 || res.status === 403) {
                throw new Error(
                    'Phiên đăng nhập Web 2.0 đã hết hạn — hãy đăng xuất/đăng nhập lại rồi đổi avatar.'
                );
            }
            throw new Error(j.error || 'Lưu avatar lỗi (HTTP ' + res.status + ')');
        }
        // Cập nhật user trong localStorage + refresh footer sidebar (mọi trang).
        auth.storeLogin({ token: stored.token, expiresAt: stored.expiresAt, user: j.user });
        const aside = document.querySelector('.web2-aside');
        if (aside && global.Web2Sidebar?.renderUserFooter)
            global.Web2Sidebar.renderUserFooter(aside);
        return j.user;
    }

    function open() {
        const auth = global.Web2Auth;
        const user = (auth && auth.getStored && auth.getStored()?.user) || null;
        if (!user) {
            toast('Chưa đăng nhập.', 'error');
            return;
        }
        injectCss();
        close();

        // State avatar: từ config đã lưu, hoặc mặc định (style lorelei + seed = username).
        let cfg = null;
        try {
            cfg = user.avatar
                ? typeof user.avatar === 'string'
                    ? JSON.parse(user.avatar)
                    : user.avatar
                : null;
        } catch {
            cfg = null;
        }
        const state = {
            style: (cfg && cfg.style) || DEFAULT_STYLE,
            seed: (cfg && cfg.seed) || user.username || 'user',
            bg: (cfg && cfg.bg) || 'transparent',
            options:
                cfg && cfg.options && typeof cfg.options === 'object' ? { ...cfg.options } : {},
        };

        const back = document.createElement('div');
        back.className = 'w2up-backdrop';
        back.innerHTML = `
          <div class="w2up-modal" role="dialog" aria-modal="true">
            <div class="w2up-head">
              <h2>Thông tin tài khoản</h2>
              <button class="w2up-x" type="button" aria-label="Đóng">✕</button>
            </div>
            <div class="w2up-body">
              <div class="w2up-hero">
                <img class="w2up-preview" id="w2upPreview" alt="avatar">
                <div class="w2up-name">${esc(user.displayName || user.username)}</div>
                <div class="w2up-handle">@${esc(user.username)}</div>
                <span class="w2up-role-pill">${esc(ROLE_LABEL[user.role] || user.role || '')}</span>
              </div>

              <div class="w2up-sec">
                <div class="w2up-sec-h">Đổi avatar</div>
                <div class="w2up-styles" id="w2upStyles"></div>
                <div class="w2up-row">
                  <input class="w2up-seed" id="w2upSeed" value="${esc(state.seed)}" placeholder="Mã tạo avatar (seed)">
                  <button class="w2up-btn" id="w2upRand" type="button">🎲 Ngẫu nhiên</button>
                </div>
                <div class="w2up-bgs" id="w2upBgs"></div>

                <div class="w2up-row" style="margin-top:14px;display:block">
                  <button type="button" class="w2up-adv-toggle" id="w2upAdvToggle" aria-expanded="false">
                    <span>🎨 Tuỳ chỉnh chi tiết (tóc, mắt, kính, phụ kiện, màu…)</span>
                    <span class="chev">▾</span>
                  </button>
                  <div class="w2up-adv" id="w2upAdv" hidden></div>
                </div>
              </div>

              <div class="w2up-sec">
                <div class="w2up-sec-h">Chi tiết</div>
                <dl class="w2up-info">
                  <dt>Email</dt><dd>${esc(user.email || '—')}</dd>
                  <dt>SĐT</dt><dd>${esc(user.phone || '—')}</dd>
                  <dt>Vai trò</dt><dd>${esc(ROLE_LABEL[user.role] || user.role || '—')}</dd>
                  <dt>Đăng nhập gần nhất</dt><dd>${esc(fmtTs(user.lastLoginAt))}</dd>
                  <dt>Tạo lúc</dt><dd>${esc(fmtTs(user.createdAt))}</dd>
                </dl>
              </div>
            </div>
            <div class="w2up-foot">
              <button class="w2up-reset" id="w2upReset" type="button">Khôi phục chữ cái</button>
              <span class="spacer"></span>
              <button class="w2up-btn" id="w2upCancel" type="button">Huỷ</button>
              <button class="w2up-btn w2up-btn-primary" id="w2upSave" type="button">Lưu</button>
            </div>
          </div>`;
        document.body.appendChild(back);

        const $ = (id) => back.querySelector(id);
        const previewEl = $('#w2upPreview');
        const stylesEl = $('#w2upStyles');
        const bgsEl = $('#w2upBgs');
        const seedEl = $('#w2upSeed');
        let customizerCtl = null; // controller Web2DicebearCustomizer (lazy khi mở)

        function refreshPreview() {
            previewEl.src = avatarUrl(state) || '';
        }
        function refreshStyles() {
            stylesEl.innerHTML = STYLES.map(
                (s) =>
                    `<button class="w2up-style ${s.id === state.style ? 'sel' : ''}" type="button" data-style="${s.id}" title="${esc(s.label)}">
                        <img src="${avatarUrl({ style: s.id, seed: state.seed, bg: state.bg })}" alt="${esc(s.label)}" loading="lazy">
                        <span>${esc(s.label)}</span>
                    </button>`
            ).join('');
            stylesEl.querySelectorAll('.w2up-style').forEach((b) => {
                b.addEventListener('click', () => {
                    state.style = b.dataset.style;
                    stylesEl
                        .querySelectorAll('.w2up-style')
                        .forEach((x) => x.classList.toggle('sel', x === b));
                    // Style khác → variant khác → reset options qua customizer (nếu đang mở).
                    if (customizerCtl) customizerCtl.setStyle(state.style);
                    else state.options = {};
                    refreshPreview();
                });
            });
        }
        function refreshBgs() {
            bgsEl.innerHTML = BG_SWATCHES.map(
                (c) =>
                    `<button class="w2up-bg ${c === 'transparent' ? 'w2up-bg-transparent' : ''} ${c === state.bg ? 'sel' : ''}" type="button" data-bg="${c}" title="${c === 'transparent' ? 'Trong suốt' : '#' + c}" ${c === 'transparent' ? '' : `style="background:#${c}"`}></button>`
            ).join('');
            bgsEl.querySelectorAll('.w2up-bg').forEach((b) => {
                b.addEventListener('click', () => {
                    state.bg = b.dataset.bg;
                    bgsEl
                        .querySelectorAll('.w2up-bg')
                        .forEach((x) => x.classList.toggle('sel', x === b));
                    refreshPreview();
                    refreshStyles();
                });
            });
        }

        refreshPreview();
        refreshStyles();
        refreshBgs();

        let seedT;
        seedEl.addEventListener('input', () => {
            clearTimeout(seedT);
            seedT = setTimeout(() => {
                state.seed = seedEl.value.trim() || user.username || 'user';
                if (customizerCtl) customizerCtl.setSeed(state.seed);
                refreshPreview();
                refreshStyles();
            }, 250);
        });
        $('#w2upRand').addEventListener('click', () => {
            state.seed = randSeed();
            seedEl.value = state.seed;
            if (customizerCtl) customizerCtl.setSeed(state.seed);
            refreshPreview();
            refreshStyles();
        });

        // ── Tuỳ chỉnh chi tiết (lazy mount Web2DicebearCustomizer khi mở lần đầu) ──
        const advToggle = $('#w2upAdvToggle');
        const advBox = $('#w2upAdv');
        let advMounted = false;
        advToggle.addEventListener('click', async () => {
            const open = advToggle.getAttribute('aria-expanded') === 'true';
            advToggle.setAttribute('aria-expanded', open ? 'false' : 'true');
            advBox.hidden = open;
            if (open || advMounted) return;
            advMounted = true;
            advBox.innerHTML =
                '<div style="font-size:.8rem;color:#64748b;padding:8px 0">Đang tải tuỳ chọn…</div>';
            const ok = await ensureCustomizer();
            if (!ok || !global.Web2DicebearCustomizer) {
                advBox.innerHTML =
                    '<div style="font-size:.8rem;color:#b45309;padding:8px 0">Không tải được trình tuỳ chỉnh. Vẫn đổi được style/seed/màu nền.</div>';
                return;
            }
            customizerCtl = global.Web2DicebearCustomizer.mount(advBox, {
                base: DICEBEAR_BASE,
                style: state.style,
                seed: state.seed,
                options: state.options,
                onChange: (opts) => {
                    state.options = opts;
                    refreshPreview();
                },
            });
        });

        $('#w2upX')?.addEventListener('click', close);
        back.querySelector('.w2up-x').addEventListener('click', close);
        $('#w2upCancel').addEventListener('click', close);
        back.addEventListener('click', (e) => {
            if (e.target === back) close();
        });

        $('#w2upReset').addEventListener('click', async () => {
            const btn = $('#w2upReset');
            btn.disabled = true;
            try {
                await saveAvatar(null);
                toast('Đã khôi phục avatar chữ cái.', 'success');
                close();
            } catch (e) {
                toast(e.message, 'error');
                btn.disabled = false;
            }
        });
        $('#w2upSave').addEventListener('click', async () => {
            const btn = $('#w2upSave');
            const orig = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Đang lưu…';
            try {
                const cfg = { style: state.style, seed: state.seed, bg: state.bg };
                if (state.options && Object.keys(state.options).length) cfg.options = state.options;
                await saveAvatar(cfg);
                toast('Đã cập nhật avatar.', 'success');
                close();
            } catch (e) {
                toast(e.message, 'error');
                btn.disabled = false;
                btn.textContent = orig;
            }
        });
    }

    global.Web2UserProfile = {
        open,
        avatarUrl,
        avatarUrlFor,
        DEFAULT_STYLE,
        DICEBEAR_BASE,
        STYLES,
    };
})(window);
