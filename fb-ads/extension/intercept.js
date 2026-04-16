// Runs in MAIN world (document_start) — patches fetch/XHR to capture EAAG tokens
// This catches tokens from Facebook's internal API calls as they happen

(function() {
    'use strict';

    let found = false;

    function report(token, source) {
        if (found) return;
        found = true;
        console.log('[N2-EXT] EAAG token found via', source);
        window.postMessage({ type: 'N2_EAAG_TOKEN', token: token }, '*');
    }

    function scan(text, source) {
        if (found || !text || typeof text !== 'string') return;
        const m = text.match(/(EAAG[A-Za-z0-9_-]{20,})/);
        if (m) report(m[1], source);
    }

    // === Patch fetch ===
    const origFetch = window.fetch;
    window.fetch = function(input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        scan(url, 'fetch-url');

        if (init && init.body) {
            const body = typeof init.body === 'string' ? init.body : '';
            scan(body, 'fetch-body');
        }

        const promise = origFetch.apply(this, arguments);

        // Also scan response for tokens (some endpoints return tokens)
        promise.then(function(resp) {
            if (resp && resp.clone) {
                resp.clone().text().then(function(t) { scan(t, 'fetch-response'); }).catch(function(){});
            }
        }).catch(function(){});

        return promise;
    };

    // === Patch XMLHttpRequest ===
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
        this._n2url = url;
        scan(url, 'xhr-url');
        return origOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
        if (body) scan(typeof body === 'string' ? body : '', 'xhr-body');

        this.addEventListener('load', function() {
            try { scan(this.responseText, 'xhr-response'); } catch(e) {}
        });

        return origSend.apply(this, arguments);
    };

    // === Also scan page HTML after load ===
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(function() {
                scan(document.documentElement.innerHTML, 'html');
            }, 2000);
        });
    }
})();
