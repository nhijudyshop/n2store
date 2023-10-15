// Các biến và dữ liệu khách hàng và sản phẩm
const ALL_CATEGORIES = 'all';
const CATEGORY_AO = 'Áo';
const CATEGORY_QUAN = 'Quần';
const CATEGORY_SET_DAM = 'Set và Đầm';
const CATEGORY_PKGD = 'PKGD';

let productData = [
    { phanLoai: CATEGORY_AO, hinhAnh: './../Picture/[A1279] A1 ÁO TOMMYHILFIGER SỌC MÀU SIZE S.jpg', tenSanPham: 'TOMMYHILFIGER SỌC MÀU', thoiGianUpload: new Date('2023-10-05') },
    { phanLoai: CATEGORY_QUAN, hinhAnh: './../Picture/[A1414] A1 ÁO TRẮNG ADIDAS CHỮ TÍM SIZE L.jpg', tenSanPham: 'ÁO TRẮNG ADIDAS CHỮ TÍM', thoiGianUpload: new Date('2023-10-06') },
    // Thêm các mẫu sản phẩm khác ở đây
];

let customerData = [
    { tenKhachHang: ['./../Picture/ttkh.png', './../Picture/ttkh.png', './../Picture/ttkh.png', './../Picture/ttkh.png'] },
    { tenKhachHang: ['./../Picture/ttkh.png', './../Picture/ttkh.png'] },
    // Thêm các mẫu ảnh khách hàng khác ở đây
];

const tbody = document.querySelector('tbody');

function displayData() {
    tbody.innerHTML = '';
    let rowIndex = 0;
    for (let i = 0; i < Math.max(productData.length, customerData.length); i++) {
        const product = productData[i];
        const customer = customerData[i];

        const row = tbody.insertRow();
        const sttCell = row.insertCell();
        const hinhAnhSanPhamCell = row.insertCell();
        const tenSanPhamCell = row.insertCell();
        const anhKhachHangCell = row.insertCell();
        const toggleVisibilityCell = row.insertCell();

        rowIndex++;
        sttCell.textContent = rowIndex;

        hinhAnhSanPhamCell.innerHTML = product ? `<img src="./../Picture/${product.hinhAnh}" alt="${product.tenSanPham}" class="product-image">` : '';
        tenSanPhamCell.textContent = product ? product.tenSanPham : '';

        // Hiển thị tối đa 3 ảnh khách hàng
        if (customer) {
            const customerImages = `
                <div class="customer-image-cell">
                    ${customer.tenKhachHang.slice(0, 3).map((customerImage, index) => `
                        <img src="./../Picture/${customerImage}" alt="Hình ảnh khách hàng">
                    `).join('')}
                    ${customer.tenKhachHang.length > 3 ? `<p>(${customer.tenKhachHang.length - 3} ảnh khác)</p>` : ''}
                </div>
            `;
            anhKhachHangCell.innerHTML = customerImages;
        } else {
            anhKhachHangCell.innerHTML = '';
        }

        const hideButton = document.createElement('button');
        hideButton.innerText = 'Ẩn';
        hideButton.className = 'toggle-visibility';
        hideButton.onclick = () => toggleCustomerVisibility(row, hideButton);

        toggleVisibilityCell.appendChild(hideButton);
    }
}

function toggleCustomerVisibility(row, button) {
    const sttCell = row.cells[0];
    const hinhAnhSanPhamCell = row.cells[1];
    const tenSanPhamCell = row.cells[2];
    const anhKhachHangCell = row.cells[3];

    if (sttCell.style.display !== 'none') {
        sttCell.style.display = 'none';
        hinhAnhSanPhamCell.style.display = 'none';
        tenSanPhamCell.style.display = 'none';
        anhKhachHangCell.style.display = 'none';
        button.innerText = 'Hiện';
    } else {
        sttCell.style.display = 'table-cell';
        hinhAnhSanPhamCell.style.display = 'table-cell';
        tenSanPhamCell.style.display = 'table-cell';
        anhKhachHangCell.style.display = 'table-cell';
        button.innerText = 'Ẩn';
    }
}

// Gọi hàm displayData() để hiển thị dữ liệu ban đầu
displayData();

const dataForm = document.getElementById('dataForm');
dataForm.addEventListener('submit', function (e) {
    e.preventDefault();

    const phanLoai = document.getElementById('phanLoai').value;
    const hinhAnhInput = document.getElementById('hinhAnhInput');
    const tenSanPham = document.getElementById('tenSanPham').value;
    const hinhKhachHangInput = document.getElementById('hinhKhachHangInput');

    if (!phanLoai || !tenSanPham || !hinhKhachHangInput.files.length) {
        alert('Vui lòng điền đầy đủ thông tin.');
        return;
    }

    if (!hinhAnhInput.files.length) {
        alert('Vui lòng chọn hình ảnh sản phẩm.');
        return;
    }

    const hinhAnh = hinhAnhInput.files[0].name;

    const newProduct = {
        phanLoai: phanLoai,
        hinhAnh: hinhAnh,
        tenSanPham: tenSanPham,
        thoiGianUpload: new Date(),
    };

    productData.push(newProduct);

    const hinhKhachHang = [];
    for (let i = 0; i < hinhKhachHangInput.files.length; i++) {
        hinhKhachHang.push(hinhKhachHangInput.files[i].name);
    }

    const newCustomer = {
        tenKhachHang: hinhKhachHang,
    };

    customerData.push(newCustomer);

    displayData();

    document.getElementById('phanLoai').value = '';
    document.getElementById('hinhAnhInput').value = '';
    document.getElementById('tenSanPham').value = '';
    document.getElementById('hinhKhachHangInput').value = '';
});

const clearDataButton = document.getElementById('clearDataButton');
clearDataButton.addEventListener('click', clearFormData);

function clearFormData() {
    document.getElementById('phanLoai').value = '';
    document.getElementById('hinhAnhInput').value = '';
    document.getElementById('tenSanPham').value = '';
    document.getElementById('hinhKhachHangInput').value = '';
}

const hinhAnhInput = document.getElementById('hinhAnhInput');
hinhAnhInput.addEventListener('change', function () {
    const tenSanPhamInput = document.getElementById('tenSanPham');
    if (hinhAnhInput.files.length > 0) {
        const tenTepHinhAnh = hinhAnhInput.files[0].name;
        const tenSanPhamMacDinh = tenTepHinhAnh.split('.')[0];
        tenSanPhamInput.value = tenSanPhamMacDinh;
    } else {
        tenSanPhamInput.value = '';
    }
});

document.addEventListener('DOMContentLoaded', function () {
    const toggleFormButton = document.getElementById('toggleFormButton');
    const dataForm = document.getElementById('dataForm');

    toggleFormButton.addEventListener('click', function () {
        if (dataForm.style.display === 'none' || dataForm.style.display === '') {
            dataForm.style.display = 'block';
            toggleFormButton.textContent = 'Ẩn biểu mẫu';
        } else {
            dataForm.style.display = 'none';
            toggleFormButton.textContent = 'Hiện biểu mẫu';
        }
    });
});

// Lắng nghe sự kiện click trên nút "Xoá dữ liệu"
clearDataButton.addEventListener('click', function() {
    // Lấy tham chiếu đến biểu mẫu
    const productForm = document.getElementById('productForm');
    
    // Đặt lại giá trị của tất cả các trường trong biểu mẫu về giá trị mặc định hoặc rỗng
    productForm.reset();
    
    // Đặt lại giá trị của trường ngày là ngày hôm nay
    const dotLiveInput = document.getElementById('dotLive');
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dotLiveInput.value = `${yyyy}-${mm}-${dd}`;
});