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
const collectionRef = db.collection("hanghoan");

document.addEventListener("DOMContentLoaded", function() {

    const form = document.getElementById("return-product");
    const tableBody = document.getElementById("tableBody");
    const toggleFormButton = document.getElementById("toggleFormButton");
    const dataForm = document.getElementById('dataForm');
    const editModal = document.getElementById("editModal");
    let editingRow;
    let tempSTT = 0;
    let isSubmitting = false; // Biến kiểm tra trạng thái gửi form
    const loginContainer = document.querySelector('.login-container');
    const loginBox = document.querySelector('.login-box');
    const userType = localStorage.getItem('userType');

    editModal.style.display = 'none';

    toggleFormButton.addEventListener('click', () => {
        if (userType == "admin-admin" || userType == "lai-lai2506" || userType == "my-my2804" || userType == "coi-coi2806") {
            if (dataForm.style.display === 'none' || dataForm.style.display === '') {
                dataForm.style.display = 'block';
                toggleFormButton.textContent = 'Ẩn biểu mẫu';
            } else {
                dataForm.style.display = 'none';
                toggleFormButton.textContent = 'Hiện biểu mẫu';
            }
        }
    });

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

    form.addEventListener("submit", function(event) {
        event.preventDefault();

        const firstRow = tableBody.rows[0];

        if (firstRow) {
            tempSTT = parseInt(firstRow.innerText);
        } else {
            console.error("Không tìm thấy hàng đầu tiên trong bảng.");
        }

        const shipValue = form.querySelector("#ship").value;
        const scenarioValue = form.querySelector('#scenario').value
        const customerInfoValue = form.querySelector("#customerInfo").value;
        const totalAmountValue = form.querySelector("#totalAmount").value;
        const causeValue = form.querySelector("#cause").value;

        // Chuyển đổi thành timestamp
        const tempTimeStamp = new Date();

        var formattedTime = formatDate(tempTimeStamp);

        var dataToUpload = {
            shipValue: shipValue,
            scenarioValue: scenarioValue,
            customerInfoValue: customerInfoValue,
            totalAmountValue: totalAmountValue,
            causeValue: causeValue,
            duyetHoanValue: tempTimeStamp.getTime().toString()
        };

        showFloatingAlert("Loading...");
        // Kiểm tra xem tài liệu đã tồn tại chưa
        collectionRef.doc("hanghoan").get().then(doc => {
            if (doc.exists) {
                // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                collectionRef.doc("hanghoan").update({
                    ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload)
                }).then(function() {
                    showFloatingAlert("Done!");
                    console.log("Document tải lên thành công");
                }).catch(function(error) {
                    //alert('Lỗi khi tải document lên.');
                    return;
                    console.error("Lỗi khi tải document lên: ", error);
                });
            } else {
                // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                collectionRef.doc("hanghoan").set({
                    ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload)
                }).then(function() {
                    showFloatingAlert("Done!");
                    console.log("Document tải lên thành công");
                }).catch(function(error) {
                    //alert('Lỗi khi tải document lên.');
                    return;
                    console.error("Lỗi khi tải document lên: ", error);
                });
            }
        })

        const newRow = tableBody.insertRow(0);
        const STT = newRow.insertCell(0);
        const shipCell = newRow.insertCell(1);
        const scenarioCell = newRow.insertCell(2);
        const customerInfoCell = newRow.insertCell(3);
        const totalAmountCell = newRow.insertCell(4);
        const causeCell = newRow.insertCell(5);
        const checkboxCell = newRow.insertCell(6);
        const getCurrentDateCell = newRow.insertCell(7);
        const editCell = newRow.insertCell(8);
        const deleteCell = newRow.insertCell(9);

        // Gán giá trị từ biến vào ô trong bảng
        tempSTT += 1
        STT.innerText = tempSTT;
        shipCell.innerText = shipValue;
        scenarioCell.innerText = scenarioValue;
        customerInfoCell.innerText = customerInfoValue;
        totalAmountCell.innerText = totalAmountValue;
        causeCell.innerText = causeValue;
        getCurrentDateCell.innerText = formattedTime; // hoặc currentDate.toString() tùy theo định dạng mong muốn
        STT.id = dataToUpload.duyetHoanValue;

        // Thêm checkbox vào ô checkboxCell
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.style.width = '20px';
        checkbox.style.height = '20px';
        checkbox.className = 'received-checkbox'
        checkboxCell.appendChild(checkbox);

        // Thêm nút sửa vào ô editCell
        const editButton = document.createElement('button');
        editButton.className = 'edit-button';
        editButton.innerText = 'Sửa';
        editCell.appendChild(editButton);

        // Thêm nút xoá vào ô deleteCell
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-button';
        deleteButton.innerText = 'Xoá';
        deleteCell.appendChild(deleteButton);
		
		if (userType != "admin-admin") {
            deleteCell.style.visibility = 'hidden';
            if (userType == "coi-coi2806") {
                deliveryCell.style.visibility = 'visible';
            } else {
                editCell.style.visibility = 'hidden';
                deliveryCell.style.visibility = 'hidden';
            }
        }

        form.reset();
    });

    function saveChanges() {
        const editDelivery = document.getElementById('editDelivery');
        const eidtScenario = document.getElementById('eidtScenario');
        const editInfo = document.getElementById('editInfo');
        const editAmount = document.getElementById('editAmount');
        const editNote = document.getElementById('editNote');
        const editDate = document.getElementById('editDate');

        const row = editingRow;
        const rawDate = row.cells[7].innerText;
        const tdRow = row.querySelector("td");
        showFloatingAlert("Loading...");
        collectionRef.doc("hanghoan").get()
            .then((doc) => {
                if (doc.exists) {
                    const data = doc.data(); // Sao chép mảng
                    for (let i = 0; i < data["data"].length; i++) {
                        if (tdRow.id == data["data"][i].duyetHoanValue) {
                            data["data"][i].shipValue = editDelivery.value;
                            data["data"][i].scenarioValue = eidtScenario.value;
                            data["data"][i].customerInfoValue = editInfo.value;
                            data["data"][i].totalAmountValue = editAmount.value;
                            data["data"][i].causeValue = editNote.value;
                            // break; // Kết thúc vòng lặp sau khi xoá
                        }
                    }

                    // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                    return collectionRef.doc("hanghoan").set(data); // Chỉ định rõ ràng tên tài liệu cần thêm dữ liệu
                } else {
                    console.log("Document không tồn tại.");
                }
            })
            .then(() => {
                showFloatingAlert("Done!");
                console.log("Document tải lên thành công");

                editingRow.cells[1].innerText = editDelivery.value;
                editingRow.cells[2].innerText = eidtScenario.value;
                editingRow.cells[3].innerText = editInfo.value;
                editingRow.cells[4].innerText = editAmount.value;
                // Thêm các dòng sau để tránh lỗi undefined
                editingRow.cells[5].innerText = editNote.value;
                editingRow.cells[7].innerText = editDate.value;
            })
            .catch((error) => {
                alert('Lỗi khi tải document lên.');
                console.error("Lỗi khi kiểm tra tài liệu tồn tại hoặc tải document lên: ", error);
            });

        // Close the modal
        closeModal();
    }

    // Hàm lấy ngày hiện tại
    function getCurrentDate() {
        const currentDate = new Date();
        const day = currentDate.getDate().toString().padStart(2, '0');
        const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
        const year = currentDate.getFullYear();
        return `${day}-${month}-${year}`;
    }

    //---------------------------------------------------------------------------------------------------------------------
    // Sự kiện khi checkbox thay đổi
    document.addEventListener("change", function(event) {
        const target = event.target;
        if (target.classList.contains("received-checkbox")) {
            const tableBody = document.querySelector("tbody");
            const row = target.closest("tr");

            if (target.checked) {
                // Dời dòng xuống cuối bảng
                tableBody.appendChild(row);
            } else {
                // Chèn dòng lên đầu nhưng vẫn giữ thứ tự ban đầu của các dòng chưa checked
                const firstUncheckedRow = [...tableBody.rows].find(r => !r.querySelector(".received-checkbox").checked);
                if (firstUncheckedRow) {
                    tableBody.insertBefore(row, firstUncheckedRow);
                } else {
                    tableBody.insertBefore(row, tableBody.firstElementChild);
                }
            }
        }
    });

    function parseDateText(dateText) {
        const parts = dateText.split('-'); // Tách theo dấu '-'
        if (parts.length !== 3) return NaN; // Kiểm tra lỗi định dạng

        let day = parseInt(parts[0], 10);
        let month = parseInt(parts[1], 10) - 1; // Tháng trong JS tính từ 0 (0 = Jan, 1 = Feb,...)
        let year = parseInt(parts[2], 10);

        // Xử lý năm nếu chỉ có 2 chữ số (yy → 20yy)
        year += (year < 100) ? 2000 : 0;

        return new Date(year, month, day).getTime() / 1000; // Chuyển thành timestamp (giây)
    }

    function filterData() {
        const channelFilter = document.getElementById('channelFilter').value.trim().toLowerCase();
        const scenarioFilter = document.getElementById('scenarioFilter').value.trim().toLowerCase();
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;

        const timestampstartDate = startDate ? new Date(startDate).getTime() / 1000 : null;
        const timestampendDate = endDate ? new Date(endDate).getTime() / 1000 : null;

        const rowsArray = Array.from(document.querySelectorAll('#tableBody tr'));

        rowsArray.forEach(row => {
            const channelText = row.children[1].textContent.trim().toLowerCase();
            const scenarioText = row.children[2].textContent.trim().toLowerCase();
            const dateText = row.children[7].textContent.trim(); // Cột chứa ngày

            const timestampdateText = parseDateText(dateText); // Chuyển dateText thành timestamp

            // Kiểm tra điều kiện lọc
            const channelMatch = (channelFilter === "all" || channelText === channelFilter || channelFilter === "");
            const scenarioMatch = (scenarioFilter === "all" || scenarioText === scenarioFilter || scenarioFilter === "");

            // Chỉ lọc theo ngày khi cả startDate và endDate được chọn
            const dateMatch = (!isNaN(timestampdateText) &&
                ((timestampstartDate === null && timestampendDate === null) ||
                    (timestampstartDate !== null && timestampendDate !== null &&
                        timestampdateText >= timestampstartDate && timestampdateText <= timestampendDate)));

            row.style.display = (channelMatch && scenarioMatch && dateMatch) ? '' : 'none';
        });
    }

    // Lắng nghe sự kiện thay đổi trên cả 4 bộ lọc
    document.getElementById('channelFilter').addEventListener('change', filterData);
    document.getElementById('scenarioFilter').addEventListener('change', filterData);
    document.getElementById('startDate').addEventListener('change', handleDateChange);
    document.getElementById('endDate').addEventListener('change', handleDateChange);

    function handleDateChange() {
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;

        if (startDate && endDate) { // Chỉ gọi filterData() khi cả hai ô có giá trị
            filterData();
        }
    }
    //-------------------------------------------------------------------------------------------------------------------

    function updateTable() {
        var tempDate = [];
        collectionRef.doc("hanghoan").get()
            .then((doc) => {
                if (doc.exists) {
                    const data = doc.data(); // Sao chép mảng

                    // Sort data based on dateCell before adding rows to table
                    data["data"].sort(function(a, b) {
                        var dateDifference = parseInt(a.dateCell) - parseInt(b.dateCell);

                        if (a.muted && b.muted) {
                            return dateDifference;
                        } else if (a.muted) {
                            return -1;
                        } else if (b.muted) {
                            return 1;
                        }

                        return dateDifference;
                    });

                    // Lấy giá trị bộ lọc từ các dropdown
                    const channelFilter = document.getElementById('channelFilter').value;
                    const scenarioFilter = document.getElementById('scenarioFilter').value;
                    const startDate = document.getElementById('startDate').value;
                    const endDate = document.getElementById('endDate').value;

                    for (let i = 0; i < data["data"].length - 1; i++) {
                        const row = data["data"][i];

                        // Chuyển đổi và định dạng ngày tháng
                        var timestamp = parseFloat(row.duyetHoanValue); // Chuyển đổi chuỗi thành số nguyên
                        var dateCellConvert = new Date(timestamp);
                        var formattedTime = formatDate(dateCellConvert);

                        // Thêm dòng mới vào bảng
                        const newRow = tableBody.insertRow(0);
                        const STT = newRow.insertCell(0);
                        const shipValue = newRow.insertCell(1);
                        const scenarioValue = newRow.insertCell(2);
                        const customerInfoValue = newRow.insertCell(3);
                        const totalAmountValue = newRow.insertCell(4);
                        const causeValue = newRow.insertCell(5);
                        const checkboxRow = newRow.insertCell(6);
                        const getCurrentDate = newRow.insertCell(7);
                        const editCell = newRow.insertCell(8);
                        const deleteCell = newRow.insertCell(9);

                        STT.innerText = i + 1;
                        shipValue.innerText = row.shipValue;
                        scenarioValue.innerText = row.scenarioValue;
                        customerInfoValue.innerText = row.customerInfoValue;
                        totalAmountValue.innerText = row.totalAmountValue;
                        causeValue.innerText = row.causeValue;
                        getCurrentDate.innerText = formattedTime.replace(/\//g, '-');
                        STT.id = row.duyetHoanValue;

                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.style.width = '20px';
                        checkbox.style.height = '20px';
                        checkbox.className = 'received-checkbox'
                        checkbox.checked = row.muted;

                        if (userType != "admin-admin") {
                            newRow.style.opacity = row.muted ? '0.5' : '1.0';
                            deleteCell.style.visibility = 'hidden';
                            if (userType == "coi-coi2806") {
                                checkboxRow.style.visibility = 'visible';
                            } else {
                                editCell.style.visibility = 'hidden';
                                checkboxRow.style.visibility = 'hidden';
                            }
                        } else {
                            const elements = [
                                STT, shipValue, scenarioValue, customerInfoValue,
                                totalAmountValue, causeValue, checkboxRow,
                                getCurrentDate, editCell
                            ];

                            const opacityValue = row.muted ? '0.5' : '1.0';

                            elements.forEach(element => {
                                element.style.opacity = opacityValue;
                            });
                            deleteCell.style.pointerEvents = "auto"; // Đảm bảo có thể click
                        }
                        checkboxRow.appendChild(checkbox);

                        const editButton = document.createElement('button');
                        editButton.className = 'edit-button';
                        editButton.innerText = 'Sửa';
                        editCell.appendChild(editButton);

                        // Thêm nút xoá vào ô deleteCell
                        const deleteButton = document.createElement('button');
                        deleteButton.className = 'delete-button';
                        deleteButton.innerText = 'Xoá';
                        deleteCell.appendChild(deleteButton);
                    }
                }
            })
            .catch((error) => {
                console.error("Lỗi lấy document:", error);
            });
    }

    function formatDate(date) {
        const year = date.getFullYear() % 100;
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const formattedDate = `${day}-${month}-${year}`;

        return formattedDate;
    }

    tableBody.addEventListener('click', function(e) {
        if (e.target.classList.contains('edit-button')) {
            if (userType == "admin-admin" || userType == "coi-coi2806") {
                document.getElementById('editModal').style.display = 'block';

                const editDelivery = document.getElementById('editDelivery');
                const eidtScenario = document.getElementById('eidtScenario');
                const editInfo = document.getElementById('editInfo');
                const editAmount = document.getElementById('editAmount');
                const editNote = document.getElementById('editNote');
                const editDate = document.getElementById('editDate');

                const row = e.target.parentNode.parentNode;

                const selectedDelivery = row.cells[1].innerText;
                const selectScenario = row.cells[2].innerText;
                const info = row.cells[3].innerText;
                const amount = row.cells[4].innerText;
                const note = row.cells[5].innerText;
                const date = row.cells[7].innerText;

                editDelivery.value = selectedDelivery;
                eidtScenario.value = selectScenario;
                editInfo.value = info;
                editAmount.value = amount;
                editNote.value = note;
                editDate.value = date;

                editingRow = row;
            }
        } else if (e.target.classList.contains('delete-button')) {
            if (userType != "admin-admin") {
                showFloatingAlert('Không đủ quyền!');
                e.target.checked = !e.target.checked;
                return;
            } else {
                const confirmDelete = confirm("Bạn có chắc chắn muốn xóa?");
                const row = event.target.closest("tr");
                const tdRow = row.querySelector("td");
                if (confirmDelete) {
                    if (row) {
						showFloatingAlert("Loading...");
                        // Lấy dữ liệu từ Firestore, xử lý và cập nhật lại Firestore
                        collectionRef.doc("hanghoan").get()
                            .then((doc) => {
                                if (doc.exists) {
                                    // Sao chép dữ liệu
                                    const data = doc.data(); // Sao chép mảng

                                    for (let i = 0; i < data["data"].length; i++) {
                                        if (tdRow.id === data["data"][i].duyetHoanValue) {
                                            data["data"].splice(i, 1); // Xoá phần tử tại vị trí i
                                            // break; // Kết thúc vòng lặp sau khi xoá
                                        }
                                    }

                                    // Kiểm tra xem tài liệu đã tồn tại chưa
                                    collectionRef.doc("hanghoan").get().then(doc => {
                                        if (doc.exists) {
                                            // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                            collectionRef.doc("hanghoan").update({
                                                "data": data["data"]
                                            }).then(function() {
												showFloatingAlert("Done!");
												tableBody.innerText = '';
												updateTable();
                                                console.log("Document tải lên thành công");
                                                // location.reload();
                                            }).catch(function(error) {
                                                console.error("Lỗi khi tải document lên: ", error);
                                            });
                                        } else {
                                            // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                            collectionRef.doc("hanghoan").set({
                                                "data": data["data"]
                                            }).then(function() {
												showFloatingAlert("Done!");
												tableBody.innerText = '';
												updateTable();
                                                console.log("Document tải lên thành công");
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
                    }
                }
            }
        } else if (e.target.type === 'checkbox') {
            if (userType != "admin-admin" && userType != "coi-coi2806") {
                showFloatingAlert('Không đủ quyền!');
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
                collectionRef.doc("hanghoan").get()
                    .then((doc) => {
                        if (doc.exists) {
                            const data = doc.data();

                            for (let i = 0; i < data["data"].length; i++) {
                                if (tdRow.id === data["data"][i].duyetHoanValue) {
                                    // Thay đổi trạng thái của dữ liệu (ví dụ: làm mờ)
                                    data["data"][i].muted = !data["data"][i].muted;
                                    row.style.opacity = data["data"][i].muted ? 0.5 : 1.0;
                                    // break;
                                }
                            }

                            // Cập nhật dữ liệu Firestore
                            collectionRef.doc("hanghoan").update({
                                "data": data["data"]
                            }).then(function() {
								showFloatingAlert("Done!");
                                tableBody.innerText = '';
                                updateTable();
                                //updateTotalAmount();
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
        }
    })

    function convertToTimestamp(dateString) {
        const tempTimeStamp = new Date();
        var parts = dateString.split("-");
        var year = parts[2].length === 2 ? "20" + parts[2] : parts[2];
        var formattedDate = year + "-" + parts[1] + "-" + parts[0];
        var timestamp = new Date(formattedDate).getTime() + (tempTimeStamp.getMinutes() * 60 + tempTimeStamp.getSeconds()) * 1000;
        return timestamp.toString();
    }

    // Gọi hàm lấy dữ liệu từ Firestore ngay khi trang tải
    //window.onload = function () {
    //    getDataFromFirestore();
    //};

    // Đăng xuất
	function handleLogout() {
		// Đặt lại biến kiểm tra đăng nhập
		checkLogin = 0;

		// Xóa các dữ liệu liên quan đến đăng nhập từ localStorage
		localStorage.removeItem('isLoggedIn');
		localStorage.removeItem('userType');

		// Tải lại trang để áp dụng các thay đổi
		location.reload();
	}

	// Lắng nghe sự kiện click trên nút đăng xuất và gọi hàm xử lý tương ứng
	var toggleLogoutButton = document.getElementById('toggleLogoutButton');
	toggleLogoutButton.addEventListener('click', handleLogout);

    var saveButton = document.getElementById('saveButton');
    saveButton.addEventListener('click', saveChanges);

    updateTable();
});