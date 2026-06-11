// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Showroom1 admin — khi đăng nhập (shared AuthManager) + màn hình desktop ≥ 900px:
//   mở layout 70/30, trái = quản lý SP (thêm/sửa/xóa/ẩn-hiện/sắp xếp), phải = preview di động.
// Data lưu trên Render (Postgres, pool chatDb) qua /api/showroom-products. Realtime: SSE Web 1.0
// topic 'showroom_products' → đồng bộ giữa nhiều máy không cần refresh.
(function () {
  'use strict';

  const WORKER = 'https://chatomni-proxy.nhijudyshop.workers.dev';
  const API = WORKER + '/api/showroom-products';
  const SSE_URL = WORKER + '/api/realtime/sse?keys=showroom_products';
  const MIN_DESKTOP = 900;
  const CATS = [
    { v: 'quan', l: 'Quần' },
    { v: 'ao', l: 'Áo' },
    { v: 'set', l: 'Set' },
    { v: 'dam', l: 'Đầm' },
    { v: 'phukien', l: 'Phụ kiện' },
  ];
  const catLabel = (v) => (CATS.find((c) => c.v === v) || {}).l || v || 'Phụ kiện';
  const SIZE_OPTIONS = ['1', '2', '3', '4', 'S', 'M', 'L', 'XL'];

  // ---------- state ----------
  let products = []; // admin → tất cả; guest → chỉ active
  let isAdmin = false;
  let draft = null; // sản phẩm đang sửa (hoặc bản nháp mới)
  let es = null;
  let reloadT = null;
  let searchQ = '';
  let catFilter = '';
  let paneEl = null;
  let drawerEl = null;
  let scrimEl = null;
  let carts = []; // giỏ hàng khách vãng lai (mã định danh)
  let cartsEs = null; // EventSource riêng topic showroom_carts (chỉ mở khi isAdmin)
  let cartSearchQ = '';

  // ---------- utils ----------
  const imgUrl = (id) => `${API}/images/${id}`;
  const vnd = (n) => (Number(n) || 0).toLocaleString('vi-VN') + '₫';
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  const debounce = (fn, ms) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };

  function getUser() {
    try {
      return (window.authManager && window.authManager.getUserInfo && window.authManager.getUserInfo()) || null;
    } catch (_) {
      return null;
    }
  }
  function authed() {
    try {
      return !!(window.authManager && window.authManager.isAuthenticated && window.authManager.isAuthenticated());
    } catch (_) {
      return false;
    }
  }

  // ---------- toast ----------
  let toastEl, toastT;
  function toast(msg, isErr) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'adm-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.toggle('err', !!isErr);
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  // ---------- API ----------
  async function apiJson(path, opts) {
    const res = await fetch(API + (path || ''), opts);
    let data = null;
    try {
      data = await res.json();
    } catch (_) {}
    if (!res.ok || (data && data.success === false)) {
      throw new Error((data && data.error) || `HTTP ${res.status}`);
    }
    return data;
  }
  async function fetchProducts(all) {
    const data = await apiJson(all ? '/?all=1' : '/');
    return (data && data.products) || [];
  }

  // ---------- preview (drive phone grid) ----------
  function toPreview(list) {
    return list
      .filter((p) => p.active)
      .map((p) => ({
        id: p.id, // cart.js cần id để lưu giỏ server-side
        name: p.name,
        price: p.price,
        salePrice: p.salePrice,
        category: p.category,
        badge: p.badge,
        colors: p.colors || [],
        sizes: p.sizes || [],
        description: p.description || null, // detail viewer hiển thị mô tả
        images: (p.imageIds || []).map(imgUrl),
      }));
  }
  function drivePreview() {
    if (!window.Showroom || !window.Showroom.renderGrid) return;
    const pv = toPreview(products);
    // Nếu chưa có SP nào (lần đầu) → giữ nguyên demo cứng trong index.html, không xóa trắng.
    if (pv.length) window.Showroom.renderGrid(pv);
  }

  // ====================================================
  // ADMIN PANE
  // ====================================================
  function buildPane() {
    paneEl = document.getElementById('adminPane');
    if (!paneEl) return;
    const u = getUser();
    const uname = (u && (u.displayName || u.username)) || 'Admin';
    paneEl.innerHTML = `
      <div class="adm-head">
        <div class="adm-title">Quản lý Showroom<small>NHI JUDY · /showroom1</small></div>
        <div class="spacer"></div>
        <div class="adm-user">Đăng nhập<b>${esc(uname)}</b></div>
        <button class="adm-btn ghost sm" id="admLogout">Đăng xuất</button>
      </div>
      <div class="adm-tools">
        <button class="adm-btn" id="admAdd">+ Thêm sản phẩm</button>
        <div class="adm-search">
          <input type="text" id="admSearch" placeholder="Tìm tên sản phẩm…" autocomplete="off">
        </div>
        <select class="adm-cat-filter" id="admCatFilter">
          <option value="">Tất cả danh mục</option>
          ${CATS.map((c) => `<option value="${c.v}">${c.l}</option>`).join('')}
        </select>
        <span class="adm-count" id="admCount"></span>
        <button class="adm-btn ghost sm" id="admRefresh" title="Làm mới">↻</button>
      </div>
      <div class="adm-list" id="admList"><div class="adm-empty">Đang tải…</div></div>
      <div class="adm-carts">
        <div class="adm-carts-head">
          <span class="adm-carts-title">Giỏ hàng khách<small>theo mã định danh</small></span>
          <input type="text" id="admCartSearch" inputmode="numeric" placeholder="Tìm mã khách… (VD: 12)" autocomplete="off">
          <button class="adm-btn ghost sm" id="admCartRefresh" title="Làm mới">↻</button>
        </div>
        <div class="adm-cart-list" id="admCartList"><div class="adm-empty">Đang tải…</div></div>
      </div>`;

    paneEl.querySelector('#admCartRefresh').addEventListener('click', () => refreshCarts());
    paneEl.querySelector('#admCartSearch').addEventListener(
      'input',
      debounce((e) => {
        cartSearchQ = e.target.value.trim();
        renderCarts();
      }, 250)
    );
    paneEl.querySelector('#admAdd').addEventListener('click', () => openEditor(null));
    paneEl.querySelector('#admLogout').addEventListener('click', () => {
      try {
        window.authManager.logout();
      } catch (_) {}
      location.reload();
    });
    paneEl.querySelector('#admRefresh').addEventListener('click', () => refresh());
    paneEl.querySelector('#admSearch').addEventListener(
      'input',
      debounce((e) => {
        searchQ = e.target.value.trim().toLowerCase();
        renderList();
      }, 200)
    );
    paneEl.querySelector('#admCatFilter').addEventListener('change', (e) => {
      catFilter = e.target.value;
      renderList();
    });
  }

  function visibleProducts() {
    return products.filter((p) => {
      if (catFilter && p.category !== catFilter) return false;
      if (searchQ && !(p.name || '').toLowerCase().includes(searchQ)) return false;
      return true;
    });
  }

  function priceHtml(p) {
    if (p.salePrice != null && p.salePrice > 0 && p.salePrice < p.price) {
      return `<span class="was">${vnd(p.price)}</span><span class="now">${vnd(p.salePrice)}</span>`;
    }
    return vnd(p.price);
  }

  function rowHtml(p) {
    const thumb = (p.imageIds && p.imageIds[0])
      ? `<img class="adm-thumb" src="${imgUrl(p.imageIds[0])}" alt="" draggable="false">`
      : `<div class="adm-thumb ph">—</div>`;
    return `
      <div class="adm-row ${p.active ? '' : 'inactive'}" data-id="${p.id}" draggable="true">
        <span class="drag" title="Kéo để sắp xếp">⠿</span>
        ${thumb}
        <div class="adm-info">
          <div class="nm">${esc(p.name)}</div>
          <div class="px">${priceHtml(p)}</div>
          <div class="adm-tags">
            <span class="adm-tag">${esc(catLabel(p.category))}</span>
            ${p.badge ? `<span class="adm-tag badge">${esc(p.badge)}</span>` : ''}
            ${p.sizes && p.sizes.length ? `<span class="adm-tag">Size: ${esc(p.sizes.join(', '))}</span>` : ''}
            ${p.colors && p.colors.length ? `<span class="adm-tag">${esc(p.colors.join(', '))}</span>` : ''}
          </div>
        </div>
        <div class="acts">
          <label class="adm-toggle" title="${p.active ? 'Đang hiện' : 'Đang ẩn'}">
            <input type="checkbox" class="js-active" ${p.active ? 'checked' : ''}>
            <span class="track"></span><span class="knob"></span>
          </label>
          <button class="adm-btn ghost sm js-edit">Sửa</button>
          <button class="adm-btn danger sm js-del">Xóa</button>
        </div>
      </div>`;
  }

  function renderList() {
    if (!paneEl) return;
    const list = paneEl.querySelector('#admList');
    const countEl = paneEl.querySelector('#admCount');
    const vis = visibleProducts();
    countEl.textContent = `${vis.length}/${products.length} SP`;
    if (!vis.length) {
      list.innerHTML = `<div class="adm-empty">${products.length ? 'Không khớp bộ lọc.' : 'Chưa có sản phẩm. Bấm “+ Thêm sản phẩm”.'}</div>`;
      return;
    }
    list.innerHTML = vis.map(rowHtml).join('');
    list.querySelectorAll('.adm-row').forEach((row) => {
      const id = row.dataset.id;
      row.querySelector('.js-edit').addEventListener('click', () => openEditor(products.find((p) => p.id === id)));
      row.querySelector('.js-del').addEventListener('click', () => delProduct(id));
      row.querySelector('.js-active').addEventListener('change', (e) => toggleActive(id, e.target.checked));
    });
    wireDragReorder(list);
  }

  // ---------- drag reorder (native DnD, only meaningful when no filter active) ----------
  function wireDragReorder(list) {
    let dragId = null;
    list.querySelectorAll('.adm-row').forEach((row) => {
      row.addEventListener('dragstart', (e) => {
        if (searchQ || catFilter) {
          e.preventDefault();
          return;
        }
        dragId = row.dataset.id;
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        const order = [...list.querySelectorAll('.adm-row')].map((r) => r.dataset.id);
        const current = products.map((p) => p.id);
        if (order.join() !== current.join()) reorder(order);
        dragId = null;
      });
    });
    list.addEventListener('dragover', (e) => {
      e.preventDefault();
      const after = dragAfter(list, e.clientY);
      const dragging = list.querySelector('.dragging');
      if (!dragging) return;
      if (after == null) list.appendChild(dragging);
      else list.insertBefore(dragging, after);
    });
  }
  function dragAfter(list, y) {
    const rows = [...list.querySelectorAll('.adm-row:not(.dragging)')];
    return rows.reduce(
      (closest, row) => {
        const box = row.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) return { offset, el: row };
        return closest;
      },
      { offset: Number.NEGATIVE_INFINITY, el: null }
    ).el;
  }

  // ====================================================
  // EDITOR DRAWER
  // ====================================================
  function buildDrawer() {
    if (drawerEl) return;
    scrimEl = document.createElement('div');
    scrimEl.className = 'adm-drawer-scrim';
    scrimEl.addEventListener('click', closeEditor);

    drawerEl = document.createElement('div');
    drawerEl.className = 'adm-drawer';
    drawerEl.innerHTML = `
      <h2 id="admDrawerTitle">Sản phẩm</h2>
      <div class="adm-form">
        <div class="adm-field">
          <label>Tên sản phẩm *</label>
          <input type="text" id="fName" maxlength="200" placeholder="VD: Đầm Lụa Hai Dây">
        </div>
        <div class="adm-field-row">
          <div class="adm-field">
            <label>Giá (₫)</label>
            <input type="number" id="fPrice" min="0" step="1000" placeholder="0">
          </div>
          <div class="adm-field">
            <label>Giá sale (₫, để trống nếu không sale)</label>
            <input type="number" id="fSale" min="0" step="1000" placeholder="">
          </div>
        </div>
        <div class="adm-field-row">
          <div class="adm-field">
            <label>Danh mục</label>
            <select id="fCat">${CATS.map((c) => `<option value="${c.v}">${c.l}</option>`).join('')}</select>
          </div>
          <div class="adm-field">
            <label>Nhãn (badge)</label>
            <input type="text" id="fBadge" maxlength="60" placeholder="VD: Mới về / Số lượng cuối">
          </div>
        </div>
        <div class="adm-field">
          <label>Màu sắc</label>
          <div class="adm-tags-input" id="fColorsWrap">
            <span class="adm-chips" id="fColors"></span>
            <input type="text" id="fColorInput" placeholder="Nhập màu rồi Enter (VD: Đen, Kem)…" autocomplete="off">
          </div>
        </div>
        <div class="adm-field">
          <label>Size</label>
          <div class="adm-size-chips" id="fSizes"></div>
        </div>
        <div class="adm-field">
          <label>Mô tả sản phẩm (size theo số ký, chất liệu…) — hiện khi khách bấm vào ảnh</label>
          <textarea id="fDesc" maxlength="2000" rows="4" placeholder="VD:&#10;S: dưới 48kg · M: 49-55kg · L: 56-63kg&#10;Chất liệu lụa mềm mát, form suông"></textarea>
        </div>
        <div class="adm-field">
          <label>Hình ảnh (kéo vuốt xem nhiều ảnh trên preview)</label>
          <div class="adm-imgs" id="fImgs"></div>
          <input type="file" id="fFile" accept="image/*" multiple hidden>
        </div>
      </div>
      <div class="adm-drawer-foot">
        <button class="adm-btn ghost" id="admCancel">Hủy</button>
        <button class="adm-btn" id="admSave">Lưu sản phẩm</button>
      </div>`;
    document.body.appendChild(scrimEl);
    document.body.appendChild(drawerEl);

    drawerEl.querySelector('#admCancel').addEventListener('click', closeEditor);
    drawerEl.querySelector('#admSave').addEventListener('click', saveDraft);
    drawerEl.querySelector('#fFile').addEventListener('change', (e) => uploadFiles(e.target.files));

    const colorInput = drawerEl.querySelector('#fColorInput');
    colorInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addColor(colorInput.value);
        colorInput.value = '';
      } else if (e.key === 'Backspace' && !colorInput.value && draft && draft.colors.length) {
        draft.colors.pop();
        renderDraftColors();
      }
    });
    colorInput.addEventListener('blur', () => {
      if (colorInput.value.trim()) {
        addColor(colorInput.value);
        colorInput.value = '';
      }
    });
    drawerEl.querySelector('#fColorsWrap').addEventListener('click', () => colorInput.focus());
  }

  function addColor(val) {
    if (!draft) return;
    String(val)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((c) => {
        if (c.length > 40) c = c.slice(0, 40);
        if (!draft.colors.some((x) => x.toLowerCase() === c.toLowerCase())) draft.colors.push(c);
      });
    renderDraftColors();
  }
  function renderDraftColors() {
    const wrap = drawerEl.querySelector('#fColors');
    wrap.innerHTML = (draft.colors || [])
      .map(
        (c, i) =>
          `<span class="adm-chip-tag" data-i="${i}">${esc(c)}<button class="rm" title="Xóa">×</button></span>`
      )
      .join('');
    wrap.querySelectorAll('.adm-chip-tag .rm').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = +btn.closest('.adm-chip-tag').dataset.i;
        draft.colors.splice(idx, 1);
        renderDraftColors();
      });
    });
  }
  function renderSizeChips() {
    const wrap = drawerEl.querySelector('#fSizes');
    wrap.innerHTML = SIZE_OPTIONS.map(
      (s) => `<button type="button" class="adm-size-chip ${draft.sizes.includes(s) ? 'on' : ''}" data-s="${s}">${s}</button>`
    ).join('');
    wrap.querySelectorAll('.adm-size-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const s = btn.dataset.s;
        if (draft.sizes.includes(s)) draft.sizes = draft.sizes.filter((x) => x !== s);
        else draft.sizes = SIZE_OPTIONS.filter((o) => o === s || draft.sizes.includes(o)); // giữ thứ tự chuẩn
        renderSizeChips();
      });
    });
  }

  function openEditor(product) {
    buildDrawer();
    draft = product
      ? { ...product, imageIds: [...(product.imageIds || [])], colors: [...(product.colors || [])], sizes: [...(product.sizes || [])] }
      : { id: null, name: '', price: 0, salePrice: null, category: 'phukien', badge: 'Mới về', imageIds: [], colors: [], sizes: [], description: null };
    drawerEl.querySelector('#admDrawerTitle').textContent = product ? 'Sửa sản phẩm' : 'Thêm sản phẩm';
    drawerEl.querySelector('#fName').value = draft.name || '';
    drawerEl.querySelector('#fPrice').value = draft.price || 0;
    drawerEl.querySelector('#fSale').value = draft.salePrice != null ? draft.salePrice : '';
    drawerEl.querySelector('#fCat').value = draft.category || 'phukien';
    drawerEl.querySelector('#fBadge').value = draft.badge || '';
    drawerEl.querySelector('#fDesc').value = draft.description || '';
    drawerEl.querySelector('#fColorInput').value = '';
    renderDraftColors();
    renderSizeChips();
    renderDraftImages();
    scrimEl.classList.add('open');
    drawerEl.classList.add('open');
    setTimeout(() => drawerEl.querySelector('#fName').focus(), 60);
  }
  function closeEditor() {
    draft = null;
    if (scrimEl) scrimEl.classList.remove('open');
    if (drawerEl) drawerEl.classList.remove('open');
  }

  function renderDraftImages() {
    const wrap = drawerEl.querySelector('#fImgs');
    const ids = (draft && draft.imageIds) || [];
    wrap.innerHTML =
      ids
        .map(
          (id) =>
            `<div class="adm-img" data-id="${id}"><img src="${imgUrl(id)}" alt=""><button class="rm" title="Xóa ảnh">×</button></div>`
        )
        .join('') + `<button class="adm-img-add" id="fAdd" title="Thêm ảnh">+</button>`;
    wrap.querySelectorAll('.adm-img .rm').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.closest('.adm-img').dataset.id;
        draft.imageIds = draft.imageIds.filter((x) => x !== id);
        renderDraftImages();
      });
    });
    wrap.querySelector('#fAdd').addEventListener('click', () => drawerEl.querySelector('#fFile').click());
  }

  async function uploadFiles(fileList) {
    const files = [...(fileList || [])];
    drawerEl.querySelector('#fFile').value = '';
    for (const file of files) {
      const ph = document.createElement('div');
      ph.className = 'adm-img uploading';
      drawerEl.querySelector('#fImgs').insertBefore(ph, drawerEl.querySelector('#fAdd'));
      try {
        const blob = await compress(file);
        const fd = new FormData();
        fd.append('image', blob, (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg');
        const res = await fetch(API + '/images', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'upload lỗi');
        draft.imageIds.push(data.id);
      } catch (err) {
        toast('Upload ảnh lỗi: ' + err.message, true);
      }
    }
    renderDraftImages();
  }

  // Nén ảnh client-side → JPEG ≤ ~1200px để giảm dung lượng BYTEA.
  function compress(file) {
    return new Promise((resolve) => {
      if (!/^image\//.test(file.type)) return resolve(file);
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX = 1200;
        let { width: w, height: h } = img;
        if (w > MAX || h > MAX) {
          const s = Math.min(MAX / w, MAX / h);
          w = Math.round(w * s);
          h = Math.round(h * s);
        }
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        cv.toBlob((b) => resolve(b || file), 'image/jpeg', 0.86);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    });
  }

  async function saveDraft() {
    const name = drawerEl.querySelector('#fName').value.trim();
    if (!name) {
      toast('Nhập tên sản phẩm', true);
      return;
    }
    const saleRaw = drawerEl.querySelector('#fSale').value;
    const body = {
      name,
      price: parseInt(drawerEl.querySelector('#fPrice').value, 10) || 0,
      salePrice: saleRaw === '' ? null : parseInt(saleRaw, 10) || 0,
      category: drawerEl.querySelector('#fCat').value,
      badge: drawerEl.querySelector('#fBadge').value.trim() || null,
      imageIds: draft.imageIds,
      colors: draft.colors,
      sizes: draft.sizes,
      description: drawerEl.querySelector('#fDesc').value.trim() || null,
    };
    const u = getUser();
    const saveBtn = drawerEl.querySelector('#admSave');
    saveBtn.disabled = true;
    try {
      if (draft.id) {
        await apiJson('/' + draft.id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        body.createdBy = (u && (u.displayName || u.username)) || null;
        body.sortOrder = products.length;
        await apiJson('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      toast(draft.id ? 'Đã cập nhật' : 'Đã thêm sản phẩm');
      closeEditor();
      await refresh();
    } catch (err) {
      toast('Lưu lỗi: ' + err.message, true);
    } finally {
      saveBtn.disabled = false;
    }
  }

  // ---------- actions ----------
  async function delProduct(id) {
    const p = products.find((x) => x.id === id);
    if (!confirm(`Xóa sản phẩm “${(p && p.name) || ''}”?`)) return;
    try {
      await apiJson('/' + id, { method: 'DELETE' });
      toast('Đã xóa');
      await refresh();
    } catch (err) {
      toast('Xóa lỗi: ' + err.message, true);
    }
  }
  async function toggleActive(id, val) {
    try {
      await apiJson('/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: val }),
      });
      const p = products.find((x) => x.id === id);
      if (p) p.active = val;
      drivePreview();
      toast(val ? 'Đã hiện sản phẩm' : 'Đã ẩn sản phẩm');
    } catch (err) {
      toast('Lỗi: ' + err.message, true);
      refresh();
    }
  }
  async function reorder(order) {
    // optimistic: sắp lại mảng theo order
    const map = new Map(products.map((p) => [p.id, p]));
    products = order.map((id) => map.get(id)).filter(Boolean);
    drivePreview();
    try {
      await apiJson('/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      });
    } catch (err) {
      toast('Sắp xếp lỗi: ' + err.message, true);
      refresh();
    }
  }

  // ---------- refresh ----------
  async function refresh() {
    try {
      products = await fetchProducts(isAdmin);
    } catch (err) {
      if (isAdmin) toast('Tải danh sách lỗi: ' + err.message, true);
      return;
    }
    if (isAdmin) renderList();
    drivePreview();
  }

  // ---------- SSE ----------
  function subscribe() {
    if (es) return;
    try {
      es = new EventSource(SSE_URL);
      const onEvt = debounce(() => refresh(), 500);
      es.addEventListener('update', onEvt);
      es.onerror = () => {
        /* EventSource tự reconnect */
      };
    } catch (_) {}
  }

  // ====================================================
  // GIỎ HÀNG KHÁCH (visitor carts — /api/showroom-carts)
  // ====================================================
  const CARTS_API = WORKER + '/api/showroom-carts';
  const CARTS_SSE_URL = WORKER + '/api/realtime/sse?keys=showroom_carts';

  async function cartsApi(path) {
    const res = await fetch(CARTS_API + (path || ''));
    let data = null;
    try {
      data = await res.json();
    } catch (_) {}
    if (!res.ok || (data && data.success === false)) {
      throw new Error((data && data.error) || `HTTP ${res.status}`);
    }
    return data;
  }

  function timeAgo(ts) {
    if (!ts) return '';
    const s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60) return 'vừa xong';
    if (s < 3600) return Math.floor(s / 60) + ' phút trước';
    if (s < 86400) return Math.floor(s / 3600) + ' giờ trước';
    return Math.floor(s / 86400) + ' ngày trước';
  }

  async function refreshCarts() {
    if (!isAdmin || !paneEl) return;
    try {
      const data = await cartsApi('/?recent=30');
      carts = (data && data.carts) || [];
    } catch (err) {
      const list = paneEl.querySelector('#admCartList');
      if (list) list.innerHTML = `<div class="adm-empty">Tải giỏ hàng lỗi: ${esc(err.message)}</div>`;
      return;
    }
    renderCarts();
  }

  // ⚠ name/image/size/color của item do KHÁCH tự gửi → mọi field PHẢI qua esc() (chống stored-XSS)
  function cartRowHtml(c) {
    const itemsHtml = (c.items || [])
      .map((it) => {
        const img = it.image
          ? `<img class="adm-cart-thumb" src="${esc(it.image)}" alt="" loading="lazy">`
          : '<span class="adm-cart-thumb ph"></span>';
        const line = (Number(it.price) || 0) * (Number(it.qty) || 0);
        const vt = [it.size, it.color].filter(Boolean).join(' · ');
        return `<div class="adm-cart-item">${img}<span class="q">${Number(it.qty) || 0}×</span><span class="n">${esc(it.name)}${vt ? ` <em class="v">${esc(vt)}</em>` : ''}</span><span class="p">${vnd(line)}</span></div>`;
      })
      .join('');
    return `
      <div class="adm-cart-row">
        <div class="adm-cart-rowhead">
          <b class="vid">#${Number(c.visitorId)}</b>
          <span class="ct">${Number(c.itemCount) || 0} SP</span>
          <b class="tt">${vnd(c.total)}</b>
          <span class="tm">${esc(timeAgo(c.updatedAt))}</span>
        </div>
        <div class="adm-cart-items">${itemsHtml || '<div class="adm-empty sm">Giỏ trống</div>'}</div>
      </div>`;
  }

  async function renderCarts() {
    if (!paneEl) return;
    const list = paneEl.querySelector('#admCartList');
    if (!list) return;
    let show = carts;
    if (cartSearchQ) {
      const q = cartSearchQ.replace(/^#/, '');
      show = carts.filter((c) => String(c.visitorId).includes(q));
      if (!show.length && /^\d+$/.test(q)) {
        // mã không nằm trong recent 30 → tra trực tiếp server
        try {
          const data = await cartsApi('/?id=' + q);
          show = (data && data.carts) || [];
        } catch (_) {
          show = [];
        }
        if (q !== cartSearchQ.replace(/^#/, '')) return; // user đã gõ tiếp — bỏ kết quả cũ
      }
      if (!show.length) {
        list.innerHTML = `<div class="adm-empty">Không tìm thấy mã #${esc(q)}</div>`;
        return;
      }
    }
    if (!show.length) {
      list.innerHTML = '<div class="adm-empty">Chưa có giỏ hàng nào.</div>';
      return;
    }
    list.innerHTML = show.map(cartRowHtml).join('');
  }

  // EventSource RIÊNG cho topic showroom_carts — không nới SSE_URL chung
  // (subscribe() chạy cho cả guest; nới key sẽ làm mọi guest reload SP mỗi khi 1 khách sửa giỏ)
  function subscribeCarts() {
    if (cartsEs) return;
    try {
      cartsEs = new EventSource(CARTS_SSE_URL);
      const onEvt = debounce(() => refreshCarts(), 500);
      cartsEs.addEventListener('update', onEvt);
      cartsEs.onerror = () => {
        /* EventSource tự reconnect */
      };
    } catch (_) {}
  }
  function closeCarts() {
    if (cartsEs) {
      try {
        cartsEs.close();
      } catch (_) {}
      cartsEs = null;
    }
  }

  // ---------- activate / teardown ----------
  function evaluate() {
    const want = authed() && window.innerWidth >= MIN_DESKTOP;
    if (want && !isAdmin) {
      isAdmin = true;
      document.body.classList.add('admin-on');
      buildPane();
      buildDrawer();
      refresh(); // reload với ?all=1 + render list
      refreshCarts();
      subscribeCarts();
    } else if (!want && isAdmin) {
      isAdmin = false;
      document.body.classList.remove('admin-on');
      closeEditor();
      closeCarts();
      refresh(); // về chế độ guest (chỉ active)
    }
  }

  // ---------- init ----------
  function start() {
    evaluate();
    if (!isAdmin) refresh(); // guest: vẫn nạp data thật để preview phản ánh SP đã quản lý
    subscribe();
    window.addEventListener('resize', debounce(evaluate, 250));
  }

  // Chờ window.authManager sẵn sàng (shared-auth-manager tự init), tối đa ~3s.
  function waitAuth(tries) {
    if (window.authManager || tries <= 0) return start();
    setTimeout(() => waitAuth(tries - 1), 150);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => waitAuth(20));
  } else {
    waitAuth(20);
  }
})();
