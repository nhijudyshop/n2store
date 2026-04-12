// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

/**
 * 🎉 KPI Celebration System
 * 100% Motion.dev (WAAPI GPU-accelerated) — no canvas-confetti, no CSS keyframes
 */

const CelebrationManager = (() => {
    const EMPLOYEES = {
        hanh: { name: 'Hạnh', photo: 'assets/employees/hanh.jpg' },
    };

    const MOTION_CDN = 'https://cdn.jsdelivr.net/npm/motion@12.38.0/dist/motion.js';

    let overlay = null;
    let cleanups = [];

    // --- Load Motion.dev ---
    function loadMotion() {
        return new Promise((resolve, reject) => {
            if (window.Motion) { resolve(window.Motion); return; }
            const s = document.createElement('script');
            s.src = MOTION_CDN;
            s.onload = () => resolve(window.Motion);
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    // --- Tracked timers ---
    function later(fn, ms) {
        const id = setTimeout(fn, ms);
        cleanups.push({ type: 'timeout', id });
    }

    // --- Create DOM ---
    function createOverlay(employee, kpiDetail) {
        const existing = document.getElementById('celebrationOverlay');
        if (existing) existing.remove();

        const el = document.createElement('div');
        el.id = 'celebrationOverlay';
        el.className = 'celebration-overlay';

        el.innerHTML = `
            <div class="celebration-card">
                <div class="celebration-trophy">🏆</div>
                <div class="celebration-photo-ring">
                    <img class="celebration-photo"
                         src="${employee.photo}" alt="${employee.name}"
                         onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%236366f1%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2258%22 text-anchor=%22middle%22 fill=%22white%22 font-size=%2240%22>🌟</text></svg>'" />
                </div>
                <div class="celebration-title">CHÚC MỪNG!</div>
                <div class="celebration-name">
                    Nhân viên <span class="highlight">${employee.name}</span> đã đạt KPI
                </div>
                ${kpiDetail ? `
                <div class="celebration-detail">
                    <span class="celebration-detail-icon">💰</span>
                    <span class="celebration-detail-text">${kpiDetail}</span>
                </div>` : ''}
                <div class="celebration-close-hint">Nhấn để đóng</div>
            </div>
            <div class="celebration-particles"></div>
        `;

        el.addEventListener('click', () => dismiss());
        document.body.appendChild(el);
        overlay = el;
        return el;
    }

    // --- Motion.dev particle system (replaces canvas-confetti) ---
    async function launchParticles() {
        const { animate } = await loadMotion();
        const container = overlay.querySelector('.celebration-particles');
        const colors = ['#ffd700', '#ff6b35', '#ff1493', '#8b5cf6', '#00d4ff', '#10b981', '#fff'];

        // Wave 1: big burst from center (40 particles)
        for (let i = 0; i < 40; i++) {
            later(() => spawnParticle(animate, container, colors, {
                startX: 50, startY: 55,
                endX: 5 + Math.random() * 90,
                endY: -10 + Math.random() * 60,
                size: 6 + Math.random() * 8,
                duration: 1.5 + Math.random() * 1,
            }), i * 15);
        }

        // Wave 2: left cannon (20 particles)
        later(() => {
            for (let i = 0; i < 20; i++) {
                later(() => spawnParticle(animate, container, colors, {
                    startX: 0, startY: 65,
                    endX: 15 + Math.random() * 50,
                    endY: 5 + Math.random() * 40,
                    size: 5 + Math.random() * 7,
                    duration: 1.2 + Math.random() * 1,
                }), i * 20);
            }
        }, 400);

        // Wave 3: right cannon (20 particles)
        later(() => {
            for (let i = 0; i < 20; i++) {
                later(() => spawnParticle(animate, container, colors, {
                    startX: 100, startY: 65,
                    endX: 35 + Math.random() * 50,
                    endY: 5 + Math.random() * 40,
                    size: 5 + Math.random() * 7,
                    duration: 1.2 + Math.random() * 1,
                }), i * 20);
            }
        }, 600);

        // Wave 4: gentle rain (scattered, slower)
        later(() => {
            for (let i = 0; i < 25; i++) {
                later(() => spawnParticle(animate, container, colors, {
                    startX: Math.random() * 100, startY: -5,
                    endX: Math.random() * 100,
                    endY: 90 + Math.random() * 15,
                    size: 4 + Math.random() * 6,
                    duration: 2 + Math.random() * 1.5,
                    gravity: true,
                }), i * 80);
            }
        }, 1500);

        // Wave 5: finale burst (3 spots)
        later(() => {
            for (let b = 0; b < 3; b++) {
                const cx = 20 + b * 30;
                later(() => {
                    for (let i = 0; i < 15; i++) {
                        spawnParticle(animate, container, colors, {
                            startX: cx, startY: 40,
                            endX: cx - 20 + Math.random() * 40,
                            endY: 5 + Math.random() * 50,
                            size: 5 + Math.random() * 8,
                            duration: 1 + Math.random() * 0.8,
                        });
                    }
                }, b * 250);
            }
        }, 3500);
    }

    function spawnParticle(animate, container, colors, opts) {
        if (!overlay) return;

        const el = document.createElement('div');
        const color = colors[Math.floor(Math.random() * colors.length)];
        const isCircle = Math.random() > 0.3;

        el.style.cssText = `
            position:absolute;
            width:${opts.size}px;
            height:${isCircle ? opts.size : opts.size * 0.6}px;
            background:${color};
            border-radius:${isCircle ? '50%' : '2px'};
            left:${opts.startX}%;
            top:${opts.startY}%;
            pointer-events:none;
            z-index:1;
        `;
        container.appendChild(el);

        const rotation = -180 + Math.random() * 360;
        const midY = opts.gravity
            ? opts.startY + (opts.endY - opts.startY) * 0.3
            : Math.min(opts.startY, opts.endY) - 5 - Math.random() * 15;

        const ctrl = animate(el, {
            x: [`0%`, `${(opts.endX - opts.startX) * 0.6}vw`, `${(opts.endX - opts.startX)}vw`],
            y: [`0%`, `${(midY - opts.startY)}vh`, `${(opts.endY - opts.startY)}vh`],
            rotate: [0, rotation],
            scale: [0, 1.2, 0.3],
            opacity: [0, 1, 1, 0],
        }, {
            duration: opts.duration,
            easing: [0.25, 0.46, 0.45, 0.94],
            onComplete: () => el.remove(),
        });
        cleanups.push(ctrl);
    }

    // --- Motion.dev entrance animations ---
    async function animateEntrance() {
        const { animate } = await loadMotion();
        const card = overlay.querySelector('.celebration-card');
        const trophy = overlay.querySelector('.celebration-trophy');
        const photoRing = overlay.querySelector('.celebration-photo-ring');
        const photo = overlay.querySelector('.celebration-photo');
        const title = overlay.querySelector('.celebration-title');
        const nameEl = overlay.querySelector('.celebration-name');
        const detail = overlay.querySelector('.celebration-detail');
        const hint = overlay.querySelector('.celebration-close-hint');

        // Overlay fade
        animate(overlay, { opacity: [0, 1] }, { duration: 0.5, easing: 'ease-out' });
        overlay.classList.add('active');

        // Card pop in
        animate(card,
            { opacity: [0, 1], scale: [0.7, 1.02, 1], y: [40, -5, 0] },
            { duration: 0.8, easing: [0.16, 1, 0.3, 1], delay: 0.15 }
        );

        // Trophy drop + bounce
        animate(trophy,
            { opacity: [0, 1], scale: [0, 1.3, 0.9, 1.05, 1], y: [-30, 0, -4, 0] },
            { duration: 0.8, easing: 'ease-out', delay: 0.4 }
        );

        // Trophy gentle float
        later(() => {
            const ctrl = animate(trophy,
                { y: [0, -8, 0] },
                { duration: 1.5, easing: 'ease-in-out', repeat: Infinity }
            );
            cleanups.push(ctrl);
        }, 1200);

        // Photo ring spin
        const ringCtrl = animate(photoRing,
            { rotate: [0, 360] },
            { duration: 6, easing: 'linear', repeat: Infinity }
        );
        cleanups.push(ringCtrl);

        // Photo counter-rotate
        const photoCtrl = animate(photo,
            { rotate: [0, -360] },
            { duration: 6, easing: 'linear', repeat: Infinity }
        );
        cleanups.push(photoCtrl);

        // Photo ring glow pulse
        const glowCtrl = animate(photoRing,
            { boxShadow: [
                '0 0 40px rgba(255,215,0,0.4), 0 0 80px rgba(255,107,53,0.2)',
                '0 0 60px rgba(255,215,0,0.7), 0 0 120px rgba(255,107,53,0.4)',
                '0 0 40px rgba(255,215,0,0.4), 0 0 80px rgba(255,107,53,0.2)',
            ]},
            { duration: 2, easing: 'ease-in-out', repeat: Infinity }
        );
        cleanups.push(glowCtrl);

        // Text stagger
        [title, nameEl, detail, hint].filter(Boolean).forEach((el, i) => {
            animate(el,
                { opacity: [0, 1], y: [20, 0] },
                { duration: 0.5, easing: [0.16, 1, 0.3, 1], delay: 0.6 + i * 0.12 }
            );
        });
    }

    // --- Main ---
    async function celebrate(employeeKey, kpiDetail) {
        const employee = EMPLOYEES[employeeKey];
        if (!employee) { console.warn(`[Celebration] "${employeeKey}" not found`); return; }

        createOverlay(employee, kpiDetail || null);
        animateEntrance();
        launchParticles();

        later(() => dismiss(), 10000);
    }

    // --- Dismiss ---
    async function dismiss() {
        if (!overlay) return;

        cleanups.forEach(c => {
            if (c.type === 'timeout') clearTimeout(c.id);
            else if (c.type === 'interval') clearInterval(c.id);
            else if (c && typeof c.stop === 'function') c.stop();
            else if (c && typeof c.cancel === 'function') c.cancel();
        });
        cleanups = [];

        try {
            const { animate } = await loadMotion();
            const card = overlay.querySelector('.celebration-card');
            if (card) animate(card, { opacity: [1, 0], scale: [1, 0.85], y: [0, 20] },
                { duration: 0.35, easing: 'ease-in' });
            animate(overlay, { opacity: [1, 0] }, { duration: 0.4, easing: 'ease-in' });
        } catch (e) {
            overlay.style.opacity = '0';
        }

        const ref = overlay;
        overlay = null;
        setTimeout(() => ref.remove(), 500);
    }

    // --- Admin check ---
    function isAdmin() {
        try {
            return JSON.parse(localStorage.getItem('loginindex_auth') || '{}').userType === 'admin-authenticated';
        } catch { return false; }
    }

    // --- Init ---
    function initTestButton() {
        const btn = document.getElementById('celebrationTestBtn');
        if (!btn) return;
        if (isAdmin()) btn.classList.add('visible');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            celebrate('hanh', 'Hoàn thành 100% KPI tháng này!');
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTestButton);
    } else {
        initTestButton();
    }

    return { celebrate, dismiss, isAdmin, EMPLOYEES };
})();
