// For Firebase JS SDK v7.20.0 and later, measurementId is optional
function _0x1ab2(_0x36a23b,_0x52223b){const _0x2e058f=_0x2e05();return _0x1ab2=function(_0x1ab212,_0x4110aa){_0x1ab212=_0x1ab212-0x162;let _0x120a0e=_0x2e058f[_0x1ab212];return _0x120a0e;},_0x1ab2(_0x36a23b,_0x52223b);}function _0x2e05(){const _0x5a5dc7=['1235460FrnjKH','22977963vpMYJv','AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM','n2shop-69e37-ne0q1','G-TEJH3S2T1D','1345047lnZTNJ','366711YpKMry','13142736zaWdgA','598906493303','3756921uppNah','25XRvqCS','n2shop-69e37','14dthlHY','n2shop-69e37.firebaseapp.com','10009662EXBqRi'];_0x2e05=function(){return _0x5a5dc7;};return _0x2e05();}const _0x3a343d=_0x1ab2;(function(_0x46d1e0,_0x1a2442){const _0x1acdbc=_0x1ab2,_0x2a2d1c=_0x46d1e0();while(!![]){try{const _0x1aa040=parseInt(_0x1acdbc(0x168))/0x1+-parseInt(_0x1acdbc(0x16f))/0x2*(-parseInt(_0x1acdbc(0x169))/0x3)+parseInt(_0x1acdbc(0x163))/0x4*(-parseInt(_0x1acdbc(0x16d))/0x5)+parseInt(_0x1acdbc(0x162))/0x6+-parseInt(_0x1acdbc(0x16c))/0x7+parseInt(_0x1acdbc(0x16a))/0x8+-parseInt(_0x1acdbc(0x164))/0x9;if(_0x1aa040===_0x1a2442)break;else _0x2a2d1c['push'](_0x2a2d1c['shift']());}catch(_0x3223ad){_0x2a2d1c['push'](_0x2a2d1c['shift']());}}}(_0x2e05,0xd647a));const firebaseConfig={'apiKey':_0x3a343d(0x165),'authDomain':_0x3a343d(0x170),'projectId':_0x3a343d(0x16e),'storageBucket':_0x3a343d(0x166),'messagingSenderId':_0x3a343d(0x16b),'appId':'1:598906493303:web:46d6236a1fdc2eff33e972','measurementId':_0x3a343d(0x167)};

// Create file metadata to update
var newMetadata = {
    cacheControl: 'public,max-age=31536000',
}

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storageRef = firebase.storage().ref();
const collectionRef = db.collection("ib");

const ALL_CATEGORIES = 'all';
const CATEGORY_AO = 'Áo';
const CATEGORY_QUAN = 'Quần';
const CATEGORY_SET_DAM = 'Set và Đầm';
const CATEGORY_PKGD = 'PKGD';

const tbody = document.querySelector('tbody');

// Trích xuất giá trị của tham số "id" từ URL
const idParam = getURLParameter("id");

const inputFileRadio = document.getElementById('inputFile');
const inputLinkRadio = document.getElementById('inputLink');
const inputClipboardRadio = document.getElementById('inputClipboard');

const inputFileRadioKH = document.getElementById('inputFileKH');
const inputClipboardRadioKH = document.getElementById('inputClipboardKH');

const inputFileContainer = document.getElementById('inputFileContainer');
const inputLinkContainer = document.getElementById('inputLinkContainer');

const inputFileContainerKH = document.getElementById('inputFileContainerKH');

const inputClipboardContainer = document.getElementById('container');
const inputClipboardContainerKH = document.getElementById('containerKH');

const hinhAnhInputFile = document.getElementById('hinhAnhInputFile');

const hinhAnhInputFileKH = document.getElementById('hinhAnhInputFileKH');

const hinhAnhContainer = document.getElementById('hinhAnhContainer');
const hinhAnhContainerKH = document.getElementById('hinhAnhContainerKH');

var imageUrlFile = []; // Mảng để lưu trữ URL tải về
var imageUrlFileKH = []; // Mảng để lưu trữ URL tải về

// Ẩn trường nhập liệu link ban đầu
inputLinkContainer.style.display = 'none';
inputFileContainer.style.display = 'none';

inputFileContainerKH.style.display = 'none';

// Create a temporary file input element
var imgArray = [];
var imgArrayKH = [];

// Add a paste event listener to the document
inputClipboardContainer.addEventListener('paste', function(e) {
    e.preventDefault();
    var items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
            var blob = items[i].getAsFile(); // Tạo một Blob từ dữ liệu hình ảnh
            var file = new File([blob], "imageSP.jpg"); // Tạo một File từ Blob

            // Tạo một phần tử img
            var imgElement = document.createElement("img");

            // Đặt thuộc tính src cho phần tử img bằng URL của tệp
            imgElement.src = URL.createObjectURL(file);
            imgElement.classList.add('clipboard-image');

            // Thêm phần tử img vào phần tử <div>
            inputClipboardContainer.appendChild(imgElement);
            imgArray.push(file);
        }
    }
});

// Add a paste event listener to the document
inputClipboardContainerKH.addEventListener('paste', function(e) {
    e.preventDefault();
    var items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
            var blob = items[i].getAsFile(); // Tạo một Blob từ dữ liệu hình ảnh
            var file = new File([blob], "imageKH.jpg"); // Tạo một File từ Blob

            // Tạo một phần tử img
            var imgElement = document.createElement("img");

            // Đặt thuộc tính src cho phần tử img bằng URL của tệp
            imgElement.src = URL.createObjectURL(file);
            imgElement.classList.add('clipboard-image');

            // Thêm phần tử img vào phần tử <div>
            inputClipboardContainerKH.appendChild(imgElement);
            imgArrayKH.push(file);
        }
    }
});

/*
// Thêm một sự kiện click vào phần tử inputClipboardContainerKH
inputClipboardContainer.addEventListener('click', function(e) {
    // Kiểm tra xem phần tử được click có phải là một phần tử <img> không
    if (e.target.tagName === 'IMG') {
        // Xoá phần tử img khỏi mảng imgArray
        var index = imgArray.indexOf(e.target);
        if (index !== -1) {
            imgArray.splice(index, 1);
        }

        // Xoá phần tử img khỏi inputClipboardContainerKH
        e.target.parentNode.removeChild(e.target);

        var newElement = document.createElement('p')
        newElement.textContent = 'Dán ảnh sản phẩm ở đây…';
        inputClipboardContainer.appendChild(newElement);
    }
});

// Thêm một sự kiện click vào phần tử inputClipboardContainerKH
inputClipboardContainerKH.addEventListener('click', function(e) {
    // Kiểm tra xem phần tử được click có phải là một phần tử <img> không
    if (e.target.tagName === 'IMG') {
        // Xoá phần tử img khỏi mảng imgArrayKH
        var index = imgArrayKH.indexOf(e.target);
        if (index !== -1) {
            imgArrayKH.splice(index, 1);
        }

        // Xoá phần tử img khỏi inputClipboardContainerKH
        e.target.parentNode.removeChild(e.target);
		
        var newElement = document.createElement('p')
        newElement.textContent = 'Dán ảnh sản phẩm ở đây…';
        inputClipboardContainerKH.appendChild(newElement);
    }
});
*/

document.getElementById('hinhAnhInputLink').addEventListener('click', function(event) {
    const inputValue = event.target.value;

    // Tạo một trường nhập liệu mới
    const newInput = document.createElement('input');
    newInput.type = 'text';
    newInput.id = 'hinhAnhInput';
    newInput.accept = 'image/*';

    // Thêm trường nhập liệu mới vào hàng dưới (hinhAnhContainer)
    hinhAnhContainer.appendChild(newInput);
});

// Thêm hàm formatDate để chuyển đổi thời gian upload
function formatDate(date) {
    if (!date) {
        return '';
    }
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}
const filterCategoryDropdown = document.getElementById('filterCategory');
filterCategoryDropdown.addEventListener('change', applyCategoryFilter);

function applyCategoryFilter() {
    const selectedCategory = filterCategoryDropdown.value;
    const rows = tbody.querySelectorAll('tr');
    rows.forEach((row) => {
        const categoryCell = row.querySelector('td:nth-child(3)');
        if (selectedCategory === ALL_CATEGORIES || categoryCell.textContent === selectedCategory) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

function toggleRowVisibility(row, button) {
    if (idParam === "admin") {
        const cellsToHide = row.querySelectorAll('td:not(:last-child)');
        // Lấy tài liệu "ib" từ Firestore
        collectionRef.doc("ib").get()
            .then((doc) => {
                if (doc.exists) {
                    // Sao chép dữ liệu
                    const data = doc.data().data.slice(); // Sao chép mảng

                    // Vị trí của mục cần cập nhật
                    const indexToUpdate = cellsToHide[0].textContent - 1; // Đổi index thành vị trí muốn cập nhật

                    // Cập nhật dữ liệu tại vị trí cụ thể
                    if (cellsToHide[0].style.display !== 'none') {
                        cellsToHide.forEach(cell => cell.style.display = 'none');
                        button.innerText = 'Hiện';
                        data[indexToUpdate].cellShow = false;
                    } else {
                        cellsToHide.forEach(cell => cell.style.display = '');
                        button.innerText = 'Ẩn';
                        updateRowIndexes();
                        data[indexToUpdate].cellShow = true;
                    }

                    // Cập nhật dữ liệu trong Firestore
                    collectionRef.doc("ib").update({
                            data
                        })
                        .then(function() {})
                        .catch(function(error) {});
                }
            })
            .catch((error) => {});
    } else {
        alert("Bạn không đủ quyền để thực hiện thao tác này");
    }
}

function updateRowIndexes() {
    let visibleRows = Array.from(tbody.querySelectorAll('tr[style="display: ;"]'));
    visibleRows.forEach((row, index) => {
        row.querySelector('td:first-child').textContent = index + 1;
    });
}

const dataForm = document.getElementById('dataForm');
dataForm.addEventListener('submit', function(e) {
    e.preventDefault();
    document.getElementById("addButton").disabled = true;
    const phanLoai = document.getElementById('phanLoai').value;
    const hinhAnhInput = document.getElementById('hinhAnhInput');
    const tenSanPham = document.getElementById('tenSanPham').value;

    if (!phanLoai || !tenSanPham) {
        alert('Vui lòng điền đầy đủ thông tin.');
        return;
    }

    if (inputLinkRadio.checked) {
        if (!hinhAnhInput.value) {
            popup.classList.remove('popup-show');
            alert('Vui lòng nhập URL hình ảnh sản phẩm.');
            return;
        }

        if (!hinhAnhInput.value.startsWith("https://")) {
            popup.classList.remove('popup-show');
            alert('Sai định dạng link');
            return;
        }

        createPopup('Đang tải ảnh lên', 5000);

        const inputs = hinhAnhContainer.querySelectorAll('input[type="text"]');

        const giaTriText = [];
        inputs.forEach(function(input) {
            if (input.value != "") {
                giaTriText.push(input.value);
            }
        });

        const imageUrl = giaTriText; // Đặt URL của hình ảnh tải lên

        if (imageUrl != []) {

            if (!inputFileRadioKH.checked) {

                const giaTriKHText = [];

                // Upload các tệp trong imgArray
                imgArrayKH.forEach(function(file, index) {
                    var imageName = generateUniqueFileName(); // Đặt tên cho tệp tin trên Firebase Storage
                    var imageRef = storageRef.child('ib/kh/' + imageName);

                    // Tải tệp lên Firebase Storage
                    var uploadTask = imageRef.put(file, newMetadata);

                    // Xử lý khi tải lên thành công
                    uploadTask.then((snapshot) => {
                            // Lấy downloadURL từ Firebase Storage
                            snapshot.ref.getDownloadURL().then(function(downloadURL) {
                                giaTriKHText.push(downloadURL);
                                // Kiểm tra nếu đã lấy đủ URL từ tất cả các tệp ảnh
                                if (giaTriKHText.length === imgArrayKH.length) {
                                    var thoiGianUpload = new Date();

                                    // Định dạng ngày tháng năm + giờ phút
                                    var formattedTime = thoiGianUpload.toLocaleDateString('vi-VN', {
                                        year: 'numeric',
                                        month: '2-digit',
                                        day: '2-digit',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                    });

                                    var dataToUpload = {
                                        cellShow: true,
                                        phanLoai: phanLoai,
                                        tenSanPham: tenSanPham,
                                        thoiGianUpload: formattedTime,
                                        sp: imageUrl,
                                        kh: giaTriKHText
                                    };

                                    // Kiểm tra xem tài liệu đã tồn tại chưa
                                    collectionRef.doc("ib").get().then((doc) => {
                                            if (doc.exists) {
                                                // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                                collectionRef.doc("ib").update({
                                                        ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload),
                                                    })
                                                    .then(function() {
                                                        console.log("Document tải lên thành công");
                                                        popup.classList.remove('popup-show');
                                                        addProductToTable(imageUrl, giaTriKHText, tenSanPham, formattedTime, phanLoai);
														document.getElementById("addButton").disabled = false;
														clearData();
                                                    })
                                                    .catch(function(error) {
                                                        createPopup('Lỗi khi tải ảnh lên...', 2000);
                                                        console.error("Lỗi khi tải document lên: ", error);
                                                    });
                                            } else {
                                                // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                                collectionRef.doc("ib").set({
                                                        ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload),
                                                    })
                                                    .then(function() {
                                                        console.log("Document tải lên thành công");
                                                        popup.classList.remove('popup-show');
                                                        addProductToTable(imageUrl, giaTriKHText, tenSanPham, formattedTime, phanLoai);
														document.getElementById("addButton").disabled = false;
														clearData();
                                                    })
                                                    .catch(function(error) {
                                                        createPopup('Lỗi khi tải ảnh lên...', 2000);
                                                        console.error("Lỗi khi tải document lên: ", error);
                                                    });
                                            }
                                        })
                                        .catch(function(error) {
                                            console.error("Lỗi khi kiểm tra tài liệu tồn tại: ", error);
                                        });
                                }
                            });
                        })
                        .catch(function(error) {
                            console.error("Lỗi tải lên: ", error);
                        });
                });
            } else {
                createPopup('Đang tải ảnh lên', 5000);
                const hinhAnhFiles = hinhAnhInputFileKH.files;
                var imagesRef = storageRef.child('ib/kh');

                // Sử dụng Promise.all để theo dõi tất cả các tải lên
                const uploadPromises = [];

                function uploadImage(file) {
                    return new Promise((resolve, reject) => {
                        var imageRef = imagesRef.child(file.name + generateUniqueFileName());
                        var uploadTask = imageRef.put(file, newMetadata);

                        uploadTask.on('state_changed',
                            function(snapshot) {
                                // Xử lý tiến trình tải lên (nếu cần)
                            },
                            function(error) {
                                // Xử lý lỗi tải lên (nếu có)
                                reject(error);
                            },
                            function() {
                                // Xử lý khi tải lên thành công
                                uploadTask.snapshot.ref.getDownloadURL().then(function(downloadURL) {
                                    imageUrlFileKH.push(downloadURL);
                                    resolve();
                                }).catch(function(error) {
                                    // Xử lý lỗi lấy URL tải về (nếu có)
                                    reject(error);
                                });
                            }
                        );
                    });
                }

                for (const hinhAnh of hinhAnhFiles) {
                    uploadPromises.push(uploadImage(hinhAnh));
                }

                Promise.all(uploadPromises)
                    .then(() => {
                        var thoiGianUpload = new Date();
                        // Định dạng ngày tháng năm + giờ phút
                        var formattedTime = thoiGianUpload.toLocaleDateString('vi-VN', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                        });

                        var dataToUpload = {
                            cellShow: true,
                            phanLoai: phanLoai,
                            tenSanPham: tenSanPham,
                            thoiGianUpload: formattedTime,
                            sp: imageUrl,
                            kh: imageUrlFileKH
                        };

                        // Kiểm tra xem tài liệu đã tồn tại chưa
                        collectionRef.doc("ib").get().then((doc) => {
                                if (doc.exists) {
                                    // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                    collectionRef.doc("ib").update({
                                            ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload),
                                        })
                                        .then(function() {
                                            console.log("Document tải lên thành công");
                                            popup.classList.remove('popup-show');
                                            addProductToTable(imageUrl, imageUrlFileKH, tenSanPham, formattedTime, phanLoai);
											document.getElementById("addButton").disabled = false;
											clearData();
                                        })
                                        .catch(function(error) {
                                            createPopup('Lỗi khi tải ảnh lên...', 2000);
                                            console.error("Lỗi khi tải document lên: ", error);
                                        });
                                } else {
                                    // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                    collectionRef.doc("ib").set({
                                            ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload),
                                        })
                                        .then(function() {
                                            console.log("Document tải lên thành công");
                                            popup.classList.remove('popup-show');
                                            addProductToTable(imageUrl, imageUrlFileKH, tenSanPham, formattedTime, phanLoai);
											document.getElementById("addButton").disabled = false;
											clearData();
                                        })
                                        .catch(function(error) {
                                            createPopup('Lỗi khi tải ảnh lên...', 2000);
                                            console.error("Lỗi khi tải document lên: ", error);
                                        });
                                }
                            })
                            .catch(function(error) {
                                console.error("Lỗi khi kiểm tra tài liệu tồn tại: ", error);
                            });
                    });
            }
        }
    } else if (inputFileRadio.checked) {
        createPopup('Đang tải ảnh lên', 5000);

        const hinhAnhFiles = hinhAnhInputFile.files;

        var imagesRef = storageRef.child('ib/sp');

        // Sử dụng Promise.all để theo dõi tất cả các tải lên
        const uploadPromises = [];

        function uploadImage(file) {
            return new Promise((resolve, reject) => {
                var imageRef = imagesRef.child(file.name + generateUniqueFileName());
                var uploadTask = imageRef.put(file, newMetadata);

                uploadTask.on('state_changed',
                    function(snapshot) {
                        // Xử lý tiến trình tải lên (nếu cần)
                    },
                    function(error) {
                        // Xử lý lỗi tải lên (nếu có)
                        reject(error);
                    },
                    function() {
                        // Xử lý khi tải lên thành công
                        uploadTask.snapshot.ref.getDownloadURL().then(function(downloadURL) {
                            imageUrlFile.push(downloadURL);
                            resolve();
                        }).catch(function(error) {
                            // Xử lý lỗi lấy URL tải về (nếu có)
                            reject(error);
                        });
                    }
                );
            });
        }

        for (const hinhAnh of hinhAnhFiles) {
            uploadPromises.push(uploadImage(hinhAnh));
        }

        Promise.all(uploadPromises)
            .then(() => {
                if (inputClipboardRadioKH.checked) {
                    const giaTriKHText = [];

                    // Upload các tệp trong imgArray
                    imgArrayKH.forEach(function(file, index) {
                        var imageName = generateUniqueFileName(); // Đặt tên cho tệp tin trên Firebase Storage
                        var imageRef = storageRef.child('ib/kh/' + imageName);

                        // Tải tệp lên Firebase Storage
                        var uploadTask = imageRef.put(file, newMetadata);

                        // Xử lý khi tải lên thành công
                        uploadTask.then((snapshot) => {
                                // Lấy downloadURL từ Firebase Storage
                                snapshot.ref.getDownloadURL().then(function(downloadURL) {
                                    giaTriKHText.push(downloadURL);
                                    // Kiểm tra nếu đã lấy đủ URL từ tất cả các tệp ảnh
                                    if (giaTriKHText.length === imgArrayKH.length) {
                                        var thoiGianUpload = new Date();

                                        // Định dạng ngày tháng năm + giờ phút
                                        var formattedTime = thoiGianUpload.toLocaleDateString('vi-VN', {
                                            year: 'numeric',
                                            month: '2-digit',
                                            day: '2-digit',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        });

                                        var dataToUpload = {
                                            cellShow: true,
                                            phanLoai: phanLoai,
                                            tenSanPham: tenSanPham,
                                            thoiGianUpload: formattedTime,
                                            sp: imageUrlFile,
                                            kh: giaTriKHText
                                        };

                                        // Kiểm tra xem tài liệu đã tồn tại chưa
                                        collectionRef.doc("ib").get().then((doc) => {
                                                if (doc.exists) {
                                                    // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                                    collectionRef.doc("ib").update({
                                                            ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload),
                                                        })
                                                        .then(function() {
                                                            console.log("Document tải lên thành công");
                                                            popup.classList.remove('popup-show');
                                                            addProductToTable(imageUrlFile, giaTriKHText, tenSanPham, formattedTime, phanLoai);
															document.getElementById("addButton").disabled = false;
															clearData();
                                                        })
                                                        .catch(function(error) {
                                                            createPopup('Lỗi khi tải ảnh lên...', 2000);
                                                            console.error("Lỗi khi tải document lên: ", error);
                                                        });
                                                } else {
                                                    // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                                    collectionRef.doc("ib").set({
                                                            ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload),
                                                        })
                                                        .then(function() {
                                                            console.log("Document tải lên thành công");
                                                            popup.classList.remove('popup-show');
                                                            addProductToTable(imageUrlFile, giaTriKHText, tenSanPham, formattedTime, phanLoai);
															document.getElementById("addButton").disabled = false;
															clearData();
                                                        })
                                                        .catch(function(error) {
                                                            createPopup('Lỗi khi tải ảnh lên...', 2000);
                                                            console.error("Lỗi khi tải document lên: ", error);
                                                        });
                                                }
                                            })
                                            .catch(function(error) {
                                                console.error("Lỗi khi kiểm tra tài liệu tồn tại: ", error);
                                            });
                                    }
                                });
                            })
                            .catch(function(error) {
                                console.error("Lỗi tải lên: ", error);
                            });
                    });
                } else {
                    createPopup('Đang tải ảnh lên', 10000);
                    const hinhAnhFiles = hinhAnhInputFileKH.files;
                    var imagesRef = storageRef.child('ib/kh');

                    // Sử dụng Promise.all để theo dõi tất cả các tải lên
                    const uploadPromises = [];

                    function uploadImage(file) {
                        return new Promise((resolve, reject) => {
                            var imageRef = imagesRef.child(file.name + generateUniqueFileName());
                            var uploadTask = imageRef.put(file, newMetadata);

                            uploadTask.on('state_changed',
                                function(snapshot) {
                                    // Xử lý tiến trình tải lên (nếu cần)
                                },
                                function(error) {
                                    // Xử lý lỗi tải lên (nếu có)
                                    reject(error);
                                },
                                function() {
                                    // Xử lý khi tải lên thành công
                                    uploadTask.snapshot.ref.getDownloadURL().then(function(downloadURL) {
                                        imageUrlFileKH.push(downloadURL);
                                        resolve();
                                    }).catch(function(error) {
                                        // Xử lý lỗi lấy URL tải về (nếu có)
                                        reject(error);
                                    });
                                }
                            );
                        });
                    }

                    for (const hinhAnh of hinhAnhFiles) {
                        uploadPromises.push(uploadImage(hinhAnh));
                    }

                    Promise.all(uploadPromises)
                        .then(() => {

                            var thoiGianUpload = new Date();

                            // Định dạng ngày tháng năm + giờ phút
                            var formattedTime = thoiGianUpload.toLocaleDateString('vi-VN', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                            });

                            var dataToUpload = {
                                cellShow: true,
                                phanLoai: phanLoai,
                                tenSanPham: tenSanPham,
                                thoiGianUpload: formattedTime,
                                sp: imageUrlFile,
                                kh: imageUrlFileKH
                            };

                            // Kiểm tra xem tài liệu đã tồn tại chưa
                            collectionRef.doc("ib").get().then((doc) => {
                                    if (doc.exists) {
                                        // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                        collectionRef.doc("ib").update({
                                                ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload),
                                            })
                                            .then(function() {
                                                console.log("Document tải lên thành công");
                                                popup.classList.remove('popup-show');
                                                addProductToTable(imageUrlFile, imageUrlFileKH, tenSanPham, formattedTime, phanLoai);
												document.getElementById("addButton").disabled = false;
												clearData();
                                            })
                                            .catch(function(error) {
                                                createPopup('Lỗi khi tải ảnh lên...', 2000);
                                                console.error("Lỗi khi tải document lên: ", error);
                                            });
                                    } else {
                                        // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                        collectionRef.doc("ib").set({
                                                ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload),
                                            })
                                            .then(function() {
                                                console.log("Document tải lên thành công");
                                                popup.classList.remove('popup-show');
                                                addProductToTable(imageUrlFile, imageUrlFileKH, tenSanPham, formattedTime, phanLoai);
												document.getElementById("addButton").disabled = false;
												clearData();
                                            })
                                            .catch(function(error) {
                                                createPopup('Lỗi khi tải ảnh lên...', 30000);
                                                console.error("Lỗi khi tải document lên: ", error);
                                            });
                                    }
                                })
                                .catch(function(error) {
                                    console.error("Lỗi khi kiểm tra tài liệu tồn tại: ", error);
                                });
                        });
                }
            })
            .catch((error) => {
                console.error("Lỗi trong quá trình tải lên ảnh:", error);
            });
    } else {
        createPopup('Đang tải ảnh lên', 10000);
        const giaTriText = [];
        // Upload các tệp trong imgArray
        imgArray.forEach(function(file, index) {
            var imageName = generateUniqueFileName(); // Đặt tên cho tệp tin trên Firebase Storage

            var imageRef = storageRef.child('ib/sp/' + imageName);

            // Tải tệp lên Firebase Storage
            var uploadTask = imageRef.put(file, newMetadata);

            // Xử lý sự kiện hoàn thành tải lên
            uploadTask.on('state_changed',
                function(snapshot) {
                    // Xử lý quá trình tải lên (có thể theo dõi tiến trình)
                },
                function(error) {
                    // Xử lý lỗi trong quá trình tải lên
                    console.error("Lỗi tải lên: ", error);
                },
                function() {
                    uploadTask.snapshot.ref.getDownloadURL().then(function(downloadURL) {
                        giaTriText.push(downloadURL);

                        if (giaTriText.length === imgArray.length) {
                            if (inputClipboardRadioKH.checked) {
                                const giaTriKHText = [];

                                // Upload các tệp trong imgArray
                                imgArrayKH.forEach(function(file, index) {
                                    var imageName = generateUniqueFileName(); // Đặt tên cho tệp tin trên Firebase Storage
                                    var imageRef = storageRef.child('ib/kh/' + imageName);

                                    // Tải tệp lên Firebase Storage
                                    var uploadTask = imageRef.put(file, newMetadata);

                                    // Xử lý khi tải lên thành công
                                    uploadTask.then((snapshot) => {
                                            // Lấy downloadURL từ Firebase Storage
                                            snapshot.ref.getDownloadURL().then(function(downloadURL) {
                                                giaTriKHText.push(downloadURL);
                                                // Kiểm tra nếu đã lấy đủ URL từ tất cả các tệp ảnh
                                                if (giaTriKHText.length === imgArrayKH.length) {
                                                    var thoiGianUpload = new Date();

                                                    // Định dạng ngày tháng năm + giờ phút
                                                    var formattedTime = thoiGianUpload.toLocaleDateString('vi-VN', {
                                                        year: 'numeric',
                                                        month: '2-digit',
                                                        day: '2-digit',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    });

                                                    var dataToUpload = {
                                                        cellShow: true,
                                                        phanLoai: phanLoai,
                                                        tenSanPham: tenSanPham,
                                                        thoiGianUpload: formattedTime,
                                                        sp: giaTriText,
                                                        kh: giaTriKHText
                                                    };

                                                    // Kiểm tra xem tài liệu đã tồn tại chưa
                                                    collectionRef.doc("ib").get().then((doc) => {
                                                            if (doc.exists) {
                                                                // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                                                collectionRef.doc("ib").update({
                                                                        ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload),
                                                                    })
                                                                    .then(function() {
                                                                        console.log("Document tải lên thành công");
                                                                        popup.classList.remove('popup-show');
                                                                        addProductToTable(giaTriText, giaTriKHText, tenSanPham, formattedTime, phanLoai);
																		document.getElementById("addButton").disabled = false;
																		clearData();
                                                                    })
                                                                    .catch(function(error) {
                                                                        createPopup('Lỗi khi tải ảnh lên...', 30000);
                                                                        console.error("Lỗi khi tải document lên: ", error);
                                                                    });
                                                            } else {
                                                                // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                                                collectionRef.doc("ib").set({
                                                                        ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload),
                                                                    })
                                                                    .then(function() {
                                                                        console.log("Document tải lên thành công");
                                                                        popup.classList.remove('popup-show');
                                                                        addProductToTable(giaTriText, giaTriKHText, tenSanPham, formattedTime, phanLoai);
																		document.getElementById("addButton").disabled = false;
																		clearData();
                                                                    })
                                                                    .catch(function(error) {
                                                                        createPopup('Lỗi khi tải ảnh lên...', 30000);
                                                                        console.error("Lỗi khi tải document lên: ", error);
                                                                    });
                                                            }
                                                        })
                                                        .catch(function(error) {
                                                            console.error("Lỗi khi kiểm tra tài liệu tồn tại: ", error);
                                                        });
                                                }
                                            });
                                        })
                                        .catch(function(error) {
                                            console.error("Lỗi tải lên: ", error);
                                        });
                                });
                            } else {
                                createPopup('Đang tải ảnh lên', 10000);

                                const hinhAnhFiles = hinhAnhInputFileKH.files;

                                var imagesRef = storageRef.child('ib/kh');

                                // Sử dụng Promise.all để theo dõi tất cả các tải lên
                                const uploadPromises = [];

                                function uploadImage(file) {
                                    return new Promise((resolve, reject) => {
                                        var imageRef = imagesRef.child(file.name + generateUniqueFileName());
                                        var uploadTask = imageRef.put(file, newMetadata);

                                        uploadTask.on('state_changed',
                                            function(snapshot) {
                                                // Xử lý tiến trình tải lên (nếu cần)
                                            },
                                            function(error) {
                                                // Xử lý lỗi tải lên (nếu có)
                                                reject(error);
                                            },
                                            function() {
                                                // Xử lý khi tải lên thành công
                                                uploadTask.snapshot.ref.getDownloadURL().then(function(downloadURL) {
                                                    imageUrlFileKH.push(downloadURL);
                                                    resolve();
                                                }).catch(function(error) {
                                                    // Xử lý lỗi lấy URL tải về (nếu có)
                                                    reject(error);
                                                });
                                            }
                                        );
                                    });
                                }

                                for (const hinhAnh of hinhAnhFiles) {
                                    uploadPromises.push(uploadImage(hinhAnh));
                                }

                                Promise.all(uploadPromises)
                                    .then(() => {

                                        var thoiGianUpload = new Date();

                                        // Định dạng ngày tháng năm + giờ phút
                                        var formattedTime = thoiGianUpload.toLocaleDateString('vi-VN', {
                                            year: 'numeric',
                                            month: '2-digit',
                                            day: '2-digit',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        });

                                        var dataToUpload = {
                                            cellShow: true,
                                            phanLoai: phanLoai,
                                            tenSanPham: tenSanPham,
                                            thoiGianUpload: formattedTime,
                                            sp: giaTriText,
                                            kh: imageUrlFileKH
                                        };

                                        // Kiểm tra xem tài liệu đã tồn tại chưa
                                        collectionRef.doc("ib").get().then((doc) => {
                                                if (doc.exists) {
                                                    // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                                    collectionRef.doc("ib").update({
                                                            ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload),
                                                        })
                                                        .then(function() {
                                                            console.log("Document tải lên thành công");
                                                            popup.classList.remove('popup-show');
                                                            addProductToTable(giaTriText, imageUrlFileKH, tenSanPham, formattedTime, phanLoai);
															document.getElementById("addButton").disabled = false;
															clearData();
                                                        })
                                                        .catch(function(error) {
                                                            createPopup('Lỗi khi tải ảnh lên...', 30000);
                                                            console.error("Lỗi khi tải document lên: ", error);
                                                        });
                                                } else {
                                                    // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                                    collectionRef.doc("ib").set({
                                                            ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload),
                                                        })
                                                        .then(function() {
                                                            console.log("Document tải lên thành công");
                                                            popup.classList.remove('popup-show');
                                                            addProductToTable(giaTriText, imageUrlFileKH, tenSanPham, formattedTime, phanLoai);
															document.getElementById("addButton").disabled = false;
															clearData();
                                                        })
                                                        .catch(function(error) {
                                                            createPopup('Lỗi khi tải ảnh lên...', 30000);
                                                            console.error("Lỗi khi tải document lên: ", error);
                                                        });
                                                }
                                            })
                                            .catch(function(error) {
                                                console.error("Lỗi khi kiểm tra tài liệu tồn tại: ", error);
                                            });
                                    });
                            }
                        }
                    });
                    // Xử lý khi tải lên thành công
                    console.log("Tải lên thành công");
                }
            );
        });
    }
});

document.getElementById('clearDataButton').addEventListener('click', clearData);


function clearData() {
    imgArray = [];
    imgArrayKH = [];
    imageUrlFile = [];
    imageUrlFileKH = [];

    document.getElementById('tenSanPham').value = '';
    document.getElementById('hinhAnhInputFile').value = '';
    document.getElementById('hinhAnhInputFileKH').value = '';

    // Kiểm tra xem có các thẻ <input> trong hinhAnhContainer không
    var resetInputLinks = hinhAnhContainer.querySelectorAll('input');

    resetInputLinks.forEach(function(input) {
        hinhAnhContainer.removeChild(input);
    });

    var imagesToRemoveSP = inputClipboardContainer.querySelectorAll('img');

    // Kiểm tra xem có các thẻ <img> trong inputClipboardContainer không
    if (imagesToRemoveSP.length > 0) {
        imagesToRemoveSP.forEach(function(image) {
            inputClipboardContainer.removeChild(image);
        });
    }

    var imagesToRemoveKH = inputClipboardContainerKH.querySelectorAll('img');

    // Kiểm tra xem có các thẻ <img> trong inputClipboardContainerKH không
    if (imagesToRemoveKH.length > 0) {
        imagesToRemoveKH.forEach(function(image) {
            inputClipboardContainerKH.removeChild(image);
        });
    }

}

inputFileRadio.addEventListener('change', function() {
    inputFileContainer.style.display = 'block';
    inputLinkContainer.style.display = 'none';
    inputClipboardContainer.style.display = 'none';
    hinhAnhContainer.style.display = 'none';
});

inputLinkRadio.addEventListener('change', function() {
    inputFileContainer.style.display = 'none';
    inputLinkContainer.style.display = 'block';
    inputClipboardContainer.style.display = 'none';
    hinhAnhContainer.style.display = 'block';
});

inputClipboardRadio.addEventListener('change', function() {
    inputFileContainer.style.display = 'none';
    inputLinkContainer.style.display = 'none';
    inputClipboardContainer.style.display = 'block';
    hinhAnhContainer.style.display = 'none';
});

inputFileRadioKH.addEventListener('change', function() {
    inputFileContainerKH.style.display = 'block';
    inputClipboardContainerKH.style.display = 'none';
    hinhAnhContainerKH.style.display = 'none';
});

inputClipboardRadioKH.addEventListener('change', function() {
    inputFileContainerKH.style.display = 'none';
    inputClipboardContainerKH.style.display = 'block';
    hinhAnhContainerKH.style.display = 'none';
});

// Hàm để tạo tên tệp động duy nhất
function generateUniqueFileName() {
    return Date.now() + '_' + Math.random().toString(36).substr(2, 9) + '.png';
}

document.addEventListener('DOMContentLoaded', function() {
    const toggleFormButton = document.getElementById('toggleFormButton');
    const dataForm = document.getElementById('dataForm');
    toggleFormButton.addEventListener('click', function() {
        if (dataForm.style.display === 'none' || dataForm.style.display === '') {
            dataForm.style.display = 'block';
            toggleFormButton.textContent = 'Ẩn biểu mẫu';
        } else {
            dataForm.style.display = 'none';
            toggleFormButton.textContent = 'Hiện biểu mẫu';
        }
    });
});

function clearImageContainer(altText) {
    var imageContainer = document.querySelector('.' + altText + 'product-row');
    while (imageContainer.firstChild) {
        imageContainer.removeChild(imageContainer.firstChild);
    }
}

function addImagesFromStorage() {
    collectionRef.doc("ib").get()
        .then((doc) => {
            if (doc.exists) {
                // Tài liệu tồn tại, truy cập dữ liệu bằng cách sử dụng doc.data()
                const data = doc.data();
                tbody.innerHTML = '';
                let rowIndex = data.data.length + 1;
                if (data && Array.isArray(data.data)) {
                    for (let i = data.data.length - 1; i >= 0; i--) {
                        const row = tbody.insertRow();
                        const thuTuCell = row.insertCell();
                        const thoiGianUploadCell = row.insertCell();
                        const phanLoaiCell = row.insertCell();
                        const hinhAnhCell = row.insertCell();
                        const tenSanPhamCell = row.insertCell();
                        const thongTinKhachHangCell = row.insertCell();
                        const toggleVisibilityCell = row.insertCell();
                        if (data["data"][i]) {
                            rowIndex--;
                            thuTuCell.textContent = rowIndex;
                            thoiGianUploadCell.textContent = data["data"][i].thoiGianUpload; // Sử dụng formatDateTime
                            phanLoaiCell.textContent = data["data"][i].phanLoai;

                            if (Array.isArray(data["data"][i].sp)) {
                                for (let j = 0; j < data["data"][i].sp.length; j++) {
                                    const productImage = document.createElement('img');
                                    productImage.src = data["data"][i].sp[j];
                                    productImage.alt = data["data"][i].tenSanPham;
                                    productImage.classList.add('product-image');

                                    // Thêm sản phẩm vào ô hinhAnhCell
                                    hinhAnhCell.appendChild(productImage);

                                    // Thêm dấu cách giữa các hình
                                    if (j < data["data"][i].sp.length - 1) {
                                        hinhAnhCell.appendChild(document.createTextNode(' '));
                                    }
                                }
                            } else {
                                hinhAnhCell.innerHTML = `<img src="${data["data"][i].sp}" alt="${data["data"][i].tenSanPham}" class="product-image">`;
                            }

                            tenSanPhamCell.textContent = data["data"][i].tenSanPham;

                            if (Array.isArray(data["data"][i].kh)) {
                                for (let j = 0; j < data["data"][i].kh.length; j++) {
                                    const productImage = document.createElement('img');
                                    productImage.src = data["data"][i].kh[j];
                                    productImage.alt = "Hình ảnh khách hàng";
                                    productImage.classList.add('product-image');

                                    // Thêm sản phẩm vào ô thongTinKhachHangCell
                                    thongTinKhachHangCell.appendChild(productImage);

                                    // Thêm dấu cách giữa các hình
                                    if (j < data["data"][i].kh.length - 1) {
                                        thongTinKhachHangCell.appendChild(document.createTextNode(' '));
                                    }
                                }
                            } else {
                                thongTinKhachHangCell.innerHTML = `<img src="${data["data"][i].kh}" alt="Hình ảnh khách hàng">`;
                            }

                            const hideButton = document.createElement('button');
                            hideButton.className = 'toggle-visibility';
                            hideButton.onclick = () => toggleRowVisibility(row, hideButton);
                            toggleVisibilityCell.appendChild(hideButton);

                            if (data["data"][i].cellShow == false) {
                                hideButton.innerText = 'Hiện';
                                thuTuCell.style.display = 'none';
                                thoiGianUploadCell.style.display = 'none';
                                phanLoaiCell.style.display = 'none';
                                hinhAnhCell.style.display = 'none';
                                tenSanPhamCell.style.display = 'none';
                                thongTinKhachHangCell.style.display = 'none';
                            } else {
                                hideButton.innerText = 'Ẩn';
                                thuTuCell.style.display = '';
                                thoiGianUploadCell.style.display = '';
                                phanLoaiCell.style.display = '';
                                hinhAnhCell.style.display = '';
                                tenSanPhamCell.style.display = '';
                                thongTinKhachHangCell.style.display = '';
                            }
                        } else {
                            thuTuCell.textContent = '';
                            thoiGianUploadCell.textContent = '';
                            phanLoaiCell.textContent = '';
                            hinhAnhCell.innerHTML = '';
                            tenSanPhamCell.textContent = '';
                            thongTinKhachHangCell.innerHTML = '';
                        }
                    }
                }
            } else {
                console.log("Tài liệu không tồn tại.");
            }
        })
        .catch((error) => {
            console.error("Lỗi khi lấy dữ liệu:", error);
        });
}

function createPopup(message, time = 1500) {
    var popup = document.getElementById('popup');
    var popupMessage = document.getElementById('popup-message');
    popup.classList.remove('popup-show');
    popupMessage.textContent = message;
    popup.classList.add('popup-show');

    setTimeout(function() {
        popup.classList.remove('popup-show');
    }, time); // Tắt thông báo sau 1.5 giây
}

// Hàm để trích xuất giá trị của tham số từ URL
function getURLParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    var results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

function displayAll() {
    addImagesFromStorage();
}

function addProductToTable(imgSrcSP, imgSrcKH, tenSanPham, thoiGianUpload, phanLoai) {
    const row = tbody.insertRow(0);
    const thuTuCell = row.insertCell();
    const thoiGianUploadCell = row.insertCell();
    const phanLoaiCell = row.insertCell();
    const hinhAnhCell = row.insertCell();
    const tenSanPhamCell = row.insertCell();
    const thongTinKhachHangCell = row.insertCell();
    const toggleVisibilityCell = row.insertCell();

    thuTuCell.textContent = tbody.querySelectorAll("tr").length;;
    thoiGianUploadCell.textContent = thoiGianUpload; // Sử dụng formatDateTime
    phanLoaiCell.textContent = phanLoai;

    hinhAnhCell.innerHTML = `<img src="${imgSrcSP}" alt="${tenSanPham}" class="product-image">`;

    tenSanPhamCell.textContent = tenSanPham;
    thongTinKhachHangCell.innerHTML = `<img src="${imgSrcKH}" alt="Hình ảnh khách hàng" class="product-image">`;

    const hideButton = document.createElement('button');
    hideButton.className = 'toggle-visibility';
	hideButton.textContent = 'Ẩn';
    hideButton.onclick = () => toggleRowVisibility(row, hideButton);
    toggleVisibilityCell.appendChild(hideButton);
}

displayAll();