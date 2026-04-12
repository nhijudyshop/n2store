// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

/**
 * 🎉 KPI Celebration System
 * Shows fireworks + confetti + employee photo when KPI target is met.
 * Only admin-authenticated users can trigger the test button.
 *
 * Uses canvas-confetti (https://github.com/catdad/canvas-confetti)
 */

const CelebrationManager = (() => {
    // --- Employee registry ---
    const EMPLOYEES = {
        hanh: {
            name: 'Hạnh',
            photo: 'assets/employees/hanh.jpg',
        },
        // Add more employees here:
        // nhi: { name: 'Nhi', photo: 'assets/employees/nhi.jpg' },
    };

    // Confetti CDN
    const CONFETTI_CDN = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js';

    let confettiLoaded = false;
    let overlay = null;
    let confettiIntervals = [];

    // --- Load canvas-confetti ---
    function loadConfetti() {
        return new Promise((resolve, reject) => {
            if (confettiLoaded && window.confetti) {
                resolve(window.confetti);
                return;
            }
            const script = document.createElement('script');
            script.src = CONFETTI_CDN;
            script.onload = () => {
                confettiLoaded = true;
                resolve(window.confetti);
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // --- Create overlay DOM ---
    function createOverlay(employee, kpiDetail) {
        // Remove existing
        const existing = document.getElementById('celebrationOverlay');
        if (existing) existing.remove();

        const el = document.createElement('div');
        el.id = 'celebrationOverlay';
        el.className = 'celebration-overlay';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-label', 'KPI Celebration');

        // Star rays
        const rayCount = 8;
        let raysHTML = '';
        for (let i = 0; i < rayCount; i++) {
            const angle = (360 / rayCount) * i;
            raysHTML += `<div class="ray" style="transform: translate(-50%, 0) rotate(${angle}deg);"></div>`;
        }

        el.innerHTML = `
            <div class="celebration-card">
                <!-- Starburst behind photo -->
                <div class="celebration-starburst">${raysHTML}</div>

                <!-- Trophy -->
                <div class="celebration-trophy">🏆</div>

                <!-- Employee photo with rotating ring -->
                <div class="celebration-photo-ring">
                    <img
                        class="celebration-photo"
                        src="${employee.photo}"
                        alt="${employee.name}"
                        onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%236366f1%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2258%22 text-anchor=%22middle%22 fill=%22white%22 font-size=%2240%22>🌟</text></svg>'"
                    />
                </div>

                <!-- Title -->
                <div class="celebration-title">CHÚC MỪNG!</div>

                <!-- Employee name -->
                <div class="celebration-name">
                    Nhân viên <span class="highlight">${employee.name}</span> đã đạt KPI
                </div>

                <!-- KPI detail pill -->
                ${kpiDetail ? `
                <div class="celebration-detail">
                    <span class="celebration-detail-icon">💰</span>
                    <span class="celebration-detail-text">${kpiDetail}</span>
                </div>
                ` : ''}

                <!-- Close hint -->
                <div class="celebration-close-hint">Nhấn để đóng</div>
            </div>
        `;

        // Click to close
        el.addEventListener('click', () => dismiss());

        // Prevent card click from bubbling (optional: keep it closable anywhere)
        // el.querySelector('.celebration-card').addEventListener('click', e => e.stopPropagation());

        document.body.appendChild(el);
        overlay = el;
        return el;
    }

    // --- Fireworks confetti sequence (lightweight) ---
    async function launchFireworks() {
        const confetti = await loadConfetti();

        const duration = 5000;
        const end = Date.now() + duration;
        const colors = ['#ffd700', '#ff6b35', '#ff1493', '#8b5cf6', '#00d4ff', '#10b981'];

        // 1) Initial burst
        confetti({
            particleCount: 80,
            spread: 90,
            startVelocity: 45,
            origin: { y: 0.6 },
            colors,
            gravity: 1,
            ticks: 200,
        });

        // 2) Side cannons
        setTimeout(() => {
            confetti({
                particleCount: 40,
                angle: 60,
                spread: 60,
                origin: { x: 0, y: 0.65 },
                colors,
                ticks: 180,
            });
            confetti({
                particleCount: 40,
                angle: 120,
                spread: 60,
                origin: { x: 1, y: 0.65 },
                colors,
                ticks: 180,
            });
        }, 500);

        // 3) Gentle side rain (slower interval, fewer particles)
        const interval1 = setInterval(() => {
            if (Date.now() > end) {
                clearInterval(interval1);
                return;
            }
            confetti({
                particleCount: 2,
                angle: 60,
                spread: 50,
                origin: { x: 0 },
                colors,
                ticks: 150,
                gravity: 0.8,
            });
            confetti({
                particleCount: 2,
                angle: 120,
                spread: 50,
                origin: { x: 1 },
                colors,
                ticks: 150,
                gravity: 0.8,
            });
        }, 250);
        confettiIntervals.push(interval1);

        // 4) One starburst at 2s
        setTimeout(() => {
            confetti({
                particleCount: 40,
                spread: 360,
                startVelocity: 20,
                origin: { x: 0.5, y: 0.35 },
                colors,
                ticks: 150,
                gravity: 0.6,
                scalar: 0.9,
            });
        }, 2000);

        // 5) Grand finale - 3 bursts
        setTimeout(() => {
            for (let i = 0; i < 3; i++) {
                setTimeout(() => {
                    confetti({
                        particleCount: 35,
                        spread: 80 + Math.random() * 40,
                        startVelocity: 30,
                        origin: {
                            x: 0.2 + Math.random() * 0.6,
                            y: 0.35 + Math.random() * 0.3,
                        },
                        colors,
                        ticks: 150,
                    });
                }, i * 300);
            }
        }, 3500);
    }

    // --- Floating emoji rain (lightweight) ---
    function spawnFloatingEmojis() {
        const emojis = ['🎉', '🎊', '⭐', '✨', '🥳', '🎈', '💰', '🏅'];
        let count = 0;
        const maxEmojis = 12;

        const interval = setInterval(() => {
            if (!overlay || !overlay.classList.contains('active') || count >= maxEmojis) {
                clearInterval(interval);
                return;
            }

            const emoji = document.createElement('div');
            emoji.className = 'celebration-floating-emoji';
            emoji.textContent = emojis[Math.floor(Math.random() * emojis.length)];
            emoji.style.left = `${10 + Math.random() * 80}%`;
            emoji.style.bottom = '-40px';
            emoji.style.fontSize = `${22 + Math.random() * 16}px`;
            emoji.style.animationDuration = `${3.5 + Math.random() * 2}s`;

            overlay.appendChild(emoji);
            count++;

            emoji.addEventListener('animationend', () => emoji.remove());
        }, 600);

        confettiIntervals.push(interval);
    }

    // --- Play celebration sound (optional, non-blocking) ---
    function playSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            // Simple fanfare: C E G C (high)
            const notes = [523.25, 659.25, 783.99, 1046.5];
            notes.forEach((freq, i) => {
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
            // Close context after all notes finish
            setTimeout(() => ctx.close(), 2000);
        } catch (e) {
            // Audio not supported, no problem
        }
    }

    // --- Main: show celebration ---
    async function celebrate(employeeKey, kpiDetail) {
        const employee = EMPLOYEES[employeeKey];
        if (!employee) {
            console.warn(`[Celebration] Employee "${employeeKey}" not found`);
            return;
        }

        // Build overlay
        createOverlay(employee, kpiDetail || null);

        // Activate with slight delay for transition
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                overlay.classList.add('active');
            });
        });

        // Launch effects
        playSound();
        launchFireworks();
        spawnFloatingEmojis();

        // Auto-dismiss after 10 seconds
        setTimeout(() => dismiss(), 10000);
    }

    // --- Dismiss ---
    function dismiss() {
        if (!overlay) return;

        // Clear all intervals
        confettiIntervals.forEach(id => clearInterval(id));
        confettiIntervals = [];

        // Fade out
        overlay.classList.remove('active');

        // Remove overlay after transition
        setTimeout(() => {
            if (overlay) {
                overlay.remove();
                overlay = null;
            }
            // Reset confetti canvas if exists
            if (window.confetti) {
                window.confetti.reset();
            }
        }, 700);
    }

    // --- Admin check ---
    function isAdmin() {
        try {
            const auth = JSON.parse(localStorage.getItem('loginindex_auth') || '{}');
            return auth.userType === 'admin-authenticated';
        } catch {
            return false;
        }
    }

    // --- Init test button ---
    function initTestButton() {
        const btn = document.getElementById('celebrationTestBtn');
        if (!btn) return;

        // Show only for admin
        if (isAdmin()) {
            btn.classList.add('visible');
        }

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            celebrate('hanh', 'Hoàn thành 100% KPI tháng này!');
        });
    }

    // --- Auto-init on DOM ready ---
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTestButton);
    } else {
        initTestButton();
    }

    // Public API
    return {
        celebrate,
        dismiss,
        isAdmin,
        EMPLOYEES,
    };
})();
