document.addEventListener('DOMContentLoaded', function() {
    // Your web app's Firebase configuration
	// For Firebase JS SDK v7.20.0 and later, measurementId is optional
	const firebaseConfig = {
	  apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
	  authDomain: "n2shop-69e37.firebaseapp.com",
	  projectId: "n2shop-69e37",
	  storageBucket: "n2shop-69e37.appspot.com",
	  messagingSenderId: "598906493303",
	  appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
	  measurementId: "G-TEJH3S2T1D"
	};
    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);
    var storageRef = firebase.storage().ref();
    const toggleFormButton = document.getElementById('toggleFormButton');
    const dataForm = document.getElementById('dataForm');
    const productForm = document.getElementById('productForm');
    const liveTable = document.querySelector('.live table');
    const dateFilterDropdown = document.getElementById('dateFilter');
    // Đặt giá trị max cho trường input ngày là ngày hôm nay
    const dotLiveInput = document.getElementById('dotLive');
    var liveDate = document.getElementById('liveDate');
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dotLiveInput.value = `${yyyy}-${mm}-${dd}`; // Đặt giá trị mặc định là ngày hôm nay
    dotLiveInput.addEventListener('input', function() {
        // Kiểm tra nếu người dùng nhập ngày trong tương lai, thì đặt giá trị về ngày hôm nay
        const enteredDate = new Date(dotLiveInput.value);
        if (enteredDate > today) {
            dotLiveInput.value = `${yyyy}-${mm}-${dd}`;
        }
    });
    toggleFormButton.addEventListener('click', function() {
        if (dataForm.style.display === 'none' || dataForm.style.display === '') {
            dataForm.style.display = 'block';
            toggleFormButton.textContent = 'Ẩn biểu mẫu';
        } else {
            dataForm.style.display = 'none';
            toggleFormButton.textContent = 'Hiện biểu mẫu';
        }
    });
    productForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const phanLoai = document.getElementById('phanLoai').value;
        const dotLiveInput = document.getElementById('dotLive');
        const dotLiveValue = dotLiveInput.value;
        var uploadPhanLoai;
        if (!dotLiveValue) {
            alert('Vui lòng chọn một đợt Live.');
            return;
        }
        const dotLiveDate = new Date(dotLiveValue);
        const dd = String(dotLiveDate.getDate()).padStart(2, '0');
        const mm = String(dotLiveDate.getMonth() + 1).padStart(2, '0');
        const yy = String(dotLiveDate.getFullYear()).slice(-2);
        const formattedDotLive = dd + '-' + mm + '-' + yy;
        if (phanLoai == "Áo") {
            uploadPhanLoai = "live/" + formattedDotLive + "/ao/";
        } else if (phanLoai == "Quần") {
            uploadPhanLoai = "live/" + formattedDotLive + "/quan/";
        } else if (phanLoai == "Set và Đầm") {
            uploadPhanLoai = "live/" + formattedDotLive + "/setvadam/";
        } else if (phanLoai == "PKGD") {
            uploadPhanLoai = "live/" + formattedDotLive + "/pkgd/";
        }
        let currentRow = null;
        for (const row of liveTable.rows) {
            if (row.cells[0].textContent === formattedDotLive) {
                currentRow = row;
                break;
            }
        }
        if (!currentRow) {
            currentRow = liveTable.insertRow(-1);
            const dateCell = currentRow.insertCell(0);
            dateCell.textContent = formattedDotLive;
            currentRow.insertCell(1);
            currentRow.insertCell(2);
            currentRow.insertCell(3);
            currentRow.insertCell(4);
        }
        const hinhAnhInput = document.getElementById('hinhAnhInput');
        const hinhAnhFiles = hinhAnhInput.files;
        // Tạo một thư mục con trong Firebase Storage (ví dụ: 'ao')
        var imagesRef = storageRef.child(uploadPhanLoai);
        for (const hinhAnh of hinhAnhFiles) {
            // Tạo tham chiếu đến tệp hình ảnh trong thư mục con
            var file = hinhAnh
            var imageRef = imagesRef.child(file.name);
            // Tải tệp hình ảnh lên Firebase Storage
            var uploadTask = imageRef.put(file);
            // Theo dõi tiến trình tải lên
            uploadTask.on('state_changed', function(snapshot) {
                // Cập nhật tiến trình tải lên nếu cần
            }, function(error) {
                // Xử lý lỗi tải lên (nếu có)
            }, function() {
                // Xử lý khi tải lên thành công
                location.reload();
            });
            //const imgElement = document.createElement('img');
            //imgElement.src = URL.createObjectURL(hinhAnh);
            //imgElement.alt = phanLoai;
            //imgElement.className = 'product-image';
            //const cellIndex = getCellIndexByPhanLoai(phanLoai);
            //if (cellIndex !== -1) {
            //    currentRow.cells[cellIndex].appendChild(imgElement);
            //}
        }
        productForm.reset();
        dataForm.style.display = 'none';
        toggleFormButton.textContent = 'Hiện biểu mẫu';
        // Cập nhật dropdown lọc đợt live
        updateDateFilterDropdown();
    });
    // dateFilterDropdown.addEventListener('change', function() {
    //     var selectedDate = dateFilterDropdown.value;
    //     liveDate.textContent = selectedDate;
    //     for (const row of liveTable.rows) {
    //         if (row.cells[0].textContent !== 'ĐỢT LIVE') {
    //             const rowDate = row.cells[0].textContent;
    //             if (selectedDate === 'all' || selectedDate === rowDate) {
    //                 row.style.display = 'table-row';
    //             } else {
    //                 row.style.display = 'none';
    //             }
    //         }
    //     }
    //     importImages(selectedDate);
    // });

    dateFilterDropdown.addEventListener('change', function() {
        var selectedDate = dateFilterDropdown.value;
        var liveDate = document.getElementById('liveDate');
    
        if (selectedDate === 'all') {
            liveDate.textContent = 'Tất cả'; // Thay đổi văn bản hiển thị thành "Tất cả"
            for (const row of liveTable.rows) {
                if (row.cells[0].textContent !== 'ĐỢT LIVE') {
                    row.style.display = 'table-row'; // Hiển thị tất cả hình ảnh
                }
            }
            // Lấy danh sách tất cả các đợt live
            var allDates = [];
            for (const row of liveTable.rows) {
                if (row.cells[0].textContent !== 'ĐỢT LIVE') {
                    allDates.push(row.cells[0].textContent);
                }
            }
            // Hiển thị hình ảnh cho tất cả các đợt live
            for (const date of allDates) {
                importImages(date);
            }
        } else {
            liveDate.textContent = selectedDate; // Hiển thị ngày đợt live được chọn
            for (const row of liveTable.rows) {
                if (row.cells[0].textContent !== 'ĐỢT LIVE') {
                    const rowDate = row.cells[0].textContent;
                    if (selectedDate === rowDate) {
                        row.style.display = 'table-row'; // Hiển thị hình ảnh của đợt live đã chọn
                    } else {
                        row.style.display = 'none'; // Ẩn các đợt live khác
                    }
                }
            }
            importImages(selectedDate); // Hiển thị hình ảnh của đợt live đã chọn
        }
    });
        
    

    function importImages(selectedDate) {
        const dotLiveInput = document.getElementById('dotLive');
        const dotLiveValue = dotLiveInput.value;
        if (!dotLiveValue) {
            alert('Vui lòng chọn một đợt Live.');
            return;
        }
        const dotLiveDate = new Date(dotLiveValue);
        const dd = String(dotLiveDate.getDate()).padStart(2, '0');
        const mm = String(dotLiveDate.getMonth() + 1).padStart(2, '0');
        const yy = String(dotLiveDate.getFullYear()).slice(-2);
        const formattedDotLive = dd + '-' + mm + '-' + yy;
        var storageRefAo = storageRef.child('live/' + selectedDate + '/ao/');
        clearImageContainer('ao'); // Xóa hình ảnh hiện có
        addImagesFromStorage(storageRefAo, 'ao');
        var storageRefQuan = storageRef.child('live/' + selectedDate + '/quan/');
        clearImageContainer('quan'); // Xóa hình ảnh hiện có
        addImagesFromStorage(storageRefQuan, 'quan');
        var storageRefSetVadam = storageRef.child('live/' + selectedDate + '/setvadam/');
        clearImageContainer('setvadam'); // Xóa hình ảnh hiện có
        addImagesFromStorage(storageRefSetVadam, 'setvadam');
        var storageRefPkgd = storageRef.child('live/' + selectedDate + '/pkgd/');
        clearImageContainer('pkgd'); // Xóa hình ảnh hiện có
        addImagesFromStorage(storageRefPkgd, 'pkgd');
    }

    function clearImageContainer(altText) {
        var imageContainer = document.querySelector('.' + altText + 'product-row');
        while (imageContainer.firstChild) {
            imageContainer.removeChild(imageContainer.firstChild);
        }
    }

    function addImagesFromStorage(storageRef, altText) {
        var imageContainer = document.querySelector('.' + altText + 'product-row');
        storageRef.listAll().then(function(result) {
            result.items.forEach(function(imageRef) {
                imageRef.getDownloadURL().then(function(url) {
                    var imgElement = document.createElement('img');
                    imgElement.src = url;
                    imgElement.className = 'product-image';
                    imageContainer.appendChild(imgElement);
                }).catch(function(error) {
                    console.error(error);
                });
            });
        }).catch(function(error) {
            console.error(error);
        });
    }
    // Hàm để xác định chỉ số của ô trong hàng dựa trên phân loại sản phẩm
    function getCellIndexByPhanLoai(phanLoai) {
        switch (phanLoai) {
            case 'Áo':
                return 1;
            case 'Quần':
                return 2;
            case 'Set và Đầm':
                return 3;
            case 'PKGD':
                return 4;
            default:
                return -1;
        }
    }
    // Hàm cập nhật dropdown lọc đợt live
    function updateDateFilterDropdown() {
        const dateFilterDropdown = document.getElementById('dateFilter');
        // Xóa tất cả các tùy chọn trừ "Tất cả"
        while (dateFilterDropdown.options.length > 1) {
            dateFilterDropdown.remove(1);
        }
        // Lấy danh sách tất cả các thư mục trong thư mục gốc
        storageRef.child('live/').listAll().then(function(result) {
            result.prefixes.forEach(function(folderRef) {
                // folderRef là một tham chiếu tới một thư mục
                const option = document.createElement('option');
                option.value = folderRef.name;
                option.textContent = folderRef.name;
                dateFilterDropdown.appendChild(option);
            });
        }).catch(function(error) {
            console.error("Lỗi khi lấy danh sách thư mục: " + error);
        });
    }
    // Khởi đầu: Cập nhật dropdown lọc đợt live ban đầu
    updateDateFilterDropdown();


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
});


