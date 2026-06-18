// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// PANCAKE TOKEN CODEC (Web 2.0 live-chat) — PURE helpers (no instance state)
// =====================================================
// Tách từ pancake-token-manager.js (2026-06-18, MOVE-only): base64url decode,
// JWT payload parse, expiry check (safety margin). Các hàm nhận đối số tường
// minh, KHÔNG dùng `this`. PancakeTokenManager delegate sang module này.
// =====================================================

(function (window) {
    'use strict';

    const PancakeTokenCodec = {
        /**
         * Decode base64url (JWT uses base64url encoding)
         * @param {string} str - Base64url encoded string
         * @returns {string} - Decoded string with proper UTF-8 handling
         */
        base64UrlDecode(str) {
            try {
                if (!str || typeof str !== 'string') {
                    throw new Error('Input must be a non-empty string');
                }

                // Replace URL-safe characters with standard base64 characters
                let base64 = str.replace(/-/g, '+').replace(/_/g, '/');

                // Add padding if needed
                const pad = base64.length % 4;
                if (pad) {
                    if (pad === 1) {
                        throw new Error('Invalid base64url string length');
                    }
                    base64 += '='.repeat(4 - pad);
                }

                // Validate base64 characters (should only contain A-Z, a-z, 0-9, +, /, =)
                const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
                if (!base64Regex.test(base64)) {
                    throw new Error('Invalid characters in base64 string');
                }

                // Decode base64 to binary string
                const binaryString = atob(base64);

                // Convert binary string to UTF-8 string
                // atob() returns a string where each character represents a byte
                // We need to decode it as UTF-8
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }

                // Decode UTF-8 bytes to proper string
                const decoded = new TextDecoder('utf-8').decode(bytes);
                return decoded;
            } catch (error) {
                console.error('[PANCAKE-TOKEN] Base64 decode error:', error.message);
                console.error('[PANCAKE-TOKEN] Input string:', str?.substring(0, 50) + '...');
                throw error;
            }
        },

        /**
         * Decode JWT token để lấy expiry time
         * @param {string} token - JWT token
         * @returns {Object} { exp, uid, name, ... }
         */
        decodeToken(token) {
            try {
                if (!token || typeof token !== 'string') {
                    console.error('[PANCAKE-TOKEN] Token must be a string');
                    return null;
                }

                const parts = token.split('.');
                if (parts.length !== 3) {
                    console.error('[PANCAKE-TOKEN] Token must have 3 parts, got:', parts.length);
                    return null;
                }

                // Decode payload (second part)
                const payloadBase64 = parts[1];

                if (!payloadBase64 || payloadBase64.length === 0) {
                    console.error('[PANCAKE-TOKEN] Payload part is empty');
                    return null;
                }

                const payloadJson = this.base64UrlDecode(payloadBase64);
                const payload = JSON.parse(payloadJson);
                return payload;
            } catch (error) {
                console.error('[PANCAKE-TOKEN] Error decoding token:', error.message);
                console.error('[PANCAKE-TOKEN] Error type:', error.name);
                console.error('[PANCAKE-TOKEN] Token length:', token?.length);
                console.error('[PANCAKE-TOKEN] Token starts with:', token?.substring(0, 20));
                console.error(
                    '[PANCAKE-TOKEN] Token ends with:',
                    token?.substring(token.length - 20)
                );

                // Check for common issues
                if (token.includes(' ')) {
                    console.error(
                        '[PANCAKE-TOKEN] ⚠️ Token contains spaces - this should not happen after cleaning'
                    );
                }
                if (token.includes('\n') || token.includes('\r')) {
                    console.error(
                        '[PANCAKE-TOKEN] ⚠️ Token contains newlines - this should not happen after cleaning'
                    );
                }

                return null;
            }
        },

        /**
         * Check if token is expired
         * @param {number} exp - Expiry timestamp (seconds)
         * @returns {boolean}
         */
        isTokenExpired(exp) {
            if (!exp) return true;
            const now = Math.floor(Date.now() / 1000); // Convert to seconds
            const buffer = 60 * 60; // 1 hour buffer
            return now >= exp - buffer;
        },

        /**
         * Clean a raw token string: strip jwt= prefix, quotes, whitespace, and
         * trailing punctuation. Pure string ops.
         * @param {string} token - Raw token input
         * @returns {string} - Cleaned token
         */
        cleanToken(token) {
            // Clean token - trim whitespace and newlines
            let cleanedToken = token.trim();

            // Remove jwt= prefix if exists (case insensitive)
            if (cleanedToken.toLowerCase().startsWith('jwt=')) {
                cleanedToken = cleanedToken.substring(4).trim();
            }

            // Remove quotes if present
            cleanedToken = cleanedToken.replace(/^["']|["']$/g, '');

            // Remove any whitespace, tabs, newlines within the token
            cleanedToken = cleanedToken.replace(/\s+/g, '');

            // Remove trailing semicolons or commas
            cleanedToken = cleanedToken.replace(/[;,]+$/g, '');

            return cleanedToken;
        },

        /**
         * Analyze a raw token format (for debugging/UI). Pure — no instance state.
         * @param {string} token - JWT token to analyze
         * @returns {Object} - { valid, issues[], info{} }
         */
        analyzeToken(token) {
            const result = {
                valid: false,
                issues: [],
                info: {},
            };

            try {
                result.info.originalLength = token.length;
                result.info.hasSpaces = token.includes(' ');
                result.info.hasNewlines = token.includes('\n') || token.includes('\r');
                result.info.hasPrefix = token.toLowerCase().startsWith('jwt=');

                // Clean token
                const cleaned = this.cleanToken(token);

                result.info.cleanedLength = cleaned.length;

                // Check parts
                const parts = cleaned.split('.');
                result.info.parts = parts.length;
                result.info.partLengths = parts.map((p) => p.length);

                if (parts.length !== 3) {
                    result.issues.push(`Token có ${parts.length} phần, cần 3 phần`);
                    return result;
                }

                if (!parts[0] || !parts[1] || !parts[2]) {
                    result.issues.push('Token có phần trống');
                    return result;
                }

                // Try to decode
                try {
                    const payload = this.decodeToken(cleaned);
                    if (payload) {
                        result.valid = true;
                        result.info.name = payload.name;
                        result.info.uid = payload.uid;
                        result.info.exp = payload.exp;
                        result.info.expiryDate = new Date(payload.exp * 1000).toLocaleString(
                            'vi-VN'
                        );
                        result.info.isExpired = this.isTokenExpired(payload.exp);
                    } else {
                        result.issues.push('Không thể giải mã payload');
                    }
                } catch (decodeError) {
                    result.issues.push('Lỗi giải mã: ' + decodeError.message);
                }

                return result;
            } catch (error) {
                result.issues.push('Lỗi phân tích: ' + error.message);
                return result;
            }
        },
    };

    window.PancakeTokenCodec = PancakeTokenCodec;
})(window);
