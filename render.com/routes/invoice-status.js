// =====================================================
// INVOICE STATUS REST API
// Replaces Firestore: invoice_status_v2, invoice_status_delete_v2
// =====================================================

const express = require('express');
const router = express.Router();

// =====================================================
// INVOICE STATUS - CRUD
// =====================================================

/**
 * GET /api/invoice-status/load
 * Load all invoice entries (replaces _loadFromFirestore)
 */
router.get('/load', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const [entriesResult, sentBillsResult] = await Promise.all([
            pool.query('SELECT * FROM invoice_status ORDER BY entry_timestamp DESC'),
            pool.query('SELECT sale_online_id FROM invoice_sent_bills')
        ]);

        res.json({
            success: true,
            entries: entriesResult.rows,
            sentBills: sentBillsResult.rows.map(r => r.sale_online_id)
        });
    } catch (error) {
        console.error('[INVOICE-STATUS] GET /load error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/invoice-status/entries
 * Upsert single invoice entry (replaces set() + _saveToFirestore)
 */
router.post('/entries', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const { compoundKey, username, saleOnlineId, data } = req.body;
        if (!compoundKey || !saleOnlineId) {
            return res.status(400).json({ error: 'compoundKey and saleOnlineId required' });
        }

        await pool.query(`
            INSERT INTO invoice_status (
                compound_key, username, sale_online_id, tpos_id, number, reference,
                state, show_state, state_code, is_merge_cancel,
                partner_id, partner_display_name,
                amount_total, amount_untaxed, delivery_price, cash_on_delivery,
                payment_amount, discount, debt_used, tracking_ref, carrier_name,
                user_name, session_index, order_lines,
                receiver_name, receiver_phone, receiver_address,
                comment, delivery_note, error,
                date_invoice, date_created, live_campaign_id, entry_timestamp
            ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10,
                $11, $12,
                $13, $14, $15, $16,
                $17, $18, $19, $20, $21,
                $22, $23, $24,
                $25, $26, $27,
                $28, $29, $30,
                $31, $32, $33, $34
            )
            ON CONFLICT (compound_key) DO UPDATE SET
                tpos_id = EXCLUDED.tpos_id,
                number = EXCLUDED.number,
                reference = EXCLUDED.reference,
                state = EXCLUDED.state,
                show_state = EXCLUDED.show_state,
                state_code = EXCLUDED.state_code,
                is_merge_cancel = EXCLUDED.is_merge_cancel,
                partner_id = EXCLUDED.partner_id,
                partner_display_name = EXCLUDED.partner_display_name,
                amount_total = EXCLUDED.amount_total,
                amount_untaxed = EXCLUDED.amount_untaxed,
                delivery_price = EXCLUDED.delivery_price,
                cash_on_delivery = EXCLUDED.cash_on_delivery,
                payment_amount = EXCLUDED.payment_amount,
                discount = EXCLUDED.discount,
                debt_used = EXCLUDED.debt_used,
                tracking_ref = EXCLUDED.tracking_ref,
                carrier_name = EXCLUDED.carrier_name,
                user_name = EXCLUDED.user_name,
                session_index = EXCLUDED.session_index,
                order_lines = EXCLUDED.order_lines,
                receiver_name = EXCLUDED.receiver_name,
                receiver_phone = EXCLUDED.receiver_phone,
                receiver_address = EXCLUDED.receiver_address,
                comment = EXCLUDED.comment,
                delivery_note = EXCLUDED.delivery_note,
                error = EXCLUDED.error,
                date_invoice = EXCLUDED.date_invoice,
                date_created = EXCLUDED.date_created,
                live_campaign_id = EXCLUDED.live_campaign_id,
                entry_timestamp = EXCLUDED.entry_timestamp,
                updated_at = CURRENT_TIMESTAMP
        `, [
            compoundKey, username || 'default', saleOnlineId,
            data.Id || null, data.Number || null, data.Reference || null,
            data.State || null, data.ShowState || null, data.StateCode || null,
            data.IsMergeCancel || false,
            data.PartnerId || null, data.PartnerDisplayName || null,
            data.AmountTotal || 0, data.AmountUntaxed || 0,
            data.DeliveryPrice || 0, data.CashOnDelivery || 0,
            data.PaymentAmount || 0, data.Discount || 0, data.DebtUsed || 0,
            data.TrackingRef || null, data.CarrierName || null,
            data.UserName || null, data.SessionIndex || null,
            JSON.stringify(data.OrderLines || []),
            data.ReceiverName || null, data.ReceiverPhone || null,
            data.ReceiverAddress || null,
            data.Comment || null, data.DeliveryNote || null, data.Error || null,
            data.DateInvoice || null, data.DateCreated || null,
            data.LiveCampaignId || null, data.timestamp || Date.now()
        ]);

        res.json({ success: true, compoundKey });
    } catch (error) {
        console.error('[INVOICE-STATUS] POST /entries error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/invoice-status/entries/batch
 * Upsert multiple entries (replaces storeFromApiResult + _saveToFirestoreImmediate)
 */
router.post('/entries/batch', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const { username, entries } = req.body;
        if (!entries || !Array.isArray(entries) || entries.length === 0) {
            return res.status(400).json({ error: 'entries array required' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            for (const entry of entries) {
                const { compoundKey, saleOnlineId, data } = entry;
                if (!compoundKey || !saleOnlineId) continue;

                await client.query(`
                    INSERT INTO invoice_status (
                        compound_key, username, sale_online_id, tpos_id, number, reference,
                        state, show_state, state_code, is_merge_cancel,
                        partner_id, partner_display_name,
                        amount_total, amount_untaxed, delivery_price, cash_on_delivery,
                        payment_amount, discount, debt_used, tracking_ref, carrier_name,
                        user_name, session_index, order_lines,
                        receiver_name, receiver_phone, receiver_address,
                        comment, delivery_note, error,
                        date_invoice, date_created, live_campaign_id, entry_timestamp
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6,
                        $7, $8, $9, $10,
                        $11, $12,
                        $13, $14, $15, $16,
                        $17, $18, $19, $20, $21,
                        $22, $23, $24,
                        $25, $26, $27,
                        $28, $29, $30,
                        $31, $32, $33, $34
                    )
                    ON CONFLICT (compound_key) DO UPDATE SET
                        tpos_id = EXCLUDED.tpos_id, number = EXCLUDED.number,
                        reference = EXCLUDED.reference, state = EXCLUDED.state,
                        show_state = EXCLUDED.show_state, state_code = EXCLUDED.state_code,
                        is_merge_cancel = EXCLUDED.is_merge_cancel,
                        partner_id = EXCLUDED.partner_id,
                        partner_display_name = EXCLUDED.partner_display_name,
                        amount_total = EXCLUDED.amount_total, amount_untaxed = EXCLUDED.amount_untaxed,
                        delivery_price = EXCLUDED.delivery_price, cash_on_delivery = EXCLUDED.cash_on_delivery,
                        payment_amount = EXCLUDED.payment_amount, discount = EXCLUDED.discount,
                        debt_used = EXCLUDED.debt_used,
                        tracking_ref = EXCLUDED.tracking_ref, carrier_name = EXCLUDED.carrier_name,
                        user_name = EXCLUDED.user_name, session_index = EXCLUDED.session_index,
                        order_lines = EXCLUDED.order_lines,
                        receiver_name = EXCLUDED.receiver_name, receiver_phone = EXCLUDED.receiver_phone,
                        receiver_address = EXCLUDED.receiver_address,
                        comment = EXCLUDED.comment, delivery_note = EXCLUDED.delivery_note,
                        error = EXCLUDED.error,
                        date_invoice = EXCLUDED.date_invoice, date_created = EXCLUDED.date_created,
                        live_campaign_id = EXCLUDED.live_campaign_id,
                        entry_timestamp = EXCLUDED.entry_timestamp,
                        updated_at = CURRENT_TIMESTAMP
                `, [
                    compoundKey, username || 'default', saleOnlineId,
                    data.Id || null, data.Number || null, data.Reference || null,
                    data.State || null, data.ShowState || null, data.StateCode || null,
                    data.IsMergeCancel || false,
                    data.PartnerId || null, data.PartnerDisplayName || null,
                    data.AmountTotal || 0, data.AmountUntaxed || 0,
                    data.DeliveryPrice || 0, data.CashOnDelivery || 0,
                    data.PaymentAmount || 0, data.Discount || 0, data.DebtUsed || 0,
                    data.TrackingRef || null, data.CarrierName || null,
                    data.UserName || null, data.SessionIndex || null,
                    JSON.stringify(data.OrderLines || []),
                    data.ReceiverName || null, data.ReceiverPhone || null,
                    data.ReceiverAddress || null,
                    data.Comment || null, data.DeliveryNote || null, data.Error || null,
                    data.DateInvoice || null, data.DateCreated || null,
                    data.LiveCampaignId || null, data.timestamp || Date.now()
                ]);
            }

            await client.query('COMMIT');
            res.json({ success: true, count: entries.length });
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('[INVOICE-STATUS] POST /entries/batch error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/invoice-status/entries/:compoundKey
 * Delete single entry by compound key
 */
router.delete('/entries/:compoundKey', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const { compoundKey } = req.params;
        const result = await pool.query(
            'DELETE FROM invoice_status WHERE compound_key = $1 RETURNING *',
            [compoundKey]
        );

        res.json({ success: true, deleted: result.rowCount > 0 });
    } catch (error) {
        console.error('[INVOICE-STATUS] DELETE /entries error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/invoice-status/entries/by-sale-online-id/:saleOnlineId
 * Delete all entries for a SaleOnlineId
 */
router.delete('/entries/by-sale-online-id/:saleOnlineId', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const { saleOnlineId } = req.params;
        const result = await pool.query(
            'DELETE FROM invoice_status WHERE sale_online_id = $1 RETURNING compound_key',
            [saleOnlineId]
        );

        res.json({ success: true, deletedCount: result.rowCount });
    } catch (error) {
        console.error('[INVOICE-STATUS] DELETE by SaleOnlineId error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// SENT BILLS
// =====================================================

/**
 * POST /api/invoice-status/sent-bills
 * Mark bill as sent (replaces markBillSent)
 */
router.post('/sent-bills', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const { saleOnlineId, username } = req.body;
        if (!saleOnlineId) return res.status(400).json({ error: 'saleOnlineId required' });

        await pool.query(`
            INSERT INTO invoice_sent_bills (sale_online_id, username)
            VALUES ($1, $2)
            ON CONFLICT (sale_online_id, username) DO NOTHING
        `, [saleOnlineId, username || 'default']);

        res.json({ success: true });
    } catch (error) {
        console.error('[INVOICE-STATUS] POST /sent-bills error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// CLEANUP
// =====================================================

/**
 * DELETE /api/invoice-status/cleanup
 * Cleanup entries older than 60 days
 */
router.delete('/cleanup', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const sixtyDaysAgo = Date.now() - (60 * 24 * 60 * 60 * 1000);

        const [r1, r2, r3] = await Promise.all([
            pool.query('DELETE FROM invoice_status WHERE entry_timestamp < $1 RETURNING compound_key', [sixtyDaysAgo]),
            pool.query('DELETE FROM invoice_status_delete WHERE deleted_at < $1 RETURNING compound_key', [sixtyDaysAgo]),
            pool.query(`
                DELETE FROM invoice_sent_bills
                WHERE sale_online_id NOT IN (SELECT DISTINCT sale_online_id FROM invoice_status)
                RETURNING sale_online_id
            `)
        ]);

        res.json({
            success: true,
            cleaned: {
                invoiceEntries: r1.rowCount,
                deleteEntries: r2.rowCount,
                orphanedSentBills: r3.rowCount
            }
        });
    } catch (error) {
        console.error('[INVOICE-STATUS] DELETE /cleanup error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// INVOICE STATUS DELETE - CRUD
// =====================================================

/**
 * GET /api/invoice-status/delete/load
 * Load all delete entries
 */
router.get('/delete/load', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const result = await pool.query(
            'SELECT * FROM invoice_status_delete ORDER BY deleted_at DESC'
        );

        res.json({ success: true, entries: result.rows });
    } catch (error) {
        console.error('[INVOICE-STATUS] GET /delete/load error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/invoice-status/delete/entries
 * Add cancelled invoice entry (replaces InvoiceStatusDeleteStore.add)
 */
router.post('/delete/entries', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const { compoundKey, username, saleOnlineId, cancelReason, deletedAt, deletedBy, deletedByDisplayName, invoiceData } = req.body;
        if (!compoundKey || !saleOnlineId) {
            return res.status(400).json({ error: 'compoundKey and saleOnlineId required' });
        }

        await pool.query(`
            INSERT INTO invoice_status_delete (
                compound_key, username, sale_online_id, cancel_reason,
                deleted_at, deleted_by, deleted_by_display_name,
                is_old_version, hidden, invoice_data
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (compound_key) DO UPDATE SET
                cancel_reason = EXCLUDED.cancel_reason,
                invoice_data = EXCLUDED.invoice_data,
                updated_at = CURRENT_TIMESTAMP
        `, [
            compoundKey, username || 'default', saleOnlineId,
            cancelReason || null, deletedAt || Date.now(),
            deletedBy || null, deletedByDisplayName || null,
            false, false, JSON.stringify(invoiceData || {})
        ]);

        res.json({ success: true, compoundKey });
    } catch (error) {
        console.error('[INVOICE-STATUS] POST /delete/entries error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/invoice-status/delete/entries/:compoundKey
 * Delete a cancelled invoice entry
 */
router.delete('/delete/entries/:compoundKey', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const { compoundKey } = req.params;
        const result = await pool.query(
            'DELETE FROM invoice_status_delete WHERE compound_key = $1 RETURNING *',
            [compoundKey]
        );

        res.json({ success: true, deleted: result.rowCount > 0 });
    } catch (error) {
        console.error('[INVOICE-STATUS] DELETE /delete/entries error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PATCH /api/invoice-status/delete/entries/:compoundKey/toggle-hidden
 * Toggle hidden flag
 */
router.patch('/delete/entries/:compoundKey/toggle-hidden', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const { compoundKey } = req.params;
        const result = await pool.query(`
            UPDATE invoice_status_delete
            SET hidden = NOT hidden, updated_at = CURRENT_TIMESTAMP
            WHERE compound_key = $1
            RETURNING hidden
        `, [compoundKey]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Entry not found' });
        }

        res.json({ success: true, hidden: result.rows[0].hidden });
    } catch (error) {
        console.error('[INVOICE-STATUS] PATCH toggle-hidden error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
