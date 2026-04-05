// TPOS Page Interceptor
// Intercepts tag assignment API calls on TPOS and forwards to Render server
// Runs on: tomato.tpos.vn

(function () {
  const API_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/tpos-events/broadcast';
  const ASSIGN_TAG_URL = 'TagSaleOnlineOrder/ODataService.AssignTag';

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._n2Method = method;
    this._n2Url = url;
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const url = this._n2Url || '';

    // Intercept tag assignment
    if (url.includes(ASSIGN_TAG_URL) && this._n2Method === 'POST') {
      let parsedBody = null;
      try { parsedBody = JSON.parse(body); } catch (e) {}

      if (parsedBody) {
        this.addEventListener('load', function () {
          if (this.status >= 200 && this.status < 300) {
            // Tag assignment succeeded — notify Render server
            const event = {
              type: 'tpos:tag-assigned',
              orderId: parsedBody.OrderId,
              tags: parsedBody.Tags,
              timestamp: new Date().toISOString()
            };

            // Send directly to Render server (MAIN world - no chrome.runtime access)
            fetch(API_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(event)
            }).catch(() => {});

            console.log('[N2Store] Tag assigned:', parsedBody.OrderId, parsedBody.Tags?.map(t => t.Name));
          }
        });
      }
    }

    return origSend.apply(this, arguments);
  };

  console.log('[N2Store] TPOS interceptor active');
})();
