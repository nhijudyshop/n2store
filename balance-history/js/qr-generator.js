// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// QR CODE GENERATOR FOR BANK TRANSFERS — VietQR EMVCo
// =====================================================
// Builds the EMVCo TLV payload locally with Point of Initiation Method = "11"
// (static QR) so banking apps allow the user to EDIT amount + addInfo after
// scanning. Renders the QR client-side via qrcode-generator (no vietqr.io).

const QRGenerator = {
    // Bank configuration
    BANK_CONFIG: {
        ACB: {
            bin: '970416',
            name: 'ACB',
            accountNo: '75918',
            accountName: 'LAI THUY YEN NHI',
        },
    },

    /**
     * Build a single EMVCo Tag-Length-Value chunk.
     * Length is 2-digit decimal byte length. VietQR keeps everything ASCII so
     * char length == byte length.
     */
    _tlv(id, value) {
        const v = String(value);
        const len = v.length.toString().padStart(2, '0');
        return `${id}${len}${v}`;
    },

    /**
     * CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, no XOR-out, no reflect).
     * EMVCo / VietQR specifies this exact variant for ID 63.
     */
    _crc16ccitt(str) {
        let crc = 0xffff;
        for (let i = 0; i < str.length; i++) {
            crc ^= str.charCodeAt(i) << 8;
            for (let j = 0; j < 8; j++) {
                crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
                crc &= 0xffff;
            }
        }
        return crc.toString(16).toUpperCase().padStart(4, '0');
    },

    /**
     * Build VietQR EMVCo payload string.
     *
     * @param {Object} opts
     * @param {string} opts.bin            BIN/Acquirer ID (vd "970416" cho ACB)
     * @param {string} opts.accountNo      Số tài khoản
     * @param {number} [opts.amount=0]     Số tiền (0 = không gắn — khách tự nhập)
     * @param {string} [opts.addInfo=""]   Mã giao dịch / nội dung CK
     * @param {boolean} [opts.isStatic=true]  true => PIM "11" (cho phép sửa trong app bank);
     *                                        false => PIM "12" (khoá field)
     * @returns {string} Chuỗi EMVCo (đã có CRC)
     */
    buildVietQRPayload(opts) {
        const { bin, accountNo, amount = 0, addInfo = '', isStatic = true } = opts;

        const pim = isStatic ? '11' : '12';

        // ID 38 — Merchant Account Information (NAPAS GUID + acquirer + service)
        const merchantAccountInfo =
            this._tlv('00', 'A000000727') +
            this._tlv('01', this._tlv('00', bin) + this._tlv('01', accountNo)) +
            this._tlv('02', 'QRIBFTTA'); // chuyển khoản tới tài khoản

        let payload =
            this._tlv('00', '01') + // Payload Format Indicator
            this._tlv('01', pim) + // Point of Initiation Method
            this._tlv('38', merchantAccountInfo) +
            this._tlv('53', '704'); // Currency = VND

        if (amount > 0) {
            payload += this._tlv('54', String(amount));
        }

        payload += this._tlv('58', 'VN'); // Country

        if (addInfo) {
            // ID 62 → 08 = Bill Number / Reference (nội dung CK auto-match)
            payload += this._tlv('62', this._tlv('08', addInfo));
        }

        // CRC field: append id+len ("6304") then compute CRC over everything
        const beforeCrc = payload + '6304';
        return beforeCrc + this._crc16ccitt(beforeCrc);
    },

    /**
     * Render an EMVCo string to a QR image data URL via qrcode-generator.
     *
     * @param {string} text   EMVCo payload
     * @param {Object} [opts]
     * @param {number} [opts.cellSize=8]   Pixel size of each QR module
     * @param {number} [opts.margin=4]     Quiet-zone modules
     * @param {string} [opts.ecLevel='M']  Error correction: L | M | Q | H
     * @returns {string} GIF data URL (browser-compatible, works in <img src>)
     */
    renderQRDataURL(text, opts = {}) {
        const { cellSize = 8, margin = 4, ecLevel = 'M' } = opts;

        if (typeof window === 'undefined' || typeof window.qrcode !== 'function') {
            throw new Error('qrcode-generator library not loaded');
        }

        const qr = window.qrcode(0, ecLevel); // type 0 = auto-detect version
        qr.addData(text);
        qr.make();
        return qr.createDataURL(cellSize, margin);
    },

    /**
     * Generate a unique transaction code.
     * Format: N2 + 16 chars base36 → tổng 18 ký tự. Trùng với regex auto-match
     * /N2[A-Z0-9]{16}/ ở processDebtUpdate.
     */
    generateUniqueCode(prefix = 'N2') {
        const timestamp = Date.now().toString(36).toUpperCase().slice(-8);
        const random = Math.random().toString(36).substring(2, 8).toUpperCase();
        const sequence = Math.floor(Math.random() * 1296)
            .toString(36)
            .toUpperCase()
            .padStart(2, '0');
        return `${prefix}${timestamp}${random}${sequence}`;
    },

    /**
     * Build a VietQR data URL the page can drop into <img src="...">.
     *
     * @param {Object} options
     * @param {string} options.uniqueCode
     * @param {number} [options.amount=0]
     * @returns {string} data:image/gif;base64,...
     */
    generateVietQRUrl(options = {}) {
        const { uniqueCode, amount = 0 } = options;
        const bank = this.BANK_CONFIG.ACB;

        const payload = this.buildVietQRPayload({
            bin: bank.bin,
            accountNo: bank.accountNo,
            amount,
            addInfo: uniqueCode,
            isStatic: true, // PIM "11" → bank app cho phép user sửa amount + addInfo
        });

        return this.renderQRDataURL(payload);
    },

    /**
     * Generate QR code data for a new deposit.
     */
    generateDepositQR(amount = 0) {
        const uniqueCode = this.generateUniqueCode();
        const qrUrl = this.generateVietQRUrl({ uniqueCode, amount });

        return {
            uniqueCode,
            qrUrl,
            bankInfo: {
                bank: this.BANK_CONFIG.ACB.name,
                accountNo: this.BANK_CONFIG.ACB.accountNo,
                accountName: this.BANK_CONFIG.ACB.accountName,
            },
            amount,
            createdAt: new Date().toISOString(),
        };
    },

    /**
     * Re-build QR for an existing unique code.
     */
    regenerateQR(uniqueCode, amount = 0) {
        const qrUrl = this.generateVietQRUrl({ uniqueCode, amount });

        return {
            uniqueCode,
            qrUrl,
            bankInfo: {
                bank: this.BANK_CONFIG.ACB.name,
                accountNo: this.BANK_CONFIG.ACB.accountNo,
                accountName: this.BANK_CONFIG.ACB.accountName,
            },
            amount,
        };
    },

    /**
     * Copy QR URL to clipboard. With static QR generated locally this is a
     * data URL — still copies fine, just pastes a long base64 string.
     */
    async copyQRUrl(qrUrl) {
        try {
            await navigator.clipboard.writeText(qrUrl);
            return true;
        } catch (error) {
            console.error('Failed to copy QR URL:', error);
            try {
                const textarea = document.createElement('textarea');
                textarea.value = qrUrl;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                return true;
            } catch (fallbackError) {
                console.error('Fallback copy also failed:', fallbackError);
                return false;
            }
        }
    },

    async copyUniqueCode(uniqueCode) {
        try {
            await navigator.clipboard.writeText(uniqueCode);
            return true;
        } catch (error) {
            console.error('Failed to copy unique code:', error);
            return false;
        }
    },

    /**
     * Download QR code image. Works for both http(s) URLs and data: URLs.
     */
    async downloadQRImage(qrUrl, filename = 'qr-code.png') {
        try {
            const response = await fetch(qrUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            return true;
        } catch (error) {
            console.error('Failed to download QR image:', error);
            return false;
        }
    },

    /**
     * Inline QR display HTML (used by some callers).
     */
    createQRHtml(qrUrl, options = {}) {
        const { width = '200px', showCopyButton = true, uniqueCode = '' } = options;

        return `
            <div class="qr-code-container" style="text-align: center;">
                <img src="${qrUrl}" alt="QR Code" style="width: ${width}; max-width: 100%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                ${
                    showCopyButton
                        ? `
                    <div style="margin-top: 10px; display: flex; gap: 8px; justify-content: center;">
                        <button class="btn btn-sm btn-secondary copy-qr-btn" data-qr-url="${qrUrl}">
                            <i data-lucide="copy"></i> Copy URL
                        </button>
                        ${
                            uniqueCode
                                ? `
                            <button class="btn btn-sm btn-secondary copy-code-btn" data-code="${uniqueCode}">
                                <i data-lucide="hash"></i> Copy Mã
                            </button>
                        `
                                : ''
                        }
                    </div>
                `
                        : ''
                }
            </div>
        `;
    },
};

window.QRGenerator = QRGenerator;
