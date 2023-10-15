// Dữ liệu hàng tồn sản phẩm ban đầu
let inventoryData = [
    { phanLoai: 'Áo', hinhAnh: './../Picture/[A1279] A1 ÁO TOMMYHILFIGER SỌC MÀU SIZE S.jpg', tenSanPham: 'TOMMYHILFIGER SỌC MÀU', kichCo: ['S', 'M', 'L'], soLuong: [5, 2, 1] },
    { phanLoai: 'Quần', hinhAnh: './../Picture/[A1414] A1 ÁO TRẮNG ADIDAS CHỮ TÍM SIZE L.jpg', tenSanPham: 'ÁO TRẮNG ADIDAS CHỮ TÍM', kichCo: ['S', 'M', 'L'], soLuong: [9, 6, 3] },
    // Thêm dữ liệu cho các sản phẩm và kích cỡ khác
];

// Lấy tbody của bảng
const tbody = document.getElementById('productTableBody');

// Lấy thẻ select
const filterCategorySelect = document.getElementById('filterCategory');

// Sử dụng sự kiện 'change' để tự động áp dụng bộ lọc khi người dùng thay đổi giá trị
filterCategorySelect.addEventListener('change', applyCategoryFilter);

// Lấy thẻ form và xử lý sự kiện nút "Thêm dữ liệu"
const productForm = document.getElementById('productForm');
productForm.addEventListener('submit', addProduct);

// Hiển thị dữ liệu hàng tồn sản phẩm trong bảng
function displayInventoryData() {
    tbody.innerHTML = '';
    inventoryData.forEach((item, rowIndex) => {
        item.kichCo.forEach((kichCo, index) => {
            const row = document.createElement('tr');
            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete';
            deleteButton.innerText = 'Xoá';
            deleteButton.onclick = () => deleteInventory(item, index);
            const quantityInput = document.createElement('input');
            quantityInput.type = 'number';
            quantityInput.value = item.soLuong[index];
            quantityInput.setAttribute('min', '0');
            quantityInput.setAttribute('step', '1');
            quantityInput.setAttribute('onchange', `updateInventory(this, ${index}, '${item.tenSanPham}')`);

            // Hiển thị số thứ tự, thời gian upload, phân loại ở hàng đầu tiên của mỗi sản phẩm
            if (index === 0) {
                row.innerHTML = `
                    <td>${rowIndex + 1}</td>
                    <td>${getFormattedDate()}</td>
                    <td>${item.phanLoai}</td>
                    <td><img src="${item.hinhAnh}" alt="Hình sản phẩm"></td>
                    <td>${item.tenSanPham}</td>
                    <td>${kichCo}</td>
                    <td>
                        <input type="number" value="${item.soLuong[index]}" min="0" step="1" onchange="updateInventory(this, ${index}, '${item.tenSanPham}')">
                    </td>
                    <td></td>
                `;
            } else {
                // Ẩn số thứ tự, thời gian upload, phân loại cho các hàng khác
                row.innerHTML = `
                    <td></td>
                    <td></td>
                    <td>${item.phanLoai}</td>
                    <td><img src="${item.hinhAnh}" alt="Hình sản phẩm"></td>
                    <td>${item.tenSanPham}</td>
                    <td>${kichCo}</td>
                    <td>
                        <input type="number" value="${item.soLuong[index]}" min="0" step="1" onchange="updateInventory(this, ${index}, '${item.tenSanPham}')">
                    </td>
                    <td></td>
                `;
            }

            row.querySelector('td:last-child').appendChild(deleteButton);
            tbody.appendChild(row);
        });
    });
}

// Hàm để lấy thời gian hiện tại và định dạng theo dd/mm/yyyy
function getFormattedDate() {
    const currentDate = new Date();
    const day = currentDate.getDate().toString().padStart(2, '0');
    const month = (currentDate.getMonth() + 1).toString().padStart(2, '0'); // Tháng bắt đầu từ 0
    const year = currentDate.getFullYear();
    return `${day}/${month}/${year}`;
}

// Hàm áp dụng bộ lọc phân loại
function applyCategoryFilter() {
    const filterCategory = filterCategorySelect.value;

    // Lặp qua từng hàng của bảng và xử lý việc ẩn/cuộn hàng dựa trên phân loại
    const rows = document.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const categoryCell = row.querySelector('td:nth-child(3)'); // Lấy cột phân loại
        const category = categoryCell.textContent.trim();

        if (filterCategory === 'all' || category === filterCategory) {
            row.style.display = ''; // Hiển thị hàng nếu phân loại khớp hoặc đang chọn "Tất cả"
        } else {
            row.style.display = 'none'; // Ẩn hàng nếu phân loại không khớp
        }
    });
}

const soLuongInput = document.getElementById('soLuong');

soLuongInput.addEventListener('input', function () {
    const enteredValue = parseInt(soLuongInput.value);

    if (enteredValue < 1) {
        alert('Số lượng phải lớn hơn hoặc bằng 1');
        soLuongInput.value = '1'; // Đặt lại giá trị thành 1 nếu người dùng nhập số nhỏ hơn 1
    }
});

// Cập nhật số lượng sản phẩm khi người dùng thay đổi giá trị
function updateInventory(input, index, tenSanPham) {
    const newQuantity = parseInt(input.value);
    inventoryData.forEach(item => {
        if (item.tenSanPham === tenSanPham) {
            item.soLuong[index] = newQuantity;
            if (newQuantity === 0) {
                // Nếu số lượng giảm về 0, xoá hàng khỏi bảng
                const rowToRemove = input.parentElement.parentElement;
                rowToRemove.remove();
            }
        }
    });
}

// Xoá sản phẩm khi người dùng ấn nút "Xoá"
function deleteInventory(item, index) {
    item.kichCo.splice(index, 1);
    item.soLuong.splice(index, 1);
    displayInventoryData();
}

// Xử lý sự kiện nút "Thêm dữ liệu"
function addProduct(event) {
    event.preventDefault(); // Ngăn chặn việc gửi biểu mẫu

    // Lấy giá trị từ các trường nhập liệu
    const phanLoai = document.getElementById('phanLoai').value;
    const hinhAnh = './../Picture/' + document.getElementById('hinhAnhInput').files[0].name;
    const tenSanPham = document.getElementById('tenSanPham').value;
    const kichCo = document.getElementById('kichCo').value;
    const soLuong = parseInt(document.getElementById('soLuong').value);

    // Kiểm tra xem sản phẩm có tồn tại trong inventoryData không
    let existingProduct = inventoryData.find(item => item.tenSanPham === tenSanPham);

    // Nếu sản phẩm chưa tồn tại, tạo một mục mới cho nó
    if (!existingProduct) {
        existingProduct = {
            phanLoai: phanLoai,
            hinhAnh: hinhAnh,
            tenSanPham: tenSanPham,
            kichCo: [],
            soLuong: []
        };
        inventoryData.push(existingProduct);
    }

    // Kiểm tra xem kích cỡ đã tồn tại trong sản phẩm không
    const existingSizeIndex = existingProduct.kichCo.indexOf(kichCo);

    // Nếu kích cỡ đã tồn tại, cập nhật số lượng
    if (existingSizeIndex !== -1) {
        existingProduct.soLuong[existingSizeIndex] += soLuong;
    } else {
        // Nếu kích cỡ chưa tồn tại, thêm mới nó
        existingProduct.kichCo.push(kichCo);
        existingProduct.soLuong.push(soLuong);
    }

    // Cập nhật bảng sản phẩm
    displayInventoryData();

    // Xóa dữ liệu khỏi các trường sau khi thêm
    document.getElementById('hinhAnhInput').value = '';
    document.getElementById('tenSanPham').value = '';
    document.getElementById('soLuong').value = '';
}

// Gọi hàm để hiển thị dữ liệu ban đầu và cài đặt sự kiện cho input tệp hình ảnh
displayInventoryData();

const hinhAnhInput = document.getElementById('hinhAnhInput');
hinhAnhInput.addEventListener('change', function () {
    if (hinhAnhInput.files.length > 0) {
        const tenTepHinhAnh = hinhAnhInput.files[0].name;
        const tenSanPhamInput = document.getElementById('tenSanPham');
        tenSanPhamInput.value = tenTepHinhAnh.split('.').slice(0, -1).join('.');
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