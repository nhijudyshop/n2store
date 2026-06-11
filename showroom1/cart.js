// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Showroom1 — mã định danh khách vãng lai + giỏ hàng server-side.
// Khách vào trang lần đầu được cấp mã tăng dần từ 1 (POST /api/showroom-carts/visitors),
// mã hiện trên pill #idPill (thay FAB chat). Thêm SP → lưu giỏ server-side (debounce PUT).
// Bấm pill → bottom-sheet giỏ hàng (không chuyển trang) + mã to + nút Gọi/Zalo/Messenger.
// Khách chốt đơn bằng cách gọi/nhắn MÃ cho shop → shop tra giỏ trong admin panel.
// UI-first: mutation hiện ngay, lỗi mạng KHÔNG rollback (cache local + retry) — rollback
// giỏ trên webview Messenger/Zalo chập chờn sẽ phá ý định mua của khách.
(function () {
  'use strict';

  const WORKER = 'https://chatomni-proxy.nhijudyshop.workers.dev';
  const API = WORKER + '/api/showroom-carts';
  const LS_KEY = 'showroom1_visitor'; // {id, token}
  const LS_CACHE = 'showroom1_cart_cache'; // items snapshot (offline fallback)
  // TODO: user điền SĐT + link Zalo thật của shop (Messenger đoán theo page Pancake NhiJudyStore)
  const CONTACT = {
    phone: '0900000000',
    zalo: 'https://zalo.me/0900000000',
    messenger: 'https://m.me/NhiJudyStore',
  };
  const MAX_QTY = 99;
  const SAVE_DEBOUNCE_MS = 800;

  // ---------- state ----------
  let visitor = null; // {id, token}
  let items = []; // [{productId, name, price, qty, image}]
  let dirty = false; // có thay đổi chưa lưu được lên server
  let saveT = null;
  let registering = false;
  let sheetOpen = false;
  let sheetBuilt = false;

  // ---------- utils ----------
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  const vnd = (n) => (Number(n) || 0).toLocaleString('vi-VN') + '₫';
  function toast(msg) {
    if (window.Showroom && window.Showroom.showToast) window.Showroom.showToast(msg);
  }
  // localStorage bọc try/catch — webview Messenger/Zalo có thể chặn storage
  function lsGet(k) {
    try {
      return JSON.parse(localStorage.getItem(k));
    } catch (_) {
      return null;
    }
  }
  function lsSet(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (_) {}
  }
  function lsDel(k) {
    try {
      localStorage.removeItem(k);
    } catch (_) {}
  }

  // ---------- pill ----------
  function getCount() {
    return items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
  }
  function updatePill(pulse) {
    const idEl = $('#pillId');
    const nEl = $('#pillN');
    if (idEl) idEl.textContent = visitor ? '#' + visitor.id : '…';
    if (nEl) {
      const n = getCount();
      if (n > 0) {
        nEl.textContent = n > 99 ? '99+' : String(n);
        nEl.hidden = false;
      } else {
        nEl.hidden = true;
      }
    }
    const pill = $('#idPill');
    if (pill && pulse) {
      pill.classList.remove('pulse');
      void pill.offsetWidth; // restart animation
      pill.classList.add('pulse');
    }
  }

  // ---------- server io ----------
  async function register(isRecovery) {
    if (registering) return false;
    registering = true;
    try {
      const res = await fetch(API + '/visitors', { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.success === false || !data.visitorId || !data.token) {
        throw new Error((data && data.error) || 'HTTP ' + res.status);
      }
      visitor = { id: data.visitorId, token: data.token };
      lsSet(LS_KEY, visitor);
      updatePill(true);
      toast(isRecovery ? 'Mã khách mới của bạn: #' + visitor.id : 'Xin chào! Mã khách của bạn: #' + visitor.id);
      if (items.length) {
        // items gom trước khi đăng ký xong → đẩy lên server
        dirty = true;
        scheduleSave();
      }
      return true;
    } catch (_) {
      return false;
    } finally {
      registering = false;
    }
  }

  function scheduleSave() {
    clearTimeout(saveT);
    saveT = setTimeout(saveNow, SAVE_DEBOUNCE_MS);
  }

  async function saveNow() {
    if (!visitor) {
      if (!registering) register(false);
      return;
    }
    try {
      const res = await fetch(API + '/' + visitor.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: visitor.token, items }),
      });
      if (res.status === 403 || res.status === 404) {
        // mất định danh (DB dọn / token stale) — cấp mã mới, GIỮ items
        visitor = null;
        lsDel(LS_KEY);
        updatePill();
        await register(true); // register tự scheduleSave lại items hiện có
        return;
      }
      const data = await res.json().catch(() => null);
      if (res.ok && data && data.success) dirty = false;
      else dirty = true;
    } catch (_) {
      dirty = true; // offline — giữ optimistic, retry ở mutation kế / online event / mở sheet
    }
  }

  async function fetchCart() {
    if (!visitor) return null;
    const res = await fetch(API + '/' + visitor.id + '?token=' + encodeURIComponent(visitor.token));
    if (res.status === 403 || res.status === 404) return { gone: true };
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json().catch(() => null);
    if (!data || data.success === false || !data.cart) throw new Error('bad payload');
    return { cart: data.cart };
  }

  // ---------- cart ops ----------
  function persistLocal() {
    lsSet(LS_CACHE, items);
  }
  function afterMutate() {
    persistLocal();
    updatePill();
    if (sheetOpen) renderSheet();
    dirty = true;
    scheduleSave();
  }
  function add(product) {
    if (!product || !product.id) return false;
    const ex = items.find((it) => it.productId === product.id);
    if (ex) {
      ex.qty = Math.min(MAX_QTY, (Number(ex.qty) || 1) + 1);
    } else {
      items.push({
        productId: String(product.id),
        name: String(product.name || ''),
        price: Number(product.price) || 0,
        qty: 1,
        image: typeof product.image === 'string' && product.image.startsWith('https://') ? product.image : null,
      });
    }
    afterMutate();
    return true;
  }
  function setQty(pid, qty) {
    const it = items.find((x) => x.productId === pid);
    if (!it) return;
    it.qty = Math.max(1, Math.min(MAX_QTY, qty));
    afterMutate();
  }
  function removeItem(pid) {
    const idx = items.findIndex((x) => x.productId === pid);
    if (idx === -1) return;
    const name = items[idx].name;
    items.splice(idx, 1);
    afterMutate();
    toast('Đã bỏ khỏi giỏ · ' + name);
  }

  // ---------- bottom sheet ----------
  function buildSheet() {
    if (sheetBuilt) return;
    const screen = $('.screen');
    if (!screen) return;
    const scrim = document.createElement('div');
    scrim.className = 'sheet-scrim';
    scrim.id = 'cartScrim';
    const sheet = document.createElement('div');
    sheet.className = 'sheet cart-sheet';
    sheet.id = 'cartSheet';
    sheet.innerHTML =
      '<div class="grab"></div>' +
      '<h3>Giỏ hàng · <span id="cartSheetId">…</span></h3>' +
      '<div class="sheet-body" id="cartRows"></div>' +
      '<div class="sheet-foot cart-foot">' +
        '<div class="cart-total"><span>Tạm tính</span><b id="cartTotal">0₫</b></div>' +
        '<div class="cart-idblock">' +
          '<div class="cart-idlabel">Mã khách của bạn</div>' +
          '<div class="cart-idbig" id="cartIdBig">…</div>' +
          '<div class="cart-idhint">Gọi điện hoặc nhắn tin cho shop kèm <b>mã này</b> để chốt đơn — shop sẽ thấy ngay giỏ hàng của bạn.</div>' +
        '</div>' +
        '<div class="cart-contacts">' +
          '<a class="cart-cbtn call" href="tel:' + esc(CONTACT.phone) + '">Gọi ngay</a>' +
          '<a class="cart-cbtn" href="' + esc(CONTACT.zalo) + '" target="_blank" rel="noopener">Zalo</a>' +
          '<a class="cart-cbtn" href="' + esc(CONTACT.messenger) + '" target="_blank" rel="noopener">Messenger</a>' +
        '</div>' +
      '</div>';
    screen.appendChild(scrim);
    screen.appendChild(sheet);
    scrim.addEventListener('click', close);
    sheet.querySelector('.grab').addEventListener('click', close);
    // event delegation cho stepper / remove
    sheet.querySelector('#cartRows').addEventListener('click', (e) => {
      const row = e.target.closest('.cart-row');
      if (!row) return;
      const pid = row.dataset.pid;
      const it = items.find((x) => x.productId === pid);
      if (!it) return;
      if (e.target.closest('.q-plus')) setQty(pid, (Number(it.qty) || 1) + 1);
      else if (e.target.closest('.q-minus')) setQty(pid, (Number(it.qty) || 1) - 1);
      else if (e.target.closest('.cart-rm')) removeItem(pid);
    });
    sheetBuilt = true;
  }

  function renderSheet() {
    const rowsEl = $('#cartRows');
    if (!rowsEl) return;
    const idTxt = visitor ? '#' + visitor.id : '…';
    const sheetId = $('#cartSheetId');
    const idBig = $('#cartIdBig');
    if (sheetId) sheetId.textContent = idTxt;
    if (idBig) idBig.textContent = idTxt;

    if (!items.length) {
      rowsEl.innerHTML = '<div class="cart-empty">Chưa có sản phẩm<br>Chạm vào ảnh sản phẩm để thêm vào giỏ</div>';
    } else {
      rowsEl.innerHTML = items
        .map((it) => {
          const qty = Number(it.qty) || 1;
          const thumb = it.image
            ? '<img src="' + esc(it.image) + '" alt="" onerror="this.remove()">'
            : '';
          return (
            '<div class="cart-row" data-pid="' + esc(it.productId) + '">' +
              '<div class="cart-thumb">' + thumb + '</div>' +
              '<div class="cart-info">' +
                '<div class="cart-name">' + esc(it.name) + '</div>' +
                '<div class="cart-price">' + vnd(it.price) + '</div>' +
              '</div>' +
              '<div class="cart-qty">' +
                '<button class="q-minus" aria-label="Giảm"' + (qty <= 1 ? ' disabled' : '') + '>−</button>' +
                '<b>' + qty + '</b>' +
                '<button class="q-plus" aria-label="Tăng"' + (qty >= MAX_QTY ? ' disabled' : '') + '>+</button>' +
              '</div>' +
              '<button class="cart-rm" aria-label="Xóa">×</button>' +
            '</div>'
          );
        })
        .join('');
    }
    const totalEl = $('#cartTotal');
    if (totalEl) {
      totalEl.textContent = vnd(items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 0), 0));
    }
  }

  function open() {
    buildSheet();
    if (!sheetBuilt) return;
    renderSheet();
    sheetOpen = true;
    $('#cartScrim').classList.add('open');
    $('#cartSheet').classList.add('open');
    // reconcile nền với server (multi-tab) — chỉ khi không có thay đổi đang chờ lưu
    if (visitor && !dirty) {
      fetchCart()
        .then((r) => {
          if (!r || r.gone || !r.cart || dirty) return;
          items = Array.isArray(r.cart.items) ? r.cart.items : [];
          persistLocal();
          updatePill();
          if (sheetOpen) renderSheet();
        })
        .catch(() => {});
    } else if (dirty) {
      saveNow(); // tranh thủ retry save khi khách mở giỏ
    }
  }
  function close() {
    sheetOpen = false;
    const scrim = $('#cartScrim');
    const sheet = $('#cartSheet');
    if (scrim) scrim.classList.remove('open');
    if (sheet) sheet.classList.remove('open');
  }

  // ---------- init ----------
  async function init() {
    const pill = $('#idPill');
    if (pill) pill.addEventListener('click', open);

    const stored = lsGet(LS_KEY);
    if (stored && stored.id && stored.token) {
      visitor = { id: stored.id, token: stored.token };
      updatePill();
      try {
        const r = await fetchCart();
        if (r && r.gone) {
          // DB không còn visitor này → cấp mã mới
          visitor = null;
          lsDel(LS_KEY);
          lsDel(LS_CACHE);
          items = [];
          updatePill();
          await register(false);
        } else if (r && r.cart) {
          items = Array.isArray(r.cart.items) ? r.cart.items : [];
          persistLocal();
          updatePill();
        }
      } catch (_) {
        // offline / server lỗi — dùng cache local
        const cached = lsGet(LS_CACHE);
        items = Array.isArray(cached) ? cached : [];
        if (items.length) dirty = true;
        updatePill();
      }
    } else {
      const ok = await register(false);
      if (!ok) {
        // thử lại 1 lần sau 5s; ngoài ra add() nào cũng kích hoạt register lại
        setTimeout(() => {
          if (!visitor) register(false);
        }, 5000);
      }
    }

    window.addEventListener('online', () => {
      if (dirty) saveNow();
    });
  }

  // expose cho inline script của index.html
  window.ShowroomCart = { add: add, open: open, close: close, getCount: getCount };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
