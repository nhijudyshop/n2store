function continueToNext() {
    var selectedOption = document.getElementById('optionSelect').value;
    if (selectedOption === 'Tinh') {
        showQuantityForm();
    } else {
        // Xử lý chuyển hướng hoặc các trường hợp khác
    }
}

function showQuantityForm() {
    var formContainer = document.querySelector('.container');
    formContainer.innerHTML = `
        <div class="container">
            <h1>Nhập thông tin đơn hàng:</h1>
            <form id="quantityForm">
                <div class="form-group">
                    <label for="quantity">Số lượng đơn:</label>
                    <input type="number" id="quantity" name="quantity" required>
                </div>
                <div class="form-group">
                    <label for="totalPrice">Tổng giá trị:</label>
                    <input type="number" id="totalPrice" name="totalPrice" required>
                </div>
            </form>
            <div id="result">
                <p>Thành tiền: 0 VND</p>
            </div>
        </div>
    `;

    var quantityInput = document.getElementById('quantity');
    var totalPriceInput = document.getElementById('totalPrice');

    quantityInput.addEventListener('input', calculateTotalAmount);
    totalPriceInput.addEventListener('input', calculateTotalAmount);
}

function calculateTotalAmount() {
    var quantityInput = document.getElementById('quantity').value;
    var totalPriceInput = document.getElementById('totalPrice').value;
    
    var quantity = parseInt(quantityInput);
    var totalPrice = parseFloat(totalPriceInput);

    if (isNaN(quantity) || isNaN(totalPrice)) {
        var resultContainer = document.getElementById('result');
        resultContainer.innerHTML = `
            <p>Thành tiền: 0 VND</p>
        `;
        return;
    }

    var totalAmount = totalPrice - (23000 * quantity);
    var resultContainer = document.getElementById('result');
    resultContainer.innerHTML = `
        <p>Thành tiền: ${totalAmount.toLocaleString('vi-VN')} VND</p>
    `;
}


