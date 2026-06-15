// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Tra cứu vận đơn J&T (app).
(function () {
    'use strict';

    const WORKER = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const API = `${WORKER}/api/web2-jt-tracking`;
    const LOTTIE_DIR = 'lottie';
    const DEFAULT_CELL = '8674';

    // status → nhãn/màu/icon/lottie (đồng bộ với CSS tokens)
    const STATUS = {
        delivered: {
            label: 'Đã giao',
            icon: 'package-check',
            cls: 'delivered',
            hero: '#16a34a',
            lottie: 'success',
        },
        delivering: {
            label: 'Đang giao',
            icon: 'truck',
            cls: 'delivering',
            hero: '#2563eb',
            lottie: 'truck',
        },
        transit: {
            label: 'Trung chuyển',
            icon: 'route',
            cls: 'transit',
            hero: '#6366f1',
            lottie: 'truck',
        },
        returned: {
            label: 'Đã hoàn',
            icon: 'undo-2',
            cls: 'returned',
            hero: '#ea580c',
            lottie: null,
        },
        problem: {
            label: 'Vấn đề',
            icon: 'alert-triangle',
            cls: 'problem',
            hero: '#dc2626',
            lottie: null,
        },
        pending: {
            label: 'Chưa tra',
            icon: 'clock',
            cls: 'pending',
            hero: '#64748b',
            lottie: null,
        },
        not_found: {
            label: 'Không thấy',
            icon: 'search-x',
            cls: 'notfound',
            hero: '#b45309',
            lottie: null,
        },
    };
    const ST = (s) => STATUS[s] || STATUS.pending;

    const KPI_ORDER = [
        'total',
        'delivering',
        'transit',
        'returned',
        'problem',
        'delivered',
        'pending',
        'not_found',
        'approved',
    ];
    const KPI_META = {
        total: { label: 'Tất cả', accent: 'var(--jt-primary)' },
        delivering: { label: 'Đang giao', accent: 'var(--st-delivering)' },
        transit: { label: 'Trung chuyển', accent: 'var(--st-transit)' },
        returned: { label: 'Đã hoàn', accent: 'var(--st-returned)' },
        problem: { label: 'Vấn đề', accent: 'var(--st-problem)' },
        delivered: { label: 'Đã giao', accent: 'var(--st-delivered)' },
        pending: { label: 'Chưa tra', accent: 'var(--st-pending)' },
        not_found: { label: 'Không thấy', accent: 'var(--st-notfound)' },
        approved: { label: 'Đã duyệt', accent: '#0d9488' },
    };

    const APPROVE_TTL_DAYS = 7;
    const state = { list: [], kpi: {}, status: 'all', search: '' };
    const $ = (id) => document.getElementById(id);
    const esc = (s) =>
        String(s == null ? '' : s).replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    const notify = (m, t) => window.notificationManager?.show?.(m, t || 'info');
    const icons = () => window.lucide && lucide.createIcons();

    function AUTHH(extra) {
        if (window.Web2Auth?.authHeaders) return window.Web2Auth.authHeaders(extra);
        try {
            const t = JSON.parse(localStorage.getItem('web2_auth'))?.token;
            return t ? { ...(extra || {}), 'x-web2-token': t } : { ...(extra || {}) };
        } catch {
            return { ...(extra || {}) };
        }
    }
    async function api(path, opts = {}) {
        const res = await fetch(API + path, {
            method: opts.method || 'GET',
            headers: AUTHH(opts.body ? { 'Content-Type': 'application/json' } : {}),
            body: opts.body ? JSON.stringify(opts.body) : undefined,
        });
        const j = await res.json().catch(() => ({ success: false, error: 'Phản hồi lỗi' }));
        if (!res.ok || !j.success) throw new Error(j.error || 'HTTP ' + res.status);
        return j;
    }

    // ── time (GMT+7) ────────────────────────────────────────────────
    function relTime(epoch) {
        if (!epoch) return '';
        const diff = Date.now() - Number(epoch);
        const m = Math.round(diff / 60000);
        if (m < 1) return 'vừa xong';
        if (m < 60) return m + ' phút trước';
        const h = Math.round(m / 60);
        if (h < 24) return h + ' giờ trước';
        const d = Math.round(h / 24);
        return d + ' ngày trước';
    }

    // ── Lottie (lazy + registry để destroy) ─────────────────────────
    const _anims = new Map();
    function playLottie(elId, name, loop) {
        const el = $(elId);
        if (!el || !window.lottie || !name) return;
        try {
            const a = lottie.loadAnimation({
                container: el,
                renderer: 'svg',
                loop: loop !== false,
                autoplay: true,
                path: `${LOTTIE_DIR}/${name}.json`,
            });
            _anims.set(elId, a);
        } catch (e) {
            /* graceful: bỏ qua nếu lottie lỗi */
        }
    }
    function destroyLottie(elId) {
        const a = _anims.get(elId);
        if (a) {
            try {
                a.destroy();
            } catch {}
            _anims.delete(elId);
        }
    }

    // ── KPI ─────────────────────────────────────────────────────────
    function renderKpi() {
        const k = state.kpi || {};
        $('jtKpis').innerHTML = KPI_ORDER.map((key) => {
            const n = key === 'total' ? k.total || 0 : k[key] || 0;
            const meta = KPI_META[key];
            const active = (key === 'total' && state.status === 'all') || state.status === key;
            return `<button class="jt-kpi ${active ? 'is-active' : ''}" data-st="${key}" style="--accent:${meta.accent}" type="button">
                <div class="jt-kpi-num">${n}</div>
                <div class="jt-kpi-label"><span class="dot"></span>${meta.label}</div>
            </button>`;
        }).join('');
    }

    // Nhớ SĐT đã gắn thẻ "XỬ LÝ BC" (hiển thị nút đã-gắn qua nhiều lần load).
    const TAGGED_KEY = 'jt_tagged_phones';
    function loadTagged() {
        try {
            return new Set(JSON.parse(localStorage.getItem(TAGGED_KEY) || '[]'));
        } catch {
            return new Set();
        }
    }
    const _taggedPhones = loadTagged();
    let _jtGroupConvId = null; // conv id nhóm J&T (suy từ row có sẵn) → nút chat cho mọi row
    function _saveTagged() {
        try {
            localStorage.setItem(TAGGED_KEY, JSON.stringify([..._taggedPhones]));
        } catch {}
    }
    // persist=true (mặc định) → ghi DB để đồng bộ đa máy; false khi đang nạp TỪ DB (tránh vòng).
    function _persistTag(phone, tagged) {
        api('/bc-tag', { method: 'POST', body: { phone, tagged } }).catch(() => {});
    }
    function markTagged(phone, persist) {
        if (!phone) return;
        const changed = !_taggedPhones.has(phone);
        _taggedPhones.add(phone);
        _saveTagged();
        if (changed && persist !== false) _persistTag(phone, true);
    }
    function unmarkTagged(phone, persist) {
        if (!phone) return;
        const changed = _taggedPhones.delete(phone);
        _saveTagged();
        if (changed && persist !== false) _persistTag(phone, false);
    }
    // Nạp tập SĐT đã gắn thẻ TỪ DB (nguồn đồng bộ đa máy) → cập nhật _taggedPhones + cache.
    async function loadBcTags() {
        try {
            const j = await api('/bc-tags');
            const set = new Set(j.phones || []);
            _taggedPhones.clear();
            set.forEach((p) => _taggedPhones.add(p));
            _saveTagged();
        } catch (e) {
            /* offline → giữ cache localStorage */
        }
    }
    // Cập nhật mọi nút tag cùng SĐT → trạng thái đã-gắn / chưa-gắn.
    function setTagButtons(phone, tagged) {
        document
            .querySelectorAll(`[data-act="tag"][data-phone="${CSS.escape(phone)}"]`)
            .forEach((b) => {
                b.classList.toggle('is-tagged', tagged);
                b.title = tagged
                    ? 'Khách đã gắn thẻ XỬ LÝ BC (bấm để GỠ)'
                    : 'Gắn thẻ Pancake: XỬ LÝ BC';
                // ⚠ Lucide đã thay <i data-lucide> bằng <svg> sau lần render đầu → đổi
                // data-lucide trên <i> cũ KHÔNG vẽ lại (querySelector('i') còn trả null).
                // Thay HẲN icon con bằng <i data-lucide> mới rồi cho lucide vẽ lại → đổi
                // ngay tag↔badge-check không cần refresh.
                b.innerHTML = `<i data-lucide="${tagged ? 'badge-check' : 'tag'}"></i>`;
            });
        icons();
    }
    // Custom confirm (thay window.confirm) → Promise<bool>.
    function jtConfirm(message, okLabel, kind) {
        return new Promise((resolve) => {
            const mount = $('jtModalMount');
            mount.innerHTML = `<div class="jt-msg-back" id="jtCfBack">
                <div class="jt-msg-modal" style="width:min(380px,100%)" role="dialog" aria-modal="true">
                    <div class="jt-msg-head"><span><i data-lucide="alert-triangle"></i> Xác nhận</span></div>
                    <div class="jt-msg-who" style="white-space:pre-line;line-height:1.5">${esc(message)}</div>
                    <div class="jt-msg-foot">
                        <button class="jt-btn jt-btn-ghost" id="jtCfNo" type="button">Hủy</button>
                        <button class="jt-btn ${kind === 'danger' ? 'jt-btn-danger' : 'jt-btn-primary'}" id="jtCfYes" type="button">${esc(okLabel || 'OK')}</button>
                    </div>
                </div></div>`;
            icons();
            requestAnimationFrame(() => $('jtCfBack')?.classList.add('show'));
            const done = (v) => {
                const b = $('jtCfBack');
                if (b) {
                    b.classList.remove('show');
                    setTimeout(() => (mount.innerHTML = ''), 180);
                }
                resolve(v);
            };
            $('jtCfYes').onclick = () => done(true);
            $('jtCfNo').onclick = () => done(false);
            $('jtCfBack').onclick = (e) => {
                if (e.target.id === 'jtCfBack') done(false);
            };
        });
    }

    // Tách SĐT + tên khách từ dòng đơn ("<mã>\tShop NHI JUDY 01\t<tiền>\t<tên>\t<sđt>\t<note>").
    function parseOrderInfo(src) {
        const s = String(src || '');
        const m = s.match(/\b0\d{8,10}\b/);
        const phone = m ? m[0] : '';
        let name = '';
        if (phone) {
            const parts = s
                .split(/\t|\s{2,}/)
                .map((x) => x.trim())
                .filter(Boolean);
            const idx = parts.findIndex((p) => p.includes(phone));
            if (idx > 0)
                name = parts[idx - 1]
                    .replace(/-+\s*-+.*$/, '') // bỏ đuôi "- -76-10/06/2026"
                    .replace(/[-\s]+$/, '')
                    .trim();
        }
        return { phone, name };
    }

    // ── List ────────────────────────────────────────────────────────
    // tô đậm mã 12 số (bấm copy) + SĐT (bấm → mở modal nhắn tin Zalo/Pancake).
    function fmtSrcMsg(s) {
        const raw = String(s || '');
        const info = parseOrderInfo(raw);
        let h = esc(raw);
        h = h.replace(
            /\b(\d{12})\b/g,
            '<b class="jt-code" data-copy="$1" role="button" tabindex="0" title="Bấm để copy mã đơn">$1</b>'
        );
        const nameAttr = info.name ? ` data-msg-name="${esc(info.name)}"` : '';
        h = h.replace(
            /\b(0\d{8,10})\b/g,
            (mm, p1) =>
                `<span class="jt-phone" data-msg-phone="${p1}"${nameAttr} role="button" tabindex="0" title="Nhắn tin cho khách (Zalo / Pancake)">${p1}</span>`
        );
        return h;
    }
    function copyText(t) {
        const v = String(t || '').trim();
        if (!v) return;
        const ok = () => notify('Đã copy: ' + v, 'success');
        if (navigator.clipboard?.writeText) {
            navigator.clipboard
                .writeText(v)
                .then(ok)
                .catch(() => fallbackCopy(v, ok));
        } else fallbackCopy(v, ok);
    }
    function fallbackCopy(v, ok) {
        try {
            const ta = document.createElement('textarea');
            ta.value = v;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            ok();
        } catch {
            notify('Copy lỗi', 'error');
        }
    }
    function approvedTag(approvedAt) {
        if (!approvedAt) return '';
        const daysGone = Math.floor((Date.now() - Number(approvedAt)) / 86400000);
        const left = Math.max(0, APPROVE_TTL_DAYS - daysGone);
        return `<span class="jt-approved-tag"><i data-lucide="check-circle-2"></i> Đã duyệt · tự xoá sau ${left} ngày</span>`;
    }
    function rowHtml(r) {
        const s = ST(r.status);
        const approved = !!r.approved_at;
        const code = esc(r.billcode); // luôn 12 số, vẫn esc để chắc chắn an toàn attr
        const when = r.latest_at_text
            ? `${esc(r.latest_at_text)} · ${esc(relTime(r.latest_at))}`
            : 'Chưa tra cứu';
        // nút mở chat nhóm J&T: dùng conv của row, hoặc fallback conv nhóm J&T (suy từ row khác)
        // → mã dán tay (không có zalo_conv_id) vẫn mở được nhóm + nhảy tới tin có mã.
        const convForChat = r.zalo_conv_id || _jtGroupConvId;
        const chatBtn = convForChat
            ? `<button class="jt-icobtn chat" data-act="chat" data-conv="${esc(convForChat)}" data-billcode="${code}" title="Mở chat nhóm Zalo + tìm tới tin có mã"><i data-lucide="message-circle"></i></button>`
            : '';
        const info = parseOrderInfo(r.src_message);
        const tagged = info.phone && _taggedPhones.has(info.phone);
        const tagBtn = info.phone
            ? `<button class="jt-icobtn tag ${tagged ? 'is-tagged' : ''}" data-act="tag" data-phone="${esc(info.phone)}" title="${tagged ? 'Khách đã gắn thẻ XỬ LÝ BC (bấm để GỠ)' : 'Gắn thẻ Pancake: XỬ LÝ BC'}"><i data-lucide="${tagged ? 'badge-check' : 'tag'}"></i></button>`
            : '';
        const right = `${chatBtn}${tagBtn}<button class="jt-icobtn" data-act="refresh" data-code="${code}" title="Làm mới"><i data-lucide="refresh-cw"></i></button>
            ${
                approved
                    ? `<button class="jt-icobtn" data-act="unapprove" data-code="${code}" title="Trở lại (bỏ duyệt)"><i data-lucide="rotate-ccw"></i></button>`
                    : `<button class="jt-icobtn approve" data-act="approve" data-code="${code}" title="Duyệt (đã xử lý xong)"><i data-lucide="check"></i></button>`
            }`;
        return `<div class="jt-row ${approved ? 'is-approved' : ''}" data-open="${code}" role="button" tabindex="0">
            <div class="jt-row-status" style="--bg:var(--st-${s.cls}-bg);--fg:var(--st-${s.cls})"><i data-lucide="${s.icon}"></i></div>
            <div class="jt-row-mid">
                <div class="jt-row-code">
                    <span class="jt-code" data-copy="${code}" role="button" tabindex="0" title="Bấm để copy mã đơn">${code}</span>
                    <span class="jt-badge" style="--bg:var(--st-${s.cls}-bg);--fg:var(--st-${s.cls})">${s.label}</span>
                    ${approvedTag(r.approved_at)}
                </div>
                <div class="jt-row-last">${esc(r.latest_event || 'Chưa có thông tin từ J&T')}</div>
                ${r.src_message ? `<div class="jt-row-msg" title="Tin nhắn nhóm chứa mã">${fmtSrcMsg(r.src_message)}</div>` : ''}
                <div class="jt-row-meta">
                    <span class="src">${r.source === 'zalo' ? 'Zalo' : 'Nhập tay'}</span>
                    <span>${when}</span>
                    ${r.note ? `<span>· ${esc(r.note)}</span>` : ''}
                </div>
            </div>
            <div class="jt-row-right">${right}</div>
        </div>`;
    }

    function renderList() {
        const box = $('jtList');
        const items = state.list;
        // suy conv nhóm J&T từ row có sẵn → nút chat hiện cho cả mã dán tay (thiếu zalo_conv_id)
        _jtGroupConvId = (items.find((r) => r.zalo_conv_id) || {}).zalo_conv_id || _jtGroupConvId;
        $('jtCount').textContent = items.length ? `${items.length} vận đơn` : '';
        if (!items.length) {
            destroyLottie('jtEmptyLot');
            box.innerHTML = `<div class="jt-state">
                <div class="lottie" id="jtEmptyLot"></div>
                <h3>${state.search || state.status !== 'all' ? 'Không có kết quả' : 'Chưa có vận đơn'}</h3>
                <p>Bấm <b>Quét Zalo</b> để gom mã từ tin nhắn, hoặc nhập mã 12 số ở ô phía trên.</p>
            </div>`;
            playLottie('jtEmptyLot', 'truck');
            return;
        }
        box.innerHTML = items.map(rowHtml).join('');
        icons();
    }

    async function load() {
        try {
            const q = new URLSearchParams();
            if (state.status !== 'all') q.set('status', state.status);
            if (state.search) q.set('search', state.search);
            // /list + tập SĐT đã gắn thẻ (DB) song song → render đúng nút đã-gắn đa máy.
            const [j] = await Promise.all([api('/list?' + q.toString()), loadBcTags()]);
            state.list = j.data || [];
            state.kpi = j.kpi || {};
            renderKpi();
            renderList();
        } catch (e) {
            $('jtList').innerHTML =
                `<div class="jt-state"><h3>Lỗi tải</h3><p>${esc(e.message)}</p></div>`;
        }
    }

    // ── Timeline modal ──────────────────────────────────────────────
    function fmtDesc(desc) {
        // escape rồi tô đậm các đoạn 【...】 (J&T highlight)
        return esc(desc).replace(/【([^】]*)】/g, '<span class="jt-hl">【$1】</span>');
    }
    function timelineHtml(events) {
        if (!events || !events.length)
            return `<div class="jt-state" style="padding:24px"><h3>Chưa có hành trình</h3><p>J&amp;T chưa trả dữ liệu cho mã này (hoặc sai mã / SĐT gửi).</p></div>`;
        return `<div class="jt-timeline">${events
            .map(
                (
                    e,
                    i
                ) => `<div class="jt-tl-item ${i === 0 ? 'is-latest' : ''}" style="--dot:${ST(deriveFromDesc(e.desc)).hero}">
                    <span class="jt-tl-dot"></span>
                    <div class="jt-tl-when"><span class="t">${esc(e.time || '')}</span><span>${esc(e.date || '')}</span></div>
                    <div class="jt-tl-desc">${fmtDesc(e.desc || '')}</div>
                </div>`
            )
            .join('')}</div>`;
    }
    // màu dot theo nội dung từng event (nhẹ — chỉ cho timeline)
    function deriveFromDesc(d) {
        d = (d || '').toLowerCase();
        // mirror deriveStatus backend (audit 121 sự kiện J&T thật) — kết cục dứt khoát trước 'thành công'
        const failed = /(không thành công|chưa thành công)/.test(d);
        if (/(chuyển hoàn|hoàn hàng|hoàn về|trả hàng|trả về)/.test(d)) return 'returned';
        if (failed || /(từ chối|kiện khó|không liên lạc|đổi ý|thất bại|hủy|sự cố)/.test(d))
            return 'problem';
        if (/(ký nhận|giao hàng thành công|giao thành công|phát thành công)/.test(d))
            return 'delivered';
        if (/(đang giao|phát lại|đang tiến hành|giao hàng)/.test(d)) return 'delivering';
        return 'transit';
    }

    async function openTimeline(billcode) {
        const mount = $('jtModalMount');
        // dọn lottie của modal cũ (nếu mở nhanh liên tiếp) → tránh leak.
        destroyLottie('jtHeroLot');
        destroyLottie('jtLoadLot');
        mount.innerHTML = `<div class="jt-modal-back" id="jtBack">
            <div class="jt-modal" role="dialog" aria-modal="true">
                <div class="jt-modal-hero" id="jtHero" style="--hero:#334155">
                    <div class="lottie" id="jtHeroLot"></div>
                    <div class="jt-modal-hero-txt">
                        <div class="code">${esc(billcode)}</div>
                        <div class="stat" id="jtHeroStat">Đang tải…</div>
                    </div>
                    <button class="jt-modal-close" id="jtClose" aria-label="Đóng"><i data-lucide="x"></i></button>
                </div>
                <div class="jt-modal-body" id="jtBody">
                    <div class="jt-state" style="padding:30px"><div class="lottie" id="jtLoadLot" style="width:120px;height:120px"></div></div>
                </div>
            </div>
        </div>`;
        icons();
        requestAnimationFrame(() => $('jtBack')?.classList.add('show'));
        playLottie('jtLoadLot', 'loading');
        const close = () => {
            destroyLottie('jtHeroLot');
            destroyLottie('jtLoadLot');
            const b = $('jtBack');
            if (b) {
                b.classList.remove('show');
                setTimeout(() => (mount.innerHTML = ''), 220);
            }
        };
        $('jtClose').onclick = close;
        $('jtBack').onclick = (e) => {
            if (e.target.id === 'jtBack') close();
        };
        document.addEventListener('keydown', function onEsc(ev) {
            if (ev.key === 'Escape') {
                close();
                document.removeEventListener('keydown', onEsc);
            }
        });

        try {
            const j = await api('/' + billcode);
            const r = j.data || {};
            const s = ST(r.status);
            destroyLottie('jtLoadLot');
            $('jtHero').style.setProperty('--hero', s.hero);
            $('jtHeroStat').innerHTML =
                `${s.label}${r.latest_at_text ? ` · ${esc(r.latest_at_text)}` : ''}`;
            if (s.lottie) playLottie('jtHeroLot', s.lottie);
            else
                $('jtHeroLot').innerHTML =
                    `<i data-lucide="${s.icon}" style="width:48px;height:48px;color:#fff"></i>`;
            const msgBlock = r.src_message
                ? `<div class="jt-row-msg" style="margin:0 0 16px"><div style="font-size:11px;font-weight:700;color:var(--jt-ink-mute);margin-bottom:4px">TIN NHẮN NHÓM</div>${fmtSrcMsg(r.src_message)}</div>`
                : '';
            $('jtBody').innerHTML = msgBlock + timelineHtml(r.events || []);
            icons();
        } catch (e) {
            destroyLottie('jtLoadLot');
            $('jtHeroStat').textContent = 'Lỗi';
            $('jtBody').innerHTML =
                `<div class="jt-state" style="padding:24px"><h3>Không tải được</h3><p>${esc(e.message)}</p></div>`;
        }
    }

    // Sau khi chat mount: tìm tin nhắn chứa mã → cuộn tới + nháy sáng. Nếu chưa thấy,
    // bấm "Tải tin cũ hơn" vài lần (mã đơn thường cũ hơn 100 tin gần nhất).
    function findMessageInChat(code) {
        if (!code) return;
        let tries = 0;
        let olderClicks = 0;
        const timer = setInterval(() => {
            tries++;
            const body = document.querySelector('#jtChatBody .wz-chat-body');
            const msgs = body ? body.querySelectorAll('.wz-msg') : [];
            const target = [...msgs].reverse().find((m) => (m.textContent || '').includes(code));
            if (target) {
                body.querySelectorAll('.jt-msg-hit').forEach((el) =>
                    el.classList.remove('jt-msg-hit')
                );
                target.classList.add('jt-msg-hit'); // giữ highlight (không tự tắt) tới khi mở mã khác
                clearInterval(timer);
                // Cuộn TỨC THÌ (không 'smooth') + RE-ASSERT ~1.4s: ảnh/avatar phía trên load
                // lazy làm layout dịch → 1 lần scroll dễ trượt (tin nằm dưới khung, user
                // tưởng không highlight). Lặp lại để bám đúng tin tới khi layout ổn định.
                let re = 0;
                const bring = () => {
                    try {
                        target.scrollIntoView({ block: 'center', behavior: 'auto' });
                    } catch (e) {
                        /* phần tử có thể bị remount — bỏ qua */
                    }
                };
                bring();
                const reTimer = setInterval(() => {
                    bring();
                    if (++re >= 7) clearInterval(reTimer);
                }, 200);
                return;
            }
            // chưa thấy → tải tin cũ hơn (tối đa 8 lần) nếu nhóm còn lưu tin cũ
            const older = body && body.querySelector('#wzcvOlder');
            if (older && olderClicks < 8) {
                older.click();
                olderClicks++;
                return;
            }
            // Không còn tin cũ để tải (đã hết) mà vẫn chưa thấy → tin gốc KHÔNG nằm trong
            // nhóm đã lưu (vd mã 'dán lịch sử' — tin chưa qua hệ thống lưu). Báo rõ.
            if (!older && body && tries > 4) {
                clearInterval(timer);
                notify(
                    `Mã ${code} không có tin trong nhóm Zalo đã lưu (mã dán tay / tin cũ chưa lưu) — nhóm đã mở để bạn xem.`,
                    'info'
                );
                return;
            }
            if (tries > 40) {
                clearInterval(timer);
                notify('Không tìm thấy tin có mã trong nhóm Zalo.', 'info');
            }
        }, 250);
    }

    // ── Chat drawer (mở hội thoại nhóm Zalo nguồn của mã) ───────────
    let _chatHandle = null;
    function openChat(convId, billcode) {
        if (!window.Web2Zalo || !window.Web2Zalo.mountChat) {
            notify('Engine chat chưa sẵn sàng', 'warning');
            return;
        }
        const mount = $('jtChatMount');
        mount.innerHTML = `<div class="jt-drawer-back" id="jtChatBack">
            <div class="jt-drawer" role="dialog" aria-modal="true" aria-label="Chat nhóm Zalo">
                <div class="jt-drawer-head">
                    <span><i data-lucide="message-circle"></i> Chat nhóm Zalo</span>
                    <button class="jt-drawer-close" id="jtChatClose" aria-label="Đóng"><i data-lucide="x"></i></button>
                </div>
                <div class="jt-drawer-body"><div id="jtChatBody"></div></div>
            </div>
        </div>`;
        icons();
        requestAnimationFrame(() => $('jtChatBack')?.classList.add('show'));
        const close = () => {
            try {
                _chatHandle?.destroy?.();
            } catch {}
            _chatHandle = null;
            const b = $('jtChatBack');
            if (b) {
                b.classList.remove('show');
                setTimeout(() => (mount.innerHTML = ''), 220);
            }
        };
        $('jtChatClose').onclick = close;
        $('jtChatBack').onclick = (e) => {
            if (e.target.id === 'jtChatBack') close();
        };
        document.addEventListener('keydown', function onEsc(ev) {
            if (ev.key === 'Escape') {
                close();
                document.removeEventListener('keydown', onEsc);
            }
        });
        window.Web2Zalo.mountChat('#jtChatBody', { convId, autoSeen: true })
            .then((h) => {
                _chatHandle = h;
                if (!h)
                    $('jtChatBody').innerHTML =
                        '<div class="jt-state" style="padding:24px"><h3>Không mở được</h3><p>Hội thoại Zalo không còn tồn tại.</p></div>';
                else if (billcode) findMessageInChat(billcode); // cuộn tới tin có mã
            })
            .catch((e) => {
                $('jtChatBody').innerHTML =
                    `<div class="jt-state" style="padding:24px"><h3>Lỗi</h3><p>${esc(e.message)}</p></div>`;
            });
    }

    // ── Actions ─────────────────────────────────────────────────────
    function setBusy(btn, on, labelHtml) {
        if (!btn) return;
        if (on) {
            btn.dataset._html = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = `<span class="jt-spin"></span>${labelHtml || ''}`;
        } else {
            btn.disabled = false;
            if (btn.dataset._html) btn.innerHTML = btn.dataset._html;
        }
    }

    async function quickAdd(e) {
        e.preventDefault();
        const raw = $('jtQaCode').value || '';
        const cell =
            ($('jtQaCell').value || DEFAULT_CELL).replace(/\D/g, '').slice(-4) || DEFAULT_CELL;
        const codes = [...new Set(raw.match(/\d{12}/g) || [])];
        if (!codes.length) return notify('Nhập mã 12 số (vd 802762251204)', 'warning');
        const btn = $('jtQaBtn');
        setBusy(btn, true, ' Đang tra…');
        try {
            if (codes.length === 1) {
                await api('/track', {
                    method: 'POST',
                    body: { billcode: codes[0], cellphone: cell, source: 'manual' },
                });
                $('jtQaCode').value = '';
                await load();
                openTimeline(codes[0]);
            } else {
                await api('/add', { method: 'POST', body: { codes } });
                await api('/refresh', { method: 'POST', body: { codes } });
                $('jtQaCode').value = '';
                notify(`Đã thêm + tra ${codes.length} mã`, 'success');
                await load();
            }
        } catch (err) {
            notify('✗ ' + err.message, 'error');
        } finally {
            setBusy(btn, false);
        }
    }

    async function scanZalo() {
        const btn = $('jtScan');
        setBusy(btn, true, ' Đang quét…');
        try {
            const j = await api('/scan', { method: 'POST' });
            notify(`Quét xong: ${j.found} mã, thêm mới ${j.added}`, 'success');
            await load();
            if (j.added) refreshAll(); // tự tra các mã mới
        } catch (e) {
            notify('✗ ' + e.message, 'error');
        } finally {
            setBusy(btn, false);
        }
    }

    // Đọc lịch sử nhóm Zalo (zca, 14 ngày) → quét đơn CŨ / bị thiếu.
    async function scanHistory() {
        const btn = $('jtScanHistory');
        setBusy(btn, true, ' Đang đọc lịch sử…');
        try {
            const j = await api('/scan-history', {
                method: 'POST',
                body: { days: 14, count: 1000 },
            });
            const reach = j.oldestDate ? ` (tới ${j.oldestDate})` : '';
            const more = j.more ? ' · Zalo còn tin cũ hơn nhưng API không lấy sâu được' : '';
            notify(
                `Lịch sử ${j.days || 14} ngày: đọc ${j.fetched} tin${reach} · ${j.found} mã · thêm mới ${j.added}${more}` +
                    (j.errors?.length ? ` (${j.errors.length} nhóm lỗi)` : ''),
                j.added ? 'success' : 'info'
            );
            await load();
            if (j.added) refreshAll(); // tự tra các mã mới
        } catch (e) {
            notify('✗ ' + e.message, 'error');
        } finally {
            setBusy(btn, false);
        }
    }

    // Dán text copy từ Zalo (Web/PC) → quét mã đơn cũ (bù lịch sử Zalo API không trả).
    function openPasteModal() {
        const script = (document.getElementById('jtZaloScript')?.textContent || '').trim();
        const mount = $('jtModalMount');
        mount.innerHTML = `<div class="jt-msg-back" id="jtPasteBack">
            <div class="jt-msg-modal jt-paste-modal" role="dialog" aria-modal="true" aria-label="Lấy lịch sử Zalo">
                <div class="jt-msg-head">
                    <span><i data-lucide="clipboard-paste"></i> Lấy lịch sử từ Zalo Web</span>
                    <button class="jt-msg-x" id="jtPasteClose" aria-label="Đóng"><i data-lucide="x"></i></button>
                </div>
                <ol class="jt-paste-steps">
                    <li>Mở <b>chat.zalo.me</b> → vào nhóm J&amp;T → cuộn lên cho tin cũ hiện ra.</li>
                    <li>Nhấn <b>F12</b> → tab <b>Console</b>.</li>
                    <li>Bấm <b>Copy script</b> → dán vào Console → Enter. Một <b>ô xanh hiện góc phải</b> màn hình Zalo (tự cuộn ~30–45s). Bỏ qua dòng "Promise pending" của Console.</li>
                    <li>Khi ô báo <b>"XONG - N ma"</b>: kết quả đã bôi đen + copy sẵn. Quay lại đây, dán (<b>Ctrl+V</b>) vào ô dưới → <b>Quét mã</b>.</li>
                </ol>
                <div class="jt-paste-script">
                    <div class="jt-paste-script-head">
                        <span><i data-lucide="terminal"></i> Script (chạy trong Console Zalo Web)</span>
                        <button class="jt-btn jt-btn-ghost jt-btn-sm" id="jtCopyScript" type="button"><i data-lucide="copy"></i> Copy script</button>
                    </div>
                    <textarea id="jtScriptBox" class="jt-paste-code" rows="5" readonly spellcheck="false">${esc(script)}</textarea>
                </div>
                <label class="jt-paste-label" for="jtPasteText">Kết quả script (dán vào đây — hoặc dán text copy tay từ Zalo):</label>
                <textarea id="jtPasteText" class="jt-msg-text" rows="6" placeholder="Dán kết quả script / nội dung chat từ Zalo vào đây…"></textarea>
                <div class="jt-msg-foot">
                    <button class="jt-btn jt-btn-ghost" id="jtPasteCancel" type="button">Hủy</button>
                    <button class="jt-btn jt-btn-primary" id="jtPasteSubmit" type="button"><i data-lucide="search"></i> Quét mã</button>
                </div>
            </div>
        </div>`;
        icons();
        requestAnimationFrame(() => $('jtPasteBack')?.classList.add('show'));
        const close = () => {
            const b = $('jtPasteBack');
            if (b) {
                b.classList.remove('show');
                setTimeout(() => (mount.innerHTML = ''), 200);
            }
        };
        $('jtPasteClose').onclick = close;
        $('jtPasteCancel').onclick = close;
        $('jtPasteBack').onclick = (e) => {
            if (e.target.id === 'jtPasteBack') close();
        };
        $('jtCopyScript').onclick = async () => {
            try {
                await navigator.clipboard.writeText(script);
            } catch {
                const t = $('jtScriptBox');
                t.focus();
                t.select();
                document.execCommand('copy');
            }
            notify('Đã copy script — dán vào Console Zalo Web', 'success');
        };
        setTimeout(() => $('jtPasteText')?.focus(), 60);
        $('jtPasteSubmit').onclick = async () => {
            const text = $('jtPasteText').value.trim();
            if (!text) {
                notify('Chưa có nội dung dán', 'warning');
                return;
            }
            const btn = $('jtPasteSubmit');
            setBusy(btn, true, ' Đang quét…');
            try {
                const j = await api('/scan-text', {
                    method: 'POST',
                    body: { text, convId: _jtGroupConvId || undefined },
                });
                const msgPart = j.messagesAdded ? ` · nạp ${j.messagesAdded} tin vào chat` : '';
                notify(
                    `Tìm ${j.found} mã · thêm mới ${j.added}${msgPart}`,
                    j.added || j.messagesAdded ? 'success' : 'info'
                );
                close();
                await load();
                if (j.added) refreshAll();
            } catch (e) {
                notify('✗ ' + e.message, 'error');
            } finally {
                setBusy(btn, false);
            }
        };
    }

    let _refreshing = false;
    async function refreshAll() {
        if (_refreshing) return; // tránh 2 vòng refresh chạy song song (scan + nút)
        _refreshing = true;
        const btn = $('jtRefreshAll');
        setBusy(btn, true, ' Đang làm mới…');
        try {
            let guard = 0;
            let r;
            do {
                r = await api('/refresh', { method: 'POST' });
                guard++;
            } while (r.remaining && guard < 20);
            await load();
            notify('Đã làm mới trạng thái', 'success');
        } catch (e) {
            notify('✗ ' + e.message, 'error');
        } finally {
            setBusy(btn, false);
            _refreshing = false;
        }
    }

    async function rowAction(act, code) {
        // refresh = tra cứu J&T server-side (NẶNG) → giữ await + reload (không optimistic).
        if (act === 'refresh') {
            try {
                await api('/track', { method: 'POST', body: { billcode: code } });
                notify('Đã làm mới ' + code, 'success');
                await load();
            } catch (e) {
                notify('✗ ' + e.message, 'error');
            }
            return;
        }
        // approve / unapprove (duyệt): UI-FIRST — đổi trạng thái + mờ row NGAY,
        // backend chạy ngầm, lỗi thì rollback. SSE web2:jt-tracking reload authoritative.
        const row = state.list.find((r) => String(r.billcode) === String(code));
        const prev = row ? row.approved_at : undefined;
        const next = act === 'approve' ? Date.now() : null;
        const apply = () => {
            if (row) {
                row.approved_at = next;
                renderList();
                renderKpi();
            }
        };
        const rollback = () => {
            if (row) {
                row.approved_at = prev;
                renderList();
                renderKpi();
            }
        };
        const run = () => api('/' + code + '/' + act, { method: 'POST' });
        const opts = {
            snapshot: prev,
            apply,
            run,
            rollback,
            successMsg: act === 'approve' ? 'Đã duyệt — tự xoá sau 7 ngày' : 'Đã bỏ duyệt',
            errLabel: (act === 'approve' ? 'duyệt ' : 'bỏ duyệt ') + code,
        };
        if (window.Web2Optimistic?.run) {
            window.Web2Optimistic.run(opts);
        } else {
            apply();
            run().catch(() => {
                rollback();
                notify('✗ Lỗi ' + opts.errLabel, 'error');
            });
        }
    }

    // ── Wire up ─────────────────────────────────────────────────────
    function debounce(fn, ms) {
        let t;
        return (...a) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...a), ms);
        };
    }

    // ── Nhắn tin khách (Zalo / Pancake) + tag Pancake ──────────────
    // Danh sách pageId Pancake của shop (từ accounts đã lưu — giống web2/customers).
    function getPancakePageIds() {
        const set = new Set();
        try {
            const accs = JSON.parse(localStorage.getItem('pancake_all_accounts') || '{}');
            for (const v of Object.values(accs)) {
                for (const p of Array.isArray(v?.pages) ? v.pages : []) {
                    const pid = p?.id || p?.page_id || p?.pageId;
                    if (pid) set.add(String(pid));
                }
            }
        } catch {}
        const pat = window.Web2Chat?.getAllPageAccessTokens?.() || {};
        for (const k of Object.keys(pat)) set.add(String(k));
        return [...set].filter(Boolean);
    }

    // Tìm hội thoại Pancake INBOX theo SĐT (quét mọi page). Trả {pageId,convId,customerId,name} | null.
    async function resolvePancakeConv(phone) {
        if (!window.Web2Chat?.searchConversations) return null;
        try {
            await window.Web2Chat.syncFromRenderDB?.();
        } catch {}
        const pageIds = getPancakePageIds();
        if (!pageIds.length) return null;
        const q = String(phone || '').replace(/\s+/g, '');
        const settled = await Promise.allSettled(
            pageIds.map((pid) => window.Web2Chat.searchConversations(pid, q))
        );
        let best = null;
        for (let i = 0; i < settled.length; i++) {
            const r = settled[i];
            if (r.status !== 'fulfilled' || !r.value?.ok) continue;
            for (const c of r.value.conversations || []) {
                if (!c.id) continue;
                const cust = c.customers?.[0] || {};
                const cand = {
                    pageId: String(c.page_id || c.fb_page_id || pageIds[i] || ''),
                    convId: c.id,
                    customerId: cust.id || null,
                    name: cust.name || cust.full_name || c.name || '',
                    isInbox: (c.type || '').toUpperCase() === 'INBOX',
                    tags: Array.isArray(c.tags) ? c.tags : [], // thẻ HIỆN TẠI của hội thoại (2 chiều)
                };
                if (!best || (cand.isInbox && !best.isInbox)) best = cand;
            }
        }
        return best;
    }

    // Bấm SĐT → mở FULL chat khách (Pancake + Zalo) qua launcher dùng chung Web2CustomerChat.
    function openMsgModal(phone, name) {
        if (!phone) return;
        if (window.Web2CustomerChat?.open) window.Web2CustomerChat.open({ phone, name });
        else notify('Khung chat chưa sẵn sàng', 'warning');
    }

    // Gắn / GỠ thẻ Pancake "XỬ LÝ BC" — TOGGLE theo trạng thái THẬT trên Pancake (2 chiều):
    // đã có thẻ → hỏi (custom confirm) rồi gỡ; chưa có → gắn. Đồng bộ nút + localStorage.
    async function tagPancake(phone, btn) {
        if (!phone) return;
        const TAG_NAME = 'xử lý bc';
        if (btn) {
            btn.disabled = true;
            btn.classList.add('is-busy');
        }
        try {
            if (!window.Web2Chat?.fetchTags) {
                notify('Pancake chưa sẵn sàng', 'warning');
                return;
            }
            const conv = await resolvePancakeConv(phone);
            if (!conv) {
                notify('Không tìm thấy hội thoại Pancake cho SĐT này', 'warning');
                return;
            }
            const tagsRes = await window.Web2Chat.fetchTags(conv.pageId);
            if (!tagsRes.ok) {
                notify('Không lấy được danh sách thẻ Pancake', 'error');
                return;
            }
            const tag = (tagsRes.tags || []).find(
                (t) =>
                    String(t.text || t.name || '')
                        .trim()
                        .toLowerCase() === TAG_NAME
            );
            if (!tag) {
                notify('Page chưa có thẻ "XỬ LÝ BC"', 'warning');
                return;
            }
            const tagId = tag.id ?? tag.tag_id;
            // Trạng thái THẬT trên Pancake: hội thoại có sẵn thẻ này chưa?
            const has = Array.isArray(conv.tags)
                ? conv.tags.some((t) => String(t?.id ?? t?.tag_id ?? t) === String(tagId))
                : _taggedPhones.has(phone);
            // đồng bộ hiển thị về đúng trạng thái thật trước khi thao tác
            if (has) markTagged(phone);
            else unmarkTagged(phone);
            setTagButtons(phone, has);

            if (has) {
                const ok = await jtConfirm(
                    'Khách đã có thẻ "XỬ LÝ BC" trên Pancake.\nGỡ thẻ này?',
                    'Gỡ thẻ',
                    'danger'
                );
                if (!ok) return;
                const r = await window.Web2Chat.toggleTag(
                    conv.pageId,
                    conv.convId,
                    tagId,
                    'remove'
                );
                if (r.ok) {
                    notify('Đã gỡ thẻ "XỬ LÝ BC"', 'success');
                    unmarkTagged(phone);
                    setTagButtons(phone, false);
                } else notify('Gỡ thẻ lỗi: ' + (r.reason || ''), 'error');
            } else {
                const r = await window.Web2Chat.toggleTag(conv.pageId, conv.convId, tagId, 'add');
                if (r.ok) {
                    notify('Đã gắn thẻ "XỬ LÝ BC" cho khách', 'success');
                    markTagged(phone);
                    setTagButtons(phone, true);
                } else notify('Gắn thẻ lỗi: ' + (r.reason || ''), 'error');
            }
        } catch (e) {
            notify('Lỗi: ' + e.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('is-busy');
            }
        }
    }

    function init() {
        // Sidebar KHÔNG tự mount — phải gọi tay (giống các trang Báo cáo khác).
        if (window.Web2Sidebar)
            window.Web2Sidebar.mount('#web2Aside', { activeUrl: window.location.href });
        // Capture-phase — chặn TRƯỚC click row/modal:
        //  • mã đơn (data-copy) → copy.  • SĐT (data-msg-phone) → mở modal nhắn tin.
        document.addEventListener(
            'click',
            (e) => {
                const cp = e.target.closest('[data-copy]');
                if (cp) {
                    e.stopPropagation();
                    e.preventDefault();
                    copyText(cp.dataset.copy);
                    return;
                }
                const ph = e.target.closest('[data-msg-phone]');
                if (ph) {
                    e.stopPropagation();
                    e.preventDefault();
                    openMsgModal(ph.dataset.msgPhone, ph.dataset.msgName || '');
                }
            },
            true
        );
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const cp = e.target.closest?.('[data-copy]');
            if (cp) {
                e.stopPropagation();
                e.preventDefault();
                copyText(cp.dataset.copy);
                return;
            }
            const ph = e.target.closest?.('[data-msg-phone]');
            if (ph) {
                e.stopPropagation();
                e.preventDefault();
                openMsgModal(ph.dataset.msgPhone, ph.dataset.msgName || '');
            }
        });
        icons();
        $('jtQuickForm').addEventListener('submit', quickAdd);
        $('jtScan').addEventListener('click', scanZalo);
        $('jtScanHistory')?.addEventListener('click', scanHistory);
        $('jtPaste')?.addEventListener('click', openPasteModal);
        $('jtRefreshAll').addEventListener('click', refreshAll);
        $('jtKpis').addEventListener('click', (e) => {
            const k = e.target.closest('.jt-kpi');
            if (!k) return;
            state.status = k.dataset.st === 'total' ? 'all' : k.dataset.st;
            load();
        });
        $('jtSearch').addEventListener(
            'input',
            debounce((e) => {
                state.search = e.target.value.trim();
                load();
            }, 350)
        );
        $('jtList').addEventListener('click', (e) => {
            const ab = e.target.closest('[data-act]');
            if (ab) {
                e.stopPropagation();
                if (ab.dataset.act === 'chat') openChat(ab.dataset.conv, ab.dataset.billcode);
                else if (ab.dataset.act === 'tag') tagPancake(ab.dataset.phone, ab);
                else rowAction(ab.dataset.act, ab.dataset.code);
                return;
            }
            const row = e.target.closest('[data-open]');
            if (row) openTimeline(row.dataset.open);
        });
        $('jtList').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const row = e.target.closest('[data-open]');
                if (row) openTimeline(row.dataset.open);
            }
        });

        // SSE realtime: mã được scan/track/xoá ở tab/máy khác → reload (debounce)
        const reload = debounce(load, 600);
        if (window.Web2SSE?.subscribe) window.Web2SSE.subscribe('web2:jt-tracking', reload);

        load();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
