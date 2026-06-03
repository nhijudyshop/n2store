// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — read-only audit prelink_credit risk.
/**
 * Audit prelink_credit risk — web2_balance_history
 * =================================================
 * Bối cảnh: GD clone từ Web 1.0 mang sẵn `linked_customer_phone`. Matcher Web 2.0
 * gặp phone sẵn có → nhánh `prelink_credit` cộng ví thẳng, KHÔNG re-validate
 * content. Nếu Web 1.0 gán nhầm (vd tên trùng nhiều KH như "Trang Đài"), Web 2.0
 * kế thừa sai + đã cộng ví. Script này soi lại toàn bộ prelink_credit, đối chiếu
 * content với phone đã gán để xếp hạng rủi ro.
 *
 * READ-ONLY: chỉ SELECT, KHÔNG ghi prod. An toàn chạy bất cứ lúc nào.
 *
 * Phân loại mỗi GD:
 *   CORROBORATED_QR    — content có QR (bằng chứng mạnh)        → an tâm
 *   CORROBORATED_PHONE — content có SĐT đủ == phone đã gán       → an tâm
 *   CONFLICT           — content có SĐT đủ KHÁC phone đã gán      → ⚠ rủi ro CAO
 *   PARTIAL            — content chỉ có đuôi số (5-9 digit)       → rà soát
 *   NO_EVIDENCE        — content KHÔNG có SĐT/QR nào              → link thuần kế thừa Web 1.0
 *
 * Tín hiệu "tên mơ hồ": gom NO_EVIDENCE/PARTIAL/CONFLICT theo TÊN chuẩn hoá.
 * Nếu 1 tên ánh xạ tới >1 SĐT khác nhau → tên đó bị gán cho nhiều ví khác nhau
 * mà không có bằng chứng content → ưu tiên review (đúng kiểu "nhiều Trang Đài").
 *
 * Usage:
 *   export DATABASE_URL="postgresql://.../n2store_chat"   # lấy từ serect_dont_push.txt
 *   node render.com/scripts/audit-prelink-credit-risk.js [--limit N] [--json]
 *
 * KHÔNG hardcode credential — bắt buộc truyền qua env DATABASE_URL.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const parser = require('../services/web2-content-parser');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('❌ Thiếu env DATABASE_URL. Source từ serect_dont_push.txt rồi chạy lại.');
    console.error('   Ví dụ: export DATABASE_URL="postgresql://.../n2store_chat"');
    process.exit(1);
}

const args = process.argv.slice(2);
const LIMIT = (() => {
    const i = args.indexOf('--limit');
    return i >= 0 && args[i + 1] ? parseInt(args[i + 1], 10) : 0; // 0 = no limit
})();
const AS_JSON = args.includes('--json');

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

// ---- classify one row ----
function classify(content, linkedPhone) {
    const candidates = parser.extractPhoneCandidates(content || '');
    const qr = candidates.find((c) => c.type === 'qr_code');
    const exacts = candidates.filter((c) => c.type === 'exact_phone').map((c) => c.value);
    const partials = candidates.filter((c) => c.type === 'partial_phone').map((c) => c.value);

    if (qr) return { tier: 'CORROBORATED_QR', detail: qr.value };
    if (exacts.length) {
        if (linkedPhone && exacts.includes(linkedPhone)) {
            return { tier: 'CORROBORATED_PHONE', detail: linkedPhone };
        }
        return {
            tier: 'CONFLICT',
            detail: `content=${exacts.join(',')} ≠ gán=${linkedPhone || '∅'}`,
        };
    }
    if (partials.length) return { tier: 'PARTIAL', detail: partials.join(',') };
    return { tier: 'NO_EVIDENCE', detail: '' };
}

async function main() {
    const client = await pool.connect();
    try {
        const limitSql = LIMIT > 0 ? `LIMIT ${LIMIT}` : '';
        const { rows } = await client.query(
            `SELECT id, sepay_id, content, transfer_amount,
                    linked_customer_phone, display_name, transaction_date
             FROM web2_balance_history
             WHERE match_method = 'prelink_credit'
             ORDER BY transaction_date DESC NULLS LAST ${limitSql}`
        );

        const tierCount = {};
        const flagged = []; // CONFLICT / NO_EVIDENCE / PARTIAL
        const nameMap = new Map(); // normName -> Set(phone)

        for (const r of rows) {
            const { tier, detail } = classify(r.content, r.linked_customer_phone);
            tierCount[tier] = (tierCount[tier] || 0) + 1;

            if (tier === 'CONFLICT' || tier === 'NO_EVIDENCE' || tier === 'PARTIAL') {
                const nameSeg = parser.extractNameSegments(r.content || '');
                const normName = parser.normalize(nameSeg);
                if (normName) {
                    if (!nameMap.has(normName)) nameMap.set(normName, new Set());
                    if (r.linked_customer_phone) nameMap.get(normName).add(r.linked_customer_phone);
                }
                flagged.push({
                    id: r.id,
                    sepay_id: r.sepay_id,
                    tier,
                    detail,
                    phone: r.linked_customer_phone,
                    name: r.display_name || nameSeg,
                    amount: Number(r.transfer_amount) || 0,
                    date: r.transaction_date,
                    content: (r.content || '').slice(0, 90),
                });
            }
        }

        // Ambiguous names: 1 tên → nhiều phone khác nhau (no content evidence)
        const ambiguous = [...nameMap.entries()]
            .filter(([, set]) => set.size > 1)
            .map(([name, set]) => ({ name, phones: [...set], phoneCount: set.size }))
            .sort((a, b) => b.phoneCount - a.phoneCount);

        const summary = {
            totalPrelink: rows.length,
            tierBreakdown: tierCount,
            flaggedCount: flagged.length,
            ambiguousNameCount: ambiguous.length,
        };

        if (AS_JSON) {
            console.log(JSON.stringify({ summary, ambiguous, flagged }, null, 2));
        } else {
            printReport(summary, ambiguous, flagged);
        }
        writeMarkdown(summary, ambiguous, flagged);
    } finally {
        client.release();
        await pool.end();
    }
}

function fmtAmt(n) {
    return n.toLocaleString('vi-VN') + 'đ';
}

function printReport(summary, ambiguous, flagged) {
    console.log('\n📊 AUDIT prelink_credit — web2_balance_history');
    console.log('─'.repeat(70));
    console.log(`Tổng prelink_credit : ${summary.totalPrelink}`);
    for (const [tier, n] of Object.entries(summary.tierBreakdown)) {
        console.log(`  ${tier.padEnd(20)} ${n}`);
    }
    console.log(
        `\n⚠ Cần review        : ${summary.flaggedCount} GD (CONFLICT/NO_EVIDENCE/PARTIAL)`
    );
    console.log(`⚠ Tên gán ≥2 SĐT    : ${summary.ambiguousNameCount} tên\n`);

    if (ambiguous.length) {
        console.log('TÊN MƠ HỒ (1 tên → nhiều ví, không bằng chứng content):');
        console.log('─'.repeat(70));
        for (const a of ambiguous.slice(0, 30)) {
            console.log(`  "${a.name}" → ${a.phoneCount} SĐT: ${a.phones.join(', ')}`);
        }
        console.log('');
    }

    const conflicts = flagged.filter((f) => f.tier === 'CONFLICT');
    if (conflicts.length) {
        console.log('🔴 CONFLICT (content có SĐT khác phone đã gán):');
        console.log('─'.repeat(70));
        for (const f of conflicts.slice(0, 40)) {
            console.log(`  sepay=${f.sepay_id} | ${fmtAmt(f.amount)} | ${f.detail}`);
            console.log(`     ${f.content}`);
        }
        console.log('');
    }
}

function writeMarkdown(summary, ambiguous, flagged) {
    const outDir = path.join(__dirname, '../../downloads/n2store-session');
    try {
        fs.mkdirSync(outDir, { recursive: true });
    } catch {}
    const out = path.join(outDir, 'prelink-credit-risk-report.md');
    const lines = [];
    lines.push('# Audit prelink_credit risk — web2_balance_history');
    lines.push('');
    lines.push(
        '> READ-ONLY audit. GD `prelink_credit` = phone gán sẵn từ clone Web 1.0, matcher Web 2.0 KHÔNG re-validate content.'
    );
    lines.push('');
    lines.push('## Tổng quan');
    lines.push('');
    lines.push(`- Tổng \`prelink_credit\`: **${summary.totalPrelink}**`);
    lines.push(`- Cần review (CONFLICT/NO_EVIDENCE/PARTIAL): **${summary.flaggedCount}**`);
    lines.push(`- Tên gán ≥2 SĐT khác nhau (mơ hồ): **${summary.ambiguousNameCount}**`);
    lines.push('');
    lines.push('| Tier | Số GD | Ý nghĩa |');
    lines.push('|---|---|---|');
    const meaning = {
        CORROBORATED_QR: 'Content có QR — an tâm',
        CORROBORATED_PHONE: 'Content có SĐT đủ trùng phone gán — an tâm',
        CONFLICT: '⚠ Content có SĐT đủ KHÁC phone gán — rủi ro CAO',
        PARTIAL: 'Chỉ có đuôi số — rà soát',
        NO_EVIDENCE: 'Không SĐT/QR — link thuần kế thừa Web 1.0',
    };
    for (const [tier, n] of Object.entries(summary.tierBreakdown)) {
        lines.push(`| ${tier} | ${n} | ${meaning[tier] || ''} |`);
    }
    lines.push('');

    if (ambiguous.length) {
        lines.push('## ⚠ Tên mơ hồ — 1 tên gán cho nhiều ví (ưu tiên review)');
        lines.push('');
        lines.push('| Tên (chuẩn hoá) | Số SĐT | Các SĐT |');
        lines.push('|---|---|---|');
        for (const a of ambiguous) {
            lines.push(`| ${a.name} | ${a.phoneCount} | ${a.phones.join(', ')} |`);
        }
        lines.push('');
    }

    const conflicts = flagged.filter((f) => f.tier === 'CONFLICT');
    if (conflicts.length) {
        lines.push('## 🔴 CONFLICT — content nói SĐT khác phone đã gán');
        lines.push('');
        lines.push('| sepay_id | Số tiền | Chi tiết | Content |');
        lines.push('|---|---|---|---|');
        for (const f of conflicts) {
            lines.push(
                `| ${f.sepay_id} | ${fmtAmt(f.amount)} | ${f.detail} | ${f.content.replace(/\|/g, '\\|')} |`
            );
        }
        lines.push('');
    }

    lines.push('## NO_EVIDENCE / PARTIAL (đầy đủ)');
    lines.push('');
    lines.push('| sepay_id | tier | SĐT gán | Tên | Số tiền | Content |');
    lines.push('|---|---|---|---|---|---|');
    for (const f of flagged.filter((x) => x.tier !== 'CONFLICT')) {
        lines.push(
            `| ${f.sepay_id} | ${f.tier} | ${f.phone || '∅'} | ${(f.name || '').replace(/\|/g, '\\|')} | ${fmtAmt(f.amount)} | ${f.content.replace(/\|/g, '\\|')} |`
        );
    }
    lines.push('');
    fs.writeFileSync(out, lines.join('\n'));
    console.log(`📄 Report: ${out}`);
}

main().catch((e) => {
    console.error('❌ Lỗi:', e.message);
    process.exit(1);
});
