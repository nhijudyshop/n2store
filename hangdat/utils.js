// =====================================================
// UTILITY FUNCTIONS - FIXED DATE PARSING FOR GMT+7
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

    // Image Compression
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
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = "high";
                    ctx.drawImage(img, 0, 0, width, height);

                    const useWebP =
                        CONFIG.performance.useWebP && Utils.supportsWebP();
                    const mimeType = useWebP ? "image/webp" : "image/jpeg";
                    const extension = useWebP ? ".webp" : ".jpg";

                    canvas.toBlob(
                        function (blob) {
                            const compressedFile = new File(
                                [blob],
                                file.name.replace(/\.[^/.]+$/, extension),
                                { type: mimeType, lastModified: Date.now() },
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

    static isValidImageUrl(url) {
        return (
            url &&
            (url.startsWith("http") ||
                url.includes("firebasestorage.googleapis.com") ||
                url.startsWith("data:image"))
        );
    }

    static isMobile() {
        return window.innerWidth <= 768;
    }

    static getOptimalImageSize() {
        const width = window.innerWidth;
        if (width < 480) return { width: 250, height: 250 };
        if (width < 768) return { width: 350, height: 350 };
        if (width < 1200) return { width: 450, height: 450 };
        return { width: 550, height: 550 };
    }

    static escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

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

    static formatFileSize(bytes) {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    }
}

// =====================================================
// STANDALONE UTILITY FUNCTIONS - FIXED GMT+7
// =====================================================

// Sanitize input
function sanitizeInput(input) {
    if (typeof input !== "string") return "";
    return input.replace(/[<>"'&]/g, "").trim();
}

// Format date for display
function formatDate(date) {
    if (!date || !(date instanceof Date)) return "";
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${day}/${month}/${year}`;
}

// FIXED: Parse Vietnamese date - Now handles comma in datetime
function parseVietnameseDate(dateString) {
    if (!dateString) return null;

    try {
        // Clean up the string - remove extra spaces but keep structure
        const cleanDateString = dateString.trim();

        // Pattern 1: DD/MM/YYYY, HH:mm (with comma!)
        const pattern1 =
            /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4}),?\s*(\d{1,2}):(\d{2})/;
        const match1 = cleanDateString.match(pattern1);
        if (match1) {
            const [, day, month, year, hour, minute] = match1;
            // Create date in LOCAL timezone (GMT+7)
            return new Date(
                parseInt(year),
                parseInt(month) - 1,
                parseInt(day),
                parseInt(hour),
                parseInt(minute),
                0,
                0,
            );
        }

        // Pattern 2: DD/MM/YYYY (no time)
        const pattern2 = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
        const match2 = cleanDateString.match(pattern2);
        if (match2) {
            const [, day, month, year] = match2;
            // Create date at midnight in LOCAL timezone (GMT+7)
            return new Date(
                parseInt(year),
                parseInt(month) - 1,
                parseInt(day),
                0,
                0,
                0,
                0,
            );
        }

        // Pattern 3: YYYY-MM-DD (ISO format from input[type="date"])
        const pattern3 = /^(\d{4})-(\d{2})-(\d{2})$/;
        const match3 = cleanDateString.match(pattern3);
        if (match3) {
            const [, year, month, day] = match3;
            // Create date at midnight in LOCAL timezone (GMT+7)
            return new Date(
                parseInt(year),
                parseInt(month) - 1,
                parseInt(day),
                0,
                0,
                0,
                0,
            );
        }

        // Pattern 4: YYYY-MM-DD HH:mm:ss (ISO datetime)
        const pattern4 = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/;
        const match4 = cleanDateString.match(pattern4);
        if (match4) {
            const [, year, month, day, hour, minute, second] = match4;
            return new Date(
                parseInt(year),
                parseInt(month) - 1,
                parseInt(day),
                parseInt(hour),
                parseInt(minute),
                parseInt(second),
                0,
            );
        }

        // Fallback: try Date constructor
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) {
            return date;
        }

        console.warn("Could not parse date:", dateString);
        return null;
    } catch (error) {
        console.warn("Error parsing date:", dateString, error);
        return null;
    }
}

// FIXED: Get current date/time formatted in GMT+7
function getFormattedDateTime() {
    const now = new Date(); // This is already in local timezone (GMT+7)
    const day = now.getDate().toString().padStart(2, "0");
    const month = (now.getMonth() + 1).toString().padStart(2, "0");
    const year = now.getFullYear();
    const hour = now.getHours().toString().padStart(2, "0");
    const minute = now.getMinutes().toString().padStart(2, "0");
    return `${day}/${month}/${year}, ${hour}:${minute}`;
}

// FIXED: Get current date in YYYY-MM-DD format for input[type="date"]
function getCurrentDateForInput() {
    const now = new Date(); // Local timezone (GMT+7)
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, "0");
    const day = now.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
}

// Generate unique ID
function generateUniqueID() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return `inv_${timestamp}_${random}`;
}

// Debounce function
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
        timestamp: new Date(), // Local timezone (GMT+7)
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

// Test function for date parsing
window.testDateParsing = function () {
    const testCases = [
        "28/09/2025, 15:53",
        "28/09/2025,15:53",
        "28/09/2025 15:53",
        "2025-09-28",
        "02/10/2025",
        "2/10/2025, 10:30",
    ];

    console.log("=== DATE PARSING TEST ===");
    testCases.forEach((dateStr) => {
        const parsed = parseVietnameseDate(dateStr);
        console.log(
            `"${dateStr}" →`,
            parsed ? parsed.toLocaleString("vi-VN") : "NULL",
        );
    });
};

// Export Utils globally
window.Utils = Utils;
window.getCurrentDateForInput = getCurrentDateForInput;
window.parseVietnameseDate = parseVietnameseDate;

console.log("✅ Utility functions loaded (FIXED DATE PARSING - GMT+7)");
console.log("Run testDateParsing() to verify date parsing works");
