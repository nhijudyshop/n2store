// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * ODATA TPOS SHADOW ROUTER
 *
 * Mục đích: Thay thế dần dần các endpoint OData của TPOS bằng dữ liệu local,
 * giữ NGUYÊN shape JSON để frontend không phải thay đổi.
 *
 * Mount tại /api/v2/odata/* — namespace tách biệt với /api/odata/* (proxy đi TPOS).
 *
 * Endpoints (PoC iteration 1):
 *   GET /POSCategory                                           — POS categories (seeded)
 *   GET /ProductCategory                                       — Product categories (seeded)
 *   GET /ProductUOM                                            — Units of measure (seeded)
 *   GET /Tag                                                   — Tags (seeded)
 *   GET /Partner/ODataService.GetViewV2                        — Customers/Suppliers (DB)
 *   GET /Partner({id})                                         — Single partner (DB)
 *   GET /_health                                               — Health check
 *
 * Response shape (chuẩn OData):
 *   Collection: { "@odata.context": "...", "@odata.count": N, "value": [...] }
 *   Single:     { "@odata.context": "...", ...fields }
 */

const express = require('express');
const router = express.Router();

// ── Constants ──────────────────────────────────────────────────
const BASE_URL_HEADER = 'x-base-url';
function getBaseUrl(req) {
    const h = req.headers[BASE_URL_HEADER];
    if (h && /^https?:\/\//.test(h)) return h;
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost';
    return `${proto}://${host}`;
}

function odataContext(req, entity) {
    return `${getBaseUrl(req)}/api/v2/odata/$metadata#${entity}`;
}

/**
 * Wrap rows in OData collection shape. Honors $top, $skip, $count, $select.
 */
function odataCollection(req, entity, rows, totalCount) {
    const top = parseInt(req.query.$top, 10);
    const skip = parseInt(req.query.$skip, 10) || 0;
    const wantsCount = String(req.query.$count) === 'true';
    const selectStr = req.query.$select;

    let value = rows;
    if (Number.isFinite(skip) && skip > 0) value = value.slice(skip);
    if (Number.isFinite(top) && top >= 0) value = value.slice(0, top);

    if (selectStr) {
        const cols = selectStr.split(',').map((c) => c.trim());
        value = value.map((r) => {
            const out = {};
            for (const c of cols) if (c in r) out[c] = r[c];
            return out;
        });
    }

    const out = {
        '@odata.context': odataContext(req, entity),
        value,
    };
    if (wantsCount) {
        out['@odata.count'] = Number.isFinite(totalCount) ? totalCount : rows.length;
    }
    return out;
}

function odataSingle(req, entity, row) {
    return {
        '@odata.context': `${odataContext(req, entity)}/$entity`,
        ...row,
    };
}

function odataError(req, res, status, code, message, details) {
    res.status(status).json({
        error: { code: code || String(status), message, details: details || null },
    });
}

// ── Seeded reference data (small, low-churn) ──────────────────
// Shape khớp với TPOS thực, value mặc định để UI hoạt động.
// Để mở rộng: chuyển thành table riêng hoặc đọc từ JSON file.

const SEED = {
    ProductCategory: [
        { Id: 1, Name: 'Mặc định', ParentId: null, CompleteName: 'Mặc định', Sequence: 1 },
        { Id: 2, Name: 'Trang sức', ParentId: null, CompleteName: 'Trang sức', Sequence: 2 },
        { Id: 3, Name: 'Phụ kiện', ParentId: null, CompleteName: 'Phụ kiện', Sequence: 3 },
        { Id: 4, Name: 'Quần áo', ParentId: null, CompleteName: 'Quần áo', Sequence: 4 },
    ],
    ProductUOM: [
        { Id: 1, Name: 'Cái', CategoryId: 1, Factor: 1.0, Active: true },
        { Id: 2, Name: 'Bộ', CategoryId: 1, Factor: 1.0, Active: true },
        { Id: 3, Name: 'Đôi', CategoryId: 1, Factor: 1.0, Active: true },
        { Id: 4, Name: 'Cây', CategoryId: 1, Factor: 1.0, Active: true },
    ],
    POSCategory: [{ Id: 1, Name: 'Tất cả', Sequence: 1, Active: true }],
    Tag: [
        { Id: 59112, Type: 'default', Name: 'MY THÊM CHỜ VỀ', Color: 1 },
        { Id: 59116, Type: 'default', Name: 'TRỪ CÔNG NỢ', Color: 2 },
        { Id: 59117, Type: 'default', Name: 'TRỪ THU VỀ', Color: 3 },
        { Id: 59119, Type: 'saleonline', Name: 'THẺ KHÁCH LẠ', Color: 4 },
        { Id: 59120, Type: 'saleonline', Name: 'XÃ KHÁCH LẠ', Color: 5 },
    ],
    AccountTax: [
        {
            Id: 1,
            Name: 'Thuế 0%',
            Amount: 0,
            AmountType: 'percent',
            TypeTaxUse: 'sale',
            Active: true,
        },
    ],
    ResCurrency: [
        { Id: 1, Name: 'VND', Symbol: '₫' },
        { Id: 2, Name: 'USD', Symbol: '$' },
    ],
    StockWarehouse: [{ Id: 1, Name: 'Kho chính', Code: 'WH', Active: true, CompanyId: 1 }],
};

// ── Helper: get DB pool from app.locals ───────────────────────
function getDb(req) {
    return req.app.locals.chatDb || null;
}

// ── Helper: row → TPOS Partner shape ──────────────────────────
function customerRowToPartner(row) {
    const isSupplier = row.is_supplier === true;
    return {
        Id: row.tpos_id || row.id,
        Name: row.name || '',
        DisplayName: row.display_name || row.name || '',
        NameNoSign: row.name_no_sign || null,
        Phone: row.phone || null,
        Email: row.email || null,
        Street: row.address || row.street || null,
        Active: row.active !== false,
        Customer: !isSupplier,
        Supplier: isSupplier,
        Type: 'contact',
        CompanyType: row.is_company ? 'company' : 'person',
        IsCompany: !!row.is_company,
        CityName: row.city_name || null,
        DistrictName: row.district_name || null,
        WardName: row.ward_name || null,
        Status: row.status || 'Undefined',
        StatusText: row.status_text || null,
        Source: row.source || null,
        SourceRef: row.source_ref || null,
        FacebookId: row.facebook_id || null,
        FacebookASIds: row.facebook_as_ids || null,
        ZaloUserId: row.zalo_user_id || null,
        ZaloUserName: row.zalo_user_name || null,
        BirthDay: row.birth_day || null,
        TaxCode: row.tax_code || null,
        IdCardNumber: row.id_card_number || null,
        Credit: Number(row.credit || 0),
        Debit: Number(row.debit || 0),
        LoyaltyPoints: row.loyalty_points || null,
        Discount: Number(row.discount || 0),
        Comment: row.comment || null,
        ImageUrl: row.image_url || null,
        DateCreated: row.created_at ? new Date(row.created_at).toISOString() : null,
        LastUpdated: row.updated_at ? new Date(row.updated_at).toISOString() : null,
        Ref: row.ref || null,
        Tags: row.tags || null,
        Ward_District_City: row.ward_district_city || '',
        ExtraProperties: row.extra || null,
    };
}

// ─────────────────────────────────────────────────────────────
// ENDPOINTS
// ─────────────────────────────────────────────────────────────

router.get('/_health', (req, res) => {
    res.json({
        ok: true,
        service: 'odata-tpos-shadow',
        baseUrl: getBaseUrl(req),
        seededEntities: Object.keys(SEED),
        timestamp: new Date().toISOString(),
    });
});

router.get('/POSCategory', (req, res) => {
    res.json(odataCollection(req, 'POSCategory', SEED.POSCategory));
});
router.get('/ProductCategory', (req, res) => {
    res.json(odataCollection(req, 'ProductCategory', SEED.ProductCategory));
});
router.get('/ProductUOM', (req, res) => {
    res.json(odataCollection(req, 'ProductUOM', SEED.ProductUOM));
});
router.get('/Tag', (req, res) => {
    let rows = SEED.Tag;
    // Optional naive $filter=Type eq 'sale'  (PoC, only handle Type filter)
    const f = req.query.$filter;
    if (f) {
        const m = String(f).match(/Type\s+eq\s+'([^']+)'/i);
        if (m) rows = rows.filter((r) => r.Type === m[1]);
    }
    res.json(odataCollection(req, 'Tag', rows));
});
router.get('/AccountTax', (req, res) => {
    res.json(odataCollection(req, 'AccountTax', SEED.AccountTax));
});
router.get('/ResCurrency', (req, res) => {
    res.json(odataCollection(req, 'ResCurrency', SEED.ResCurrency));
});
router.get('/StockWarehouse', (req, res) => {
    res.json(odataCollection(req, 'StockWarehouse', SEED.StockWarehouse));
});

// Partner GetViewV2 — đọc từ customers table
router.get('/Partner/ODataService.GetViewV2', async (req, res) => {
    const db = getDb(req);
    if (!db) {
        return odataError(req, res, 503, 'NoDatabase', 'No database connection available');
    }

    const type = req.query.Type || 'Customer';
    const isSupplier = String(type).toLowerCase() === 'supplier';
    const phoneFilter = req.query.Phone || null;
    const top = parseInt(req.query.$top, 10) || 50;
    const skip = parseInt(req.query.$skip, 10) || 0;
    const wantsCount = String(req.query.$count) === 'true';

    try {
        const conditions = [];
        const params = [];
        let pi = 1;

        if (isSupplier) {
            conditions.push(`COALESCE(is_supplier, false) = true`);
        } else {
            conditions.push(`COALESCE(is_supplier, false) = false`);
        }
        if (phoneFilter) {
            conditions.push(`phone ILIKE $${pi++}`);
            params.push(`%${phoneFilter}%`);
        }
        const whereSQL = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        // Count first if requested
        let totalCount = null;
        if (wantsCount) {
            const cr = await db.query(
                `SELECT COUNT(*)::int AS n FROM customers ${whereSQL}`,
                params
            );
            totalCount = cr.rows[0]?.n || 0;
        }

        // Page data
        const dataSQL = `
            SELECT * FROM customers
            ${whereSQL}
            ORDER BY COALESCE(updated_at, created_at) DESC NULLS LAST
            LIMIT ${top} OFFSET ${skip}
        `;
        const r = await db.query(dataSQL, params);
        const rows = r.rows.map(customerRowToPartner);

        const out = {
            '@odata.context': odataContext(req, 'Partner'),
            value: rows,
        };
        if (wantsCount) out['@odata.count'] = totalCount;
        res.json(out);
    } catch (e) {
        console.error('[v2-odata-shadow] Partner GetViewV2 error:', e);
        odataError(req, res, 500, 'DBError', e.message);
    }
});

// Single partner by Id
router.get('/Partner\\(:id\\)', async (req, res) => {
    const db = getDb(req);
    if (!db) {
        return odataError(req, res, 503, 'NoDatabase', 'No database connection available');
    }
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
        return odataError(req, res, 400, 'BadRequest', 'id must be integer');
    }
    try {
        const r = await db.query(`SELECT * FROM customers WHERE id = $1 OR tpos_id = $1 LIMIT 1`, [
            id,
        ]);
        if (!r.rows.length) {
            return odataError(req, res, 404, 'NotFound', `Partner ${id} not found`);
        }
        res.json(odataSingle(req, 'Partner', customerRowToPartner(r.rows[0])));
    } catch (e) {
        console.error('[v2-odata-shadow] Partner({id}) error:', e);
        odataError(req, res, 500, 'DBError', e.message);
    }
});

module.exports = router;
