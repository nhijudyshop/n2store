// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// INVOICE NJD MAPPING REST API
// Maps SaleOnlineOrder → NJD invoice numbers
// Replaces unreliable Reference-based matching
// =====================================================

const express = require('express');
const router = express.Router();

// =====================================================
// LOOKUP — Frontend dùng để tìm NJD number cho order
// =====================================================

/**
 * GET /api/invoice-mapping/lookup/:saleOnlineId
 * Tìm tất cả NJD numbers cho 1 SaleOnlineOrder
 */
router.get('/lookup/:saleOnlineId', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const { saleOnlineId } = req.params;
        const result = await pool.query(
            `SELECT * FROM invoice_njd_mapping
             WHERE sale_online_id = $1
             ORDER BY date_invoice DESC`,
            [saleOnlineId]
        );

        res.json({ success: true, mappings: result.rows });
    } catch (error) {
        console.error('[INVOICE-MAPPING] lookup error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/invoice-mapping/lookup-batch
 * Tìm NJD numbers cho nhiều SaleOnlineOrder cùng lúc
 * Body: { saleOnlineIds: ["id1", "id2", ...] }
 */
router.post('/lookup-batch', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const { saleOnlineIds } = req.body;
        if (!Array.isArray(saleOnlineIds) || saleOnlineIds.length === 0) {
            return res.status(400).json({ error: 'saleOnlineIds array required' });
        }

        // Limit batch size
        const ids = saleOnlineIds.slice(0, 500);
        const result = await pool.query(
            `SELECT * FROM invoice_njd_mapping
             WHERE sale_online_id = ANY($1)
             ORDER BY sale_online_id, date_invoice DESC`,
            [ids]
        );

        // Group by sale_online_id
        const grouped = {};
        for (const row of result.rows) {
            if (!grouped[row.sale_online_id]) {
                grouped[row.sale_online_id] = [];
            }
            grouped[row.sale_online_id].push(row);
        }

        res.json({ success: true, mappings: grouped, total: result.rows.length });
    } catch (error) {
        console.error('[INVOICE-MAPPING] lookup-batch error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// UPSERT — Lưu mapping mới (khi tạo PBH hoặc sync)
// =====================================================

/**
 * POST /api/invoice-mapping/upsert
 * Upsert 1 mapping
 */
router.post('/upsert', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const {
            saleOnlineId, orderCode, njdNumber, tposInvoiceId,
            partnerName, phone, amountTotal, showState, state,
            stateCode, dateInvoice, userName
        } = req.body;

        if (!saleOnlineId || !njdNumber) {
            return res.status(400).json({ error: 'saleOnlineId and njdNumber required' });
        }

        await pool.query(`
            INSERT INTO invoice_njd_mapping (
                sale_online_id, order_code, njd_number, tpos_invoice_id,
                partner_name, phone, amount_total, show_state, state,
                state_code, date_invoice, user_name
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (sale_online_id, njd_number)
            DO UPDATE SET
                order_code = COALESCE(EXCLUDED.order_code, invoice_njd_mapping.order_code),
                tpos_invoice_id = COALESCE(EXCLUDED.tpos_invoice_id, invoice_njd_mapping.tpos_invoice_id),
                partner_name = COALESCE(EXCLUDED.partner_name, invoice_njd_mapping.partner_name),
                phone = COALESCE(EXCLUDED.phone, invoice_njd_mapping.phone),
                amount_total = COALESCE(EXCLUDED.amount_total, invoice_njd_mapping.amount_total),
                show_state = COALESCE(EXCLUDED.show_state, invoice_njd_mapping.show_state),
                state = COALESCE(EXCLUDED.state, invoice_njd_mapping.state),
                state_code = COALESCE(EXCLUDED.state_code, invoice_njd_mapping.state_code),
                date_invoice = COALESCE(EXCLUDED.date_invoice, invoice_njd_mapping.date_invoice),
                user_name = COALESCE(EXCLUDED.user_name, invoice_njd_mapping.user_name)
        `, [
            saleOnlineId, orderCode, njdNumber, tposInvoiceId,
            partnerName, phone, amountTotal, showState, state,
            stateCode, dateInvoice, userName
        ]);

        res.json({ success: true });
    } catch (error) {
        console.error('[INVOICE-MAPPING] upsert error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/invoice-mapping/upsert-batch
 * Upsert nhiều mappings (dùng cho sync)
 * Body: { mappings: [{ saleOnlineId, orderCode, njdNumber, ... }, ...] }
 */
router.post('/upsert-batch', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const { mappings } = req.body;
        if (!Array.isArray(mappings) || mappings.length === 0) {
            return res.status(400).json({ error: 'mappings array required' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            let upserted = 0;
            let skipped = 0;

            for (const m of mappings) {
                if (!m.saleOnlineId || !m.njdNumber) {
                    skipped++;
                    continue;
                }
                await client.query(`
                    INSERT INTO invoice_njd_mapping (
                        sale_online_id, order_code, njd_number, tpos_invoice_id,
                        partner_name, phone, amount_total, show_state, state,
                        state_code, date_invoice, user_name
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                    ON CONFLICT (sale_online_id, njd_number)
                    DO UPDATE SET
                        order_code = COALESCE(EXCLUDED.order_code, invoice_njd_mapping.order_code),
                        tpos_invoice_id = COALESCE(EXCLUDED.tpos_invoice_id, invoice_njd_mapping.tpos_invoice_id),
                        partner_name = COALESCE(EXCLUDED.partner_name, invoice_njd_mapping.partner_name),
                        phone = COALESCE(EXCLUDED.phone, invoice_njd_mapping.phone),
                        amount_total = COALESCE(EXCLUDED.amount_total, invoice_njd_mapping.amount_total),
                        show_state = COALESCE(EXCLUDED.show_state, invoice_njd_mapping.show_state),
                        state = COALESCE(EXCLUDED.state, invoice_njd_mapping.state),
                        state_code = COALESCE(EXCLUDED.state_code, invoice_njd_mapping.state_code),
                        date_invoice = COALESCE(EXCLUDED.date_invoice, invoice_njd_mapping.date_invoice),
                        user_name = COALESCE(EXCLUDED.user_name, invoice_njd_mapping.user_name)
                `, [
                    m.saleOnlineId, m.orderCode || null, m.njdNumber, m.tposInvoiceId || null,
                    m.partnerName || null, m.phone || null, m.amountTotal || null,
                    m.showState || null, m.state || null, m.stateCode || 'None',
                    m.dateInvoice || null, m.userName || null
                ]);
                upserted++;
            }

            await client.query('COMMIT');
            res.json({ success: true, upserted, skipped });
        } catch (e) {
            await client.query('ROLLBACK').catch(() => {});
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('[INVOICE-MAPPING] upsert-batch error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// DELETE — Xóa mapping khi xóa đơn
// =====================================================

/**
 * DELETE /api/invoice-mapping/:saleOnlineId
 * Xóa tất cả mappings cho 1 SaleOnlineOrder
 */
router.delete('/:saleOnlineId', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const { saleOnlineId } = req.params;
        const result = await pool.query(
            'DELETE FROM invoice_njd_mapping WHERE sale_online_id = $1',
            [saleOnlineId]
        );

        res.json({ success: true, deleted: result.rowCount });
    } catch (error) {
        console.error('[INVOICE-MAPPING] delete error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/invoice-mapping/by-njd/:njdNumber
 * Xóa mapping theo NJD number cụ thể
 */
router.delete('/by-njd/:njdNumber(*)', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const njdNumber = req.params.njdNumber;
        const result = await pool.query(
            'DELETE FROM invoice_njd_mapping WHERE njd_number = $1',
            [njdNumber]
        );

        res.json({ success: true, deleted: result.rowCount });
    } catch (error) {
        console.error('[INVOICE-MAPPING] delete by-njd error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// SYNC — Fetch ALL invoices from TPOS and populate DB
// =====================================================

/**
 * POST /api/invoice-mapping/sync
 * Fetch tất cả invoices từ TPOS OData, lưu vào DB
 * Body: { startDate?, endDate?, pageSize? }
 *
 * Gọi TPOS: /FastSaleOrder/ODataService.GetView
 *   filter: Type eq 'invoice'
 *   select: Id, Number, Reference, SaleOnlineIds, PartnerDisplayName, Phone,
 *           AmountTotal, ShowState, State, StateCode, DateInvoice, UserName
 */
router.post('/sync', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const tposTokenManager = req.app.locals.tposTokenManager;
        if (!tposTokenManager) return res.status(500).json({ error: 'TPOS token manager not available' });

        // Date range (default: last 90 days)
        const now = new Date();
        const defaultStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        const startDate = req.body.startDate || defaultStart.toISOString();
        const endDate = req.body.endDate || now.toISOString();
        const PAGE_SIZE = req.body.pageSize || 200;

        const token = await tposTokenManager.getToken();
        if (!token) return res.status(500).json({ error: 'Cannot get TPOS token' });

        const tposBase = 'https://api-livechat.tpos.dev/odata';
        const select = 'Id,Number,Reference,SaleOnlineIds,PartnerDisplayName,Phone,AmountTotal,ShowState,State,StateCode,DateInvoice,UserName';
        const filter = `(Type eq 'invoice' and DateInvoice ge ${startDate.replace('Z', '+00:00')} and DateInvoice le ${endDate.replace('Z', '+00:00')})`;

        let skip = 0;
        let hasMore = true;
        let totalFetched = 0;
        let totalMapped = 0;
        let totalSkipped = 0;
        const allMappings = [];

        console.log(`[INVOICE-MAPPING] Sync started: ${startDate} → ${endDate}`);

        while (hasMore) {
            const url = `${tposBase}/FastSaleOrder/ODataService.GetView?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(filter)}&$top=${PAGE_SIZE}&$skip=${skip}&$orderby=DateInvoice desc&$count=true`;

            const resp = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            });

            if (!resp.ok) {
                console.error(`[INVOICE-MAPPING] TPOS fetch failed: ${resp.status}`);
                break;
            }

            const data = await resp.json();
            const invoices = data.value || [];
            totalFetched += invoices.length;

            for (const inv of invoices) {
                const njdNumber = inv.Number;
                const saleOnlineIds = inv.SaleOnlineIds || [];

                if (!njdNumber || saleOnlineIds.length === 0) {
                    totalSkipped++;
                    continue;
                }

                // Map each SaleOnlineId to this NJD number
                for (const soId of saleOnlineIds) {
                    allMappings.push({
                        saleOnlineId: String(soId),
                        orderCode: inv.Reference || null,
                        njdNumber,
                        tposInvoiceId: inv.Id || null,
                        partnerName: inv.PartnerDisplayName || null,
                        phone: inv.Phone || null,
                        amountTotal: inv.AmountTotal || null,
                        showState: inv.ShowState || null,
                        state: inv.State || null,
                        stateCode: inv.StateCode || 'None',
                        dateInvoice: inv.DateInvoice || null,
                        userName: inv.UserName || null
                    });
                    totalMapped++;
                }
            }

            hasMore = invoices.length === PAGE_SIZE;
            skip += PAGE_SIZE;
            console.log(`[INVOICE-MAPPING] Fetched page: ${skip}, invoices: ${invoices.length}, mapped: ${totalMapped}`);
        }

        // Batch upsert to DB
        if (allMappings.length > 0) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const BATCH = 100;
                for (let i = 0; i < allMappings.length; i += BATCH) {
                    const batch = allMappings.slice(i, i + BATCH);
                    for (const m of batch) {
                        await client.query(`
                            INSERT INTO invoice_njd_mapping (
                                sale_online_id, order_code, njd_number, tpos_invoice_id,
                                partner_name, phone, amount_total, show_state, state,
                                state_code, date_invoice, user_name
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                            ON CONFLICT (sale_online_id, njd_number)
                            DO UPDATE SET
                                order_code = COALESCE(EXCLUDED.order_code, invoice_njd_mapping.order_code),
                                tpos_invoice_id = COALESCE(EXCLUDED.tpos_invoice_id, invoice_njd_mapping.tpos_invoice_id),
                                partner_name = COALESCE(EXCLUDED.partner_name, invoice_njd_mapping.partner_name),
                                phone = COALESCE(EXCLUDED.phone, invoice_njd_mapping.phone),
                                amount_total = COALESCE(EXCLUDED.amount_total, invoice_njd_mapping.amount_total),
                                show_state = COALESCE(EXCLUDED.show_state, invoice_njd_mapping.show_state),
                                state = COALESCE(EXCLUDED.state, invoice_njd_mapping.state),
                                state_code = COALESCE(EXCLUDED.state_code, invoice_njd_mapping.state_code),
                                date_invoice = COALESCE(EXCLUDED.date_invoice, invoice_njd_mapping.date_invoice),
                                user_name = COALESCE(EXCLUDED.user_name, invoice_njd_mapping.user_name)
                        `, [
                            m.saleOnlineId, m.orderCode, m.njdNumber, m.tposInvoiceId,
                            m.partnerName, m.phone, m.amountTotal, m.showState, m.state,
                            m.stateCode, m.dateInvoice, m.userName
                        ]);
                    }
                }
                await client.query('COMMIT');
            } catch (e) {
                await client.query('ROLLBACK').catch(() => {});
                throw e;
            } finally {
                client.release();
            }
        }

        const summary = { totalFetched, totalMapped, totalSkipped, startDate, endDate };
        console.log('[INVOICE-MAPPING] Sync complete:', summary);
        res.json({ success: true, ...summary });
    } catch (error) {
        console.error('[INVOICE-MAPPING] sync error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/invoice-mapping/stats
 * Thống kê số lượng mappings
 */
router.get('/stats', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });

        const result = await pool.query(`
            SELECT
                COUNT(*) as total,
                COUNT(DISTINCT sale_online_id) as unique_orders,
                COUNT(DISTINCT njd_number) as unique_invoices,
                MIN(date_invoice) as earliest,
                MAX(date_invoice) as latest
            FROM invoice_njd_mapping
        `);

        res.json({ success: true, stats: result.rows[0] });
    } catch (error) {
        console.error('[INVOICE-MAPPING] stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
