// TPOS Page Interceptor
// Intercepts tag assignment + FastSaleOrder invoice list API calls on TPOS
// and forwards to Render server for broadcasting to orders-report clients.
// Runs on: tomato.tpos.vn (MAIN world)

(function () {
  const API_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/tpos-events/broadcast';
  const ASSIGN_TAG_URL = 'TagSaleOnlineOrder/ODataService.AssignTag';
  const FSO_LIST_URL = 'FastSaleOrder/ODataService.GetView';
  const FSO_BATCH_URL = 'FastSaleOrder/ODataService.GetListOrderIds';

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  // Debounce snapshot broadcasts — the invoicelist page can fire multiple
  // overlapping GetView requests during scroll/filter. Collect within 400ms
  // and flush as one batch.
  let pendingInvoices = new Map(); // Id -> snapshot
  let flushTimer = null;
  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      if (pendingInvoices.size === 0) return;
      const invoices = Array.from(pendingInvoices.values());
      pendingInvoices = new Map();
      fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'tpos:invoice-list-updated',
          invoices,
          timestamp: new Date().toISOString()
        })
      }).catch(() => {});
      console.log('[N2Store] Invoice list captured:', invoices.length, 'invoices');
    }, 400);
  }

  function toSnapshot(inv) {
    if (!inv || inv.Id == null) return null;
    // Minimal field set — keep payload small
    return {
      Id: inv.Id,
      Number: inv.Number || '',
      State: inv.State || '',
      ShowState: inv.ShowState || '',
      StateCode: inv.StateCode || 'None',
      IsMergeCancel: inv.IsMergeCancel === true,
      PartnerDisplayName: inv.PartnerDisplayName || '',
      AmountTotal: inv.AmountTotal || 0,
      AmountPaid: inv.AmountPaid || 0,
      Residual: inv.Residual || 0,
      DateInvoice: inv.DateInvoice || null,
      DateUpdated: inv.DateUpdated || inv.LastUpdated || null,
      SaleOnlineIds: Array.isArray(inv.SaleOnlineIds) ? inv.SaleOnlineIds : (inv.SaleOnlineIds ? [inv.SaleOnlineIds] : [])
    };
  }

  function parseResponse(xhr) {
    try {
      const raw = xhr.response;
      if (!raw) {
        const text = xhr.responseText;
        if (!text) return null;
        return JSON.parse(text);
      }
      if (typeof raw === 'string') return JSON.parse(raw);
      return raw; // already object (responseType='json')
    } catch (e) {
      return null;
    }
  }

  function harvestInvoices(data) {
    if (!data) return;
    // GetView uses { value: [...] }; GetListOrderIds returns array or { value: [...] }
    const list = Array.isArray(data) ? data : (Array.isArray(data.value) ? data.value : null);
    if (!list) return;
    let added = 0;
    for (const item of list) {
      const snap = toSnapshot(item);
      if (!snap) continue;
      // Only push items that have at least one SaleOnlineId — others are irrelevant for orders-report
      if (!snap.SaleOnlineIds.length) continue;
      pendingInvoices.set(String(snap.Id), snap);
      added++;
    }
    if (added > 0) scheduleFlush();
  }

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

    // FastSaleOrder invoice list interception DISABLED — server now enriches
    // FastSaleOrder events directly via TPOS odata GetView and broadcasts as
    // tpos:invoice-list-updated. See render.com/server.js
    // (scheduleFastSaleOrderEnrichment + /api/tpos/fastsale-snapshot).
    // Keeping the constants and helpers above as dead code for context only.

    return origSend.apply(this, arguments);
  };

  console.log('[N2Store] TPOS interceptor active (v1.0.4 — tag-only, FSO via server)');
})();
