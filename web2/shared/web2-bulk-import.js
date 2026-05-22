// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Bulk import helper — Excel/CSV parse + validate + chunked POST.
 * Dùng cho F03 (products/variants/category) + reuse.
 *
 * Public API:
 *   Web2BulkImport.openModal({ entity, schema, endpoint, onDone })
 *     entity   — 'products' | 'variants' | 'productcategory' | …
 *     schema   — [{ field, label, required, type, validate? }]
 *     endpoint — backend bulk-create URL
 *     onDone   — (result: { ok: n, fail: m, failedRows: [] }) => void
 *
 * Lazy-load SheetJS từ CDN khi modal mở.
 */
(function (global) {
    'use strict';
    if (global.Web2BulkImport) return;

    const XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.20.3/dist/xlsx.full.min.js';

    function loadSheetJS() {
        if (global.XLSX) return Promise.resolve(global.XLSX);
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = XLSX_CDN;
            s.onload = () => resolve(global.XLSX);
            s.onerror = () => reject(new Error('Không tải được SheetJS từ CDN'));
            document.head.appendChild(s);
        });
    }

    function parseFile(file) {
        return loadSheetJS().then(
            (XLSX) =>
                new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        try {
                            const wb = XLSX.read(e.target.result, {
                                type: 'array',
                                raw: false,
                                cellText: true,
                            });
                            const sheet = wb.Sheets[wb.SheetNames[0]];
                            const rows = XLSX.utils.sheet_to_json(sheet, {
                                defval: '',
                                raw: false,
                            });
                            resolve(rows);
                        } catch (err) {
                            reject(err);
                        }
                    };
                    reader.onerror = () => reject(reader.error);
                    reader.readAsArrayBuffer(file);
                })
        );
    }

    function validate(rows, schema) {
        const out = { valid: [], invalid: [] };
        const seenCodes = new Set();
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const errors = [];
            for (const def of schema) {
                const v = r[def.label] ?? r[def.field] ?? '';
                if (def.required && (v === '' || v == null)) {
                    errors.push(`Thiếu "${def.label}"`);
                    continue;
                }
                if (def.type === 'number' && v !== '' && isNaN(Number(v))) {
                    errors.push(`"${def.label}" phải là số`);
                }
                if (def.validate) {
                    const err = def.validate(v, r);
                    if (err) errors.push(err);
                }
            }
            // dedupe by code if schema has code field
            const code = r.code || r['Mã'] || r['Mã SP'] || '';
            if (code && seenCodes.has(code)) {
                errors.push(`Mã "${code}" trùng dòng khác`);
            } else if (code) {
                seenCodes.add(code);
            }
            if (errors.length) {
                out.invalid.push({ row: i + 2, data: r, errors });
            } else {
                out.valid.push(r);
            }
        }
        return out;
    }

    async function chunkedUpload(rows, endpoint, batchSize = 50, onProgress) {
        let ok = 0;
        let fail = 0;
        const failedRows = [];
        for (let i = 0; i < rows.length; i += batchSize) {
            const chunk = rows.slice(i, i + batchSize);
            try {
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rows: chunk }),
                    credentials: 'include',
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || data.success === false) {
                    fail += chunk.length;
                    failedRows.push(
                        ...chunk.map((r) => ({ row: r, error: data.error || res.status }))
                    );
                } else {
                    ok += data.imported ?? chunk.length;
                    if (data.failed) {
                        fail += data.failed.length;
                        failedRows.push(...data.failed);
                    }
                }
            } catch (err) {
                fail += chunk.length;
                failedRows.push(...chunk.map((r) => ({ row: r, error: err.message })));
            }
            if (onProgress)
                onProgress({ done: Math.min(i + batchSize, rows.length), total: rows.length });
        }
        return { ok, fail, failedRows };
    }

    function escapeHtml(s) {
        const d = document.createElement('div');
        d.textContent = String(s ?? '');
        return d.innerHTML;
    }

    function openModal(opts) {
        const { entity, schema, endpoint, onDone } = opts;
        // Build modal markup
        const back = document.createElement('div');
        back.className = 'w2-bulk-backdrop';
        back.innerHTML = `
            <div class="w2-bulk-modal" role="dialog" aria-label="Import Excel">
                <header class="w2-bulk-head">
                    <h3>Import Excel — ${escapeHtml(entity)}</h3>
                    <button class="w2-bulk-close" aria-label="Đóng">×</button>
                </header>
                <div class="w2-bulk-body">
                    <p class="w2-bulk-hint">
                        Chọn file <code>.xlsx</code> hoặc <code>.csv</code>. Cột yêu cầu:
                        ${schema.map((s) => `<code>${escapeHtml(s.label)}${s.required ? '*' : ''}</code>`).join(' · ')}
                    </p>
                    <input type="file" accept=".xlsx,.xls,.csv" class="w2-bulk-file" />
                    <div class="w2-bulk-preview"></div>
                </div>
                <footer class="w2-bulk-foot">
                    <button class="w2-bulk-cancel">Huỷ</button>
                    <button class="w2-bulk-submit" disabled>Import</button>
                </footer>
            </div>
        `;
        document.body.appendChild(back);
        const fileInput = back.querySelector('.w2-bulk-file');
        const preview = back.querySelector('.w2-bulk-preview');
        const submit = back.querySelector('.w2-bulk-submit');
        const close = () => back.remove();
        back.querySelector('.w2-bulk-close').onclick = close;
        back.querySelector('.w2-bulk-cancel').onclick = close;
        back.onclick = (e) => {
            if (e.target === back) close();
        };

        let validRows = [];
        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            preview.innerHTML = '<div class="w2-bulk-loading">Đang đọc file…</div>';
            submit.disabled = true;
            try {
                const rows = await parseFile(file);
                const { valid, invalid } = validate(rows, schema);
                validRows = valid;
                let html = `<div class="w2-bulk-stats">
                    <span class="w2-bulk-ok">${valid.length} dòng OK</span>
                    ${invalid.length ? `<span class="w2-bulk-bad">${invalid.length} dòng lỗi</span>` : ''}
                </div>`;
                if (invalid.length) {
                    html += `<table class="w2-bulk-errtbl"><thead><tr><th>Dòng</th><th>Lỗi</th></tr></thead><tbody>`;
                    for (const e of invalid.slice(0, 50)) {
                        html += `<tr><td>${e.row}</td><td>${escapeHtml(e.errors.join('; '))}</td></tr>`;
                    }
                    html += `</tbody></table>`;
                    if (invalid.length > 50) html += `<p>+ ${invalid.length - 50} lỗi khác…</p>`;
                }
                if (valid.length) {
                    html += `<table class="w2-bulk-prevtbl"><thead><tr>${schema.map((s) => `<th>${escapeHtml(s.label)}</th>`).join('')}</tr></thead><tbody>`;
                    for (const r of valid.slice(0, 10)) {
                        html += `<tr>${schema.map((s) => `<td>${escapeHtml(r[s.label] ?? r[s.field] ?? '')}</td>`).join('')}</tr>`;
                    }
                    html += `</tbody></table>`;
                    if (valid.length > 10) html += `<p>+ ${valid.length - 10} dòng…</p>`;
                }
                preview.innerHTML = html;
                submit.disabled = valid.length === 0;
            } catch (err) {
                preview.innerHTML = `<div class="w2-bulk-bad">Lỗi: ${escapeHtml(err.message)}</div>`;
            }
        };

        submit.onclick = async () => {
            submit.disabled = true;
            submit.textContent = 'Đang import…';
            try {
                const result = await chunkedUpload(validRows, endpoint, 50, ({ done, total }) => {
                    submit.textContent = `Đang import ${done}/${total}…`;
                });
                preview.innerHTML += `<div class="w2-bulk-done">
                    ✓ Import xong: <strong>${result.ok}</strong> OK · <strong class="w2-bulk-bad">${result.fail}</strong> lỗi.
                </div>`;
                submit.textContent = 'Đóng';
                submit.disabled = false;
                submit.onclick = close;
                if (typeof onDone === 'function') onDone(result);
            } catch (err) {
                preview.innerHTML += `<div class="w2-bulk-bad">Lỗi: ${escapeHtml(err.message)}</div>`;
                submit.textContent = 'Đóng';
                submit.disabled = false;
                submit.onclick = close;
            }
        };
    }

    global.Web2BulkImport = Object.freeze({
        openModal,
        parseFile,
        validate,
        chunkedUpload,
    });
})(typeof window !== 'undefined' ? window : globalThis);
