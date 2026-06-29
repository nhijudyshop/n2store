// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared.
// =====================================================================
// Web2PutWall — CLIENT đèn PUT-TO-LIGHT cho put-wall (ESP32 + WS2812/WS2811).
// Trang "Quét tem" quét 1 tem → gọi Web2PutWall.light(STT) → ESP32 sáng đúng ô kệ.
// Gửi GET tới TẤT CẢ controller đã cấu hình; con nào trúng dải STT mới sáng (self-filter).
//
// ⚠ MIXED CONTENT: trang HTTPS (nhijudy.store) KHÔNG fetch được ESP32 HTTP (trình duyệt chặn).
//   → Mở trang put-wall qua HTTP LAN (vd http://<ip-máy-shop>:8080/web2/unit-scan/) để dùng đèn.
//   Chi tiết + giải pháp SSE (chạy được trên HTTPS): docs/web2/PUTWALL-LED-SETUP.md
//
// Cấu hình lưu localStorage. KHÔNG phụ thuộc shelf-map (gửi STT toàn cục, ESP32 tự map).
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2PutWall) return;

    const LS = 'web2_putwall_cfg';
    const DEF = { enabled: false, urls: [], color: '#1aff5a', brightness: 160, ms: 0 };

    function cfg() {
        try {
            return { ...DEF, ...JSON.parse(localStorage.getItem(LS) || '{}') };
        } catch (_) {
            return { ...DEF };
        }
    }
    function save(patch) {
        const next = { ...cfg(), ...patch };
        localStorage.setItem(LS, JSON.stringify(next));
        return next;
    }
    function urls() {
        return (cfg().urls || [])
            .map((u) =>
                String(u || '')
                    .trim()
                    .replace(/\/+$/, '')
            )
            .filter(Boolean);
    }
    const hex = (c) =>
        String(c || '')
            .replace('#', '')
            .slice(0, 6) || '1AFF5A';
    const isOn = () => cfg().enabled && urls().length > 0;
    const isHttps = () => location.protocol === 'https:';
    // Cảnh báo mixed-content: HTTPS page + http://ESP32 → bị chặn.
    const willBlock = () => isHttps() && urls().some((u) => /^http:\/\//i.test(u));

    // Fire-and-forget GET tới mọi controller (no-cors: không đọc response, không cần CORS cho /stt).
    function fire(path) {
        if (!isOn()) return;
        urls().forEach((u) => {
            try {
                fetch(u + path, { mode: 'no-cors', cache: 'no-store', keepalive: true }).catch(
                    () => {}
                );
            } catch (_) {}
        });
    }

    // light(stt, {color, ms, keep}) — sáng ô của STT. keep=true → giữ ô cũ (sáng cả "sấp").
    function light(stt, opts = {}) {
        if (stt == null || !isOn()) return;
        const c = cfg();
        const q =
            '/stt?n=' +
            encodeURIComponent(stt) +
            '&c=' +
            hex(opts.color || c.color) +
            '&b=' +
            (Number(c.brightness) || 160) +
            '&ms=' +
            (opts.ms != null ? opts.ms : c.ms || 0) +
            (opts.keep ? '&keep=1' : '');
        fire(q);
    }
    // lightMany(stts, opts) — sáng nhiều ô 1 lúc (vd 1 SP ở nhiều STT). Tắt cũ rồi cộng dồn.
    function lightMany(stts, opts = {}) {
        const list = (stts || []).filter((s) => s != null);
        if (!list.length || !isOn()) return;
        clear();
        list.forEach((s) => light(s, { ...opts, keep: true }));
    }
    function clear() {
        if (!urls().length) return;
        urls().forEach((u) => {
            try {
                fetch(u + '/clear', { mode: 'no-cors', cache: 'no-store' }).catch(() => {});
            } catch (_) {}
        });
    }
    function test() {
        urls().forEach((u) => {
            try {
                fetch(u + '/test', { mode: 'no-cors', cache: 'no-store' }).catch(() => {});
            } catch (_) {}
        });
    }
    // health(url) — CẦN CORS (firmware đã set *). Trả {ok, base, num, ...} hoặc {ok:false,error}.
    async function health(url) {
        const u = String(url || '')
            .trim()
            .replace(/\/+$/, '');
        if (!u) return { ok: false, error: 'no url' };
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 2500);
            const r = await fetch(u + '/health', { cache: 'no-store', signal: ctrl.signal });
            clearTimeout(t);
            return await r.json();
        } catch (e) {
            return { ok: false, error: e.message || 'unreachable' };
        }
    }

    global.Web2PutWall = {
        cfg,
        save,
        urls,
        isOn,
        willBlock,
        light,
        lightMany,
        clear,
        test,
        health,
    };
})(typeof window !== 'undefined' ? window : this);
