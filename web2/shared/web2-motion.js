// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Motion (motion.dev) làm engine animation tái dùng. ESM module.
// =====================================================================
// Web2Motion — animation engine cho Web 2.0 dùng MOTION (motion.dev,
// github.com/motiondivision/motion). Hybrid engine WAAPI → 120fps GPU-accel.
// Thay cho barba: KHÔNG đụng điều hướng (không PJAX) — chỉ animate phần tử,
// nên an toàn tuyệt đối cho app nặng (Firebase/SSE/Pancake init bình thường).
//
// DÙNG (load CUỐI, type="module"):
//   <script type="module" src="../shared/web2-motion.js?v=..."></script>
// API (window.Web2Motion):
//   Web2Motion.animate(el, keyframes, opts)   // re-export Motion.animate
//   Web2Motion.inView(el, onEnter, opts)
//   Web2Motion.stagger(each)
//   Web2Motion.staggerIn(els, {each,duration}) // reveal 1 nhóm ngay (fade+slide+spring)
//   Web2Motion.reveal(selector, {amount})      // reveal khi vào viewport (list dài)
//   Web2Motion.pop(el)                          // spring pop (badge/nút)
//   Web2Motion.enabled                          // false nếu CDN fail hoặc reduced-motion
//
// AUTO: khi load, reveal stagger các block tĩnh ([data-w2-motion], .top-bar,
//   .page-head-mini, .tab-navigation, .w2fx-card) 1 lần. Nếu Motion CDN fail
//   hoặc prefers-reduced-motion → KHÔNG đụng opacity (phần tử hiện bình thường).
// Anti-lag: Motion animate transform/opacity (y/scale/opacity) qua WAAPI.
// =====================================================================

let animate, inView, stagger;
try {
    ({ animate, inView, stagger } = await import('https://cdn.jsdelivr.net/npm/motion@11/+esm'));
} catch (e) {
    console.warn('[Web2Motion] Motion CDN load failed — animations disabled', e);
}

const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ENABLED = !!animate && !reduce;

const EASE_OUT = [0.05, 0.7, 0.1, 1];
const SPRING = { type: 'spring', stiffness: 320, damping: 30 };

function staggerIn(els, opts = {}) {
    if (!ENABLED || !els) return;
    const list = Array.from(els);
    if (!list.length) return;
    animate(
        list,
        { opacity: [0, 1], y: [12, 0] },
        { duration: opts.duration ?? 0.4, delay: stagger(opts.each ?? 0.05), ease: EASE_OUT }
    );
}

function reveal(selector, opts = {}) {
    if (!ENABLED) return;
    document.querySelectorAll(selector).forEach((el) => {
        el.style.opacity = '0';
        inView(
            el,
            () => {
                animate(el, { opacity: [0, 1], y: [16, 0] }, { duration: 0.45, ease: EASE_OUT });
            },
            { amount: opts.amount ?? 0.15 }
        );
    });
}

function pop(el) {
    if (!ENABLED || !el) return;
    animate(el, { scale: [0.9, 1] }, SPRING);
}

function enterOnLoad() {
    if (!ENABLED) return;
    const els = Array.from(
        document.querySelectorAll(
            '[data-w2-motion], .top-bar, .page-head-mini, .tab-navigation, .w2fx-card'
        )
    ).slice(0, 24);
    staggerIn(els, { each: 0.05, duration: 0.4 });
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', enterOnLoad);
    } else {
        enterOnLoad();
    }
}

window.Web2Motion = {
    animate,
    inView,
    stagger,
    staggerIn,
    reveal,
    pop,
    enabled: ENABLED,
};
