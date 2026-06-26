// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — 1 NGUỒN format số khi NHẬP (live thousand "." + decimal ",") cho Web 2.0.
// =====================================================================
// Web2NumberInput — NGUỒN DUY NHẤT format số ngay khi gõ cho Web 2.0.
//
// Quy ước số Việt Nam: dấu "." ngăn hàng nghìn (1.000, 24.000), dấu ","
// ngăn thập phân (2,64). Người dùng gõ "1000" → ô hiện "1.000".
//
// ⚠ CÁI BẪY .value: ô hiện "1.000" thì Number(el.value) = 1, parseInt = 1
// (JS hiểu "." là dấu thập phân). VÌ VẬY đọc giá trị thật PHẢI qua
// Web2NumberInput.getValue(el) (re-parse) hoặc el.dataset.w2numRaw — TUYỆT
// ĐỐI không Number(el.value) trực tiếp trên ô đã gắn.
//
// Cách dùng:
//   1) Khai báo trong HTML/template:  <input data-w2num>            (số nguyên VND)
//                                     <input data-w2num="decimal">  (thập phân, mặc định 2 chữ số)
//                                     <input data-w2num="3">        (thập phân tối đa 3 chữ số)
//      → auto-init quét + MutationObserver tự gắn cả ô render động (modal rows).
//   2) Hoặc gắn tay:  const api = Web2NumberInput.attach(el, { decimals: 0 });
//      api.get() → Number|null ; api.set(1234) ; api.el
//
// API tĩnh:
//   Web2NumberInput.parse(str)            → Number | null  (vi-VN: "." nghìn, "," thập phân)
//   Web2NumberInput.format(n, { decimals })→ "1.234.567" / "2,64"
//   Web2NumberInput.attach(el, opts)      → { get, set, el }
//   Web2NumberInput.attachAll(root, sel)  → number (số ô vừa gắn)
//   Web2NumberInput.getValue(el)          → Number | null
//   Web2NumberInput.setValue(el, n)       → void
//   Web2NumberInput.config({ observe })   → bật/tắt MutationObserver
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2NumberInput) return;

    var ATTACHED_FLAG = 'w2numAttached'; // dataset.w2numAttached = '1'
    var RAW_KEY = 'w2numRaw'; // dataset.w2numRaw = "1234.5" (giá trị số thật)
    var SIG = /[\d,\-]/; // ký tự "có nghĩa": chữ số, dấu phẩy thập phân, dấu trừ. (dấu "." nghìn là tự sinh → bỏ qua khi giữ caret)
    var DEFAULT_DECIMALS = 2; // cho data-w2num="decimal"

    // ---- CORE: parse / format ------------------------------------------------

    // parse("1.234.567") → 1234567 ; parse("2,64") → 2.64 ; parse("") → null
    function parse(str) {
        if (str == null) return null;
        if (typeof str === 'number') return isFinite(str) ? str : null;
        var s = String(str).trim();
        if (s === '') return null;
        var neg = s[0] === '-';
        // chỉ giữ chữ số, "." (nghìn) và "," (thập phân)
        s = s.replace(/[^\d.,]/g, '');
        if (s === '') return null;
        // bỏ hết dấu "." (ngăn nghìn), đổi "," (thập phân) thành "."
        s = s.replace(/\./g, '').replace(',', '.');
        // nếu còn nhiều dấu "," → chỉ lấy dấu đầu (đã replace 1 cái, phần dư bỏ)
        s = s.replace(/,/g, '');
        var n = Number(s);
        if (!isFinite(n)) return null;
        return neg ? -n : n;
    }

    // format(1234567) → "1.234.567" ; format(2.64,{decimals:2}) → "2,64"
    function format(n, opts) {
        opts = opts || {};
        var decimals = opts.decimals != null ? opts.decimals : 0;
        var num = Number(n);
        if (!isFinite(num)) return '';
        try {
            return num.toLocaleString('vi-VN', {
                minimumFractionDigits: opts.minDecimals != null ? opts.minDecimals : 0,
                maximumFractionDigits: decimals,
            });
        } catch (e) {
            // fallback thủ công nếu Intl lỗi
            return _manualGroup(num, decimals);
        }
    }

    function _manualGroup(num, decimals) {
        var neg = num < 0;
        var abs = Math.abs(num);
        var fixed = decimals > 0 ? abs.toFixed(decimals) : String(Math.round(abs));
        var parts = fixed.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return (neg ? '-' : '') + parts[0] + (parts[1] ? ',' + parts[1] : '');
    }

    // ---- LIVE FORMAT (giữ caret khi gõ) -------------------------------------

    // Format chuỗi đang gõ cho ô SỐ NGUYÊN. Giữ "-" nếu cho phép.
    function _liveInt(raw, allowNeg) {
        var neg = allowNeg && /^\s*-/.test(raw);
        var digits = raw.replace(/\D/g, '');
        if (digits === '') return neg ? '-' : '';
        digits = digits.replace(/^0+(?=\d)/, ''); // bỏ số 0 thừa đầu (giữ "0" đơn)
        var grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return (neg ? '-' : '') + grouped;
    }

    // Format chuỗi đang gõ cho ô THẬP PHÂN. Giữ dấu "," đang gõ dở ("2," → "2,").
    function _liveDecimal(raw, maxDec, allowNeg) {
        var neg = allowNeg && /^\s*-/.test(raw);
        var s = raw.replace(/[^\d,]/g, ''); // chỉ giữ chữ số + dấu phẩy
        var firstComma = s.indexOf(',');
        var intPart,
            decPart,
            hasComma = firstComma !== -1;
        if (hasComma) {
            intPart = s.slice(0, firstComma).replace(/\D/g, '');
            decPart = s.slice(firstComma + 1).replace(/\D/g, '');
            if (maxDec >= 0) decPart = decPart.slice(0, maxDec);
        } else {
            intPart = s.replace(/\D/g, '');
            decPart = '';
        }
        intPart = intPart.replace(/^0+(?=\d)/, '');
        if (intPart === '' && hasComma) intPart = '0';
        var groupedInt = intPart === '' ? '' : intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        var out = groupedInt;
        if (hasComma) out += ',' + decPart;
        return (neg ? '-' : '') + out;
    }

    // Đếm số ký-tự-có-nghĩa trước vị trí caret (bỏ qua dấu "." nghìn tự sinh).
    function _sigBefore(str, caret) {
        var c = 0;
        for (var i = 0; i < caret && i < str.length; i++) if (SIG.test(str[i])) c++;
        return c;
    }
    // Từ số ký-tự-có-nghĩa → vị trí caret trong chuỗi mới.
    function _caretFromSig(str, n) {
        if (n <= 0) return str[0] === '-' ? 1 : 0;
        var c = 0;
        for (var i = 0; i < str.length; i++) {
            if (SIG.test(str[i])) {
                c++;
                if (c === n) return i + 1;
            }
        }
        return str.length;
    }

    // ---- ATTACH --------------------------------------------------------------

    function _reformat(el, st) {
        var oldVal = el.value;
        var caret = el.selectionStart;
        var sig = _sigBefore(oldVal, caret == null ? oldVal.length : caret);
        var nextVal =
            st.decimals > 0
                ? _liveDecimal(oldVal, st.decimals, st.allowNeg)
                : _liveInt(oldVal, st.allowNeg);
        if (nextVal !== oldVal) {
            el.value = nextVal;
            if (caret != null && el.type !== 'number') {
                var pos = _caretFromSig(nextVal, sig);
                try {
                    el.setSelectionRange(pos, pos);
                } catch (e) {}
            }
        }
        // cập nhật giá trị số thật
        var parsed = parse(nextVal);
        el.dataset[RAW_KEY] = parsed == null ? '' : String(parsed);
    }

    function _clampOnBlur(el, st) {
        var v = parse(el.value);
        if (v == null) return;
        if (st.min != null && v < st.min) v = st.min;
        if (st.max != null && v > st.max) v = st.max;
        setValue(el, v, st);
    }

    function attach(el, opts) {
        if (!el || el.nodeType !== 1) return null;
        if (el.dataset[ATTACHED_FLAG] === '1') return el._w2numApi || null;
        opts = opts || {};

        var st = {
            decimals: opts.decimals != null ? opts.decimals : 0,
            allowNeg: !!opts.allowNegative,
            min: opts.min != null ? Number(opts.min) : null,
            max: opts.max != null ? Number(opts.max) : null,
        };

        // ô type=number KHÔNG hiển thị được "." ngăn nghìn → đổi sang text.
        if (el.tagName === 'INPUT' && (el.type === 'number' || el.type === 'tel')) {
            // giữ min/max nếu có (type=number) làm clamp khi blur
            if (st.min == null && el.min !== '') st.min = Number(el.min);
            if (st.max == null && el.max !== '') st.max = Number(el.max);
            el.type = 'text';
        }
        if (el.tagName === 'INPUT' && !el.getAttribute('inputmode')) {
            el.setAttribute('inputmode', st.decimals > 0 ? 'decimal' : 'numeric');
        }
        el.setAttribute('autocomplete', 'off');

        var onInput = function () {
            _reformat(el, st);
        };
        var onBlur = function () {
            _clampOnBlur(el, st);
        };
        el.addEventListener('input', onInput);
        el.addEventListener('blur', onBlur);

        el.dataset[ATTACHED_FLAG] = '1';
        // format giá trị có sẵn (nếu đang là số thô)
        if (el.value !== '') {
            var n = parse(el.value);
            if (n != null) setValue(el, n, st);
        } else {
            el.dataset[RAW_KEY] = '';
        }

        var api = {
            el: el,
            get: function () {
                return getValue(el);
            },
            set: function (n) {
                setValue(el, n, st);
            },
            detach: function () {
                el.removeEventListener('input', onInput);
                el.removeEventListener('blur', onBlur);
                delete el.dataset[ATTACHED_FLAG];
                delete el._w2numApi;
            },
        };
        el._w2numApi = api;
        return api;
    }

    function attachAll(root, selector) {
        root = root || document;
        selector = selector || '[data-w2num]:not([data-' + 'w2num-attached])';
        var list;
        try {
            list = root.querySelectorAll(selector);
        } catch (e) {
            return 0;
        }
        var n = 0;
        for (var i = 0; i < list.length; i++) {
            var el = list[i];
            if (el.dataset[ATTACHED_FLAG] === '1') continue;
            attach(el, _optsFromDataset(el));
            n++;
        }
        return n;
    }

    // Đọc opts từ data-* : data-w2num="decimal|int|<số>" , data-w2num-negative
    function _optsFromDataset(el) {
        var raw = el.getAttribute('data-w2num') || '';
        var decimals = 0;
        var v = raw.trim().toLowerCase();
        if (v === 'decimal') decimals = DEFAULT_DECIMALS;
        else if (v !== '' && v !== 'int' && v !== 'integer') {
            var d = parseInt(v, 10);
            if (!isNaN(d) && d >= 0) decimals = d;
        }
        if (el.hasAttribute('data-w2num-decimals')) {
            var d2 = parseInt(el.getAttribute('data-w2num-decimals'), 10);
            if (!isNaN(d2) && d2 >= 0) decimals = d2;
        }
        return {
            decimals: decimals,
            allowNegative: el.hasAttribute('data-w2num-negative'),
            min: el.hasAttribute('data-w2num-min')
                ? Number(el.getAttribute('data-w2num-min'))
                : null,
            max: el.hasAttribute('data-w2num-max')
                ? Number(el.getAttribute('data-w2num-max'))
                : null,
        };
    }

    // ---- VALUE ACCESS --------------------------------------------------------

    // Giá trị SỐ THẬT của ô (Number|null). DÙNG CÁI NÀY thay cho Number(el.value).
    // Lấy thẳng từ el.value (chuỗi hiển thị parse được không mất mát) — KHÔNG tin
    // dataset.w2numRaw để tránh lệch khi code gán el.value='' trực tiếp (bỏ qua setValue).
    function getValue(el) {
        if (!el) return null;
        return parse(el.value);
    }
    // Tiện ích: trả 0 (hoặc fallback) thay vì null khi rỗng.
    function getValueOr(el, fallback) {
        var v = getValue(el);
        return v == null ? (fallback != null ? fallback : 0) : v;
    }

    function setValue(el, n, st) {
        if (!el) return;
        st = st || { decimals: el.getAttribute('inputmode') === 'decimal' ? DEFAULT_DECIMALS : 0 };
        if (n == null || n === '' || !isFinite(Number(n))) {
            el.value = '';
            el.dataset[RAW_KEY] = '';
            return;
        }
        var num = Number(n);
        el.value = format(num, { decimals: st.decimals });
        el.dataset[RAW_KEY] = String(num);
    }

    // ---- AUTO-INIT + MutationObserver ---------------------------------------

    var _cfg = { observe: true };
    var _observer = null;
    var _pending = false;

    function _scheduleScan() {
        if (_pending) return;
        _pending = true;
        var run = function () {
            _pending = false;
            attachAll(document);
        };
        if (global.requestAnimationFrame) global.requestAnimationFrame(run);
        else setTimeout(run, 16);
    }

    function _startObserver() {
        if (_observer || !_cfg.observe || !global.MutationObserver || !document.body) return;
        _observer = new MutationObserver(function (muts) {
            for (var i = 0; i < muts.length; i++) {
                if (muts[i].addedNodes && muts[i].addedNodes.length) {
                    _scheduleScan();
                    return;
                }
            }
        });
        _observer.observe(document.body, { childList: true, subtree: true });
    }

    function config(c) {
        c = c || {};
        if (c.observe != null) _cfg.observe = !!c.observe;
        if (_cfg.observe) _startObserver();
        else if (_observer) {
            _observer.disconnect();
            _observer = null;
        }
        return _cfg;
    }

    function _init() {
        attachAll(document);
        _startObserver();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _init);
    } else {
        _init();
    }

    global.Web2NumberInput = {
        parse: parse,
        format: format,
        attach: attach,
        attachAll: attachAll,
        getValue: getValue,
        getValueOr: getValueOr,
        setValue: function (el, n) {
            setValue(el, n);
        },
        config: config,
        DEFAULT_DECIMALS: DEFAULT_DECIMALS,
    };
})(typeof window !== 'undefined' ? window : globalThis);
