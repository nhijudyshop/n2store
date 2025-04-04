// For Firebase JS SDK v7.20.0 and later, measurementId is optional
function _0x1ab2(_0x36a23b, _0x52223b) {
    const _0x2e058f = _0x2e05();
    return _0x1ab2 = function(_0x1ab212, _0x4110aa) {
        _0x1ab212 = _0x1ab212 - 0x162;
        let _0x120a0e = _0x2e058f[_0x1ab212];
        return _0x120a0e;
    }, _0x1ab2(_0x36a23b, _0x52223b);
}

function _0x2e05() {
    const _0x5a5dc7 = ['1235460FrnjKH', '22977963vpMYJv', 'AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM', 'n2shop-69e37-ne0q1', 'G-TEJH3S2T1D', '1345047lnZTNJ', '366711YpKMry', '13142736zaWdgA', '598906493303', '3756921uppNah', '25XRvqCS', 'n2shop-69e37', '14dthlHY', 'n2shop-69e37.firebaseapp.com', '10009662EXBqRi'];
    _0x2e05 = function() {
        return _0x5a5dc7;
    };
    return _0x2e05();
}
const _0x3a343d = _0x1ab2;
(function(_0x46d1e0, _0x1a2442) {
    const _0x1acdbc = _0x1ab2,
        _0x2a2d1c = _0x46d1e0();
    while (!![]) {
        try {
            const _0x1aa040 = parseInt(_0x1acdbc(0x168)) / 0x1 + -parseInt(_0x1acdbc(0x16f)) / 0x2 * (-parseInt(_0x1acdbc(0x169)) / 0x3) + parseInt(_0x1acdbc(0x163)) / 0x4 * (-parseInt(_0x1acdbc(0x16d)) / 0x5) + parseInt(_0x1acdbc(0x162)) / 0x6 + -parseInt(_0x1acdbc(0x16c)) / 0x7 + parseInt(_0x1acdbc(0x16a)) / 0x8 + -parseInt(_0x1acdbc(0x164)) / 0x9;
            if (_0x1aa040 === _0x1a2442) break;
            else _0x2a2d1c['push'](_0x2a2d1c['shift']());
        } catch (_0x3223ad) {
            _0x2a2d1c['push'](_0x2a2d1c['shift']());
        }
    }
}(_0x2e05, 0xd647a));
const firebaseConfig = {
    'apiKey': _0x3a343d(0x165),
    'authDomain': _0x3a343d(0x170),
    'projectId': _0x3a343d(0x16e),
    'storageBucket': _0x3a343d(0x166),
    'messagingSenderId': _0x3a343d(0x16b),
    'appId': '1:598906493303:web:46d6236a1fdc2eff33e972',
    'measurementId': _0x3a343d(0x167)
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storageRef = firebase.storage().ref();
const collectionRef = db.collection("ck");

const moneyTransferForm = document.getElementById('moneyTransferForm');
const tableBody = document.getElementById('tableBody');
const toggleFormButton = document.getElementById('toggleFormButton');
const dataForm = document.getElementById('dataForm');
const ngayck = document.getElementById('ngayck');
const transferAmountInput = document.getElementById('transferAmount');
const totalAmountElement = document.getElementById('totalAmount');
const loginButton = document.getElementById('loginButton');
const dateFilterDropdown = document.getElementById('dateFilter');
const loginContainer = document.querySelector('.login-container');
const loginBox = document.querySelector('.login-box');
// const logoutButton = document.createElement('button');
const editModal = document.getElementById('editModal');
let editingRow;
const userType = localStorage.getItem('userType');

const checkLogin = localStorage.getItem('checkLogin');
var arrayData = [];
var arrayDate = [];

ngayck.valueAsDate = new Date();
editModal.style.display = 'none';

toggleFormButton.addEventListener('click', () => {
    if (checkLogin == 0 || checkLogin == 1 || checkLogin == 2) {
        if (dataForm.style.display === 'none' || dataForm.style.display === '') {
            dataForm.style.display = 'block';
            toggleFormButton.textContent = 'Ẩn biểu mẫu';
        } else {
            dataForm.style.display = 'none';
            toggleFormButton.textContent = 'Hiện biểu mẫu';
        }
    }
});

function formatDate(date) {
    const year = date.getFullYear() % 100;
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const formattedDate = `${day}-${month}-${year}`;

    return formattedDate;
}

function moveRowToBottom(row) {
    const parentTable = row.parentNode;
    parentTable.appendChild(row);
}

moneyTransferForm.addEventListener('submit', function(e) {
    e.preventDefault();

    const currentDate = new Date(ngayck.value);

    const formattedDate = formatDate(currentDate);

    const transferNote = document.getElementById('transferNote').value;
    let transferAmount = transferAmountInput.value.replace(/[,\.]/g, '');
    transferAmount = parseFloat(transferAmount);

    const selectedBank = document.getElementById('bank').value;
    const customerInfo = document.getElementById('customerInfo').value;

    if (isNaN(transferAmount)) {
        alert('Vui lòng nhập số tiền chuyển hợp lệ.');
        return;
    }

    const newRow = tableBody.insertRow(0);
    const dateCell = newRow.insertCell(0);
    const noteCell = newRow.insertCell(1);
    const amountCell = newRow.insertCell(2);
    const bankCell = newRow.insertCell(3);
    const deliveryCell = newRow.insertCell(4);
    const customerInfoCell = newRow.insertCell(5);
    const editCell = newRow.insertCell(6);
    const deleteCell = newRow.insertCell(7);

    newRow.style.opacity = '1.0';

    dateCell.innerText = formattedDate;
    noteCell.innerText = transferNote;
    amountCell.innerText = numberWithCommas(transferAmount);
    bankCell.innerText = selectedBank;
    customerInfoCell.innerText = customerInfo;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.style.width = '20px';
    checkbox.style.height = '20px';
    deliveryCell.appendChild(checkbox);

    const editButton = document.createElement('button');
    editButton.className = 'edit-button';
    // editButton.innerText = 'Sửa';
    editCell.appendChild(editButton);

    // Thêm nút xoá vào ô deleteCell
    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-button';
    // deleteButton.innerText = 'Xoá';
    deleteCell.appendChild(deleteButton);

    moneyTransferForm.reset();
    //updateTotalAmount();

    // Chuyển đổi thành timestamp
    const tempTimeStamp = new Date();
    var timestamp = currentDate.getTime() + (tempTimeStamp.getMinutes() * 60 + tempTimeStamp.getSeconds()) * 1000;
    dateCell.id = timestamp.toString();

    var dataToUpload = {
        dateCell: timestamp.toString(),
        noteCell: transferNote,
        amountCell: numberWithCommas(transferAmount),
        bankCell: selectedBank,
        customerInfoCell: customerInfo,
        user: userType.split('-')[0]
    };

    if (checkLogin != 0) {
        deleteCell.style.visibility = 'hidden';
        if (checkLogin == 1) {
            deliveryCell.style.visibility = 'visible';
        } else {
            editCell.style.visibility = 'hidden';
            deliveryCell.style.visibility = 'hidden';
        }
    }

    showFloatingAlert("Loading...");

    // Kiểm tra xem tài liệu đã tồn tại chưa
    collectionRef.doc("ck").get().then(doc => {
        if (doc.exists) {
            // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
            collectionRef.doc("ck").update({
                ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload)
            }).then(function() {
                showFloatingAlert("Done!");
                console.log("Document tải lên thành công");
            }).catch(function(error) {
                alert('Lỗi khi tải document lên.');
                return;
                console.error("Lỗi khi tải document lên: ", error);
            });
        } else {
            // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
            collectionRef.doc("ck").set({
                ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload)
            }).then(function() {
                showFloatingAlert("Done!");
                console.log("Document tải lên thành công");
            }).catch(function(error) {
                alert('Lỗi khi tải document lên.');
                return;
                console.error("Lỗi khi tải document lên: ", error);
            });
        }
    })
    ngayck.valueAsDate = currentDate;
    arrayDate.push(formattedDate);

    arrayDate.sort(function(a, b) {
        var dateA = parseDate(a);
        var dateB = parseDate(b);
        return dateA - dateB;
    });

    while (dateFilterDropdown.options.length > 1) {
        dateFilterDropdown.remove(1);
    }

    for (let i = 0; i < arrayDate.length; i++) {
        const option = document.createElement('option');
        option.value = arrayDate[i];
        option.textContent = arrayDate[i];
        dateFilterDropdown.appendChild(option);
    }
});

const clearDataButton = document.getElementById('clearDataButton');

clearDataButton.addEventListener('click', function() {
    const currentDate = new Date(ngayck.value);
    ngayck.valueAsDate = currentDate;
    moneyTransferForm.reset();
    //updateTotalAmount();
});

transferAmountInput.addEventListener('blur', function() {
    let value = this.value.replace(/[,\.]/g, '');
    value = parseFloat(value);

    if (!isNaN(value)) {
        this.value = numberWithCommas(value);
    }
});

// Luu thong tin dang nhap
document.addEventListener('DOMContentLoaded', function() {
    var isLoggedIn = localStorage.getItem('isLoggedIn');

    if (isLoggedIn === 'true') {
        loginBox.style.display = 'none';
        document.querySelector('.tieude').innerText += 'Tài khoản ' + userType.split('-')[0];
        // logoutButton.textContent = 'Đăng xuất';
        // logoutButton.className = 'logout-button';
        const parentContainer = document.getElementById('parentContainer');
        parentContainer.style.display = 'flex';
        parentContainer.style.justifyContent = 'center';
        parentContainer.style.alignItems = 'center';
        // parentContainer.appendChild(logoutButton);
    } else {
        window.location.href = '../index.html';
    }

    // Xoá quảng cáo
    var divToRemove = document.querySelector('div[style="text-align: right;position: fixed;z-index:9999999;bottom: 0;width: auto;right: 1%;cursor: pointer;line-height: 0;display:block !important;"]');

    if (divToRemove) {
        divToRemove.remove();
    }
});

// function clearLoginForm() {
//     // Đặt lại giá trị của các trường input
//     inputUsername.value = '';
//     inputPassword.value = '';
// }

// logoutButton.addEventListener('click', function() {
//     localStorage.removeItem('isLoggedIn');
//     //alert('Đã đăng xuất.');
//     location.reload();
// });

tableBody.addEventListener('click', function(e) {
    if (checkLogin != 777) {
        if (e.target.classList.contains('edit-button')) {

            document.getElementById('editModal').style.display = 'block';

            const editDate = document.getElementById('editDate');
            const editNote = document.getElementById('editNote');
            const editAmount = document.getElementById('editAmount');
            const editBank = document.getElementById('editBank');
            const editInfo = document.getElementById('editInfo');

            const row = e.target.parentNode.parentNode;

            const date = row.cells[0].innerText;
            const note = row.cells[1].innerText;
            const amount = row.cells[2].innerText;
            const bank = row.cells[3].innerText;
            const delivery = row.cells[4].innerText;
            const customerInfo = row.cells[5].innerText;

            //const editedRow = prompt('Sửa thông tin:', `${date} | ${note} | ${amount} | ${bank} | ${delivery} | ${customerInfo}`);
            var editedData = '';
            if (checkLogin == 0 || checkLogin == 1) {
                //editedRow = prompt('Sửa thông tin:', `${date} | ${note} | ${amount} | ${bank} | ${customerInfo}`); //Bỏ date, delivery
                editDate.disabled = false;
                editNote.disabled = false;
                editAmount.disabled = false;
                editBank.disabled = false;
                editDate.value = date;
                editNote.value = note;
                editAmount.value = amount;
                editBank.value = bank;
                editInfo.value = customerInfo;
            } else {
                //editedRow = prompt('Sửa thông tin:', `${customerInfo}`); //Bỏ date, delivery, bank, amount, note
                editDate.disabled = true;
                editNote.disabled = true;
                editAmount.disabled = true;
                editBank.disabled = true;
                editInfo.value = customerInfo;
            }

            editingRow = row;
        }
        if (e.target.classList.contains('delete-button')) {
            if (checkLogin != 0) {
                alert('Không đủ quyền thực hiện chức năng này.');
                e.target.checked = !e.target.checked;
                return;
            } else {
                const confirmDelete = confirm("Bạn có chắc chắn muốn xóa?");
                const row = event.target.closest("tr");
                const tdRow = row.querySelector("td");
                if (confirmDelete) {
                    showFloatingAlert("Loading...");
                    if (row) {
                        // Lấy dữ liệu từ Firestore, xử lý và cập nhật lại Firestore
                        collectionRef.doc("ck").get()
                            .then((doc) => {
                                if (doc.exists) {
                                    // Sao chép dữ liệu
                                    const data = doc.data(); // Sao chép mảng

                                    for (let i = 0; i < data["data"].length; i++) {
                                        if (tdRow.id === data["data"][i].dateCell) {
                                            data["data"].splice(i, 1); // Xoá phần tử tại vị trí i
                                            // break; // Kết thúc vòng lặp sau khi xoá
                                        }
                                    }

                                    // Kiểm tra xem tài liệu đã tồn tại chưa
                                    collectionRef.doc("ck").get().then(doc => {
                                        if (doc.exists) {
                                            // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                            collectionRef.doc("ck").update({
                                                "data": data["data"]
                                            }).then(function() {
                                                console.log("Document tải lên thành công");
                                                showFloatingAlert("Done!");
                                                // location.reload();
                                            }).catch(function(error) {
                                                console.error("Lỗi khi tải document lên: ", error);
                                            });
                                        } else {
                                            // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                            collectionRef.doc("ck").set({
                                                "data": data["data"]
                                            }).then(function() {
                                                console.log("Document tải lên thành công");
                                                showFloatingAlert("Done!");
                                                // location.reload();
                                            }).catch(function(error) {
                                                console.error("Lỗi khi tải document lên: ", error);
                                            });
                                        }
                                    }).catch(function(error) {
                                        console.error("Lỗi khi kiểm tra tài liệu tồn tại: ", error);
                                    });
                                }
                            })
                            .catch((error) => {
                                console.error("Lỗi lấy document:", error);
                            });
                        row.remove();
                        const rows = tableBody.querySelectorAll("tr");
                        rows.forEach((row, index) => {
                            row.cells[0].textContent = rows.length - index; // Gán số thứ tự giảm dần
                        });
                    }
                }
            }
        } else if (e.target.type === 'checkbox') {
            if (checkLogin != 0 && checkLogin != 1) {
                alert('Không đủ quyền thực hiện chức năng này.');
                e.target.checked = !e.target.checked;
                return;
            }

            const isChecked = e.target.checked;

            const row = e.target.parentNode.parentNode;
            const confirmationMessage = isChecked ? 'Bạn có chắc đơn này đã được đi?' : 'Đã hủy xác nhận đi đơn';
            const tdRow = row.querySelector("td");

            if (confirm(confirmationMessage)) {
                showFloatingAlert("Loading...");
                // Lấy dữ liệu từ Firestore, xử lý và cập nhật lại Firestore
                collectionRef.doc("ck").get()
                    .then((doc) => {
                        if (doc.exists) {
                            const data = doc.data();

                            for (let i = 0; i < data["data"].length; i++) {
                                if (tdRow.id === data["data"][i].dateCell) {
                                    // Thay đổi trạng thái của dữ liệu (ví dụ: làm mờ)
                                    data["data"][i].muted = !data["data"][i].muted;
                                    row.style.opacity = data["data"][i].muted ? 0.5 : 1.0;
                                    break;
                                }
                            }

                            // Cập nhật dữ liệu Firestore
                            collectionRef.doc("ck").update({
                                "data": data["data"]
                            }).then(function() {
                                row.style.opacity = 0.5;
                                //updateTotalAmount();
                                showFloatingAlert("Done!");
                                console.log("Document tải lên thành công");
                            }).catch(function(error) {
                                alert('Lỗi khi tải document lên.');
                                console.error("Lỗi khi tải document lên: ", error);
                            });
                        }
                    })
                    .catch((error) => {
                        alert('Lỗi khi tải document lên.');
                        console.error("Lỗi lấy document:", error);
                    });
                //if (isChecked) {
                //    moveRowToBottom(row);
                //}
            } else {
                e.target.checked = !isChecked;
            }
        } else {
            if (checkLogin == 0) {
                const tooltip = document.getElementById("tooltip");
                const row = e.target.closest("tr"); // Lấy hàng (row) được click
                if (!row) return; // Nếu không click vào hàng thì thoát

                const deleteButton = row.querySelector(".delete-button"); // Tìm nút delete trong hàng
                const value = deleteButton ? deleteButton.id : "Không có nút xóa"; // Lấy id của deleteButton

                tooltip.textContent = value;
                tooltip.style.display = "block";

                // Đặt vị trí tooltip gần con trỏ chuột
                tooltip.style.top = e.pageY + 10 + "px";
                tooltip.style.left = e.pageX + 10 + "px";

                // Ẩn tooltip sau 1 giây
                setTimeout(() => {
                    tooltip.style.display = "none";
                }, 1000);
            }
        }
    } else {
        if (e.target.type === 'checkbox') {
            e.target.checked = false;
        }
    }
});

function numberWithCommas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function updateTotalAmount(selectedDate) {
    let totalAmount = 0;

    // Lấy tất cả các dòng phù hợp với ngày được chọn
    const visibleRows = Array.from(tableBody.rows).filter(row => {
        const date = row.cells[0].innerText;
        return selectedDate === "all" || selectedDate === date;
    });

    // Tính tổng số tiền cho các dòng hiển thị
    for (let i = 0; i < visibleRows.length; i++) {
        const amount = parseFloat(visibleRows[i].cells[2].innerText.replace(/[,\.]/g, ''));
        if (!isNaN(amount)) {
            totalAmount += amount;
        }
    }

    totalAmountElement.innerText = 'Tổng Tiền: ' + numberWithCommas(totalAmount);
}


dateFilterDropdown.addEventListener('change', function() {
    var selectedDate = dateFilterDropdown.value;
    updateTotalAmount(selectedDate);

    var rows = tableBody.getElementsByTagName("tr");

    for (var i = 0; i < rows.length; i++) {
        var cells = rows[i].getElementsByTagName("td");

        if (cells.length > 0) {
            var firstTdInnerText = cells[0].innerText;
            if (selectedDate === firstTdInnerText || selectedDate === "all") {
                rows[i].style.display = 'table-row';
            } else {
                rows[i].style.display = 'none'; // Ẩn các đợt live khác
            }
        }
    }
});

function updateTable() {
    var tempDate = [];
    collectionRef.doc("ck").get()
        .then((doc) => {
            if (doc.exists) {
                // Sao chép dữ liệu
                const data = doc.data(); // Sao chép mảng

                if (!Array.isArray(data["data"])) {
                    console.error("Lỗi: data['data'] không phải là một mảng hoặc chưa được khởi tạo.", data);
                } else {
                    // Sort data based on dateCell before adding rows to table
                    data["data"].sort(function(a, b) {
                        var dateDifference = parseInt(a.dateCell) - parseInt(b.dateCell);

                        // If both a and b are muted, place them at the bottom
                        if (a.muted && b.muted) {
                            return dateDifference; // Preserve date order for muted items
                        } else if (a.muted) {
                            return 1; // Move muted item to the bottom
                        } else if (b.muted) {
                            return -1; // Move muted item to the bottom
                        }

                        return dateDifference; // Default behavior for non-muted items
                    });

                    arrayData = data["data"];

                    for (let i = 0; i < data["data"].length; i++) {
                        // Định dạng ngày tháng năm + giờ phút
                        var timestamp = parseFloat(data["data"][i].dateCell); // Chuyển đổi chuỗi thành số nguyên
                        var dateCellConvert = new Date(timestamp);
                        var formattedTime = formatDate(dateCellConvert);

                        const dateFilterDropdown = document.getElementById('dateFilter');

                        // folderRef là một tham chiếu tới một thư mục
                        if (!tempDate.includes(formattedTime.replace(/\//g, '-'))) {
                            tempDate.push(formattedTime.replace(/\//g, '-'));
                        }

                        const newRow = tableBody.insertRow();
                        const dateCell = newRow.insertCell(0);
                        const noteCell = newRow.insertCell(1);
                        const amountCell = newRow.insertCell(2);
                        const bankCell = newRow.insertCell(3);
                        const deliveryCell = newRow.insertCell(4);
                        const customerInfoCell = newRow.insertCell(5);
                        const editCell = newRow.insertCell(6);
                        const deleteCell = newRow.insertCell(7);

                        dateCell.innerText = formattedTime.replace(/\//g, '-');
                        dateCell.id = data["data"][i].dateCell;
                        noteCell.innerText = data["data"][i].noteCell;
                        amountCell.innerText = numberWithCommas(data["data"][i].amountCell.replace(/[,\.]/g, ''));
                        bankCell.innerText = data["data"][i].bankCell;
                        customerInfoCell.innerText = data["data"][i].customerInfoCell;

                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.style.width = '20px';
                        checkbox.style.height = '20px';

                        checkbox.checked = data["data"][i].muted;

                        if (checkLogin != 0) {
                            newRow.style.opacity = data["data"][i].muted ? '0.5' : '1.0';
                            deleteCell.style.visibility = 'hidden';
                            if (checkLogin == 1) {
                                deliveryCell.style.visibility = 'visible';
                            } else {
                                editCell.style.visibility = 'hidden';
                                deliveryCell.style.visibility = 'hidden';
                            }
                        } else {
                            const elements = [
                                dateCell, noteCell, amountCell,
                                bankCell, deliveryCell, customerInfoCell,
                                editCell
                            ];

                            const isMuted = data["data"][i].muted;
                            const opacityValue = isMuted ? '0.5' : '1.0';

                            elements.forEach(element => {
                                element.style.opacity = opacityValue;
                            });

                            deleteCell.style.pointerEvents = "auto"; // Đảm bảo có thể click
                        }

                        deliveryCell.appendChild(checkbox);

                        const editButton = document.createElement('button');
                        editButton.className = 'edit-button';
                        // editButton.id = row.user;
                        editCell.appendChild(editButton);

                        const deleteButton = document.createElement('button');
                        deleteButton.className = 'delete-button';
                        deleteButton.id = data["data"][i].user;
                        deleteCell.appendChild(deleteButton);
                    }

                    tempDate.sort(function(a, b) {
                        var dateA = parseDate(a);
                        var dateB = parseDate(b);
                        return dateA - dateB;
                    });

                    arrayDate = tempDate;

                    for (let i = 0; i < tempDate.length; i++) {
                        const option = document.createElement('option');
                        option.value = tempDate[i];
                        option.textContent = tempDate[i];
                        dateFilterDropdown.appendChild(option);
                    }

                    //updateTotalAmount();
                }
                updateSuggestions();
            }
        })
        .catch((error) => {
            console.error("Lỗi lấy document:", error);
        });
}

function parseDate(dateString) {
    var parts = dateString.split('-');
    var year = parseInt('20' + parts[2]);
    var month = parseInt(parts[1]) - 1;
    var day = parseInt(parts[0]);
    return new Date(year, month, day);
}

function convertToTimestamp(dateString) {
    const tempTimeStamp = new Date();
    var parts = dateString.split("-");
    var year = parts[2].length === 2 ? "20" + parts[2] : parts[2];
    var formattedDate = year + "-" + parts[1] + "-" + parts[0];
    var timestamp = new Date(formattedDate).getTime() + (tempTimeStamp.getMinutes() * 60 + tempTimeStamp.getSeconds()) * 1000;
    return timestamp.toString();
}

function closeModal() {
    document.getElementById('editModal').style.display = 'none';
}

function saveChanges() {
    const editDate = document.getElementById('editDate').value;
    if (!isValidDateFormat(editDate)) {
        alert('Nhập đúng ngày-tháng-năm');
        return;
    }

    const editDateTimestamp = convertToTimestamp(editDate);

    const editNote = document.getElementById('editNote').value;
    const editAmount = document.getElementById('editAmount').value;
    const editBank = document.getElementById('editBank').value;
    const editInfo = document.getElementById('editInfo').value;

    const row = editingRow;
    const rawDate = row.cells[0].innerText;
    const tdRow = row.querySelector("td");

    var editedAmount = 0;
    var editedData = [editDateTimestamp, editNote, editAmount, editBank, editInfo];
    if (isNaN(editedAmount)) {
        alert('Vui lòng nhập số tiền chuyển hợp lệ.');
        return;
    }

    showFloatingAlert("Loading...");

    collectionRef.doc("ck").get()
        .then((doc) => {
            if (doc.exists) {
                // Sao chép dữ liệu
                const data = doc.data(); // Sao chép mảng
                var tempData = '';

                for (let i = 0; i < data["data"].length; i++) {
                    if (tdRow.id === data["data"][i].dateCell) {
                        if (checkLogin == 0 || checkLogin == 1) {
                            if (rawDate != editDate) {
                                data["data"][i].dateCell = editedData[0];
                            }
                            data["data"][i].noteCell = editedData[1];
                            data["data"][i].amountCell = editedData[2];
                            data["data"][i].bankCell = editedData[3];
                            data["data"][i].customerInfoCell = editedData[4];
                            data["data"][i].user = userType.split('-')[0];
                        } else {
                            data["data"][i].customerInfoCell = editedData[0];
                            data["data"][i].user = userType.split('-')[0];
                        }
                        tempData = data["data"][i];
                        break; // Kết thúc vòng lặp sau khi xoá
                    }
                }

                // Kiểm tra xem tài liệu đã tồn tại chưa
                collectionRef.doc("ck").get().then(doc => {
                    if (doc.exists) {
                        // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                        collectionRef.doc("ck").update({
                            "data": data["data"]
                        }).then(function() {
                            if (checkLogin == 0 || checkLogin == 1) {
                                if (rawDate != editDate) {
                                    row.cells[0].id = editedData[0];
                                }
                                row.cells[0].innerText = editDate;
                                row.cells[1].innerText = editedData[1];
                                row.cells[2].innerText = numberWithCommas(parseFloat(editedData[2].replace(/[,\.]/g, '')));
                                row.cells[3].innerText = editedData[3];

                                const checkbox = row.cells[4].querySelector('input[type="checkbox"]');
                                //checkbox.checked = editedData[4].toLowerCase() === 'true';

                                row.cells[5].innerText = editedData[4];
                            } else {
                                row.cells[5].innerText = editedData[0];
                            }
                            //updateTotalAmount();
                            showFloatingAlert("Done!");
                            console.log("Document tải lên thành công");
                        }).catch(function(error) {
                            alert('Lỗi khi tải document lên.');
                            return;
                            console.error("Lỗi khi kiểm tra tài liệu tồn tại: ", error);
                        });
                    } else {
                        // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                        collectionRef.doc("ck").set({
                            "data": data["data"]
                        }).then(function() {
                            if (checkLogin == 0 || checkLogin == 1) {
                                if (rawDate != editDate) {
                                    row.cells[0].id = editedData[0];
                                }

                                row.cells[0].innerText = editDate;
                                row.cells[1].innerText = editedData[1];
                                row.cells[2].innerText = numberWithCommas(parseFloat(editedData[2].replace(/[,\.]/g, '')));
                                row.cells[3].innerText = editedData[3];

                                const checkbox = row.cells[4].querySelector('input[type="checkbox"]');
                                //checkbox.checked = editedData[4].toLowerCase() === 'true';

                                row.cells[5].innerText = editedData[4];
                            } else {
                                row.cells[5].innerText = editedData[0];
                            }
                            //updateTotalAmount();
                            showFloatingAlert("Done!");
                            console.log("Document tải lên thành công");
                        }).catch(function(error) {
                            alert('Lỗi khi tải document lên.');
                            return;
                            console.error("Lỗi khi kiểm tra tài liệu tồn tại: ", error);
                        });
                    }
                }).catch(function(error) {
                    alert('Lỗi khi tải document lên.');
                    return;
                    console.error("Lỗi khi kiểm tra tài liệu tồn tại: ", error);
                });
            }
        }).catch((error) => {
            alert('Lỗi khi tải document lên.');
            return;
            console.error("Lỗi lấy document:", error);
        });

    // Close the modal
    closeModal();
}

// Đăng xuất
function handleLogout() {
    // Xóa các dữ liệu liên quan đến đăng nhập từ localStorage
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userType');
    localStorage.removeItem('checkLogin');

    // Tải lại trang để áp dụng các thay đổi
    location.reload();
}

// Lắng nghe sự kiện click trên nút đăng xuất và gọi hàm xử lý tương ứng
var toggleLogoutButton = document.getElementById('toggleLogoutButton');
toggleLogoutButton.addEventListener('click', handleLogout);

function showFloatingAlert(message) {
    const alertBox = document.getElementById('floatingAlert');
    alertBox.innerText = message;
    alertBox.style.opacity = '1';

    setTimeout(() => {
        alertBox.style.opacity = '0';
    }, 3000); // Ẩn sau 3 giây
}

function isValidDateFormat(dateStr) {
    return /^\d{2}-\d{2}-\d{2}$/.test(dateStr); // Kiểm tra đúng định dạng "dd-mm-yy"
}

function updateSuggestions() {
    if (!tableBody || tableBody.rows.length === 0) return;

    const uniqueValuesNote = new Set();
    const uniqueValuesInfo = new Set();

    for (const row of tableBody.rows) {
        const note = row.cells[1]?.textContent.trim();
        const info = row.cells[5]?.textContent.trim();
        if (note) uniqueValuesNote.add(note);
        if (info) uniqueValuesInfo.add(info);
    }

    const createOptionsFragment = (values) => {
        const fragment = document.createDocumentFragment();
        values.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            fragment.appendChild(option);
        });
        return fragment;
    };

    const dataListNote = document.getElementById('suggestionsNote');
    const dataListInfo = document.getElementById('suggestionsInfo');

    if (dataListNote) {
        dataListNote.innerHTML = '';
        dataListNote.appendChild(createOptionsFragment(uniqueValuesNote));
    }
    if (dataListInfo) {
        dataListInfo.innerHTML = '';
        dataListInfo.appendChild(createOptionsFragment(uniqueValuesInfo));
    }
}

updateTable();

function exportToExcel() {
    const wsData = [
        ['Ngày', 'Ghi chú chuyển khoản', 'Số tiền chuyển', 'Ngân hàng', 'Đi đơn', 'Tên FB + SĐT']
    ];

    // Lấy dữ liệu từ bảng (bắt đầu từ dòng thứ 2)
    const tableRows = document.querySelectorAll('#tableBody tr');
    tableRows.forEach(function(row) {
        // Bỏ qua dòng tiêu đề (dòng thứ 1)
        if (row.rowIndex !== 0) {
            const rowData = [];
            row.querySelectorAll('td').forEach(function(cell, index) {
                if (index !== 6) { // Loại bỏ cột "Sửa" (cột thứ 7)
                    if (index === 4) { // Kiểm tra nếu là cột "Đi đơn"
                        const checkbox = cell.querySelector('input[type="checkbox"]');
                        if (checkbox.checked) {
                            rowData.push('1'); // Nếu được tích, giá trị là 1
                        } else {
                            rowData.push(''); // Nếu không được tích, giữ nguyên giá trị ô
                        }
                    } else {
                        rowData.push(cell.innerText);
                    }
                }
            });
            wsData.push(rowData);
        }
    });

    // Tạo một sheet từ dữ liệu
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Tạo một workbook và thêm sheet vào workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dữ liệu');

    // Lưu workbook xuống tệp Excel
    XLSX.writeFile(wb, 'dulieu.xlsx');
}