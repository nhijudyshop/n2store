// js/forms.js - Form Management System

function initializeUpdatedForm() {
    if (ngayLive) {
        ngayLive.valueAsDate = new Date();
    }

    // Toggle form button
    if (toggleFormButton) {
        toggleFormButton.addEventListener("click", () => {
            if (hasPermission(3)) {
                if (
                    dataForm.style.display === "none" ||
                    dataForm.style.display === ""
                ) {
                    dataForm.style.display = "block";
                    toggleFormButton.textContent = "Ẩn biểu mẫu";
                } else {
                    dataForm.style.display = "none";
                    toggleFormButton.textContent = "Hiện biểu mẫu";
                }
            } else {
                showError("Không có quyền truy cập form");
            }
        });
    }

    // Form submit handler
    if (livestreamForm) {
        livestreamForm.addEventListener("submit", handleUpdatedFormSubmit);
    }

    // Amount input formatting (only numbers)
    const tienQCInput = document.getElementById("tienQC");
    if (tienQCInput) {
        tienQCInput.addEventListener("input", function () {
            this.value = this.value.replace(/[^\d,]/g, "");
        });

        tienQCInput.addEventListener("blur", function () {
            let value = this.value.replace(/[,\.]/g, "");
            value = parseFloat(value);

            if (!isNaN(value) && value > 0) {
                this.value = numberWithCommas(value);
            } else {
                this.value = "";
                showError("Tiền QC phải là số hợp lệ");
            }
        });
    }

    // Số món live input - only numbers
    const soMonLiveInput = document.getElementById("soMonLive");
    if (soMonLiveInput) {
        soMonLiveInput.addEventListener("input", function () {
            this.value = this.value.replace(/[^\d,]/g, "");
        });

        soMonLiveInput.addEventListener("blur", function () {
            let value = this.value.replace(/[,\.]/g, "");
            value = parseFloat(value);

            if (!isNaN(value) && value >= 0) {
                this.value = value;
            } else {
                this.value = "";
                showError("Số món live phải là số không âm");
            }
        });
    }

    // Số món inbox - allow 0 value
    const soMonInboxInput = document.getElementById("soMonInbox");
    if (soMonInboxInput) {
        soMonInboxInput.addEventListener("input", function () {
            this.value = this.value.replace(/[^\d,]/g, "");
        });

        soMonInboxInput.addEventListener("blur", function () {
            let value = this.value.replace(/[,\.]/g, "");
            value = parseFloat(value);

            if (!isNaN(value) && value >= 0) {
                this.value = value;
            } else {
                this.value = "";
                showError("Số món inbox phải là số không âm (có thể là 0)");
            }
        });
    }

    // Clear form button
    const clearDataButton = document.getElementById("clearDataButton");
    if (clearDataButton) {
        clearDataButton.addEventListener("click", function () {
            const currentDate = new Date(ngayLive.value);
            ngayLive.valueAsDate = currentDate;
            livestreamForm.reset();
        });
    }
}

function handleUpdatedFormSubmit(e) {
    e.preventDefault();

    if (!hasPermission(3)) {
        showError("Không có quyền thêm báo cáo");
        return;
    }

    const currentDate = new Date(ngayLive.value);

    // Get and validate tien QC (must be number)
    let tienQC = document.getElementById("tienQC").value.replace(/[,\.]/g, "");
    tienQC = parseFloat(tienQC);
    if (isNaN(tienQC) || tienQC <= 0) {
        showError("Vui lòng nhập số tiền QC hợp lệ.");
        return;
    }

    // Get and validate time
    const hh1 = document.getElementById("hh1").value.padStart(2, "0");
    const mm1 = document.getElementById("mm1").value.padStart(2, "0");
    const hh2 = document.getElementById("hh2").value.padStart(2, "0");
    const mm2 = document.getElementById("mm2").value.padStart(2, "0");
    const startTime = `${hh1}:${mm1}`;
    const endTime = `${hh2}:${mm2}`;

    if (!startTime || !endTime) {
        showError("Vui lòng nhập đầy đủ thời gian bắt đầu và kết thúc.");
        return;
    }

    const thoiGian = formatTimeRange(startTime, endTime);
    if (!thoiGian) {
        showError("Thời gian kết thúc phải lớn hơn thời gian bắt đầu.");
        return;
    }

    // Get and validate số món live (must be number)
    const soMonLiveValue = document.getElementById("soMonLive").value.trim();
    if (
        !soMonLiveValue ||
        isNaN(soMonLiveValue) ||
        parseInt(soMonLiveValue) < 0
    ) {
        showError("Số món trên live phải là số không âm.");
        return;
    }
    const soMonLive = parseInt(soMonLiveValue) + " món";

    // Get and validate số món inbox - save empty string when 0
    const soMonInboxValue = document.getElementById("soMonInbox").value.trim();
    if (
        soMonInboxValue === "" ||
        isNaN(soMonInboxValue) ||
        parseInt(soMonInboxValue) < 0
    ) {
        showError("Số món inbox phải là số không âm (có thể là 0).");
        return;
    }

    // Store different values based on input
    let soMonInbox;
    const soMonInboxNumber = parseInt(soMonInboxValue);
    if (soMonInboxNumber === 0) {
        soMonInbox = ""; // Save empty string when 0
    } else {
        soMonInbox = soMonInboxNumber + " món"; // Save with " món" suffix when > 0
    }

    // Generate timestamp and unique ID
    const tempTimeStamp = new Date();
    const timestamp =
        currentDate.getTime() +
        (tempTimeStamp.getMinutes() * 60 + tempTimeStamp.getSeconds()) * 1000;
    const uniqueId = generateUniqueId();

    const auth = getAuthState();
    const userName = auth
        ? auth.userType
            ? auth.userType.split("-")[0]
            : "Unknown"
        : "Unknown";

    const dataToUpload = {
        id: uniqueId,
        dateCell: timestamp.toString(),
        tienQC: numberWithCommas(tienQC),
        thoiGian: thoiGian,
        soMonLive: soMonLive,
        soMonInbox: soMonInbox,
        user: userName,
        createdBy: userName,
        createdAt: new Date().toISOString(),
        editHistory: [],
    };

    // Create formatted date with period for display
    const formattedDate = formatDateWithPeriod(currentDate, startTime);

    // Add row to table immediately
    const newRow = createTableRow(dataToUpload, formattedDate);
    tableBody.insertRow(0).replaceWith(newRow);

    // Reset form
    livestreamForm.reset();
    ngayLive.valueAsDate = currentDate;

    showLoading("Đang lưu báo cáo...");

    // Upload to Firebase
    collectionRef
        .doc("reports")
        .get()
        .then((doc) => {
            const updateData = doc.exists
                ? {
                      ["data"]:
                          firebase.firestore.FieldValue.arrayUnion(
                              dataToUpload,
                          ),
                  }
                : { ["data"]: [dataToUpload] };

            const operation = doc.exists
                ? collectionRef.doc("reports").update(updateData)
                : collectionRef.doc("reports").set(updateData);

            return operation;
        })
        .then(() => {
            logAction(
                "add",
                `Thêm báo cáo livestream: ${tienQC}`,
                null,
                dataToUpload,
            );
            invalidateCache();
            showSuccess("Đã thêm báo cáo thành công!");
            console.log("Document uploaded successfully");
            location.reload();
        })
        .catch((error) => {
            console.error("Error uploading document: ", error);
            newRow.remove();
            showError("Lỗi khi tải document lên.");
        });
}

function handleEditButton(e) {
    if (!editModal) return;

    editModal.style.display = "block";

    const editDate = document.getElementById("editDate");
    const editTienQC = document.getElementById("editTienQC");
    const editSoMonLive = document.getElementById("editSoMonLive");
    const editSoMonInbox = document.getElementById("editSoMonInbox");

    const hh1 = document.getElementById("editHh1");
    const mm1 = document.getElementById("editMm1");
    const hh2 = document.getElementById("editHh2");
    const mm2 = document.getElementById("editMm2");

    const row = e.target.parentNode.parentNode;
    const date = row.cells[0].innerText;
    const tienQC = row.cells[1].innerText;
    const thoiGian = row.cells[2].innerText;
    const soMonLive = row.cells[3].innerText;
    const soMonInbox = row.cells[4].innerText;

    const auth = getAuthState();
    const userLevel = parseInt(auth.checkLogin);

    // Set values for all fields first
    if (editDate) {
        let cleanDate = date;
        const periodPattern = /\s*\((Sáng|Chiều|Tối)\)$/;
        if (periodPattern.test(date)) {
            cleanDate = date.replace(periodPattern, "").trim();
        }

        const parts = cleanDate.split("-");
        if (parts.length === 3) {
            const day = parts[0];
            const month = parts[1];
            let year = parseInt(parts[2]);
            if (year < 100) {
                year = year < 50 ? 2000 + year : 1900 + year;
            }
            editDate.value = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
        }
    }

    if (editTienQC) {
        editTienQC.value = tienQC;
    }

    // Parse time from format "Từ 20h00m đến 22h00m - 2h0m"
    if (thoiGian && thoiGian.trim()) {
        const timePattern =
            /Từ\s+(\d{1,2})h(\d{1,2})m\s+đến\s+(\d{1,2})h(\d{1,2})m/;
        const match = thoiGian.match(timePattern);

        if (match) {
            const [, startHour, startMin, endHour, endMin] = match;
            if (hh1) hh1.value = startHour;
            if (mm1) mm1.value = startMin;
            if (hh2) hh2.value = endHour;
            if (mm2) mm2.value = endMin;
            if (hh1.value < 12 && !hasPermission(0)) {
                editModal.style.display = "none";
                return;
            }
        } else {
            if (hh1) hh1.value = "";
            if (mm1) mm1.value = "";
            if (hh2) hh2.value = "";
            if (mm2) mm2.value = "";
        }
    } else {
        if (hh1) hh1.value = "";
        if (mm1) mm1.value = "";
        if (hh2) hh2.value = "";
        if (mm2) mm2.value = "";
    }

    if (editSoMonLive) {
        let cleanSoMonLive = soMonLive.replace(" món", "");
        editSoMonLive.value = cleanSoMonLive;
    }

    // Handle soMonInbox - if empty, set to 0 for editing
    if (editSoMonInbox) {
        if (soMonInbox.trim() === "") {
            editSoMonInbox.value = "0";
        } else {
            let cleanSoMonInbox = soMonInbox.replace(" món", "");
            editSoMonInbox.value = cleanSoMonInbox;
        }
    }

    // Apply permissions based on user level
    if (userLevel <= 1) {
        // Level 0 and 1: Full edit permission
        if (editDate) editDate.disabled = false;
        if (editTienQC) editTienQC.disabled = false;
        if (hh1) hh1.disabled = false;
        if (mm1) mm1.disabled = false;
        if (hh2) hh2.disabled = false;
        if (mm2) mm2.disabled = false;
        if (editSoMonLive) editSoMonLive.disabled = false;
        if (editSoMonInbox) editSoMonInbox.disabled = false;
    } else if (userLevel === 2) {
        // Level 2: Only can edit soMonInbox
        if (editDate) {
            editDate.disabled = true;
            editDate.style.backgroundColor = "#f8f9fa";
        }
        if (editTienQC) {
            editTienQC.readOnly = true;
            editTienQC.style.backgroundColor = "#f8f9fa";
        }
        if (hh1) {
            hh1.readOnly = true;
            hh1.style.backgroundColor = "#f8f9fa";
        }
        if (mm1) {
            mm1.readOnly = true;
            mm1.style.backgroundColor = "#f8f9fa";
        }
        if (hh2) {
            hh2.readOnly = true;
            hh2.style.backgroundColor = "#f8f9fa";
        }
        if (mm2) {
            mm2.readOnly = true;
            mm2.style.backgroundColor = "#f8f9fa";
        }
        if (editSoMonLive) {
            editSoMonLive.readOnly = true;
            editSoMonLive.style.backgroundColor = "#f8f9fa";
        }
        if (editSoMonInbox) {
            editSoMonInbox.disabled = false;
            editSoMonInbox.readOnly = false;
            editSoMonInbox.style.backgroundColor = "white";
        }
    } else {
        // Level 3 and above: No edit permissions
        if (editDate) editDate.disabled = true;
        if (editTienQC) editTienQC.disabled = true;
        if (hh1) hh1.disabled = true;
        if (mm1) mm1.disabled = true;
        if (hh2) hh2.disabled = true;
        if (mm2) mm2.disabled = true;
        if (editSoMonLive) editSoMonLive.disabled = true;
        if (editSoMonInbox) editSoMonInbox.disabled = true;
    }

    editingRow = row;
}

// Export functions
window.initializeUpdatedForm = initializeUpdatedForm;
window.handleUpdatedFormSubmit = handleUpdatedFormSubmit;
window.handleEditButton = handleEditButton;
