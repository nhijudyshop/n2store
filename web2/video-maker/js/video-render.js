// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Web2VideoRender — vẽ 1 KHUNG HÌNH video (slideshow SP) lên canvas tại thời điểm t.
 * Mỗi cảnh CHỈNH CHI TIẾT được: chuyển động (Ken Burns: phóng/thu/lia), hiệu ứng
 * vào (mờ/trượt/phóng/đen/cắt), bộ lọc màu, vị trí chữ, khung hình (lấp đầy/vừa khung).
 * Dùng chung cho preview (rAF) lẫn record (canvas.captureStream). KHÔNG lib ngoài.
 *
 *   Web2VideoRender.drawFrame(ctx, W, H, scenes, t, opts)  → vẽ khung tại giây t
 *   Web2VideoRender.totalDuration(scenes)                  → tổng giây
 *   Web2VideoRender.MOTIONS / FILTERS / TRANSITIONS        → danh sách lựa chọn
 *   scene = { _img, title, subtitle, dur, motion, transition, filter, textPos, fit, bg }
 *   opts  = { accent, transitionDur }
 */
(function (global) {
    'use strict';

    const DEFAULT_TDUR = 0.5;
    const FONT =
        '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';

    // ── danh sách lựa chọn (cho UI chi tiết) ──
    const MOTIONS = [
        { id: 'zoomin', label: 'Phóng to' },
        { id: 'zoomout', label: 'Thu nhỏ' },
        { id: 'panleft', label: 'Lia trái' },
        { id: 'panright', label: 'Lia phải' },
        { id: 'static', label: 'Tĩnh' },
    ];
    const TRANSITIONS = [
        { id: 'fade', label: 'Mờ dần' },
        { id: 'slide', label: 'Trượt' },
        { id: 'zoom', label: 'Phóng' },
        { id: 'black', label: 'Qua đen' },
        { id: 'none', label: 'Cắt thẳng' },
    ];
    const FILTERS = [
        { id: 'none', label: 'Gốc', css: 'none' },
        { id: 'vivid', label: 'Tươi', css: 'saturate(1.4) contrast(1.08)' },
        { id: 'warm', label: 'Ấm', css: 'sepia(0.28) saturate(1.2) brightness(1.03)' },
        { id: 'cool', label: 'Lạnh', css: 'saturate(1.12) brightness(1.02) hue-rotate(-12deg)' },
        { id: 'bw', label: 'Đen trắng', css: 'grayscale(1) contrast(1.06)' },
        {
            id: 'vintage',
            label: 'Cổ điển',
            css: 'sepia(0.45) contrast(0.95) brightness(1.06) saturate(0.9)',
        },
    ];
    const TEXT_POS = [
        { id: 'bottom', label: 'Dưới' },
        { id: 'center', label: 'Giữa' },
        { id: 'top', label: 'Trên' },
    ];
    const FITS = [
        { id: 'cover', label: 'Lấp đầy' },
        { id: 'contain', label: 'Vừa khung' },
    ];
    const _filterCss = (id) => (FILTERS.find((f) => f.id === id) || FILTERS[0]).css;
    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

    function totalDuration(scenes) {
        return (scenes || []).reduce((s, sc) => s + (Number(sc.dur) || 3), 0);
    }

    // Vẽ ảnh theo CHUYỂN ĐỘNG (motion) + tiến độ p + khung hình (fit) + bộ lọc.
    function _drawImageMotion(ctx, scene, W, H, p) {
        const img = scene._img;
        const fit = scene.fit || 'cover';
        if (fit === 'contain') {
            ctx.fillStyle = scene.bg || '#000000';
            ctx.fillRect(0, 0, W, H);
        }
        if (!img || !img.width) {
            if (fit !== 'contain') {
                ctx.fillStyle = '#0b1220';
                ctx.fillRect(0, 0, W, H);
            }
            return;
        }
        const ir = img.width / img.height;
        ctx.save();
        ctx.filter = _filterCss(scene.filter);

        if (fit === 'contain') {
            const scale = Math.min(W / img.width, H / img.height);
            const dw = img.width * scale;
            const dh = img.height * scale;
            ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
            ctx.restore();
            return;
        }

        // cover-fit
        const dr = W / H;
        let bw, bh;
        if (ir > dr) {
            bh = H;
            bw = H * ir;
        } else {
            bw = W;
            bh = W / ir;
        }
        const motion = scene.motion || 'zoomin';
        const pp = clamp01(p);
        let z = 1.06;
        if (motion === 'zoomin') z = 1.04 + 0.1 * pp;
        else if (motion === 'zoomout') z = 1.14 - 0.1 * pp;
        else if (motion === 'static') z = 1.0;
        else z = 1.12; // panleft / panright
        const dw = bw * z;
        const dh = bh * z;
        let ox = 0;
        const maxox = (dw - W) / 2;
        if (motion === 'panleft') ox = maxox * (1 - 2 * pp);
        else if (motion === 'panright') ox = maxox * (2 * pp - 1);
        ctx.drawImage(img, (W - dw) / 2 + ox, (H - dh) / 2, dw, dh);
        ctx.restore();
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

    // Vẽ chữ (tiêu đề/phụ đề) theo VỊ TRÍ (bottom/center/top).
    function _drawText(ctx, W, H, scene, alpha, tin, accent) {
        const title = scene.title || '';
        const sub = scene.subtitle || '';
        if (!title && !sub) return;
        const pos = scene.textPos || 'bottom';
        const pad = Math.round(W * 0.06);

        ctx.save();
        ctx.globalAlpha = alpha;
        const gh = Math.round(H * 0.42);
        if (pos === 'bottom') {
            const grad = ctx.createLinearGradient(0, H - gh, 0, H);
            grad.addColorStop(0, 'rgba(2,6,23,0)');
            grad.addColorStop(1, 'rgba(2,6,23,0.82)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, H - gh, W, gh);
        } else if (pos === 'top') {
            const grad = ctx.createLinearGradient(0, 0, 0, gh);
            grad.addColorStop(0, 'rgba(2,6,23,0.82)');
            grad.addColorStop(1, 'rgba(2,6,23,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, gh);
        } else {
            ctx.fillStyle = 'rgba(2,6,23,0.42)';
            ctx.fillRect(0, 0, W, H);
        }

        // chữ trượt + mờ vào
        ctx.globalAlpha = alpha * tin;
        const slide = (1 - tin) * Math.round(H * 0.03);

        // tính chiều cao khối chữ để canh giữa khi pos=center
        ctx.font = `800 ${Math.round(W * 0.058)}px ${FONT}`;
        const tl = title ? _wrap(ctx, title, W - pad * 2, 2) : [];
        ctx.font = `600 ${Math.round(W * 0.032)}px ${FONT}`;
        const sl = sub ? _wrap(ctx, sub, W - pad * 2, 2) : [];
        const titleLH = Math.round(W * 0.07);
        const subLH = Math.round(W * 0.045);
        const blockH =
            tl.length * titleLH +
            sl.length * subLH +
            (tl.length && sl.length ? Math.round(W * 0.012) : 0) +
            Math.round(H * 0.02);

        let baseY; // baseline của dòng CUỐI CÙNG (dưới cùng khối)
        if (pos === 'bottom') baseY = H - Math.round(H * 0.07) + slide;
        else if (pos === 'top') baseY = Math.round(H * 0.09) + blockH - subLH + slide;
        else baseY = Math.round(H / 2 + blockH / 2);

        let y = baseY;
        if (sl.length) {
            ctx.fillStyle = '#cbd5e1';
            ctx.font = `600 ${Math.round(W * 0.032)}px ${FONT}`;
            for (let i = sl.length - 1; i >= 0; i--) {
                ctx.fillText(sl[i], pad, y);
                y -= subLH;
            }
            y -= Math.round(W * 0.012);
        }
        if (tl.length) {
            ctx.fillStyle = '#ffffff';
            ctx.font = `800 ${Math.round(W * 0.058)}px ${FONT}`;
            for (let i = tl.length - 1; i >= 0; i--) {
                ctx.fillText(tl[i], pad, y);
                y -= titleLH;
            }
        }
        ctx.fillStyle = accent || '#0068ff';
        ctx.fillRect(pad, y - Math.round(W * 0.01), Math.round(W * 0.1), Math.round(H * 0.006));
        ctx.restore();
    }

    // vẽ 1 cảnh (ảnh motion + chữ) tại tiến độ p với độ mờ alpha.
    function _drawScene(ctx, W, H, scene, p, alpha, accent) {
        ctx.save();
        ctx.globalAlpha = alpha;
        _drawImageMotion(ctx, scene, W, H, p);
        ctx.restore();
        const tin = clamp01(p / 0.12);
        _drawText(ctx, W, H, scene, alpha, tin, accent);
    }

    // Hiệu ứng chuyển cảnh: cur (ra) → next (vào) theo loại của NEXT, f: 0→1.
    function _drawTransition(ctx, W, H, cur, next, pCur, f, accent) {
        const type = next.transition || 'fade';
        if (type === 'slide') {
            ctx.save();
            ctx.translate(-f * W, 0);
            _drawScene(ctx, W, H, cur, pCur, 1, accent);
            ctx.restore();
            ctx.save();
            ctx.translate((1 - f) * W, 0);
            _drawScene(ctx, W, H, next, 0, 1, accent);
            ctx.restore();
        } else if (type === 'zoom') {
            _drawScene(ctx, W, H, cur, pCur, 1, accent);
            ctx.save();
            const s = 0.8 + 0.2 * f;
            ctx.translate(W / 2, H / 2);
            ctx.scale(s, s);
            ctx.translate(-W / 2, -H / 2);
            _drawScene(ctx, W, H, next, 0, f, accent);
            ctx.restore();
        } else if (type === 'black') {
            const a1 = Math.max(0, 1 - 2 * f);
            const a2 = Math.max(0, 2 * f - 1);
            if (a1 > 0) _drawScene(ctx, W, H, cur, pCur, a1, accent);
            if (a2 > 0) _drawScene(ctx, W, H, next, 0, a2, accent);
        } else if (type === 'none') {
            if (f < 1) _drawScene(ctx, W, H, cur, pCur, 1, accent);
            else _drawScene(ctx, W, H, next, 0, 1, accent);
        } else {
            // fade (crossfade)
            _drawScene(ctx, W, H, cur, pCur, 1, accent);
            _drawScene(ctx, W, H, next, 0, f, accent);
        }
    }

    function drawFrame(ctx, W, H, scenes, t, opts) {
        opts = opts || {};
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        if (!scenes || !scenes.length) return;
        const tDur = Math.max(0, Number(opts.transitionDur ?? DEFAULT_TDUR));
        const accent = opts.accent || '#0068ff';

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

        const next = scenes[idx + 1];
        const remain = curDur - local;
        if (next && tDur > 0 && remain < tDur && (next.transition || 'fade') !== 'none') {
            const f = clamp01(1 - remain / tDur);
            _drawTransition(ctx, W, H, cur, next, p, f, accent);
        } else if (idx === 0 && tDur > 0 && local < tDur && (cur.transition || 'fade') !== 'none') {
            // fade-in cảnh đầu từ nền đen
            _drawScene(ctx, W, H, cur, p, clamp01(local / tDur), accent);
        } else {
            _drawScene(ctx, W, H, cur, p, 1, accent);
        }
    }

    global.Web2VideoRender = {
        drawFrame,
        totalDuration,
        MOTIONS,
        TRANSITIONS,
        FILTERS,
        TEXT_POS,
        FITS,
        DEFAULT_TDUR,
    };
})(window);
