// Enhanced Goods Receipt Management System - Camera Functions
// Camera handling for main form and edit modal

// =====================================================
// CAMERA INITIALIZATION
// =====================================================

function initializeCameraSystem() {
    if (startCameraButton) {
        startCameraButton.addEventListener("click", startCamera);
    }

    if (takePictureButton) {
        takePictureButton.addEventListener("click", takePicture);
    }

    if (retakePictureButton) {
        retakePictureButton.addEventListener("click", retakePicture);
    }

    // Edit camera events
    if (editStartCameraButton) {
        editStartCameraButton.addEventListener("click", startEditCamera);
    }

    if (editTakePictureButton) {
        editTakePictureButton.addEventListener("click", takeEditPicture);
    }

    if (editRetakePictureButton) {
        editRetakePictureButton.addEventListener("click", retakeEditPicture);
    }

    if (editKeepCurrentImageButton) {
        editKeepCurrentImageButton.addEventListener("click", keepCurrentImage);
    }
}

// =====================================================
// MAIN CAMERA FUNCTIONS
// =====================================================

// Start camera
async function startCamera() {
    try {
        showLoading("Đang khởi động camera...");

        const constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "environment", // Use back camera if available
            },
        };

        cameraStream = await navigator.mediaDevices.getUserMedia(constraints);

        if (cameraVideo) {
            cameraVideo.srcObject = cameraStream;
            cameraVideo.play();

            cameraVideo.addEventListener("loadedmetadata", () => {
                // Adjust canvas size to match video
                if (cameraCanvas) {
                    cameraCanvas.width = cameraVideo.videoWidth;
                    cameraCanvas.height = cameraVideo.videoHeight;
                }
            });
        }

        // Update UI
        if (startCameraButton) startCameraButton.style.display = "none";
        if (takePictureButton) takePictureButton.style.display = "inline-flex";
        if (cameraPreview) cameraPreview.style.display = "block";

        hideFloatingAlert();
        showSuccess("Camera đã sẵn sàng!");
    } catch (error) {
        console.error("Error accessing camera:", error);
        hideFloatingAlert();

        let errorMessage = "Không thể truy cập camera. ";
        if (error.name === "NotAllowedError") {
            errorMessage += "Vui lòng cho phép truy cập camera.";
        } else if (error.name === "NotFoundError") {
            errorMessage += "Không tìm thấy camera.";
        } else {
            errorMessage += "Lỗi: " + error.message;
        }

        showError(errorMessage);
    }
}

// Take picture
function takePicture() {
    if (!cameraVideo || !cameraCanvas) {
        showError("Camera chưa sẵn sàng!");
        return;
    }

    try {
        const canvas = cameraCanvas;
        const context = canvas.getContext("2d");

        // Draw current video frame to canvas
        context.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);

        // Convert to blob
        canvas.toBlob(
            (blob) => {
                if (blob) {
                    capturedImageBlob = blob;
                    capturedImageUrl = URL.createObjectURL(blob);

                    // Display captured image
                    displayCapturedImage();

                    // Stop camera
                    stopCamera();

                    showSuccess("Đã chụp ảnh thành công!");
                } else {
                    showError("Không thể chụp ảnh!");
                }
            },
            "image/jpeg",
            0.8,
        );
    } catch (error) {
        console.error("Error taking picture:", error);
        showError("Lỗi khi chụp ảnh: " + error.message);
    }
}

// Display captured image with packaging watermark
function displayCapturedImage() {
    if (imageDisplayArea && capturedImageUrl) {
        imageDisplayArea.innerHTML = "";

        const imgContainer = document.createElement("div");
        imgContainer.style.position = "relative";
        imgContainer.style.display = "inline-block";

        const img = document.createElement("img");
        img.src = capturedImageUrl;
        img.alt = "Ảnh đã chụp";
        img.className = "captured-image";

        // Add packaging watermark
        const packaging = getSelectedPackaging();
        if (packaging) {
            const watermark = document.createElement("div");
            watermark.className = `packaging-watermark ${packaging}`;
            watermark.textContent = getPackagingText(packaging);
            imgContainer.appendChild(watermark);
        }

        imgContainer.appendChild(img);
        imageDisplayArea.appendChild(imgContainer);
        imageDisplayArea.classList.add("has-content");

        // Update UI
        if (takePictureButton) takePictureButton.style.display = "none";
        if (retakePictureButton)
            retakePictureButton.style.display = "inline-flex";
    }
}

// Retake picture
function retakePicture() {
    // Clear captured image
    capturedImageUrl = null;
    capturedImageBlob = null;

    if (imageDisplayArea) {
        imageDisplayArea.innerHTML =
            "<p>📷 Ảnh sẽ hiển thị ở đây sau khi chụp</p>";
        imageDisplayArea.classList.remove("has-content");
    }

    // Show start camera button again
    if (startCameraButton) startCameraButton.style.display = "inline-flex";
    if (takePictureButton) takePictureButton.style.display = "none";
    if (retakePictureButton) retakePictureButton.style.display = "none";
    if (cameraPreview) cameraPreview.style.display = "none";
}

// Stop camera
function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
        cameraStream = null;
    }

    if (cameraVideo) {
        cameraVideo.srcObject = null;
    }

    if (cameraPreview) {
        cameraPreview.style.display = "none";
    }
}

// =====================================================
// EDIT CAMERA FUNCTIONS
// =====================================================

// Start camera for editing
async function startEditCamera() {
    try {
        showLoading("Đang khởi động camera...");

        const constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "environment",
            },
        };

        editCameraStream =
            await navigator.mediaDevices.getUserMedia(constraints);

        if (editCameraVideo) {
            editCameraVideo.srcObject = editCameraStream;
            editCameraVideo.play();

            editCameraVideo.addEventListener("loadedmetadata", () => {
                if (editCameraCanvas) {
                    editCameraCanvas.width = editCameraVideo.videoWidth;
                    editCameraCanvas.height = editCameraVideo.videoHeight;
                }
            });
        }

        // Update UI
        if (editStartCameraButton) editStartCameraButton.style.display = "none";
        if (editTakePictureButton)
            editTakePictureButton.style.display = "inline-flex";
        if (editRetakePictureButton)
            editRetakePictureButton.style.display = "inline-flex";
        if (editKeepCurrentImageButton)
            editKeepCurrentImageButton.style.display = "inline-flex";
        if (editCameraPreview) editCameraPreview.style.display = "block";
        if (editImageDisplayArea) editImageDisplayArea.style.display = "flex";

        editKeepCurrentImage = false; // Reset when starting new camera

        hideFloatingAlert();
        showSuccess("Camera edit đã sẵn sàng!");
    } catch (error) {
        console.error("Error accessing edit camera:", error);
        hideFloatingAlert();
        showError("Không thể truy cập camera: " + error.message);
    }
}

// Take picture for editing
function takeEditPicture() {
    if (!editCameraVideo || !editCameraCanvas) {
        showError("Camera chưa sẵn sàng!");
        return;
    }

    try {
        const canvas = editCameraCanvas;
        const context = canvas.getContext("2d");

        context.drawImage(editCameraVideo, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
            (blob) => {
                if (blob) {
                    editCapturedImageBlob = blob;
                    editCapturedImageUrl = URL.createObjectURL(blob);
                    editKeepCurrentImage = false;

                    displayEditCapturedImage();
                    stopEditCamera();

                    showSuccess("Đã chụp ảnh mới thành công!");
                } else {
                    showError("Không thể chụp ảnh!");
                }
            },
            "image/jpeg",
            0.8,
        );
    } catch (error) {
        console.error("Error taking edit picture:", error);
        showError("Lỗi khi chụp ảnh: " + error.message);
    }
}

// Display captured image for editing with packaging watermark
function displayEditCapturedImage() {
    if (editImageDisplayArea && editCapturedImageUrl) {
        editImageDisplayArea.innerHTML = "";

        const imgContainer = document.createElement("div");
        imgContainer.style.position = "relative";
        imgContainer.style.display = "inline-block";

        const img = document.createElement("img");
        img.src = editCapturedImageUrl;
        img.alt = "Ảnh mới đã chụp";
        img.className = "captured-image";

        // Add packaging watermark
        const packaging = getSelectedEditPackaging();
        if (packaging) {
            const watermark = document.createElement("div");
            watermark.className = `packaging-watermark ${packaging}`;
            watermark.textContent = getPackagingText(packaging);
            imgContainer.appendChild(watermark);
        }

        imgContainer.appendChild(img);
        editImageDisplayArea.appendChild(imgContainer);
        editImageDisplayArea.classList.add("has-content");
        editImageDisplayArea.style.display = "flex";
    }
}

// Retake picture for editing
function retakeEditPicture() {
    editCapturedImageUrl = null;
    editCapturedImageBlob = null;

    if (editImageDisplayArea) {
        editImageDisplayArea.innerHTML =
            "<p>📷 Ảnh mới sẽ hiển thị ở đây sau khi chụp</p>";
        editImageDisplayArea.classList.remove("has-content");
    }

    // Restart camera
    startEditCamera();
}

// Keep current image
function keepCurrentImage() {
    editKeepCurrentImage = true;
    editCapturedImageUrl = null;
    editCapturedImageBlob = null;

    console.log(
        "Keeping current image. editCurrentImageUrl:",
        editCurrentImageUrl,
    );

    if (editImageDisplayArea) {
        editImageDisplayArea.style.display = "none";
        editImageDisplayArea.innerHTML =
            "<p>📷 Ảnh mới sẽ hiển thị ở đây sau khi chụp</p>";
        editImageDisplayArea.classList.remove("has-content");
    }

    stopEditCamera();
    resetEditCameraUI();

    showSuccess("Sẽ giữ ảnh hiện tại!");
}

// Stop edit camera
function stopEditCamera() {
    if (editCameraStream) {
        editCameraStream.getTracks().forEach((track) => track.stop());
        editCameraStream = null;
    }

    if (editCameraVideo) {
        editCameraVideo.srcObject = null;
    }

    if (editCameraPreview) {
        editCameraPreview.style.display = "none";
    }
}

// Reset edit camera UI
function resetEditCameraUI() {
    if (editStartCameraButton)
        editStartCameraButton.style.display = "inline-flex";
    if (editTakePictureButton) editTakePictureButton.style.display = "none";
    if (editRetakePictureButton) editRetakePictureButton.style.display = "none";
    if (editKeepCurrentImageButton)
        editKeepCurrentImageButton.style.display = "none";
    if (editCameraPreview) editCameraPreview.style.display = "none";
    if (editImageDisplayArea) {
        editImageDisplayArea.style.display = "none";
        editImageDisplayArea.innerHTML =
            "<p>📷 Ảnh mới sẽ hiển thị ở đây sau khi chụp</p>";
        editImageDisplayArea.classList.remove("has-content");
    }
}

// =====================================================
// IMAGE UPLOAD FUNCTIONS
// =====================================================

// Upload captured image to Firebase Storage
async function uploadCapturedImage() {
    if (!capturedImageBlob) {
        return null; // No image captured
    }

    try {
        const imageName = generateUniqueFileName();
        const imageRef = storageRef.child(`nhanhang/photos/` + imageName);

        return new Promise((resolve, reject) => {
            const uploadTask = imageRef.put(capturedImageBlob, newMetadata);

            uploadTask.on(
                "state_changed",
                function (snapshot) {
                    // Progress can be shown here if needed
                },
                function (error) {
                    console.error("Error uploading image:", error);
                    reject(error);
                },
                function () {
                    uploadTask.snapshot.ref
                        .getDownloadURL()
                        .then(function (downloadURL) {
                            console.log("Image uploaded successfully");
                            resolve(downloadURL);
                        })
                        .catch(reject);
                },
            );
        });
    } catch (error) {
        console.error("Error in image upload process:", error);
        throw error;
    }
}

// Upload captured image for editing
async function uploadEditCapturedImage() {
    if (!editCapturedImageBlob) {
        return null;
    }

    try {
        const imageName = generateUniqueFileName();
        const imageRef = storageRef.child(`nhanhang/photos/` + imageName);

        return new Promise((resolve, reject) => {
            const uploadTask = imageRef.put(editCapturedImageBlob, newMetadata);

            uploadTask.on(
                "state_changed",
                function (snapshot) {},
                function (error) {
                    console.error("Error uploading edit image:", error);
                    reject(error);
                },
                function () {
                    uploadTask.snapshot.ref
                        .getDownloadURL()
                        .then(function (downloadURL) {
                            console.log("Edit image uploaded successfully");
                            resolve(downloadURL);
                        })
                        .catch(reject);
                },
            );
        });
    } catch (error) {
        console.error("Error in edit image upload process:", error);
        throw error;
    }
}
