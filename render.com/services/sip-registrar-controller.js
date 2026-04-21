// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// SIP Registrar Controller — handoff logic giữa browser widget và server
// - Browser widget register ext X (phone_presence.state != 'offline') → server KHÔNG register ext X
// - Không ai register ext X → server register ext X (dashboard PBX vẫn xanh)
// - User mở widget → server ngắt registration ext đó (handoff)

const { SipRegistrarPool } = require('./sip-registrar');

const MODULE = '[SIP-CTRL]';
const RECONCILE_INTERVAL_MS = 15000; // 15s
const PRESENCE_FRESHNESS_MS = 90000; // presence coi như "active" nếu updated_at <90s trước

class SipRegistrarController {
    constructor(db) {
        this.db = db;
        this.pool = new SipRegistrarPool();
        this.enabled = false;
        this.reconcileTimer = null;
        this.lastReconcileAt = null;
        this.lastError = null;
        this.extensions = [];
    }

    async start() {
        if (this.enabled) return;
        this.enabled = true;
        console.log(`${MODULE} starting — server-side registrar enabled`);
        await this._loadExtensions();
        await this._reconcile();
        this.reconcileTimer = setInterval(() => this._reconcile().catch(err => {
            this.lastError = err.message;
            console.warn(`${MODULE} reconcile error:`, err.message);
        }), RECONCILE_INTERVAL_MS);
    }

    async stop() {
        this.enabled = false;
        if (this.reconcileTimer) { clearInterval(this.reconcileTimer); this.reconcileTimer = null; }
        await this.pool.removeAll();
        console.log(`${MODULE} stopped — server-side registrar disabled`);
    }

    async _loadExtensions() {
        try {
            const r = await this.db.query(`SELECT value FROM phone_config WHERE key = 'sip_extensions'`);
            if (r.rows.length && r.rows[0].value) {
                const v = r.rows[0].value;
                this.extensions = typeof v === 'string' ? JSON.parse(v) : v;
            } else {
                this.extensions = [];
            }
        } catch (err) {
            console.error(`${MODULE} loadExtensions error:`, err.message);
            this.extensions = [];
        }
    }

    async _loadActivePresenceExts() {
        // Trả về Set các ext mà browser widget đang giữ registration
        try {
            const cutoff = Date.now() - PRESENCE_FRESHNESS_MS;
            const r = await this.db.query(
                `SELECT ext, state, updated_at FROM phone_presence
                 WHERE ext IS NOT NULL
                   AND state IN ('registered', 'ringing', 'in-call', 'calling')
                   AND (EXTRACT(EPOCH FROM updated_at) * 1000) > $1`,
                [cutoff]
            );
            const s = new Set();
            r.rows.forEach(row => { if (row.ext) s.add(String(row.ext)); });
            return s;
        } catch (err) {
            console.warn(`${MODULE} loadActivePresenceExts error:`, err.message);
            return new Set();
        }
    }

    async _reconcile() {
        if (!this.enabled) return;
        this.lastReconcileAt = Date.now();

        // Reload extensions config periodically (in case admin update credentials)
        await this._loadExtensions();
        if (!this.extensions.length) return;

        const activeFromBrowsers = await this._loadActivePresenceExts();
        const currentlyHeld = new Set(this.pool.regs.keys());

        // Targets: exts NOT in activeFromBrowsers → server should hold
        const desired = new Set();
        this.extensions.forEach(e => {
            if (!activeFromBrowsers.has(String(e.ext))) desired.add(String(e.ext));
        });

        // Add new
        for (const e of this.extensions) {
            if (desired.has(String(e.ext)) && !currentlyHeld.has(String(e.ext))) {
                if (!e.authId || !e.password) continue; // skip configured-but-incomplete
                await this.pool.add({ ext: e.ext, authId: e.authId, password: e.password });
                console.log(`${MODULE} ext ${e.ext} → server hold (no browser)`);
            }
        }
        // Remove — browser took over
        for (const ext of Array.from(currentlyHeld)) {
            if (!desired.has(String(ext))) {
                await this.pool.remove(ext);
                console.log(`${MODULE} ext ${ext} → browser took over, release server hold`);
            }
        }
    }

    getStatus() {
        return {
            enabled: this.enabled,
            lastReconcileAt: this.lastReconcileAt,
            lastError: this.lastError,
            heldExts: this.pool.getStatuses(),
            extensionCount: this.extensions.length
        };
    }
}

module.exports = { SipRegistrarController };
