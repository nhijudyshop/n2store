// Decoding Utility for TPOS Orders
// Shared logic for decoding and formatting encoded product strings in notes

(function (window) {
    'use strict';

    const ENCODE_KEY = 'live';
    const BASE_TIME = 1704067200000; // 2024-01-01 00:00:00 UTC

    /**
     * Base64URL decode
     */
    function base64UrlDecode(str) {
        const padding = '='.repeat((4 - str.length % 4) % 4);
        const base64 = str.replace(/-/g, '+').replace(/_/g, '/') + padding;
        const binary = atob(base64);
        return new TextDecoder().decode(
            Uint8Array.from(binary, c => c.charCodeAt(0))
        );
    }

    /**
     * XOR decryption with key
     */
    function xorDecrypt(encoded, key) {
        // Decode from base64
        const encrypted = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
        const keyBytes = new TextEncoder().encode(key);
        const decrypted = new Uint8Array(encrypted.length);

        for (let i = 0; i < encrypted.length; i++) {
            decrypted[i] = encrypted[i] ^ keyBytes[i % keyBytes.length];
        }

        return new TextDecoder().decode(decrypted);
    }

    /**
     * Generate short checksum (6 characters)
     */
    function shortChecksum(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(36).substring(0, 6);
    }

    /**
     * Decode product line
     */
    function decodeProductLine(encoded) {
        try {
            // Detect format
            const isNewFormat = encoded.includes('-') || encoded.includes('_') || (!encoded.includes('+') && !encoded.includes('/') && !encoded.includes('='));

            if (isNewFormat) {
                // ===== NEW FORMAT =====
                try {
                    const decrypted = base64UrlDecode(encoded);
                    const fullData = xorDecrypt(decrypted, ENCODE_KEY);
                    const parts = fullData.split(',');

                    if (parts.length !== 6) throw new Error('Not new format');

                    const [orderId, productCode, quantity, price, relativeTime, checksum] = parts;

                    // Verify checksum
                    const data = `${orderId},${productCode},${quantity},${price},${relativeTime}`;
                    if (checksum !== shortChecksum(data)) return null;

                    const timestamp = parseInt(relativeTime) * 1000 + BASE_TIME;

                    return {
                        orderId: orderId, // Keep as string (GUID support)
                        productCode,
                        quantity: parseInt(quantity),
                        price: parseFloat(price),
                        timestamp,
                        format: 'NEW'
                    };
                } catch (e) {
                    // Fallback to old format
                }
            }

            // ===== OLD FORMAT =====
            const decoded = xorDecrypt(encoded, ENCODE_KEY);
            const parts = decoded.split('|');

            if (parts.length !== 3 && parts.length !== 4) return null;

            const result = {
                productCode: parts[0],
                quantity: parseInt(parts[1]),
                price: parseFloat(parts[2]),
                format: 'OLD'
            };

            if (parts.length === 4) {
                result.timestamp = parseInt(parts[3]);
            }

            return result;
        } catch (error) {
            return null;
        }
    }

    /**
     * Format note text with decoded data
     * @param {string} noteText - Original note text
     * @returns {string} HTML string with decoded info
     */
    function formatNoteWithDecodedData(noteText) {
        if (!noteText) return '';

        // Escape HTML to prevent XSS before processing
        const escapeHtml = (text) => {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        };

        const safeNote = escapeHtml(noteText);
        const lines = safeNote.split('\n');

        return lines.map(line => {
            const trimmed = line.trim();
            // Try to decode each line
            // Check if line looks like it might be encoded (no spaces, reasonable length)
            if (trimmed.length > 20 && !trimmed.includes(' ')) {
                const decoded = decodeProductLine(trimmed);
                if (decoded) {
                    const timeStr = decoded.timestamp ? new Date(decoded.timestamp).toLocaleString('vi-VN') : '';
                    const priceStr = (decoded.price || 0).toLocaleString('vi-VN') + 'đ';

                    let decodedHtml = `
                        <div class="decoded-note-block" style="
                            background: #f0f9ff; 
                            border: 1px solid #bae6fd; 
                            border-radius: 4px; 
                            padding: 6px 10px; 
                            margin-top: 4px; 
                            font-size: 12px; 
                            color: #0369a1;
                            display: inline-block;
                        ">
                            <div style="font-weight: 600; display: flex; align-items: center; gap: 6px;">
                                <i class="fas fa-box-open"></i> ${decoded.productCode}
                                <span style="background: #0ea5e9; color: white; padding: 1px 6px; border-radius: 10px; font-size: 10px;">x${decoded.quantity}</span>
                            </div>
                            <div style="display: flex; gap: 10px; margin-top: 2px; color: #0284c7;">
                                <span><i class="fas fa-tag"></i> ${priceStr}</span>
                                ${timeStr ? `<span><i class="far fa-clock"></i> ${timeStr}</span>` : ''}
                            </div>
                            ${decoded.orderId ? `
                            <div style="margin-top: 2px; font-size: 11px; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 2px;">
                                ID: <span style="font-family: monospace;">${decoded.orderId}</span>
                            </div>` : ''}
                        </div>
                    `;
                    return `<div class="original-encoded-text" style="color: #94a3b8; font-size: 11px; text-decoration: line-through;">${trimmed}</div>${decodedHtml}`;
                }
            }
            return line;
        }).join('<br>');
    }

    // Expose to window
    window.DecodingUtility = {
        decodeProductLine,
        formatNoteWithDecodedData
    };

})(window);
