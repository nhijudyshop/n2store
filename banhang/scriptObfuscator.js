document.addEventListener('DOMContentLoaded', function() {
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
    const productForm = document.getElementById('productForm');
    const addButton = document.getElementById('addButton');
    const clearDataButton = document.getElementById('clearDataButton');
    const dataTable = document.querySelector('table tbody');
    const loginContainer = document.querySelector('.login-container');
    const loginBox = document.querySelector('.login-box');
    const logoutButton = document.createElement('button');
    const inputUsername = document.getElementById('username');
    const inputPassword = document.getElementById('password');
    const loginButton = document.getElementById('loginButton');
    const deleteCheckImg = document.getElementById('delete-button');
    const addButtonImg = document.getElementById('add-button');
	const nameFilterDropdown = document.getElementById('nameFilter');
    const userTypes = {
        admin: {
            password: 'admin',
            checkLogin: 1
        },
        my: {
            password: 'my2804',
            checkLogin: 2
        },
        lai: {
            password: 'lai2506',
            checkLogin: 3
        },
        huyen: {
            password: 'huyen2307',
            checkLogin: 4
        },
        ngoc: {
            password: 'ngoc1907',
            checkLogin: 5
        },
        truc: {
            password: 'truc0208',
            checkLogin: 6
        },
        // demo: {
        //     password: '777',
        //     checkLogin: 1
        // },
    };
	
	document.querySelector('.nameFilter').style.display = 'none';
	nameFilterDropdown.style.display = 'none';
	
	const tempNameFilterDropdown = ['my', 'lai', 'huyen', 'ngoc', 'truc'];

    let editingRow;
    var checkLogin = 0;
    var imageUrlFile = []; // Mảng để lưu trữ URL tải về
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
    }

    // Xử lý khi nút "Hiện biểu mẫu" được click
    toggleFormButton.addEventListener('click', function() {
        dataForm.style.display = dataForm.style.display === 'none' ? 'block' : 'none';
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
    dataTable.addEventListener('change', function(event) {
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
                                                }).then(function() {
                                                    console.log("Document tải lên thành công");
                                                }).catch(function(error) {
                                                    console.error("Lỗi khi tải document lên: ", error);
                                                });
                                            } else {
                                                // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                                collectionRef.doc("banhang").set({
                                                    "data": data["data"]
                                                }).then(function() {
                                                    console.log("Document tải lên thành công");
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
    productForm.addEventListener('submit', async function(e) {
        if (checkLogin != 0) {
            e.preventDefault();
            document.getElementById("addButton").disabled = true;

            const ttkh = document.getElementById('ttkh').value;
            const hinhAnhInput = document.getElementById('hinhAnhInputFile');
            const hinhAnhFiles = hinhAnhInput.files;

            var imagesRef = storageRef.child('banhang/sp');

            // Function to compress an image
            const compressImage = async (file) => {
                return new Promise((resolve) => {
                    const maxWidth = 500; // Set kích thước tối đa mong muốn
                    const reader = new FileReader();
                    reader.readAsDataURL(file);
                    reader.onload = function(event) {
                        const img = new Image();
                        img.src = event.target.result;
                        img.onload = function() {
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
                            canvas.toBlob(function(blob) {
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
                            function(snapshot) {
                                // Xử lý tiến trình tải lên (nếu cần)
                            },
                            function(error) {
                                // Xử lý lỗi tải lên (nếu có)
                                reject(error);
                            },
                            function() {
                                // Xử lý khi tải lên thành công
                                uploadTask.snapshot.ref
                                    .getDownloadURL()
                                    .then(function(downloadURL) {
                                        imageUrlFile.push(downloadURL);
                                        resolve();
                                    })
                                    .catch(function(error) {
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
                            }).then(function() {
                                addArgumentSubmitForm(ttkh, imageUrl, thoiGian, timestamp, userType.split('-')[0]);
                                imageUrlFile = [];
                            }).catch(function(error) {
                                //createPopup('Lỗi khi tải ảnh lên...', 2000);
                                console.error("Lỗi khi tải document lên: ", error);
                            });
                        } else {
                            // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                            collectionRef.doc("banhang").set({
                                ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload)
                            }).then(function() {
                                addArgumentSubmitForm(ttkh, imageUrl, thoiGian, timestamp, userType.split('-')[0]);
                                imageUrlFile = [];
                            }).catch(function(error) {
                                //createPopup('Lỗi khi tải ảnh lên...', 2000);
                                console.error("Lỗi khi tải document lên: ", error);
                            });
                        }
                    })

                })
                .catch((error) => {
                    console.error("Lỗi trong quá trình tải lên ảnh:", error);
                });
        } else {
            alert('Vui lòng đăng nhập.');
            return;
        }
    });

    clearDataButton.addEventListener('click', function() {
        document.getElementById('ttkh').value = '';
        document.getElementById('hinhAnhInputFile').value = '';
    });

    loginButton.addEventListener('click', function() {
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

    logoutButton.addEventListener('click', function() {
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

        deleteCheckImg.addEventListener('click', function() {
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
                                            }).then(function() {
                                                console.log("Document tải lên thành công");
                                                rowDelete.remove();
                                                updateOrder(); // Cập nhật lại số thứ tự
                                            }).catch(function(error) {
                                                console.error("Lỗi khi tải document lên: ", error);
                                            });
                                        } else {
                                            // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                            collectionRef.doc("banhang").set({
                                                "data": data["data"]
                                            }).then(function() {
                                                console.log("Document tải lên thành công");
                                                rowDelete.remove();
                                                updateOrder(); // Cập nhật lại số thứ tự
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
        });

        var addButtonImg = document.createElement('button');
        addButtonImg.textContent = 'Thêm';
        addButtonImg.className = 'add-button';

        addButtonImg.addEventListener('click', function() {
            var targetAdd = event.target;
            var rowAdd = targetAdd.closest('tr');
            editingRow = rowAdd;
            document.getElementById('fileInput').click();
        });

        deleteCell.appendChild(deleteCheckImg);
        deleteCell.appendChild(addButtonImg);
    }

    function updateTable() {
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

                            deleteCheckImg.addEventListener('click', function() {
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
                                                                }).then(function() {
                                                                    console.log("Document tải lên thành công");
                                                                    rowDelete.remove();
                                                                    updateOrder(); // Cập nhật lại số thứ tự
                                                                }).catch(function(error) {
                                                                    console.error("Lỗi khi tải document lên: ", error);
                                                                });
                                                            } else {
                                                                // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                                                collectionRef.doc("banhang").set({
                                                                    "data": data["data"]
                                                                }).then(function() {
                                                                    console.log("Document tải lên thành công");
                                                                    rowDelete.remove();
                                                                    updateOrder(); // Cập nhật lại số thứ tự
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
                            });

                            var addButtonImg = document.createElement('button');
                            addButtonImg.textContent = 'Thêm';
                            addButtonImg.className = 'add-button';

                            addButtonImg.addEventListener('click', function() {
                                var targetAdd = event.target;
                                var rowAdd = targetAdd.closest('tr');
                                editingRow = rowAdd;
                                document.getElementById('fileInput').click();
                            });

                            deleteCell.appendChild(deleteCheckImg);
                            deleteCell.appendChild(addButtonImg);
                        }
                    }
                }
            })
            .catch((error) => {
                console.error("Lỗi lấy document:", error);
            });
    }

    // Hàm để tạo tên tệp động duy nhất
    function generateUniqueFileName() {
        return Date.now() + '_' + Math.random().toString(36).substr(2, 9) + '.png';
    }
	
	nameFilterDropdown.addEventListener('change', function() {
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

    document.getElementById('fileInput').addEventListener('change', function(event) {
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
                    reader.onload = function(event) {
                        const img = new Image();
                        img.src = event.target.result;
                        img.onload = function() {
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
                            canvas.toBlob(function(blob) {
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
                            function(snapshot) {
                                // Xử lý tiến trình tải lên (nếu cần)
                            },
                            function(error) {
                                // Xử lý lỗi tải lên (nếu có)
                                reject(error);
                            },
                            function() {
                                // Xử lý khi tải lên thành công
                                uploadTask.snapshot.ref
                                    .getDownloadURL()
                                    .then(function(downloadURL) {
                                        imageUrlFile.push(downloadURL);
                                        resolve();
                                    })
                                    .catch(function(error) {
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
                                        }).then(function() {
                                            // Cập nhật hình ảnh trong cell của hàng đang chỉnh sửa
                                            var imageCell = editingRow.querySelector('.imageCell');

                                            // Tạo một thẻ img mới
                                            var img = document.createElement('img');
                                            img.className = 'product-image';
                                            img.src = imageUrl;

                                            // Thêm thẻ img vào cell
                                            imageCell.appendChild(img);
                                            console.log("Document tải lên thành công");
                                        }).catch(function(error) {
                                            alert('Lỗi khi tải document lên.');
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

    // Xoá quảng cáo
    var divToRemove = document.querySelector('div[style="text-align: right;position: fixed;z-index:9999999;bottom: 0;width: auto;right: 1%;cursor: pointer;line-height: 0;display:block !important;"]');

    if (divToRemove) {
        divToRemove.remove();
    }

    updateTable();
});