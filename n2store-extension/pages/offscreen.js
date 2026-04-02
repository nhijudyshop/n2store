// N2Store Extension - Offscreen Document
// Used for HTML parsing (fb_dtsg extraction) and keep-alive

// Keep service worker alive
setInterval(async () => {
  try {
    const registration = await navigator.serviceWorker.ready;
    if (registration.active) {
      registration.active.postMessage('keepAlive');
    }
  } catch (err) {
    console.error('[N2EXT-Offscreen] Keep-alive error:', err);
  }
}, 20000);

// Listen for parse requests from service worker
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'PARSE_HTML') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(msg.html, 'text/html');

      // Extract fb_dtsg from hidden input
      const dtsgInput = doc.querySelector('input[name="fb_dtsg"]');
      const dtsg = dtsgInput ? dtsgInput.value : null;

      // Extract other data as needed
      sendResponse({ dtsg });
    } catch (err) {
      sendResponse({ error: err.message });
    }
    return true;
  }
});

console.log('[N2EXT-Offscreen] Ready');
