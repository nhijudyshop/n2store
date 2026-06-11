// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Showroom1 — trang xem chi tiết sản phẩm (bấm vào ảnh trên card).
// Sheet trượt lên gần full màn hình: ảnh LỚN swipe qua lại + chấm đếm số ảnh,
// bên dưới là thông tin SP (tên, giá, size — không có size thì "Freesize", màu,
// mô tả sản phẩm do shop nhập ở admin: size theo số ký, chất liệu…).
// Nút "Thêm vào giỏ" → đóng detail rồi gọi ShowroomCart.addWithOptions (picker/fly).
(function () {
  'use strict';

  let built = false;
  let current = null; // product đang xem
  let idx = 0; // ảnh hiện tại
  let imgs = [];

  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  const vnd = (n) => (Number(n) || 0).toLocaleString('vi-VN') + '₫';

  function build() {
    if (built) return;
    const screen = $('.screen');
    if (!screen) return;
    const scrim = document.createElement('div');
    scrim.className = 'sheet-scrim';
    scrim.id = 'detailScrim';
    const sheet = document.createElement('div');
    sheet.className = 'sheet detail-sheet';
    sheet.id = 'detailSheet';
    sheet.innerHTML =
      '<button class="detail-close" id="detailClose" aria-label="Đóng">×</button>' +
      '<div class="sheet-body detail-body">' +
        '<div class="detail-imgwrap" id="detailImgwrap">' +
          '<div class="detail-track" id="detailTrack"></div>' +
        '</div>' +
        '<div class="detail-dots" id="detailDots"></div>' +
        '<div class="detail-info">' +
          '<div class="detail-name" id="detailName"></div>' +
          '<div class="detail-price" id="detailPrice"></div>' +
          '<div class="detail-row" id="detailSizes"></div>' +
          '<div class="detail-row" id="detailColors"></div>' +
          '<div class="detail-desc" id="detailDesc"></div>' +
        '</div>' +
      '</div>' +
      '<div class="sheet-foot detail-foot">' +
        '<button class="btn-apply detail-add" id="detailAdd">Thêm vào giỏ</button>' +
      '</div>';
    screen.appendChild(scrim);
    screen.appendChild(sheet);
    scrim.addEventListener('click', close);
    sheet.querySelector('#detailClose').addEventListener('click', close);
    sheet.querySelector('#detailAdd').addEventListener('click', () => {
      if (!current || !window.ShowroomCart) return;
      const src = $('#detailTrack img'); // điểm xuất phát animation bay
      const p = current;
      close(); // đóng detail trước → picker/pill hiện rõ
      window.ShowroomCart.addWithOptions(p, src);
    });
    bindSwipe(sheet.querySelector('#detailImgwrap'));
    // bấm chấm → nhảy tới ảnh đó
    sheet.querySelector('#detailDots').addEventListener('click', (e) => {
      const dot = e.target.closest('span');
      if (!dot) return;
      const i = [...$('#detailDots').children].indexOf(dot);
      if (i >= 0) go(i);
    });
    built = true;
  }

  // swipe ảnh lớn — cùng pattern carousel của card (pointer events)
  function bindSwipe(w) {
    const track = () => $('#detailTrack');
    let sx = 0;
    let dx = 0;
    let drag = false;
    w.addEventListener('pointerdown', (e) => {
      drag = true;
      sx = e.clientX;
      dx = 0;
      track().style.transition = 'none';
      try {
        w.setPointerCapture(e.pointerId);
      } catch (_) {}
    });
    w.addEventListener('pointermove', (e) => {
      if (!drag) return;
      dx = e.clientX - sx;
      track().style.transform = 'translateX(calc(' + -idx * 100 + '% + ' + dx + 'px))';
    });
    const end = () => {
      if (!drag) return;
      drag = false;
      track().style.transition = '';
      if (Math.abs(dx) > w.offsetWidth * 0.16) go(idx + (dx < 0 ? 1 : -1));
      else go(idx);
      dx = 0;
    };
    w.addEventListener('pointerup', end);
    w.addEventListener('pointercancel', end);
  }

  function go(i) {
    idx = Math.max(0, Math.min(imgs.length - 1, i));
    const track = $('#detailTrack');
    if (track) track.style.transform = 'translateX(' + -idx * 100 + '%)';
    [...$('#detailDots').children].forEach((d, k) => d.classList.toggle('active', k === idx));
  }

  function render() {
    const p = current;
    imgs = Array.isArray(p.images) && p.images.length ? p.images : [];
    $('#detailTrack').innerHTML = (imgs.length ? imgs : [null])
      .map((src) => '<div class="detail-slide">' + (src ? '<img src="' + esc(src) + '" alt="" draggable="false">' : '') + '</div>')
      .join('');
    // chấm đếm số ảnh — luôn hiện để khách biết có bao nhiêu tấm
    $('#detailDots').innerHTML =
      imgs.length > 1 ? imgs.map((_, i) => '<span class="' + (i === idx ? 'active' : '') + '"></span>').join('') : '';
    $('#detailName').textContent = p.name || '';
    const sale = p.salePrice != null && p.salePrice > 0 && p.salePrice < p.price;
    $('#detailPrice').innerHTML = sale
      ? '<span class="was">' + vnd(p.price) + '</span><span class="now">' + vnd(p.salePrice) + '</span>'
      : vnd(p.price);
    // Size — mặc định không có size là Freesize
    const sizes = Array.isArray(p.sizes) ? p.sizes.filter(Boolean) : [];
    $('#detailSizes').innerHTML =
      '<span class="lbl">Size</span>' +
      (sizes.length
        ? sizes.map((s) => '<span class="chip">' + esc(s) + '</span>').join('')
        : '<span class="chip free">Freesize</span>');
    const colors = Array.isArray(p.colors) ? p.colors.filter(Boolean) : [];
    $('#detailColors').innerHTML = colors.length
      ? '<span class="lbl">Màu</span>' + colors.map((c) => '<span class="chip">' + esc(c) + '</span>').join('')
      : '';
    $('#detailColors').style.display = colors.length ? '' : 'none';
    // Mô tả (size theo số ký, chất liệu…) — admin nhập, multi-line
    const desc = (p.description || '').trim();
    $('#detailDesc').innerHTML = desc ? esc(desc).replace(/\n/g, '<br>') : '';
    $('#detailDesc').style.display = desc ? '' : 'none';
  }

  function open(product, startIdx) {
    if (!product) return;
    build();
    if (!built) return;
    current = product;
    idx = 0;
    render();
    if (startIdx) go(startIdx); // mở đúng tấm khách đang xem trên card
    $('#detailScrim').classList.add('open');
    $('#detailSheet').classList.add('open');
  }
  function close() {
    const scrim = $('#detailScrim');
    const sheet = $('#detailSheet');
    if (scrim) scrim.classList.remove('open');
    if (sheet) sheet.classList.remove('open');
  }

  window.ShowroomDetail = { open: open, close: close };
})();
