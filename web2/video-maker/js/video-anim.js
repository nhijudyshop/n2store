// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Web2VideoAnim — bộ chuyển động "kiểu Remotion" thuần vanilla, on-device, KHÔNG React/bundler/license.
 *
 * Port 3 ý cốt lõi của Remotion (https://remotion.dev) sang canvas-render của video-maker:
 *   • spring()      — lò xo vật lý (damped harmonic oscillator) → chuyển động nảy/settle tự nhiên.
 *   • interpolate() — ánh xạ 1 giá trị qua nhiều mốc + easing + chặn ngoại suy (clamp/extend).
 *   • Easing        — đường cong gia tốc (cubic, sine, back-overshoot, cubic-bezier như CSS).
 *
 * Tất cả deterministic theo thời gian → preview (rAF) và export (captureStream/WebCodecs) khớp khung.
 * Dùng: Web2VideoAnim.spring({ frame, fps, config }) · .interpolate(x,[in],[out],opts) · .Easing.easeOutCubic(t)
 */
(function (global) {
    'use strict';

    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    const clamp01 = (v) => clamp(v, 0, 1);

    // ── Easing (t: 0→1) ───────────────────────────────────────────────
    const Easing = {
        linear: (t) => t,
        easeInQuad: (t) => t * t,
        easeOutQuad: (t) => t * (2 - t),
        easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
        easeInCubic: (t) => t * t * t,
        easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
        easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
        easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
        // overshoot nhẹ rồi về (giống Remotion spring damping thấp)
        easeOutBack: (t) => {
            const c1 = 1.70158;
            const c3 = c1 + 1;
            return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
        },
    };

    // cubic-bezier như CSS transition-timing-function. Trả về fn(t).
    function cubicBezier(x1, y1, x2, y2) {
        const cx = 3 * x1;
        const bx = 3 * (x2 - x1) - cx;
        const ax = 1 - cx - bx;
        const cy = 3 * y1;
        const by = 3 * (y2 - y1) - cy;
        const ay = 1 - cy - by;
        const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
        const sampleY = (t) => ((ay * t + by) * t + cy) * t;
        const dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
        const solveX = (x) => {
            let t = x;
            for (let i = 0; i < 8; i++) {
                const xx = sampleX(t) - x;
                if (Math.abs(xx) < 1e-6) return t;
                const d = dX(t);
                if (Math.abs(d) < 1e-6) break;
                t -= xx / d;
            }
            let lo = 0;
            let hi = 1;
            let tt = x;
            for (let i = 0; i < 24; i++) {
                const xx = sampleX(tt);
                if (Math.abs(xx - x) < 1e-6) break;
                if (xx < x) lo = tt;
                else hi = tt;
                tt = (lo + hi) / 2;
            }
            return tt;
        };
        return (t) => (t <= 0 ? 0 : t >= 1 ? 1 : sampleY(solveX(t)));
    }
    Easing.cubicBezier = cubicBezier;

    // ── interpolate (Remotion-style) ──────────────────────────────────
    // input qua inputRange (tăng dần) → outputRange. opts: { easing, extrapolateLeft, extrapolateRight }
    function interpolate(input, inputRange, outputRange, opts) {
        opts = opts || {};
        const easing = opts.easing || Easing.linear;
        const exLeft = opts.extrapolateLeft || 'extend';
        const exRight = opts.extrapolateRight || 'extend';
        const n = inputRange.length;
        let i;
        if (input <= inputRange[0]) {
            if (exLeft === 'clamp') return outputRange[0];
            i = 0;
        } else if (input >= inputRange[n - 1]) {
            if (exRight === 'clamp') return outputRange[n - 1];
            i = n - 2;
        } else {
            i = n - 2;
            for (let j = 1; j < n; j++) {
                if (input < inputRange[j]) {
                    i = j - 1;
                    break;
                }
            }
        }
        const inMin = inputRange[i];
        const inMax = inputRange[i + 1];
        const outMin = outputRange[i];
        const outMax = outputRange[i + 1];
        if (inMax === inMin) return outMin;
        let t = (input - inMin) / (inMax - inMin);
        t = easing(t);
        return outMin + t * (outMax - outMin);
    }

    // ── spring (Remotion-style) ───────────────────────────────────────
    // Nghiệm giải tích của dao động tắt dần. Mặc định from=0,to=1: 0 → vượt nhẹ → 1.
    // config: { damping=10, mass=1, stiffness=100, overshootClamping=false, velocity=0 }
    function spring(args) {
        args = args || {};
        const frame = args.frame || 0;
        const fps = args.fps || 30;
        const cfg = args.config || {};
        const damping = cfg.damping != null ? cfg.damping : 10;
        const mass = cfg.mass != null ? cfg.mass : 1;
        const stiffness = cfg.stiffness != null ? cfg.stiffness : 100;
        const overshootClamping = !!cfg.overshootClamping;
        const v0 = cfg.velocity != null ? cfg.velocity : 0;
        const from = args.from != null ? args.from : 0;
        const to = args.to != null ? args.to : 1;

        const t = Math.max(0, frame) / fps;
        const x0 = from - to; // độ lệch khỏi vị trí cân bằng
        const w0 = Math.sqrt(stiffness / mass);
        const zeta = damping / (2 * Math.sqrt(stiffness * mass));

        let val;
        if (zeta < 1) {
            // under-damped (có nảy)
            const wd = w0 * Math.sqrt(1 - zeta * zeta);
            const A = x0;
            const B = (zeta * w0 * x0 + v0) / wd;
            val = to + Math.exp(-zeta * w0 * t) * (A * Math.cos(wd * t) + B * Math.sin(wd * t));
        } else {
            // critically / over-damped (không nảy)
            const A = x0;
            const B = x0 * w0 + v0;
            val = to + Math.exp(-w0 * t) * (A + B * t);
        }
        if (overshootClamping) {
            val = to >= from ? Math.min(val, to) : Math.max(val, to);
        }
        return val;
    }

    global.Web2VideoAnim = {
        Easing,
        cubicBezier,
        interpolate,
        spring,
        clamp,
        clamp01,
    };
})(window);
