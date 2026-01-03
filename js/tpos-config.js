// =====================================================
// TPOS CONFIG - Centralized Configuration
// =====================================================
// Single source of truth for TPOS API configuration.
// All files should import from here instead of hardcoding values.

(function (global) {
    'use strict';

    const TPOS_CONFIG = {
        // =====================================================
        // API VERSION - Update this when TPOS requires new version
        // =====================================================
        tposAppVersion: '5.12.29.1',

        // =====================================================
        // PROXY URLS
        // =====================================================
        proxyUrl: 'https://chatomni-proxy.nhijudyshop.workers.dev',
        fallbackApiUrl: 'https://n2store-fallback.onrender.com',

        // =====================================================
        // TPOS API BASE
        // =====================================================
        tposBaseUrl: 'https://tomato.tpos.vn',

        // =====================================================
        // COMMON HEADERS
        // =====================================================
        getHeaders: function (token) {
            return {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'tposappversion': this.tposAppVersion,
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            };
        },

        // Get just the version header
        getVersionHeader: function () {
            return {
                'tposappversion': this.tposAppVersion
            };
        }
    };

    // Freeze to prevent accidental modifications
    Object.freeze(TPOS_CONFIG);

    // Export for different module systems
    if (typeof module !== 'undefined' && module.exports) {
        // Node.js / CommonJS
        module.exports = TPOS_CONFIG;
    } else if (typeof define === 'function' && define.amd) {
        // AMD
        define(function () { return TPOS_CONFIG; });
    } else {
        // Browser global
        global.TPOS_CONFIG = TPOS_CONFIG;
    }

})(typeof globalThis !== 'undefined' ? globalThis :
    typeof window !== 'undefined' ? window :
        typeof global !== 'undefined' ? global : this);
