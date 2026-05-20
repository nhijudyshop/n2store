// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

// ----- DỮ LIỆU DEMO -----
// Mỗi item gồm: id, danh mục, tên, giá (số), src ảnh, alt.
// Khi sau này nối API, chỉ cần thay PRODUCTS = await fetch(...) là xong.
const PRODUCTS = [
  // QUẦN
  { id: 'q1', category: 'quan', name: 'Quần Tây Ống Suông',     price:  580000, img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC0AlT9PwCnDgO4WwWPJyI-iYAcfKbuGbUFZo52gIh0q-SEEJKrvrVFL7Dh0eSipJNAsLGDP_AFOSE0Yqs3oyi7-ty19k2Z6JrvheVnotZTp3reGI066HyJEE54U3kdBYv65fG_8ZcagaDcR6GYQFqIPdsr1ZnramKQ92rYP8lkrqvRAHQZJdDRwp26KEoMKA6SPxFqYGz7i23PAVikiZmnAgOeLW8RU9EE_tlK6InuqWOSyR4mzW4_S5UcACbUNTef9ng4JPYwt_vP' },
  { id: 'q2', category: 'quan', name: 'Quần Lụa Cạp Cao',       price:  620000, img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCVOtRzpqLY3tSJpVFVXHrfLQu9qfujGXMwl6jLxp7Mipa2GaVqx1VvtrzBZKgAOm0Feull5gdjbJwAQ8udfyAPtT3_hFZ-sAg2KyKjKWc0baIs8HD3CwrvoBWx8J5ADDVruypHG5J2HJKITp9uqphjnazZGl2Mx7Sels1NDKR9uW0mV_atJZSawlBxOORuFjiql2BSNHDXbNiMe4vnX3Fz2EL8MBimj2k2YU3Xs2187Q0mqxG2rW4mmV0QIJhLZni1lIYSzStA4DsK' },
  { id: 'q3', category: 'quan', name: 'Quần Jeans Dáng Cigarette', price: 690000, img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAyVvi1hYjXzZBOe1PRmCt1hFlzEIeavmfRw-hAX8vzkpmGtteXmZKCKH-jxBXh7W-JNK_47nRPs5wqCEd-oERXGIuGXuqUyrQjk9-tOybig_1PDrzESSgpBXPqFXYkms-B7x6dOVuyzpgm5MZzfJq-jVENqhrwv_lcd0xrGSdY7V7vWmpf4ahd3R8PO84278xq7gtGRxY_4rcNxAMB__HxGQHBECoTsyZ3lM2eloFide5qnTO4ISAh06tI6BbPAcu1tCbTlTZy-oy5' },
  { id: 'q4', category: 'quan', name: 'Quần Linen Mùa Hè',       price:  510000, img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBXCBEvcuAqn8aN0VCoFAKDFkASbLC8E4zDv9Zuma5JAlMHsg0G2KzzceGwPtvW1Z-eFMXoskvGK0A885iUc7kUmQ-KuCg3JyqR4f_fDGSP9fzZspQbttqzcgi-cIAFsYH88UK2BiJigIrMuHZziPXB7TRikLLB0Y_PjKMhpgRDfW6E2FJi0oYNVZKfn-TZ_gJK9YCz9OuHxKt6wp3I_n_gLs2-WPN1P_TnkZT6uzIsv3RyDZUchybd3PhP-sWSGBWMXPiVdebnZyJE' },
  { id: 'q5', category: 'quan', name: 'Quần Culottes Lụa',       price:  650000, img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC5779IdoQCL5TpAn7ijpW_VWbGsgWECPsM45PVrKaWISPM5eSAE8TJZqx9sI1L_EaTTZxKm6p-b3U4BL1v8L0P4DFQMW0c88Qtw-ZBJhRLs-7kYG59YgGzIImmFkjC0mkSwE-mtN-5SFuURMDkrshH5458B23tK4fgHtLyXNiBEkblrV2X00IWgPuzweHPYLRhOLrM8J1syaPOVQiaDGqLcnB8TXTemhlvlSsnwBPiTPKvcpk6KCy1idmJEF1IRq4gvBiXf_Smn7mj' },
  { id: 'q6', category: 'quan', name: 'Quần Âu Phối Đai',        price:  720000, img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC0AlT9PwCnDgO4WwWPJyI-iYAcfKbuGbUFZo52gIh0q-SEEJKrvrVFL7Dh0eSipJNAsLGDP_AFOSE0Yqs3oyi7-ty19k2Z6JrvheVnotZTp3reGI066HyJEE54U3kdBYv65fG_8ZcagaDcR6GYQFqIPdsr1ZnramKQ92rYP8lkrqvRAHQZJdDRwp26KEoMKA6SPxFqYGz7i23PAVikiZmnAgOeLW8RU9EE_tlK6InuqWOSyR4mzW4_S5UcACbUNTef9ng4JPYwt_vP' },

  // ÁO
  { id: 'a1', category: 'ao', name: 'Áo Sơ Mi Lụa Cổ Bẻ',        price:  520000, img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCVOtRzpqLY3tSJpVFVXHrfLQu9qfujGXMwl6jLxp7Mipa2GaVqx1VvtrzBZKgAOm0Feull5gdjbJwAQ8udfyAPtT3_hFZ-sAg2KyKjKWc0baIs8HD3CwrvoBWx8J5ADDVruypHG5J2HJKITp9uqphjnazZGl2Mx7Sels1NDKR9uW0mV_atJZSawlBxOORuFjiql2BSNHDXbNiMe4vnX3Fz2EL8MBimj2k2YU3Xs2187Q0mqxG2rW4mmV0QIJhLZni1lIYSzStA4DsK' },
  { id: 'a2', category: 'ao', name: 'Áo Len Cashmere',           price:  890000, img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBXCBEvcuAqn8aN0VCoFAKDFkASbLC8E4zDv9Zuma5JAlMHsg0G2KzzceGwPtvW1Z-eFMXoskvGK0A885iUc7kUmQ-KuCg3JyqR4f_fDGSP9fzZspQbttqzcgi-cIAFsYH88UK2BiJigIrMuHZziPXB7TRikLLB0Y_PjKMhpgRDfW6E2FJi0oYNVZKfn-TZ_gJK9YCz9OuHxKt6wp3I_n_gLs2-WPN1P_TnkZT6uzIsv3RyDZUchybd3PhP-sWSGBWMXPiVdebnZyJE' },
  { id: 'a3', category: 'ao', name: 'Áo Khoác Len Mùa Thu',      price: 1080000, img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAyVvi1hYjXzZBOe1PRmCt1hFlzEIeavmfRw-hAX8vzkpmGtteXmZKCKH-jxBXh7W-JNK_47nRPs5wqCEd-oERXGIuGXuqUyrQjk9-tOybig_1PDrzESSgpBXPqFXYkms-B7x6dOVuyzpgm5MZzfJq-jVENqhrwv_lcd0xrGSdY7V7vWmpf4ahd3R8PO84278xq7gtGRxY_4rcNxAMB__HxGQHBECoTsyZ3lM2eloFide5qnTO4ISAh06tI6BbPAcu1tCbTlTZy-oy5' },

  // ĐẦM
  { id: 'd1', category: 'dam', name: 'Đầm Lụa Cổ Đổ',            price:  920000, img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC5779IdoQCL5TpAn7ijpW_VWbGsgWECPsM45PVrKaWISPM5eSAE8TJZqx9sI1L_EaTTZxKm6p-b3U4BL1v8L0P4DFQMW0c88Qtw-ZBJhRLs-7kYG59YgGzIImmFkjC0mkSwE-mtN-5SFuURMDkrshH5458B23tK4fgHtLyXNiBEkblrV2X00IWgPuzweHPYLRhOLrM8J1syaPOVQiaDGqLcnB8TXTemhlvlSsnwBPiTPKvcpk6KCy1idmJEF1IRq4gvBiXf_Smn7mj' },
  { id: 'd2', category: 'dam', name: 'Đầm Midi Tay Phồng',       price:  780000, img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBXCBEvcuAqn8aN0VCoFAKDFkASbLC8E4zDv9Zuma5JAlMHsg0G2KzzceGwPtvW1Z-eFMXoskvGK0A885iUc7kUmQ-KuCg3JyqR4f_fDGSP9fzZspQbttqzcgi-cIAFsYH88UK2BiJigIrMuHZziPXB7TRikLLB0Y_PjKMhpgRDfW6E2FJi0oYNVZKfn-TZ_gJK9YCz9OuHxKt6wp3I_n_gLs2-WPN1P_TnkZT6uzIsv3RyDZUchybd3PhP-sWSGBWMXPiVdebnZyJE' },
  { id: 'd3', category: 'dam', name: 'Đầm Linen Dáng A',         price:  690000, img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCVOtRzpqLY3tSJpVFVXHrfLQu9qfujGXMwl6jLxp7Mipa2GaVqx1VvtrzBZKgAOm0Feull5gdjbJwAQ8udfyAPtT3_hFZ-sAg2KyKjKWc0baIs8HD3CwrvoBWx8J5ADDVruypHG5J2HJKITp9uqphjnazZGl2Mx7Sels1NDKR9uW0mV_atJZSawlBxOORuFjiql2BSNHDXbNiMe4vnX3Fz2EL8MBimj2k2YU3Xs2187Q0mqxG2rW4mmV0QIJhLZni1lIYSzStA4DsK' },

  // SET
  { id: 's1', category: 'set', name: 'Set Áo Lụa & Quần Tây',    price:  750000, img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCVOtRzpqLY3tSJpVFVXHrfLQu9qfujGXMwl6jLxp7Mipa2GaVqx1VvtrzBZKgAOm0Feull5gdjbJwAQ8udfyAPtT3_hFZ-sAg2KyKjKWc0baIs8HD3CwrvoBWx8J5ADDVruypHG5J2HJKITp9uqphjnazZGl2Mx7Sels1NDKR9uW0mV_atJZSawlBxOORuFjiql2BSNHDXbNiMe4vnX3Fz2EL8MBimj2k2YU3Xs2187Q0mqxG2rW4mmV0QIJhLZni1lIYSzStA4DsK' },
  { id: 's2', category: 'set', name: 'Set Áo Len & Chân Váy',    price:  580000, img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBXCBEvcuAqn8aN0VCoFAKDFkASbLC8E4zDv9Zuma5JAlMHsg0G2KzzceGwPtvW1Z-eFMXoskvGK0A885iUc7kUmQ-KuCg3JyqR4f_fDGSP9fzZspQbttqzcgi-cIAFsYH88UK2BiJigIrMuHZziPXB7TRikLLB0Y_PjKMhpgRDfW6E2FJi0oYNVZKfn-TZ_gJK9YCz9OuHxKt6wp3I_n_gLs2-WPN1P_TnkZT6uzIsv3RyDZUchybd3PhP-sWSGBWMXPiVdebnZyJE' },
  { id: 's3', category: 'set', name: 'Set Suit Công Sở',         price: 1250000, img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC0AlT9PwCnDgO4WwWPJyI-iYAcfKbuGbUFZo52gIh0q-SEEJKrvrVFL7Dh0eSipJNAsLGDP_AFOSE0Yqs3oyi7-ty19k2Z6JrvheVnotZTp3reGI066HyJEE54U3kdBYv65fG_8ZcagaDcR6GYQFqIPdsr1ZnramKQ92rYP8lkrqvRAHQZJdDRwp26KEoMKA6SPxFqYGz7i23PAVikiZmnAgOeLW8RU9EE_tlK6InuqWOSyR4mzW4_S5UcACbUNTef9ng4JPYwt_vP' },

  // PHỤ KIỆN — chưa có ảnh riêng, dùng placeholder chung
  { id: 'p1', category: 'phu-kien', name: 'Khăn Lụa In Hoa',     price:  280000, img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBXCBEvcuAqn8aN0VCoFAKDFkASbLC8E4zDv9Zuma5JAlMHsg0G2KzzceGwPtvW1Z-eFMXoskvGK0A885iUc7kUmQ-KuCg3JyqR4f_fDGSP9fzZspQbttqzcgi-cIAFsYH88UK2BiJigIrMuHZziPXB7TRikLLB0Y_PjKMhpgRDfW6E2FJi0oYNVZKfn-TZ_gJK9YCz9OuHxKt6wp3I_n_gLs2-WPN1P_TnkZT6uzIsv3RyDZUchybd3PhP-sWSGBWMXPiVdebnZyJE' },
  { id: 'p2', category: 'phu-kien', name: 'Túi Da Cầm Tay',      price:  450000, img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC5779IdoQCL5TpAn7ijpW_VWbGsgWECPsM45PVrKaWISPM5eSAE8TJZqx9sI1L_EaTTZxKm6p-b3U4BL1v8L0P4DFQMW0c88Qtw-ZBJhRLs-7kYG59YgGzIImmFkjC0mkSwE-mtN-5SFuURMDkrshH5458B23tK4fgHtLyXNiBEkblrV2X00IWgPuzweHPYLRhOLrM8J1syaPOVQiaDGqLcnB8TXTemhlvlSsnwBPiTPKvcpk6KCy1idmJEF1IRq4gvBiXf_Smn7mj' }
];

// ----- TIỆN ÍCH -----
const formatVND = (n) => n.toLocaleString('vi-VN') + 'đ';

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ----- RENDER LƯỚI SẢN PHẨM -----
const grid = document.getElementById('product-grid');
const emptyState = document.getElementById('empty-state');

function renderGrid(category) {
  const items = PRODUCTS.filter((p) => p.category === category);
  grid.innerHTML = '';

  if (items.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  const html = items
    .map((p) => {
      const safeName = escapeAttr(p.name);
      const safeImg = escapeAttr(p.img);
      const safePrice = escapeAttr(formatVND(p.price));
      return `
        <div class="product-card aspect-square relative overflow-hidden cursor-pointer bg-surface-container-low"
             data-name="${safeName}" data-img="${safeImg}" data-price="${safePrice}">
          <img alt="${safeName}" src="${safeImg}" loading="lazy" class="w-full h-full object-cover" />
        </div>`;
    })
    .join('');

  grid.insertAdjacentHTML('beforeend', html);
}

// Event-delegated click cho cards (an toàn hơn onclick inline)
grid.addEventListener('click', (e) => {
  const card = e.target.closest('.product-card');
  if (!card) return;
  openZoom(card.dataset.img, card.dataset.name, card.dataset.price);
});

// ----- NAV CATEGORY -----
const nav = document.getElementById('category-nav');
nav.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-category]');
  if (!btn) return;
  nav.querySelectorAll('.nav-link').forEach((el) => el.classList.remove('nav-link-active'));
  btn.classList.add('nav-link-active');
  renderGrid(btn.dataset.category);
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ----- ZOOM OVERLAY -----
const overlay = document.getElementById('zoom-overlay');
const zoomedImg = document.getElementById('zoomed-image');
const zoomTitle = document.getElementById('zoom-title');
const zoomPrice = document.getElementById('zoom-price');

function openZoom(imgSrc, title, price) {
  zoomedImg.src = imgSrc;
  zoomedImg.alt = title;
  zoomTitle.textContent = title;
  zoomPrice.textContent = price;
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeZoom() {
  overlay.classList.remove('active');
  document.body.style.overflow = '';
  setTimeout(() => { zoomedImg.src = ''; }, 300);
}

// Expose ra global cho nút close inline
window.openZoom = openZoom;
window.closeZoom = closeZoom;

// Click ra ngoài ảnh để đóng
overlay.addEventListener('click', (e) => {
  if (e.target === overlay) closeZoom();
});

// ESC để đóng
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && overlay.classList.contains('active')) closeZoom();
});

// ----- KHỞI ĐỘNG -----
renderGrid('quan');
