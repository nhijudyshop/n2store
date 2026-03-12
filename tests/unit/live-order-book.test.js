/**
 * Unit Tests - Live Order Book firebase-helpers.js
 *
 * Task 14.1: Firebase CRUD operations, edge cases, dual-node merge, cascade delete, cart snapshot
 *
 * **Validates: A1.3, A2.2, B1.5, B1.6, B3.1, B3.2, D1.1, D1.5, E1.3, E1.4**
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createSession,
    deleteSession,
    loadSessions,
    addProductToFirebase,
    removeProductFromFirebase,
    updateProductQtyInFirebase,
    updateOrderedQtyInFirebase,
    loadAllProductsFromFirebase,
    getProductsArray,
    saveCartSnapshot,
    restoreProductsFromSnapshot,
    getAllCartSnapshots,
    deleteCartSnapshot,
    loadDisplaySettings,
    saveDisplaySettings,
    DEFAULT_DISPLAY_SETTINGS
} from '../../live-order-book/firebase-helpers.js';

// ============================================================
// Mock Firebase Database
// ============================================================

/**
 * Creates a mock Firebase database that stores data in-memory.
 * Supports ref().set(), ref().once('value'), ref().remove(),
 * ref().update(), ref().transaction()
 */
function createMockDatabase() {
    const store = {};

    function getNestedValue(path) {
        const parts = path.split('/');
        let current = store;
        for (const part of parts) {
            if (current == null || typeof current !== 'object') return undefined;
            current = current[part];
        }
        return current;
    }

    function setNestedValue(path, value) {
        const parts = path.split('/');
        let current = store;
        for (let i = 0; i < parts.length - 1; i++) {
            if (current[parts[i]] == null || typeof current[parts[i]] !== 'object') {
                current[parts[i]] = {};
            }
            current = current[parts[i]];
        }
        if (value === null) {
            delete current[parts[parts.length - 1]];
        } else {
            current[parts[parts.length - 1]] = value;
        }
    }

    function deleteNestedValue(path) {
        setNestedValue(path, null);
    }

    function createRef(path) {
        return {
            set: vi.fn(async (value) => {
                setNestedValue(path, JSON.parse(JSON.stringify(value)));
            }),
            once: vi.fn(async () => ({
                val: () => {
                    const v = getNestedValue(path);
                    return v !== undefined ? JSON.parse(JSON.stringify(v)) : null;
                }
            })),
            remove: vi.fn(async () => {
                deleteNestedValue(path);
            }),
            update: vi.fn(async (updates) => {
                for (const [updatePath, value] of Object.entries(updates)) {
                    if (value === null) {
                        deleteNestedValue(updatePath);
                    } else {
                        setNestedValue(updatePath, JSON.parse(JSON.stringify(value)));
                    }
                }
            }),
            transaction: vi.fn(async (updateFn) => {
                const currentVal = getNestedValue(path);
                const newVal = updateFn(currentVal != null ? JSON.parse(JSON.stringify(currentVal)) : null);
                setNestedValue(path, newVal != null ? JSON.parse(JSON.stringify(newVal)) : null);
            }),
            child: vi.fn((childPath) => createRef(path ? `${path}/${childPath}` : childPath))
        };
    }

    return {
        ref: vi.fn((path = '') => createRef(path)),
        _store: store,
        _get: getNestedValue,
        _set: setNestedValue
    };
}

// ============================================================
// 1. createSession
// ============================================================

describe('createSession', () => {
    it('creates session with correct fields (name, date, createdAt, productCount=0)', async () => {
        const db = createMockDatabase();
        const sessionId = await createSession(db, 'Live 15/01', '2024-01-15');

        expect(sessionId).toMatch(/^session_\d+$/);

        const session = db._get(`liveOrderSessions/${sessionId}`);
        expect(session).toBeDefined();
        expect(session.name).toBe('Live 15/01');
        expect(session.date).toBe('2024-01-15');
        expect(session.productCount).toBe(0);
        expect(typeof session.createdAt).toBe('number');
    });
});

// ============================================================
// 2. deleteSession — cascade delete
// ============================================================

describe('deleteSession', () => {
    it('cascade deletes all 6 nodes (sessions, products, qty, meta, settings, cartHistory)', async () => {
        const db = createMockDatabase();
        const sid = 'session_test1';

        // Seed data in all 6 nodes
        db._set(`liveOrderSessions/${sid}`, { name: 'Test', date: '2024-01-01' });
        db._set(`liveOrderProducts/${sid}/product_1`, { Id: 1, NameGet: 'SP1' });
        db._set(`liveOrderProductsQty/${sid}/product_1`, { soldQty: 5, orderedQty: 2 });
        db._set(`liveOrderProductsMeta/${sid}`, { count: 1, sortedIds: ['1'] });
        db._set(`liveOrderDisplaySettings/${sid}`, { gridColumns: 4 });
        db._set(`liveOrderCartHistory/${sid}/snap_1`, { metadata: { name: 'snap' } });

        await deleteSession(db, sid);

        expect(db._get(`liveOrderSessions/${sid}`)).toBeUndefined();
        expect(db._get(`liveOrderProducts/${sid}`)).toBeUndefined();
        expect(db._get(`liveOrderProductsQty/${sid}`)).toBeUndefined();
        expect(db._get(`liveOrderProductsMeta/${sid}`)).toBeUndefined();
        expect(db._get(`liveOrderDisplaySettings/${sid}`)).toBeUndefined();
        expect(db._get(`liveOrderCartHistory/${sid}`)).toBeUndefined();
    });
});

// ============================================================
// 3. addProductToFirebase — new product
// ============================================================

describe('addProductToFirebase', () => {
    it('new product gets default soldQty=0, orderedQty=0 and writes to both nodes', async () => {
        const db = createMockDatabase();
        const sid = 'session_add1';
        const localProducts = {};

        db._set(`liveOrderSessions/${sid}`, { name: 'Test', productCount: 0 });

        const product = {
            Id: 100,
            NameGet: 'Áo thun trắng (M)',
            QtyAvailable: 50,
            ProductTmplId: 45,
            ListPrice: 150000,
            imageUrl: 'https://img.test/100.jpg'
        };

        const result = await addProductToFirebase(db, sid, product, localProducts);

        expect(result.action).toBe('added');
        expect(result.product.soldQty).toBe(0);
        expect(result.product.orderedQty).toBe(0);
        expect(result.product.Id).toBe(100);
        expect(result.product.NameGet).toBe('Áo thun trắng (M)');

        // Check products node
        const stored = db._get(`liveOrderProducts/${sid}/product_100`);
        expect(stored).toBeDefined();
        expect(stored.soldQty).toBe(0);
        expect(stored.orderedQty).toBe(0);

        // Check qty node
        const qtyStored = db._get(`liveOrderProductsQty/${sid}/product_100`);
        expect(qtyStored).toBeDefined();
        expect(qtyStored.soldQty).toBe(0);
        expect(qtyStored.orderedQty).toBe(0);

        // Check local object updated
        expect(localProducts['product_100']).toBeDefined();
        expect(localProducts['product_100'].soldQty).toBe(0);
    });

    it('re-add existing product preserves soldQty/orderedQty, only updates info', async () => {
        const db = createMockDatabase();
        const sid = 'session_readd';
        const localProducts = {
            'product_200': {
                Id: 200,
                NameGet: 'Old Name',
                soldQty: 10,
                orderedQty: 5,
                addedAt: 1000000,
                imageUrl: 'old.jpg'
            }
        };

        const updatedProduct = {
            Id: 200,
            NameGet: 'New Name',
            QtyAvailable: 99,
            ProductTmplId: 50,
            ListPrice: 200000,
            imageUrl: 'new.jpg'
        };

        const result = await addProductToFirebase(db, sid, updatedProduct, localProducts);

        expect(result.action).toBe('updated');
        expect(result.product.soldQty).toBe(10);
        expect(result.product.orderedQty).toBe(5);
        expect(result.product.NameGet).toBe('New Name');
        expect(result.product.addedAt).toBe(1000000);
    });
});

// ============================================================
// 4. removeProductFromFirebase
// ============================================================

describe('removeProductFromFirebase', () => {
    it('removes from both nodes and updates metadata count and sortedIds', async () => {
        const db = createMockDatabase();
        const sid = 'session_rm';
        const localProducts = {
            'product_300': { Id: 300, NameGet: 'SP300' },
            'product_301': { Id: 301, NameGet: 'SP301' }
        };

        db._set(`liveOrderProducts/${sid}/product_300`, { Id: 300 });
        db._set(`liveOrderProducts/${sid}/product_301`, { Id: 301 });
        db._set(`liveOrderProductsQty/${sid}/product_300`, { soldQty: 3 });
        db._set(`liveOrderProductsQty/${sid}/product_301`, { soldQty: 1 });
        db._set(`liveOrderProductsMeta/${sid}`, { sortedIds: ['300', '301'], count: 2 });
        db._set(`liveOrderSessions/${sid}`, { productCount: 2 });

        await removeProductFromFirebase(db, sid, 'product_300', localProducts);

        // Product removed from both nodes
        expect(db._get(`liveOrderProducts/${sid}/product_300`)).toBeUndefined();
        expect(db._get(`liveOrderProductsQty/${sid}/product_300`)).toBeUndefined();

        // Other product still exists
        expect(db._get(`liveOrderProducts/${sid}/product_301`)).toBeDefined();

        // Local object updated
        expect(localProducts['product_300']).toBeUndefined();
        expect(localProducts['product_301']).toBeDefined();

        // Metadata updated
        const meta = db._get(`liveOrderProductsMeta/${sid}`);
        expect(meta.sortedIds).toEqual(['301']);
        expect(meta.count).toBe(1);
    });
});

// ============================================================
// 5. updateProductQtyInFirebase — soldQty bounds
// ============================================================

describe('updateProductQtyInFirebase', () => {
    it('enforces soldQty >= 0 via Math.max(0, Math.floor())', async () => {
        const db = createMockDatabase();
        const sid = 'session_qty';

        db._set(`liveOrderProducts/${sid}/product_400`, { soldQty: 5 });
        db._set(`liveOrderProductsQty/${sid}/product_400`, { soldQty: 5 });

        await updateProductQtyInFirebase(db, sid, 'product_400', 3);
        expect(db._get(`liveOrderProducts/${sid}/product_400/soldQty`)).toBe(3);
        expect(db._get(`liveOrderProductsQty/${sid}/product_400/soldQty`)).toBe(3);
    });

    it('soldQty=0 when decrementing from 0 (negative clamped)', async () => {
        const db = createMockDatabase();
        const sid = 'session_qty0';

        db._set(`liveOrderProducts/${sid}/product_401`, { soldQty: 0 });
        db._set(`liveOrderProductsQty/${sid}/product_401`, { soldQty: 0 });

        await updateProductQtyInFirebase(db, sid, 'product_401', -1);
        expect(db._get(`liveOrderProducts/${sid}/product_401/soldQty`)).toBe(0);
        expect(db._get(`liveOrderProductsQty/${sid}/product_401/soldQty`)).toBe(0);
    });

    it('floors decimal values', async () => {
        const db = createMockDatabase();
        const sid = 'session_qtydec';

        await updateProductQtyInFirebase(db, sid, 'product_402', 3.7);
        expect(db._get(`liveOrderProducts/${sid}/product_402/soldQty`)).toBe(3);
        expect(db._get(`liveOrderProductsQty/${sid}/product_402/soldQty`)).toBe(3);
    });

    it('writes to BOTH nodes (products + qty)', async () => {
        const db = createMockDatabase();
        const sid = 'session_qtyboth';

        await updateProductQtyInFirebase(db, sid, 'product_403', 7);
        expect(db._get(`liveOrderProducts/${sid}/product_403/soldQty`)).toBe(7);
        expect(db._get(`liveOrderProductsQty/${sid}/product_403/soldQty`)).toBe(7);
    });
});

// ============================================================
// 6. updateOrderedQtyInFirebase
// ============================================================

describe('updateOrderedQtyInFirebase', () => {
    it('enforces orderedQty >= 0 and writes to both nodes', async () => {
        const db = createMockDatabase();
        const sid = 'session_oqty';

        await updateOrderedQtyInFirebase(db, sid, 'product_500', -5);
        expect(db._get(`liveOrderProducts/${sid}/product_500/orderedQty`)).toBe(0);
        expect(db._get(`liveOrderProductsQty/${sid}/product_500/orderedQty`)).toBe(0);

        await updateOrderedQtyInFirebase(db, sid, 'product_500', 4);
        expect(db._get(`liveOrderProducts/${sid}/product_500/orderedQty`)).toBe(4);
        expect(db._get(`liveOrderProductsQty/${sid}/product_500/orderedQty`)).toBe(4);
    });
});

// ============================================================
// 7. loadAllProductsFromFirebase — dual-node merge
// ============================================================

describe('loadAllProductsFromFirebase', () => {
    it('merges qty node values over products node (qty is source of truth)', async () => {
        const db = createMockDatabase();
        const sid = 'session_merge';

        // Products node has stale qty values
        db._set(`liveOrderProducts/${sid}/product_600`, {
            Id: 600, NameGet: 'SP600', soldQty: 1, orderedQty: 0
        });
        // Qty node has the real values
        db._set(`liveOrderProductsQty/${sid}/product_600`, {
            soldQty: 10, orderedQty: 5
        });

        const products = await loadAllProductsFromFirebase(db, sid);

        expect(products['product_600'].soldQty).toBe(10);
        expect(products['product_600'].orderedQty).toBe(5);
        expect(products['product_600'].NameGet).toBe('SP600');
    });

    it('returns empty object when no products', async () => {
        const db = createMockDatabase();
        const products = await loadAllProductsFromFirebase(db, 'session_empty');
        expect(products).toEqual({});
    });

    it('falls back to product node values when qty node missing', async () => {
        const db = createMockDatabase();
        const sid = 'session_noqty';

        db._set(`liveOrderProducts/${sid}/product_601`, {
            Id: 601, NameGet: 'SP601', soldQty: 3, orderedQty: 2
        });
        // No qty node entry

        const products = await loadAllProductsFromFirebase(db, sid);
        expect(products['product_601'].soldQty).toBe(3);
        expect(products['product_601'].orderedQty).toBe(2);
    });
});

// ============================================================
// 8. getProductsArray — sorting
// ============================================================

describe('getProductsArray', () => {
    it('sorts by sortedIds when provided', () => {
        const products = {
            'product_1': { Id: 1, NameGet: 'A', addedAt: 100 },
            'product_2': { Id: 2, NameGet: 'B', addedAt: 200 },
            'product_3': { Id: 3, NameGet: 'C', addedAt: 300 }
        };

        const result = getProductsArray(products, ['3', '1', '2']);
        expect(result.map(p => p.Id)).toEqual([3, 1, 2]);
    });

    it('sorts by addedAt descending when no sortedIds', () => {
        const products = {
            'product_1': { Id: 1, addedAt: 100 },
            'product_2': { Id: 2, addedAt: 300 },
            'product_3': { Id: 3, addedAt: 200 }
        };

        const result = getProductsArray(products);
        expect(result.map(p => p.Id)).toEqual([2, 3, 1]);
    });

    it('handles empty sortedIds array (falls back to addedAt)', () => {
        const products = {
            'product_1': { Id: 1, addedAt: 50 },
            'product_2': { Id: 2, addedAt: 150 }
        };

        const result = getProductsArray(products, []);
        expect(result.map(p => p.Id)).toEqual([2, 1]);
    });
});

// ============================================================
// 9. saveCartSnapshot + restoreProductsFromSnapshot — round-trip
// ============================================================

describe('Cart Snapshot round-trip', () => {
    it('save then restore preserves products data', async () => {
        const db = createMockDatabase();
        const sid = 'session_snap';
        const savedAt = 1704067200000;

        const originalProducts = {
            'product_700': {
                Id: 700, NameGet: 'SP700', soldQty: 5, orderedQty: 3,
                QtyAvailable: 20, imageUrl: 'img700.jpg', ProductTmplId: 70,
                ListPrice: 100000, addedAt: 1000, isHidden: false
            },
            'product_701': {
                Id: 701, NameGet: 'SP701', soldQty: 0, orderedQty: 0,
                QtyAvailable: 10, imageUrl: null, ProductTmplId: 71,
                ListPrice: 50000, addedAt: 2000, isHidden: true
            }
        };

        const snapshot = {
            metadata: {
                name: 'Backup 1',
                savedAt: savedAt,
                productCount: 2
            },
            products: JSON.parse(JSON.stringify(originalProducts))
        };

        // Save
        const snapshotId = await saveCartSnapshot(db, sid, snapshot);
        expect(snapshotId).toBe(`snapshot_${savedAt}`);

        // Verify saved in Firebase
        const savedData = db._get(`liveOrderCartHistory/${sid}/${snapshotId}`);
        expect(savedData).toBeDefined();
        expect(savedData.metadata.name).toBe('Backup 1');
        expect(savedData.metadata.productCount).toBe(2);

        // Restore
        const localProducts = {};
        await restoreProductsFromSnapshot(db, sid, snapshot.products, localProducts);

        // Verify restored products match original
        expect(Object.keys(localProducts)).toHaveLength(2);
        expect(localProducts['product_700'].soldQty).toBe(5);
        expect(localProducts['product_700'].orderedQty).toBe(3);
        expect(localProducts['product_700'].NameGet).toBe('SP700');
        expect(localProducts['product_701'].soldQty).toBe(0);
        expect(localProducts['product_701'].orderedQty).toBe(0);

        // Verify qty node also restored
        const qtyNode = db._get(`liveOrderProductsQty/${sid}/product_700`);
        expect(qtyNode.soldQty).toBe(5);
        expect(qtyNode.orderedQty).toBe(3);
    });
});

// ============================================================
// 10. getAllCartSnapshots — sorted by savedAt desc
// ============================================================

describe('getAllCartSnapshots', () => {
    it('returns snapshots sorted by savedAt descending', async () => {
        const db = createMockDatabase();
        const sid = 'session_snaps';

        db._set(`liveOrderCartHistory/${sid}/snapshot_1000`, {
            metadata: { name: 'Old', savedAt: 1000, productCount: 1 },
            products: {}
        });
        db._set(`liveOrderCartHistory/${sid}/snapshot_3000`, {
            metadata: { name: 'Newest', savedAt: 3000, productCount: 3 },
            products: {}
        });
        db._set(`liveOrderCartHistory/${sid}/snapshot_2000`, {
            metadata: { name: 'Middle', savedAt: 2000, productCount: 2 },
            products: {}
        });

        const snapshots = await getAllCartSnapshots(db, sid);
        expect(snapshots).toHaveLength(3);
        expect(snapshots[0].metadata.name).toBe('Newest');
        expect(snapshots[1].metadata.name).toBe('Middle');
        expect(snapshots[2].metadata.name).toBe('Old');
    });
});

// ============================================================
// 11. loadDisplaySettings — defaults and merge
// ============================================================

describe('loadDisplaySettings', () => {
    it('returns defaults when no settings exist', async () => {
        const db = createMockDatabase();
        const settings = await loadDisplaySettings(db, 'session_nosettings');

        expect(settings).toEqual({
            gridColumns: 4,
            gridRows: 2,
            gridGap: 10,
            fontSize: 14
        });
    });

    it('merges with defaults for partial settings', async () => {
        const db = createMockDatabase();
        const sid = 'session_partial';

        db._set(`liveOrderDisplaySettings/${sid}`, {
            gridColumns: 6,
            fontSize: 20
            // gridRows and gridGap missing
        });

        const settings = await loadDisplaySettings(db, sid);
        expect(settings.gridColumns).toBe(6);
        expect(settings.fontSize).toBe(20);
        expect(settings.gridRows).toBe(2);   // default
        expect(settings.gridGap).toBe(10);   // default
    });

    it('returns full settings when all fields present', async () => {
        const db = createMockDatabase();
        const sid = 'session_full';

        db._set(`liveOrderDisplaySettings/${sid}`, {
            gridColumns: 5,
            gridRows: 3,
            gridGap: 15,
            fontSize: 18
        });

        const settings = await loadDisplaySettings(db, sid);
        expect(settings).toEqual({
            gridColumns: 5,
            gridRows: 3,
            gridGap: 15,
            fontSize: 18
        });
    });
});

// ============================================================
// 12. loadSessions — sorted by date descending
// ============================================================

describe('loadSessions', () => {
    it('returns sessions sorted by date descending', async () => {
        const db = createMockDatabase();

        db._set('liveOrderSessions/s1', { name: 'Jan', date: '2024-01-01', createdAt: 100 });
        db._set('liveOrderSessions/s3', { name: 'Mar', date: '2024-03-01', createdAt: 300 });
        db._set('liveOrderSessions/s2', { name: 'Feb', date: '2024-02-01', createdAt: 200 });

        const sessions = await loadSessions(db);
        expect(sessions).toHaveLength(3);
        expect(sessions[0].name).toBe('Mar');
        expect(sessions[1].name).toBe('Feb');
        expect(sessions[2].name).toBe('Jan');
    });

    it('returns empty array when no sessions', async () => {
        const db = createMockDatabase();
        const sessions = await loadSessions(db);
        expect(sessions).toEqual([]);
    });
});

// ============================================================
// 13. deleteCartSnapshot
// ============================================================

describe('deleteCartSnapshot', () => {
    it('removes the specified snapshot', async () => {
        const db = createMockDatabase();
        const sid = 'session_delsnap';

        db._set(`liveOrderCartHistory/${sid}/snapshot_1`, { metadata: { name: 'A' } });
        db._set(`liveOrderCartHistory/${sid}/snapshot_2`, { metadata: { name: 'B' } });

        await deleteCartSnapshot(db, sid, 'snapshot_1');

        expect(db._get(`liveOrderCartHistory/${sid}/snapshot_1`)).toBeUndefined();
        expect(db._get(`liveOrderCartHistory/${sid}/snapshot_2`)).toBeDefined();
    });
});


// ============================================================
// Task 14.2: Unit tests cho search và UI helpers
//
// **Validates: B1.2, B2.2, B6.2, C1.2, C2.3**
//
// Since these are browser-side functions using globals, we replicate
// the pure logic here and test directly.
// ============================================================

// --- Replicated pure functions from main.js ---

function removeVietnameseTones(str) {
    if (!str) return '';
    str = str.toLowerCase();
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
    str = str.replace(/đ/g, 'd');
    return str;
}

function searchProducts(productsData, searchText) {
    if (!searchText || searchText.length < 2) return [];
    const searchLower = searchText.toLowerCase();
    const searchNoSign = removeVietnameseTones(searchText);

    const matched = productsData.filter(product => {
        const matchName = product.nameNoSign.includes(searchNoSign);
        const matchNameOriginal = product.name && product.name.toLowerCase().includes(searchLower);
        const matchCode = product.code && product.code.toLowerCase().includes(searchLower);
        return matchName || matchNameOriginal || matchCode;
    });

    matched.sort((a, b) => {
        const extractBracket = (name) => {
            const match = name?.match(/\[([^\]]+)\]/);
            return match ? match[1].toLowerCase().trim() : '';
        };
        const aBracket = extractBracket(a.name);
        const bBracket = extractBracket(b.name);
        const aMatchBracket = aBracket && aBracket.includes(searchLower);
        const bMatchBracket = bBracket && bBracket.includes(searchLower);
        if (aMatchBracket && !bMatchBracket) return -1;
        if (!aMatchBracket && bMatchBracket) return 1;
        if (aMatchBracket && bMatchBracket) {
            if (aBracket === searchLower && bBracket !== searchLower) return -1;
            if (aBracket !== searchLower && bBracket === searchLower) return 1;
            if (aBracket.length !== bBracket.length) return aBracket.length - bBracket.length;
            return aBracket.localeCompare(bBracket);
        }
        const aMatchCode = a.code && a.code.toLowerCase().includes(searchLower);
        const bMatchCode = b.code && b.code.toLowerCase().includes(searchLower);
        if (aMatchCode && !bMatchCode) return -1;
        if (!aMatchCode && bMatchCode) return 1;
        return a.name.localeCompare(b.name);
    });

    return matched.slice(0, 10);
}

function groupByProductTmplId(products) {
    const groups = {};
    products.forEach(p => {
        const tmplId = p.ProductTmplId || p.Id;
        if (!groups[tmplId]) groups[tmplId] = { products: [], maxAddedAt: 0 };
        groups[tmplId].products.push(p);
        groups[tmplId].maxAddedAt = Math.max(groups[tmplId].maxAddedAt, p.addedAt || 0);
    });
    return groups;
}

function getTotalPages(visibleCount, itemsPerPage) {
    if (itemsPerPage <= 0) return 1;
    return Math.max(1, Math.ceil(visibleCount / itemsPerPage));
}

function computeCssVariables(settings) {
    return {
        '--grid-columns': settings.gridColumns,
        '--grid-rows': settings.gridRows,
        '--grid-gap': `${settings.gridGap}px`,
        '--font-size': `${settings.fontSize}px`
    };
}

// ============================================================
// 14. removeVietnameseTones
// ============================================================

describe('removeVietnameseTones', () => {
    it('converts Vietnamese diacritics to ASCII: "Áo thun" → "ao thun"', () => {
        expect(removeVietnameseTones('Áo thun')).toBe('ao thun');
    });

    it('converts đ to d: "đồng hồ" → "dong ho"', () => {
        expect(removeVietnameseTones('đồng hồ')).toBe('dong ho');
    });

    it('returns empty string for empty input', () => {
        expect(removeVietnameseTones('')).toBe('');
    });

    it('returns empty string for null input', () => {
        expect(removeVietnameseTones(null)).toBe('');
    });

    it('handles all Vietnamese vowel groups', () => {
        expect(removeVietnameseTones('ằ ắ ặ ẳ ẵ')).toBe('a a a a a');
        expect(removeVietnameseTones('ề ế ệ ể ễ')).toBe('e e e e e');
        expect(removeVietnameseTones('ì í ị ỉ ĩ')).toBe('i i i i i');
        expect(removeVietnameseTones('ờ ớ ợ ở ỡ')).toBe('o o o o o');
        expect(removeVietnameseTones('ừ ứ ự ử ữ')).toBe('u u u u u');
        expect(removeVietnameseTones('ỳ ý ỵ ỷ ỹ')).toBe('y y y y y');
    });

    it('lowercases output', () => {
        expect(removeVietnameseTones('ABC')).toBe('abc');
    });
});

// ============================================================
// 15. searchProducts — match by name, code, nameNoSign
// ============================================================

describe('searchProducts', () => {
    const sampleProducts = [
        { id: 1, name: 'Áo thun trắng [AT01]', nameNoSign: 'ao thun trang [at01]', code: 'AT01' },
        { id: 2, name: 'Quần jean xanh', nameNoSign: 'quan jean xanh', code: 'QJ02' },
        { id: 3, name: 'Đồng hồ đeo tay', nameNoSign: 'dong ho deo tay', code: 'DH03' },
        { id: 4, name: 'Túi xách nữ', nameNoSign: 'tui xach nu', code: 'TX04' },
    ];

    it('returns empty for query shorter than 2 chars', () => {
        expect(searchProducts(sampleProducts, 'a')).toEqual([]);
        expect(searchProducts(sampleProducts, '')).toEqual([]);
        expect(searchProducts(sampleProducts, null)).toEqual([]);
    });

    it('matches by original name (case-insensitive)', () => {
        const results = searchProducts(sampleProducts, 'Áo thun');
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results[0].id).toBe(1);
    });

    it('matches by nameNoSign (diacritics-free)', () => {
        const results = searchProducts(sampleProducts, 'dong ho');
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results.some(r => r.id === 3)).toBe(true);
    });

    it('matches by product code', () => {
        const results = searchProducts(sampleProducts, 'QJ02');
        expect(results.length).toBe(1);
        expect(results[0].id).toBe(2);
    });

    it('limits results to 10', () => {
        const manyProducts = Array.from({ length: 20 }, (_, i) => ({
            id: i, name: `Sản phẩm ${i}`, nameNoSign: `san pham ${i}`, code: `SP${i}`
        }));
        const results = searchProducts(manyProducts, 'san pham');
        expect(results.length).toBeLessThanOrEqual(10);
    });
});

// ============================================================
// 16. searchProducts — TPOS search priority ordering
// ============================================================

describe('searchProducts priority ordering', () => {
    it('bracket match comes first, then code match, then name match', () => {
        const products = [
            { id: 1, name: 'Áo thun có chữ abc', nameNoSign: 'ao thun co chu abc', code: 'XYZ' },
            { id: 2, name: 'Quần [abc] special', nameNoSign: 'quan [abc] special', code: 'QQ01' },
            { id: 3, name: 'Giày thể thao', nameNoSign: 'giay the thao', code: 'abc' },
        ];

        const results = searchProducts(products, 'abc');
        // Bracket match (id=2) first, then code match (id=3), then name match (id=1)
        expect(results[0].id).toBe(2);
        expect(results[1].id).toBe(3);
        expect(results[2].id).toBe(1);
    });

    it('exact bracket match beats partial bracket match', () => {
        const products = [
            { id: 1, name: 'SP [abc123]', nameNoSign: 'sp [abc123]', code: '' },
            { id: 2, name: 'SP [abc]', nameNoSign: 'sp [abc]', code: '' },
        ];

        const results = searchProducts(products, 'abc');
        // Exact bracket match (id=2, bracket="abc") before partial (id=1, bracket="abc123")
        expect(results[0].id).toBe(2);
        expect(results[1].id).toBe(1);
    });
});

// ============================================================
// 17. Variant grouping by ProductTmplId
// ============================================================

describe('Variant grouping by ProductTmplId', () => {
    it('groups products with same ProductTmplId together', () => {
        const products = [
            { Id: 1, NameGet: 'Áo S', ProductTmplId: 10, addedAt: 100 },
            { Id: 2, NameGet: 'Áo M', ProductTmplId: 10, addedAt: 200 },
            { Id: 3, NameGet: 'Quần L', ProductTmplId: 20, addedAt: 300 },
        ];

        const groups = groupByProductTmplId(products);
        expect(Object.keys(groups)).toHaveLength(2);
        expect(groups[10].products).toHaveLength(2);
        expect(groups[20].products).toHaveLength(1);
    });

    it('preserves total product count after grouping', () => {
        const products = [
            { Id: 1, ProductTmplId: 10, addedAt: 100 },
            { Id: 2, ProductTmplId: 10, addedAt: 200 },
            { Id: 3, ProductTmplId: 20, addedAt: 300 },
            { Id: 4, ProductTmplId: 30, addedAt: 400 },
        ];

        const groups = groupByProductTmplId(products);
        const totalAfter = Object.values(groups).reduce((sum, g) => sum + g.products.length, 0);
        expect(totalAfter).toBe(products.length);
    });

    it('uses Id as fallback when ProductTmplId is missing', () => {
        const products = [
            { Id: 100, addedAt: 100 },
            { Id: 200, addedAt: 200 },
        ];

        const groups = groupByProductTmplId(products);
        expect(Object.keys(groups)).toHaveLength(2);
        expect(groups[100].products).toHaveLength(1);
        expect(groups[200].products).toHaveLength(1);
    });

    it('tracks maxAddedAt per group', () => {
        const products = [
            { Id: 1, ProductTmplId: 10, addedAt: 100 },
            { Id: 2, ProductTmplId: 10, addedAt: 500 },
            { Id: 3, ProductTmplId: 10, addedAt: 300 },
        ];

        const groups = groupByProductTmplId(products);
        expect(groups[10].maxAddedAt).toBe(500);
    });
});

// ============================================================
// 18. Pagination — getTotalPages
// ============================================================

describe('getTotalPages', () => {
    it('calculates ceil(N / itemsPerPage)', () => {
        expect(getTotalPages(10, 4)).toBe(3);   // ceil(10/4) = 3
        expect(getTotalPages(8, 4)).toBe(2);    // ceil(8/4) = 2
        expect(getTotalPages(9, 4)).toBe(3);    // ceil(9/4) = 3
    });

    it('returns 1 for zero products', () => {
        expect(getTotalPages(0, 8)).toBe(1);
    });

    it('returns 1 when itemsPerPage <= 0', () => {
        expect(getTotalPages(10, 0)).toBe(1);
        expect(getTotalPages(10, -1)).toBe(1);
    });

    it('returns 1 when all products fit on one page', () => {
        expect(getTotalPages(6, 8)).toBe(1);
        expect(getTotalPages(8, 8)).toBe(1);
    });

    it('works with grid-based itemsPerPage (columns × rows)', () => {
        const columns = 4, rows = 2;
        const itemsPerPage = columns * rows; // 8
        expect(getTotalPages(20, itemsPerPage)).toBe(3);  // ceil(20/8) = 3
        expect(getTotalPages(16, itemsPerPage)).toBe(2);  // ceil(16/8) = 2
    });
});

// ============================================================
// 19. CSS mapping — settings → CSS variables
// ============================================================

describe('CSS variable mapping from display settings', () => {
    it('maps gridGap to px string', () => {
        const css = computeCssVariables({ gridColumns: 4, gridRows: 2, gridGap: 10, fontSize: 14 });
        expect(css['--grid-gap']).toBe('10px');
    });

    it('maps fontSize to px string', () => {
        const css = computeCssVariables({ gridColumns: 4, gridRows: 2, gridGap: 10, fontSize: 14 });
        expect(css['--font-size']).toBe('14px');
    });

    it('maps gridColumns as raw number', () => {
        const css = computeCssVariables({ gridColumns: 6, gridRows: 3, gridGap: 5, fontSize: 20 });
        expect(css['--grid-columns']).toBe(6);
    });

    it('maps gridRows as raw number', () => {
        const css = computeCssVariables({ gridColumns: 6, gridRows: 3, gridGap: 5, fontSize: 20 });
        expect(css['--grid-rows']).toBe(3);
    });

    it('handles edge values correctly', () => {
        const css = computeCssVariables({ gridColumns: 1, gridRows: 1, gridGap: 0, fontSize: 8 });
        expect(css['--grid-gap']).toBe('0px');
        expect(css['--font-size']).toBe('8px');
        expect(css['--grid-columns']).toBe(1);
    });
});
