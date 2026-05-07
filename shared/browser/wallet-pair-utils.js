// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// shared/browser/wallet-pair-utils.js
//
// Helper port từ render.com/routes/v2/wallets.js (logic skipIdx + walletNoteLines)
// để frontend có thể tự pair cặp tạo-hủy đơn và compute note "Nợ Cũ / ĐÃ NHẬN" mà
// KHÔNG phụ thuộc backend (xử lý cả ADJUSTMENT type — backend hiện chỉ xử lý DEPOSIT).
//
// Cặp được pair khi:
//   - DEPOSIT có source = 'ORDER_CANCEL_REFUND'
//   - WITHDRAW phía trước cùng order_ref (lấy từ reference_id, fallback parse note)
//   - amount tuyệt đối khớp nhau
// Cả 2 entries trong cặp đều bị skip khỏi UI/note.

const ORDER_REF_REGEX = /(NJD\/\d{4}\/\d+)/i;

/**
 * Parse order ref ("NJD/YYYY/XXXXX") từ tx — ưu tiên reference_id, fallback parse note.
 * @param {Object} tx
 * @returns {string|null}
 */
export function parseOrderRefFromTx(tx) {
    const refId = tx.reference_id || '';
    const directMatch = refId.match(ORDER_REF_REGEX);
    if (directMatch) return directMatch[1];
    const note = tx.note || '';
    const noteMatch = note.match(ORDER_REF_REGEX);
    return noteMatch ? noteMatch[1] : null;
}

/**
 * Tính skipIdx: set các index tx cần ẩn (cặp WITHDRAW + REFUND triệt tiêu).
 * Refund không match WITHDRAW gốc cũng skip (theo convention backend — REFUND
 * không bao giờ in dòng riêng).
 *
 * @param {Array<Object>} txs - sorted by created_at ASC (cũ nhất trước)
 * @returns {Set<number>}
 */
export function computeSkipPairIdx(txs) {
    const skipIdx = new Set();
    if (!Array.isArray(txs)) return skipIdx;

    for (let i = 0; i < txs.length; i++) {
        const tx = txs[i];
        if (!tx || tx.type !== 'DEPOSIT' || tx.source !== 'ORDER_CANCEL_REFUND') continue;

        const refundAmt = Math.abs(parseFloat(tx.amount) || 0);
        const refundRef = parseOrderRefFromTx(tx);
        if (!refundRef) {
            skipIdx.add(i);
            continue;
        }

        let matched = false;
        for (let j = i - 1; j >= 0; j--) {
            if (skipIdx.has(j)) continue;
            const prev = txs[j];
            if (!prev || prev.type !== 'WITHDRAW') continue;
            const prevRef = parseOrderRefFromTx(prev);
            if (prevRef !== refundRef) continue;
            if (Math.abs(parseFloat(prev.amount) || 0) !== refundAmt) continue;
            skipIdx.add(i);
            skipIdx.add(j);
            matched = true;
            break;
        }
        if (!matched) skipIdx.add(i);
    }

    return skipIdx;
}

/**
 * Filter danh sách tx, bỏ các cặp tạo-hủy bù trừ.
 * @param {Array<Object>} txs - sorted ASC
 * @returns {Array<Object>}
 */
export function skipPairedCancelRefunds(txs) {
    const skip = computeSkipPairIdx(txs);
    if (skip.size === 0) return Array.isArray(txs) ? txs.slice() : [];
    return txs.filter((_, i) => !skip.has(i));
}

const fmtK = (v) => {
    const n = Math.abs(parseFloat(v) || 0);
    return `${Math.round(n / 1000)}K`;
};

const fmtDDMM = (d) => {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
};

const stripTicketSuffix = (n) =>
    n ? String(n).replace(/\s*\(ticket\s+[A-Z]+-\d{4}-\d+\)\s*$/i, '').trim() : '';

const stripImgTag = (n) =>
    n ? String(n).replace(/\n?\[Ảnh GD:[^\]]+\]/g, '').trim() : '';

const extractInternalNote = (note) => {
    if (!note) return '';
    const migrated = String(note).match(/^Công Nợ Ảo Từ\s+[^()]+\(.*?\)\s*-\s*(.+)$/);
    if (migrated) return migrated[1].trim();
    return stripTicketSuffix(note).trim();
};

/**
 * Compute walletNoteLines theo cùng convention với backend
 * (render.com/routes/v2/wallets.js:471-528) NHƯNG cover thêm ADJUSTMENT (positive)
 * mà backend đang miss.
 *
 * Output: array of strings, mỗi string là một dòng note.
 *   - "Nợ Cũ XK" (nếu legacy > 500)
 *   - "ĐÃ NHẬN XK ACB dd/mm" (DEPOSIT generic)
 *   - "Khách Gửi XK (note)" (DEPOSIT từ RETURN_GOODS)
 *   - "Nhận điều chỉnh từ SĐT YYY (XK) - lý do" (ADJUSTMENT MANUAL từ SĐT khác)
 *   - "Đã Nhận XK (note)" (ADJUSTMENT generic positive)
 *
 * @param {Array<Object>} txs - raw transactions sorted ASC
 * @param {number} balance - wallet.balance hiện tại (real_balance)
 * @returns {string[]}
 */
export function computeWalletNoteLines(txs, balance) {
    if (!Array.isArray(txs) || txs.length === 0) return [];
    const skipIdx = computeSkipPairIdx(txs);

    let lastWithdrawIdx = -1;
    for (let i = txs.length - 1; i >= 0; i--) {
        if (skipIdx.has(i)) continue;
        if (txs[i] && txs[i].type === 'WITHDRAW') {
            lastWithdrawIdx = i;
            break;
        }
    }

    const lines = [];
    let depositsAfterSum = 0;

    for (let i = lastWithdrawIdx + 1; i < txs.length; i++) {
        if (skipIdx.has(i)) continue;
        const tx = txs[i];
        if (!tx) continue;
        const amt = Math.abs(parseFloat(tx.amount) || 0);
        if (amt <= 0) continue;
        const amtStr = amt >= 1000 ? `${Math.round(amt / 1000)}K` : `${amt}đ`;

        if (tx.type === 'DEPOSIT') {
            depositsAfterSum += amt;
            if (tx.source === 'RETURN_GOODS' && tx.note) {
                const cleanNote = extractInternalNote(tx.note);
                lines.push(cleanNote ? `Khách Gửi ${amtStr} (${cleanNote})` : `Khách Gửi ${amtStr}`);
            } else if (tx.source === 'MANUAL_ADJUSTMENT' && tx.note) {
                const cleanNote = stripImgTag(tx.note);
                lines.push(cleanNote || `ĐÃ NHẬN ${fmtK(amt)} ACB ${fmtDDMM(tx.created_at)}`);
            } else {
                lines.push(`ĐÃ NHẬN ${fmtK(amt)} ACB ${fmtDDMM(tx.created_at)}`);
            }
        } else if (tx.type === 'ADJUSTMENT') {
            // Backend miss case này. ADJUSTMENT có amount âm/dương, chỉ tính positive (+ vào ví).
            const signedAmt = parseFloat(tx.amount) || 0;
            if (signedAmt <= 0) continue;
            depositsAfterSum += amt;
            const cp = tx.counterparty_phone || tx.wrong_customer_phone;
            const reason = (tx.adjustment_reason || stripImgTag(tx.note) || '').trim();
            const head = cp
                ? `Nhận điều chỉnh từ SĐT ${cp} (${amtStr})`
                : `Đã Nhận ${amtStr}`;
            lines.push(reason ? `${head} - ${reason}` : head);
        }
    }

    // Invariant: balance = "Nợ Cũ" + Σ(deposits sau lastWithdraw)
    const balanceNum = parseFloat(balance) || 0;
    const legacy = balanceNum - depositsAfterSum;
    const out = [];
    if (legacy > 500) {
        out.push(`Nợ Cũ ${Math.round(legacy / 1000)}K`);
    }
    out.push(...lines);
    return out;
}
