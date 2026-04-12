// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

/**
 * 🎉 KPI Celebration System
 * Animations powered by Motion.dev (WAAPI — GPU-accelerated)
 * Confetti via canvas-confetti
 */

const CelebrationManager = (() => {
    const EMPLOYEES = {
        hanh: { name: 'Hạnh', photo: 'assets/employees/hanh.jpg' },
    };

    const MOTION_CDN = 'https://cdn.jsdelivr.net/npm/motion@11.11.9/dist/motion.js';
    const CONFETTI_CDN = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js';

    let motionLib = null;   // { animate, spring, stagger }
    let overlay = null;
    let cleanups = [];      // animation controls + timeouts to cancel on dismiss

    // --- Load libs ---
    async function loadMotion() {
        if (motionLib) return motionLib;
        motionLib = await import(MOTION_CDN);
        return motionLib;
    }

    function loadConfetti() {
        return new Promise((resolve, reject) => {
            if (window.confetti) { resolve(window.confetti); return; }
            const s = document.createElement('script');
            s.src = CONFETTI_CDN;
            s.onload = () => resolve(window.confetti);
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    // --- Helper: tracked setTimeout ---
    function later(fn, ms) {
        const id = setTimeout(fn, ms);
        cleanups.push({ type: 'timeout', id });
        return id;
    }

    function interval(fn, ms) {
        const id = setInterval(fn, ms);
        cleanups.push({ type: 'interval', id });
        return id;
    }

    // --- Create overlay DOM ---
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
        `;

        el.addEventListener('click', () => dismiss());
        document.body.appendChild(el);
        overlay = el;
        return el;
    }

    // --- Motion animations ---
    async function animateEntrance() {
        const { animate, spring } = await loadMotion();
        const card = overlay.querySelector('.celebration-card');
        const trophy = overlay.querySelector('.celebration-trophy');
        const photoRing = overlay.querySelector('.celebration-photo-ring');
        const title = overlay.querySelector('.celebration-title');
        const name = overlay.querySelector('.celebration-name');
        const detail = overlay.querySelector('.celebration-detail');
        const hint = overlay.querySelector('.celebration-close-hint');

        // 1) Overlay fade in
        animate(overlay, { opacity: [0, 1] }, { duration: 0.5, easing: 'ease-out' });
        overlay.classList.add('active');

        // 2) Card — spring entrance
        animate(card,
            { opacity: [0, 1], scale: [0.7, 1], y: [40, 0] },
            { easing: spring({ stiffness: 200, damping: 22 }), delay: 0.15 }
        );

        // 3) Trophy — bounce in
        animate(trophy,
            { opacity: [0, 1], scale: [0, 1.2, 1], y: [-20, 0] },
            { duration: 0.6, easing: 'ease-out', delay: 0.4 }
        );

        // 4) Trophy continuous bounce (gentle)
        later(() => {
            const ctrl = animate(trophy,
                { y: [0, -6, 0] },
                { duration: 1.2, easing: 'ease-in-out', repeat: Infinity }
            );
            cleanups.push(ctrl);
        }, 1000);

        // 5) Photo ring — spin continuously
        const ringCtrl = animate(photoRing,
            { rotate: [0, 360] },
            { duration: 6, easing: 'linear', repeat: Infinity }
        );
        cleanups.push(ringCtrl);

        // 6) Photo counter-rotate to stay upright
        const photo = overlay.querySelector('.celebration-photo');
        const photoCtrl = animate(photo,
            { rotate: [0, -360] },
            { duration: 6, easing: 'linear', repeat: Infinity }
        );
        cleanups.push(photoCtrl);

        // 7) Title shimmer — background-position animation
        const titleCtrl = animate(title,
            { backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] },
            { duration: 3, easing: 'ease-in-out', repeat: Infinity }
        );
        cleanups.push(titleCtrl);

        // 8) Stagger the text elements
        const textEls = [title, name, detail, hint].filter(Boolean);
        animate(textEls,
            { opacity: [0, 1], y: [15, 0] },
            { duration: 0.5, easing: 'ease-out', delay: 0.6 }
        );
    }

    // --- Floating emojis via Motion ---
    async function spawnFloatingEmojis() {
        const { animate } = await loadMotion();
        const emojis = ['🎉', '🎊', '⭐', '✨', '🥳', '🎈', '💰', '🏅'];
        let count = 0;
        const max = 10;

        interval(() => {
            if (!overlay || !overlay.classList.contains('active') || count >= max) return;

            const el = document.createElement('div');
            el.className = 'celebration-floating-emoji';
            el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
            el.style.left = `${10 + Math.random() * 80}%`;
            el.style.bottom = '0px';
            el.style.fontSize = `${24 + Math.random() * 14}px`;
            overlay.appendChild(el);
            count++;

            // Animate with Motion (WAAPI)
            const ctrl = animate(el,
                { y: [0, -500], opacity: [1, 0.7, 0] },
                { duration: 3.5 + Math.random() * 1.5, easing: 'linear',
                  onComplete: () => el.remove() }
            );
            cleanups.push(ctrl);
        }, 700);
    }

    // --- Confetti (canvas — already smooth) ---
    async function launchFireworks() {
        const confetti = await loadConfetti();
        const colors = ['#ffd700', '#ff6b35', '#ff1493', '#8b5cf6', '#00d4ff', '#10b981'];
        const end = Date.now() + 5000;

        // Initial burst
        confetti({ particleCount: 80, spread: 90, startVelocity: 45,
                   origin: { y: 0.6 }, colors, gravity: 1, ticks: 200 });

        // Side cannons
        later(() => {
            confetti({ particleCount: 40, angle: 60, spread: 60,
                       origin: { x: 0, y: 0.65 }, colors, ticks: 180 });
            confetti({ particleCount: 40, angle: 120, spread: 60,
                       origin: { x: 1, y: 0.65 }, colors, ticks: 180 });
        }, 500);

        // Light side rain
        interval(() => {
            if (Date.now() > end) return;
            confetti({ particleCount: 2, angle: 60, spread: 50,
                       origin: { x: 0 }, colors, ticks: 150, gravity: 0.8 });
            confetti({ particleCount: 2, angle: 120, spread: 50,
                       origin: { x: 1 }, colors, ticks: 150, gravity: 0.8 });
        }, 250);

        // Starburst
        later(() => {
            confetti({ particleCount: 40, spread: 360, startVelocity: 20,
                       origin: { x: 0.5, y: 0.35 }, colors, ticks: 150, gravity: 0.6 });
        }, 2000);

        // Finale
        later(() => {
            for (let i = 0; i < 3; i++) {
                later(() => {
                    confetti({ particleCount: 35, spread: 80 + Math.random() * 40,
                               startVelocity: 30,
                               origin: { x: 0.2 + Math.random() * 0.6, y: 0.35 + Math.random() * 0.3 },
                               colors, ticks: 150 });
                }, i * 300);
            }
        }, 3500);
    }

    // --- Sound ---
    function playSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.15);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.5);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + i * 0.15);
                osc.stop(ctx.currentTime + i * 0.15 + 0.6);
            });
            setTimeout(() => ctx.close(), 2000);
        } catch (e) { /* no audio support */ }
    }

    // --- Main ---
    async function celebrate(employeeKey, kpiDetail) {
        const employee = EMPLOYEES[employeeKey];
        if (!employee) { console.warn(`[Celebration] "${employeeKey}" not found`); return; }

        createOverlay(employee, kpiDetail || null);

        // All animations via Motion.dev
        animateEntrance();
        playSound();
        launchFireworks();
        later(() => spawnFloatingEmojis(), 800);

        // Auto-dismiss
        later(() => dismiss(), 10000);
    }

    // --- Dismiss ---
    async function dismiss() {
        if (!overlay) return;

        // Stop all tracked animations/timers
        cleanups.forEach(c => {
            if (c.type === 'timeout') clearTimeout(c.id);
            else if (c.type === 'interval') clearInterval(c.id);
            else if (c && typeof c.stop === 'function') c.stop();
        });
        cleanups = [];

        // Fade out via Motion
        try {
            const { animate } = await loadMotion();
            const card = overlay.querySelector('.celebration-card');
            if (card) animate(card, { opacity: 0, scale: 0.85 }, { duration: 0.3, easing: 'ease-in' });
            await animate(overlay, { opacity: 0 }, { duration: 0.4, easing: 'ease-in' }).finished;
        } catch (e) {
            overlay.style.opacity = '0';
        }

        overlay.remove();
        overlay = null;
        if (window.confetti) window.confetti.reset();
    }

    // --- Admin check ---
    function isAdmin() {
        try {
            return JSON.parse(localStorage.getItem('loginindex_auth') || '{}').userType === 'admin-authenticated';
        } catch { return false; }
    }

    // --- Init test button ---
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

// Expose globally for console testing & other scripts
window.CelebrationManager = CelebrationManager;
