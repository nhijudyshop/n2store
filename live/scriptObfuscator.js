document.addEventListener('DOMContentLoaded', function() {
    // For Firebase JS SDK v7.20.0 and later, measurementId is optional
	function _0x1ab2(_0x36a23b,_0x52223b){const _0x2e058f=_0x2e05();return _0x1ab2=function(_0x1ab212,_0x4110aa){_0x1ab212=_0x1ab212-0x162;let _0x120a0e=_0x2e058f[_0x1ab212];return _0x120a0e;},_0x1ab2(_0x36a23b,_0x52223b);}function _0x2e05(){const _0x5a5dc7=['1235460FrnjKH','22977963vpMYJv','AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM','n2shop-69e37-ne0q1','G-TEJH3S2T1D','1345047lnZTNJ','366711YpKMry','13142736zaWdgA','598906493303','3756921uppNah','25XRvqCS','n2shop-69e37','14dthlHY','n2shop-69e37.firebaseapp.com','10009662EXBqRi'];_0x2e05=function(){return _0x5a5dc7;};return _0x2e05();}const _0x3a343d=_0x1ab2;(function(_0x46d1e0,_0x1a2442){const _0x1acdbc=_0x1ab2,_0x2a2d1c=_0x46d1e0();while(!![]){try{const _0x1aa040=parseInt(_0x1acdbc(0x168))/0x1+-parseInt(_0x1acdbc(0x16f))/0x2*(-parseInt(_0x1acdbc(0x169))/0x3)+parseInt(_0x1acdbc(0x163))/0x4*(-parseInt(_0x1acdbc(0x16d))/0x5)+parseInt(_0x1acdbc(0x162))/0x6+-parseInt(_0x1acdbc(0x16c))/0x7+parseInt(_0x1acdbc(0x16a))/0x8+-parseInt(_0x1acdbc(0x164))/0x9;if(_0x1aa040===_0x1a2442)break;else _0x2a2d1c['push'](_0x2a2d1c['shift']());}catch(_0x3223ad){_0x2a2d1c['push'](_0x2a2d1c['shift']());}}}(_0x2e05,0xd647a));const firebaseConfig={'apiKey':_0x3a343d(0x165),'authDomain':_0x3a343d(0x170),'projectId':_0x3a343d(0x16e),'storageBucket':_0x3a343d(0x166),'messagingSenderId':_0x3a343d(0x16b),'appId':'1:598906493303:web:46d6236a1fdc2eff33e972','measurementId':_0x3a343d(0x167)};
	
	// Create file metadata to update
	var newMetadata = {
	  cacheControl: 'public,max-age=31536000',
	}

    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);
    const storageRef = firebase.storage().ref();
    const toggleFormButton = document.getElementById('toggleFormButton');
    const dataForm = document.getElementById('dataForm');
    const productForm = document.getElementById('productForm');
    const liveTable = document.querySelector('.live table');
    const dateFilterDropdown = document.getElementById('dateFilter');

    // Đặt giá trị max cho trường input ngày là ngày hôm nay
    const dotLiveInput = document.getElementById('dotLive');
    const liveDate = document.getElementById('liveDate');
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
		document.getElementById("addButton").disabled = true;
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
		
		createPopup('Đang tải ảnh lên...', 10000);
		
        const hinhAnhInput = document.getElementById('hinhAnhInput');
        const hinhAnhFiles = hinhAnhInput.files;
        var uploadedCount = 0;

        // Tạo một thư mục con trong Firebase Storage (ví dụ: 'ao')
        var imagesRef = storageRef.child(uploadPhanLoai);
        for (const hinhAnh of hinhAnhFiles) {
            // Tạo tham chiếu đến tệp hình ảnh trong thư mục con
            var file = hinhAnh
            var imageRef = imagesRef.child(file.name);
            // Tải tệp hình ảnh lên Firebase Storage
            var uploadTask = imageRef.put(file, newMetadata);
            // Theo dõi tiến trình tải lên
            uploadTask.on('state_changed', function(snapshot) {
                // Cập nhật tiến trình tải lên nếu cần
            }, function(error) {
                // Xử lý lỗi tải lên (nếu có)
				createPopup('Lỗi tải ảnh lên!', 30000);
            }, function() {
                // Xử lý khi tải lên thành công
				uploadedCount++;
                if (uploadedCount === hinhAnhFiles.length) {
                    // Nếu đã tải lên tất cả các tệp, hãy reload trang
                    popup.classList.remove('popup-show');
                    document.getElementById("addButton").disabled = false;
                    location.reload();
                }
            });
        }
    });

    // Sửa mã JavaScript để xử lý sự kiện thay đổi dropdown
    dateFilterDropdown.addEventListener('change', function() {
        var selectedDate = dateFilterDropdown.value;
        var liveDate = document.getElementById('liveDate');

        //console.log('Selected date:', selectedDate); // Thêm lệnh log này
        //console.log('Storage ref path:', storageRef.child('live/' + selectedDate + '/ao/')); // Thêm lệnh log này

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
        }
		
		importImages();
    });

    // Sửa mã JavaScript để hiển thị hình ảnh từ tất cả thư mục con
    function importImages() {
        // Xóa hình ảnh hiện có trước khi hiển thị hình ảnh mới
        clearImageContainer('ao');
        clearImageContainer('quan');
        clearImageContainer('setvadam');
        clearImageContainer('pkgd');

        // Tạo một thư mục đệm để lưu tất cả thư mục con trong "live/"
        var allDates = [];
		var selectedDate = dateFilterDropdown.value;
		// Lấy danh sách tất cả các thư mục con trong thư mục "live/"
		storageRef.child('live/').listAll().then(function(result) {
			result.prefixes.forEach(function(folderRef) {
				var folderPath = folderRef.fullPath; // Đường dẫn đầy đủ của thư mục con
				var subDate = folderPath.split('/'); // Tách đường dẫn để lấy ngày
				var folderDate = subDate[subDate.length - 1];
				allDates.push(folderDate);
			});
			
			// Compare the lengths
			if (allDates.length === result.prefixes.length) {
				if (selectedDate === 'all') {
                // Hiển thị hình ảnh cho tất cả các đợt live
                for (const date of allDates) {
                    addImagesFromStorage(storageRef.child('live/' + date + '/ao/'), 'ao');
                    addImagesFromStorage(storageRef.child('live/' + date + '/quan/'), 'quan');
                    addImagesFromStorage(storageRef.child('live/' + date + '/setvadam/'), 'setvadam');
                    addImagesFromStorage(storageRef.child('live/' + date + '/pkgd/'), 'pkgd');
                }
            } else {
                // Hiển thị hình ảnh cho đợt live đã chọn
                addImagesFromStorage(storageRef.child('live/' + selectedDate + '/ao/'), 'ao');
                addImagesFromStorage(storageRef.child('live/' + selectedDate + '/quan/'), 'quan');
                addImagesFromStorage(storageRef.child('live/' + selectedDate + '/setvadam/'), 'setvadam');
                addImagesFromStorage(storageRef.child('live/' + selectedDate + '/pkgd/'), 'pkgd');
            }
			} else {
				console.log("Lengths do not match.");
			} 
        });
    }

    function clearImageContainer(altText) {
        var imageContainer = document.querySelector('.' + altText + 'product-row');
        while (imageContainer.firstChild) {
            imageContainer.removeChild(imageContainer.firstChild);
        }
    }

    async function addImagesFromStorage(storageRef, altText) {
		var imageContainer = document.querySelector('.' + altText + 'product-row');
		try {
			const result = await storageRef.listAll();
			const imagePromises = result.items.map(async (imageRef) => {
				const url = await imageRef.getDownloadURL();
				return url;
			});
			const imageUrls = await Promise.all(imagePromises);

			imageUrls.reverse().forEach((url) => {
				// Tạo một phần tử hình ảnh
				var imgElement = document.createElement('img');
				imgElement.src = url;
				imgElement.className = 'product-image';
				imageContainer.appendChild(imgElement);

				// Thêm sự kiện click cho nút "Copy" để copy url ảnh
				imgElement.addEventListener('click', function() {
					copyToClipboard(url);
				});
			});
		} catch (error) {
			console.error(error);
		}
	}

    function createPopup(message, time = 1500) { // ------------------Code mới---------------------- //
        var popup = document.getElementById('popup');
        var popupMessage = document.getElementById('popup-message');
		popup.classList.remove('popup-show');
        popupMessage.textContent = message;
        popup.classList.add('popup-show');

        setTimeout(function() {
            popup.classList.remove('popup-show');
        }, time); // Tắt thông báo sau 1.5 giây
    }

    function copyToClipboard(text) { // ------------------Code mới---------------------- //
        // Tạo một phần tử textarea ẩn
        var textArea = document.createElement('textarea');
        textArea.value = text;

        // Thêm textarea vào trang web
        document.body.appendChild(textArea);

        // Chọn và sao chép nội dung vào clipboard
        textArea.select();
        document.execCommand('copy');

        // Loại bỏ textarea
        document.body.removeChild(textArea);

        createPopup('Đã sao chép');
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
	
	importImages();
});

