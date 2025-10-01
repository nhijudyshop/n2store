// =====================================================
// UTILITY FUNCTIONS WITH AGGRESSIVE COMPRESSION
// =====================================================

class Utils {
    // Format date to Vietnamese format
    static formatDate(date) {
        if (!date || !(date instanceof Date)) return "";

        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    }

    // Generate unique filename
    static generateUniqueFileName() {
        return (
            Date.now() + "_" + Math.random().toString(36).substr(2, 9) + ".png"
        );
    }

    // Debounce function
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Throttle function
    static throttle(func, limit) {
        let inThrottle;
        return function () {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => (inThrottle = false), limit);
            }
        };
    }

    // Check WebP support
    static supportsWebP() {
        const canvas = document.createElement("canvas");
        if (!canvas.getContext || !canvas.getContext("2d")) {
            return false;
        }
        return canvas.toDataURL("image/webp").indexOf("data:image/webp") === 0;
    }

    // AGGRESSIVE Image Compression
    static async compressImage(file, type = "storage") {
        const settings = CONFIG.performance.imageCompression[type];

        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = function (event) {
                const img = new Image();
                img.src = event.target.result;
                img.onload = function () {
                    const canvas = document.createElement("canvas");
                    const ctx = canvas.getContext("2d");

                    let width = img.width;
                    let height = img.height;

                    // Calculate new dimensions maintaining aspect ratio
                    if (width > height) {
                        if (width > settings.maxWidth) {
                            height = (height * settings.maxWidth) / width;
                            width = settings.maxWidth;
                        }
                    } else {
                        if (height > settings.maxHeight) {
                            width = (width * settings.maxHeight) / height;
                            height = settings.maxHeight;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;

                    // Use better image smoothing
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = "high";

                    ctx.drawImage(img, 0, 0, width, height);

                    // Choose format - WebP if supported, else JPEG
                    const useWebP =
                        CONFIG.performance.useWebP && Utils.supportsWebP();
                    const mimeType = useWebP ? "image/webp" : "image/jpeg";
                    const extension = useWebP ? ".webp" : ".jpg";

                    canvas.toBlob(
                        function (blob) {
                            const compressedFile = new File(
                                [blob],
                                file.name.replace(/\.[^/.]+$/, extension),
                                {
                                    type: mimeType,
                                    lastModified: Date.now(),
                                },
                            );

                            console.log(
                                `Compressed: ${Utils.formatFileSize(file.size)} → ${Utils.formatFileSize(compressedFile.size)} (${((compressedFile.size / file.size) * 100).toFixed(1)}%)`,
                            );

                            resolve(compressedFile);
                        },
                        mimeType,
                        settings.quality,
                    );
                };
            };
        });
    }

    // Validate image URL
    static isValidImageUrl(url) {
        return (
            url &&
            (url.startsWith("http") ||
                url.includes("firebasestorage.googleapis.com") ||
                url.startsWith("data:image"))
        );
    }

    // Check if device is mobile
    static isMobile() {
        return window.innerWidth <= 768;
    }

    // Get optimal image size for device
    static getOptimalImageSize() {
        const width = window.innerWidth;
        if (width < 480) return { width: 250, height: 250 };
        if (width < 768) return { width: 350, height: 350 };
        if (width < 1200) return { width: 450, height: 450 };
        return { width: 550, height: 550 };
    }

    // Escape HTML to prevent XSS
    static escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    // Create element with attributes
    static createElement(tag, attributes = {}, children = []) {
        const element = document.createElement(tag);

        Object.keys(attributes).forEach((key) => {
            if (key === "className") {
                element.className = attributes[key];
            } else if (key === "innerHTML") {
                element.innerHTML = attributes[key];
            } else if (key === "style" && typeof attributes[key] === "object") {
                Object.assign(element.style, attributes[key]);
            } else {
                element.setAttribute(key, attributes[key]);
            }
        });

        children.forEach((child) => {
            if (typeof child === "string") {
                element.appendChild(document.createTextNode(child));
            } else {
                element.appendChild(child);
            }
        });

        return element;
    }

    // Format file size
    static formatFileSize(bytes) {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    }
}

// =====================================================
// STANDALONE UTILITY FUNCTIONS (Non-class methods)
// =====================================================

// Sanitize input to prevent XSS
function sanitizeInput(input) {
    if (typeof input !== "string") return "";
    return input.replace(/[<>"'&]/g, "").trim();
}

// Format date
function formatDate(date) {
    if (!date || !(date instanceof Date)) return "";
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${day}/${month}/${year}`;
}

// Parse Vietnamese date format
function parseVietnameseDate(dateString) {
    if (!dateString) return null;

    try {
        const cleanDateString = dateString.replace(/,?\s*/g, " ").trim();
        const patterns = [
            /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2}):(\d{2})/,
            /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
        ];

        for (let pattern of patterns) {
            const match = cleanDateString.match(pattern);
            if (match) {
                const [, day, month, year, hour = 0, minute = 0] = match;
                return new Date(
                    parseInt(year),
                    parseInt(month) - 1,
                    parseInt(day),
                    parseInt(hour),
                    parseInt(minute),
                );
            }
        }

        const date = new Date(dateString);
        return isNaN(date.getTime()) ? null : date;
    } catch (error) {
        console.warn("Error parsing date:", dateString, error);
        return null;
    }
}

// Get formatted date time
function getFormattedDateTime() {
    const currentDate = new Date();
    const day = currentDate.getDate().toString().padStart(2, "0");
    const month = (currentDate.getMonth() + 1).toString().padStart(2, "0");
    const year = currentDate.getFullYear();
    const hour = currentDate.getHours().toString().padStart(2, "0");
    const minute = currentDate.getMinutes().toString().padStart(2, "0");
    return `${day}/${month}/${year}, ${hour}:${minute}`;
}

// Generate unique ID
function generateUniqueID() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return `inv_${timestamp}_${random}`;
}

// Debounce function (standalone version for backward compatibility)
function debounce(func, wait) {
    return Utils.debounce(func, wait);
}

// Log action to history
function logAction(
    action,
    description,
    oldData = null,
    newData = null,
    pageName = "Đặt Hàng",
) {
    const logEntry = {
        timestamp: new Date(),
        user: getUserName(),
        page: pageName,
        action: action,
        description: description,
        oldData: oldData,
        newData: newData,
        id: Date.now() + "_" + Math.random().toString(36).substr(2, 9),
    };

    historyCollectionRef
        .add(logEntry)
        .then(() => console.log("Log entry saved successfully"))
        .catch((error) => console.error("Error saving log entry: ", error));
}

// Export Utils globally
window.Utils = Utils;

console.log("Utility functions loaded");
