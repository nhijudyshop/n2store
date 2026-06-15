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
        'problem',
        'delivered',
        'pending',
        'not_found',
    ];
    const KPI_META = {
        total: { label: 'Tất cả', accent: 'var(--jt-primary)' },
        delivering: { label: 'Đang giao', accent: 'var(--st-delivering)' },
        transit: { label: 'Trung chuyển', accent: 'var(--st-transit)' },
        problem: { label: 'Vấn đề', accent: 'var(--st-problem)' },
        delivered: { label: 'Đã giao', accent: 'var(--st-delivered)' },
        pending: { label: 'Chưa tra', accent: 'var(--st-pending)' },
        not_found: { label: 'Không thấy', accent: 'var(--st-notfound)' },
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

    // ── List ────────────────────────────────────────────────────────
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
        const right = `<button class="jt-icobtn" data-act="refresh" data-code="${code}" title="Làm mới"><i data-lucide="refresh-cw"></i></button>
            ${
                approved
                    ? `<button class="jt-icobtn" data-act="unapprove" data-code="${code}" title="Trở lại (bỏ duyệt)"><i data-lucide="rotate-ccw"></i></button>`
                    : `<button class="jt-icobtn approve" data-act="approve" data-code="${code}" title="Duyệt (đã xử lý xong)"><i data-lucide="check"></i></button>`
            }`;
        return `<div class="jt-row ${approved ? 'is-approved' : ''}" data-open="${code}" role="button" tabindex="0">
            <div class="jt-row-status" style="--bg:var(--st-${s.cls}-bg);--fg:var(--st-${s.cls})"><i data-lucide="${s.icon}"></i></div>
            <div class="jt-row-mid">
                <div class="jt-row-code">${esc(r.billcode)}
                    <span class="jt-badge" style="--bg:var(--st-${s.cls}-bg);--fg:var(--st-${s.cls})">${s.label}</span>
                    ${approvedTag(r.approved_at)}
                </div>
                <div class="jt-row-last">${esc(r.latest_event || 'Chưa có thông tin từ J&T')}</div>
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
            const j = await api('/list?' + q.toString());
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
        if (/(thành công|ký nhận|đã nhận)/.test(d)) return 'delivered';
        if (
            /(từ chối|kiện khó|không liên lạc|đổi ý|thất bại|hoàn hàng|hoàn về|chuyển hoàn|hủy)/.test(
                d
            )
        )
            return 'problem';
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
            $('jtBody').innerHTML = timelineHtml(r.events || []);
            icons();
        } catch (e) {
            destroyLottie('jtLoadLot');
            $('jtHeroStat').textContent = 'Lỗi';
            $('jtBody').innerHTML =
                `<div class="jt-state" style="padding:24px"><h3>Không tải được</h3><p>${esc(e.message)}</p></div>`;
        }
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
        try {
            if (act === 'refresh') {
                await api('/track', { method: 'POST', body: { billcode: code } });
                notify('Đã làm mới ' + code, 'success');
            } else if (act === 'approve') {
                await api('/' + code + '/approve', { method: 'POST' });
                notify('Đã duyệt — tự xoá sau 7 ngày', 'success');
            } else if (act === 'unapprove') {
                await api('/' + code + '/unapprove', { method: 'POST' });
                notify('Đã bỏ duyệt', 'info');
            }
            await load();
        } catch (e) {
            notify('✗ ' + e.message, 'error');
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

    function init() {
        icons();
        $('jtQuickForm').addEventListener('submit', quickAdd);
        $('jtScan').addEventListener('click', scanZalo);
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
                rowAction(ab.dataset.act, ab.dataset.code);
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
