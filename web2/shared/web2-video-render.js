// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — render HTML→MP4 qua máy shop (HyperFrames).
/**
 * Web2VideoRender — client tự dò MÁY SHOP đang chạy `hyperframes-render` (engine=
 * 'hyperframes' trong registry CHUNG web2-vieneu-registry) → POST HTML composition →
 * nhận MP4. Bổ sung cho video-maker in-browser (render HD deterministic).
 *
 * API:
 *   Web2VideoRender.listMachines()                 → [{name,url,ageSec}]
 *   Web2VideoRender.pickOnline()                    → url máy online đầu tiên | null
 *   Web2VideoRender.render({html, machineUrl?, signal}) → { blob, url } (object URL MP4)
 *
 * KHÔNG có máy online → throw lỗi rõ ràng (UI hướng dẫn bật máy).
 */
(function (global) {
    'use strict';

    function workerUrl() {
        return (
            global.WEB2_CONFIG?.WORKER_URL ||
            global.API_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        );
    }
    const REGISTRY = () => workerUrl() + '/api/web2-vieneu-registry';
    function token() {
        try {
            return global.Web2Auth?.getStored?.()?.token || '';
        } catch (_) {
            return '';
        }
    }

    async function listMachines() {
        try {
            const r = await fetch(REGISTRY() + '/list?engine=hyperframes', { cache: 'no-store' });
            const j = await r.json();
            return (j && j.servers) || [];
        } catch (_) {
            return [];
        }
    }

    // Probe /health (timeout 4s) — trả url máy phản hồi đầu tiên.
    async function pickOnline() {
        const machines = await listMachines();
        for (const m of machines) {
            const u = String(m.url || '').replace(/\/+$/, '');
            if (!u) continue;
            try {
                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), 4000);
                const r = await fetch(u + '/health', { signal: ctrl.signal });
                clearTimeout(t);
                if (r.ok) return u;
            } catch (_) {}
        }
        return null;
    }

    async function render({ html, machineUrl, signal } = {}) {
        if (!html || !/<\w+/.test(html)) throw new Error('Thiếu HTML composition để render');
        const u = (machineUrl || (await pickOnline()) || '').replace(/\/+$/, '');
        if (!u) {
            throw new Error(
                'Chưa có máy render online. Bật "hyperframes-render" trên máy shop (xem hyperframes-render/README.md) rồi thử lại.'
            );
        }
        const r = await fetch(u + '/render', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token() ? { 'x-web2-token': token() } : {}),
            },
            body: JSON.stringify({ html }),
            signal,
        });
        if (!r.ok) {
            let msg = 'Render lỗi (HTTP ' + r.status + ')';
            try {
                const j = await r.json();
                msg = j.error || msg;
            } catch (_) {}
            throw new Error(msg);
        }
        const blob = await r.blob();
        return { blob, url: URL.createObjectURL(blob) };
    }

    global.Web2VideoRender = { listMachines, pickOnline, render };
})(window);
