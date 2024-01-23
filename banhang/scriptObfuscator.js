document.addEventListener('DOMContentLoaded', function () {
    // For Firebase JS SDK v7.20.0 and later, measurementId is optional
    function _0x1ab2(_0x36a23b, _0x52223b) {
        const _0x2e058f = _0x2e05();
        return _0x1ab2 = function (_0x1ab212, _0x4110aa) {
            _0x1ab212 = _0x1ab212 - 0x162;
            let _0x120a0e = _0x2e058f[_0x1ab212];
            return _0x120a0e;
        }, _0x1ab2(_0x36a23b, _0x52223b);
    }

    function _0x2e05() {
        const _0x5a5dc7 = ['1235460FrnjKH', '22977963vpMYJv', 'AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM', 'n2shop-69e37-ne0q1', 'G-TEJH3S2T1D', '1345047lnZTNJ', '366711YpKMry', '13142736zaWdgA', '598906493303', '3756921uppNah', '25XRvqCS', 'n2shop-69e37', '14dthlHY', 'n2shop-69e37.firebaseapp.com', '10009662EXBqRi'];
        _0x2e05 = function () {
            return _0x5a5dc7;
        };
        return _0x2e05();
    }
    const _0x3a343d = _0x1ab2;
    (function (_0x46d1e0, _0x1a2442) {
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

    // Create file metadata to update
    var newMetadata = {
        cacheControl: 'public,max-age=31536000',
    }

    // Initialize Firebase
    const app = firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const storageRef = firebase.storage().ref();
    const collectionRef = db.collection("banhang");
    const tableBody = document.getElementById('tableBody');
    const toggleFormButton = document.getElementById('toggleFormButton');
    const dataForm = document.getElementById('dataForm');
    const dataEditForm = document.getElementById('dataEditForm');
    const productForm = document.getElementById('productForm');
    const productEditForm = document.getElementById('productEditForm');
    const addButton = document.getElementById('addButton');
    const addEditButton = document.getElementById('addEditButton');
    const clearDataButton = document.getElementById('clearDataButton');
    const dataTable = document.querySelector('table tbody');
    const loginContainer = document.querySelector('.login-container');
    const loginBox = document.querySelector('.login-box');
    const logoutButton = document.createElement('button');
    const inputUsername = document.getElementById('username');
    const inputPassword = document.getElementById('password');
    const loginButton = document.getElementById('loginButton');
    const exitButton = document.getElementById('exitButton');
    const deleteCheckImg = document.getElementById('delete-button');
    const addButtonImg = document.getElementById('add-button');
    const nameFilterDropdown = document.getElementById('nameFilter');
    const inputFileRadio = document.getElementById('inputFile');
    const inputClipboardRadio = document.getElementById('inputClipboard');
    const inputFileContainer = document.getElementById('inputFileContainer');
    const inputClipboardContainer = document.getElementById('container');
    const hinhAnhInputFile = document.getElementById('hinhAnhInputFile');
    const hinhAnhContainer = document.getElementById('hinhAnhContainer');

    const inputEditFileRadio = document.getElementById('inputEditFile');
    const inputEditClipboardRadio = document.getElementById('inputEditClipboard');
    const inputEditFileContainer = document.getElementById('inputEditFileContainer');
    const inputEditClipboardContainer = document.getElementById('editContainer');
    const hinhAnhEditInputFile = document.getElementById('hinhAnhEditInputFile');
    const hinhAnhEditContainer = document.getElementById('hinhAnhEditContainer');

    const editModal = document.getElementById('editModal');
    const editModalSaveButton = document.getElementById('saveChanges');
    const editModalInfomation = document.getElementById('editInfo');

    var _0x4fa50d = _0x151a; (function (_0x1385bc, _0x513f8) { var _0x25059b = { _0x1ab59f: 0x103, _0x40018b: 0x10b, _0x4368e5: 0x111, _0x4302cc: 0x107, _0x1adfd4: 0x10f }, _0x4bc096 = _0x151a, _0x380626 = _0x1385bc(); while (!![]) { try { var _0x19d6af = -parseInt(_0x4bc096(_0x25059b._0x1ab59f)) / (-0x202 + -0x194e + 0x1b51) + parseInt(_0x4bc096(_0x25059b._0x40018b)) / (-0x131b + 0x133 * 0x3 + 0xf84) * (-parseInt(_0x4bc096(0x101)) / (-0x1214 + -0x1d25 + 0x2f3c)) + parseInt(_0x4bc096(_0x25059b._0x4368e5)) / (-0x2304 + 0x26e3 + -0x2f * 0x15) * (parseInt(_0x4bc096(0x108)) / (0xa06 * -0x3 + -0x4 * -0x658 + -0x11 * -0x47)) + parseInt(_0x4bc096(0x114)) / (-0x27e * -0xd + -0x1c4e * -0x1 + -0x3cae) * (-parseInt(_0x4bc096(0xff)) / (-0x25f3 + 0x10f6 + 0x1504)) + -parseInt(_0x4bc096(0x118)) / (0x7d7 * -0x3 + -0x1a7 + 0xc9a * 0x2) + -parseInt(_0x4bc096(_0x25059b._0x4302cc)) / (0xfe0 + -0xac9 * 0x1 + -0x50e) * (parseInt(_0x4bc096(_0x25059b._0x1adfd4)) / (-0x1 * 0x1a09 + 0x54d + 0xa63 * 0x2)) + parseInt(_0x4bc096(0x11c)) / (-0x12fa + -0x183c + 0x2b41); if (_0x19d6af === _0x513f8) break; else _0x380626['push'](_0x380626['shift']()); } catch (_0xe6a62) { _0x380626['push'](_0x380626['shift']()); } } }(_0x1c95, -0x14d47 + -0xa1044 * 0x1 + -0xd2ea * -0x1d)); function _0x151a(_0x1c9509, _0x151a05) { var _0xc24c1e = _0x1c95(); return _0x151a = function (_0xaea031, _0x767d40) { _0xaea031 = _0xaea031 - (-0xd4a + 0x2651 + -0x1 * 0x1809); var _0x3b523d = _0xc24c1e[_0xaea031]; return _0x3b523d; }, _0x151a(_0x1c9509, _0x151a05); } var _0x36b572 = (function () { var _0x2ec3e7 = !![]; return function (_0x351163, _0x3be201) { var _0x334e40 = _0x2ec3e7 ? function () { var _0x303f04 = _0x151a; if (_0x3be201) { var _0x207d8a = _0x3be201[_0x303f04(0x116)](_0x351163, arguments); return _0x3be201 = null, _0x207d8a; } } : function () { }; return _0x2ec3e7 = ![], _0x334e40; }; }()), _0xf1710d = _0x36b572(this, function () { var _0x1fc251 = { _0x5dd822: 0x10d, _0x544105: 0x119, _0x2aef4a: 0x106, _0x2cbdc0: 0x104, _0x4fa2f8: 0x11a }, _0x6be116 = _0x151a, _0x4980a3; try { var _0xe583ac = Function(_0x6be116(_0x1fc251._0x5dd822) + _0x6be116(0x109) + (_0x6be116(_0x1fc251._0x544105) + _0x6be116(_0x1fc251._0x2aef4a) + _0x6be116(0x11b) + '\x20)') + ');'); _0x4980a3 = _0xe583ac(); } catch (_0x53e9c6) { _0x4980a3 = window; } var _0x3f3430 = _0x4980a3[_0x6be116(_0x1fc251._0x2cbdc0)] = _0x4980a3[_0x6be116(_0x1fc251._0x2cbdc0)] || {}, _0x2b481c = ['log', 'warn', _0x6be116(_0x1fc251._0x4fa2f8), 'error', _0x6be116(0x10c), _0x6be116(0xfe), _0x6be116(0x110)]; for (var _0x46acfc = 0xf1d * -0x1 + -0x275 * 0x6 + 0x1ddb; _0x46acfc < _0x2b481c[_0x6be116(0x115)]; _0x46acfc++) { var _0x46c4f0 = _0x36b572[_0x6be116(0x117) + 'r'][_0x6be116(0x11d)][_0x6be116(0x10e)](_0x36b572), _0x3375d0 = _0x2b481c[_0x46acfc], _0x31e2c5 = _0x3f3430[_0x3375d0] || _0x46c4f0; _0x46c4f0[_0x6be116(0x102)] = _0x36b572[_0x6be116(0x10e)](_0x36b572), _0x46c4f0[_0x6be116(0x100)] = _0x31e2c5['toString'][_0x6be116(0x10e)](_0x31e2c5), _0x3f3430[_0x3375d0] = _0x46c4f0; } }); _0xf1710d(); function _0x1c95() { var _0x1cc440 = ['dHJ1YzAyMD', '6AYnzTc', 'length', 'apply', 'constructo', '9578664PUBZiH', '{}.constru', 'info', 'rn\x20this\x22)(', '23113519uqBAOw', 'prototype', 'table', '1991157ySboBy', 'toString', '516DlBGbE', '__proto__', '198488kKiXbR', 'console', 'bmdvYzE5MD', 'ctor(\x22retu', '9HbtxIy', '45KDITIH', 'nction()\x20', 'Nzc3', '12770znXnry', 'exception', 'return\x20(fu', 'bind', '27110dpEbwG', 'trace', '667092dkrWos', 'bGFpMjUwNg']; _0x1c95 = function () { return _0x1cc440; }; return _0x1c95(); } var checkLogin = 0x1c * -0xbb + -0xa * -0x367 + -0xd92; const userTypes = { 'admin': { 'password': atob('YWRtaW4='), 'checkLogin': 0x1 }, 'my': { 'password': atob('bXkyODA0'), 'checkLogin': 0x2 }, 'lai': { 'password': atob(_0x4fa50d(0x112) + '=='), 'checkLogin': 0x3 }, 'huyen': { 'password': atob('aHV5ZW4yMz' + 'A3'), 'checkLogin': 0x4 }, 'ngoc': { 'password': atob(_0x4fa50d(0x105) + 'c='), 'checkLogin': 0x5 }, 'truc': { 'password': atob(_0x4fa50d(0x113) + 'g='), 'checkLogin': 0x6 }, 'khach': { 'password': atob(_0x4fa50d(0x10a)), 'checkLogin': 0x309 } };

    // Ẩn trường nhập liệu link ban đầu
    document.querySelector('.nameFilter').style.display = 'none';
    nameFilterDropdown.style.display = 'none';
    inputFileContainer.style.display = 'none';
    inputEditFileContainer.style.display = 'none';
    editModal.style.display = 'none';

    const tempNameFilterDropdown = ['my', 'lai', 'huyen', 'ngoc', 'truc'];

    let editingRow;
    var checkLogin = 0;
    var imageUrlFile = []; // Mảng để lưu trữ URL tải về
    var imgArray = [];
    var imgEditArray = [];

    var isLoggedIn = localStorage.getItem('isLoggedIn');
    const userType = localStorage.getItem('userType');

    if (userType && Object.keys(userTypes).some(type => userType.includes(type) && userType !== `${type}-${userTypes[type].password}`)) {
        isLoggedIn = false;
        localStorage.removeItem('isLoggedIn');
    }

    if (isLoggedIn === 'true') {
        checkLogin = userTypes[userType.split('-')[0]].checkLogin;
        loginBox.style.display = 'none';
        document.querySelector('.tieude').innerText += ' - Tài khoản ' + userType.split('-')[0];
        logoutButton.textContent = 'Đăng xuất';
        logoutButton.className = 'logout-button';
        const parentContainer = document.getElementById('parentContainer');
        parentContainer.style.display = 'flex';
        parentContainer.style.justifyContent = 'center';
        parentContainer.style.alignItems = 'center';
        parentContainer.appendChild(logoutButton);

        if (checkLogin == 1) {
            document.querySelector('.nameFilter').style.display = 'block';
            nameFilterDropdown.style.display = 'block';
            for (let i = 0; i < tempNameFilterDropdown.length; i++) {
                const option = document.createElement('option');
                option.value = tempNameFilterDropdown[i];
                option.textContent = tempNameFilterDropdown[i];
                nameFilterDropdown.appendChild(option);
            }
        }
    } else {
        window.location.href = '../index.html';
    }

    inputFileRadio.addEventListener('change', function () {
        inputFileContainer.style.display = 'block';
        inputClipboardContainer.style.display = 'none';
        hinhAnhContainer.style.display = 'none';
    });

    inputClipboardRadio.addEventListener('change', function () {
        inputFileContainer.style.display = 'none';
        inputClipboardContainer.style.display = 'block';
        hinhAnhContainer.style.display = 'none';
    });

    // Add a paste event listener to the document
    inputClipboardContainer.addEventListener('paste', async function (e) {
        if (inputClipboardRadio.checked) {
            // Create a temporary file input element

            e.preventDefault();
            var items = (e.clipboardData || e.originalEvent.clipboardData).items;

            inputClipboardContainer.innerText = '';

            for (var i = 0; i < items.length; i++) {
                if (items[i].type.indexOf("image") !== -1) {
                    var blob = items[i].getAsFile(); // Tạo một Blob từ dữ liệu hình ảnh
                    var file = new File([blob], "image.jpg"); // Tạo một File từ Blob

                    // Tạo một phần tử img
                    var imgElement = document.createElement("img");

                    // Đặt thuộc tính src cho phần tử img bằng URL của tệp
                    imgElement.src = URL.createObjectURL(file);

                    imgElement.classList.add('clipboard-image');

                    imgElement.width = 150;
                    imgElement.height = 200;

                    // Thêm phần tử img vào phần tử <div>
                    inputClipboardContainer.appendChild(imgElement);

                    // Function to compress an image
                    const compressImage = async (file) => {
                        return new Promise((resolve) => {
                            const maxWidth = 500; // Set kích thước tối đa mong muốn
                            const reader = new FileReader();
                            reader.readAsDataURL(file);
                            reader.onload = function (event) {
                                const img = new Image();
                                img.src = event.target.result;
                                img.onload = function () {
                                    const canvas = document.createElement('canvas');
                                    const ctx = canvas.getContext('2d');
                                    const width = img.width;
                                    const height = img.height;

                                    // Kiểm tra xem có cần resize hay không
                                    if (width > maxWidth) {
                                        const ratio = maxWidth / width;
                                        canvas.width = maxWidth;
                                        canvas.height = height * ratio;
                                    } else {
                                        canvas.width = width;
                                        canvas.height = height;
                                    }

                                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                                    canvas.toBlob(function (blob) {
                                        const compressedFile = new File([blob], file.name, {
                                            type: file.type,
                                            lastModified: Date.now()
                                        });
                                        resolve(compressedFile);
                                    }, file.type, 0.8); // 0.8 là chất lượng của ảnh sau khi được nén (từ 0.1 đến 1.0)
                                };
                            };
                        });
                    };

                    const compressedFile = await compressImage(file);

                    imgArray.push(compressedFile);
                }
            }
        }
    });

    inputEditFileRadio.addEventListener('change', function () {
        inputEditFileContainer.style.display = 'block';
        inputEditClipboardContainer.style.display = 'none';
        hinhAnhEditContainer.style.display = 'none';
        addEditButton.disabled = true;
    });

    inputEditClipboardRadio.addEventListener('change', function () {
        inputEditFileContainer.style.display = 'none';
        inputEditClipboardContainer.style.display = 'block';
        hinhAnhEditContainer.style.display = 'none';
        addEditButton.disabled = false;
    });

    // Add a paste event listener to the document
    inputEditClipboardContainer.addEventListener('paste', async function (e) {
        if (inputEditClipboardRadio.checked) {
            // Create a temporary file input element

            e.preventDefault();
            var items = (e.clipboardData || e.originalEvent.clipboardData).items;

            inputEditClipboardContainer.innerText = '';

            for (var i = 0; i < items.length; i++) {
                if (items[i].type.indexOf("image") !== -1) {
                    var blob = items[i].getAsFile(); // Tạo một Blob từ dữ liệu hình ảnh
                    var file = new File([blob], "image.jpg"); // Tạo một File từ Blob

                    // Tạo một phần tử img
                    var imgElement = document.createElement("img");

                    // Đặt thuộc tính src cho phần tử img bằng URL của tệp
                    imgElement.src = URL.createObjectURL(file);

                    imgElement.classList.add('clipboard-image');

                    imgElement.width = 150;
                    imgElement.height = 200;

                    // Thêm phần tử img vào phần tử <div>
                    inputEditClipboardContainer.appendChild(imgElement);

                    // Function to compress an image
                    const compressImage = async (file) => {
                        return new Promise((resolve) => {
                            const maxWidth = 500; // Set kích thước tối đa mong muốn
                            const reader = new FileReader();
                            reader.readAsDataURL(file);
                            reader.onload = function (event) {
                                const img = new Image();
                                img.src = event.target.result;
                                img.onload = function () {
                                    const canvas = document.createElement('canvas');
                                    const ctx = canvas.getContext('2d');
                                    const width = img.width;
                                    const height = img.height;

                                    // Kiểm tra xem có cần resize hay không
                                    if (width > maxWidth) {
                                        const ratio = maxWidth / width;
                                        canvas.width = maxWidth;
                                        canvas.height = height * ratio;
                                    } else {
                                        canvas.width = width;
                                        canvas.height = height;
                                    }

                                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                                    canvas.toBlob(function (blob) {
                                        const compressedFile = new File([blob], file.name, {
                                            type: file.type,
                                            lastModified: Date.now()
                                        });
                                        resolve(compressedFile);
                                    }, file.type, 0.8); // 0.8 là chất lượng của ảnh sau khi được nén (từ 0.1 đến 1.0)
                                };
                            };
                        });
                    };

                    const compressedFile = await compressImage(file);

                    imgEditArray.push(compressedFile);
                }
            }
        }
    });

    // Xử lý khi nút "Hiện biểu mẫu" được click
    toggleFormButton.addEventListener('click', function () {
        if (userType != "khach-777") {
            if (dataForm.style.display === 'none' || dataForm.style.display === '') {
                dataForm.style.display = 'block';
                toggleFormButton.textContent = 'Ẩn biểu mẫu';
            } else {
                dataForm.style.display = 'none';
                toggleFormButton.textContent = 'Hiện biểu mẫu';
            }
        }
    });

    // Hàm để cập nhật lại số thứ tự
    function updateOrder() {
        var rows = dataTable.rows;
        for (var i = 0; i < rows.length; i++) {
            rows[i].cells[0].textContent = i + 1;
        }
    }

    function formatDate(date) {
        const year = date.getFullYear() % 100;
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const formattedDate = `${hours}:${minutes} ${day}-${month}-${year}`;

        return formattedDate;
    }

    // Xử lý khi checkbox được click
    dataTable.addEventListener('change', function (event) {
        var target = event.target;
        var row = target.closest('tr');
        const thoiGianElement = row.querySelector("td[id]").id.toString();
        if (target.type === 'button' && target.classList.contains('delete-button')) {
            // Thêm logic xử lý khi checkbox được click
            if (row) {
                // Hỏi xác nhận nếu checkbox được chọn
                var confirmed = true; // Giả sử mặc định đã xác nhận
                if (target.checked) {
                    confirmed = confirm('Bạn có chắc chắn đã bán sản phẩm này cho khách hàng chưa?');
                }

                // Thực hiện xử lý của bạn dựa trên xác nhận của người dùng
                if (confirmed) {
                    // Nếu đã xác nhận, thực hiện xử lý của bạn
                    if (target.checked) {
                        if (thoiGianElement) {
                            collectionRef.doc("banhang").get()
                                .then((doc) => {
                                    if (doc.exists) {
                                        // Sao chép dữ liệu
                                        const data = doc.data(); // Sao chép mảng

                                        for (let i = 0; i < data["data"].length; i++) {
                                            if (thoiGianElement === data["data"][i].thoiGian.toString()) {
                                                data["data"].splice(i, 1); // Xoá phần tử tại vị trí i
                                                break; // Kết thúc vòng lặp sau khi xoá
                                            }
                                        }

                                        // Kiểm tra xem tài liệu đã tồn tại chưa
                                        collectionRef.doc("banhang").get().then(doc => {
                                            if (doc.exists) {
                                                // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                                collectionRef.doc("banhang").update({
                                                    "data": data["data"]
                                                }).then(function () {
                                                    console.log("Document tải lên thành công");
                                                }).catch(function (error) {
                                                    console.error("Lỗi khi tải document lên: ", error);
                                                });
                                            } else {
                                                // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                                collectionRef.doc("banhang").set({
                                                    "data": data["data"]
                                                }).then(function () {
                                                    console.log("Document tải lên thành công");
                                                }).catch(function (error) {
                                                    console.error("Lỗi khi tải document lên: ", error);
                                                });
                                            }
                                        }).catch(function (error) {
                                            console.error("Lỗi khi kiểm tra tài liệu tồn tại: ", error);
                                        });
                                    }
                                })
                                .catch((error) => {
                                    console.error("Lỗi lấy document:", error);
                                });
                        }
                        row.remove();
                        updateOrder(); // Cập nhật lại số thứ tự
                    } else {
                        // Nếu checkbox bị bỏ chọn, thực hiện xử lý của bạn
                        console.log('Đã bỏ chọn hàng để xoá');
                    }
                } else {
                    // Nếu không xác nhận, bỏ chọn checkbox
                    target.checked = false;
                }
            }
        }
    });

    // Xử lý khi nút "Thêm" được click
    productForm.addEventListener('submit', async function (e) {
        if (checkLogin != 0) {
            e.preventDefault();
            document.getElementById("addButton").disabled = true;

            const ttkh = document.getElementById('ttkh').value;

            var imagesRef = storageRef.child('banhang/sp');

            if (inputFileRadio.checked) {

                createPopup('Đang tải ảnh lên', 10000);

                const hinhAnhFiles = hinhAnhInputFile.files;

                // Function to compress an image
                const compressImage = async (file) => {
                    return new Promise((resolve) => {
                        const maxWidth = 500; // Set kích thước tối đa mong muốn
                        const reader = new FileReader();
                        reader.readAsDataURL(file);
                        reader.onload = function (event) {
                            const img = new Image();
                            img.src = event.target.result;
                            img.onload = function () {
                                const canvas = document.createElement('canvas');
                                const ctx = canvas.getContext('2d');
                                const width = img.width;
                                const height = img.height;

                                // Kiểm tra xem có cần resize hay không
                                if (width > maxWidth) {
                                    const ratio = maxWidth / width;
                                    canvas.width = maxWidth;
                                    canvas.height = height * ratio;
                                } else {
                                    canvas.width = width;
                                    canvas.height = height;
                                }

                                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                                canvas.toBlob(function (blob) {
                                    const compressedFile = new File([blob], file.name, {
                                        type: file.type,
                                        lastModified: Date.now()
                                    });
                                    resolve(compressedFile);
                                }, file.type, 0.8); // 0.8 là chất lượng của ảnh sau khi được nén (từ 0.1 đến 1.0)
                            };
                        };
                    });
                };

                // Sử dụng Promise.all để theo dõi tất cả các tải lên
                const uploadPromises = [];

                function uploadImage(file) {
                    return new Promise(async (resolve, reject) => {
                        try {
                            const compressedFile = await compressImage(file);

                            var imageRef = imagesRef.child(file.name + generateUniqueFileName());
                            var uploadTask = imageRef.put(compressedFile, newMetadata);

                            uploadTask.on(
                                'state_changed',
                                function (snapshot) {
                                    // Xử lý tiến trình tải lên (nếu cần)
                                },
                                function (error) {
                                    // Xử lý lỗi tải lên (nếu có)
                                    reject(error);
                                },
                                function () {
                                    // Xử lý khi tải lên thành công
                                    uploadTask.snapshot.ref
                                        .getDownloadURL()
                                        .then(function (downloadURL) {
                                            imageUrlFile.push(downloadURL);
                                            resolve();
                                        })
                                        .catch(function (error) {
                                            // Xử lý lỗi lấy URL tải về (nếu có)
                                            reject(error);
                                        });
                                }
                            );
                        } catch (error) {
                            // Handle errors during compression or upload
                            //createPopup('Lỗi tải ảnh lên!', 30000);
                            console.error(error);
                            reject(error);
                        }
                    });
                }

                for (const hinhAnh of hinhAnhFiles) {
                    uploadPromises.push(uploadImage(hinhAnh));
                }

                Promise.all(uploadPromises)
                    .then(() => {
                        // Tất cả các tác vụ tải lên đã hoàn thành, imageUrlFile bây giờ chứa các URL

                        const imageUrl = imageUrlFile; // Đặt URL của hình ảnh tải lên
                        // Chuyển đổi thành timestamp
                        const thoiGian = new Date();
                        var timestamp = thoiGian.getTime();

                        var dataToUpload = {
                            user: userType.split('-')[0],
                            hinhAnh: imageUrl,
                            thoiGian: timestamp,
                            ttkh: ttkh
                        };

                        // Kiểm tra xem tài liệu đã tồn tại chưa
                        collectionRef.doc("banhang").get().then(doc => {
                            if (doc.exists) {
                                // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                collectionRef.doc("banhang").update({
                                    ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload)
                                }).then(function () {
                                    addArgumentSubmitForm(ttkh, imageUrl, thoiGian, timestamp, userType.split('-')[0]);
                                    imageUrlFile = [];
                                    inputClipboardContainer.innerText = 'Dán ảnh ở đây…';
                                    hinhAnhInputFile.value = '';
                                    popup.classList.remove('popup-show');
                                }).catch(function (error) {
                                    //createPopup('Lỗi khi tải ảnh lên...', 2000);
                                    console.error("Lỗi khi tải document lên: ", error);
                                });
                            } else {
                                // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                collectionRef.doc("banhang").set({
                                    ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload)
                                }).then(function () {
                                    addArgumentSubmitForm(ttkh, imageUrl, thoiGian, timestamp, userType.split('-')[0]);
                                    imageUrlFile = [];
                                    inputClipboardContainer.innerText = 'Dán ảnh ở đây…';
                                    hinhAnhInputFile.value = '';
                                    popup.classList.remove('popup-show');
                                }).catch(function (error) {
                                    createPopup('Lỗi khi tải ảnh lên...', 2000);
                                    console.error("Lỗi khi tải document lên: ", error);
                                });
                            }
                        })

                    })
                    .catch((error) => {
                        console.error("Lỗi trong quá trình tải lên ảnh:", error);
                    });
            } else if (inputClipboardRadio.checked) {
                createPopup('Đang tải ảnh lên', 10000);

                const hinhAnhFiles = imgArray;

                imgArray = [];

                // Sử dụng Promise.all để theo dõi tất cả các tải lên
                const uploadPromises = [];

                function uploadImage(file) {
                    return new Promise(async (resolve, reject) => {
                        try {
                            const compressedFile = file;

                            var imageRef = imagesRef.child(file.name + generateUniqueFileName());
                            var uploadTask = imageRef.put(compressedFile, newMetadata);

                            uploadTask.on(
                                'state_changed',
                                function (snapshot) {
                                    // Xử lý tiến trình tải lên (nếu cần)
                                },
                                function (error) {
                                    // Xử lý lỗi tải lên (nếu có)
                                    reject(error);
                                },
                                function () {
                                    // Xử lý khi tải lên thành công
                                    uploadTask.snapshot.ref
                                        .getDownloadURL()
                                        .then(function (downloadURL) {
                                            imageUrlFile.push(downloadURL);
                                            resolve();
                                        })
                                        .catch(function (error) {
                                            // Xử lý lỗi lấy URL tải về (nếu có)
                                            reject(error);
                                        });
                                }
                            );
                        } catch (error) {
                            // Handle errors during compression or upload
                            createPopup('Lỗi tải ảnh lên!', 30000);
                            console.error(error);
                            reject(error);
                        }
                    });
                }

                for (const hinhAnh of hinhAnhFiles) {
                    uploadPromises.push(uploadImage(hinhAnh));
                }

                Promise.all(uploadPromises)
                    .then(() => {
                        // Tất cả các tác vụ tải lên đã hoàn thành, imageUrlFile bây giờ chứa các URL

                        const imageUrl = imageUrlFile; // Đặt URL của hình ảnh tải lên
                        // Chuyển đổi thành timestamp
                        const thoiGian = new Date();
                        var timestamp = thoiGian.getTime();

                        var dataToUpload = {
                            user: userType.split('-')[0],
                            hinhAnh: imageUrl,
                            thoiGian: timestamp,
                            ttkh: ttkh
                        };

                        // Kiểm tra xem tài liệu đã tồn tại chưa
                        collectionRef.doc("banhang").get().then(doc => {
                            if (doc.exists) {
                                // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                collectionRef.doc("banhang").update({
                                    ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload)
                                }).then(function () {
                                    addArgumentSubmitForm(ttkh, imageUrl, thoiGian, timestamp, userType.split('-')[0]);
                                    imageUrlFile = [];
                                    inputClipboardContainer.innerText = 'Dán ảnh ở đây…';
                                    hinhAnhInputFile.value = '';
                                    popup.classList.remove('popup-show');
                                }).catch(function (error) {
                                    createPopup('Lỗi khi tải ảnh lên...', 2000);
                                    console.error("Lỗi khi tải document lên: ", error);
                                });
                            } else {
                                // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                collectionRef.doc("banhang").set({
                                    ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload)
                                }).then(function () {
                                    addArgumentSubmitForm(ttkh, imageUrl, thoiGian, timestamp, userType.split('-')[0]);
                                    imageUrlFile = [];
                                    inputClipboardContainer.innerText = 'Dán ảnh ở đây…';
                                    hinhAnhInputFile.value = '';
                                    popup.classList.remove('popup-show');
                                }).catch(function (error) {
                                    createPopup('Lỗi khi tải ảnh lên...', 2000);
                                    console.error("Lỗi khi tải document lên: ", error);
                                });
                            }
                        })

                    })
                    .catch((error) => {
                        console.error("Lỗi trong quá trình tải lên ảnh:", error);
                    });
            }


        } else {
            alert('Vui lòng đăng nhập.');
            return;
        }
    });

    clearDataButton.addEventListener('click', function () {
        document.getElementById('ttkh').value = '';
        inputEditClipboardContainer.innerText = 'Dán ảnh ở đây…';
        hinhAnhInputFile.value = '';
    });

    exitButton.addEventListener('click', function () {
        inputEditClipboardContainer.innerText = 'Dán ảnh ở đây…';
        document.getElementById('fileEditInputFile').value = '';
        dataEditForm.style.display = 'none';
    });

    editModalSaveButton.addEventListener('click', function () {
        const thoiGianElement = editingRow.querySelector("td[id]").id.toString();
        collectionRef.doc("banhang").get()
            .then((doc) => {
                if (doc.exists) {
                    const data = doc.data();

                    for (let i = 0; i < data["data"].length; i++) {
                        if (thoiGianElement === data["data"][i].thoiGian.toString()) {
                            // Tạo một bản sao của dữ liệu
                            const updatedData = [...data["data"]];
                            updatedData[i] = {
                                ...updatedData[i],
                                ttkh: editModalInfomation.value
                            };

                            // Cập nhật toàn bộ mảng
                            collectionRef.doc("banhang").update({
                                "data": updatedData
                            }).then(function () {
                                editModal.style.display = 'none';
                                popup.classList.remove('popup-show');
                                editingRow.querySelectorAll("td")[2].innerText = editModalInfomation.value;
                                console.log("Document tải lên thành công");
                            }).catch(function (error) {
                                popup.classList.remove('popup-show');
                                alert('Lỗi khi tải document lên.');
                                editModal.style.display = 'none';
                                return;
                                console.error("Lỗi khi cập nhật tài liệu: ", error);
                            });

                            break;
                        }
                    }
                }
            });
    });

    loginButton.addEventListener('click', function () {
        const username = inputUsername.value.trim();
        const password = inputPassword.value.trim();

        const userInfo = userTypes[username];

        if (userInfo && password === userInfo.password) {
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.setItem('userType', `${username}-${userInfo.password}`);
            checkLogin = userInfo.checkLogin;
            location.reload();
        } else {
            alert('Sai thông tin đăng nhập.');
        }
    });

    logoutButton.addEventListener('click', function () {
        checkLogin = 0; // Đặt lại biến kiểm tra đăng nhập
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('userType');
        //alert('Đã đăng xuất.');
        location.reload();
    });

    function addArgumentSubmitForm(ttkh, imageUrl, thoiGian, timestamp, user) {
        console.log("Document tải lên thành công");
        //popup.classList.remove('popup-show');
        document.getElementById("addButton").disabled = false;
        clearDataButton.click();

        // Thêm logic xử lý khi thêm dữ liệu vào bảng
        var row = dataTable.insertRow(dataTable.rows.length);

        // Thêm các ô và nội dung cho hàng dựa trên giá trị nhập từ biểu mẫu
        var orderCell = row.insertCell(0);
        orderCell.textContent = dataTable.rows.length; // Thay đổi để bắt đầu từ 1

        var thoiGianCell = row.insertCell(1);

        var hours = thoiGian.getHours().toString().padStart(2, '0');
        var minutes = thoiGian.getMinutes().toString().padStart(2, '0');
        var day = thoiGian.getDate().toString().padStart(2, '0');
        var month = (thoiGian.getMonth() + 1).toString().padStart(2, '0');
        var year = thoiGian.getFullYear().toString().slice(2);

        if (checkLogin == '1') {
            thoiGianCell.textContent = `${hours}:${minutes} ${day}-${month}-${year} ${user}`;
        } else {
            thoiGianCell.textContent = `${hours}:${minutes} ${day}-${month}-${year}`;
        }
        thoiGianCell.id = timestamp;

        var nameCell = row.insertCell(2);
        nameCell.textContent = ttkh;

        var imageCell = row.insertCell(3);
        imageCell.className = 'imageCell';
        for (let i = 0; i < imageUrl.length; i++) {
            var img = document.createElement('img');
            img.className = 'product-image';
            img.src = imageUrl[i];
            imageCell.appendChild(img);
        }

        var deleteCell = row.insertCell(4);
        var deleteCheckImg = document.createElement('button');
        deleteCheckImg.textContent = 'Xoá';
        deleteCheckImg.className = 'delete-button';

        deleteCheckImg.addEventListener('click', function () {
            var targetDelete = event.target;
            var rowDelete = targetDelete.closest('tr');
            const thoiGianElement = rowDelete.querySelector("td[id]").id.toString();

            if (row) {
                var confirmed = true; // Giả sử mặc định đã xác nhận
                confirmed = confirm('Bạn có chắc chắn đã bán sản phẩm này cho khách hàng chưa?');

                // Thực hiện xử lý của bạn dựa trên xác nhận của người dùng
                if (confirmed) {
                    // Nếu đã xác nhận, thực hiện xử lý của bạn
                    if (thoiGianElement) {
                        collectionRef.doc("banhang").get()
                            .then((doc) => {
                                if (doc.exists) {
                                    // Sao chép dữ liệu
                                    const data = doc.data(); // Sao chép mảng

                                    for (let i = 0; i < data["data"].length; i++) {
                                        if (thoiGianElement === data["data"][i].thoiGian.toString()) {
                                            data["data"].splice(i, 1); // Xoá phần tử tại vị trí i
                                            break; // Kết thúc vòng lặp sau khi xoá
                                        }
                                    }

                                    // Kiểm tra xem tài liệu đã tồn tại chưa
                                    collectionRef.doc("banhang").get().then(doc => {
                                        if (doc.exists) {
                                            // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                            collectionRef.doc("banhang").update({
                                                "data": data["data"]
                                            }).then(function () {
                                                console.log("Document tải lên thành công");
                                                rowDelete.remove();
                                                updateOrder(); // Cập nhật lại số thứ tự
                                            }).catch(function (error) {
                                                console.error("Lỗi khi tải document lên: ", error);
                                            });
                                        } else {
                                            // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                            collectionRef.doc("banhang").set({
                                                "data": data["data"]
                                            }).then(function () {
                                                console.log("Document tải lên thành công");
                                                rowDelete.remove();
                                                updateOrder(); // Cập nhật lại số thứ tự
                                            }).catch(function (error) {
                                                console.error("Lỗi khi tải document lên: ", error);
                                            });
                                        }
                                    }).catch(function (error) {
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
        });

        var addButtonImg = document.createElement('button');
        addButtonImg.textContent = 'Thêm';
        addButtonImg.className = 'add-button';

        addButtonImg.addEventListener('click', function () {
            dataEditForm.style.display = 'block';
            editModal.style.display = 'none';
            dataForm.style.display = 'none';

            var targetAdd = event.target;
            var rowAdd = targetAdd.closest('tr');
            editingRow = rowAdd;
        });

        var editInfomation = document.createElement('button');
        editInfomation.textContent = 'Sửa';
        editInfomation.className = 'add-button';
        editInfomation.style.backgroundColor = 'green';

        editInfomation.addEventListener('click', function () {
            editModal.style.display = 'block';
            dataEditForm.style.display = 'none';
            dataForm.style.display = 'none';

            var targetAdd = event.target;
            var rowAdd = targetAdd.closest('tr');
            editingRow = rowAdd;

            editModalInfomation.value = editingRow.querySelectorAll("td")[2].innerText;
        });

        deleteCell.appendChild(deleteCheckImg);
        deleteCell.appendChild(addButtonImg);
        deleteCell.appendChild(editInfomation);
    }

    function updateTable() {
        if (userType != "khach-777") {
            collectionRef.doc("banhang").get()
                .then((doc) => {
                    if (doc.exists) {
                        // Sao chép dữ liệu
                        const data = doc.data(); // Sao chép mảng

                        for (let i = 0; i < data["data"].length; i++) {
                            // Định dạng ngày tháng năm + giờ phút
                            var timestamp = parseFloat(data["data"][i].thoiGian); // Chuyển đổi chuỗi thành số nguyên
                            var dateCellConvert = new Date(timestamp);
                            var formattedTime = formatDate(dateCellConvert);
                            var ttkh = data["data"][i].ttkh;
                            var imageUrl = data["data"][i].hinhAnh;

                            if (userType.split('-')[0] == data["data"][i].user || checkLogin == '1') {
                                // Thêm logic xử lý khi thêm dữ liệu vào bảng
                                var row = dataTable.insertRow(dataTable.rows.length);

                                // Thêm các ô và nội dung cho hàng dựa trên giá trị nhập từ biểu mẫu
                                var orderCell = row.insertCell(0);
                                orderCell.textContent = dataTable.rows.length; // Thay đổi để bắt đầu từ 1

                                var thoiGianCell = row.insertCell(1);

                                if (checkLogin == '1') {
                                    thoiGianCell.textContent = formattedTime + ' ' + data["data"][i].user;
                                } else {
                                    thoiGianCell.textContent = formattedTime;
                                }

                                thoiGianCell.id = timestamp;

                                var nameCell = row.insertCell(2);
                                nameCell.textContent = ttkh;

                                var imageCell = row.insertCell(3);
                                imageCell.className = 'imageCell';
                                for (let i = 0; i < imageUrl.length; i++) {
                                    var img = document.createElement('img');
                                    img.className = 'product-image';
                                    img.src = imageUrl[i];
                                    imageCell.appendChild(img);
                                }

                                var deleteCell = row.insertCell(4);
                                var deleteCheckImg = document.createElement('button');
                                deleteCheckImg.textContent = 'Xoá';
                                deleteCheckImg.className = 'delete-button';

                                deleteCheckImg.addEventListener('click', function () {
                                    var targetDelete = event.target;
                                    var rowDelete = targetDelete.closest('tr');
                                    const thoiGianElement = rowDelete.querySelector("td[id]").id.toString();

                                    if (row) {
                                        // Hỏi xác nhận nếu checkbox được chọn
                                        var confirmed = true; // Giả sử mặc định đã xác nhận
                                        confirmed = confirm('Bạn có chắc chắn đã bán sản phẩm này cho khách hàng chưa?');

                                        // Thực hiện xử lý của bạn dựa trên xác nhận của người dùng
                                        if (confirmed) {
                                            // Nếu đã xác nhận, thực hiện xử lý của bạn
                                            if (thoiGianElement) {
                                                collectionRef.doc("banhang").get()
                                                    .then((doc) => {
                                                        if (doc.exists) {
                                                            // Sao chép dữ liệu
                                                            const data = doc.data(); // Sao chép mảng

                                                            for (let i = 0; i < data["data"].length; i++) {
                                                                if (thoiGianElement === data["data"][i].thoiGian.toString()) {
                                                                    data["data"].splice(i, 1); // Xoá phần tử tại vị trí i
                                                                    break; // Kết thúc vòng lặp sau khi xoá
                                                                }
                                                            }

                                                            // Kiểm tra xem tài liệu đã tồn tại chưa
                                                            collectionRef.doc("banhang").get().then(doc => {
                                                                if (doc.exists) {
                                                                    // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                                                    collectionRef.doc("banhang").update({
                                                                        "data": data["data"]
                                                                    }).then(function () {
                                                                        console.log("Document tải lên thành công");
                                                                        rowDelete.remove();
                                                                        updateOrder(); // Cập nhật lại số thứ tự
                                                                    }).catch(function (error) {
                                                                        console.error("Lỗi khi tải document lên: ", error);
                                                                    });
                                                                } else {
                                                                    // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                                                    collectionRef.doc("banhang").set({
                                                                        "data": data["data"]
                                                                    }).then(function () {
                                                                        console.log("Document tải lên thành công");
                                                                        rowDelete.remove();
                                                                        updateOrder(); // Cập nhật lại số thứ tự
                                                                    }).catch(function (error) {
                                                                        console.error("Lỗi khi tải document lên: ", error);
                                                                    });
                                                                }
                                                            }).catch(function (error) {
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
                                });

                                var addButtonImg = document.createElement('button');
                                addButtonImg.textContent = 'Thêm';
                                addButtonImg.className = 'add-button';

                                addButtonImg.addEventListener('click', function () {
                                    dataForm.style.display = 'none';
                                    dataEditForm.style.display = 'block';

                                    var targetAdd = event.target;
                                    var rowAdd = targetAdd.closest('tr');
                                    editingRow = rowAdd;

                                    /*
                                    document.getElementById('fileInput').click();
                                    */
                                });

                                var editInfomation = document.createElement('button');
                                editInfomation.textContent = 'Sửa';
                                editInfomation.className = 'add-button';
                                editInfomation.style.backgroundColor = 'green';

                                editInfomation.addEventListener('click', function () {
                                    editModal.style.display = 'block';
                                    dataForm.style.display = 'none';

                                    var targetAdd = event.target;
                                    var rowAdd = targetAdd.closest('tr');
                                    editingRow = rowAdd;

                                    editModalInfomation.value = editingRow.querySelectorAll("td")[2].innerText;
                                });

                                deleteCell.appendChild(addButtonImg);
                                deleteCell.appendChild(editInfomation);
                                deleteCell.appendChild(deleteCheckImg);
                            }
                        }
                    }
                })
                .catch((error) => {
                    console.error("Lỗi lấy document:", error);
                });
        }
    }

    // Hàm để tạo tên tệp động duy nhất
    function generateUniqueFileName() {
        return Date.now() + '_' + Math.random().toString(36).substr(2, 9) + '.png';
    }

    nameFilterDropdown.addEventListener('change', function () {
        var selectedName = nameFilterDropdown.value;

        var rows = tableBody.getElementsByTagName("tr");

        for (var i = 0; i < rows.length; i++) {
            var cells = rows[i].getElementsByTagName("td");

            if (cells.length > 0) {
                var firstTdInnerText = cells[1].innerText.split(' ')[2];
                if (selectedName === firstTdInnerText || selectedName === "all") {
                    rows[i].style.display = 'table-row';
                } else {
                    rows[i].style.display = 'none'; // Ẩn các đợt live khác
                }
            }
        }
    });

    // Xử lý khi nút "Thêm" được click
    productEditForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (inputEditFileRadio.checked) {
            createPopup('Đang tải ảnh lên', 10000);
            document.getElementById('fileEditInputFile').click();
        } else if (inputEditClipboardRadio.checked) {
            createPopup('Đang tải ảnh lên', 10000);
            inputEditClipboardRadioChecked();
        }
    });

    // Hàm để tạo tên tệp động duy nhất
    function inputEditClipboardRadioChecked() {
        var hinhAnhFiles = imgEditArray;
        imgEditArray = [];
        // Đảm bảo rằng có tệp tin được chọn
        if (hinhAnhFiles.length > 0) {
            imageUrlFile = [];
            // Cập nhật hình ảnh trong cell của hàng đang chỉnh sửa
            var imageCell = editingRow.querySelector('.imageCell');
            const thoiGianElement = editingRow.querySelector("td[id]").id.toString();

            var imagesRef = storageRef.child('banhang/sp');

            // Function to compress an image
            const compressImage = async (file) => {
                return new Promise((resolve) => {
                    const maxWidth = 500; // Set kích thước tối đa mong muốn
                    const reader = new FileReader();
                    reader.readAsDataURL(file);
                    reader.onload = function (event) {
                        const img = new Image();
                        img.src = event.target.result;
                        img.onload = function () {
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');
                            const width = img.width;
                            const height = img.height;

                            // Kiểm tra xem có cần resize hay không
                            if (width > maxWidth) {
                                const ratio = maxWidth / width;
                                canvas.width = maxWidth;
                                canvas.height = height * ratio;
                            } else {
                                canvas.width = width;
                                canvas.height = height;
                            }

                            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                            canvas.toBlob(function (blob) {
                                const compressedFile = new File([blob], file.name, {
                                    type: file.type,
                                    lastModified: Date.now()
                                });
                                resolve(compressedFile);
                            }, file.type, 0.8); // 0.8 là chất lượng của ảnh sau khi được nén (từ 0.1 đến 1.0)
                        };
                    };
                });
            };

            // Sử dụng Promise.all để theo dõi tất cả các tải lên
            const uploadPromises = [];

            function uploadImage(file) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const compressedFile = await compressImage(file);

                        var imageRef = imagesRef.child(file.name + generateUniqueFileName());
                        var uploadTask = imageRef.put(compressedFile, newMetadata);

                        uploadTask.on(
                            'state_changed',
                            function (snapshot) {
                                // Xử lý tiến trình tải lên (nếu cần)
                            },
                            function (error) {
                                // Xử lý lỗi tải lên (nếu có)
                                reject(error);
                            },
                            function () {
                                // Xử lý khi tải lên thành công
                                uploadTask.snapshot.ref
                                    .getDownloadURL()
                                    .then(function (downloadURL) {
                                        imageUrlFile.push(downloadURL);
                                        resolve();
                                    })
                                    .catch(function (error) {
                                        // Xử lý lỗi lấy URL tải về (nếu có)
                                        reject(error);
                                    });
                            }
                        );
                    } catch (error) {
                        // Handle errors during compression or upload
                        createPopup('Lỗi tải ảnh lên!', 30000);
                        console.error(error);
                        reject(error);
                    }
                });
            }

            for (const hinhAnh of hinhAnhFiles) {
                uploadPromises.push(uploadImage(hinhAnh));
            }

            Promise.all(uploadPromises)
                .then(() => {
                    // Tất cả các tác vụ tải lên đã hoàn thành, imageUrlFile bây giờ chứa các URL
                    for (const imageUrl of imageUrlFile) {

                        collectionRef.doc("banhang").get()
                            .then((doc) => {
                                if (doc.exists) {
                                    const data = doc.data();

                                    for (let i = 0; i < data["data"].length; i++) {
                                        if (thoiGianElement === data["data"][i].thoiGian.toString()) {
                                            // Tạo một bản sao của mảng hình ảnh
                                            const updatedHinhAnhArray = [...data["data"][i].hinhAnh, imageUrl];

                                            // Tạo một bản sao của dữ liệu
                                            const updatedData = [...data["data"]];
                                            updatedData[i] = {
                                                ...updatedData[i],
                                                hinhAnh: updatedHinhAnhArray
                                            };

                                            // Cập nhật toàn bộ mảng
                                            collectionRef.doc("banhang").update({
                                                "data": updatedData
                                            }).then(function () {
                                                // Cập nhật hình ảnh trong cell của hàng đang chỉnh sửa
                                                var imageCell = editingRow.querySelector('.imageCell');

                                                // Tạo một thẻ img mới
                                                var img = document.createElement('img');
                                                img.className = 'product-image';
                                                img.src = imageUrl;

                                                // Thêm thẻ img vào cell
                                                imageCell.appendChild(img);
                                                dataEditForm.style.display = 'none';
                                                document.getElementById('fileEditInputFile').value = '';
                                                inputEditClipboardContainer.innerText = 'Dán ảnh ở đây…';
                                                popup.classList.remove('popup-show');
                                                console.log("Document tải lên thành công");
                                            }).catch(function (error) {
                                                popup.classList.remove('popup-show');
                                                alert('Lỗi khi tải document lên.');
                                                dataEditForm.style.display = 'none';
                                                document.getElementById('fileEditInputFile').value = '';
                                                inputEditClipboardContainer.innerText = 'Dán ảnh ở đây…';
                                                return;
                                                console.error("Lỗi khi cập nhật tài liệu: ", error);
                                            });

                                            break;
                                        }
                                    }
                                }
                            });
                    }
                });
        }
    }


    document.getElementById('fileEditInputFile').addEventListener('change', function (event) {
        var hinhAnhFiles = event.target.files;
        // Đảm bảo rằng có tệp tin được chọn
        if (hinhAnhFiles.length > 0) {
            imageUrlFile = [];
            // Cập nhật hình ảnh trong cell của hàng đang chỉnh sửa
            var imageCell = editingRow.querySelector('.imageCell');
            const thoiGianElement = editingRow.querySelector("td[id]").id.toString();

            var imagesRef = storageRef.child('banhang/sp');

            // Function to compress an image
            const compressImage = async (file) => {
                return new Promise((resolve) => {
                    const maxWidth = 500; // Set kích thước tối đa mong muốn
                    const reader = new FileReader();
                    reader.readAsDataURL(file);
                    reader.onload = function (event) {
                        const img = new Image();
                        img.src = event.target.result;
                        img.onload = function () {
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');
                            const width = img.width;
                            const height = img.height;

                            // Kiểm tra xem có cần resize hay không
                            if (width > maxWidth) {
                                const ratio = maxWidth / width;
                                canvas.width = maxWidth;
                                canvas.height = height * ratio;
                            } else {
                                canvas.width = width;
                                canvas.height = height;
                            }

                            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                            canvas.toBlob(function (blob) {
                                const compressedFile = new File([blob], file.name, {
                                    type: file.type,
                                    lastModified: Date.now()
                                });
                                resolve(compressedFile);
                            }, file.type, 0.8); // 0.8 là chất lượng của ảnh sau khi được nén (từ 0.1 đến 1.0)
                        };
                    };
                });
            };

            // Sử dụng Promise.all để theo dõi tất cả các tải lên
            const uploadPromises = [];

            function uploadImage(file) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const compressedFile = await compressImage(file);

                        var imageRef = imagesRef.child(file.name + generateUniqueFileName());
                        var uploadTask = imageRef.put(compressedFile, newMetadata);

                        uploadTask.on(
                            'state_changed',
                            function (snapshot) {
                                // Xử lý tiến trình tải lên (nếu cần)
                            },
                            function (error) {
                                // Xử lý lỗi tải lên (nếu có)
                                reject(error);
                            },
                            function () {
                                // Xử lý khi tải lên thành công
                                uploadTask.snapshot.ref
                                    .getDownloadURL()
                                    .then(function (downloadURL) {
                                        imageUrlFile.push(downloadURL);
                                        resolve();
                                    })
                                    .catch(function (error) {
                                        // Xử lý lỗi lấy URL tải về (nếu có)
                                        reject(error);
                                    });
                            }
                        );
                    } catch (error) {
                        // Handle errors during compression or upload
                        createPopup('Lỗi tải ảnh lên!', 30000);
                        console.error(error);
                        reject(error);
                    }
                });
            }

            for (const hinhAnh of hinhAnhFiles) {
                uploadPromises.push(uploadImage(hinhAnh));
            }

            Promise.all(uploadPromises)
                .then(() => {
                    // Tất cả các tác vụ tải lên đã hoàn thành, imageUrlFile bây giờ chứa các URL
                    const imageUrl = imageUrlFile[0]; // Lấy URL từ lần tải lên đầu tiên

                    collectionRef.doc("banhang").get()
                        .then((doc) => {
                            if (doc.exists) {
                                const data = doc.data();

                                for (let i = 0; i < data["data"].length; i++) {
                                    if (thoiGianElement === data["data"][i].thoiGian.toString()) {
                                        // Tạo một bản sao của mảng hình ảnh
                                        const updatedHinhAnhArray = [...data["data"][i].hinhAnh, imageUrl];

                                        // Tạo một bản sao của dữ liệu
                                        const updatedData = [...data["data"]];
                                        updatedData[i] = {
                                            ...updatedData[i],
                                            hinhAnh: updatedHinhAnhArray
                                        };

                                        // Cập nhật toàn bộ mảng
                                        collectionRef.doc("banhang").update({
                                            "data": updatedData
                                        }).then(function () {
                                            // Cập nhật hình ảnh trong cell của hàng đang chỉnh sửa
                                            var imageCell = editingRow.querySelector('.imageCell');

                                            // Tạo một thẻ img mới
                                            var img = document.createElement('img');
                                            img.className = 'product-image';
                                            img.src = imageUrl;

                                            // Thêm thẻ img vào cell
                                            imageCell.appendChild(img);
                                            dataEditForm.style.display = 'none';
                                            document.getElementById('fileEditInputFile').value = '';
                                            inputEditClipboardContainer.innerText = 'Dán ảnh ở đây…';
                                            popup.classList.remove('popup-show');
                                            console.log("Document tải lên thành công");
                                        }).catch(function (error) {
                                            popup.classList.remove('popup-show');
                                            alert('Lỗi khi tải document lên.');
                                            dataEditForm.style.display = 'none';
                                            document.getElementById('fileEditInputFile').value = '';
                                            inputEditClipboardContainer.innerText = 'Dán ảnh ở đây…';
                                            return;
                                            console.error("Lỗi khi cập nhật tài liệu: ", error);
                                        });

                                        break;
                                    }
                                }
                            }
                        });
                });
        }
    });

    function createPopup(message, time = 1500) {
        var popup = document.getElementById('popup');
        var popupMessage = document.getElementById('popup-message');
        popup.classList.remove('popup-show');
        popupMessage.textContent = message;
        popup.classList.add('popup-show');

        setTimeout(function () {
            popup.classList.remove('popup-show');
        }, time); // Tắt thông báo sau 1.5 giây
    }

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

    // Xoá quảng cáo
    var divToRemove = document.querySelector('div[style="text-align: right;position: fixed;z-index:9999999;bottom: 0;width: auto;right: 1%;cursor: pointer;line-height: 0;display:block !important;"]');

    if (divToRemove) {
        divToRemove.remove();
    }

    updateTable();
});