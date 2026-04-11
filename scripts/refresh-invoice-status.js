#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Refresh all invoice_status entries from TPOS API
 * Fetches fresh data using contains(Number, 'NJD/2026/XXXXX') for each unique Number
 * Updates database with latest ShowState, StateCode, Reference, etc.
 *
 * Usage: node scripts/refresh-invoice-status.js [--dry-run]
 */

const { Pool } = require('pg');

const DB_URL = 'postgresql://n2store_user:iKxWmQEh1PcUSRRJXrlMueaGci1Id6Z0@dpg-d4kr80npm1nc738em3j0-a.singapore-postgres.render.com/n2store_chat';
const TPOS_PROXY = 'https://chatomni-proxy.nhijudyshop.workers.dev';
const BATCH_SIZE = 10; // concurrent TPOS requests
const DELAY_BETWEEN_BATCHES = 500; // ms

const DRY_RUN = process.argv.includes('--dry-run');

async function getToken() {
    const resp = await fetch(`${TPOS_PROXY}/api/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: 1 })
    });
    const data = await resp.json();
    if (!data.access_token) throw new Error('Failed to get token');
    return data.access_token;
}

async function fetchInvoiceByNumber(number, token) {
    const filter = encodeURIComponent(`(Type eq 'invoice' and contains(Number,'${number}'))`);
    const url = `${TPOS_PROXY}/api/odata/FastSaleOrder/ODataService.GetView?$top=1&$orderby=DateInvoice desc&$filter=${filter}&$count=true`;
    const resp = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
        }
    });
    if (!resp.ok) {
        console.warn(`  ⚠ HTTP ${resp.status} for ${number}`);
        return null;
    }
    const data = await resp.json();
    const list = data.value || [];
    return list[0] || null;
}

async function main() {
    console.log(`=== Refresh Invoice Status from TPOS ===`);
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no DB writes)' : 'LIVE'}`);
    console.log();

    // 1. Get TPOS token
    console.log('Getting TPOS token...');
    const token = await getToken();
    console.log('✅ Token obtained');

    // 2. Connect to DB
    const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

    // 3. Get all unique Numbers + their compound_keys
    console.log('Loading entries from DB...');
    const { rows } = await pool.query(`
        SELECT DISTINCT ON (number)
            compound_key, number, sale_online_id, show_state, state_code, reference
        FROM invoice_status
        WHERE number IS NOT NULL AND number != ''
        ORDER BY number, entry_timestamp DESC
    `);
    console.log(`Found ${rows.length} unique invoice numbers to refresh`);
    console.log();

    // 4. Process in batches
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    let unchanged = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

        process.stdout.write(`\rBatch ${batchNum}/${totalBatches} (${i}/${rows.length})...`);

        const results = await Promise.all(
            batch.map(async (row) => {
                try {
                    const inv = await fetchInvoiceByNumber(row.number, token);
                    if (!inv) return { row, status: 'not_found' };

                    // Compare: anything changed?
                    const changed = (
                        inv.ShowState !== row.show_state ||
                        inv.StateCode !== row.state_code ||
                        (inv.Reference || '') !== (row.reference || '')
                    );

                    if (!changed) return { row, status: 'unchanged' };

                    return { row, inv, status: 'changed' };
                } catch (e) {
                    return { row, status: 'error', error: e.message };
                }
            })
        );

        // Process results
        for (const result of results) {
            if (result.status === 'unchanged') {
                unchanged++;
                continue;
            }
            if (result.status === 'not_found') {
                skipped++;
                continue;
            }
            if (result.status === 'error') {
                failed++;
                console.log(`\n  ❌ ${result.row.number}: ${result.error}`);
                continue;
            }

            // Update all entries with this Number
            const { row, inv } = result;
            if (!DRY_RUN) {
                await pool.query(`
                    UPDATE invoice_status SET
                        show_state = $1,
                        state_code = $2,
                        reference = $3,
                        state = $4,
                        is_merge_cancel = $5,
                        amount_total = $6,
                        amount_untaxed = $7,
                        delivery_price = $8,
                        cash_on_delivery = $9,
                        payment_amount = $10,
                        carrier_name = $11,
                        tracking_ref = $12,
                        partner_display_name = $13,
                        delivery_note = $14,
                        date_invoice = $15,
                        updated_at = NOW()
                    WHERE number = $16
                `, [
                    inv.ShowState || '',
                    inv.StateCode || 'None',
                    inv.Reference || '',
                    inv.State || '',
                    inv.IsMergeCancel === true,
                    inv.AmountTotal || 0,
                    inv.AmountUntaxed || 0,
                    inv.DeliveryPrice || 0,
                    inv.CashOnDelivery || 0,
                    inv.PaymentAmount || 0,
                    inv.CarrierName || '',
                    inv.TrackingRef || '',
                    inv.PartnerDisplayName || '',
                    inv.DeliveryNote || '',
                    inv.DateInvoice || null,
                    row.number
                ]);
            }
            updated++;
            if (updated <= 5 || updated % 100 === 0) {
                console.log(`\n  ✅ ${row.number}: ${row.show_state}→${inv.ShowState} | ${row.state_code}→${inv.StateCode} | ref:${inv.Reference}`);
            }
        }

        // Delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < rows.length) {
            await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES));
        }
    }

    console.log(`\n\n=== DONE ===`);
    console.log(`Updated:   ${updated}`);
    console.log(`Unchanged: ${unchanged}`);
    console.log(`Not found: ${skipped}`);
    console.log(`Failed:    ${failed}`);
    console.log(`Total:     ${rows.length}`);

    await pool.end();
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
