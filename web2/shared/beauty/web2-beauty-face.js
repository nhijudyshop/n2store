// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — beauty face landmarks.
// =====================================================================
// Web2BeautyFace — nhận diện ĐIỂM MỐC KHUÔN MẶT (MediaPipe FaceLandmarker,
// 478 điểm, refined irises) on-device + dựng "brush" liquify từ điểm mốc cho
// các công cụ làm đẹp khuôn mặt (mắt to, mũi thon, mặt V-line, môi căng).
// Lazy-load CDN khi dùng lần đầu (giống Web2ProductCounter). Dùng chung Web 2.0.
//
// API (window.Web2BeautyFace):
//   async detect(imageOrCanvas) -> { px, W, H, ... } | null   // px = toạ độ pixel
//   buildBrushes(det, tool, strength) -> brushes[]            // tool: eyes|nose|face|lips
//   buildAutoBrushes(det, strength)   -> brushes[]            // gói nhẹ cho "Làm đẹp tự động"
//   warmup() -> Promise          // tải sẵn model (tuỳ chọn)
//
// brushes hợp lệ với Web2BeautyFilters.warp().
// ⚠ MediaPipe dùng trái/phải GIẢI PHẪU (theo chủ thể) — "LEFT" nằm ở NỬA PHẢI
// của ảnh chân dung không lật. Với liquify đối xứng 2 bên nên không quan trọng.
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2BeautyFace) return;

    const VISION_VER = '0.10.18';
    const MODEL_URL =
        (global.WEB2_CONFIG && global.WEB2_CONFIG.FACE_LANDMARKER_MODEL) ||
        'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

    // ── Chỉ số điểm mốc (FaceMesh 478 — xem research) ──
    const IDX = {
        leftIris: 468, // tâm mống mắt (chủ thể trái)
        rightIris: 473, // tâm mống mắt (chủ thể phải)
        leftEyeOuter: 263,
        leftEyeInner: 362,
        rightEyeOuter: 33,
        rightEyeInner: 133,
        noseTip: 1,
        noseBridgeTop: 168,
        noseAlaL: 49, // cánh mũi (chủ thể trái)
        noseAlaR: 279, // cánh mũi (chủ thể phải)
        cheekL: 454, // điểm má rộng nhất bên trái (chủ thể)
        cheekR: 234,
        chin: 152,
        upperLip: 13,
        lowerLip: 14,
        mouthLeft: 61,
        mouthRight: 291,
        // hàm dưới để bóp vào (V-line) — 2 bên
        jawL: [454, 323, 361, 288, 397],
        jawR: [234, 93, 132, 58, 172],
    };

    const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VER}/wasm`;
    const WASM_BIN = WASM_BASE + '/vision_wasm_internal.wasm'; // ~9.5MB (immutable → prewarm an toàn)
    const WASM_SIZE = 9502124;
    const MODEL_SIZE = 3758596;
    const TOTAL_DL = WASM_SIZE + MODEL_SIZE; // ~13.2MB engine + model

    // ── tiến trình tải (0..1) phát cho UI (spinner → thanh %) ──
    const _progCbs = new Set();
    let _dlFrac = 0;
    let _recv = 0;
    function _emit(f) {
        _dlFrac = f;
        _progCbs.forEach((cb) => {
            try {
                cb(f);
            } catch {}
        });
    }
    function onProgress(cb) {
        _progCbs.add(cb);
        return () => _progCbs.delete(cb);
    }

    // ── Lazy-load MediaPipe Tasks Vision (ESM) — singleton ──
    let _visionP = null;
    function loadVision() {
        if (_visionP) return _visionP;
        _visionP = import(
            /* @vite-ignore */ `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VER}`
        ).catch((e) => {
            _visionP = null;
            throw e;
        });
        return _visionP;
    }

    // fetch có theo dõi tiến trình (cộng dồn _recv). Trả Uint8Array.
    async function _streamFetch(url, opts) {
        const resp = await fetch(url, opts);
        if (!resp || !resp.ok) throw new Error('fetch ' + url + ' ' + (resp && resp.status));
        if (!resp.body || !resp.body.getReader) {
            const ab = await resp.arrayBuffer();
            _recv += ab.byteLength;
            _emit(Math.min(0.99, _recv / TOTAL_DL));
            return new Uint8Array(ab);
        }
        const reader = resp.body.getReader();
        const chunks = [];
        let n = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            n += value.length;
            _recv += value.length;
            _emit(Math.min(0.99, _recv / TOTAL_DL));
        }
        const out = new Uint8Array(n);
        let off = 0;
        for (const c of chunks) {
            out.set(c, off);
            off += c.length;
        }
        return out;
    }

    // Prewarm wasm (immutable) vào HTTP cache → forVisionTasks tải lại = hit cache (1 lần).
    async function _warmWasm() {
        try {
            await _streamFetch(WASM_BIN);
        } catch {
            /* bỏ qua — forVisionTasks vẫn tự tải được */
        }
    }

    // Model: ưu tiên Cache API (googleapis chỉ cache 1h) → tải bền, lần sau tức thì.
    async function _fetchModelBuffer() {
        const CACHE = 'web2-mp-models-v1';
        try {
            if (global.caches) {
                const cache = await caches.open(CACHE);
                const hit = await cache.match(MODEL_URL);
                if (hit) return await _streamFetch_fromResponse(hit);
                const net = await fetch(MODEL_URL);
                if (net && net.ok) {
                    try {
                        await cache.put(MODEL_URL, net.clone());
                    } catch {}
                    return await _streamFetch_fromResponse(net);
                }
            }
        } catch {}
        return await _streamFetch(MODEL_URL);
    }
    async function _streamFetch_fromResponse(resp) {
        if (!resp.body || !resp.body.getReader) {
            const ab = await resp.arrayBuffer();
            _recv += ab.byteLength;
            _emit(Math.min(0.99, _recv / TOTAL_DL));
            return new Uint8Array(ab);
        }
        const reader = resp.body.getReader();
        const chunks = [];
        let n = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            n += value.length;
            _recv += value.length;
            _emit(Math.min(0.99, _recv / TOTAL_DL));
        }
        const out = new Uint8Array(n);
        let off = 0;
        for (const c of chunks) {
            out.set(c, off);
            off += c.length;
        }
        return out;
    }

    let _landmarkerP = null;
    function getLandmarker() {
        if (_landmarkerP) return _landmarkerP;
        _landmarkerP = (async () => {
            _recv = 0;
            _emit(0);
            const vision = await loadVision();
            const { FilesetResolver, FaceLandmarker } = vision;
            await _warmWasm(); // hâm nóng wasm (progress) → forVisionTasks hit cache
            const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
            let modelBuf = null;
            try {
                modelBuf = await _fetchModelBuffer();
            } catch {
                modelBuf = null;
            }
            _emit(1);
            const baseCfg = {
                runningMode: 'IMAGE',
                numFaces: 1,
                minFaceDetectionConfidence: 0.5,
                minFacePresenceConfidence: 0.5,
                outputFaceBlendshapes: false,
                outputFacialTransformationMatrixes: false,
            };
            // ⚠ Ảnh TĨNH 1 lần → ưu tiên CPU (XNNPACK): nhanh + ỔN ĐỊNH. GPU
            // (WebGL) bị "treo" ~chục giây ở lần infer đầu do biên dịch shader.
            const mk = (delegate) =>
                FaceLandmarker.createFromOptions(fileset, {
                    ...baseCfg,
                    baseOptions: modelBuf
                        ? { modelAssetBuffer: modelBuf, delegate }
                        : { modelAssetPath: MODEL_URL, delegate },
                });
            try {
                return await mk('CPU');
            } catch (e) {
                return await mk('GPU');
            }
        })();
        _landmarkerP.catch(() => {
            _landmarkerP = null;
        });
        return _landmarkerP;
    }

    function warmup() {
        return getLandmarker()
            .then(() => true)
            .catch(() => false);
    }

    // Trả về điểm mốc theo PIXEL của khuôn mặt đầu tiên (hoặc null nếu không thấy).
    // Nhận diện trên BẢN THU NHỎ (≤1024px) cho nhanh — điểm mốc normalize 0..1 nên
    // map ngược về W,H gốc vẫn đúng. (infer chậm chủ yếu do ảnh lớn + lần đầu.)
    const DETECT_MAX = 1024;
    async function detect(srcEl) {
        const fl = await getLandmarker();
        const W = srcEl.naturalWidth || srcEl.videoWidth || srcEl.width;
        const H = srcEl.naturalHeight || srcEl.videoHeight || srcEl.height;
        let target = srcEl;
        const m = Math.max(W, H);
        if (m > DETECT_MAX) {
            const k = DETECT_MAX / m;
            const tc = document.createElement('canvas');
            tc.width = Math.max(1, Math.round(W * k));
            tc.height = Math.max(1, Math.round(H * k));
            tc.getContext('2d').drawImage(srcEl, 0, 0, tc.width, tc.height);
            target = tc;
        }
        let res;
        try {
            res = fl.detect(target);
        } catch (e) {
            console.error('[Web2BeautyFace] detect lỗi:', e);
            return null;
        }
        if (!res || !res.faceLandmarks || !res.faceLandmarks.length) return null;
        const norm = res.faceLandmarks[0];
        const px = norm.map((p) => ({ x: p.x * W, y: p.y * H }));
        return { px, W, H, count: norm.length };
    }

    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

    // Trần độ mạnh theo công cụ (nhân với slider 0..1).
    const MAX = { eyes: 0.45, nose: 0.42, face: 0.5, lips: 0.4 };

    // Dựng brush liquify từ điểm mốc cho 1 công cụ.
    function buildBrushes(det, tool, strength) {
        if (!det || !det.px) return [];
        const p = det.px;
        const s = Math.max(0, Math.min(1, strength || 0));
        if (s <= 0) return [];
        const at = (i) => p[i];
        const has = (i) => i < det.count && p[i];

        if (tool === 'eyes') {
            const lc = has(IDX.leftIris)
                ? at(IDX.leftIris)
                : midOf(p, IDX.leftEyeOuter, IDX.leftEyeInner);
            const rc = has(IDX.rightIris)
                ? at(IDX.rightIris)
                : midOf(p, IDX.rightEyeOuter, IDX.rightEyeInner);
            const ew = Math.max(
                dist(at(IDX.leftEyeOuter), at(IDX.leftEyeInner)),
                dist(at(IDX.rightEyeOuter), at(IDX.rightEyeInner))
            );
            const r = Math.max(8, ew * 1.5);
            const st = s * MAX.eyes;
            return [
                { type: 'bloat', cx: lc.x, cy: lc.y, r, strength: st },
                { type: 'bloat', cx: rc.x, cy: rc.y, r, strength: st },
            ];
        }

        if (tool === 'nose') {
            const tip = at(IDX.noseTip);
            const nw = dist(at(IDX.noseAlaL), at(IDX.noseAlaR)) || 30;
            const r = Math.max(10, nw * 1.4);
            const st = s * MAX.nose;
            const midX = at(IDX.noseBridgeTop).x;
            // pucker quanh đầu mũi + đẩy 2 cánh mũi vào sống mũi
            const brushes = [{ type: 'pucker', cx: tip.x, cy: tip.y, r, strength: st }];
            [IDX.noseAlaL, IDX.noseAlaR].forEach((idx) => {
                const a = at(idx);
                const dir = midX >= a.x ? 1 : -1;
                brushes.push({
                    type: 'push',
                    cx: a.x,
                    cy: a.y,
                    r: Math.max(8, nw * 0.7),
                    strength: st * 0.8,
                    dirX: dir,
                    dirY: 0,
                });
            });
            return brushes;
        }

        if (tool === 'face') {
            const fw = dist(at(IDX.cheekL), at(IDX.cheekR)) || 100;
            const midX = (at(IDX.cheekL).x + at(IDX.cheekR).x) / 2;
            const r = Math.max(20, fw * 0.34);
            const st = s * MAX.face;
            const out = [];
            IDX.jawL.concat(IDX.jawR).forEach((idx) => {
                const a = at(idx);
                const dir = midX >= a.x ? 1 : -1;
                out.push({ type: 'push', cx: a.x, cy: a.y, r, strength: st, dirX: dir, dirY: 0 });
            });
            return out;
        }

        if (tool === 'lips') {
            const up = at(IDX.upperLip);
            const lo = at(IDX.lowerLip);
            const mw = dist(at(IDX.mouthLeft), at(IDX.mouthRight)) || 40;
            const r = Math.max(10, mw * 0.5);
            const st = s * MAX.lips;
            return [
                { type: 'bloat', cx: up.x, cy: up.y, r, strength: st },
                { type: 'bloat', cx: lo.x, cy: lo.y, r, strength: st },
            ];
        }
        return [];
    }

    function midOf(p, i, j) {
        return { x: (p[i].x + p[j].x) / 2, y: (p[i].y + p[j].y) / 2 };
    }

    // "Làm đẹp tự động": gói nhẹ mắt + mũi + mặt (kết hợp mịn da ở Studio).
    function buildAutoBrushes(det, strength) {
        const s = Math.max(0, Math.min(1, strength || 0));
        return [].concat(
            buildBrushes(det, 'eyes', s * 0.4),
            buildBrushes(det, 'nose', s * 0.35),
            buildBrushes(det, 'face', s * 0.4)
        );
    }

    global.Web2BeautyFace = {
        detect,
        buildBrushes,
        buildAutoBrushes,
        warmup,
        onProgress, // (cb)=>unsub : nhận tiến trình tải 0..1 (cho UI thanh %)
        progress: () => _dlFrac,
        ready: () => !!_landmarkerP, // đã/đang nạp xong chưa
        IDX,
    };
})(window);
