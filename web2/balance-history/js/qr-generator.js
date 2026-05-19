// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// QR CODE GENERATOR FOR BANK TRANSFERS — VietQR
// =====================================================
// Image rendered via vietqr.io's `compact2` template (full VietQR branding:
// logo + tên ngân hàng + số tài khoản + tên CTK). With amount=0 vietqr.io
// emits PIM="11" (Static QR per EMVCo spec) → bank app cho user sửa amount +
// addInfo khi scan.
//
// `buildVietQRPayload()` + `_crc16ccitt()` được giữ lại để debug / decode
// QR cho mục đích sau (nếu cần render hoàn toàn offline).

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
     * Build VietQR EMVCo payload string (utility for debug / offline render).
     */
    buildVietQRPayload(opts) {
        const { bin, accountNo, amount = 0, addInfo = '', isStatic = true } = opts;
        const pim = isStatic ? '11' : '12';

        const merchantAccountInfo =
            this._tlv('00', 'A000000727') +
            this._tlv('01', this._tlv('00', bin) + this._tlv('01', accountNo)) +
            this._tlv('02', 'QRIBFTTA');

        let payload =
            this._tlv('00', '01') +
            this._tlv('01', pim) +
            this._tlv('38', merchantAccountInfo) +
            this._tlv('53', '704');

        if (amount > 0) payload += this._tlv('54', String(amount));
        payload += this._tlv('58', 'VN');
        if (addInfo) payload += this._tlv('62', this._tlv('08', addInfo));

        const beforeCrc = payload + '6304';
        return beforeCrc + this._crc16ccitt(beforeCrc);
    },

    /**
     * Generate a unique transaction code (N2 + 16 base36 chars). Khớp regex
     * auto-match `/N2[A-Z0-9]{16}/` ở processDebtUpdate.
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
     * Build vietqr.io image URL with full branded template (logo + bank info).
     *
     * Template `compact2` = full VietQR look (logo VietQR + ngân hàng + STK +
     * tên CTK in dưới QR). When `amount` is 0/omitted vietqr.io trả về QR
     * EMVCo PIM="11" → bank app spec-compliant cho user sửa fields.
     */
    generateVietQRUrl(options = {}) {
        const { uniqueCode, amount = 0, template = 'compact2' } = options;
        const bank = this.BANK_CONFIG.ACB;
        const baseUrl = 'https://img.vietqr.io/image';

        const url = `${baseUrl}/${bank.bin}-${bank.accountNo}-${template}.png`;
        const params = new URLSearchParams();
        if (amount > 0) params.append('amount', amount);
        params.append('addInfo', uniqueCode);
        params.append('accountName', bank.accountName);

        return `${url}?${params.toString()}`;
    },

    /**
     * Generate QR data for a new deposit.
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
     * Download QR code image (works for both http URLs and data URLs).
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
