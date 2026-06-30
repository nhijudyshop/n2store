// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Web2Import — modal nhập dữ liệu hàng loạt từ CSV / TXT / JSON cho Web 2.0.
 *
 * NGUỒN CHUNG (dùng cho Kho SP + Sổ Order + mở rộng sau). Parse native (KHÔNG
 * tải SheetJS — nhẹ, đúng perf budget). Auto-detect định dạng + delimiter,
 * map header → field theo nhãn/khoá không phân biệt dấu, preview + báo lỗi
 * từng dòng, commit qua callback `onCommit` (mỗi trang tự quyết tạo SP /
 * thêm shipment...). Có nút tải file CSV mẫu + copy JSON mẫu để xem cấu trúc.
 *
 * Public API:
 *   Web2Import.open(config)            — mở modal import
 *   Web2Import.downloadSample(config)  — tải thẳng file CSV mẫu (không mở modal)
 *
 * config = {
 *   title:        string,              // tiêu đề modal
 *   entityLabel:  string,              // 'sản phẩm' | 'dòng order'
 *   fileBaseName: string,              // tên file mẫu (không đuôi)
 *   columns: [{
 *     key, label, required?, type?,    // type: 'string'|'number'|'bool'|'enum'
 *     aliases?: string[],              // tên cột thay thế chấp nhận khi map
 *     enumMap?: { [inputLower]: value }, enumValues?: string[],
 *     example?, hint?,
 *   }],
 *   sampleRows:   object[],            // dữ liệu mẫu (key → value)
 *   onCommit: async (rows, { onProgress }) => ({ ok, fail, errors:[{row,error}] }),
 *   onDone?: (result) => void,         // sau khi commit xong (vd reload trang)
 * }
 */
(function (global) {
    'use strict';
    if (global.Web2Import) return;

    const PREVIEW_LIMIT = 12;
    const ERROR_LIMIT = 60;

    // ── Helpers ─────────────────────────────────────────────────────────
    function escapeHtml(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        if (global.Web2Escape) return global.Web2Escape.escapeHtml(s);
        const d = document.createElement('div');
        d.textContent = String(s == null ? '' : s);
        return d.innerHTML;
    }

    // Bỏ dấu + lowercase + chỉ giữ chữ-số → khoá so khớp header mềm dẻo.
    function normKey(s) {
        return String(s == null ? '' : s)
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/đ/gi, 'd')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '');
    }

    // "150.000" / "150,000₫" / "1 200" → 1200 (số nguyên/thực). '' → null.
    function parseNumber(v) {
        if (typeof v === 'number') return isFinite(v) ? v : null;
        let s = String(v == null ? '' : v).trim();
        if (!s) return null;
        const neg = /^-/.test(s);
        // Bỏ ký hiệu tiền + khoảng trắng + dấu ngăn cách hàng nghìn (. , space).
        s = s.replace(/[^\d.,-]/g, '');
        // Nếu có cả . và , → ký tự cuối cùng là dấu thập phân, còn lại là nghìn.
        const lastDot = s.lastIndexOf('.');
        const lastComma = s.lastIndexOf(',');
        const decPos = Math.max(lastDot, lastComma);
        if (lastDot !== -1 && lastComma !== -1) {
            const intPart = s.slice(0, decPos).replace(/[.,]/g, '');
            const decPart = s.slice(decPos + 1).replace(/[.,]/g, '');
            s = intPart + '.' + decPart;
        } else if (decPos !== -1) {
            // Chỉ 1 loại dấu — coi như ngăn cách hàng nghìn (giá tiền VN), bỏ hết.
            s = s.replace(/[.,]/g, '');
        }
        const n = Number(s);
        if (!isFinite(n)) return null;
        return neg && n > 0 ? -n : n;
    }

    function parseBool(v, def) {
        const s = normKey(v);
        if (!s) return def;
        if (['true', '1', 'co', 'x', 'active', 'dangban', 'on', 'yes', 'y'].includes(s))
            return true;
        if (['false', '0', 'khong', 'tamdung', 'ngung', 'inactive', 'off', 'no', 'n'].includes(s))
            return false;
        return def;
    }

    // ── Token N2 (mã base64 export từ trang khác, vd Web 1.0 Purchase Orders) ─
    // Spec (data contract, KHÔNG share code với bên export):
    //   "N2IMPORT1:" + base64( UTF-8 JSON { ..., rows:[...] } )
    // Bên export tự sinh; bên này tự giải — chỉ chung định dạng chuỗi.
    const N2_TOKEN_PREFIX = 'N2IMPORT1:';

    function b64DecodeUtf8(b64) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    }

    // text → JSON string nếu là token N2 hợp lệ; ngược lại null.
    const N2_TOKEN_MAX_B64 = 8_000_000; // ~6 MB JSON — chặn DoS dán chuỗi khổng lồ
    function decodeN2Token(trimmed) {
        if (!trimmed.startsWith(N2_TOKEN_PREFIX)) return null;
        const b64 = trimmed.slice(N2_TOKEN_PREFIX.length).replace(/\s+/g, '');
        if (b64.length > N2_TOKEN_MAX_B64) throw new Error('Mã quá lớn');
        return b64DecodeUtf8(b64); // ném lỗi nếu base64 hỏng → caller bắt
    }

    // ── CSV parsing ─────────────────────────────────────────────────────
    function detectDelimiter(text) {
        const firstLine = (text.split(/\r?\n/).find((l) => l.trim() !== '') || '').slice(0, 4000);
        const counts = { ',': 0, ';': 0, '\t': 0 };
        let inQ = false;
        for (const ch of firstLine) {
            if (ch === '"') inQ = !inQ;
            else if (!inQ && counts[ch] !== undefined) counts[ch]++;
        }
        let best = ',';
        let bestN = -1;
        for (const d of [',', ';', '\t']) {
            if (counts[d] > bestN) {
                bestN = counts[d];
                best = d;
            }
        }
        return best;
    }

    function parseCsv(text, delim) {
        const out = [];
        let field = '';
        let row = [];
        let inQ = false;
        const n = text.length;
        for (let i = 0; i < n; i++) {
            const ch = text[i];
            if (inQ) {
                if (ch === '"') {
                    if (text[i + 1] === '"') {
                        field += '"';
                        i++;
                    } else inQ = false;
                } else field += ch;
                continue;
            }
            if (ch === '"') inQ = true;
            else if (ch === delim) {
                row.push(field);
                field = '';
            } else if (ch === '\r') {
                /* skip */
            } else if (ch === '\n') {
                row.push(field);
                out.push(row);
                row = [];
                field = '';
            } else field += ch;
        }
        if (field !== '' || row.length) {
            row.push(field);
            out.push(row);
        }
        // Bỏ dòng rỗng hoàn toàn.
        return out.filter((r) => r.some((c) => String(c).trim() !== ''));
    }

    // ── Map raw record (obj với header gốc) → record chuẩn theo columns ──
    function buildHeaderMap(columns) {
        const map = {}; // normKey(header) → column.key
        for (const col of columns) {
            const tokens = [col.key, col.label, ...(col.aliases || [])];
            for (const t of tokens) {
                const k = normKey(t);
                if (k && !(k in map)) map[k] = col.key;
            }
        }
        return map;
    }

    // Trả về { rows: [{...normalized}], rawCount }
    function normalizeRecords(rawRecords, columns) {
        const hmap = buildHeaderMap(columns);
        const colByKey = {};
        for (const c of columns) colByKey[c.key] = c;
        const rows = rawRecords.map((rec) => {
            const obj = {};
            for (const rawKey of Object.keys(rec)) {
                const colKey = hmap[normKey(rawKey)];
                if (!colKey) continue;
                obj[colKey] = rec[rawKey];
            }
            // Coerce theo type.
            const norm = {};
            for (const col of columns) {
                let v = obj[col.key];
                if (col.type === 'number') {
                    const n = parseNumber(v);
                    norm[col.key] = n == null ? null : n;
                } else if (col.type === 'bool') {
                    norm[col.key] = parseBool(v, undefined);
                } else if (col.type === 'enum') {
                    const lk = normKey(v);
                    if (col.enumMap && lk && col.enumMap[lk] !== undefined)
                        norm[col.key] = col.enumMap[lk];
                    else norm[col.key] = v == null ? '' : String(v).trim();
                } else {
                    norm[col.key] = v == null ? '' : String(v).trim();
                }
            }
            return norm;
        });
        return rows;
    }

    function validateRows(rows, columns) {
        const valid = [];
        const invalid = [];
        rows.forEach((r, i) => {
            const errors = [];
            for (const col of columns) {
                const v = r[col.key];
                const empty =
                    v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
                if (col.required && empty) errors.push(`Thiếu "${col.label}"`);
                if (!empty && col.type === 'number' && (v === null || isNaN(Number(v))))
                    errors.push(`"${col.label}" phải là số`);
            }
            if (errors.length) invalid.push({ row: i + 2, errors, data: r });
            else valid.push(r);
        });
        return { valid, invalid };
    }

    // ── Parse text input (auto JSON vs CSV) → raw records ───────────────
    function parseInput(text) {
        let trimmed = text.trim();
        if (!trimmed) return { records: [], format: null, error: 'Chưa có dữ liệu' };
        // Token N2 (mã base64) → giải về JSON rồi parse tiếp như JSON thường.
        if (trimmed.startsWith(N2_TOKEN_PREFIX)) {
            try {
                trimmed = decodeN2Token(trimmed).trim();
            } catch (e) {
                return { records: [], format: 'token', error: 'Mã N2 không hợp lệ: ' + e.message };
            }
        }
        // JSON?
        if (trimmed[0] === '[' || trimmed[0] === '{') {
            try {
                let data = JSON.parse(trimmed);
                if (data && !Array.isArray(data) && Array.isArray(data.rows)) data = data.rows;
                if (!Array.isArray(data)) data = [data];
                return { records: data, format: 'json' };
            } catch (e) {
                return { records: [], format: 'json', error: 'JSON không hợp lệ: ' + e.message };
            }
        }
        // CSV / TSV
        const delim = detectDelimiter(trimmed);
        const matrix = parseCsv(trimmed, delim);
        if (matrix.length < 2)
            return {
                records: [],
                format: 'csv',
                error: 'File cần ≥1 dòng tiêu đề + 1 dòng dữ liệu',
            };
        const header = matrix[0].map((h) => String(h).trim());
        const records = matrix.slice(1).map((cells) => {
            const obj = {};
            header.forEach((h, idx) => {
                obj[h] = cells[idx] != null ? cells[idx] : '';
            });
            return obj;
        });
        return { records, format: 'csv' };
    }

    // ── Sample file builders ────────────────────────────────────────────
    function buildSampleCsv(config) {
        const cols = config.columns;
        const esc = (v) => {
            const s = String(v == null ? '' : v);
            return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };
        const header = cols.map((c) => esc(c.label)).join(',');
        const rows = (config.sampleRows || []).map((r) =>
            cols.map((c) => esc(r[c.key] != null ? r[c.key] : '')).join(',')
        );
        return '﻿' + [header, ...rows].join('\r\n'); // BOM cho Excel UTF-8
    }

    function downloadText(filename, text, mime) {
        const blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    }

    function downloadSample(config) {
        const base = config.fileBaseName || 'mau-du-lieu';
        downloadText(base + '.csv', buildSampleCsv(config), 'text/csv');
    }

    function sampleJson(config) {
        return JSON.stringify(config.sampleRows || [], null, 2);
    }

    function notify(msg, type) {
        if (global.notificationManager?.show) global.notificationManager.show(msg, type);
    }

    // ── Structure spec (xem cấu trúc) ───────────────────────────────────
    function structureHtml(config) {
        const rows = config.columns
            .map((c) => {
                const typeLabel = { number: 'Số', bool: 'Đúng/Sai', enum: 'Chọn' }[c.type] || 'Chữ';
                const allowed = c.enumValues ? ` (${c.enumValues.join(' / ')})` : '';
                return `<tr>
                    <td><code>${escapeHtml(c.label)}</code>${c.required ? '<span class="w2imp-req">*</span>' : ''}</td>
                    <td>${escapeHtml(typeLabel)}</td>
                    <td>${escapeHtml((c.hint || '') + allowed)}</td>
                </tr>`;
            })
            .join('');
        return `<table class="w2imp-spec">
            <thead><tr><th>Cột</th><th>Kiểu</th><th>Ghi chú</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
        <p class="w2imp-spec-note">Cột có <span class="w2imp-req">*</span> là bắt buộc. Tên cột không phân biệt hoa thường / dấu. Cột thừa sẽ được bỏ qua.</p>`;
    }

    // ── Modal ───────────────────────────────────────────────────────────
    function open(config) {
        if (!config || !Array.isArray(config.columns) || !config.columns.length) {
            notify('Cấu hình import không hợp lệ', 'error');
            return;
        }
        const back = document.createElement('div');
        back.className = 'w2imp-backdrop';
        back.innerHTML = `
            <div class="w2imp-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(config.title || 'Nhập dữ liệu')}">
                <header class="w2imp-head">
                    <h3><i data-lucide="upload"></i> ${escapeHtml(config.title || 'Nhập dữ liệu')}</h3>
                    <button class="w2imp-close" type="button" aria-label="Đóng">×</button>
                </header>
                <div class="w2imp-toolbar">
                    <button class="w2imp-btn w2imp-btn-ghost" data-act="sample-csv" type="button">
                        <i data-lucide="download"></i> Tải file mẫu (CSV)
                    </button>
                    <button class="w2imp-btn w2imp-btn-ghost" data-act="sample-json" type="button">
                        <i data-lucide="clipboard-copy"></i> Copy JSON mẫu
                    </button>
                    <button class="w2imp-btn w2imp-btn-ghost" data-act="toggle-spec" type="button">
                        <i data-lucide="table-2"></i> Xem cấu trúc
                    </button>
                </div>
                <div class="w2imp-spec-wrap" hidden>${structureHtml(config)}</div>
                <div class="w2imp-body">
                    <div class="w2imp-tabs" role="tablist">
                        <button class="w2imp-tab is-active" data-tab="file" type="button">Tải lên file</button>
                        <button class="w2imp-tab" data-tab="paste" type="button">Dán dữ liệu</button>
                    </div>
                    <div class="w2imp-pane" data-pane="file">
                        <label class="w2imp-drop" tabindex="0">
                            <i data-lucide="file-up"></i>
                            <span>Chọn file <code>.csv</code> / <code>.txt</code> / <code>.json</code> hoặc kéo thả vào đây</span>
                            <input type="file" accept=".csv,.txt,.tsv,.json,text/csv,application/json" hidden />
                        </label>
                        <div class="w2imp-filename" hidden></div>
                    </div>
                    <div class="w2imp-pane" data-pane="paste" hidden>
                        <textarea class="w2imp-textarea" rows="7" placeholder="Dán CSV, JSON ([{...}]) hoặc MÃ N2 (N2IMPORT1:…) vào đây rồi bấm Xem trước…"></textarea>
                        <button class="w2imp-btn w2imp-btn-ghost" data-act="parse-paste" type="button">
                            <i data-lucide="eye"></i> Xem trước
                        </button>
                    </div>
                    <div class="w2imp-preview"></div>
                </div>
                <footer class="w2imp-foot">
                    <span class="w2imp-foot-info"></span>
                    <div class="w2imp-foot-actions">
                        <button class="w2imp-btn w2imp-btn-ghost" data-act="cancel" type="button">Hủy</button>
                        <button class="w2imp-btn w2imp-btn-primary" data-act="commit" type="button" disabled>
                            <i data-lucide="check"></i> Nhập
                        </button>
                    </div>
                </footer>
            </div>`;
        document.body.appendChild(back);
        if (global.lucide) global.lucide.createIcons();

        const q = (sel) => back.querySelector(sel);
        const preview = q('.w2imp-preview');
        const commitBtn = q('[data-act="commit"]');
        const footInfo = q('.w2imp-foot-info');
        let validRows = [];

        const close = () => back.remove();
        q('.w2imp-close').onclick = close;
        q('[data-act="cancel"]').onclick = close;
        back.addEventListener('mousedown', (e) => {
            if (e.target === back) close();
        });
        document.addEventListener('keydown', function escClose(e) {
            if (!document.body.contains(back)) {
                document.removeEventListener('keydown', escClose);
                return;
            }
            if (e.key === 'Escape') {
                close();
                document.removeEventListener('keydown', escClose);
            }
        });

        // Toolbar actions
        q('[data-act="sample-csv"]').onclick = () => {
            downloadSample(config);
            notify('Đã tải file CSV mẫu', 'success');
        };
        q('[data-act="sample-json"]').onclick = async () => {
            try {
                await navigator.clipboard.writeText(sampleJson(config));
                notify('Đã copy JSON mẫu vào clipboard', 'success');
            } catch {
                // Fallback: đổ vào ô dán để user tự copy.
                q('.w2imp-textarea').value = sampleJson(config);
                switchTab('paste');
                notify('Đã điền JSON mẫu vào ô dán', 'info');
            }
        };
        q('[data-act="toggle-spec"]').onclick = () => {
            const w = q('.w2imp-spec-wrap');
            w.hidden = !w.hidden;
        };

        // Tabs
        function switchTab(name) {
            back.querySelectorAll('.w2imp-tab').forEach((t) =>
                t.classList.toggle('is-active', t.dataset.tab === name)
            );
            back.querySelectorAll('.w2imp-pane').forEach((p) => {
                p.hidden = p.dataset.pane !== name;
            });
        }
        back.querySelectorAll('.w2imp-tab').forEach((t) => {
            t.onclick = () => switchTab(t.dataset.tab);
        });

        // Render preview từ text input
        function renderFromText(text) {
            const { records, error } = parseInput(text);
            if (error) {
                validRows = [];
                preview.innerHTML = `<div class="w2imp-msg w2imp-bad">${escapeHtml(error)}</div>`;
                commitBtn.disabled = true;
                footInfo.textContent = '';
                return;
            }
            const norm = normalizeRecords(records, config.columns);
            const { valid, invalid } = validateRows(norm, config.columns);
            validRows = valid;
            renderPreview(valid, invalid);
        }

        function renderPreview(valid, invalid) {
            const cols = config.columns;
            let html = `<div class="w2imp-stats">
                <span class="w2imp-ok"><strong>${valid.length}</strong> dòng hợp lệ</span>
                ${invalid.length ? `<span class="w2imp-bad-pill"><strong>${invalid.length}</strong> dòng lỗi (bỏ qua)</span>` : ''}
            </div>`;
            if (valid.length) {
                html += `<div class="w2imp-table-scroll"><table class="w2imp-prev"><thead><tr>${cols
                    .map((c) => `<th>${escapeHtml(c.label)}</th>`)
                    .join('')}</tr></thead><tbody>`;
                for (const r of valid.slice(0, PREVIEW_LIMIT)) {
                    html += `<tr>${cols
                        .map((c) => {
                            let v = r[c.key];
                            if (c.type === 'bool') v = v === true ? '✓' : v === false ? '✕' : '';
                            return `<td>${escapeHtml(v == null ? '' : v)}</td>`;
                        })
                        .join('')}</tr>`;
                }
                html += `</tbody></table></div>`;
                if (valid.length > PREVIEW_LIMIT)
                    html += `<p class="w2imp-more">… và ${valid.length - PREVIEW_LIMIT} dòng nữa</p>`;
            }
            if (invalid.length) {
                html += `<details class="w2imp-errors"><summary>${invalid.length} dòng lỗi</summary><table class="w2imp-errtbl"><thead><tr><th>Dòng</th><th>Lỗi</th></tr></thead><tbody>`;
                for (const e of invalid.slice(0, ERROR_LIMIT))
                    html += `<tr><td>${e.row}</td><td>${escapeHtml(e.errors.join('; '))}</td></tr>`;
                html += `</tbody></table>${invalid.length > ERROR_LIMIT ? `<p class="w2imp-more">… và ${invalid.length - ERROR_LIMIT} lỗi nữa</p>` : ''}</details>`;
            }
            if (!valid.length && !invalid.length)
                html = `<div class="w2imp-msg">Không đọc được dòng nào. Kiểm tra lại tên cột / định dạng.</div>`;
            preview.innerHTML = html;
            commitBtn.disabled = valid.length === 0;
            footInfo.textContent = valid.length
                ? `Sẵn sàng nhập ${valid.length} ${config.entityLabel || 'dòng'}`
                : '';
        }

        // File input
        const fileInput = q('.w2imp-pane[data-pane="file"] input[type=file]');
        const dropZone = q('.w2imp-drop');
        function handleFile(file) {
            if (!file) return;
            q('.w2imp-filename').hidden = false;
            q('.w2imp-filename').innerHTML = `<i data-lucide="file"></i> ${escapeHtml(file.name)}`;
            if (global.lucide) global.lucide.createIcons();
            const reader = new FileReader();
            reader.onload = (e) => renderFromText(String(e.target.result || ''));
            reader.onerror = () =>
                (preview.innerHTML = `<div class="w2imp-msg w2imp-bad">Không đọc được file</div>`);
            reader.readAsText(file, 'UTF-8');
        }
        fileInput.onchange = (e) => handleFile(e.target.files[0]);
        ['dragover', 'dragenter'].forEach((ev) =>
            dropZone.addEventListener(ev, (e) => {
                e.preventDefault();
                dropZone.classList.add('is-drag');
            })
        );
        ['dragleave', 'drop'].forEach((ev) =>
            dropZone.addEventListener(ev, (e) => {
                e.preventDefault();
                dropZone.classList.remove('is-drag');
            })
        );
        dropZone.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0]));

        // Paste parse
        q('[data-act="parse-paste"]').onclick = () => renderFromText(q('.w2imp-textarea').value);

        // Commit
        commitBtn.onclick = async () => {
            if (!validRows.length) return;
            commitBtn.disabled = true;
            const orig = commitBtn.innerHTML;
            commitBtn.textContent = 'Đang nhập…';
            const onProgress = ({ done, total }) => {
                commitBtn.textContent = `Đang nhập ${done}/${total}…`;
            };
            try {
                const result = (await config.onCommit(validRows, { onProgress })) || {};
                const ok = result.ok ?? 0;
                const fail = result.fail ?? 0;
                let summary = `<div class="w2imp-done"><i data-lucide="check-circle"></i> Hoàn tất: <strong>${ok}</strong> thành công${fail ? ` · <strong class="w2imp-bad">${fail}</strong> lỗi` : ''}.</div>`;
                if (fail && Array.isArray(result.errors) && result.errors.length) {
                    summary += `<details class="w2imp-errors"><summary>${result.errors.length} lỗi</summary><table class="w2imp-errtbl"><tbody>`;
                    for (const e of result.errors.slice(0, ERROR_LIMIT))
                        summary += `<tr><td>${escapeHtml(e.row != null ? e.row : '')}</td><td>${escapeHtml(e.error || '')}</td></tr>`;
                    summary += `</tbody></table></details>`;
                }
                preview.insertAdjacentHTML('afterbegin', summary);
                if (global.lucide) global.lucide.createIcons();
                notify(
                    `Nhập xong: ${ok} thành công${fail ? `, ${fail} lỗi` : ''}`,
                    fail ? 'warning' : 'success'
                );
                commitBtn.innerHTML = '<i data-lucide="check"></i> Đóng';
                commitBtn.disabled = false;
                commitBtn.onclick = close;
                if (global.lucide) global.lucide.createIcons();
                if (typeof config.onDone === 'function') config.onDone(result);
            } catch (err) {
                preview.insertAdjacentHTML(
                    'afterbegin',
                    `<div class="w2imp-msg w2imp-bad">Lỗi nhập: ${escapeHtml(err.message)}</div>`
                );
                notify('Lỗi nhập dữ liệu: ' + err.message, 'error');
                commitBtn.innerHTML = orig;
                commitBtn.disabled = false;
                if (global.lucide) global.lucide.createIcons();
            }
        };
    }

    global.Web2Import = Object.freeze({
        open,
        downloadSample,
        // exports phụ (test / reuse)
        _parseInput: parseInput,
        _normalizeRecords: normalizeRecords,
        _parseNumber: parseNumber,
    });
})(typeof window !== 'undefined' ? window : globalThis);
