// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared module.
// =====================================================================
// Web2ImagePaste — 1 NGUỒN ô NHẬP ẢNH cho Web 2.0 (paste / kéo-thả / chọn file).
//
// Lý do (dedup, 2026-06-23): mỗi trang tự dựng input[type=file] + paste handler
// + nén ảnh riêng (chi-tieu readCompressed, chat-panel compose, zalo composer,
// ai-hub, fb-posts). Trùng lặp + drift (mỗi nơi tham số nén khác nhau). Gom 1
// AREA dùng chung: bấm→chọn file, kéo-thả, DÁN ảnh (Ctrl+V) — kèm nén qua
// Web2CanvasUtils + dải thumbnail preview (xoá từng ảnh, click phóng to qua
// Web2ImageLightbox). Trang chỉ gọi mount() + nhận callback onChange.
//
// API:
//   Web2ImagePaste.mount(target, opts) → controller
//     target = selector | HTMLElement (container rỗng để render AREA vào)
//     opts:
//       multiple   (false)  — cho nhiều ảnh
//       maxFiles   (multiple?10:1)
//       maxWidth   (1600)   maxHeight (1600)   — nén scale-down giữ tỉ lệ
//       quality    (0.82)   format ('image/jpeg')
//       hardLimitMB(12)     — ảnh gốc lớn hơn → từ chối
//       initial    ([])     — dataURL có sẵn (chế độ sửa) — KHÔNG nén lại
//       label, hint         — chữ hiển thị
//       compact    (false)  — area gọn (1 dòng)
//       onChange(items)     — gọi sau mỗi thêm/xoá; items = [{id,dataUrl,blob,w,h,name,size}]
//       onError(msg)
//     controller = {
//       element, getItems(), getDataUrls(), count(), clear(),
//       addFiles(FileList|File[]), destroy()
//     }
//
//   Web2ImagePaste.enhance(input, opts) → { detach }
//     Nâng cấp 1 <input type=file> SẴN CÓ để cũng nhận DÁN (Ctrl+V) + kéo-thả,
//     GIỮ nút "Chọn file" gốc. Ảnh dán/thả được bơm vào input.files + dispatch
//     'change' → handler sẵn có của trang chạy (KHÔNG cần đổi handler). Dùng cho
//     ai-hub, video-maker, fb-posts, photo-studio… opts: { dropZone, onFiles,
//     hint, hintText, hintInto, onError }.
//
//   Tiện ích tĩnh (cho trang chỉ cần nén, không cần UI — vd chat/zalo/ai-hub):
//     Web2ImagePaste.compress(fileOrBlobOrDataUrl, opts) → Promise<item>
//     Web2ImagePaste.imagesFromClipboard(clipboardData) → File[]
//     Web2ImagePaste.imagesFromDataTransfer(dataTransfer) → File[]
//
// Compositor-friendly. Reuse Web2CanvasUtils (nén) + Web2ImageLightbox (xem).
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2ImagePaste) return;

    var CU = global.Web2CanvasUtils || null;
    var SEQ = 0;

    function _notify(fn, msg, type) {
        if (typeof fn === 'function') {
            fn(msg, type);
            return;
        }
        if (global.notificationManager && global.notificationManager.show) {
            global.notificationManager.show(msg, type || 'info');
        }
    }
    function _esc(v) {
        if (global.Web2Escape && global.Web2Escape.escapeHtml)
            return global.Web2Escape.escapeHtml(v);
        return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // ── Nén 1 ảnh → { dataUrl, blob, w, h, name, size } ─────────────────────
    // Reuse Web2CanvasUtils; fallback FileReader+canvas nếu thiếu (đề phòng
    // trang load module này mà chưa load canvas-utils).
    function _loadImage(src) {
        if (CU && CU.loadImage) return CU.loadImage(src);
        return new Promise(function (resolve, reject) {
            var img = new Image();
            if (!String(src || '').startsWith('data:')) {
                try {
                    img.crossOrigin = 'anonymous';
                } catch (e) {}
            }
            img.onload = function () {
                resolve(img);
            };
            img.onerror = function () {
                reject(new Error('Không tải được ảnh'));
            };
            img.src = src;
        });
    }
    function _fileToDataUrl(file) {
        if (CU && CU.fileToDataUrl) return CU.fileToDataUrl(file);
        return new Promise(function (resolve, reject) {
            var fr = new FileReader();
            fr.onload = function () {
                resolve(fr.result);
            };
            fr.onerror = function () {
                reject(fr.error || new Error('Đọc file lỗi'));
            };
            fr.readAsDataURL(file);
        });
    }

    function compress(input, opts) {
        opts = opts || {};
        var maxW = opts.maxWidth || 1600;
        var maxH = opts.maxHeight || 1600;
        var quality = opts.quality != null ? opts.quality : 0.82;
        var format = opts.format || 'image/jpeg';
        var name = (input && input.name) || 'image';
        var srcP;
        if (typeof input === 'string')
            srcP = Promise.resolve(input); // dataURL/URL
        else srcP = _fileToDataUrl(input); // File/Blob
        return srcP.then(function (src) {
            return _loadImage(src).then(function (img) {
                var iw = img.naturalWidth || img.width || 1;
                var ih = img.naturalHeight || img.height || 1;
                var scale = Math.min(maxW / iw, maxH / ih, 1);
                var w = Math.max(1, Math.round(iw * scale));
                var h = Math.max(1, Math.round(ih * scale));
                var cv;
                if (CU && CU.imgToCanvas) cv = CU.imgToCanvas(img, maxW, maxH);
                else {
                    cv = document.createElement('canvas');
                    cv.width = w;
                    cv.height = h;
                    cv.getContext('2d').drawImage(img, 0, 0, w, h);
                }
                var dataUrl = cv.toDataURL(format, quality);
                var blob = CU && CU.base64ToBlob ? CU.base64ToBlob(dataUrl) : null;
                return {
                    id: 'w2ip_' + ++SEQ,
                    dataUrl: dataUrl,
                    blob: blob,
                    w: cv.width,
                    h: cv.height,
                    name: name,
                    size: blob ? blob.size : Math.round((dataUrl.length * 3) / 4),
                };
            });
        });
    }

    function imagesFromClipboard(clip) {
        var out = [];
        var items = clip && clip.items;
        if (!items) return out;
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (it.kind === 'file' && it.type && it.type.indexOf('image/') === 0) {
                var f = it.getAsFile();
                if (f) out.push(f);
            }
        }
        return out;
    }
    function imagesFromDataTransfer(dt) {
        var out = [];
        var files = dt && dt.files;
        if (!files) return out;
        for (var i = 0; i < files.length; i++) {
            if (files[i].type && files[i].type.indexOf('image/') === 0) out.push(files[i]);
        }
        return out;
    }

    // ── CSS (1 lần) ─────────────────────────────────────────────────────────
    function _ensureCss() {
        if (document.getElementById('w2ip-css')) return;
        var st = document.createElement('style');
        st.id = 'w2ip-css';
        st.textContent = [
            '.w2ip{display:flex;flex-direction:column;gap:8px;}',
            '.w2ip-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;',
            'padding:18px 14px;border:1.5px dashed #cbd5e1;border-radius:10px;background:#f8fafc;',
            'color:#64748b;font-size:13px;text-align:center;cursor:pointer;outline:none;',
            'transition:border-color 140ms,background 140ms,box-shadow 140ms;}',
            '.w2ip-drop:hover,.w2ip-drop:focus-visible{border-color:#6366f1;background:#eef2ff;color:#4338ca;}',
            '.w2ip-drop.is-drag{border-color:#4338ca;background:#e0e7ff;color:#3730a3;box-shadow:0 0 0 3px rgba(99,102,241,.18);}',
            '.w2ip-drop.is-armed{border-color:#10b981;background:#ecfdf5;color:#047857;}',
            '.w2ip-drop .w2ip-ic{width:24px;height:24px;opacity:.8;}',
            '.w2ip-drop b{color:inherit;font-weight:700;}',
            '.w2ip-drop kbd{font:600 11px/1 ui-monospace,Menlo,monospace;background:#fff;border:1px solid #cbd5e1;',
            'border-radius:4px;padding:1px 5px;color:#475569;}',
            '.w2ip-hint{font-size:11px;color:#94a3b8;}',
            '.w2ip.compact .w2ip-drop{flex-direction:row;padding:10px 12px;gap:8px;}',
            '.w2ip-tray{display:flex;flex-wrap:wrap;gap:8px;}',
            '.w2ip-thumb{position:relative;width:64px;height:64px;border:1px solid #e5e7eb;border-radius:8px;',
            'overflow:hidden;background:#fff;flex:0 0 auto;box-shadow:0 1px 3px rgba(0,0,0,.08);}',
            '.w2ip-thumb img{width:100%;height:100%;object-fit:cover;display:block;cursor:zoom-in;}',
            '.w2ip-thumb .w2ip-del{position:absolute;top:2px;right:2px;width:18px;height:18px;border:none;',
            'border-radius:50%;background:rgba(15,23,42,.72);color:#fff;font-size:12px;line-height:1;cursor:pointer;',
            'display:flex;align-items:center;justify-content:center;padding:0;}',
            '.w2ip-thumb .w2ip-del:hover{background:#dc2626;}',
            '.w2ip-busy{font-size:12px;color:#6366f1;display:flex;align-items:center;gap:6px;}',
            // enhance(): highlight khi kéo-thả + hint chip cạnh input gốc.
            '.w2ip-enh-drag{outline:2px dashed #6366f1;outline-offset:3px;border-radius:8px;',
            'background:rgba(99,102,241,.06);}',
            '.w2ip-enh-hint{font-size:11px;color:#94a3b8;margin-top:5px;line-height:1.4;}',
        ].join('');
        document.head.appendChild(st);
    }

    // Theo dõi area được "armed" gần nhất (hover/focus) → document paste route vào.
    var _armed = null;

    function mount(target, opts) {
        opts = opts || {};
        _ensureCss();
        var host = typeof target === 'string' ? document.querySelector(target) : target;
        if (!host) {
            _notify(opts.onError, 'Web2ImagePaste: không tìm thấy target', 'error');
            return null;
        }
        var multiple = !!opts.multiple;
        var maxFiles = opts.maxFiles || (multiple ? 10 : 1);
        var label =
            opts.label || (multiple ? 'Dán / kéo-thả / chọn ảnh' : 'Dán / kéo-thả / chọn 1 ảnh');
        var hint = opts.hint != null ? opts.hint : 'Hỗ trợ Ctrl+V dán ảnh từ clipboard.';
        var hardLimitMB = opts.hardLimitMB || 12;
        var items = [];

        var root = document.createElement('div');
        root.className = 'w2ip' + (opts.compact ? ' compact' : '');
        root.innerHTML =
            '<div class="w2ip-drop" tabindex="0" role="button" aria-label="' +
            _esc(label) +
            '">' +
            '<svg class="w2ip-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
            'stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
            '<polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
            '<span><b>' +
            _esc(label) +
            '</b></span>' +
            '<span class="w2ip-paste-tip"><kbd>Ctrl</kbd>+<kbd>V</kbd> để dán ảnh</span>' +
            '</div>' +
            (hint ? '<div class="w2ip-hint">' + _esc(hint) + '</div>' : '') +
            '<div class="w2ip-busy" hidden><span>Đang xử lý ảnh…</span></div>' +
            '<div class="w2ip-tray"></div>' +
            '<input type="file" accept="image/*" ' +
            (multiple ? 'multiple ' : '') +
            'hidden>';
        host.appendChild(root);

        var drop = root.querySelector('.w2ip-drop');
        var tray = root.querySelector('.w2ip-tray');
        var busy = root.querySelector('.w2ip-busy');
        var fileInput = root.querySelector('input[type=file]');
        var destroyed = false;

        function setBusy(on) {
            busy.hidden = !on;
        }
        function emit() {
            if (typeof opts.onChange === 'function') opts.onChange(items.slice());
        }
        function renderTray() {
            if (!items.length) {
                tray.innerHTML = '';
                return;
            }
            var urls = items.map(function (it) {
                return it.dataUrl;
            });
            tray.innerHTML = items
                .map(function (it, i) {
                    return (
                        '<div class="w2ip-thumb" data-id="' +
                        _esc(it.id) +
                        '">' +
                        '<img src="' +
                        _esc(it.dataUrl) +
                        '" alt="" data-idx="' +
                        i +
                        '" data-w2-no-zoom>' +
                        '<button type="button" class="w2ip-del" title="Xoá ảnh" aria-label="Xoá ảnh">×</button>' +
                        '</div>'
                    );
                })
                .join('');
            // click thumb → lightbox; nút × → xoá.
            tray.querySelectorAll('.w2ip-thumb').forEach(function (el) {
                var id = el.getAttribute('data-id');
                var img = el.querySelector('img');
                var del = el.querySelector('.w2ip-del');
                if (img)
                    img.addEventListener('click', function () {
                        if (global.Web2ImageLightbox && global.Web2ImageLightbox.open) {
                            global.Web2ImageLightbox.open(
                                urls,
                                Number(img.getAttribute('data-idx')) || 0
                            );
                        }
                    });
                if (del)
                    del.addEventListener('click', function (e) {
                        e.stopPropagation();
                        removeById(id);
                    });
            });
        }
        function removeById(id) {
            items = items.filter(function (it) {
                return it.id !== id;
            });
            renderTray();
            emit();
        }

        function addFiles(fileList) {
            var files = [];
            for (var i = 0; i < (fileList ? fileList.length : 0); i++) {
                var f = fileList[i];
                if (!f) continue;
                if (!f.type || f.type.indexOf('image/') !== 0) {
                    _notify(
                        opts.onError,
                        'Bỏ qua file không phải ảnh: ' + (f.name || ''),
                        'warning'
                    );
                    continue;
                }
                if (f.size > hardLimitMB * 1024 * 1024) {
                    _notify(opts.onError, 'Ảnh > ' + hardLimitMB + 'MB — quá lớn, bỏ qua', 'error');
                    continue;
                }
                files.push(f);
            }
            if (!files.length) return Promise.resolve();
            // Single-mode: ảnh mới thay ảnh cũ.
            if (!multiple) {
                items = [];
                files = files.slice(0, 1);
            } else {
                var room = maxFiles - items.length;
                if (room <= 0) {
                    _notify(opts.onError, 'Tối đa ' + maxFiles + ' ảnh', 'warning');
                    return Promise.resolve();
                }
                files = files.slice(0, room);
            }
            setBusy(true);
            return Promise.all(
                files.map(function (f) {
                    return compress(f, opts).catch(function (e) {
                        _notify(opts.onError, 'Nén ảnh lỗi: ' + e.message, 'error');
                        return null;
                    });
                })
            ).then(function (results) {
                results.forEach(function (r) {
                    if (r) items.push(r);
                });
                setBusy(false);
                renderTray();
                emit();
            });
        }

        // Pre-fill (chế độ sửa) — KHÔNG nén lại, chỉ hiển thị.
        if (Array.isArray(opts.initial) && opts.initial.length) {
            opts.initial.forEach(function (u) {
                if (u)
                    items.push({
                        id: 'w2ip_init_' + ++SEQ,
                        dataUrl: u,
                        blob: null,
                        w: 0,
                        h: 0,
                        name: 'existing',
                        size: 0,
                        existing: true,
                    });
            });
            renderTray();
        }

        // ── Events ───────────────────────────────────────────────────────────
        function onClickDrop() {
            fileInput.click();
        }
        function onKeyDrop(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInput.click();
            }
        }
        function onFileChange() {
            addFiles(fileInput.files);
            fileInput.value = '';
        }
        function onDragOver(e) {
            e.preventDefault();
            drop.classList.add('is-drag');
        }
        function onDragLeave() {
            drop.classList.remove('is-drag');
        }
        function onDrop(e) {
            e.preventDefault();
            drop.classList.remove('is-drag');
            var imgs = imagesFromDataTransfer(e.dataTransfer);
            if (imgs.length) addFiles(imgs);
        }
        // Hover/focus → "armed" để document paste route vào area này (không cần
        // bấm trước). Cùng UX Web2Effects.attachImageDropTarget.
        function arm() {
            _armed = ctrl;
            drop.classList.add('is-armed');
        }
        function disarm() {
            if (_armed === ctrl) _armed = null;
            drop.classList.remove('is-armed');
        }
        function onAreaPaste(e) {
            var imgs = imagesFromClipboard(e.clipboardData);
            if (imgs.length) {
                e.preventDefault();
                addFiles(imgs);
            }
        }

        drop.addEventListener('click', onClickDrop);
        drop.addEventListener('keydown', onKeyDrop);
        fileInput.addEventListener('change', onFileChange);
        drop.addEventListener('dragover', onDragOver);
        drop.addEventListener('dragenter', onDragOver);
        drop.addEventListener('dragleave', onDragLeave);
        drop.addEventListener('drop', onDrop);
        drop.addEventListener('mouseenter', arm);
        drop.addEventListener('mouseleave', disarm);
        drop.addEventListener('focus', arm);
        drop.addEventListener('blur', disarm);
        drop.addEventListener('paste', onAreaPaste);

        var ctrl = {
            element: root,
            getItems: function () {
                return items.slice();
            },
            getDataUrls: function () {
                return items.map(function (it) {
                    return it.dataUrl;
                });
            },
            count: function () {
                return items.length;
            },
            clear: function () {
                items = [];
                renderTray();
                emit();
            },
            addFiles: addFiles,
            destroy: function () {
                if (destroyed) return;
                destroyed = true;
                disarm();
                if (root.parentNode) root.parentNode.removeChild(root);
            },
        };
        return ctrl;
    }

    // ── enhance(input) — nâng cấp 1 <input type=file> SẴN CÓ để cũng nhận
    // DÁN (Ctrl+V) + kéo-thả, GIỮ nút "Chọn file" gốc. Dùng cho trang đã có
    // file input + handler riêng (ai-hub, video-maker, fb-posts, photo-studio…):
    // chỉ thêm 1 dòng gọi, KHÔNG đổi handler — ảnh dán/thả được BƠM vào
    // input.files + dispatch 'change' → handler sẵn có chạy như chọn file.
    //   enhance(target, { dropZone, onFiles, hint, hintText, hintInto, onError })
    function enhance(target, opts) {
        opts = opts || {};
        _ensureCss();
        var input = typeof target === 'string' ? document.querySelector(target) : target;
        if (!input) return { detach: function () {} };
        if (input.__w2ipEnhanced) return input.__w2ipEnhanced;
        var zone = opts.dropZone
            ? typeof opts.dropZone === 'string'
                ? document.querySelector(opts.dropZone)
                : opts.dropZone
            : input.closest('label') || input.parentElement || input;
        if (!zone) zone = input;
        var multiple = !!input.multiple;
        var hintEl = null;

        function deliver(files) {
            var list = multiple ? files : files.slice(0, 1);
            if (!list.length) return;
            if (typeof opts.onFiles === 'function') {
                opts.onFiles(list);
                return;
            }
            // Bơm vào input.files + dispatch change → handler sẵn có của trang chạy.
            try {
                var dt = new DataTransfer();
                list.forEach(function (f) {
                    dt.items.add(f);
                });
                input.files = dt.files;
                input.dispatchEvent(new Event('change', { bubbles: true }));
            } catch (e) {
                _notify(
                    opts.onError,
                    'Trình duyệt không bơm được ảnh dán — dùng nút chọn file',
                    'warning'
                );
            }
        }
        function onDragOver(e) {
            e.preventDefault();
            zone.classList.add('w2ip-enh-drag');
        }
        function onDragLeave() {
            zone.classList.remove('w2ip-enh-drag');
        }
        function onDrop(e) {
            e.preventDefault();
            zone.classList.remove('w2ip-enh-drag');
            deliver(imagesFromDataTransfer(e.dataTransfer));
        }
        var sink = { element: zone, addFiles: deliver };
        function arm() {
            _armed = sink;
        }
        function disarm() {
            if (_armed === sink) _armed = null;
        }

        zone.addEventListener('dragover', onDragOver);
        zone.addEventListener('dragenter', onDragOver);
        zone.addEventListener('dragleave', onDragLeave);
        zone.addEventListener('drop', onDrop);
        zone.addEventListener('mouseenter', arm);
        zone.addEventListener('mouseleave', disarm);
        input.addEventListener('focus', arm);
        input.addEventListener('blur', disarm);

        if (opts.hint !== false) {
            hintEl = document.createElement('div');
            hintEl.className = 'w2ip-enh-hint';
            hintEl.textContent =
                '📋 ' + (opts.hintText || 'hoặc DÁN ảnh (Ctrl+V) / kéo-thả vào đây');
            var into = opts.hintInto
                ? typeof opts.hintInto === 'string'
                    ? document.querySelector(opts.hintInto)
                    : opts.hintInto
                : zone;
            if (into) into.appendChild(hintEl);
        }

        var handle = {
            detach: function () {
                zone.removeEventListener('dragover', onDragOver);
                zone.removeEventListener('dragenter', onDragOver);
                zone.removeEventListener('dragleave', onDragLeave);
                zone.removeEventListener('drop', onDrop);
                zone.removeEventListener('mouseenter', arm);
                zone.removeEventListener('mouseleave', disarm);
                input.removeEventListener('focus', arm);
                input.removeEventListener('blur', disarm);
                if (hintEl && hintEl.parentNode) hintEl.parentNode.removeChild(hintEl);
                disarm();
                delete input.__w2ipEnhanced;
            },
        };
        input.__w2ipEnhanced = handle;
        return handle;
    }

    // Document-level paste → route vào area đang "armed" (hover/focus) nếu ô
    // đó không tự nuốt sự kiện (vd con trỏ ở body). 1 listener toàn cục.
    document.addEventListener('paste', function (e) {
        if (!_armed) return;
        var t = e.target;
        // Nếu đang gõ trong input/textarea khác → để yên.
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
            if (!_armed.element.contains(t)) return;
        }
        var imgs = imagesFromClipboard(e.clipboardData);
        if (imgs.length) {
            e.preventDefault();
            _armed.addFiles(imgs);
        }
    });

    global.Web2ImagePaste = {
        mount: mount,
        enhance: enhance,
        compress: compress,
        imagesFromClipboard: imagesFromClipboard,
        imagesFromDataTransfer: imagesFromDataTransfer,
    };
})(typeof window !== 'undefined' ? window : globalThis);
