// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Web2BgRemover — TÁCH NỀN ảnh dùng máy shop tự host (free, on-device). DÙNG CHUNG mọi trang.
 *
 * Máy shop chạy `bg-remover/` (rembg + tunnel + heartbeat engine='bgremover') → registry
 * `web2_machine_servers`. Module này: liệt kê máy online (lọc engine=bgremover) + POST ảnh
 * tới máy đã chọn để tách nền. KHÔNG tốn API trả phí (PhotoRoom/withoutbg).
 *
 * API:
 *   Web2BgRemover.listServers(timeoutMs)          → [{name, url, ageSec}]
 *   Web2BgRemover.removeBg(serverUrl, input, opts) → dataURL PNG (input: File|Blob|dataURL|url)
 *   Web2BgRemover.removeBgAuto(input, opts)        → tự chọn máy online đầu tiên → dataURL (throw nếu ko có máy)
 */
(function (global) {
    'use strict';

    function _registryBase() {
        return (
            (global.WEB2_CONFIG && global.WEB2_CONFIG.WORKER_URL) ||
            (global.API_CONFIG && global.API_CONFIG.WORKER_URL) ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        );
    }

    async function listServers(timeoutMs) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs || 7000);
        try {
            const r = await fetch(
                `${_registryBase()}/api/web2-vieneu-registry/list?engine=bgremover`,
                { signal: ctrl.signal }
            );
            if (!r.ok) return [];
            const d = await r.json();
            return (d && d.servers) || [];
        } catch {
            return [];
        } finally {
            clearTimeout(t);
        }
    }

    async function _toBlob(input) {
        if (input instanceof Blob) return input;
        if (typeof input === 'string') return await (await fetch(input)).blob(); // dataURL hoặc url
        throw new Error('input phải là File/Blob/dataURL/url');
    }

    // Gửi ảnh tới máy shop → trả dataURL PNG (nền trong suốt, hoặc nền màu nếu opts.bg='FFFFFF').
    async function removeBg(serverUrl, input, opts) {
        opts = opts || {};
        const base = String(serverUrl).replace(/\/+$/, '');
        const url = base + '/remove' + (opts.bg ? `?bg=${encodeURIComponent(opts.bg)}` : '');
        const blob = await _toBlob(input);
        const fd = new FormData();
        fd.append('file', blob, 'image.png');
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), opts.timeoutMs || 60000);
        try {
            const r = await fetch(url, { method: 'POST', body: fd, signal: ctrl.signal });
            if (!r.ok) throw new Error('Server tách nền lỗi: HTTP ' + r.status);
            const out = await r.blob();
            return await new Promise((res, rej) => {
                const fr = new FileReader();
                fr.onload = () => res(fr.result);
                fr.onerror = () => rej(new Error('đọc ảnh kết quả lỗi'));
                fr.readAsDataURL(out);
            });
        } finally {
            clearTimeout(t);
        }
    }

    async function removeBgAuto(input, opts) {
        const servers = await listServers();
        if (!servers.length) {
            throw new Error(
                'Chưa thấy máy tách nền nào online. Bật server trên máy shop (bg-remover).'
            );
        }
        return removeBg(servers[0].url, input, opts);
    }

    global.Web2BgRemover = { listServers, removeBg, removeBgAuto, registryBase: _registryBase };
})(window);
