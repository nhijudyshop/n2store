// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * PURCHASE ORDERS (WEB 1.0) — XUẤT DỮ LIỆU SANG SỔ ORDER (WEB 2.0)
 * File: js/lib/so-order-export.js
 *
 * Mục đích: đóng gói bảng đơn đặt hàng (tab đang xem) thành 1 MÃ mã hoá
 * (base64) hoặc file .txt / .json. User copy mã đó dán vào trang Sổ Order
 * (Web 2.0) → nút "Nhập" → tab "Dán dữ liệu" → là ra dữ liệu.
 *
 * ⚠ TÁCH LAYER (CLAUDE.md rule 4): file này thuộc WEB 1.0 và KHÔNG import
 * bất kỳ code nào của web2/. Cầu nối duy nhất giữa 2 layer là ĐỊNH DẠNG MÃ
 * (spec dưới đây) — không phải code dùng chung. Bên Web 2.0
 * (web2/shared/web2-import.js) tự giải mã theo cùng spec, độc lập hoàn toàn.
 *
 * ── ĐỊNH DẠNG MÃ (data contract, KHÔNG share code) ──────────────────────
 *   Token  = "N2IMPORT1:" + base64( UTF-8 JSON )
 *   JSON   = { "_n2":"import", "v":1, "kind":"so-order", "src":"purchase-orders",
 *              "exportedAt":"<ISO>", "rows":[ <SoOrderRow>, ... ] }
 *   SoOrderRow khớp ĐÚNG cột của Web2Import config trong so-order-import.js:
 *     { supplier, date, batch, productName, variant, qty,
 *       costPrice, sellPrice, note, costNote, status }
 *   Web2Import.parseInput đã tự xử lý dạng { rows:[...] } → chỉ cần giải base64.
 */

(function () {
    'use strict';

    const TOKEN_PREFIX = 'N2IMPORT1:';

    // PO status → nhãn trạng thái Sổ Order (Web2Import enum: Nháp / Đã nhận / Đã hủy).
    // normKey() bên Web2Import sẽ chuẩn hoá nhãn này về draft/received/cancelled.
    const STATUS_TO_SO = {
        DRAFT: 'Nháp',
        AWAITING_PURCHASE: 'Nháp',
        AWAITING_DELIVERY: 'Nháp',
        RECEIVED: 'Đã nhận',
        COMPLETED: 'Đã nhận',
        CANCELLED: 'Đã hủy',
        DELETED: 'Đã hủy',
    };

    // ── UTF-8 base64 (tự chứa, an toàn tiếng Việt, chunked tránh tràn stack) ──
    function b64EncodeUtf8(str) {
        const bytes = new TextEncoder().encode(str);
        let bin = '';
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
        }
        return btoa(bin);
    }

    // ── Helpers ──────────────────────────────────────────────────────────
    function toDateObj(v) {
        if (!v) return null;
        if (typeof v.toDate === 'function') {
            try {
                return v.toDate();
            } catch (_) {
                /* fallthrough */
            }
        }
        if (typeof v === 'object' && typeof v.seconds === 'number')
            return new Date(v.seconds * 1000);
        if (v instanceof Date) return v;
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d;
    }

    function ymd(v) {
        const d = toDateObj(v);
        if (!d) return '';
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function notify(msg, type) {
        if (window.notificationManager?.show) window.notificationManager.show(msg, type);
        else if (type === 'error') console.error('[SoOrderExport]', msg);
    }

    // ── Map đơn PO → các dòng theo schema Sổ Order ───────────────────────
    function mapOrdersToRows(orders) {
        const rows = [];
        let skipped = 0;
        for (const order of orders || []) {
            const supplier = order?.supplier?.name || '';
            const date = ymd(order?.createdAt);
            // Mỗi ĐƠN PO = 1 lô riêng trong Sổ Order → batch = mã đơn (tránh
            // gộp nhầm 2 đơn cùng NCC + ngày). Web2Import gom theo NCC||ngày||đợt.
            const batch = String(
                order?.orderNumber || (order?.id ? `PO-${String(order.id).slice(0, 6)}` : '')
            ).trim();
            const status = STATUS_TO_SO[order?.status] || 'Nháp';
            const orderNote = (order?.notes || '').trim();

            for (const item of order?.items || []) {
                const productName = (item?.productName || '').trim();
                if (!productName) {
                    skipped++;
                    continue; // productName là cột bắt buộc bên Web2Import
                }
                const variantRaw = (item?.variant || '').trim();
                const variant = variantRaw === '-' ? '' : variantRaw;
                const itemNote = (item?.notes || '').trim();
                rows.push({
                    supplier,
                    date,
                    batch,
                    productName,
                    variant,
                    qty: Number(item?.quantity) || 0,
                    costPrice: Number(item?.purchasePrice) || 0,
                    sellPrice: Number(item?.sellingPrice) || 0,
                    note: itemNote || orderNote,
                    costNote: '',
                    status,
                });
            }
        }
        return { rows, skipped };
    }

    function buildEnvelope(rows) {
        return {
            _n2: 'import',
            v: 1,
            kind: 'so-order',
            src: 'purchase-orders',
            exportedAt: new Date().toISOString(),
            count: rows.length,
            rows,
        };
    }

    function encodeToken(rows) {
        return TOKEN_PREFIX + b64EncodeUtf8(JSON.stringify(buildEnvelope(rows)));
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

    function fileStamp() {
        const d = new Date();
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
    }

    // ── Modal hiển thị mã + nút Copy / Tải file ──────────────────────────
    function open(orders) {
        const list = Array.isArray(orders) ? orders : [];
        if (!list.length) {
            notify('Không có đơn nào trong bảng để xuất', 'warning');
            return;
        }
        const { rows, skipped } = mapOrdersToRows(list);
        if (!rows.length) {
            notify('Không có dòng sản phẩm hợp lệ để xuất (thiếu tên SP)', 'warning');
            return;
        }
        const token = encodeToken(rows);
        const jsonPretty = JSON.stringify(buildEnvelope(rows), null, 2);

        const back = document.createElement('div');
        back.className = 'so-export-backdrop';
        back.style.cssText =
            'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px;';
        // Khung HTML KHÔNG chèn giá trị động (chống XSS) — token + số liệu set bằng
        // DOM (.value / .textContent) sau khi gắn vào DOM.
        back.innerHTML = `
            <div role="dialog" aria-modal="true" aria-label="Xuất sang Sổ Order"
                 style="background:#fff;border-radius:14px;width:min(680px,100%);max-height:90vh;overflow:auto;box-shadow:0 24px 60px rgba(0,0,0,.28);">
                <header style="display:flex;align-items:center;gap:10px;padding:16px 20px;border-bottom:1px solid #eef0f4;">
                    <span style="display:inline-flex;width:34px;height:34px;border-radius:9px;background:#eef2ff;color:#4f46e5;align-items:center;justify-content:center;">
                        <i data-lucide="share-2" style="width:18px;height:18px;"></i>
                    </span>
                    <div style="flex:1;min-width:0;">
                        <h3 style="margin:0;font-size:16px;font-weight:700;color:#0f172a;">Xuất sang Sổ Order (Web 2.0)</h3>
                        <p data-el="summary" style="margin:2px 0 0;font-size:12px;color:#64748b;"></p>
                    </div>
                    <button type="button" data-act="close" aria-label="Đóng"
                        style="background:none;border:none;font-size:22px;line-height:1;color:#94a3b8;cursor:pointer;">×</button>
                </header>

                <div style="padding:16px 20px;">
                    <ol style="margin:0 0 14px;padding-left:20px;font-size:13px;color:#475569;line-height:1.7;">
                        <li>Bấm <strong>Copy mã</strong> bên dưới (hoặc tải file <code>.txt</code> / <code>.json</code>).</li>
                        <li>Mở trang <strong>Sổ Order</strong> (Web 2.0) → bấm <strong>Nhập</strong>.</li>
                        <li>Tab <strong>Dán dữ liệu</strong> → dán mã → <strong>Xem trước</strong> → <strong>Nhập</strong>.
                            (Hoặc kéo file vừa tải vào ô <em>Tải lên file</em>.)</li>
                    </ol>

                    <label style="display:block;font-size:12px;font-weight:600;color:#334155;margin-bottom:6px;">Mã dữ liệu (base64)</label>
                    <textarea data-el="token" readonly rows="5" spellcheck="false"
                        style="width:100%;box-sizing:border-box;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:#0f172a;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px;resize:vertical;word-break:break-all;"></textarea>

                    <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:14px;">
                        <button type="button" data-act="dl-json"
                            style="padding:9px 16px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#334155;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;">
                            <i data-lucide="braces" style="width:15px;height:15px;"></i> Tải .json
                        </button>
                        <button type="button" data-act="dl-txt"
                            style="padding:9px 16px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#334155;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;">
                            <i data-lucide="file-down" style="width:15px;height:15px;"></i> Tải .txt
                        </button>
                        <button type="button" data-act="copy"
                            style="padding:9px 18px;border:none;border-radius:8px;background:#4f46e5;color:#fff;font-size:13px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px;">
                            <i data-lucide="copy" style="width:15px;height:15px;"></i> Copy mã
                        </button>
                    </div>
                </div>
            </div>`;

        document.body.appendChild(back);
        if (window.lucide) window.lucide.createIcons();

        const close = () => back.remove();
        const tokenEl = back.querySelector('[data-el="token"]');
        // Set giá trị động bằng DOM (textContent/value) — không qua innerHTML.
        tokenEl.value = token;
        const summaryEl = back.querySelector('[data-el="summary"]');
        summaryEl.textContent = `${list.length} đơn · ${rows.length} dòng sản phẩm`;
        if (skipped) {
            const skip = document.createElement('span');
            skip.style.color = '#b45309';
            skip.textContent = ` · bỏ qua ${skipped} dòng thiếu tên SP`;
            summaryEl.appendChild(skip);
        }
        back.querySelector('[data-act="close"]').onclick = close;
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

        back.querySelector('[data-act="copy"]').onclick = async () => {
            try {
                await navigator.clipboard.writeText(token);
                notify('Đã copy mã vào clipboard', 'success');
            } catch (_) {
                tokenEl.focus();
                tokenEl.select();
                const ok = document.execCommand && document.execCommand('copy');
                notify(
                    ok ? 'Đã copy mã' : 'Không copy được — hãy chọn & copy thủ công',
                    ok ? 'success' : 'warning'
                );
            }
        };
        back.querySelector('[data-act="dl-txt"]').onclick = () => {
            downloadText(`so-order-${fileStamp()}.txt`, token, 'text/plain');
            notify('Đã tải file mã (.txt)', 'success');
        };
        back.querySelector('[data-act="dl-json"]').onclick = () => {
            downloadText(`so-order-${fileStamp()}.json`, jsonPretty, 'application/json');
            notify('Đã tải file .json', 'success');
        };

        // Auto-select mã để Ctrl+C nhanh.
        setTimeout(() => {
            tokenEl.focus();
            tokenEl.select();
        }, 60);
    }

    window.SoOrderExport = Object.freeze({
        open,
        mapOrdersToRows,
        encodeToken,
        buildEnvelope,
        TOKEN_PREFIX,
    });

    console.log('[Purchase Orders] SoOrderExport loaded');
})();
