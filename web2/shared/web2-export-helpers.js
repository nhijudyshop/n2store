// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Export helpers — Excel (SheetJS), PDF barcode labels (jsPDF + JsBarcode).
 * Dùng cho F08 print/export hàng loạt + F02 aging + F07 NCC 360.
 *
 * Public API:
 *   Web2Export.toExcel(rows, { filename, sheetName, header })
 *   Web2Export.toPDFBarcodes(items, { layout: '8x1-A4', filename, valueKey, labelKeys })
 *   Web2Export.printHTML(html, { title })
 */
(function (global) {
    'use strict';
    if (global.Web2Export) return;

    const XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.20.3/dist/xlsx.full.min.js';
    const JSPDF_CDN = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
    const JSBARCODE_FALLBACK = '../shared/jsbarcode-code128.min.js';

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = () => reject(new Error('Không tải được ' + src));
            document.head.appendChild(s);
        });
    }

    async function ensureXLSX() {
        if (global.XLSX) return global.XLSX;
        await loadScript(XLSX_CDN);
        return global.XLSX;
    }

    async function ensureJsPDF() {
        if (global.jspdf?.jsPDF) return global.jspdf.jsPDF;
        await loadScript(JSPDF_CDN);
        return global.jspdf.jsPDF;
    }

    async function ensureJsBarcode() {
        if (global.JsBarcode) return global.JsBarcode;
        // Try CDN, fallback to local
        try {
            await loadScript(
                'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js'
            );
        } catch {
            await loadScript(JSBARCODE_FALLBACK);
        }
        return global.JsBarcode;
    }

    async function toExcel(rows, opts = {}) {
        const XLSX = await ensureXLSX();
        const filename = opts.filename || 'export.xlsx';
        const sheetName = opts.sheetName || 'Sheet1';
        const ws = XLSX.utils.json_to_sheet(rows, { header: opts.header });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        XLSX.writeFile(wb, filename);
    }

    function _buildBarcodeCanvas(JsBarcode, value, opts = {}) {
        const c = document.createElement('canvas');
        JsBarcode(c, String(value), {
            format: 'CODE128',
            width: 1.5,
            height: 36,
            fontSize: 11,
            displayValue: opts.displayValue !== false,
            margin: 4,
        });
        return c;
    }

    /**
     * PDF barcode labels — A4 grid 8 rows × 1 col (vertical strip),
     * mỗi label ~25×36mm. layout '8x1-A4' default; có thể mở rộng sau.
     */
    async function toPDFBarcodes(items, opts = {}) {
        const jsPDF = await ensureJsPDF();
        const JsBarcode = await ensureJsBarcode();
        const filename = opts.filename || 'barcodes.pdf';
        const valueKey = opts.valueKey || 'code';
        const labelKeys = opts.labelKeys || ['name'];
        const layout = opts.layout || '8x1-A4';

        const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
        const pageW = 210;
        const pageH = 297;
        let cols, rows, cellW, cellH;
        if (layout === '8x1-A4') {
            cols = 1;
            rows = 8;
            cellW = pageW - 20;
            cellH = (pageH - 20) / rows;
        } else if (layout === '4x6-A4') {
            cols = 4;
            rows = 6;
            cellW = (pageW - 20) / cols;
            cellH = (pageH - 20) / rows;
        } else {
            cols = 2;
            rows = 8;
            cellW = (pageW - 20) / cols;
            cellH = (pageH - 20) / rows;
        }
        const perPage = cols * rows;
        items.forEach((it, idx) => {
            const pIdx = Math.floor(idx / perPage);
            if (idx > 0 && idx % perPage === 0) pdf.addPage();
            const localIdx = idx % perPage;
            const r = Math.floor(localIdx / cols);
            const c = localIdx % cols;
            const x = 10 + c * cellW;
            const y = 10 + r * cellH;
            const code = it[valueKey] || '';
            if (!code) return;
            try {
                const canvas = _buildBarcodeCanvas(JsBarcode, code);
                const imgData = canvas.toDataURL('image/png');
                pdf.addImage(imgData, 'PNG', x + 2, y + 2, cellW - 4, cellH * 0.55);
                pdf.setFontSize(9);
                const labels = labelKeys
                    .map((k) => it[k])
                    .filter(Boolean)
                    .join(' · ');
                if (labels) {
                    pdf.text(String(labels).slice(0, 60), x + 2, y + cellH - 4);
                }
            } catch (_) {
                /* skip bad code */
            }
        });
        pdf.save(filename);
    }

    function printHTML(html, opts = {}) {
        const w = window.open('', '_blank', 'width=900,height=900');
        if (!w) {
            window.Popup.error('Browser chặn popup — bật popup cho domain rồi thử lại.');
            return;
        }
        w.document.write(`<!DOCTYPE html><html><head><title>${opts.title || 'Print'}</title>
            <style>
                body { font-family: Segoe UI, Arial, sans-serif; padding: 20px; color: #1c1f25; }
                table { border-collapse: collapse; width: 100%; font-size: 12px; }
                th, td { border: 1px solid #d1d5db; padding: 5px 8px; text-align: left; }
                th { background: #f0eeee; }
                @media print { @page { margin: 12mm; } }
            </style></head><body>${html}</body></html>`);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 200);
    }

    global.Web2Export = Object.freeze({ toExcel, toPDFBarcodes, printHTML });
})(typeof window !== 'undefined' ? window : globalThis);
