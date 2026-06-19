// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Web2VideoRender — vẽ 1 KHUNG HÌNH video (slideshow SP) lên canvas tại thời điểm t.
 * Hiệu ứng: Ken Burns (zoom nhẹ) mỗi cảnh + crossfade chuyển cảnh + overlay chữ
 * (tiêu đề/phụ đề) trên gradient. Dùng chung cho cả preview (rAF) lẫn record
 * (canvas.captureStream). KHÔNG phụ thuộc lib ngoài.
 *
 *   Web2VideoRender.drawFrame(ctx, W, H, scenes, t, opts)  → vẽ khung tại giây t
 *   Web2VideoRender.totalDuration(scenes)                  → tổng giây
 *   scene = { _img, title, subtitle, dur }
 */
(function (global) {
    'use strict';

    const CROSSFADE = 0.5; // giây chồng mờ giữa 2 cảnh
    const FONT =
        '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';

    function totalDuration(scenes) {
        return (scenes || []).reduce((s, sc) => s + (Number(sc.dur) || 3), 0);
    }

    // cover-fit + zoom (scale quanh tâm) cho hiệu ứng Ken Burns.
    function _drawImageZoom(ctx, img, W, H, zoom) {
        if (!img || !img.width) {
            ctx.fillStyle = '#0b1220';
            ctx.fillRect(0, 0, W, H);
            return;
        }
        const ir = img.width / img.height;
        const dr = W / H;
        let bw, bh;
        if (ir > dr) {
            bh = H;
            bw = H * ir;
        } else {
            bw = W;
            bh = W / ir;
        }
        const z = zoom || 1;
        const dw = bw * z;
        const dh = bh * z;
        ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }

    function _wrap(ctx, text, maxW, maxLines) {
        const words = String(text || '')
            .split(/\s+/)
            .filter(Boolean);
        const lines = [];
        let line = '';
        for (const w of words) {
            const t = line ? line + ' ' + w : w;
            if (ctx.measureText(t).width > maxW && line) {
                lines.push(line);
                line = w;
                if (lines.length >= maxLines) break;
            } else line = t;
        }
        if (line && lines.length < maxLines) lines.push(line);
        return lines;
    }

    // vẽ 1 cảnh (ảnh + chữ) với alpha + tiến độ cục bộ p (0..1) cho Ken Burns/fade chữ.
    function _drawScene(ctx, W, H, scene, p, alpha, accent) {
        ctx.save();
        ctx.globalAlpha = alpha;
        const zoom = 1.02 + 0.08 * Math.max(0, Math.min(1, p)); // 1.02 → 1.10
        _drawImageZoom(ctx, scene._img, W, H, zoom);
        ctx.restore();

        const title = scene.title || '';
        const sub = scene.subtitle || '';
        if (!title && !sub) return;

        // gradient dưới để chữ nổi
        const gh = Math.round(H * 0.42);
        const grad = ctx.createLinearGradient(0, H - gh, 0, H);
        grad.addColorStop(0, 'rgba(2,6,23,0)');
        grad.addColorStop(1, 'rgba(2,6,23,0.82)');
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = grad;
        ctx.fillRect(0, H - gh, W, gh);

        // chữ trượt + mờ vào (0.4s đầu)
        const tin = Math.max(0, Math.min(1, p / 0.12));
        ctx.globalAlpha = alpha * tin;
        const pad = Math.round(W * 0.06);
        const slide = (1 - tin) * Math.round(H * 0.03);
        let y = H - Math.round(H * 0.07) + slide;

        if (sub) {
            ctx.fillStyle = '#cbd5e1';
            ctx.font = `600 ${Math.round(W * 0.032)}px ${FONT}`;
            const sl = _wrap(ctx, sub, W - pad * 2, 2);
            for (let i = sl.length - 1; i >= 0; i--) {
                ctx.fillText(sl[i], pad, y);
                y -= Math.round(W * 0.045);
            }
            y -= Math.round(W * 0.012);
        }
        if (title) {
            ctx.fillStyle = '#ffffff';
            ctx.font = `800 ${Math.round(W * 0.058)}px ${FONT}`;
            const tl = _wrap(ctx, title, W - pad * 2, 2);
            for (let i = tl.length - 1; i >= 0; i--) {
                ctx.fillText(tl[i], pad, y);
                y -= Math.round(W * 0.07);
            }
        }
        // gạch màu nhấn
        ctx.fillStyle = accent || '#0068ff';
        ctx.fillRect(pad, y - Math.round(W * 0.01), Math.round(W * 0.1), Math.round(H * 0.006));
        ctx.restore();
    }

    function drawFrame(ctx, W, H, scenes, t, opts) {
        opts = opts || {};
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        if (!scenes || !scenes.length) return;

        // tìm cảnh hiện tại theo mốc thời gian
        let acc = 0;
        let idx = 0;
        for (let i = 0; i < scenes.length; i++) {
            const d = Number(scenes[i].dur) || 3;
            if (t < acc + d || i === scenes.length - 1) {
                idx = i;
                break;
            }
            acc += d;
        }
        const cur = scenes[idx];
        const curDur = Number(cur.dur) || 3;
        const local = Math.max(0, t - acc);
        const p = curDur ? local / curDur : 0;
        const accent = opts.accent || '#0068ff';

        // crossfade sang cảnh kế trong CROSSFADE giây cuối
        const next = scenes[idx + 1];
        const remain = curDur - local;
        if (next && remain < CROSSFADE) {
            const f = 1 - remain / CROSSFADE; // 0→1
            _drawScene(ctx, W, H, cur, p, 1, accent);
            _drawScene(ctx, W, H, next, 0, f, accent);
        } else {
            _drawScene(ctx, W, H, cur, p, 1, accent);
        }
    }

    global.Web2VideoRender = { drawFrame, totalDuration, CROSSFADE };
})(window);
