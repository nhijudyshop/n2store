// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — Web2VnAddress: bộ chọn Tỉnh/TP → Phường/Xã (2 cấp, dùng chung).
// =====================================================================
// Web2VnAddress — NGUỒN DUY NHẤT chọn đơn vị hành chính VN (Web 2.0).
//
// Dữ liệu: web2/shared/data/vn-units.json (sinh bởi
//   scripts/gen-vn-address-data.js từ thanglequoc/vietnamese-provinces-database,
//   MIT). 2 cấp: Tỉnh/TP → Phường/Xã (VN bỏ cấp Quận/Huyện 01/07/2025).
//
// Lazy-load 1 lần (HTTP cache + singleton), KHÔNG backend route — data
//   tĩnh phục vụ qua GitHub Pages. Mount dropdown phụ thuộc lên 2 <select>
//   bất kỳ; giữ NGUYÊN giá trị legacy không khớp dataset (không mất data).
//
// API (window.Web2VnAddress):
//   await load()                         → { meta, provinces }
//   getProvinces()                       → [{ code, name }]
//   getWards(provinceCode)               → [{ code, name }]
//   findProvince(nameOrCode)             → { code, name } | null
//   findWard(provinceCode, nameOrCode)   → { code, name } | null
//   mount({ provinceEl, wardEl, province, ward, includeBlank, onChange })
//        → controller { getValue(), setValue(), refresh(), destroy() }
//   getValue() trả { provinceCode, provinceName, wardCode, wardName }
// =====================================================================

(function () {
    'use strict';
    if (window.Web2VnAddress) return;

    const DATA_VERSION = '2tier-34p-3321w'; // bump khi regen vn-units.json (cache-bust)
    const SCRIPT_SRC = (document.currentScript && document.currentScript.src) || '';

    // ─── State ──────────────────────────────────────────────────────────
    let _loadPromise = null;
    let _data = null; // { meta, provinces:[{code,name,wards:[{code,name}]}] }
    let _provByCode = null; // Map code → province
    let _stylesInjected = false;

    // ─── Chuẩn hoá tên để so khớp legacy free-text ──────────────────────
    const UNIT_PREFIX_RE =
        /^(thanh pho|thanh-pho|tp\.?|tinh|phuong|xa|thi tran|thi-tran|quan|huyen|dac khu|dac-khu)\s+/i;

    function stripDiacritics(s) {
        return String(s || '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D');
    }
    function normName(s) {
        let t = stripDiacritics(s).toLowerCase().trim().replace(/\s+/g, ' ');
        // Bỏ tiền tố đơn vị (có thể lặp: "tp. ho chi minh" → "ho chi minh")
        let prev;
        do {
            prev = t;
            t = t.replace(UNIT_PREFIX_RE, '').trim();
        } while (t !== prev);
        return t;
    }

    // ─── Load dataset (lazy, 1 lần) ─────────────────────────────────────
    function _dataUrl() {
        const rel = 'data/vn-units.json?v=' + DATA_VERSION;
        try {
            if (SCRIPT_SRC) return new URL(rel, SCRIPT_SRC).href;
        } catch (_) {}
        // Fallback: đường dẫn tương đối từ trang (web2/shared/ chuẩn)
        return '../shared/' + rel;
    }

    async function load() {
        if (_data) return _data;
        if (_loadPromise) return _loadPromise;
        _loadPromise = (async () => {
            const res = await fetch(_dataUrl(), { cache: 'force-cache' });
            if (!res.ok) throw new Error('vn-units.json HTTP ' + res.status);
            const json = await res.json();
            if (!json || !Array.isArray(json.provinces))
                throw new Error('vn-units.json shape invalid');
            _data = json;
            _provByCode = new Map(json.provinces.map((p) => [p.code, p]));
            return _data;
        })();
        try {
            return await _loadPromise;
        } catch (e) {
            _loadPromise = null; // cho phép thử lại
            throw e;
        }
    }

    // ─── Accessors (yêu cầu đã load()) ──────────────────────────────────
    function getProvinces() {
        return _data ? _data.provinces.map((p) => ({ code: p.code, name: p.name })) : [];
    }
    function getWards(provinceCode) {
        const p = _provByCode && _provByCode.get(String(provinceCode || ''));
        return p ? p.wards.map((w) => ({ code: w.code, name: w.name })) : [];
    }
    function findProvince(nameOrCode) {
        if (!_data || !nameOrCode) return null;
        const raw = String(nameOrCode).trim();
        if (_provByCode.has(raw)) return _provByCode.get(raw);
        const n = normName(raw);
        if (!n) return null;
        return _data.provinces.find((p) => normName(p.name) === n) || null;
    }
    function findWard(provinceCode, nameOrCode) {
        const p = _provByCode && _provByCode.get(String(provinceCode || ''));
        if (!p || !nameOrCode) return null;
        const raw = String(nameOrCode).trim();
        const byCode = p.wards.find((w) => w.code === raw);
        if (byCode) return byCode;
        const n = normName(raw);
        if (!n) return null;
        return p.wards.find((w) => normName(w.name) === n) || null;
    }

    // ─── CSS tối thiểu (1 lần) ──────────────────────────────────────────
    function _injectStyles() {
        if (_stylesInjected) return;
        _stylesInjected = true;
        const css = `
.w2vn-select{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--w2vn-border,#d7dbe0);
  border-radius:8px;font-size:14px;background:#fff;color:#1f2430;line-height:1.4;cursor:pointer;
  transition:border-color .15s ease,box-shadow .15s ease;}
.w2vn-select:focus{outline:none;border-color:#0068ff;box-shadow:0 0 0 3px rgba(0,104,255,.15);}
.w2vn-select:disabled{background:#f3f4f6;color:#9aa1ab;cursor:not-allowed;}
.w2vn-select option[data-legacy="1"]{color:#b06f00;}`;
        const el = document.createElement('style');
        el.id = 'w2vn-styles';
        el.textContent = css;
        document.head.appendChild(el);
    }

    function _resolveEl(elOrSel) {
        if (!elOrSel) return null;
        return typeof elOrSel === 'string' ? document.querySelector(elOrSel) : elOrSel;
    }
    function _opt(value, label, extra) {
        const o = document.createElement('option');
        o.value = value;
        o.textContent = label;
        if (extra && extra.code != null) o.dataset.code = extra.code;
        if (extra && extra.legacy) o.dataset.legacy = '1';
        return o;
    }

    // ─── Mount dropdown phụ thuộc lên 2 <select> ────────────────────────
    // provinceEl/wardEl: <select> hoặc selector. province/ward: giá trị
    // ban đầu (code HOẶC name, kể cả legacy free-text). Lưu .value = NAME
    // (full name) để tương thích form cũ; .dataset.code giữ code chuẩn.
    function mount(opts) {
        opts = opts || {};
        _injectStyles();
        const provEl = _resolveEl(opts.provinceEl);
        const wardEl = _resolveEl(opts.wardEl);
        const includeBlank = opts.includeBlank !== false;
        const onChange = typeof opts.onChange === 'function' ? opts.onChange : null;
        if (provEl) provEl.classList.add('w2vn-select');
        if (wardEl) wardEl.classList.add('w2vn-select');

        let curProvCode = '';

        function fillProvinces(selProvinceRaw) {
            if (!provEl) return;
            const match = findProvince(selProvinceRaw);
            provEl.innerHTML = '';
            if (includeBlank) provEl.appendChild(_opt('', '— Chọn Tỉnh/TP —'));
            for (const p of getProvinces()) {
                provEl.appendChild(_opt(p.name, p.name, { code: p.code }));
            }
            if (match) {
                provEl.value = match.name;
                curProvCode = match.code;
            } else if (selProvinceRaw) {
                // Legacy không khớp dataset → giữ nguyên, không mất data.
                provEl.appendChild(
                    _opt(String(selProvinceRaw), String(selProvinceRaw) + ' (cũ)', { legacy: true })
                );
                provEl.value = String(selProvinceRaw);
                curProvCode = '';
            } else {
                provEl.value = '';
                curProvCode = '';
            }
        }

        function fillWards(selWardRaw) {
            if (!wardEl) return;
            const wards = curProvCode ? getWards(curProvCode) : [];
            const match = curProvCode ? findWard(curProvCode, selWardRaw) : null;
            wardEl.innerHTML = '';
            if (includeBlank) wardEl.appendChild(_opt('', '— Chọn Phường/Xã —'));
            for (const w of wards) wardEl.appendChild(_opt(w.name, w.name, { code: w.code }));
            wardEl.disabled = !curProvCode && !selWardRaw;
            if (match) {
                wardEl.value = match.name;
            } else if (selWardRaw) {
                wardEl.appendChild(
                    _opt(String(selWardRaw), String(selWardRaw) + ' (cũ)', { legacy: true })
                );
                wardEl.value = String(selWardRaw);
                wardEl.disabled = false;
            } else {
                wardEl.value = '';
            }
        }

        function onProvinceChange() {
            const sel = provEl.selectedOptions[0];
            curProvCode = (sel && sel.dataset.code) || '';
            fillWards('');
            if (onChange) onChange(getValue());
        }
        function onWardChange() {
            if (onChange) onChange(getValue());
        }

        function getValue() {
            const provSel = provEl && provEl.selectedOptions[0];
            const wardSel = wardEl && wardEl.selectedOptions[0];
            return {
                provinceCode: (provSel && provSel.dataset.code) || '',
                provinceName: (provEl && provEl.value) || '',
                wardCode: (wardSel && wardSel.dataset.code) || '',
                wardName: (wardEl && wardEl.value) || '',
            };
        }

        function setValue(province, ward) {
            fillProvinces(province);
            fillWards(ward);
        }

        function refresh() {
            const v = getValue();
            setValue(v.provinceName, v.wardName);
        }

        if (provEl) provEl.addEventListener('change', onProvinceChange);
        if (wardEl) wardEl.addEventListener('change', onWardChange);

        // Khởi tạo: nếu data chưa sẵn → load rồi fill; nếu đã có → fill ngay.
        const init = () => setValue(opts.province, opts.ward);
        if (_data) {
            init();
        } else {
            if (provEl) {
                provEl.innerHTML = '';
                provEl.appendChild(_opt('', 'Đang tải…'));
                provEl.disabled = true;
            }
            if (wardEl) {
                wardEl.innerHTML = '';
                wardEl.disabled = true;
            }
            load()
                .then(() => {
                    if (provEl) provEl.disabled = false;
                    init();
                })
                .catch((e) => {
                    console.error('[Web2VnAddress] load failed:', e.message);
                    // Fallback: degrade về input rỗng giữ giá trị ban đầu (legacy text).
                    if (provEl) {
                        provEl.innerHTML = '';
                        provEl.disabled = false;
                        if (opts.province)
                            provEl.appendChild(
                                _opt(String(opts.province), String(opts.province), { legacy: true })
                            );
                        provEl.value = opts.province || '';
                    }
                    if (wardEl) {
                        wardEl.innerHTML = '';
                        wardEl.disabled = false;
                        if (opts.ward)
                            wardEl.appendChild(
                                _opt(String(opts.ward), String(opts.ward), { legacy: true })
                            );
                        wardEl.value = opts.ward || '';
                    }
                });
        }

        function destroy() {
            if (provEl) provEl.removeEventListener('change', onProvinceChange);
            if (wardEl) wardEl.removeEventListener('change', onWardChange);
        }

        return { getValue, setValue, refresh, destroy };
    }

    window.Web2VnAddress = {
        load,
        getProvinces,
        getWards,
        findProvince,
        findWard,
        normName,
        mount,
        get meta() {
            return _data ? _data.meta : null;
        },
    };
})();
