// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Photo Studio — hàng chọn nền: preset gradient, cảnh Unsplash, nền đã lưu,
 * render 2 hàng chip (camera + review) + chọn nền theo key.
 *
 * Tách khỏi UI để giữ file dưới giới hạn dòng. Gắn vào `window.PS`;
 * dùng `PS.state` + gọi `PS.renderReview/showLoading/notify`.
 */
(function (global) {
    'use strict';

    const PS = (global.PS = global.PS || {});

    // ===== Backgrounds: presets + saved + render 2 hàng =================
    PS.PRESETS = [
        {
            id: 'studio-white',
            name: 'Studio trắng',
            kind: 'linear',
            css: 'linear-gradient(180deg,#ffffff,#e3e9f0)',
            stops: [
                [0, '#ffffff'],
                [1, '#e3e9f0'],
            ],
        },
        {
            id: 'studio-grey',
            name: 'Xám studio',
            kind: 'radial',
            css: 'radial-gradient(circle at 50% 38%,#fbfcfd,#c4ccd6)',
            stops: [
                [0, '#fbfcfd'],
                [1, '#c4ccd6'],
            ],
        },
        {
            id: 'warm-beige',
            name: 'Kem ấm',
            kind: 'linear',
            css: 'linear-gradient(180deg,#fdf6ec,#e7d6bf)',
            stops: [
                [0, '#fdf6ec'],
                [1, '#e7d6bf'],
            ],
        },
        {
            id: 'soft-pink',
            name: 'Hồng',
            kind: 'radial',
            css: 'radial-gradient(circle at 50% 38%,#fff0f3,#f4c4d2)',
            stops: [
                [0, '#fff0f3'],
                [1, '#f4c4d2'],
            ],
        },
        {
            id: 'soft-blue',
            name: 'Xanh dịu',
            kind: 'radial',
            css: 'radial-gradient(circle at 50% 38%,#eef5ff,#bcd4f0)',
            stops: [
                [0, '#eef5ff'],
                [1, '#bcd4f0'],
            ],
        },
        {
            id: 'mint',
            name: 'Bạc hà',
            kind: 'linear',
            css: 'linear-gradient(180deg,#eefaf3,#bfe6d2)',
            stops: [
                [0, '#eefaf3'],
                [1, '#bfe6d2'],
            ],
        },
        {
            id: 'sunset',
            name: 'Nắng',
            kind: 'radial',
            css: 'radial-gradient(circle at 50% 35%,#fff3da,#f6c89a)',
            stops: [
                [0, '#fff3da'],
                [1, '#f6c89a'],
            ],
        },
        {
            id: 'dark-lux',
            name: 'Tối sang',
            kind: 'radial',
            css: 'radial-gradient(circle at 50% 38%,#3a4658,#11161f)',
            stops: [
                [0, '#3a4658'],
                [1, '#11161f'],
            ],
        },
    ];
    PS.SOLIDS = [
        { c: '#ffffff', name: 'Trắng' },
        { c: '#000000', name: 'Đen' },
    ];
    // Nền cảnh có sẵn (Unsplash CDN, CORS * → vẽ canvas + export OK với crossOrigin).
    PS.SCENES = [
        { id: 'bien-nhiet-doi', name: 'Biển nhiệt đới', u: 'photo-1507525428034-b723cf961d3e' },
        {
            id: 'chan-troi-dai-duong',
            name: 'Chân trời đại dương',
            u: 'photo-1505228395891-9a51e7e86bf6',
        },
        {
            id: 'thanh-pho-tren-cao',
            name: 'Toàn cảnh thành phố',
            u: 'photo-1480714378408-67cf0d13bc1b',
        },
        { id: 'pho-dem', name: 'Phố đêm bokeh', u: 'photo-1449824913935-59a10b8d2000' },
        { id: 'ruong-lua', name: 'Ruộng lúa', u: 'photo-1500382017468-9049fed747ef' },
        { id: 'doi-xanh', name: 'Đồi xanh quê', u: 'photo-1470071459604-3b5ec3a7fe05' },
        { id: 'rung-xanh', name: 'Rừng xanh', u: 'photo-1441974231531-c6227db76b6e' },
        { id: 'thac-nuoc', name: 'Thác nước', u: 'photo-1432405972618-c60b0225b8f9' },
        { id: 'nui-cao', name: 'Núi cao', u: 'photo-1506905925346-21bda4d32df4' },
        { id: 'hoang-hon', name: 'Hoàng hôn', u: 'photo-1495616811223-4d98c6e9c869' },
        { id: 'den-bokeh', name: 'Ánh đèn bokeh', u: 'photo-1492684223066-81342ee5ff30' },
        { id: 'tuong-hoa', name: 'Tường hoa hồng', u: 'photo-1530103862676-de8c9debad1d' },
        { id: 'quan-cafe', name: 'Quán cafe ấm cúng', u: 'photo-1554118811-1e0d58224f24' },
        { id: 'phong-trang', name: 'Phòng trắng tối giản', u: 'photo-1497366216548-37526070297c' },
        { id: 'vuon-cay', name: 'Vườn cây xanh', u: 'photo-1416879595882-3373a0480b5b' },
        { id: 'san-thuong', name: 'Sân thượng thành phố', u: 'photo-1542353436-312f0e1f67ff' },
    ];
    PS.sceneFull = (u) => `https://images.unsplash.com/${u}?auto=format&fit=crop&w=1280&q=80`;
    PS.sceneThumb = (u) => `https://images.unsplash.com/${u}?w=96&h=96&fit=crop&q=60`;
    PS.sceneCache = {}; // id → HTMLImageElement đã load (crossOrigin)
    PS.SAVED_KEY = 'ps_saved_bgs';
    PS.SAVED_MAX = 8;

    PS.loadSavedBgs = function () {
        const state = PS.state;
        try {
            state.savedBgs = JSON.parse(localStorage.getItem(PS.SAVED_KEY) || '[]').slice(
                0,
                PS.SAVED_MAX
            );
        } catch {
            state.savedBgs = [];
        }
    };
    PS.persistSavedBgs = function () {
        try {
            localStorage.setItem(
                PS.SAVED_KEY,
                JSON.stringify(PS.state.savedBgs.slice(0, PS.SAVED_MAX))
            );
        } catch {}
    };
    PS.saveSavedBg = function (url) {
        const state = PS.state;
        const id = 'b' + Date.now().toString(36) + Math.floor(Math.random() * 1000);
        state.savedBgs.unshift({ id, url });
        state.savedBgs = state.savedBgs.slice(0, PS.SAVED_MAX);
        PS.persistSavedBgs();
        return id;
    };
    PS.deleteSavedBg = function (id) {
        const state = PS.state;
        state.savedBgs = state.savedBgs.filter((b) => b.id !== id);
        PS.persistSavedBgs();
        if (state.bgKey === 'saved:' + id) PS.selectBg('transparent');
        PS.renderBgRows();
    };

    PS.bgRowHTML = function () {
        const state = PS.state;
        let h = '';
        h += `<button class="ps-bg-chip" data-bg="transparent" title="Trong suốt"><span class="ps-chip-checker"></span></button>`;
        for (const s of PS.SOLIDS)
            h += `<button class="ps-bg-chip" data-bg="color" data-color="${s.c}" title="${s.name}" style="background:${s.c}${s.c === '#ffffff' ? ';border:1px solid #d6dde6' : ''}"></button>`;
        for (const p of PS.PRESETS)
            h += `<button class="ps-bg-chip" data-bg="preset" data-preset="${p.id}" title="${p.name}" style="background:${p.css}"></button>`;
        h += `<button class="ps-bg-chip ps-bg-blur" data-bg="blur" title="Mờ nền"><i data-lucide="aperture"></i></button>`;
        for (const sc of PS.SCENES)
            h += `<span class="ps-bg-chip ps-bg-scene" data-bg="scene" data-id="${sc.id}" title="${sc.name}" style="background-image:url(${PS.sceneThumb(sc.u)})"></span>`;
        for (const b of state.savedBgs)
            h += `<span class="ps-bg-chip ps-bg-saved" data-bg="saved" data-id="${b.id}" title="Nền đã lưu" style="background-image:url(${b.url})"><button class="ps-bg-del" data-del="${b.id}" aria-label="Xóa">×</button></span>`;
        h += `<button class="ps-bg-chip ps-bg-pick" data-bg="pick" title="Màu khác"><i data-lucide="pipette"></i></button>`;
        h += `<button class="ps-bg-chip ps-bg-add" data-bg="upload" title="Thêm ảnh nền"><i data-lucide="image-plus"></i></button>`;
        return h;
    };

    PS.renderBgRows = function () {
        const el = PS.el;
        const html = PS.bgRowHTML();
        [el.bgRowCam, el.bgRowReview].forEach((row) => {
            if (row) row.innerHTML = html;
        });
        PS.applyActiveBg();
        PS.relucide();
    };

    PS.applyActiveBg = function () {
        const el = PS.el,
            state = PS.state;
        [el.bgRowCam, el.bgRowReview].forEach((row) => {
            if (!row) return;
            row.querySelectorAll('[data-bg]').forEach((c) =>
                c.classList.toggle('is-active', PS.chipKey(c) === state.bgKey)
            );
        });
    };
    PS.chipKey = function (chip) {
        const t = chip.dataset.bg;
        if (t === 'color') return 'color:' + chip.dataset.color;
        if (t === 'preset') return 'preset:' + chip.dataset.preset;
        if (t === 'saved') return 'saved:' + chip.dataset.id;
        if (t === 'scene') return 'scene:' + chip.dataset.id;
        return t; // transparent | blur
    };

    PS.onBgChip = function (chip) {
        const el = PS.el;
        const t = chip.dataset.bg;
        if (t === 'pick') {
            el.bgColor.click();
            return;
        }
        if (t === 'upload') {
            el.bgFile.click();
            return;
        }
        PS.selectBg(PS.chipKey(chip));
    };

    /** Chọn nền theo key: transparent | blur | color:#hex | preset:id | saved:id */
    PS.selectBg = function (key) {
        const state = PS.state;
        state.bgKey = key;
        if (key === 'transparent') state.bgType = 'transparent';
        else if (key === 'blur') state.bgType = 'blur';
        else if (key.startsWith('color:')) {
            state.bgType = 'color';
            state.bgColor = key.slice(6);
        } else if (key.startsWith('preset:')) {
            state.bgType = 'preset';
            state.bgPreset = key.slice(7);
        } else if (key.startsWith('saved:')) {
            const rec = state.savedBgs.find((b) => b.id === key.slice(6));
            if (rec) {
                const img = new Image();
                img.onload = () => {
                    state.bgImage = img;
                    state.bgType = 'image';
                    PS.renderReview();
                };
                img.src = rec.url;
            }
        } else if (key.startsWith('scene:')) {
            const id = key.slice(6);
            const sc = PS.SCENES.find((s) => s.id === id);
            if (sc) {
                if (PS.sceneCache[id]) {
                    state.bgImage = PS.sceneCache[id];
                    state.bgType = 'image';
                } else {
                    PS.showLoading('Đang tải nền…');
                    const img = new Image();
                    img.crossOrigin = 'anonymous'; // BẮT BUỘC để export canvas (Unsplash CORS *)
                    img.onload = () => {
                        PS.sceneCache[id] = img;
                        PS.hideLoading();
                        if (state.bgKey === key) {
                            state.bgImage = img;
                            state.bgType = 'image';
                            PS.renderReview();
                        }
                    };
                    img.onerror = () => {
                        PS.hideLoading();
                        PS.notify('Không tải được nền (mạng?). Thử nền khác.', 'error');
                    };
                    img.src = PS.sceneFull(sc.u);
                    state.bgType = 'image'; // đặt trước, ảnh set khi load xong
                }
            }
        }
        PS.applyActiveBg();
        PS.renderReview();
    };
})(typeof window !== 'undefined' ? window : globalThis);
