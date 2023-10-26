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
const collectionRef = db.collection("hangrotxa");

// Lấy tbody của bảng
const tbody = document.getElementById('productTableBody');

const inputFileRadio = document.getElementById('inputFile');
const inputLinkRadio = document.getElementById('inputLink');
const inputClipboardRadio = document.getElementById('inputClipboard');
const inputFileContainer = document.getElementById('inputFileContainer');
const inputLinkContainer = document.getElementById('inputLinkContainer');
const inputClipboardContainer = document.getElementById('container');
const hinhAnhInputFile = document.getElementById('hinhAnhInputFile');
const hinhAnhInputLink = document.getElementById('hinhAnhInputLink');
const hinhAnhContainer = document.getElementById('hinhAnhContainer');

var imageUrlFile = []; // Mảng để lưu trữ URL tải về
var imgArray = [];

// Ẩn trường nhập liệu link ban đầu
inputLinkContainer.style.display = 'none';
inputFileContainer.style.display = 'none';

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

// Add a paste event listener to the document
inputClipboardContainer.addEventListener('paste', function(e) {
    if (inputClipboardRadio.checked) {
        // Create a temporary file input element
        imgArray = [];

        e.preventDefault();
        var items = (e.clipboardData || e.originalEvent.clipboardData).items;

        for (var i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                var blob = items[i].getAsFile(); // Tạo một Blob từ dữ liệu hình ảnh
                var file = new File([blob], "image.jpg"); // Tạo một File từ Blob

                // Xóa tất cả các phần tử hình ảnh hiện có trong phần tử <div>
                inputClipboardContainer.innerHTML = "";

                // Tạo một phần tử img
                var imgElement = document.createElement("img");

                // Đặt thuộc tính src cho phần tử img bằng URL của tệp
                imgElement.src = URL.createObjectURL(file);

                // Thêm phần tử img vào phần tử <div>
                inputClipboardContainer.appendChild(imgElement);

                imgArray.push(file);
            }
        }
    }
});

/*
// Thêm một sự kiện click vào phần tử inputClipboardContainer
inputClipboardContainer.addEventListener('click', function(e) {
    // Kiểm tra xem phần tử được click có phải là một phần tử <img> không
    if (e.target.tagName === 'IMG') {
        // Xoá phần tử img khỏi mảng imgArray
        var index = imgArray.indexOf(e.target);
        if (index !== -1) {
            imgArray.splice(index, 1);
        }

        // Xoá phần tử img khỏi inputClipboardContainer
        e.target.parentNode.removeChild(e.target);
        var newElement = document.createElement('p')
        newElement.textContent = 'Dán ảnh sản phẩm ở đây…';
        inputClipboardContainer.appendChild(newElement);
    }
});
*/


// Hàm để tạo tên tệp động duy nhất
function generateUniqueFileName() {
    return Date.now() + '_' + Math.random().toString(36).substr(2, 9) + '.png';
}

// Lấy thẻ select
const filterCategorySelect = document.getElementById('filterCategory');

// Sử dụng sự kiện 'change' để tự động áp dụng bộ lọc khi người dùng thay đổi giá trị
filterCategorySelect.addEventListener('change', applyCategoryFilter);

// Lấy thẻ form và xử lý sự kiện nút "Thêm dữ liệu"
const productForm = document.getElementById('productForm');
productForm.addEventListener('submit', addProduct);

// Hiển thị dữ liệu hàng tồn sản phẩm trong bảng
async function displayInventoryData() {
    try {
        const doc = await collectionRef.doc("hangrotxa").get();

        if (doc.exists) {
            // Sao chép dữ liệu
            const data = doc.data(); // Sao chép mảng
            // Check if data is defined and data.data is an array
            if (data && Array.isArray(data.data)) {
                var tableElement = document.getElementById('productTableBody');

                for (let i = data.data.length - 1; i >= 0; i--) {
                    const product = data.data[i];
                    // Tạo các phần tử
                    var tr = document.createElement('tr');
                    var td1 = document.createElement('td');
                    var td2 = document.createElement('td');
                    var td3 = document.createElement('td');
                    var td4 = document.createElement('td');
                    var td5 = document.createElement('td');
                    var td6 = document.createElement('td');
                    var td7 = document.createElement('td');
                    var td8 = document.createElement('td');
                    var img = document.createElement('img');
                    var input = document.createElement('input');
                    var button = document.createElement('button');

                    // Đặt nội dung cho các phần tử
                    td1.textContent = i + 1;
                    td2.textContent = product.thoiGianUpload;
                    td3.textContent = product.phanLoai;
                    img.src = product.hinhAnh;
                    img.alt = 'Hình sản phẩm';
                    td4.appendChild(img);
                    td5.textContent = product.tenSanPham;
                    td6.textContent = product.kichCo;
                    input.type = 'number';
                    input.value = product.soLuong;
                    input.min = '0';
                    input.id = img.src;
                    input.addEventListener('change', function() {
                        updateInventory();
                    });
                    td7.appendChild(input);
                    button.textContent = 'Xoá';
                    button.class = 'deleteButton';
                    button.addEventListener('click', deleteInventory);

                    // Đặt các phần tử con vào phần tử tr
                    tr.appendChild(td1);
                    tr.appendChild(td2);
                    tr.appendChild(td3);
                    tr.appendChild(td4);
                    tr.appendChild(td5);
                    tr.appendChild(td6);
                    tr.appendChild(td7);
                    tr.appendChild(td8);
                    td8.appendChild(button);

                    // Lấy bảng trong trang web và chèn phần tử tr vào bảng
                    var table = document.getElementById('productTableBody');
                    table.appendChild(tr);
                }
            }
        }
    } catch (error) {
        // Xử lý lỗi ở đây nếu có
        console.error(error);
    }
}



// Hàm để lấy thời gian hiện tại và định dạng theo dd/mm/yyyy
function getFormattedDate() {
    const currentDate = new Date();
    const day = currentDate.getDate().toString().padStart(2, '0');
    const month = (currentDate.getMonth() + 1).toString().padStart(2, '0'); // Tháng bắt đầu từ 0
    const year = currentDate.getFullYear();
    return `${day}-${month}-${year}`;
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

soLuongInput.addEventListener('input', function() {
    const enteredValue = parseInt(soLuongInput.value);

    if (enteredValue < 1) {
        alert('Số lượng phải lớn hơn hoặc bằng 1');
        soLuongInput.value = '1'; // Đặt lại giá trị thành 1 nếu người dùng nhập số nhỏ hơn 1
    }
});

// Cập nhật số lượng sản phẩm khi người dùng thay đổi giá trị
function updateInventory() {
    // Lắng nghe sự kiện khi giá trị cột số lượng thay đổi

    const row = event.target.closest("tr");
    const imgElement = row.querySelector("img");
    const imgSrc = imgElement.src;;
    const quantity = event.target.value;
    const size = row.getElementsByTagName("td")[5].textContent;

    if (quantity < 1) {
        if (row) {
            if (imgElement) {
                const imgSrc = imgElement.src;
                collectionRef.doc("hangrotxa").get()
                    .then((doc) => {
                        if (doc.exists) {
                            // Sao chép dữ liệu
                            const data = doc.data(); // Sao chép mảng

                            for (let i = 0; i < data["data"].length; i++) {
                                if (Array.isArray(data["data"][i].hinhAnh)) {
                                    if (imgSrc === data["data"][i].hinhAnh[0] && size === data["data"][i].kichCo) {
                                        data["data"].splice(i, 1); // Xoá phần tử tại vị trí i
                                        break; // Kết thúc vòng lặp sau khi xoá
                                    }
                                } else {
                                    if (imgSrc === data["data"][i].hinhAnh && size === data["data"][i].kichCo) {
                                        data["data"].splice(i, 1); // Xoá phần tử tại vị trí i
                                        break; // Kết thúc vòng lặp sau khi xoá
                                    }
                                }
                            }

                            // Kiểm tra xem tài liệu đã tồn tại chưa
                            collectionRef.doc("hangrotxa").get().then(doc => {
                                if (doc.exists) {
                                    // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                    collectionRef.doc("hangrotxa").update({
                                        "data": data["data"]
                                    }).then(function() {
                                        console.log("Document tải lên thành công");
                                    }).catch(function(error) {
                                        console.error("Lỗi khi tải document lên: ", error);
                                    });
                                } else {
                                    // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                    collectionRef.doc("hangrotxa").set({
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
        }
    } else {
        if (row) {
            if (imgElement) {
                collectionRef.doc("hangrotxa").get()
                    .then((doc) => {
                        if (doc.exists) {
                            // Sao chép dữ liệu
                            const data = doc.data(); // Sao chép mảng

                            for (let i = 0; i < data["data"].length; i++) {
                                if (Array.isArray(data["data"][i].hinhAnh)) {
                                    if (imgSrc === data["data"][i].hinhAnh[0] && size === data["data"][i].kichCo) {
                                        data["data"][i].soLuong = quantity;
                                        break; // Kết thúc vòng lặp sau khi xoá
                                    }
                                } else {
                                    if (imgSrc === data["data"][i].hinhAnh && size === data["data"][i].kichCo) {
                                        data["data"][i].soLuong = quantity;
                                        break; // Kết thúc vòng lặp sau khi xoá
                                    }
                                }


                            }

                            // Kiểm tra xem tài liệu đã tồn tại chưa
                            collectionRef.doc("hangrotxa").get().then(doc => {
                                if (doc.exists) {
                                    // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                    collectionRef.doc("hangrotxa").update({
                                        "data": data["data"]
                                    }).then(function() {
                                        console.log("Document tải lên thành công");
                                    }).catch(function(error) {
                                        console.error("Lỗi khi tải document lên: ", error);
                                    });
                                } else {
                                    // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                    collectionRef.doc("hangrotxa").set({
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
        }
    }

}

// Xoá sản phẩm khi người dùng ấn nút "Xoá"
function deleteInventory() {
    const confirmDelete = confirm("Bạn có chắc chắn muốn xóa?");
    const row = event.target.closest("tr");
    if (confirmDelete) {
        if (row) {
            const imgElement = row.querySelector("img");
            if (imgElement) {
                const imgSrc = imgElement.src;
                collectionRef.doc("hangrotxa").get()
                    .then((doc) => {
                        if (doc.exists) {
                            // Sao chép dữ liệu
                            const data = doc.data(); // Sao chép mảng

                            for (let i = 0; i < data["data"].length; i++) {
                                if (imgSrc === data["data"][i].hinhAnh) {
                                    data["data"].splice(i, 1); // Xoá phần tử tại vị trí i
                                    break; // Kết thúc vòng lặp sau khi xoá
                                }
                            }

                            // Kiểm tra xem tài liệu đã tồn tại chưa
                            collectionRef.doc("hangrotxa").get().then(doc => {
                                if (doc.exists) {
                                    // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                    collectionRef.doc("hangrotxa").update({
                                        "data": data["data"]
                                    }).then(function() {
                                        console.log("Document tải lên thành công");
                                    }).catch(function(error) {
                                        console.error("Lỗi khi tải document lên: ", error);
                                    });
                                } else {
                                    // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                                    collectionRef.doc("hangrotxa").set({
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
        }
    }
}

// Thêm sản phẩm mới từ biểu mẫu
function addProduct(event) {
    event.preventDefault();
    document.getElementById("addButton").disabled = true
    const phanLoai = document.getElementById('phanLoai').value;
    const hinhAnhInput = document.getElementById('hinhAnhInput');
    const tenSanPham = document.getElementById('tenSanPham').value;
    const kichCo = document.getElementById('kichCo').value;
    const soLuong = parseInt(document.getElementById('soLuong').value);

    if (soLuong < 1) {
        alert('Số lượng phải lớn hơn hoặc bằng 1');
        return;
    }

    // Dữ liệu muốn tải lên Firestore
    var collectionName;

    if (phanLoai == "Áo") {
        collectionName = "ao";
    } else if (phanLoai == "Quần") {
        collectionName = "quan";
    } else if (phanLoai == "Set và Đầm") {
        collectionName = "setvadam";
    } else if (phanLoai == "PKGD") {
        collectionName = "pkgd";
    }

    var thoiGianUpload = new Date();

    // Định dạng ngày tháng năm + giờ phút
    var formattedTime = thoiGianUpload.toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });

    if (inputLinkRadio.checked) {
        if (!hinhAnhInput.value.startsWith("https://")) {
            alert('Sai định dạng link');
            return;
        }

        createPopup('Đang tải ảnh lên', 5000);

        const imageUrl = hinhAnhInput.value; // Đặt URL của hình ảnh tải lên

        var dataToUpload = {
            thoiGianUpload: formattedTime,
            phanLoai: phanLoai,
            hinhAnh: imageUrl,
            tenSanPham: tenSanPham,
            kichCo: kichCo,
            soLuong: soLuong
        };

        // Kiểm tra xem tài liệu đã tồn tại chưa
        collectionRef.doc("hangrotxa").get().then(doc => {
            if (doc.exists) {
                // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                collectionRef.doc("hangrotxa").update({
                    ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload)
                }).then(function() {
                    console.log("Document tải lên thành công");
                    popup.classList.remove('popup-show');
                    addProducToTable(formattedTime, phanLoai, imageUrl, tenSanPham, kichCo, soLuong);
					document.getElementById("addButton").disabled = false;
					clearData();
                }).catch(function(error) {
                    createPopup('Lỗi khi tải ảnh lên...', 2000);
                    console.error("Lỗi khi tải document lên: ", error);
                });
            } else {
                // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                collectionRef.doc("hangrotxa").set({
                    ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload)
                }).then(function() {
                    console.log("Document tải lên thành công");
                    popup.classList.remove('popup-show');
                    addProducToTable(formattedTime, phanLoai, imageUrl, tenSanPham, kichCo, soLuong);
					document.getElementById("addButton").disabled = false;
					clearData();
                }).catch(function(error) {
                    createPopup('Lỗi khi tải ảnh lên...', 2000);
                    console.error("Lỗi khi tải document lên: ", error);
                });
            }
        })

    } else if (inputFileRadio.checked) {
        createPopup('Đang tải ảnh lên', 5000);

        const hinhAnhFiles = hinhAnhInputFile.files;

        var imagesRef = storageRef.child('hangrotxa/sp');

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
                // Tất cả các tác vụ tải lên đã hoàn thành, imageUrlFile bây giờ chứa các URL

                const imageUrl = imageUrlFile; // Đặt URL của hình ảnh tải lên

                var dataToUpload = {
                    thoiGianUpload: formattedTime,
                    phanLoai: phanLoai,
                    hinhAnh: imageUrl,
                    tenSanPham: tenSanPham,
                    kichCo: kichCo,
                    soLuong: soLuong
                };

                // Kiểm tra xem tài liệu đã tồn tại chưa
                collectionRef.doc("hangrotxa").get().then(doc => {
                    if (doc.exists) {
                        // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                        collectionRef.doc("hangrotxa").update({
                            ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload)
                        }).then(function() {
                            console.log("Document tải lên thành công");
                            popup.classList.remove('popup-show');
                            addProducToTable(formattedTime, phanLoai, imageUrl, tenSanPham, kichCo, soLuong);
							document.getElementById("addButton").disabled = false;
							clearData();
                        }).catch(function(error) {
                            createPopup('Lỗi khi tải ảnh lên...', 2000);
                            console.error("Lỗi khi tải document lên: ", error);
                        });
                    } else {
                        // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                        collectionRef.doc("hangrotxa").set({
                            ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload)
                        }).then(function() {
                            console.log("Document tải lên thành công");
                            popup.classList.remove('popup-show');
                            addProducToTable(formattedTime, phanLoai, imageUrl, tenSanPham, kichCo, soLuong);
							document.getElementById("addButton").disabled = false;
							clearData();
                        }).catch(function(error) {
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

        var imageName = generateUniqueFileName(); // Đặt tên cho tệp tin trên Firebase Storage

        var imageRef = storageRef.child('hangrotxa/sp/' + imageName);

        // Tải tệp lên Firebase Storage
        var uploadTask = imageRef.put(imgArray[0], newMetadata);

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
                    const imageUrl = downloadURL;

                    var dataToUpload = {
                        thoiGianUpload: formattedTime,
                        phanLoai: phanLoai,
                        hinhAnh: imageUrl,
                        tenSanPham: tenSanPham,
                        kichCo: kichCo,
                        soLuong: soLuong
                    };

                    // Kiểm tra xem tài liệu đã tồn tại chưa
                    collectionRef.doc("hangrotxa").get().then(doc => {
                        if (doc.exists) {
                            // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                            collectionRef.doc("hangrotxa").update({
                                ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload)
                            }).then(function() {
                                console.log("Document tải lên thành công");
                                popup.classList.remove('popup-show');
                                addProducToTable(formattedTime, phanLoai, imageUrl, tenSanPham, kichCo, soLuong);
								document.getElementById("addButton").disabled = false;
								clearData();
                            }).catch(function(error) {
                                createPopup('Lỗi khi tải ảnh lên...', 30000);
                                console.error("Lỗi khi tải document lên: ", error);
                            });
                        } else {
                            // Thêm dữ liệu vào tài liệu đã tồn tại mà không đè lên
                            collectionRef.doc("hangrotxa").set({
                                ["data"]: firebase.firestore.FieldValue.arrayUnion(dataToUpload)
                            }).then(function() {
                                console.log("Document tải lên thành công");
                                popup.classList.remove('popup-show');
                                addProducToTable(formattedTime, phanLoai, imageUrl, tenSanPham, kichCo, soLuong);
								document.getElementById("addButton").disabled = false;
								clearData();
                            }).catch(function(error) {
                                createPopup('Lỗi khi tải ảnh lên...', 30000);
                                console.error("Lỗi khi tải document lên: ", error);
                            });
                        }
                    })
                });
                // Xử lý khi tải lên thành công
                console.log("Tải lên thành công");
            }
        );
    }
}

// Thêm hàm để ẩn/hiện biểu mẫu
function toggleForm() {
    const dataForm = document.getElementById('dataForm');
    const toggleFormButton = document.getElementById('toggleFormButton');

    if (dataForm.style.display === 'none' || dataForm.style.display === '') {
        dataForm.style.display = 'block';
        toggleFormButton.textContent = 'Ẩn biểu mẫu';
    } else {
        dataForm.style.display = 'none';
        toggleFormButton.textContent = 'Hiện biểu mẫu';
    }
}

// Lắng nghe sự kiện click trên nút "Thêm Sản Phẩm"
const toggleFormButton = document.getElementById('toggleFormButton');
toggleFormButton.addEventListener('click', toggleForm);

document.getElementById('clearDataButton').addEventListener('click', clearData);

function clearData() {
    imgArray = [];
    imageUrlFile = [];

    document.getElementById('tenSanPham').value = '';
    document.getElementById('soLuong').value = '';
    document.getElementById('hinhAnhInput').value = '';
	document.getElementById('hinhAnhInputFile').value = '';

    var imagesToRemoveSP = inputClipboardContainer.querySelectorAll('img');

	// Kiểm tra xem có các thẻ <img> trong inputClipboardContainer không
	if (imagesToRemoveSP.length > 0) {
		imagesToRemoveSP.forEach(function(image) {
			inputClipboardContainer.removeChild(image);
		});

		// Tạo một thẻ <p> và thêm nó vào inputClipboardContainer
		var paragraph = document.createElement('p');
		paragraph.textContent = 'Dán hình ảnh sản phẩm ở đây...';
		inputClipboardContainer.appendChild(paragraph);
	}

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

function addProducToTable(thoiGianUpload, phanLoai, hinhAnh, tenSanPham, kichCo, soLuong) {
    var tr = document.createElement('tr');
    var td1 = document.createElement('td');
    var td2 = document.createElement('td');
    var td3 = document.createElement('td');
    var td4 = document.createElement('td');
    var td5 = document.createElement('td');
    var td6 = document.createElement('td');
    var td7 = document.createElement('td');
    var td8 = document.createElement('td');
    var img = document.createElement('img');
    var input = document.createElement('input');
    var button = document.createElement('button');

    // Đặt nội dung cho các phần tử
    td1.textContent = tbody.querySelectorAll("tr").length + 1;
    td2.textContent = thoiGianUpload;
    td3.textContent = phanLoai;
    img.src = hinhAnh;
    img.alt = 'Hình sản phẩm';
    td4.appendChild(img);
    td5.textContent = tenSanPham;
    td6.textContent = kichCo;
    input.type = 'number';
    input.value = soLuong;
    input.min = '0';
    input.id = img.src;
    input.addEventListener('change', function() {
        updateInventory();
    });
    td7.appendChild(input);
    button.textContent = 'Xoá';
    button.class = 'deleteButton';
    button.addEventListener('click', deleteInventory);

    // Đặt các phần tử con vào phần tử tr
    tr.appendChild(td1);
    tr.appendChild(td2);
    tr.appendChild(td3);
    tr.appendChild(td4);
    tr.appendChild(td5);
    tr.appendChild(td6);
    tr.appendChild(td7);
    tr.appendChild(td8);
    td8.appendChild(button);

    // Lấy bảng trong trang web và chèn phần tử tr vào bảng
    var table = document.getElementById('productTableBody');
    var firstRow = table.querySelector('tr:first-child'); // Lấy dòng đầu tiên
    table.insertBefore(tr, firstRow);
}

// Gọi hàm để hiển thị dữ liệu ban đầu và cài đặt sự kiện cho input tệp hình ảnh
displayInventoryData();