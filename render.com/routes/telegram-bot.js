// =====================================================
// TELEGRAM BOT WITH GEMINI AI INTEGRATION
// Webhook endpoint for Telegram bot powered by Gemini 3 Flash
// Supports: Text chat, Invoice image processing, Group chats
// =====================================================

const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

// API Keys from environment variables (set on Render)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-3-flash-preview'; // Latest Gemini 3 Flash model

// =====================================================
// FIREBASE INITIALIZATION
// =====================================================

const FIREBASE_STORAGE_BUCKET = 'n2shop-69e37-ne0q1';
let db = null;
let bucket = null;

function getFirestoreDb() {
    if (db) return db;

    try {
        // Check if Firebase is already initialized
        if (admin.apps.length === 0) {
            const projectId = process.env.FIREBASE_PROJECT_ID;
            const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
            const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

            if (!projectId || !clientEmail || !privateKey) {
                console.log('[FIREBASE] Missing credentials, Firebase disabled');
                return null;
            }

            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId,
                    clientEmail,
                    privateKey
                }),
                storageBucket: FIREBASE_STORAGE_BUCKET
            });
            console.log('[FIREBASE] Initialized for project:', projectId);
        }

        db = admin.firestore();
        return db;
    } catch (error) {
        console.error('[FIREBASE] Init error:', error.message);
        return null;
    }
}

function getStorageBucket() {
    if (bucket) return bucket;

    // Ensure Firebase is initialized
    getFirestoreDb();

    try {
        // Explicitly specify bucket name
        bucket = admin.storage().bucket(FIREBASE_STORAGE_BUCKET);
        return bucket;
    } catch (error) {
        console.error('[FIREBASE] Storage init error:', error.message);
        return null;
    }
}

/**
 * Upload image to Firebase Storage
 * @param {Buffer} imageBuffer - Image data as buffer
 * @param {string} fileName - File name for storage
 * @param {string} mimeType - MIME type of the image
 * @returns {Promise<string>} Public URL of the uploaded image
 */
async function uploadImageToStorage(imageBuffer, fileName, mimeType = 'image/jpeg') {
    const storageBucket = getStorageBucket();
    if (!storageBucket) {
        throw new Error('Firebase Storage không khả dụng');
    }

    const filePath = `inventory-tracking/invoices/${fileName}`;
    const file = storageBucket.file(filePath);

    await file.save(imageBuffer, {
        metadata: {
            contentType: mimeType,
        },
        public: true
    });

    // Get public URL
    const publicUrl = `https://storage.googleapis.com/${FIREBASE_STORAGE_BUCKET}/${filePath}`;
    console.log('[FIREBASE] Image uploaded:', publicUrl);
    return publicUrl;
}

/**
 * Delete image from Firebase Storage
 * @param {string} imageUrl - Public URL of the image to delete
 */
async function deleteImageFromStorage(imageUrl) {
    const storageBucket = getStorageBucket();
    if (!storageBucket) {
        throw new Error('Firebase Storage không khả dụng');
    }

    // Extract file path from URL
    const baseUrl = `https://storage.googleapis.com/${FIREBASE_STORAGE_BUCKET}/`;
    if (!imageUrl.startsWith(baseUrl)) {
        console.log('[FIREBASE] Not a Firebase Storage URL, skipping delete');
        return false;
    }

    const filePath = imageUrl.replace(baseUrl, '');
    const file = storageBucket.file(filePath);

    try {
        await file.delete();
        console.log('[FIREBASE] Image deleted:', filePath);
        return true;
    } catch (error) {
        console.error('[FIREBASE] Delete error:', error.message);
        return false;
    }
}

/**
 * Generate unique shipment ID
 */
function generateShipmentId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = 'ship_';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Convert invoice data to inventory_tracking format
 */
function convertToInventoryFormat(invoiceData) {
    // Convert products to sanPham format
    const sanPham = (invoiceData.products || []).map(p => {
        const maSP = p.sku || '';
        const tenSP = p.name || '';
        const soMau = p.color || '';  // Color field expected by inventory-tracking
        const soLuong = p.quantity || 0;
        const giaDonVi = p.price || 0;  // Unit price field expected by inventory-tracking

        // Vietnamese translation for display
        const tenSP_vi = translateToVietnamese(tenSP);
        const soMau_vi = translateToVietnamese(soMau);

        // Build rawText for display (Chinese original)
        const rawText = `MA ${maSP} ${tenSP} MAU ${soMau} SL ${soLuong}`;
        // Vietnamese version
        const rawText_vi = `MA ${maSP} ${tenSP_vi} MAU ${soMau_vi} SL ${soLuong}`;

        return {
            maSP,
            tenSP,
            tenSP_vi,      // Vietnamese product name
            soMau,
            soMau_vi,      // Vietnamese color
            soLuong,
            giaDonVi,
            rawText,       // Chinese original
            rawText_vi     // Vietnamese translation
        };
    });

    // Convert date from DD/MM/YYYY to YYYY-MM-DD
    let ngayDiHang = '';
    if (invoiceData.date) {
        const parts = invoiceData.date.split('/');
        if (parts.length === 3) {
            ngayDiHang = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
    }

    return {
        sttNCC: invoiceData.ncc || '',
        tenNCC: invoiceData.supplier || '',
        sanPham: sanPham,
        tongTien: invoiceData.totalAmount || 0,
        tongMon: invoiceData.totalItems || 0,
        ngayDiHang: ngayDiHang,
        ghiChu: invoiceData.notes || '',
        source: 'telegram_bot'
    };
}

/**
 * Save invoice to inventory_tracking collection
 */
async function saveInvoiceToFirebase(invoiceData, chatId, userId) {
    const firestore = getFirestoreDb();
    if (!firestore) {
        throw new Error('Firebase không khả dụng');
    }

    const shipmentId = generateShipmentId();
    const inventoryData = convertToInventoryFormat(invoiceData);

    // Calculate tongMon from products
    const tongMon = inventoryData.sanPham.reduce((sum, p) => sum + (p.soLuong || 0), 0);

    // Build document matching inventory_tracking structure
    const docData = {
        id: shipmentId,
        ngayDiHang: inventoryData.ngayDiHang || new Date().toISOString().split('T')[0],
        hoaDon: [{
            sttNCC: inventoryData.sttNCC,
            tenNCC: inventoryData.tenNCC,
            sanPham: inventoryData.sanPham,
            tongTienHD: inventoryData.tongTien,  // Field name expected by table-renderer
            tongMon: tongMon,                     // Total items in this invoice
            ghiChu: inventoryData.ghiChu
        }],
        tongTienHoaDon: inventoryData.tongTien,
        tongMon: tongMon,
        soMonThieu: 0,
        chiPhiHangVe: [],
        tongChiPhi: 0,
        ghiChuAdmin: '',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: `telegram_${userId}`,
        updatedBy: `telegram_${userId}`,
        telegramChatId: chatId,
        source: 'telegram_bot'
    };

    // Save to inventory_tracking collection
    await firestore.collection('inventory_tracking').doc(shipmentId).set(docData);
    console.log('[FIREBASE] Inventory saved with ID:', shipmentId);
    return shipmentId;
}

/**
 * Find invoice by NCC code
 * Returns the shipment and invoice details
 */
async function findInvoiceByNCC(nccCode, chatId) {
    const firestore = getFirestoreDb();
    if (!firestore) {
        throw new Error('Firebase không khả dụng');
    }

    // Query for shipments from this chat
    // Note: Simple query without orderBy to avoid needing composite index
    const snapshot = await firestore
        .collection('inventory_tracking')
        .where('telegramChatId', '==', chatId)
        .limit(50)  // Get recent shipments
        .get();

    if (snapshot.empty) {
        throw new Error(`Không tìm thấy hóa đơn nào từ chat này`);
    }

    // Sort by createdAt in memory (descending - newest first)
    const shipments = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => {
            const timeA = a.createdAt?.toMillis?.() || 0;
            const timeB = b.createdAt?.toMillis?.() || 0;
            return timeB - timeA;  // Descending
        });

    // Find shipment with matching NCC in hoaDon array
    for (const data of shipments) {
        const hoaDonList = data.hoaDon || [];

        const invoiceIndex = hoaDonList.findIndex(hd =>
            String(hd.sttNCC) === String(nccCode)
        );

        if (invoiceIndex !== -1) {
            return {
                shipment: data,
                invoiceIndex: invoiceIndex,
                invoice: hoaDonList[invoiceIndex]
            };
        }
    }

    throw new Error(`Không tìm thấy hóa đơn với NCC = ${nccCode}`);
}

/**
 * Add image to invoice by NCC code
 * Downloads from Telegram, uploads to Firebase Storage, and saves URL
 */
async function addImageToInvoiceByNCC(nccCode, fileId, chatId) {
    // Find the invoice first
    const { shipment, invoiceIndex, invoice } = await findInvoiceByNCC(nccCode, chatId);

    // Download image from Telegram
    const { buffer, mimeType } = await downloadTelegramFile(fileId);

    // Generate unique filename
    const timestamp = Date.now();
    const extension = mimeType.split('/')[1] || 'jpg';
    const fileName = `ncc_${nccCode}_${timestamp}.${extension}`;

    // Upload to Firebase Storage
    const imageUrl = await uploadImageToStorage(buffer, fileName, mimeType);

    // Add image URL to the invoice's anhHoaDon array
    const hoaDon = shipment.hoaDon;
    if (!hoaDon[invoiceIndex].anhHoaDon) {
        hoaDon[invoiceIndex].anhHoaDon = [];
    }
    hoaDon[invoiceIndex].anhHoaDon.push(imageUrl);

    // Update the document
    const firestore = getFirestoreDb();
    await firestore.collection('inventory_tracking').doc(shipment.id).update({
        hoaDon: hoaDon,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`[FIREBASE] Added image to NCC ${nccCode} in shipment ${shipment.id}`);
    return {
        shipmentId: shipment.id,
        nccCode: nccCode,
        imageCount: hoaDon[invoiceIndex].anhHoaDon.length,
        imageUrl: imageUrl
    };
}

/**
 * Download file from Telegram as buffer
 */
async function downloadTelegramFile(fileId) {
    // Get file path from Telegram
    const fileInfoUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
    const fileInfoResponse = await fetch(fileInfoUrl);
    const fileInfo = await fileInfoResponse.json();

    if (!fileInfo.ok) {
        throw new Error('Không thể lấy thông tin file từ Telegram');
    }

    const filePath = fileInfo.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;

    // Download the file
    const response = await fetch(fileUrl);
    if (!response.ok) {
        throw new Error('Không thể tải file từ Telegram');
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Determine MIME type from file path
    const extension = filePath.split('.').pop().toLowerCase();
    const mimeTypes = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp'
    };
    const mimeType = mimeTypes[extension] || 'image/jpeg';

    return { buffer, mimeType };
}

/**
 * Format invoice details for Telegram message
 */
function formatInvoiceDetails(invoice, shipment) {
    const products = invoice.sanPham || [];
    const tongMon = products.reduce((sum, p) => sum + (p.soLuong || 0), 0);
    const tongTien = invoice.tongTienHD || invoice.tongTien || 0;
    const imageCount = invoice.anhHoaDon?.length || 0;

    let text = `📋 CHI TIẾT HÓA ĐƠN NCC ${invoice.sttNCC}\n`;
    text += `${'─'.repeat(30)}\n\n`;

    text += `📦 Shipment: ${shipment.id}\n`;
    text += `📅 Ngày: ${shipment.ngayDiHang || 'N/A'}\n`;
    if (invoice.tenNCC) {
        text += `🏪 NCC: ${invoice.tenNCC}\n`;
    }
    text += `\n`;

    text += `📝 DANH SÁCH SẢN PHẨM:\n`;
    text += `${'─'.repeat(30)}\n`;

    if (products.length === 0) {
        text += `(Không có sản phẩm)\n`;
    } else {
        products.forEach((p, idx) => {
            const name = p.tenSP_vi || translateToVietnamese(p.tenSP) || p.tenSP || '';
            const color = p.soMau_vi || translateToVietnamese(p.soMau) || p.soMau || '';
            text += `${idx + 1}. MA ${p.maSP || ''} ${name}`;
            if (color) text += ` - ${color}`;
            text += ` x${p.soLuong || 0}\n`;
        });
    }

    text += `\n${'─'.repeat(30)}\n`;
    text += `💰 Tiền HĐ: ${tongTien.toLocaleString()}\n`;
    text += `📊 Tổng món: ${tongMon}\n`;
    text += `🖼️ Ảnh: ${imageCount} ảnh\n`;

    if (invoice.ghiChu) {
        text += `📝 Ghi chú: ${invoice.ghiChu}\n`;
    }

    text += `\n💡 Gửi ảnh + caption "/${invoice.sttNCC}" để thêm ảnh`;

    return text;
}

// Bot username (will be fetched on first request)
let BOT_USERNAME = null;

// Store conversation history per chat (in-memory, resets on server restart)
const conversationHistory = new Map();
const MAX_HISTORY_LENGTH = 20; // Keep last 20 messages per chat

// Store pending invoice confirmations
const pendingInvoices = new Map();

// =====================================================
// CHINESE TO VIETNAMESE TRANSLATION
// =====================================================

const CHINESE_TO_VIETNAMESE = {
    // Colors - Màu sắc
    '黑': 'Đen',
    '白': 'Trắng',
    '红': 'Đỏ',
    '蓝': 'Xanh dương',
    '绿': 'Xanh lá',
    '黄': 'Vàng',
    '紫': 'Tím',
    '粉': 'Hồng',
    '灰': 'Xám',
    '棕': 'Nâu',
    '咖': 'Cà phê',
    '米': 'Kem',
    '杏': 'Mơ',
    '橙': 'Cam',
    '酱': 'Nâu đậm',
    '卡其': 'Kaki',
    '驼': 'Lạc đà',
    '藏青': 'Xanh đen',
    '酒红': 'Đỏ rượu',
    '墨绿': 'Xanh rêu',
    '浅': 'Nhạt',
    '深': 'Đậm',

    // Patterns - Họa tiết
    '条': 'Sọc',
    '纹': 'Vân',
    '格': 'Caro',
    '花': 'Hoa',
    '点': 'Chấm',
    '印': 'In',

    // Materials/Style - Chất liệu/Kiểu
    '棉': 'Cotton',
    '麻': 'Lanh',
    '丝': 'Lụa',
    '绒': 'Nhung',
    '毛': 'Len',
    '皮': 'Da',

    // Common terms
    '色': '',
    '款': 'Kiểu',
    '上衣': 'Áo',
    '裤': 'Quần',
    '裙': 'Váy',
    '外套': 'Áo khoác',
    '衬衫': 'Sơ mi',
    '领': 'Cổ',
    '交叉': 'Chéo',
    '斜角': 'Xéo góc',
    '苏': 'Tô'
};

/**
 * Translate Chinese text to Vietnamese
 */
function translateToVietnamese(text) {
    if (!text) return text;

    let result = text;

    // Sort by length (longer first) to avoid partial replacements
    const sortedKeys = Object.keys(CHINESE_TO_VIETNAMESE).sort((a, b) => b.length - a.length);

    for (const chinese of sortedKeys) {
        const vietnamese = CHINESE_TO_VIETNAMESE[chinese];
        result = result.split(chinese).join(vietnamese);
    }

    return result.trim();
}

// =====================================================
// INVOICE EXTRACTION PROMPT
// =====================================================

const INVOICE_EXTRACTION_PROMPT = `Bạn là chuyên gia phân tích hóa đơn nhập hàng từ Trung Quốc. Hãy phân tích ảnh hóa đơn và trích xuất thông tin CHÍNH XÁC theo format JSON.

=== CẤU TRÚC BẢNG INVENTORY TRACKING ===
Dữ liệu sẽ hiển thị trên bảng với các cột:
| NCC | STT | CHI TIẾT SẢN PHẨM | TIỀN HĐ | TỔNG MÓN | THIẾU | ẢNH | GHI CHÚ |

=== HƯỚNG DẪN ĐỌC HÓA ĐƠN ===

1. MÃ NCC (ncc) - RẤT QUAN TRỌNG:
   - Tìm SỐ ĐƯỢC KHOANH TRÒN bằng bút trên hóa đơn
   - Thường viết tay, nằm ở góc hoặc đầu hóa đơn
   - Đây là mã nhà cung cấp (VD: "15", "23", "8")

2. TÊN NHÀ CUNG CẤP (supplier):
   - Tên cửa hàng/shop in trên hóa đơn
   - Thường ở header hóa đơn (VD: "广州XXX服装店")

3. NGÀY (date):
   - Ngày trên hóa đơn, format DD/MM/YYYY
   - Nếu không có, để trống ""

4. DANH SÁCH SẢN PHẨM (products) - ĐỌC KỸ TỪNG DÒNG:
   - sku: Mã sản phẩm (số ở đầu dòng, VD: "7977", "7975", "7862")
   - name: Tên sản phẩm tiếng Trung (VD: "苏条纹斜角上衣", "交叉领上衣")
   - color: Màu sắc (VD: "黑条", "咖条", "灰色", "12X黑" - giữ nguyên tiếng Trung)
   - quantity: Số lượng (cột 数量, ĐẾM CHÍNH XÁC từng dòng)
   - price: Đơn giá mỗi sản phẩm (cột 单价 hoặc 金额/数量)

5. TỔNG TIỀN HÓA ĐƠN (totalAmount):
   - Tìm dòng "合计", "总计", "Total" ở cuối hóa đơn
   - Đây là TIỀN HĐ hiển thị trên bảng
   - Nếu không có, tính = SUM(quantity * price)

6. TỔNG SỐ MÓN (totalItems):
   - Tổng số lượng tất cả sản phẩm = SUM(quantity của từng dòng)
   - VD: 12+8+12+8+10+6+4+5+5 = 70 món

=== FORMAT JSON OUTPUT ===
Trả về CHÍNH XÁC (không markdown, không \`\`\`):
{
  "success": true,
  "ncc": "15",
  "supplier": "Tên shop tiếng Trung",
  "date": "26/12/2025",
  "products": [
    {"sku": "7977", "name": "苏条纹斜角上衣", "color": "黑条", "quantity": 12, "price": 45},
    {"sku": "7977", "name": "苏条纹斜角上衣", "color": "咖条", "quantity": 8, "price": 45},
    {"sku": "7975", "name": "交叉领上衣", "color": "黑", "quantity": 12, "price": 42}
  ],
  "totalItems": 70,
  "totalAmount": 2250.00,
  "notes": "Ghi chú nếu có"
}

=== LƯU Ý QUAN TRỌNG ===
- KHÔNG bỏ sót dòng sản phẩm nào
- Mỗi màu khác nhau là 1 dòng riêng (cùng SKU, khác màu = 2 dòng)
- quantity phải là SỐ NGUYÊN (không phải chuỗi)
- price là đơn giá 1 sản phẩm (số thập phân OK)
- totalAmount và totalItems phải KHỚP với tổng thực tế
- Nếu không đọc rõ giá trị nào, ghi "unclear" cho trường đó

=== NẾU KHÔNG XỬ LÝ ĐƯỢC ===
{
  "success": false,
  "error": "Lý do cụ thể (ảnh mờ, không phải hóa đơn, etc.)"
}`;

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Get bot info (username)
 */
async function getBotUsername() {
    if (BOT_USERNAME) return BOT_USERNAME;

    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.ok) {
            BOT_USERNAME = data.result.username;
            console.log('[TELEGRAM] Bot username:', BOT_USERNAME);
        }
    } catch (error) {
        console.error('[TELEGRAM] Failed to get bot info:', error.message);
    }
    return BOT_USERNAME;
}

/**
 * Send message to Telegram chat
 */
async function sendTelegramMessage(chatId, text, replyToMessageId = null, replyMarkup = null) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    try {
        const body = {
            chat_id: chatId,
            text: text
        };

        if (replyToMessageId) {
            body.reply_to_message_id = replyToMessageId;
        }

        if (replyMarkup) {
            body.reply_markup = replyMarkup;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        if (!data.ok) {
            console.error('[TELEGRAM] Send error:', data.description);
        }
        return data;
    } catch (error) {
        console.error('[TELEGRAM] Send error:', error.message);
        return null;
    }
}

/**
 * Answer callback query (for inline buttons)
 */
async function answerCallbackQuery(callbackQueryId, text = '') {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callback_query_id: callbackQueryId,
                text: text
            })
        });
    } catch (error) {
        console.error('[TELEGRAM] answerCallbackQuery error:', error.message);
    }
}

/**
 * Edit message text
 */
async function editMessageText(chatId, messageId, text, replyMarkup = null) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`;
    try {
        const body = {
            chat_id: chatId,
            message_id: messageId,
            text: text
        };
        if (replyMarkup) {
            body.reply_markup = replyMarkup;
        }
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return await response.json();
    } catch (error) {
        console.error('[TELEGRAM] editMessageText error:', error.message);
        return null;
    }
}

/**
 * Send "typing" or "upload_photo" action
 */
async function sendChatAction(chatId, action = 'typing') {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendChatAction`;

    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                action: action
            })
        });
    } catch (error) {
        // Ignore action errors
    }
}

/**
 * Get file from Telegram and return as base64
 */
async function getTelegramFileAsBase64(fileId) {
    // Get file path
    const fileInfoUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
    const fileInfoResponse = await fetch(fileInfoUrl);
    const fileInfo = await fileInfoResponse.json();

    if (!fileInfo.ok) {
        throw new Error('Could not get file info from Telegram');
    }

    // Download file
    const filePath = fileInfo.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
    const fileResponse = await fetch(fileUrl);
    const arrayBuffer = await fileResponse.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    // Determine mime type
    const extension = filePath.split('.').pop().toLowerCase();
    const mimeTypes = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp'
    };
    const mimeType = mimeTypes[extension] || 'image/jpeg';

    return { base64, mimeType };
}

/**
 * Call Gemini Vision API with image
 */
async function analyzeInvoiceImage(base64Image, mimeType) {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: INVOICE_EXTRACTION_PROMPT },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: base64Image
                        }
                    }
                ]
            }],
            generationConfig: {
                temperature: 0.1,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 4096
            }
        })
    });

    const data = await response.json();

    if (data.error) {
        throw new Error(data.error.message);
    }

    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
        throw new Error('Empty response from Gemini');
    }

    // Parse JSON response
    try {
        // Clean response (remove markdown code blocks if present)
        let cleanJson = responseText.trim();
        if (cleanJson.startsWith('```')) {
            cleanJson = cleanJson.replace(/```json?\n?/g, '').replace(/```/g, '');
        }
        return JSON.parse(cleanJson);
    } catch (parseError) {
        console.error('[TELEGRAM] JSON parse error:', parseError.message);
        console.error('[TELEGRAM] Raw response:', responseText);
        return {
            success: false,
            error: 'Không thể parse kết quả từ AI',
            rawResponse: responseText
        };
    }
}

/**
 * Call Gemini API with conversation history (for text chat)
 */
async function callGeminiAI(historyKey, userMessage, userName = null) {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    if (!conversationHistory.has(historyKey)) {
        conversationHistory.set(historyKey, []);
    }
    const history = conversationHistory.get(historyKey);

    const messageText = userName ? `[${userName}]: ${userMessage}` : userMessage;

    history.push({
        role: 'user',
        parts: [{ text: messageText }]
    });

    while (history.length > MAX_HISTORY_LENGTH) {
        history.shift();
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: history,
            generationConfig: {
                temperature: 0.7,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 2048
            }
        })
    });

    const data = await response.json();

    if (data.error) {
        throw new Error(data.error.message);
    }

    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiResponse) {
        throw new Error('Empty response from Gemini');
    }

    history.push({
        role: 'model',
        parts: [{ text: aiResponse }]
    });

    return aiResponse;
}

/**
 * Clear conversation history for a chat
 */
function clearHistory(historyKey) {
    conversationHistory.delete(historyKey);
}

/**
 * Check if bot should respond in group
 */
function shouldRespondInGroup(message, botUsername) {
    const text = message.text || message.caption || '';

    // Always respond to commands
    if (text.startsWith('/')) {
        return true;
    }

    // Always respond to photos (invoice processing)
    if (message.photo) {
        return true;
    }

    // Check Telegram entities for mention
    const entities = message.entities || message.caption_entities || [];
    if (entities.length > 0 && botUsername) {
        for (const entity of entities) {
            if (entity.type === 'mention') {
                const mentionText = text.substring(entity.offset, entity.offset + entity.length);
                if (mentionText.toLowerCase() === `@${botUsername.toLowerCase()}`) {
                    console.log('[TELEGRAM] Bot mentioned via entity:', mentionText);
                    return true;
                }
            }
        }
    }

    // Fallback: check if bot username appears in text
    if (botUsername && text.toLowerCase().includes(`@${botUsername.toLowerCase()}`)) {
        console.log('[TELEGRAM] Bot mentioned in text');
        return true;
    }

    // Respond if message is a reply to bot's message
    if (message.reply_to_message && message.reply_to_message.from?.is_bot) {
        console.log('[TELEGRAM] Reply to bot message');
        return true;
    }

    return false;
}

/**
 * Remove bot mention from text
 */
function removeBotMention(text, botUsername) {
    if (!botUsername) return text;
    const regex = new RegExp(`@${botUsername}\\s*`, 'gi');
    return text.replace(regex, '').trim();
}

/**
 * Format invoice preview with language mode
 * @param {object} invoiceData - Invoice data from AI
 * @param {string} langMode - 'vi' for Vietnamese (default) or 'cn' for Chinese original
 */
function formatInvoicePreview(invoiceData, langMode = 'vi') {
    if (!invoiceData.success) {
        return `❌ Không thể xử lý hóa đơn:\n${invoiceData.error}`;
    }

    const isVietnamese = langMode === 'vi';
    const langLabel = isVietnamese ? '🇻🇳 Việt hóa' : '🇨🇳 Tiếng Trung';

    let text = `📋 KẾT QUẢ PHÂN TÍCH HÓA ĐƠN [${langLabel}]\n`;
    text += `${'─'.repeat(30)}\n`;

    // Mã NCC (số khoanh tròn) - hiển thị đầu tiên và nổi bật
    if (invoiceData.ncc) {
        text += `🔢 MÃ NCC: ${invoiceData.ncc}\n`;
    }
    if (invoiceData.supplier) {
        const supplier = isVietnamese ? translateToVietnamese(invoiceData.supplier) : invoiceData.supplier;
        text += `🏪 Tên NCC: ${supplier}\n`;
    }
    if (invoiceData.date) {
        text += `📅 Ngày: ${invoiceData.date}\n`;
    }

    text += `\n📦 DANH SÁCH SẢN PHẨM:\n`;

    if (invoiceData.products && invoiceData.products.length > 0) {
        invoiceData.products.forEach((p, i) => {
            const name = isVietnamese ? translateToVietnamese(p.name) : p.name;
            const color = p.color
                ? ` (${isVietnamese ? translateToVietnamese(p.color) : p.color})`
                : '';
            text += `${i + 1}. ${p.sku || '?'} - ${name || 'N/A'}${color}: ${p.quantity} cái\n`;
        });
    } else {
        text += `(Không có sản phẩm)\n`;
    }

    text += `\n📊 Tổng: ${invoiceData.totalItems || 0} sản phẩm`;

    if (invoiceData.totalAmount) {
        text += `\n💰 Thành tiền: ¥${invoiceData.totalAmount.toLocaleString()}`;
    }

    if (invoiceData.notes) {
        const notes = isVietnamese ? translateToVietnamese(invoiceData.notes) : invoiceData.notes;
        text += `\n📝 Ghi chú: ${notes}`;
    }

    return text;
}

/**
 * Build inline keyboard for invoice preview
 */
function buildInvoiceKeyboard(invoiceId, langMode = 'vi') {
    const toggleButton = langMode === 'vi'
        ? { text: '🇨🇳 Xem tiếng Trung', callback_data: `lang_cn_${invoiceId}` }
        : { text: '🇻🇳 Xem Việt hóa', callback_data: `lang_vi_${invoiceId}` };

    return {
        inline_keyboard: [
            [toggleButton],
            [
                { text: '✅ Xác nhận lưu', callback_data: `confirm_invoice_${invoiceId}` },
                { text: '❌ Hủy', callback_data: `cancel_invoice_${invoiceId}` }
            ]
        ]
    };
}

// =====================================================
// ROUTES
// =====================================================

// Health check
router.get('/', (req, res) => {
    const firestore = getFirestoreDb();
    res.json({
        status: 'ok',
        service: 'Telegram Bot with Gemini AI',
        model: GEMINI_MODEL,
        hasBotToken: !!TELEGRAM_BOT_TOKEN,
        hasGeminiKey: !!GEMINI_API_KEY,
        hasFirebase: !!firestore,
        botUsername: BOT_USERNAME,
        activeConversations: conversationHistory.size,
        pendingInvoices: pendingInvoices.size,
        features: ['text_chat', 'invoice_processing', 'group_chat', 'mention_trigger', 'firebase_storage']
    });
});

// Telegram Webhook endpoint
router.post('/webhook', async (req, res) => {
    try {
        // Respond immediately to Telegram
        res.sendStatus(200);

        const update = req.body;

        // Handle callback queries (button clicks)
        if (update.callback_query) {
            const callbackQuery = update.callback_query;
            const chatId = callbackQuery.message.chat.id;
            const messageId = callbackQuery.message.message_id;
            const data = callbackQuery.data;

            await answerCallbackQuery(callbackQuery.id);

            // Handle language toggle
            if (data.startsWith('lang_vi_') || data.startsWith('lang_cn_')) {
                const langMode = data.startsWith('lang_vi_') ? 'vi' : 'cn';
                const invoiceId = data.replace(/^lang_(vi|cn)_/, '');
                const invoiceData = pendingInvoices.get(invoiceId);

                if (invoiceData) {
                    const previewText = formatInvoicePreview(invoiceData, langMode);
                    const keyboard = buildInvoiceKeyboard(invoiceId, langMode);
                    await editMessageText(chatId, messageId, previewText, keyboard);
                } else {
                    await editMessageText(chatId, messageId,
                        `⚠️ Hóa đơn đã hết hạn. Vui lòng gửi lại ảnh.`
                    );
                }
            }
            // Handle confirm invoice
            else if (data.startsWith('confirm_invoice_')) {
                const invoiceId = data.replace('confirm_invoice_', '');
                const invoiceData = pendingInvoices.get(invoiceId);

                if (invoiceData) {
                    try {
                        // Save to Firebase
                        const userId = callbackQuery.from.id;
                        const docId = await saveInvoiceToFirebase(invoiceData, chatId, userId);
                        pendingInvoices.delete(invoiceId);

                        await editMessageText(chatId, messageId,
                            `✅ ĐÃ LƯU THÀNH CÔNG!\n\n` +
                            `📋 Mã hóa đơn: ${docId}\n` +
                            `🔢 Mã NCC: ${invoiceData.ncc || 'N/A'}\n` +
                            `🏪 Tên NCC: ${translateToVietnamese(invoiceData.supplier) || 'N/A'}\n` +
                            `📦 Tổng: ${invoiceData.totalItems || 0} sản phẩm`
                        );
                    } catch (error) {
                        console.error('[TELEGRAM] Firebase save error:', error.message);
                        await editMessageText(chatId, messageId,
                            `❌ Lỗi lưu hóa đơn:\n${error.message}\n\nVui lòng thử lại.`
                        );
                    }
                } else {
                    await editMessageText(chatId, messageId,
                        `⚠️ Hóa đơn đã hết hạn. Vui lòng gửi lại ảnh.`
                    );
                }
            }
            // Handle cancel invoice
            else if (data.startsWith('cancel_invoice_')) {
                const invoiceId = data.replace('cancel_invoice_', '');
                pendingInvoices.delete(invoiceId);

                await editMessageText(chatId, messageId,
                    `❌ Đã hủy. Bạn có thể gửi lại ảnh hóa đơn khác.`
                );
            }
            return;
        }

        // Handle message updates
        if (update.message) {
            const message = update.message;
            const chatId = message.chat.id;
            const chatType = message.chat.type;
            const userId = message.from.id;
            const text = message.text || message.caption || '';
            const firstName = message.from.first_name || 'User';
            const messageId = message.message_id;

            const isGroup = chatType === 'group' || chatType === 'supergroup';
            const chatName = isGroup ? message.chat.title : firstName;

            await getBotUsername();

            console.log(`[TELEGRAM] ${isGroup ? 'Group' : 'Private'} message from ${firstName} in ${chatName}`);

            // In groups, check if should respond
            if (isGroup && !shouldRespondInGroup(message, BOT_USERNAME)) {
                console.log('[TELEGRAM] Skipping - not triggered in group');
                return;
            }

            const historyKey = isGroup ? `group_${chatId}` : `user_${userId}`;

            // ==========================================
            // HANDLE PHOTO MESSAGES
            // ==========================================
            if (message.photo) {
                const caption = message.caption || '';
                const nccMatch = caption.match(/^\/(\d+)$/);

                // ==========================================
                // CASE 1: Photo with /NCC command - Add image to existing invoice
                // Example: /15 with photo attached
                // ==========================================
                if (nccMatch) {
                    const nccCode = nccMatch[1];
                    console.log(`[TELEGRAM] Photo with NCC command: /${nccCode}`);

                    await sendChatAction(chatId, 'upload_photo');
                    await sendTelegramMessage(chatId, '📤 Đang upload ảnh lên Firebase Storage...', messageId);

                    try {
                        // Get the largest photo
                        const photo = message.photo[message.photo.length - 1];

                        // Add image to the invoice with matching NCC (uploads to Firebase Storage)
                        const result = await addImageToInvoiceByNCC(nccCode, photo.file_id, chatId);

                        await sendTelegramMessage(chatId,
                            `✅ Đã thêm ảnh vào hóa đơn NCC ${nccCode}\n\n` +
                            `📦 Shipment: ${result.shipmentId}\n` +
                            `🖼️ Tổng ảnh: ${result.imageCount}\n` +
                            `☁️ Đã lưu lên Firebase Storage\n\n` +
                            `Xem tại: https://nhijudyshop.github.io/n2store/inventory-tracking/`,
                            messageId
                        );
                    } catch (error) {
                        console.error('[TELEGRAM] Add image error:', error.message);
                        await sendTelegramMessage(chatId,
                            `❌ Lỗi thêm ảnh:\n${error.message}\n\n` +
                            `💡 Đảm bảo đã có hóa đơn với NCC = ${nccCode} trong hệ thống.`,
                            messageId
                        );
                    }
                    return;
                }

                // ==========================================
                // CASE 2: Photo without command - Process as invoice
                // ==========================================
                console.log('[TELEGRAM] Photo received - processing invoice');

                await sendChatAction(chatId, 'typing');
                await sendTelegramMessage(chatId, '🔍 Đang phân tích hóa đơn...', messageId);

                try {
                    // Get the largest photo
                    const photo = message.photo[message.photo.length - 1];
                    const { base64, mimeType } = await getTelegramFileAsBase64(photo.file_id);

                    // Analyze with Gemini Vision
                    const invoiceData = await analyzeInvoiceImage(base64, mimeType);

                    // Format and send preview (default: Vietnamese mode)
                    const previewText = formatInvoicePreview(invoiceData, 'vi');

                    if (invoiceData.success) {
                        // Generate unique invoice ID
                        const invoiceId = `${chatId}_${Date.now()}`;
                        pendingInvoices.set(invoiceId, invoiceData);

                        // Auto-expire after 10 minutes
                        setTimeout(() => pendingInvoices.delete(invoiceId), 10 * 60 * 1000);

                        // Send with language toggle and confirmation buttons (default: Vietnamese)
                        const keyboard = buildInvoiceKeyboard(invoiceId, 'vi');
                        await sendTelegramMessage(chatId, previewText, messageId, keyboard);
                    } else {
                        await sendTelegramMessage(chatId, previewText, messageId);
                    }

                } catch (error) {
                    console.error('[TELEGRAM] Invoice processing error:', error.message);
                    await sendTelegramMessage(chatId,
                        `❌ Lỗi xử lý hóa đơn:\n${error.message}`,
                        messageId
                    );
                }
                return;
            }

            // ==========================================
            // HANDLE TEXT MESSAGES
            // ==========================================

            const commandText = text?.split('@')[0];

            // /start command
            if (commandText === '/start') {
                clearHistory(historyKey);
                const groupNote = isGroup
                    ? `\n\nTrong nhóm:\n- Tag @${BOT_USERNAME} để hỏi\n- Hoặc reply tin nhắn của bot`
                    : '';

                await sendTelegramMessage(chatId,
                    `Xin chào ${firstName}! 👋\n\n` +
                    `Tôi là Gemini AI Assistant.\n\n` +
                    `📸 Gửi ẢNH HÓA ĐƠN để tôi phân tích\n` +
                    `💬 Hoặc nhắn tin để trò chuyện với AI\n\n` +
                    `Các lệnh:\n` +
                    `/start - Bắt đầu lại\n` +
                    `/clear - Xóa lịch sử chat\n` +
                    `/help - Hướng dẫn` +
                    groupNote,
                    messageId
                );
                return;
            }

            // /clear command
            if (commandText === '/clear') {
                clearHistory(historyKey);
                await sendTelegramMessage(chatId,
                    'Đã xóa lịch sử trò chuyện!',
                    messageId
                );
                return;
            }

            // /help command
            if (commandText === '/help') {
                const groupHelp = isGroup
                    ? `\n\nCách dùng trong nhóm:\n- Tag @${BOT_USERNAME} + câu hỏi\n- Hoặc reply tin nhắn của bot`
                    : '';

                await sendTelegramMessage(chatId,
                    `📖 HƯỚNG DẪN SỬ DỤNG\n` +
                    `${'─'.repeat(25)}\n\n` +
                    `📸 XỬ LÝ HÓA ĐƠN:\n` +
                    `- Gửi ảnh hóa đơn viết tay\n` +
                    `- Bot sẽ phân tích và trích xuất dữ liệu\n` +
                    `- Xác nhận để lưu vào hệ thống\n\n` +
                    `📋 XEM CHI TIẾT HÓA ĐƠN:\n` +
                    `- Gửi /NCC (VD: /15)\n` +
                    `- Hiển thị chi tiết hóa đơn của NCC đó\n\n` +
                    `🖼️ THÊM ẢNH VÀO HÓA ĐƠN:\n` +
                    `- Gửi ảnh với caption /NCC\n` +
                    `- VD: Gửi ảnh + caption "/15"\n` +
                    `- Ảnh sẽ upload lên Firebase Storage\n\n` +
                    `💬 TRÒ CHUYỆN AI:\n` +
                    `- Gửi tin nhắn bất kỳ\n` +
                    `- Bot sẽ trả lời bằng Gemini AI\n\n` +
                    `Model: ${GEMINI_MODEL}` +
                    groupHelp,
                    messageId
                );
                return;
            }

            // /NCC command (e.g., /15) - Show invoice details
            const nccTextMatch = commandText?.match(/^\/(\d+)$/);
            if (nccTextMatch) {
                const nccCode = nccTextMatch[1];
                console.log(`[TELEGRAM] NCC command: /${nccCode}`);

                await sendChatAction(chatId, 'typing');

                try {
                    const { shipment, invoice } = await findInvoiceByNCC(nccCode, chatId);
                    const detailsText = formatInvoiceDetails(invoice, shipment);

                    await sendTelegramMessage(chatId, detailsText, messageId);
                } catch (error) {
                    console.error('[TELEGRAM] NCC lookup error:', error.message);
                    await sendTelegramMessage(chatId,
                        `❌ ${error.message}\n\n` +
                        `💡 Gửi ảnh hóa đơn để tạo mới, hoặc kiểm tra lại mã NCC.`,
                        messageId
                    );
                }
                return;
            }

            // Regular text message - chat with AI
            if (!text) {
                await sendTelegramMessage(chatId,
                    'Gửi tin nhắn văn bản hoặc ảnh hóa đơn để tôi xử lý.',
                    messageId
                );
                return;
            }

            if (!TELEGRAM_BOT_TOKEN || !GEMINI_API_KEY) {
                await sendTelegramMessage(chatId,
                    'Bot chưa được cấu hình đầy đủ.',
                    messageId
                );
                return;
            }

            const cleanText = removeBotMention(text, BOT_USERNAME);

            if (!cleanText) {
                await sendTelegramMessage(chatId, 'Bạn muốn hỏi gì?', messageId);
                return;
            }

            await sendChatAction(chatId, 'typing');

            try {
                const aiResponse = await callGeminiAI(
                    historyKey,
                    cleanText,
                    isGroup ? firstName : null
                );

                if (aiResponse.length > 4000) {
                    const chunks = aiResponse.match(/[\s\S]{1,4000}/g) || [];
                    for (let i = 0; i < chunks.length; i++) {
                        await sendTelegramMessage(
                            chatId,
                            chunks[i],
                            i === 0 ? messageId : null
                        );
                    }
                } else {
                    await sendTelegramMessage(chatId, aiResponse, messageId);
                }

            } catch (error) {
                console.error('[TELEGRAM] Gemini error:', error.message);
                await sendTelegramMessage(chatId,
                    `Có lỗi xảy ra:\n${error.message}`,
                    messageId
                );
            }
        }

    } catch (error) {
        console.error('[TELEGRAM] Webhook error:', error.message);
    }
});

// Manual send endpoint
router.post('/send', async (req, res) => {
    try {
        const { chatId, text } = req.body;

        if (!chatId || !text) {
            return res.status(400).json({ error: 'Missing chatId or text' });
        }

        if (!TELEGRAM_BOT_TOKEN) {
            return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not configured' });
        }

        const result = await sendTelegramMessage(chatId, text);
        res.json(result);

    } catch (error) {
        console.error('[TELEGRAM] Send error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Set webhook URL
router.post('/setWebhook', async (req, res) => {
    try {
        const { webhookUrl } = req.body;

        if (!webhookUrl) {
            return res.status(400).json({ error: 'Missing webhookUrl' });
        }

        if (!TELEGRAM_BOT_TOKEN) {
            return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not configured' });
        }

        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: webhookUrl,
                allowed_updates: ['message', 'callback_query']
            })
        });

        const data = await response.json();
        console.log('[TELEGRAM] Webhook set:', data);
        res.json(data);

    } catch (error) {
        console.error('[TELEGRAM] setWebhook error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Get webhook info
router.get('/webhookInfo', async (req, res) => {
    try {
        if (!TELEGRAM_BOT_TOKEN) {
            return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not configured' });
        }

        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`;
        const response = await fetch(url);
        const data = await response.json();

        res.json(data);

    } catch (error) {
        console.error('[TELEGRAM] webhookInfo error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Delete webhook
router.post('/deleteWebhook', async (req, res) => {
    try {
        if (!TELEGRAM_BOT_TOKEN) {
            return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not configured' });
        }

        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook`;
        const response = await fetch(url);
        const data = await response.json();

        console.log('[TELEGRAM] Webhook deleted:', data);
        res.json(data);

    } catch (error) {
        console.error('[TELEGRAM] deleteWebhook error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
