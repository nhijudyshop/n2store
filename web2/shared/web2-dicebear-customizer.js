// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared module.
// =====================================================================
// Web2DicebearCustomizer — tuỳ chỉnh avatar DiceBear ĐẦY ĐỦ theo schema thật của
// từng style (KHÔNG chọn lọc/giảm tính năng github). Nạp schema per-style từ
// esm.sh (@dicebear/<style>@9.2.4) → dựng form động cho MỌI option: tóc, mắt,
// lông mày, miệng, kính, khuyên tai, đặc điểm, màu da, màu tóc, xác suất, lật…
//
// API:
//   Web2DicebearCustomizer.mount(box, {base, style, seed, options, onChange}) → ctl
//        ctl.setStyle(style)  — đổi style → nạp schema mới, reset options
//        ctl.setSeed(seed)    — đổi seed (chỉ ảnh hưởng preview, không reset)
//        ctl.getOptions()     — trả options hiện tại
//   Web2DicebearCustomizer.buildUrl(base, style, seed, options) → URL svg HTTP API
//   Web2DicebearCustomizer.getSchema(style) → Promise<props> (cache)
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2DicebearCustomizer) return;

    var ESM = 'https://esm.sh/@dicebear/';
    var VER = '@9.2.4';
    var _cache = {}; // style -> {props} (đã nạp)

    // Nhãn tiếng Việt cho các option phổ biến; thiếu → tự suy từ tên.
    var LABELS = {
        base: 'Khuôn mặt',
        hair: 'Tóc',
        hairColor: 'Màu tóc',
        hairProbability: 'Hiện tóc',
        eyes: 'Mắt',
        eyebrows: 'Lông mày',
        mouth: 'Miệng',
        nose: 'Mũi',
        ears: 'Tai',
        earrings: 'Khuyên tai',
        earringsProbability: 'Đeo khuyên tai',
        glasses: 'Kính',
        glassesProbability: 'Đeo kính',
        features: 'Đặc điểm (tàn nhang…)',
        featuresProbability: 'Hiện đặc điểm',
        accessories: 'Phụ kiện',
        accessoriesProbability: 'Đeo phụ kiện',
        facialHair: 'Râu',
        facialHairProbability: 'Để râu',
        mustache: 'Ria',
        mustacheProbability: 'Để ria',
        beard: 'Râu quai nón',
        beardProbability: 'Để râu quai nón',
        freckles: 'Tàn nhang',
        frecklesProbability: 'Hiện tàn nhang',
        skinColor: 'Màu da',
        backgroundColor: 'Màu nền',
        clothing: 'Trang phục',
        clothingColor: 'Màu trang phục',
        clothesColor: 'Màu áo',
        top: 'Kiểu tóc/mũ',
        hat: 'Mũ',
        flip: 'Lật ngang',
        body: 'Thân',
        eyesColor: 'Màu mắt',
    };

    function _label(name) {
        if (LABELS[name]) return LABELS[name];
        // camelCase → "Camel case"
        var s = name
            .replace(/([A-Z])/g, ' $1')
            .replace(/probability/i, '')
            .trim();
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    function _esc(s) {
        return String(s == null ? '' : s).replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }

    // Nạp schema thật của style (esm.sh). Lỗi mạng/CSP → {} (form rỗng, vẫn dùng được).
    async function getSchema(style) {
        if (_cache[style]) return _cache[style];
        var props = {};
        try {
            var mod = await import(/* @vite-ignore */ ESM + encodeURIComponent(style) + VER);
            var schema = mod.schema || (mod.default && mod.default.schema);
            props = (schema && schema.properties) || {};
        } catch (e) {
            props = {};
        }
        _cache[style] = props;
        return props;
    }

    function classify(name, def) {
        if (!def) return { kind: 'other' };
        if (def.type === 'boolean') return { kind: 'bool' };
        if (def.type === 'integer')
            return {
                kind: 'int',
                min: def.minimum == null ? 0 : def.minimum,
                max: def.maximum == null ? 100 : def.maximum,
            };
        if (def.type === 'array') {
            var it = def.items || {};
            if (Array.isArray(it.enum)) return { kind: 'enum', values: it.enum };
            if (it.pattern || /color/i.test(name)) return { kind: 'color' };
            return { kind: 'enum', values: [] };
        }
        return { kind: 'other' };
    }

    function buildUrl(base, style, seed, options) {
        var p = new URLSearchParams({ seed: String(seed || '') });
        var o = options || {};
        Object.keys(o).forEach(function (k) {
            var v = o[k];
            if (v === null || v === undefined || v === '') return;
            p.set(k, String(v));
        });
        return base + '/' + encodeURIComponent(style) + '/svg?' + p.toString();
    }

    var _cssInjected = false;
    function _injectCss() {
        if (_cssInjected) return;
        _cssInjected = true;
        var st = document.createElement('style');
        st.id = 'web2-dbc-css';
        st.textContent = `
.w2dbc{display:grid;grid-template-columns:repeat(2,1fr);gap:8px 12px}
.w2dbc-row{display:flex;flex-direction:column;gap:3px;min-width:0}
.w2dbc-row.full{grid-column:1/-1}
.w2dbc-lbl{font-size:.72rem;color:#64748b;font-weight:600}
.w2dbc-sel{height:34px;border:1px solid #d6dee2;border-radius:8px;padding:0 8px;font:inherit;font-size:.82rem;background:#fff;color:#0f172a;max-width:100%}
.w2dbc-color{display:flex;align-items:center;gap:6px}
.w2dbc-color input[type=color]{width:34px;height:34px;border:1px solid #d6dee2;border-radius:8px;padding:0;background:#fff;cursor:pointer}
.w2dbc-color .w2dbc-auto{font-size:.72rem;color:#64748b;display:inline-flex;align-items:center;gap:4px;cursor:pointer}
.w2dbc-bool{display:flex;align-items:center;gap:6px;font-size:.82rem;color:#334155;cursor:pointer}
.w2dbc-empty{grid-column:1/-1;font-size:.78rem;color:#94a3b8;padding:6px 0}
.w2dbc-loading{grid-column:1/-1;font-size:.8rem;color:#64748b;padding:8px 0}`;
        document.head.appendChild(st);
    }

    // mount: dựng form vào box. options là object (DiceBear params) — sửa tại chỗ + onChange.
    function mount(box, opts) {
        _injectCss();
        opts = opts || {};
        var base = opts.base || 'https://api.dicebear.com/10.x';
        var style = opts.style;
        var seed = opts.seed || 'user';
        var options = Object.assign({}, opts.options || {});
        var onChange = typeof opts.onChange === 'function' ? opts.onChange : function () {};

        function emit() {
            onChange(Object.assign({}, options));
        }

        // Render form từ schema props. probability prop gộp vào enum tương ứng.
        function render(props) {
            var keys = Object.keys(props || {});
            if (!keys.length) {
                box.innerHTML =
                    '<div class="w2dbc-empty">Style này không có tuỳ chọn chi tiết (hoặc chưa tải được). Vẫn đổi được seed/màu nền.</div>';
                return;
            }
            // probability prop -> map theo base name (vd glassesProbability -> glasses)
            var probOf = {};
            keys.forEach(function (k) {
                var m = /^(.*)Probability$/.exec(k);
                if (m) probOf[m[1]] = k;
            });
            var html = '<div class="w2dbc">';
            keys.forEach(function (k) {
                if (/Probability$/.test(k)) return; // xử lý kèm enum cha
                var info = classify(k, props[k]);
                var lbl = _esc(_label(k));
                if (info.kind === 'enum') {
                    var probKey = probOf[k]; // có thể tắt/bật
                    var cur = options[k] != null ? options[k] : '';
                    var optsHtml = '<option value="">🎲 Tự động</option>';
                    if (probKey)
                        optsHtml +=
                            '<option value="__none__"' +
                            (options[probKey] === 0 ? ' selected' : '') +
                            '>🚫 Không có</option>';
                    info.values.forEach(function (v, i) {
                        optsHtml +=
                            '<option value="' +
                            _esc(v) +
                            '"' +
                            (String(cur) === String(v) ? ' selected' : '') +
                            '>Kiểu ' +
                            (i + 1) +
                            '</option>';
                    });
                    html +=
                        '<label class="w2dbc-row"><span class="w2dbc-lbl">' +
                        lbl +
                        '</span><select class="w2dbc-sel" data-prop="' +
                        _esc(k) +
                        (probKey ? '" data-prob="' + _esc(probKey) : '') +
                        '">' +
                        optsHtml +
                        '</select></label>';
                } else if (info.kind === 'color') {
                    var cv = options[k] ? '#' + String(options[k]).replace(/^#/, '') : '#7c5cff';
                    var on = options[k] != null && options[k] !== '';
                    html +=
                        '<div class="w2dbc-row"><span class="w2dbc-lbl">' +
                        lbl +
                        '</span><div class="w2dbc-color"><input type="color" data-prop="' +
                        _esc(k) +
                        '" value="' +
                        _esc(cv) +
                        '"><label class="w2dbc-auto"><input type="checkbox" data-autocolor="' +
                        _esc(k) +
                        '"' +
                        (on ? '' : ' checked') +
                        '> Tự động</label></div></div>';
                } else if (info.kind === 'bool') {
                    html +=
                        '<label class="w2dbc-bool w2dbc-row"><input type="checkbox" data-bool="' +
                        _esc(k) +
                        '"' +
                        (String(options[k]) === 'true' ? ' checked' : '') +
                        '> ' +
                        lbl +
                        '</label>';
                }
            });
            html += '</div>';
            box.innerHTML = html;
            wire();
        }

        function wire() {
            box.querySelectorAll('select[data-prop]').forEach(function (sel) {
                sel.addEventListener('change', function () {
                    var k = sel.getAttribute('data-prop');
                    var probKey = sel.getAttribute('data-prob');
                    var v = sel.value;
                    if (v === '') {
                        delete options[k];
                        if (probKey) delete options[probKey];
                    } else if (v === '__none__') {
                        delete options[k];
                        if (probKey) options[probKey] = 0;
                    } else {
                        options[k] = v;
                        if (probKey) options[probKey] = 100; // chọn kiểu cụ thể → buộc hiện
                    }
                    emit();
                });
            });
            box.querySelectorAll('input[type=color][data-prop]').forEach(function (ci) {
                ci.addEventListener('input', function () {
                    var k = ci.getAttribute('data-prop');
                    options[k] = ci.value.replace(/^#/, '');
                    var auto = box.querySelector('input[data-autocolor="' + k + '"]');
                    if (auto) auto.checked = false;
                    emit();
                });
            });
            box.querySelectorAll('input[data-autocolor]').forEach(function (ac) {
                ac.addEventListener('change', function () {
                    var k = ac.getAttribute('data-autocolor');
                    if (ac.checked) {
                        delete options[k]; // tự động = bỏ param
                    } else {
                        var ci = box.querySelector('input[type=color][data-prop="' + k + '"]');
                        if (ci) options[k] = ci.value.replace(/^#/, '');
                    }
                    emit();
                });
            });
            box.querySelectorAll('input[data-bool]').forEach(function (bi) {
                bi.addEventListener('change', function () {
                    var k = bi.getAttribute('data-bool');
                    if (bi.checked) options[k] = 'true';
                    else delete options[k];
                    emit();
                });
            });
        }

        async function load() {
            box.innerHTML = '<div class="w2dbc-loading">Đang tải tuỳ chọn của style…</div>';
            var props = await getSchema(style);
            render(props);
        }
        load();

        return {
            setStyle: function (s) {
                if (s === style) return;
                style = s;
                options = {}; // style khác → variant khác, reset
                emit();
                load();
            },
            setSeed: function (s) {
                seed = s;
            },
            getOptions: function () {
                return Object.assign({}, options);
            },
        };
    }

    global.Web2DicebearCustomizer = { mount, buildUrl, getSchema, classify };
})(window);
