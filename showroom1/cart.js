// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Showroom1 — mã định danh khách vãng lai + giỏ hàng server-side.
// Khách vào trang lần đầu được cấp mã tăng dần từ 1 (POST /api/showroom-carts/visitors),
// mã hiện trên pill #idPill (thay FAB chat). Bấm nút giỏ trên card → sheet chọn size/màu
// (UI to, đơn giản) → lưu giỏ server-side (debounce PUT). Bấm pill → bottom-sheet giỏ hàng.
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
  let items = []; // [{productId, name, price, qty, image, size, color}]
  let dirty = false; // có thay đổi chưa lưu được lên server
  let saveT = null;
  let registering = false;
  let sheetOpen = false;
  let sheetBuilt = false;
  let pickerBuilt = false;
  let picking = null; // {prod, size, color} — SP đang chọn size/màu

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
    if (pulse) pulsePill();
  }
  function pulsePill() {
    const pill = $('#idPill');
    if (!pill) return;
    pill.classList.remove('pulse');
    void pill.offsetWidth; // restart animation
    pill.classList.add('pulse');
  }

  // ---------- animation "món hàng bay vào giỏ" ----------
  // Hình tròn nhỏ chứa ảnh SP bay theo đường cong từ vị trí card → pill đen dưới cùng,
  // pill nảy lên khi "hạ cánh" — để khách biết chắc đã thêm vào giỏ.
  function flyToCart(sourceEl, imageUrl) {
    try {
      const screen = $('.screen');
      const pill = $('#idPill');
      if (!screen || !pill || !sourceEl || !sourceEl.getBoundingClientRect) {
        pulsePill();
        return;
      }
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        pulsePill();
        return;
      }
      const SIZE = 46;
      const sRect = screen.getBoundingClientRect();
      // admin preview scale phone bằng transform → quy đổi viewport coords về local coords
      const scale = screen.offsetWidth ? sRect.width / screen.offsetWidth : 1;
      const local = (r) => ({
        x: (r.left + r.width / 2 - sRect.left) / scale - SIZE / 2,
        y: (r.top + r.height / 2 - sRect.top) / scale - SIZE / 2,
      });
      const a = local(sourceEl.getBoundingClientRect());
      const b = local(pill.getBoundingClientRect());
      const el = document.createElement('div');
      el.className = 'fly-item';
      el.style.left = a.x + 'px';
      el.style.top = a.y + 'px';
      el.innerHTML =
        imageUrl && String(imageUrl).startsWith('https://')
          ? '<img src="' + esc(imageUrl) + '" alt="">'
          : '<span class="fly-dot"></span>';
      screen.appendChild(el);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      let landed = false;
      const land = () => {
        if (landed) return;
        landed = true;
        el.remove();
        pulsePill();
      };
      if (el.animate) {
        const anim = el.animate(
          [
            { transform: 'translate(0,0) scale(1)', opacity: 1 },
            { transform: 'translate(' + dx * 0.5 + 'px,' + (dy * 0.5 - 44) + 'px) scale(.72)', opacity: 1, offset: 0.55 },
            { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.22)', opacity: 0.3 },
          ],
          { duration: 650, easing: 'cubic-bezier(.5,-0.1,.65,1)' }
        );
        anim.onfinish = land;
      }
      setTimeout(land, 900); // safety: browser cũ không có WAAPI vẫn dọn + pulse
    } catch (_) {
      pulsePill();
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
  function variantText(it) {
    return [it.size, it.color].filter(Boolean).join(' · ');
  }
  // cùng SP nhưng khác size/màu = dòng riêng trong giỏ
  function findItem(productId, size, color) {
    return items.find(
      (it) => it.productId === productId && (it.size || '') === (size || '') && (it.color || '') === (color || '')
    );
  }
  function addItem(prod, size, color) {
    const ex = findItem(prod.id, size, color);
    if (ex) {
      ex.qty = Math.min(MAX_QTY, (Number(ex.qty) || 1) + 1);
    } else {
      items.push({
        productId: String(prod.id),
        name: String(prod.name || ''),
        price: Number(prod.price) || 0,
        qty: 1,
        image: typeof prod.image === 'string' && prod.image.startsWith('https://') ? prod.image : null,
        size: size || '',
        color: color || '',
      });
    }
    afterMutate();
    if (!visitor && !registering) register(false); // retry đăng ký nếu lần đầu fail
  }

  // Chuẩn hóa product từ preview của admin.js (toPreview): {id,name,price,salePrice,sizes,colors,images}
  function normalizeProduct(p) {
    const sale = p.salePrice != null && p.salePrice > 0 && p.salePrice < p.price;
    return {
      id: String(p.id),
      name: String(p.name || ''),
      price: sale ? Number(p.salePrice) : Number(p.price) || 0,
      image: Array.isArray(p.images) && p.images[0] ? p.images[0] : typeof p.image === 'string' ? p.image : null,
      sizes: Array.isArray(p.sizes) ? p.sizes.filter(Boolean) : [],
      colors: Array.isArray(p.colors) ? p.colors.filter(Boolean) : [],
    };
  }

  // Entry point từ nút giỏ trên card: SP có size/màu → mở sheet chọn; không có → thêm luôn
  // sourceEl (optional): element gốc để chạy animation bay vào giỏ
  function addWithOptions(rawProduct, sourceEl) {
    if (!rawProduct || !rawProduct.id) return false;
    const prod = normalizeProduct(rawProduct);
    if (!prod.sizes.length && !prod.colors.length) {
      addItem(prod, '', '');
      flyToCart(sourceEl, prod.image);
      toast('Đã thêm vào giỏ · ' + prod.name);
      return true;
    }
    openPicker(prod);
    return true;
  }

  // ---------- sheet CHỌN SIZE/MÀU (đơn giản, chữ to cho người lớn tuổi) ----------
  function buildPicker() {
    if (pickerBuilt) return;
    const screen = $('.screen');
    if (!screen) return;
    const scrim = document.createElement('div');
    scrim.className = 'sheet-scrim';
    scrim.id = 'pickScrim';
    const sheet = document.createElement('div');
    sheet.className = 'sheet pick-sheet';
    sheet.id = 'pickSheet';
    sheet.innerHTML =
      '<div class="grab"></div>' +
      '<h3 id="pickTitle">Chọn size &amp; màu</h3>' +
      '<div class="sheet-body">' +
        '<div class="pick-prod">' +
          '<div class="pick-thumb" id="pickThumb"></div>' +
          '<div class="pick-meta"><div class="pp-name" id="pickName"></div><div class="pp-price" id="pickPrice"></div></div>' +
        '</div>' +
        '<div class="pick-group" id="pickSizeGroup"><div class="pick-label">Chọn size</div><div class="pick-chips" id="pickSizes"></div></div>' +
        '<div class="pick-group" id="pickColorGroup"><div class="pick-label">Chọn màu</div><div class="pick-chips" id="pickColors"></div></div>' +
      '</div>' +
      '<div class="sheet-foot pick-foot">' +
        '<button class="btn-clear" id="pickCancel">Đóng</button>' +
        '<button class="btn-apply pick-confirm" id="pickConfirm">Thêm vào giỏ</button>' +
      '</div>';
    screen.appendChild(scrim);
    screen.appendChild(sheet);
    scrim.addEventListener('click', closePicker);
    sheet.querySelector('#pickCancel').addEventListener('click', closePicker);
    sheet.querySelector('.grab').addEventListener('click', closePicker);
    // chọn chip (event delegation cho cả 2 nhóm)
    sheet.querySelector('.sheet-body').addEventListener('click', (e) => {
      const chip = e.target.closest('.pick-chip');
      if (!chip || !picking) return;
      const group = chip.closest('.pick-chips').id === 'pickSizes' ? 'size' : 'color';
      picking[group] = chip.dataset.v;
      renderPickerChips();
    });
    sheet.querySelector('#pickConfirm').addEventListener('click', () => {
      if (!picking) return;
      const p = picking;
      if (p.prod.sizes.length && !p.size) {
        toast('Bạn chưa chọn size');
        return;
      }
      if (p.prod.colors.length && !p.color) {
        toast('Bạn chưa chọn màu');
        return;
      }
      addItem(p.prod, p.size, p.color);
      const vt = [p.size, p.color].filter(Boolean).join(' · ');
      flyToCart($('#pickThumb'), p.prod.image); // lấy rect TRƯỚC khi sheet trượt xuống
      toast('Đã thêm vào giỏ · ' + p.prod.name + (vt ? ' (' + vt + ')' : ''));
      closePicker();
    });
    pickerBuilt = true;
  }

  function renderPickerChips() {
    if (!picking) return;
    const chip = (v, on) =>
      '<button class="pick-chip' + (on ? ' on' : '') + '" data-v="' + esc(v) + '">' + esc(v) + '</button>';
    const sg = $('#pickSizeGroup');
    const cg = $('#pickColorGroup');
    if (sg) {
      sg.style.display = picking.prod.sizes.length ? '' : 'none';
      $('#pickSizes').innerHTML = picking.prod.sizes.map((s) => chip(s, s === picking.size)).join('');
    }
    if (cg) {
      cg.style.display = picking.prod.colors.length ? '' : 'none';
      $('#pickColors').innerHTML = picking.prod.colors.map((c) => chip(c, c === picking.color)).join('');
    }
  }

  function openPicker(prod) {
    buildPicker();
    if (!pickerBuilt) return;
    picking = {
      prod,
      // nhóm chỉ có 1 lựa chọn → tự chọn sẵn, khách chỉ cần bấm "Thêm vào giỏ"
      size: prod.sizes.length === 1 ? prod.sizes[0] : '',
      color: prod.colors.length === 1 ? prod.colors[0] : '',
    };
    $('#pickName').textContent = prod.name;
    $('#pickPrice').textContent = vnd(prod.price);
    $('#pickThumb').innerHTML = prod.image ? '<img src="' + esc(prod.image) + '" alt="">' : '';
    renderPickerChips();
    $('#pickScrim').classList.add('open');
    $('#pickSheet').classList.add('open');
  }
  function closePicker() {
    picking = null;
    const scrim = $('#pickScrim');
    const sheet = $('#pickSheet');
    if (scrim) scrim.classList.remove('open');
    if (sheet) sheet.classList.remove('open');
  }

  // ---------- bottom sheet GIỎ HÀNG ----------
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
    // event delegation cho stepper / remove — row tham chiếu theo index trong items
    sheet.querySelector('#cartRows').addEventListener('click', (e) => {
      const row = e.target.closest('.cart-row');
      if (!row) return;
      const idx = parseInt(row.dataset.idx, 10);
      const it = items[idx];
      if (!it) return;
      if (e.target.closest('.q-plus')) {
        it.qty = Math.min(MAX_QTY, (Number(it.qty) || 1) + 1);
        afterMutate();
      } else if (e.target.closest('.q-minus')) {
        it.qty = Math.max(1, (Number(it.qty) || 1) - 1);
        afterMutate();
      } else if (e.target.closest('.cart-rm')) {
        const name = it.name;
        items.splice(idx, 1);
        afterMutate();
        toast('Đã bỏ khỏi giỏ · ' + name);
      }
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
      rowsEl.innerHTML = '<div class="cart-empty">Chưa có sản phẩm<br>Bấm nút giỏ hàng trên ảnh sản phẩm để thêm</div>';
    } else {
      rowsEl.innerHTML = items
        .map((it, idx) => {
          const qty = Number(it.qty) || 1;
          const thumb = it.image
            ? '<img src="' + esc(it.image) + '" alt="" onerror="this.remove()">'
            : '';
          const vt = variantText(it);
          return (
            '<div class="cart-row" data-idx="' + idx + '">' +
              '<div class="cart-thumb">' + thumb + '</div>' +
              '<div class="cart-info">' +
                '<div class="cart-name">' + esc(it.name) + '</div>' +
                (vt ? '<div class="cart-variant">' + esc(vt) + '</div>' : '') +
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
    closePicker(); // không mở chồng 2 sheet
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
        // thử lại 1 lần sau 5s; ngoài ra addItem nào cũng kích hoạt register lại
        setTimeout(() => {
          if (!visitor) register(false);
        }, 5000);
      }
    }

    window.addEventListener('online', () => {
      if (dirty) saveNow();
    });
  }

  // expose cho inline script của index.html (add = alias addWithOptions)
  window.ShowroomCart = {
    add: addWithOptions,
    addWithOptions: addWithOptions,
    open: open,
    close: close,
    getCount: getCount,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
