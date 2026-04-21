// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// Hand-rolled SIP Registrar — keep exts registered 24/7 on Render server
// Giới hạn: Contact header không reachable từ PBX do NAT → REGISTER OK nhưng incoming INVITE
// có thể không đến. Dùng để giữ dashboard OnCallCX xanh. Cuộc gọi thật vẫn qua browser widget.

const dgram = require('dgram');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const MODULE = '[SIP-REG]';
const DEFAULT_PBX = 'pbx-ucaas.oncallcx.vn';
const DEFAULT_PORT = 9060;

function md5(s) { return crypto.createHash('md5').update(s).digest('hex'); }
function randHex(n = 8) { return crypto.randomBytes(n).toString('hex'); }

class SipRegistrar extends EventEmitter {
    constructor({ ext, authId, password, domain = DEFAULT_PBX, port = DEFAULT_PORT, expires = 120 }) {
        super();
        this.ext = ext;
        this.authId = authId;
        this.password = password;
        this.domain = domain;
        this.port = port;
        this.expires = expires;
        this.socket = null;
        this.localPort = 0;
        this.cseq = 1;
        this.callId = `${randHex(8)}@n2store-reg`;
        this.fromTag = randHex(4);
        this.registered = false;
        this.lastRegisterAt = null;
        this.lastError = null;
        this.refreshTimer = null;
        this.retryTimer = null;
        this.retryAttempt = 0;
        this.realm = null;
        this.nonce = null;
        this.qop = null;
        this.sentCount = 0;
        this.rxCount = 0;
        this.stopped = false;
    }

    async start() {
        if (this.socket) return;
        this.stopped = false;
        this.socket = dgram.createSocket('udp4');
        this.socket.on('message', (msg) => this._handle(msg.toString('utf8')));
        this.socket.on('error', (err) => { this.lastError = err.message; this.emit('error', err); });
        await new Promise((resolve, reject) => {
            this.socket.once('error', reject);
            this.socket.bind(0, '0.0.0.0', resolve);
        });
        this.localPort = this.socket.address().port;
        console.log(`${MODULE} ext ${this.ext} socket bound to port ${this.localPort}`);
        this._sendRegister(false);
    }

    async stop() {
        this.stopped = true;
        if (this.refreshTimer) { clearTimeout(this.refreshTimer); this.refreshTimer = null; }
        if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
        if (!this.socket) return;
        // Send un-register (expires=0)
        if (this.registered) {
            try {
                this.expires = 0;
                this._sendRegister(true);
                await new Promise(r => setTimeout(r, 300));
            } catch {}
        }
        try { this.socket.close(); } catch {}
        this.socket = null;
        this.registered = false;
    }

    _buildUri() { return `sip:${this.domain}`; }
    _buildFromTo() { return `"${this.ext}" <sip:${this.ext}@${this.domain}>`; }
    _buildContact() { return `<sip:${this.authId}@0.0.0.0:${this.localPort};transport=udp;ob>`; }

    _sendRegister(withAuth) {
        if (this.stopped || !this.socket) return;
        const branch = 'z9hG4bK-' + randHex(6);
        const uri = this._buildUri();
        const fromTo = this._buildFromTo();
        const contact = this._buildContact();

        const lines = [
            `REGISTER ${uri} SIP/2.0`,
            `Via: SIP/2.0/UDP 0.0.0.0:${this.localPort};branch=${branch};rport`,
            `Max-Forwards: 70`,
            `From: ${fromTo};tag=${this.fromTag}`,
            `To: ${fromTo}`,
            `Call-ID: ${this.callId}`,
            `CSeq: ${this.cseq++} REGISTER`,
            `Contact: ${contact};expires=${this.expires}`,
            `Expires: ${this.expires}`,
            `Supported: path, outbound`,
            `User-Agent: N2Store-Registrar/1.0`,
            `Allow: INVITE, ACK, CANCEL, BYE, OPTIONS, INFO, MESSAGE, NOTIFY, REFER`,
        ];

        if (withAuth && this.nonce && this.realm) {
            const ha1 = md5(`${this.authId}:${this.realm}:${this.password}`);
            const ha2 = md5(`REGISTER:${uri}`);
            let authLine;
            if (this.qop) {
                const cnonce = randHex(4);
                const nc = '00000001';
                const response = md5(`${ha1}:${this.nonce}:${nc}:${cnonce}:${this.qop}:${ha2}`);
                authLine = `Authorization: Digest username="${this.authId}", realm="${this.realm}", nonce="${this.nonce}", uri="${uri}", response="${response}", algorithm=MD5, qop=${this.qop}, nc=${nc}, cnonce="${cnonce}"`;
            } else {
                const response = md5(`${ha1}:${this.nonce}:${ha2}`);
                authLine = `Authorization: Digest username="${this.authId}", realm="${this.realm}", nonce="${this.nonce}", uri="${uri}", response="${response}", algorithm=MD5`;
            }
            lines.push(authLine);
        }

        lines.push('Content-Length: 0', '', '');
        const msg = lines.join('\r\n');
        try {
            this.socket.send(msg, this.port, this.domain);
            this.sentCount++;
        } catch (err) {
            this.lastError = 'Send error: ' + err.message;
        }
    }

    _handle(msg) {
        this.rxCount++;
        const firstLine = (msg.split('\r\n')[0] || '');
        const respMatch = firstLine.match(/^SIP\/2\.0\s+(\d+)\s+(.+)/);
        if (respMatch) {
            this._handleResponse(parseInt(respMatch[1], 10), respMatch[2].trim(), msg);
        } else {
            const reqMatch = firstLine.match(/^(\w+)\s+(\S+)\s+SIP\/2\.0/);
            if (reqMatch) this._handleRequest(reqMatch[1], msg);
        }
    }

    _handleResponse(code, reason, msg) {
        if (code === 401 || code === 407) {
            // Extract auth challenge
            const authHeader = msg.split('\r\n').find(l =>
                /^(WWW-Authenticate|Proxy-Authenticate):/i.test(l)
            );
            if (!authHeader) { this.lastError = 'No auth header'; return; }
            const line = authHeader.replace(/^[^:]+:\s*/, '');
            this.realm = (line.match(/realm="([^"]+)"/) || [])[1];
            this.nonce = (line.match(/nonce="([^"]+)"/) || [])[1];
            this.qop = (line.match(/qop="?([^",\s]+)/) || [])[1];
            if (!this.realm || !this.nonce) { this.lastError = 'Malformed auth'; return; }
            this._sendRegister(true);
        } else if (code === 200) {
            const wasRegistered = this.registered;
            this.registered = this.expires > 0;
            this.lastRegisterAt = Date.now();
            this.lastError = null;
            this.retryAttempt = 0;
            if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
            if (this.registered && !wasRegistered) {
                console.log(`${MODULE} ext ${this.ext} REGISTERED`);
                this.emit('registered');
            } else if (!this.registered && wasRegistered) {
                this.emit('unregistered');
            }
            if (this.refreshTimer) clearTimeout(this.refreshTimer);
            if (this.expires > 0 && !this.stopped) {
                const refreshIn = Math.max(30, this.expires - 15) * 1000;
                this.refreshTimer = setTimeout(() => this._sendRegister(true), refreshIn);
            }
        } else if (code === 403 || code === 404) {
            // Permanent failure — don't retry
            this.registered = false;
            this.lastError = `${code} ${reason}`;
            console.error(`${MODULE} ext ${this.ext} permanent failure: ${code} ${reason}`);
            this.emit('failed', this.lastError);
        } else {
            this.lastError = `${code} ${reason}`;
            this.registered = false;
            this.emit('failed', this.lastError);
            this._scheduleRetry();
        }
    }

    _scheduleRetry() {
        if (this.stopped) return;
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryAttempt++;
        const delay = Math.min(5000 * Math.pow(2, Math.min(this.retryAttempt - 1, 5)), 60000);
        console.log(`${MODULE} ext ${this.ext} retry #${this.retryAttempt} in ${Math.round(delay/1000)}s`);
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            // Reset auth state to force fresh challenge
            this.nonce = null; this.realm = null; this.qop = null;
            this._sendRegister(false);
        }, delay);
    }

    _handleRequest(method, msg) {
        // Respond to incoming SIP requests. For REGISTER-only mode, reject INVITE with 486.
        let statusCode = 200, statusMsg = 'OK';
        if (method === 'INVITE') {
            statusCode = 486; statusMsg = 'Busy Here';
            console.log(`${MODULE} ext ${this.ext} incoming INVITE → 486`);
            this.emit('incoming-rejected');
        }

        const lines = msg.split('\r\n');
        const pickHeader = (name) => {
            const rx = new RegExp(`^${name}:`, 'i');
            return lines.find(l => rx.test(l));
        };
        const via = pickHeader('Via') || '';
        const from = pickHeader('From') || '';
        let to = pickHeader('To') || '';
        if (to && !/;tag=/i.test(to)) to += `;tag=${randHex(4)}`;
        const callId = pickHeader('Call-ID') || '';
        const cseq = pickHeader('CSeq') || '';

        const response = [
            `SIP/2.0 ${statusCode} ${statusMsg}`,
            via, from, to, callId, cseq,
            'User-Agent: N2Store-Registrar/1.0',
            'Content-Length: 0',
            '',
            ''
        ].join('\r\n');
        try { this.socket.send(response, this.port, this.domain); } catch {}
    }

    getStatus() {
        return {
            ext: this.ext,
            registered: this.registered,
            lastRegisterAt: this.lastRegisterAt,
            lastError: this.lastError,
            localPort: this.localPort,
            sent: this.sentCount,
            rx: this.rxCount,
            retryAttempt: this.retryAttempt
        };
    }
}

class SipRegistrarPool {
    constructor() {
        this.regs = new Map();
        this.enabled = false;
    }

    async add({ ext, authId, password, domain, port }) {
        if (this.regs.has(ext)) return this.regs.get(ext);
        const r = new SipRegistrar({ ext, authId, password, domain, port });
        this.regs.set(ext, r);
        try { await r.start(); } catch (err) { console.error(`${MODULE} add ${ext} failed:`, err.message); }
        return r;
    }

    async remove(ext) {
        const r = this.regs.get(ext); if (!r) return;
        await r.stop();
        this.regs.delete(ext);
    }

    async removeAll() {
        for (const ext of Array.from(this.regs.keys())) await this.remove(ext);
    }

    getStatuses() {
        return Array.from(this.regs.values()).map(r => r.getStatus());
    }

    isRegistered(ext) {
        const r = this.regs.get(ext);
        return r?.registered || false;
    }
}

module.exports = { SipRegistrar, SipRegistrarPool };
