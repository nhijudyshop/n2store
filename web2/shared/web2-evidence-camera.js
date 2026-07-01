// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// web2-evidence-camera.js — CHỤP ẢNH BẰNG CHỨNG dùng chung (Web 2.0).
// Dùng cho: đối soát đóng gói (tích tay → chụp ảnh admin soi lại), và mọi nơi cần
// 1 ảnh JPEG on-demand. 1 nguồn (CLAUDE.md: ≥2 nơi cần → shared, KHÔNG fork).
//
// 2 NGUỒN (tự dò, ưu tiên IP cam):
//   1) KBVision/IP camera qua SIDECAR cục bộ (engine='camera' trong registry
//      web2_machine_servers) → fetch `<sidecar>/snapshot` trả JPEG. Ảnh toàn cảnh.
//   2) Webcam/USB cắm PC qua getUserMedia → warm <video> ẩn → canvas.toBlob. Fallback.
//
// API:
//   Web2EvidenceCamera.init()            → Promise<'kbvision'|'webcam'|null> (dò nguồn)
//   Web2EvidenceCamera.warm()            → Promise<void> (khởi động webcam sẵn sàng; gọi trong user gesture)
//   Web2EvidenceCamera.capture()         → Promise<{blob, source, capturedAt}> (chụp 1 ảnh; throw nếu fail)
//   Web2EvidenceCamera.source()          → 'kbvision'|'webcam'|null
//   Web2EvidenceCamera.stop()            → nhả webcam stream (gọi khi rời trang)
//   Web2EvidenceCamera.blobToBase64(b)   → Promise<string> (data URL → gửi lên finalize)

(function (global) {
    'use strict';
    if (global.Web2EvidenceCamera) return;

    const WORKER_BASE =
        (global.API_CONFIG && global.API_CONFIG.WORKER_URL) ||
        (global.WEB2_CONFIG && global.WEB2_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const REGISTRY_LIST = WORKER_BASE + '/api/web2-vieneu-registry/list?engine=camera';

    const MAX_W = 1280; // downscale webcam để ảnh gọn (~100-200KB)
    const JPEG_Q = 0.72;
    const SIDECAR_TTL = 60000; // cache URL sidecar 60s

    let _source = null; // 'kbvision' | 'webcam' | null
    let _sidecar = { url: null, ts: 0 };
    let _video = null; // <video> warm cho webcam
    let _stream = null;
    let _warming = null; // promise chống warm đôi

    function _log(...a) {
        try {
            console.debug('[Web2EvidenceCamera]', ...a);
        } catch {
            /* ignore */
        }
    }

    // ---- KBVision sidecar detect ----
    async function _findSidecar() {
        if (_sidecar.url && Date.now() - _sidecar.ts < SIDECAR_TTL) return _sidecar.url;
        try {
            const res = await fetch(REGISTRY_LIST, { signal: AbortSignal.timeout(5000) });
            if (!res.ok) return null;
            const data = await res.json();
            const list = (data && (data.servers || data.list || data)) || [];
            for (const s of Array.isArray(list) ? list : []) {
                const u = String((s && s.url) || '').replace(/\/+$/, '');
                if (!u) continue;
                // health check nhanh
                try {
                    const h = await fetch(u + '/health', { signal: AbortSignal.timeout(3000) });
                    if (h.ok) {
                        _sidecar = { url: u, ts: Date.now() };
                        return u;
                    }
                } catch {
                    /* thử server kế */
                }
            }
        } catch {
            /* registry lỗi → không có sidecar */
        }
        return null;
    }

    // ---- Webcam warm ----
    function _ensureVideoEl() {
        if (_video) return _video;
        const v = document.createElement('video');
        v.muted = true;
        v.playsInline = true;
        v.setAttribute('playsinline', '');
        v.style.cssText =
            'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
        document.body.appendChild(v);
        _video = v;
        return v;
    }

    async function warm() {
        if (_stream) return; // đã warm
        if (_warming) return _warming;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Trình duyệt không hỗ trợ camera (getUserMedia)');
        }
        _warming = (async () => {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: false,
            });
            const v = _ensureVideoEl();
            v.srcObject = stream;
            _stream = stream;
            try {
                await v.play();
            } catch {
                /* autoplay muted thường OK */
            }
            _log('webcam warmed');
        })();
        try {
            await _warming;
        } finally {
            _warming = null;
        }
    }

    // ---- init: dò nguồn ----
    async function init() {
        const sc = await _findSidecar();
        if (sc) {
            _source = 'kbvision';
            _log('source = kbvision', sc);
            return _source;
        }
        // Không có sidecar → webcam (chỉ set nguồn; warm() lười trong user gesture).
        _source = navigator.mediaDevices && navigator.mediaDevices.getUserMedia ? 'webcam' : null;
        _log('source =', _source);
        return _source;
    }

    // ---- capture ----
    async function _captureKbvision(url) {
        const r = await fetch(url + '/snapshot?t=' + Date.now(), {
            signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) throw new Error('Sidecar camera trả ' + r.status);
        const blob = await r.blob();
        if (!blob || !blob.size) throw new Error('Ảnh camera rỗng');
        return blob;
    }

    async function _captureWebcam() {
        await warm();
        const v = _video;
        if (!v || !v.videoWidth) throw new Error('Webcam chưa sẵn sàng');
        const vw = v.videoWidth;
        const vh = v.videoHeight;
        const scale = vw > MAX_W ? MAX_W / vw : 1;
        const outW = Math.round(vw * scale);
        const outH = Math.round(vh * scale);
        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        canvas.getContext('2d').drawImage(v, 0, 0, outW, outH);
        return await new Promise((resolve, reject) => {
            canvas.toBlob(
                (b) => (b ? resolve(b) : reject(new Error('toBlob trả null'))),
                'image/jpeg',
                JPEG_Q
            );
        });
    }

    async function capture() {
        const capturedAt = Date.now();
        // Ưu tiên sidecar KBVision; nếu fail + có webcam → thử webcam.
        if (_source === 'kbvision') {
            const url = await _findSidecar();
            if (url) {
                try {
                    const blob = await _captureKbvision(url);
                    return { blob, source: 'kbvision', capturedAt };
                } catch (e) {
                    _log('kbvision capture fail → thử webcam', e.message);
                }
            }
        }
        // Webcam (nguồn chính hoặc fallback)
        const blob = await _captureWebcam();
        return { blob, source: 'webcam', capturedAt };
    }

    function stop() {
        if (_stream) {
            try {
                _stream.getTracks().forEach((t) => t.stop());
            } catch {
                /* ignore */
            }
        }
        _stream = null;
        if (_video) {
            _video.srcObject = null;
        }
    }

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onerror = () => reject(new Error('đọc blob lỗi'));
            fr.onload = () => resolve(String(fr.result)); // data:image/jpeg;base64,...
            fr.readAsDataURL(blob);
        });
    }

    global.Web2EvidenceCamera = {
        init,
        warm,
        capture,
        stop,
        blobToBase64,
        source: () => _source,
    };

    // Nhả camera khi rời trang.
    global.addEventListener(
        'pagehide',
        () => {
            stop();
        },
        { once: true }
    );
})(window);
