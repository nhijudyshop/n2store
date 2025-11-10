/**
 * CORE UTILITIES LOADER
 * File: core-loader.js
 * Purpose: Load tất cả các core utilities theo đúng thứ tự
 *
 * USAGE: Add vào HTML trước tất cả các script khác:
 * <script src="/js/core-loader.js"></script>
 */

(function() {
    'use strict';

    // Detect base path
    const scripts = document.getElementsByTagName('script');
    const currentScript = scripts[scripts.length - 1];
    const basePath = currentScript.src.substring(0, currentScript.src.lastIndexOf('/')) + '/';

    console.log('🚀 Loading N2Store Core Utilities...');

    // Cache busting parameter
    const cacheBuster = Date.now();

    // Load CSS files
    const cssBasePath = basePath.replace('/js/', '/css/');
    const cssFiles = [
        'chat-modern.css'               // Chat system styles
    ];

    cssFiles.forEach(cssFile => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = cssBasePath + cssFile + '?v=' + cacheBuster;
        document.head.appendChild(link);
        console.log(`✅ Loaded CSS: ${cssFile}`);
    });

    // List of core utilities to load in order
    const coreUtilities = [
        // Core utilities (load first)
        'logger.js',                    // Logger (needed by others)
        'firebase-config.js',           // Firebase config
        'dom-utils.js',                 // DOM utilities
        'event-manager.js',             // Event management
        'common-utils.js',              // Common UI utilities
        'optimization-helper.js',       // Optimization helpers

        // Managers
        'shared-cache-manager.js',      // Cache manager
        'shared-auth-manager.js',       // Auth manager

        // Chat system
        'chat-manager.js',              // Chat manager
        'chat-bubble.js',               // Chat UI

        // Navigation system (unified: auto-detects PC/Mobile)
        'navigation-modern.js'          // Main navigation (includes PC + Mobile)

        // Note: service-worker-register.js excluded (requires service-worker.js file)
    ];

    // Track loaded scripts
    let loadedCount = 0;
    const totalCount = coreUtilities.length;

    // Load scripts sequentially
    function loadScript(index) {
        if (index >= coreUtilities.length) {
            onAllLoaded();
            return;
        }

        const scriptUrl = basePath + coreUtilities[index] + '?v=' + cacheBuster;
        const script = document.createElement('script');
        script.src = scriptUrl;

        script.onload = function() {
            loadedCount++;
            console.log(`✅ Loaded: ${coreUtilities[index]} (${loadedCount}/${totalCount})`);
            loadScript(index + 1);
        };

        script.onerror = function() {
            console.error(`❌ Failed to load: ${coreUtilities[index]}`);
            // Continue loading next script even if one fails
            loadScript(index + 1);
        };

        document.head.appendChild(script);
    }

    // Called when all scripts are loaded
    function onAllLoaded() {
        console.log('✅ All core utilities loaded successfully!');

        // Trigger custom event
        const event = new CustomEvent('coreUtilitiesLoaded', {
            detail: {
                loadedCount,
                totalCount,
                timestamp: Date.now()
            }
        });
        document.dispatchEvent(event);

        // Set global flag
        window.CORE_UTILITIES_LOADED = true;
    }

    // Start loading
    loadScript(0);
})();
