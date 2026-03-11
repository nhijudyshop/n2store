/* =====================================================
   UNIFIED NAVIGATION MANAGER - Aggregator
   Auto-loads sub-modules in correct dependency order.

   This file remains for backward compatibility.
   All pages that reference navigation-modern.js will
   continue to work without any HTML changes.

   Sub-modules (loaded in order):
   1. navigation-config.js      - Menu definitions, constants, stores
   2. navigation-permissions.js  - Permission filtering and access control
   3. navigation-sidebar.js      - Desktop sidebar rendering and UI
   4. navigation-mobile.js       - Mobile navigation (hamburger, touch)
   5. navigation-core.js         - Class definition, init, shared functionality
   ===================================================== */

(function loadNavigationModules() {
    'use strict';

    // Determine the base path from this script's src attribute
    const currentScript = document.currentScript || (function() {
        const scripts = document.getElementsByTagName('script');
        for (let i = scripts.length - 1; i >= 0; i--) {
            if (scripts[i].src && scripts[i].src.includes('navigation-modern')) {
                return scripts[i];
            }
        }
        return null;
    })();

    if (!currentScript) {
        console.error('[Navigation] Could not determine script path for module loading');
        return;
    }

    const scriptSrc = currentScript.getAttribute('src');
    const basePath = scriptSrc.substring(0, scriptSrc.lastIndexOf('/') + 1);

    // Sub-modules to load in order (dependency chain)
    const modules = [
        'navigation-config.js',
        'navigation-permissions.js',
        'navigation-sidebar.js',
        'navigation-mobile.js',
        'navigation-core.js'
    ];

    // Load scripts sequentially to maintain dependency order
    let loadIndex = 0;

    function loadNext() {
        if (loadIndex >= modules.length) {
            console.log('[Navigation] All modules loaded successfully');
            return;
        }

        const moduleName = modules[loadIndex];
        const script = document.createElement('script');
        script.src = basePath + moduleName;

        script.onload = function() {
            loadIndex++;
            loadNext();
        };

        script.onerror = function() {
            console.error(`[Navigation] Failed to load module: ${moduleName}`);
            // Continue loading remaining modules even if one fails
            loadIndex++;
            loadNext();
        };

        document.head.appendChild(script);
    }

    loadNext();
})();
