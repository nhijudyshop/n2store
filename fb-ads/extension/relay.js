// Runs in ISOLATED world — relays token from MAIN world to background service worker

window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    if (event.data && event.data.type === 'N2_EAAG_TOKEN' && event.data.token) {
        chrome.runtime.sendMessage({
            action: 'token-found',
            token: event.data.token
        }).catch(function() {});
    }
});
