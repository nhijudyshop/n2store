// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

/**
 * 🎨 Celebration Config Manager
 * Admin-only UI to configure fireworks per employee (photo, text, effects).
 * Persists to localStorage. When admin fires celebration, full employee payload
 * is sent via SSE so other clients render with admin's config without needing
 * their own copy.
 */
(function () {
    const CONFIG_KEY = 'celebrationConfig_v1';
    const MAX_PHOTO_DIM = 480;
    const MAX_PHOTO_BYTES = 220 * 1024;
    const API_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime';
    const COLOR_THEMES = {
        rainbow: ['#ffd700', '#ff6b35', '#ff1493', '#8b5cf6', '#00d4ff', '#10b981', '#fff'],
        warm: ['#ffd700', '#ff6b35', '#ff1493', '#ff4500', '#ffaa00', '#fff'],
        cool: ['#00d4ff', '#8b5cf6', '#3b82f6', '#10b981', '#06b6d4', '#fff'],
        gold: ['#ffd700', '#ffb700', '#ffcc33', '#fff8b0', '#ffe066', '#fff'],
    };

    const DEFAULTS = {
        version: 1,
        employees: {
            hanh: {
                key: 'hanh',
                name: 'Hạnh',
                photo: 'assets/employees/hanh.jpg',
                titleText: 'CHÚC MỪNG!',
                nameTemplate: 'Nhân viên {name} đã đạt KPI',
                defaultDetail: 'Hoàn thành 100% KPI tháng này!',
            },
        },
        effects: {
            colorTheme: 'rainbow',
            intensity: 'normal', // low | normal | high
            durationMs: 10000,
        },
    };

    function load() {
        try {
            const raw = localStorage.getItem(CONFIG_KEY);
            if (!raw) return structuredClone(DEFAULTS);
            const parsed = JSON.parse(raw);
            return {
                version: parsed.version || 1,
                employees: { ...DEFAULTS.employees, ...(parsed.employees || {}) },
                effects: { ...DEFAULTS.effects, ...(parsed.effects || {}) },
            };
        } catch {
            return structuredClone(DEFAULTS);
        }
    }

    function save(cfg) {
        try {
            localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
            return true;
        } catch (e) {
            console.warn('[CelebrationConfig] save failed:', e);
            return false;
        }
    }

    // Broadcast config to all other clients via SSE.
    // Called after admin saves changes locally.
    async function broadcastConfig(cfg) {
        try {
            const res = await fetch(`${API_URL}/celebration-config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config: cfg }),
            });
            const data = await res.json();
            console.log(
                `[CelebrationConfig] 🎨 Broadcast sent (${data.payloadBytes || '?'}B), ${data.clientsNotified || 0} clients notified`
            );
            return true;
        } catch (e) {
            console.warn('[CelebrationConfig] Broadcast failed:', e);
            return false;
        }
    }

    // Apply config received from another admin device. Skip if it matches what we
    // already have to avoid render churn.
    let suppressBroadcastUntil = 0;
    function applyRemoteConfig(cfg, publishedAt) {
        if (!cfg) return;
        const current = JSON.stringify(load());
        const incoming = JSON.stringify(cfg);
        if (current === incoming) return;
        // Skip if this is the echo of our own recent broadcast
        if (publishedAt && publishedAt < suppressBroadcastUntil) return;
        try {
            localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
            console.log('[CelebrationConfig] 🔄 Applied config from another device');
            // Refresh employee dropdown if visible
            window.CelebrationManager?.refreshEmpSelect?.();
            // If modal is open, re-render it with fresh state
            const m = document.getElementById('celebrationConfigModal');
            if (m && m.classList.contains('open')) {
                renderEmpListLatest(m);
                m.querySelector('#celCfgTheme').value = cfg.effects?.colorTheme || 'rainbow';
                m.querySelector('#celCfgIntensity').value = cfg.effects?.intensity || 'normal';
                m.querySelector('#celCfgDuration').value = String(cfg.effects?.durationMs || 10000);
                toast('Config sync từ máy khác 🔄');
            }
        } catch (e) {
            console.warn('[CelebrationConfig] applyRemoteConfig failed:', e);
        }
    }

    function renderEmpListLatest(modal) {
        renderEmpList(modal, load());
    }

    // SSE listener — all clients subscribe to celebration_config topic so config
    // changes from any admin device propagate everywhere immediately.
    let sseEs = null;
    function connectSSE() {
        if (sseEs) return;
        try {
            sseEs = new EventSource(`${API_URL}/sse?keys=celebration_config`);
            sseEs.addEventListener('celebration_config', (e) => {
                try {
                    const msg = JSON.parse(e.data);
                    const { config, publishedAt } = msg.data || {};
                    applyRemoteConfig(config, publishedAt);
                } catch (err) {
                    console.warn('[CelebrationConfig] SSE parse error:', err);
                }
            });
            sseEs.addEventListener('connected', () => {
                console.log('[CelebrationConfig] SSE connected, listening for config updates');
            });
            sseEs.onerror = () => {
                // EventSource auto-reconnects
            };
        } catch (e) {
            console.warn('[CelebrationConfig] SSE connection failed:', e);
        }
    }

    function getEmployee(key) {
        const cfg = load();
        return cfg.employees[key] || null;
    }

    function listEmployees() {
        const cfg = load();
        return Object.values(cfg.employees);
    }

    function getColors(themeKey) {
        return COLOR_THEMES[themeKey] || COLOR_THEMES.rainbow;
    }

    // --- Photo compression ---
    function compressImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('FileReader error'));
            reader.onload = () => {
                const img = new Image();
                img.onerror = () => reject(new Error('Image decode error'));
                img.onload = () => {
                    const scale = Math.min(1, MAX_PHOTO_DIM / Math.max(img.width, img.height));
                    const w = Math.round(img.width * scale);
                    const h = Math.round(img.height * scale);
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);

                    let quality = 0.86;
                    let dataUrl = canvas.toDataURL('image/jpeg', quality);
                    while (dataUrl.length > MAX_PHOTO_BYTES && quality > 0.4) {
                        quality -= 0.1;
                        dataUrl = canvas.toDataURL('image/jpeg', quality);
                    }
                    resolve(dataUrl);
                };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        });
    }

    function slugify(s) {
        return String(s || '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .replace(/đ/g, 'd')
            .replace(/[^a-z0-9]+/g, '')
            .slice(0, 24);
    }

    // --- Modal UI ---
    function buildModal() {
        if (document.getElementById('celebrationConfigModal')) return;
        const m = document.createElement('div');
        m.id = 'celebrationConfigModal';
        m.className = 'cel-cfg-overlay';
        m.innerHTML = `
            <div class="cel-cfg-dialog" role="dialog" aria-modal="true" aria-label="Cài đặt Pháo Hoa">
                <header class="cel-cfg-head">
                    <h2><span>🎨</span> Cài đặt Pháo Hoa</h2>
                    <button class="cel-cfg-x" data-act="close" aria-label="Đóng">×</button>
                </header>

                <section class="cel-cfg-section">
                    <div class="cel-cfg-section-title">Nhân viên</div>
                    <div class="cel-cfg-emp-list" id="celCfgEmpList"></div>
                    <button class="cel-cfg-btn cel-cfg-btn-secondary" data-act="add-emp">
                        ＋ Thêm nhân viên
                    </button>
                </section>

                <section class="cel-cfg-section">
                    <div class="cel-cfg-section-title">Hiệu ứng</div>
                    <div class="cel-cfg-grid">
                        <label class="cel-cfg-field">
                            <span>Màu pháo hoa</span>
                            <select id="celCfgTheme">
                                <option value="rainbow">🌈 Cầu vồng</option>
                                <option value="warm">🔥 Ấm (vàng/cam/hồng)</option>
                                <option value="cool">❄️ Lạnh (xanh/tím)</option>
                                <option value="gold">✨ Vàng kim</option>
                            </select>
                        </label>
                        <label class="cel-cfg-field">
                            <span>Mật độ</span>
                            <select id="celCfgIntensity">
                                <option value="low">Thưa</option>
                                <option value="normal">Vừa</option>
                                <option value="high">Dày</option>
                            </select>
                        </label>
                        <label class="cel-cfg-field">
                            <span>Thời gian hiển thị</span>
                            <select id="celCfgDuration">
                                <option value="5000">5 giây</option>
                                <option value="8000">8 giây</option>
                                <option value="10000">10 giây</option>
                                <option value="15000">15 giây</option>
                                <option value="20000">20 giây</option>
                            </select>
                        </label>
                    </div>
                </section>

                <footer class="cel-cfg-foot">
                    <button class="cel-cfg-btn cel-cfg-btn-ghost" data-act="reset">
                        Khôi phục mặc định
                    </button>
                    <div class="cel-cfg-foot-right">
                        <button class="cel-cfg-btn cel-cfg-btn-ghost" data-act="close">Hủy</button>
                        <button class="cel-cfg-btn cel-cfg-btn-primary" data-act="save">
                            💾 Lưu thay đổi
                        </button>
                    </div>
                </footer>
            </div>
        `;
        document.body.appendChild(m);
        wireModal(m);
    }

    function renderEmpList(modal, cfg) {
        const list = modal.querySelector('#celCfgEmpList');
        const employees = Object.values(cfg.employees);
        if (!employees.length) {
            list.innerHTML = `<div class="cel-cfg-empty">Chưa có nhân viên nào.</div>`;
            return;
        }
        list.innerHTML = employees
            .map(
                (e) => `
            <div class="cel-cfg-emp" data-emp-key="${e.key}">
                <div class="cel-cfg-emp-photo-wrap">
                    <img class="cel-cfg-emp-photo" src="${e.photo}"
                         onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%236366f1%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2258%22 text-anchor=%22middle%22 fill=%22white%22 font-size=%2240%22>👤</text></svg>'"
                         alt="${e.name}" />
                    <button class="cel-cfg-emp-photo-edit" data-act="upload-photo" data-key="${e.key}" title="Đổi ảnh">
                        📷
                    </button>
                </div>
                <div class="cel-cfg-emp-fields">
                    <label class="cel-cfg-field">
                        <span>Tên hiển thị</span>
                        <input type="text" data-field="name" data-key="${e.key}" value="${escapeAttr(e.name)}" maxlength="40" />
                    </label>
                    <label class="cel-cfg-field">
                        <span>Tiêu đề</span>
                        <input type="text" data-field="titleText" data-key="${e.key}" value="${escapeAttr(e.titleText)}" maxlength="40" />
                    </label>
                    <label class="cel-cfg-field cel-cfg-field-wide">
                        <span>Mẫu câu (dùng <code>{name}</code>)</span>
                        <input type="text" data-field="nameTemplate" data-key="${e.key}" value="${escapeAttr(e.nameTemplate)}" maxlength="120" />
                    </label>
                    <label class="cel-cfg-field cel-cfg-field-wide">
                        <span>Dòng KPI mặc định</span>
                        <input type="text" data-field="defaultDetail" data-key="${e.key}" value="${escapeAttr(e.defaultDetail || '')}" maxlength="120" />
                    </label>
                </div>
                <div class="cel-cfg-emp-actions">
                    <button class="cel-cfg-icon-btn cel-cfg-fire" data-act="preview" data-key="${e.key}" title="Bắn thử">
                        🎆
                    </button>
                    ${
                        e.key === 'hanh'
                            ? ''
                            : `<button class="cel-cfg-icon-btn cel-cfg-del" data-act="delete" data-key="${e.key}" title="Xóa">🗑️</button>`
                    }
                </div>
            </div>
        `
            )
            .join('');
    }

    function escapeAttr(s) {
        return String(s || '')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;');
    }

    function wireModal(modal) {
        let workingCfg = load();
        renderEmpList(modal, workingCfg);
        modal.querySelector('#celCfgTheme').value = workingCfg.effects.colorTheme;
        modal.querySelector('#celCfgIntensity').value = workingCfg.effects.intensity;
        modal.querySelector('#celCfgDuration').value = String(workingCfg.effects.durationMs);

        modal.addEventListener('click', (e) => {
            const t = e.target.closest('[data-act]');
            if (!t) {
                if (e.target === modal) closeModal();
                return;
            }
            const act = t.dataset.act;
            const key = t.dataset.key;

            if (act === 'close') return closeModal();

            if (act === 'reset') {
                if (!confirm('Khôi phục cấu hình mặc định? Mọi tùy chỉnh sẽ mất.')) return;
                workingCfg = structuredClone(DEFAULTS);
                renderEmpList(modal, workingCfg);
                modal.querySelector('#celCfgTheme').value = workingCfg.effects.colorTheme;
                modal.querySelector('#celCfgIntensity').value = workingCfg.effects.intensity;
                modal.querySelector('#celCfgDuration').value = String(
                    workingCfg.effects.durationMs
                );
                return;
            }

            if (act === 'save') {
                workingCfg.effects.colorTheme = modal.querySelector('#celCfgTheme').value;
                workingCfg.effects.intensity = modal.querySelector('#celCfgIntensity').value;
                workingCfg.effects.durationMs = parseInt(
                    modal.querySelector('#celCfgDuration').value,
                    10
                );
                if (save(workingCfg)) {
                    // Suppress echo from our own broadcast for 2s
                    suppressBroadcastUntil = Date.now() + 2000;
                    broadcastConfig(workingCfg);
                    toast('Đã lưu + sync sang máy khác 🎉');
                    closeModal();
                } else {
                    toast('Không lưu được, ảnh có thể quá lớn');
                }
                return;
            }

            if (act === 'add-emp') {
                const name = prompt('Tên nhân viên:');
                if (!name) return;
                let key = slugify(name);
                if (!key) key = 'nv' + Date.now().toString(36);
                let suffix = 1;
                const baseKey = key;
                while (workingCfg.employees[key]) {
                    suffix++;
                    key = baseKey + suffix;
                }
                workingCfg.employees[key] = {
                    key,
                    name: name.trim(),
                    photo: '',
                    titleText: 'CHÚC MỪNG!',
                    nameTemplate: 'Nhân viên {name} đã đạt KPI',
                    defaultDetail: '',
                };
                renderEmpList(modal, workingCfg);
                return;
            }

            if (act === 'delete') {
                if (!confirm('Xóa nhân viên này?')) return;
                delete workingCfg.employees[key];
                renderEmpList(modal, workingCfg);
                return;
            }

            if (act === 'upload-photo') {
                openPhotoPicker(key, workingCfg, modal);
                return;
            }

            if (act === 'preview') {
                const emp = workingCfg.employees[key];
                if (!emp) return;
                const Cm = window.CelebrationManager;
                if (Cm && typeof Cm.celebrate === 'function') {
                    Cm.celebrate(
                        key,
                        emp.defaultDetail || 'Hoàn thành KPI!',
                        emp,
                        workingCfg.effects
                    );
                }
                return;
            }
        });

        modal.addEventListener('input', (e) => {
            const t = e.target;
            const field = t.dataset.field;
            const key = t.dataset.key;
            if (!field || !key) return;
            if (!workingCfg.employees[key]) return;
            workingCfg.employees[key][field] = t.value;
        });

        function openPhotoPicker(key, cfg, modal) {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = async () => {
                const file = input.files && input.files[0];
                if (!file) return;
                try {
                    const dataUrl = await compressImage(file);
                    cfg.employees[key].photo = dataUrl;
                    renderEmpList(modal, cfg);
                    toast('Đã cập nhật ảnh (chưa lưu)');
                } catch (e) {
                    console.warn('[CelebrationConfig] photo upload failed:', e);
                    toast('Không xử lý được ảnh, thử ảnh khác');
                }
            };
            input.click();
        }
    }

    let toastTimer = null;
    function toast(msg) {
        let t = document.getElementById('celCfgToast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'celCfgToast';
            t.className = 'cel-cfg-toast';
            document.body.appendChild(t);
        }
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
    }

    function openModal() {
        buildModal();
        const m = document.getElementById('celebrationConfigModal');
        if (m) {
            m.classList.add('open');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeModal() {
        const m = document.getElementById('celebrationConfigModal');
        if (m) m.classList.remove('open');
        document.body.style.overflow = '';
    }

    // ESC to close
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const m = document.getElementById('celebrationConfigModal');
        if (m && m.classList.contains('open')) closeModal();
    });

    // Auto-connect SSE for config sync — applies to all clients, not just admin,
    // so when admin updates from another device, this client picks it up.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', connectSSE);
    } else {
        connectSSE();
    }

    window.CelebrationConfig = {
        load,
        save,
        getEmployee,
        listEmployees,
        getColors,
        openModal,
        closeModal,
        broadcastConfig,
        DEFAULTS,
    };
})();
